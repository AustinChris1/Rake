// Shared watch logic: check a token, evaluate thresholds, format Telegram messages.

import { runRake } from './report.js';

export const DRAIN_ALERT = 3;
export const WALK_CAP = 15; // per check, stays inside Alchemy's free tier
export const MAX_WATCHES_PER_CHAT = 5;

export const isAddr = (s) => /^0x[0-9a-fA-F]{40}$/.test(s ?? '');
const pct = (n) => (n == null ? 'n/a' : n.toFixed(1) + '%');
const usd = (n) => '$' + Math.round(n).toLocaleString('en-US');

export function tgApi(botToken) {
  return async (method, payload) => {
    const r = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return r.json();
  };
}

export const sendMessage = (tg, chatId, text) =>
  tg('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true });

export const receiptLink = (publicUrl, token) => `${publicUrl.replace(/\/$/, '')}/?token=${token}&hours=1`;

// One 1h rake, summarized for alerting.
export async function checkOnce(token) {
  const report = await runRake(token, { hours: 1, llm: false, fundingCap: WALK_CAP, onProgress: () => {} });
  if (report.status === 'UNPRICEABLE' || !report.rake) return { status: report.status ?? 'UNPRICEABLE' };
  const { tape, rake } = report;
  return {
    symbol: tape.tokenSymbol ?? 'token',
    rakePct: rake.rakePct,
    usdIn: rake.usdIn,
    houseUsd: rake.houseUsd,
    drain: rake.usdIn > 0 ? rake.usdOut / rake.usdIn : 0,
    status: report.status,
  };
}

export const isBreach = (s, threshold) => s.rakePct >= threshold || s.drain >= DRAIN_ALERT;
export const isCalm = (s, threshold) => s.rakePct < threshold * 0.8 && s.drain < DRAIN_ALERT;

export const formatAlert = (s, token, publicUrl) =>
  `🚨 <b>${s.symbol}</b> - the house is collecting.\n` +
  `Last hour: rake <b>${pct(s.rakePct)}</b> of ${usd(s.usdIn)} in, ${usd(s.houseUsd)} out through house cohorts. Drain ${s.drain.toFixed(1)}x.\n` +
  `Receipt: ${receiptLink(publicUrl, token)}`;

export const formatCheck = (s, token, publicUrl) =>
  `<b>${s.symbol}</b> (1h): rake <b>${pct(s.rakePct)}</b> of ${usd(s.usdIn)} in - ${usd(s.houseUsd)} to the house. ` +
  `Drain ${s.drain.toFixed(1)}x.${s.status === 'TOO_THIN' ? ' (TOO THIN)' : ''}\n${receiptLink(publicUrl, token)}`;

export const helpText = (publicUrl, intervalNote) =>
  `<b>RAKE watch</b> - every candle has a house; this bot tells you when it starts collecting.\n\n` +
  `/watch 0xTOKEN [rake%] - alert when the 1h rake crosses the threshold (default 50%) or the window is a ≥${DRAIN_ALERT}x drain\n` +
  `/unwatch 0xTOKEN\n/list\n/check 0xTOKEN - rake it right now\n\n` +
  `${intervalNote} Receipts: ${publicUrl}`;
