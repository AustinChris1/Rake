// Telegram webhook: commands answered serverlessly, no PC required.
// Setup once: https://api.telegram.org/bot<TOKEN>/setWebhook?url=<app>/api/telegram&secret_token=<TELEGRAM_WEBHOOK_SECRET>

import { NextResponse } from 'next/server';
import { waitUntil } from '@vercel/functions';
import {
  isAddr, tgApi, sendMessage, checkOnce, formatCheck, helpText, MAX_WATCHES_PER_CHAT, DRAIN_ALERT,
} from '../../../src/watchcore.js';
import { storeEnabled, loadWatches, saveWatches } from '../../../src/watchstore.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const BOT = process.env.TELEGRAM_BOT_TOKEN;
const SECRET = process.env.TELEGRAM_WEBHOOK_SECRET;
const PUBLIC_URL = process.env.RAKE_PUBLIC_URL || 'http://localhost:3000';

export async function POST(req) {
  if (!BOT) return NextResponse.json({ error: 'TELEGRAM_BOT_TOKEN not set' }, { status: 503 });
  if (SECRET && req.headers.get('x-telegram-bot-api-secret-token') !== SECRET) {
    return NextResponse.json({ error: 'bad secret' }, { status: 401 });
  }

  const update = await req.json().catch(() => null);
  const msg = update?.message;
  if (!msg?.text?.startsWith('/')) return NextResponse.json({ ok: true });

  const tg = tgApi(BOT);
  const chatId = msg.chat.id;
  const [cmd, arg1, arg2] = msg.text.trim().split(/\s+/);
  const token = arg1?.toLowerCase();

  try {
    if (cmd === '/start' || cmd === '/help') {
      await sendMessage(tg, chatId, helpText(PUBLIC_URL, 'The patrol re-rakes watched pools every ~30 min.'));
    } else if (cmd === '/watch') {
      if (!storeEnabled()) await sendMessage(tg, chatId, 'Watch storage is not configured yet - /check still works.');
      else if (!isAddr(token)) await sendMessage(tg, chatId, 'Usage: /watch 0xTOKEN [rake% threshold]');
      else {
        const watches = await loadWatches();
        const mine = watches.filter((w) => w.chatId === chatId);
        if (mine.length >= MAX_WATCHES_PER_CHAT && !mine.some((w) => w.token === token)) {
          await sendMessage(tg, chatId, `Watch limit is ${MAX_WATCHES_PER_CHAT} per chat - /unwatch one first.`);
        } else {
          const threshold = Math.min(500, Math.max(5, Number(arg2) || 50));
          const next = watches.filter((w) => !(w.chatId === chatId && w.token === token));
          next.push({ chatId, token, threshold, armed: true, addedAt: new Date().toISOString() });
          await saveWatches(next);
          await sendMessage(tg, chatId, `Watching <code>${token}</code> - alert at rake ≥ ${threshold}% or a ≥${DRAIN_ALERT}x drain.`);
        }
      }
    } else if (cmd === '/unwatch') {
      if (!storeEnabled()) await sendMessage(tg, chatId, 'Watch storage is not configured yet.');
      else {
        const watches = await loadWatches();
        const next = watches.filter((w) => !(w.chatId === chatId && w.token === token));
        await saveWatches(next);
        await sendMessage(tg, chatId, next.length === watches.length ? 'Nothing matched.' : `Stopped watching <code>${token}</code>.`);
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
        // Ack the webhook now; the rake finishes after the response.
        waitUntil(
          checkOnce(token)
            .then((s) => sendMessage(tg, chatId, s.rakePct == null ? `${s.status} - no receipt.` : formatCheck(s, token, PUBLIC_URL)))
            .catch((err) => sendMessage(tg, chatId, `Check failed: ${err.message}`)),
        );
      }
    }
  } catch (err) {
    await sendMessage(tg, chatId, `Error: ${err.message}`).catch(() => {});
  }
  return NextResponse.json({ ok: true });
}
