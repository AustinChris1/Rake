// Local long-poll mode of the Telegram watch (serverless mode: /api/telegram + patrol Action).

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import {
  isAddr, tgApi, sendMessage, checkOnce, isBreach, isCalm, formatAlert, formatCheck, helpText,
  MAX_WATCHES_PER_CHAT, DRAIN_ALERT,
} from '../src/watchcore.js';

const BOT = process.env.TELEGRAM_BOT_TOKEN;
if (!BOT) {
  console.error('TELEGRAM_BOT_TOKEN is not set. Create a bot with @BotFather and put the token in .env');
  process.exit(1);
}
const tg = tgApi(BOT);
const PUBLIC_URL = process.env.RAKE_PUBLIC_URL || 'http://localhost:3000';
const INTERVAL_MIN = Math.max(15, Number(process.env.RAKE_WATCH_INTERVAL_MIN || 60));

const STATE_FILE = 'watch/watches.json';
mkdirSync('watch', { recursive: true });
const state = existsSync(STATE_FILE) ? JSON.parse(readFileSync(STATE_FILE, 'utf8')) : { watches: [] };
const save = () => writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));

async function handleCommand(chatId, text) {
  const [cmd, arg1, arg2] = text.trim().split(/\s+/);
  const token = arg1?.toLowerCase();

  if (cmd === '/start' || cmd === '/help') {
    return sendMessage(tg, chatId, helpText(PUBLIC_URL, `Checks run every ${INTERVAL_MIN} min.`));
  }
  if (cmd === '/watch') {
    if (!isAddr(token)) return sendMessage(tg, chatId, 'Usage: /watch 0xTOKEN [rake% threshold]');
    const mine = state.watches.filter((w) => w.chatId === chatId);
    if (mine.length >= MAX_WATCHES_PER_CHAT && !mine.some((w) => w.token === token)) {
      return sendMessage(tg, chatId, `Watch limit is ${MAX_WATCHES_PER_CHAT} per chat - /unwatch one first.`);
    }
    const threshold = Math.min(500, Math.max(5, Number(arg2) || 50));
    state.watches = state.watches.filter((w) => !(w.chatId === chatId && w.token === token));
    state.watches.push({ chatId, token, threshold, armed: true, addedAt: new Date().toISOString() });
    save();
    return sendMessage(tg, chatId, `Watching <code>${token}</code> - alert at rake ≥ ${threshold}% or a ≥${DRAIN_ALERT}x drain.`);
  }
  if (cmd === '/unwatch') {
    const before = state.watches.length;
    state.watches = state.watches.filter((w) => !(w.chatId === chatId && w.token === token));
    save();
    return sendMessage(tg, chatId, before === state.watches.length ? 'Nothing matched.' : `Stopped watching <code>${token}</code>.`);
  }
  if (cmd === '/list') {
    const mine = state.watches.filter((w) => w.chatId === chatId);
    if (!mine.length) return sendMessage(tg, chatId, 'No watches. Add one with /watch 0xTOKEN');
    return sendMessage(tg, chatId, mine.map((w) => `• <code>${w.token}</code> ≥ ${w.threshold}% ${w.armed ? '(armed)' : '(fired)'}`).join('\n'));
  }
  if (cmd === '/check') {
    if (!isAddr(token)) return sendMessage(tg, chatId, 'Usage: /check 0xTOKEN');
    await sendMessage(tg, chatId, 'Pulling the tape…');
    try {
      const s = await checkOnce(token);
      return sendMessage(tg, chatId, s.rakePct == null ? `${s.status} - no receipt.` : formatCheck(s, token, PUBLIC_URL));
    } catch (err) {
      return sendMessage(tg, chatId, `Check failed: ${err.message}`);
    }
  }
}

async function patrol() {
  for (const token of [...new Set(state.watches.map((w) => w.token))]) {
    let s;
    try {
      s = await checkOnce(token);
    } catch (err) {
      console.error(`patrol ${token}: ${err.message}`);
      continue;
    }
    if (s.rakePct == null) continue;
    for (const w of state.watches.filter((w) => w.token === token)) {
      if (isBreach(s, w.threshold) && w.armed && s.status === 'OK') {
        w.armed = false;
        await sendMessage(tg, w.chatId, formatAlert(s, token, PUBLIC_URL));
      } else if (!isBreach(s, w.threshold) && !w.armed && isCalm(s, w.threshold)) {
        w.armed = true;
      }
    }
    save();
  }
}

let offset = 0;
async function poll() {
  try {
    const res = await fetch(`https://api.telegram.org/bot${BOT}/getUpdates?timeout=50&offset=${offset}`);
    const j = await res.json();
    for (const u of j.result ?? []) {
      offset = u.update_id + 1;
      if (u.message?.text?.startsWith('/')) {
        await handleCommand(u.message.chat.id, u.message.text).catch((err) => console.error('command failed:', err.message));
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
