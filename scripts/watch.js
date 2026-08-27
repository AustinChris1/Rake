// RAKE Telegram watch (pnpm watch): /watch /unwatch /list /check. Re-rakes watched
// pools each interval; alerts on threshold/drain crossings, re-arms when the pool calms.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { runRake } from '../src/report.js';

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
if (!TOKEN) {
  console.error('TELEGRAM_BOT_TOKEN is not set. Create a bot with @BotFather and put the token in .env');
  process.exit(1);
}
const API = `https://api.telegram.org/bot${TOKEN}`;
const PUBLIC_URL = (process.env.RAKE_PUBLIC_URL || 'http://localhost:3000').replace(/\/$/, '');
const INTERVAL_MIN = Math.max(15, Number(process.env.RAKE_WATCH_INTERVAL_MIN || 60));
const DRAIN_ALERT = 3;
const MAX_WATCHES_PER_CHAT = 5;
const WALK_CAP = 15; // per check - keeps N watches × 24h inside Alchemy's free tier

const STATE_FILE = 'watch/watches.json';
mkdirSync('watch', { recursive: true });
const state = existsSync(STATE_FILE) ? JSON.parse(readFileSync(STATE_FILE, 'utf8')) : { watches: [] };
const save = () => writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));

const isAddr = (s) => /^0x[0-9a-fA-F]{40}$/.test(s ?? '');
const pct = (n) => (n == null ? 'n/a' : n.toFixed(1) + '%');
const usd = (n) => '$' + Math.round(n).toLocaleString('en-US');

async function tg(method, payload) {
  const r = await fetch(`${API}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return r.json();
}
const send = (chatId, text) =>
  tg('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true });

const receiptLink = (token) => `${PUBLIC_URL}/?token=${token}&hours=1`;

function summarize(report) {
  const { tape, rake } = report;
  const drain = rake.usdIn > 0 ? rake.usdOut / rake.usdIn : 0;
  return {
    symbol: tape.tokenSymbol ?? 'token',
    rakePct: rake.rakePct,
    usdIn: rake.usdIn,
    houseUsd: rake.houseUsd,
    drain,
    status: report.status,
  };
}

async function checkOnce(token) {
  const report = await runRake(token, { hours: 1, llm: false, fundingCap: WALK_CAP, onProgress: () => {} });
  if (report.status === 'UNPRICEABLE' || !report.rake) return { status: report.status ?? 'UNPRICEABLE' };
  return summarize(report);
}

// ── commands ────────────────────────────────────────────────────────────────
async function handleCommand(chatId, text) {
  const [cmd, arg1, arg2] = text.trim().split(/\s+/);
  const token = arg1?.toLowerCase();

  if (cmd === '/start' || cmd === '/help') {
    return send(
      chatId,
      `<b>RAKE watch</b> - every candle has a house; this bot tells you when it starts collecting.\n\n` +
        `/watch 0xTOKEN [rake%] - alert when the 1h rake crosses the threshold (default 50%) or the window is a ≥${DRAIN_ALERT}x drain\n` +
        `/unwatch 0xTOKEN\n/list\n/check 0xTOKEN - rake it right now\n\n` +
        `Checks run every ${INTERVAL_MIN} min. Receipts: ${PUBLIC_URL}`,
    );
  }

  if (cmd === '/watch') {
    if (!isAddr(token)) return send(chatId, 'Usage: /watch 0xTOKEN [rake% threshold]');
    const mine = state.watches.filter((w) => w.chatId === chatId);
    if (mine.length >= MAX_WATCHES_PER_CHAT && !mine.some((w) => w.token === token)) {
      return send(chatId, `Watch limit is ${MAX_WATCHES_PER_CHAT} per chat - /unwatch one first.`);
    }
    const threshold = Math.min(500, Math.max(5, Number(arg2) || 50));
    state.watches = state.watches.filter((w) => !(w.chatId === chatId && w.token === token));
    state.watches.push({ chatId, token, threshold, armed: true, addedAt: new Date().toISOString() });
    save();
    return send(chatId, `Watching <code>${token}</code> - alert at rake ≥ ${threshold}% or a ≥${DRAIN_ALERT}x drain (1h windows, every ${INTERVAL_MIN} min).`);
  }

  if (cmd === '/unwatch') {
    const before = state.watches.length;
    state.watches = state.watches.filter((w) => !(w.chatId === chatId && w.token === token));
    save();
    return send(chatId, before === state.watches.length ? 'Nothing matched.' : `Stopped watching <code>${token}</code>.`);
  }

  if (cmd === '/list') {
    const mine = state.watches.filter((w) => w.chatId === chatId);
    if (!mine.length) return send(chatId, 'No watches. Add one with /watch 0xTOKEN');
    return send(chatId, mine.map((w) => `• <code>${w.token}</code> ≥ ${w.threshold}% ${w.armed ? '(armed)' : '(fired - re-arms below threshold)'}`).join('\n'));
  }

  if (cmd === '/check') {
    if (!isAddr(token)) return send(chatId, 'Usage: /check 0xTOKEN');
    await send(chatId, 'Pulling the tape…');
    try {
      const s = await checkOnce(token);
      if (!s.rakePct && s.status !== 'OK' && s.status !== 'TOO_THIN') return send(chatId, `${s.status} - no receipt.`);
      return send(
        chatId,
        `<b>${s.symbol}</b> (1h): rake <b>${pct(s.rakePct)}</b> of ${usd(s.usdIn)} in - ${usd(s.houseUsd)} to the house. ` +
          `Drain ${s.drain.toFixed(1)}x.${s.status === 'TOO_THIN' ? ' (TOO THIN)' : ''}\n${receiptLink(token)}`,
      );
    } catch (err) {
      return send(chatId, `Check failed: ${err.message}`);
    }
  }
}

// ── the guard loop ──────────────────────────────────────────────────────────
async function patrol() {
  const tokens = [...new Set(state.watches.map((w) => w.token))];
  for (const token of tokens) {
    let s;
    try {
      s = await checkOnce(token);
    } catch (err) {
      console.error(`patrol ${token}: ${err.message}`);
      continue;
    }
    if (s.rakePct == null) continue;
    for (const w of state.watches.filter((w) => w.token === token)) {
      const breach = s.rakePct >= w.threshold || s.drain >= DRAIN_ALERT;
      if (breach && w.armed && s.status === 'OK') {
        w.armed = false;
        await send(
          w.chatId,
          `🚨 <b>${s.symbol}</b> - the house is collecting.\n` +
            `Last hour: rake <b>${pct(s.rakePct)}</b> of ${usd(s.usdIn)} in, ${usd(s.houseUsd)} out through house cohorts. Drain ${s.drain.toFixed(1)}x.\n` +
            `Receipt: ${receiptLink(token)}`,
        );
      } else if (!breach && !w.armed && s.rakePct < w.threshold * 0.8 && s.drain < DRAIN_ALERT) {
        w.armed = true; // calm again - re-arm
      }
    }
    save();
  }
}

// ── long-polling ────────────────────────────────────────────────────────────
let offset = 0;
async function poll() {
  try {
    const res = await fetch(`${API}/getUpdates?timeout=50&offset=${offset}`);
    const j = await res.json();
    for (const u of j.result ?? []) {
      offset = u.update_id + 1;
      const msg = u.message;
      if (msg?.text?.startsWith('/')) {
        try {
          await handleCommand(msg.chat.id, msg.text);
        } catch (err) {
          console.error('command failed:', err.message);
        }
      }
    }
  } catch (err) {
    console.error('poll error:', err.message);
    await new Promise((r) => setTimeout(r, 5000));
  }
  setImmediate(poll);
}

console.log(`RAKE watch up - ${state.watches.length} watch(es), patrol every ${INTERVAL_MIN} min.`);
poll();
patrol();
setInterval(patrol, INTERVAL_MIN * 60 * 1000);
