// Telegram webhook: commands, inline-button callbacks, and web deep links, all serverless.
// Setup once: https://api.telegram.org/bot<TOKEN>/setWebhook?url=<app>/api/telegram&secret_token=<TELEGRAM_WEBHOOK_SECRET>

import { NextResponse } from 'next/server';
import { waitUntil } from '@vercel/functions';
import {
  isAddr, tgApi, sendMessage, checkOnce, formatCheck, helpText, parseStartPayload,
  alertKeyboard, checkKeyboard, helpKeyboard, MAX_WATCHES_PER_CHAT, DRAIN_ALERT,
} from '../../../src/watchcore.js';
import { storeEnabled, loadWatches, saveWatches } from '../../../src/watchstore.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const BOT = process.env.TELEGRAM_BOT_TOKEN;
const SECRET = process.env.TELEGRAM_WEBHOOK_SECRET;
const PUBLIC_URL = process.env.RAKE_PUBLIC_URL || 'http://localhost:3000';

async function addWatch(chatId, token, threshold = 50) {
  const watches = await loadWatches();
  const mine = watches.filter((w) => w.chatId === chatId);
  if (mine.length >= MAX_WATCHES_PER_CHAT && !mine.some((w) => w.token === token)) {
    return { ok: false, msg: `Watch limit is ${MAX_WATCHES_PER_CHAT} per chat - /unwatch one first.` };
  }
  const next = watches.filter((w) => !(w.chatId === chatId && w.token === token));
  next.push({ chatId, token, threshold, armed: true, addedAt: new Date().toISOString() });
  await saveWatches(next);
  return { ok: true, msg: `Watching <code>${token}</code> - alert at rake ≥ ${threshold}% or a ≥${DRAIN_ALERT}x drain.` };
}

async function removeWatch(chatId, token) {
  const watches = await loadWatches();
  const next = watches.filter((w) => !(w.chatId === chatId && w.token === token));
  await saveWatches(next);
  return next.length !== watches.length;
}

async function isWatched(chatId, token) {
  try {
    return (await loadWatches()).some((w) => w.chatId === chatId && w.token === token);
  } catch {
    return false;
  }
}

// Ack fast, deliver the receipt after the response.
function runCheck(tg, chatId, token) {
  waitUntil(
    checkOnce(token)
      .then(async (s) =>
        sendMessage(
          tg, chatId,
          s.rakePct == null ? `${s.status} - no receipt.` : formatCheck(s, token, PUBLIC_URL),
          checkKeyboard(PUBLIC_URL, token, await isWatched(chatId, token)),
        ),
      )
      .catch((err) => sendMessage(tg, chatId, `Check failed: ${err.message}`)),
  );
}

export async function POST(req) {
  if (!BOT) return NextResponse.json({ error: 'TELEGRAM_BOT_TOKEN not set' }, { status: 503 });
  if (SECRET && req.headers.get('x-telegram-bot-api-secret-token') !== SECRET) {
    return NextResponse.json({ error: 'bad secret' }, { status: 401 });
  }

  const update = await req.json().catch(() => null);
  const tg = tgApi(BOT);

  try {
    // Inline button presses
    if (update?.callback_query) {
      const cb = update.callback_query;
      const chatId = cb.message?.chat?.id;
      const [action, token] = (cb.data ?? '').split(':');
      await tg('answerCallbackQuery', { callback_query_id: cb.id });
      if (chatId && isAddr(token)) {
        if (action === 'check') {
          await sendMessage(tg, chatId, 'Pulling the tape…');
          runCheck(tg, chatId, token);
        } else if (action === 'unwatch' && storeEnabled()) {
          const removed = await removeWatch(chatId, token);
          await sendMessage(tg, chatId, removed ? `Stopped watching <code>${token}</code>.` : 'That watch was already gone.');
        } else if (action === 'watch' && storeEnabled()) {
          const r = await addWatch(chatId, token);
          await sendMessage(tg, chatId, r.msg);
        }
      }
      return NextResponse.json({ ok: true });
    }

    const msg = update?.message;
    if (!msg?.text?.startsWith('/')) return NextResponse.json({ ok: true });
    const chatId = msg.chat.id;
    const [cmd, arg1, arg2] = msg.text.trim().split(/\s+/);
    const token = arg1?.toLowerCase();

    if (cmd === '/start' || cmd.startsWith('/start@')) {
      // Deep links from the webapp: t.me/<bot>?start=watch_0x… or check_0x…
      const deep = parseStartPayload(msg.text);
      if (deep?.action === 'watch' && storeEnabled()) {
        const r = await addWatch(chatId, deep.token);
        await sendMessage(tg, chatId, r.msg, checkKeyboard(PUBLIC_URL, deep.token, r.ok));
      } else if (deep?.action === 'check') {
        await sendMessage(tg, chatId, 'Pulling the tape…');
        runCheck(tg, chatId, deep.token);
      } else {
        await sendMessage(tg, chatId, helpText(PUBLIC_URL, 'The patrol re-rakes watched pools every ~30 min.'), helpKeyboard(PUBLIC_URL));
      }
    } else if (cmd === '/help') {
      await sendMessage(tg, chatId, helpText(PUBLIC_URL, 'The patrol re-rakes watched pools every ~30 min.'), helpKeyboard(PUBLIC_URL));
    } else if (cmd === '/watch') {
      if (!storeEnabled()) await sendMessage(tg, chatId, 'Watch storage is not configured yet - /check still works.');
      else if (!isAddr(token)) await sendMessage(tg, chatId, 'Usage: /watch 0xTOKEN [rake% threshold]');
      else {
        const threshold = Math.min(500, Math.max(5, Number(arg2) || 50));
        const r = await addWatch(chatId, token, threshold);
        await sendMessage(tg, chatId, r.msg, r.ok ? checkKeyboard(PUBLIC_URL, token, true) : undefined);
      }
    } else if (cmd === '/unwatch') {
      if (!storeEnabled()) await sendMessage(tg, chatId, 'Watch storage is not configured yet.');
      else if (!isAddr(token)) await sendMessage(tg, chatId, 'Usage: /unwatch 0xTOKEN');
      else {
        const removed = await removeWatch(chatId, token);
        await sendMessage(tg, chatId, removed ? `Stopped watching <code>${token}</code>.` : 'Nothing matched.');
      }
    } else if (cmd === '/list') {
      if (!storeEnabled()) await sendMessage(tg, chatId, 'Watch storage is not configured yet.');
      else {
        const mine = (await loadWatches()).filter((w) => w.chatId === chatId);
        await sendMessage(
          tg, chatId,
          mine.length
            ? mine.map((w) => `• <code>${w.token}</code> ≥ ${w.threshold}% ${w.armed ? '(armed)' : '(fired)'}`).join('\n')
            : 'No watches. Add one with /watch 0xTOKEN',
        );
      }
    } else if (cmd === '/check') {
      if (!isAddr(token)) await sendMessage(tg, chatId, 'Usage: /check 0xTOKEN');
      else {
        await sendMessage(tg, chatId, 'Pulling the tape…');
        runCheck(tg, chatId, token);
      }
    }
  } catch (err) {
    const chatId = update?.message?.chat?.id ?? update?.callback_query?.message?.chat?.id;
    if (chatId) await sendMessage(tg, chatId, `Error: ${err.message}`).catch(() => {});
  }
  return NextResponse.json({ ok: true });
}
