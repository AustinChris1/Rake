// Hourly public log: rakes trending Base tokens, appends log/events.jsonl, regenerates
// LEADERBOARD.md, and publishes the 12h self-check even when it is unflattering.

import { mkdirSync, readFileSync, writeFileSync, existsSync, appendFileSync } from 'node:fs';
import { runRake } from '../src/report.js';

const LOG_DIR = 'log';
const EVENTS = `${LOG_DIR}/events.jsonl`;
const BOARD = `${LOG_DIR}/LEADERBOARD.md`;
const TOP_N = 6;
const usd = (n) => '$' + Math.round(n).toLocaleString('en-US');

mkdirSync(LOG_DIR, { recursive: true });

async function trendingBaseTokens() {
  const r = await fetch('https://api.geckoterminal.com/api/v2/networks/base/trending_pools', {
    headers: { Accept: 'application/json' },
  });
  const j = await r.json();
  const seen = new Set();
  const out = [];
  for (const p of j.data ?? []) {
    const address = (p.relationships?.base_token?.data?.id ?? '').replace('base_', '');
    const symbol = (p.attributes?.name ?? '').split('/')[0].trim();
    if (!address || seen.has(address) || address === '0x4200000000000000000000000000000000000006') continue;
    seen.add(address);
    out.push({ address, symbol, priceUsd: Number(p.attributes?.base_token_price_usd ?? 0) });
    if (out.length >= TOP_N) break;
  }
  return out;
}

async function priceNow(address) {
  const r = await fetch(`https://api.dexscreener.com/token-pairs/v1/base/${address}`);
  const pairs = await r.json();
  const best = (Array.isArray(pairs) ? pairs : [])
    .filter((p) => p.chainId === 'base' && Number(p.priceUsd) > 0)
    .sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))[0];
  return best ? Number(best.priceUsd) : null;
}

// 1. Rake this hour's trending tokens
const tokens = await trendingBaseTokens();
console.log(`raking ${tokens.length} trending Base tokens (1h windows)…`);
const events = [];
for (const t of tokens) {
  try {
    const report = await runRake(t.address, { hours: 1, llm: false, onProgress: () => {} });
    if (!report.rake) {
      console.log(`  ${t.symbol}: ${report.status}`);
      continue;
    }
    const ev = {
      at: new Date().toISOString(),
      token: t.address,
      symbol: t.symbol,
      pool: report.tape.pool,
      status: report.status,
      usdIn: Math.round(report.rake.usdIn),
      houseUsd: Math.round(report.rake.houseUsd),
      rakePct: report.rake.rakePct === null ? null : Number(report.rake.rakePct.toFixed(1)),
      priceUsd: await priceNow(t.address),
      toBlock: report.tape.window.toBlock,
    };
    events.push(ev);
    appendFileSync(EVENTS, JSON.stringify(ev) + '\n');
    console.log(`  ${t.symbol}: rake ${ev.rakePct}% of ${usd(ev.usdIn)} (${ev.status})`);
  } catch (err) {
    console.log(`  ${t.symbol}: ERROR ${err.message}`);
  }
}

// 2. Self-check events ≥12h old; publish the high-rake vs baseline split either way.
const all = existsSync(EVENTS)
  ? readFileSync(EVENTS, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l))
  : [];
const now = Date.now();
let checkedUpdates = 0;
for (const ev of all) {
  if (ev.checked || !ev.priceUsd) continue;
  if (now - new Date(ev.at).getTime() < 12 * 3600 * 1000) continue;
  const p = await priceNow(ev.token);
  ev.checked = true;
  ev.price12hUsd = p;
  ev.move12hPct = p ? Number((((p - ev.priceUsd) / ev.priceUsd) * 100).toFixed(1)) : null;
  checkedUpdates++;
}
if (checkedUpdates > 0) writeFileSync(EVENTS, all.map((e) => JSON.stringify(e)).join('\n') + '\n');

const checked = all.filter((e) => e.checked && e.move12hPct !== null);
const hi = checked.filter((e) => e.rakePct >= 50);
const lo = checked.filter((e) => e.rakePct < 50);
const downShare = (list) =>
  list.length ? Math.round((list.filter((e) => e.move12hPct <= -30).length / list.length) * 100) : null;

// 3. Regenerate the leaderboard
const latestBy = {};
for (const e of all) latestBy[e.token] = e; // last write wins (file is chronological)
const board = Object.values(latestBy)
  .filter((e) => e.status === 'OK' && e.rakePct !== null)
  .sort((a, b) => b.rakePct - a.rakePct)
  .slice(0, 15);

writeFileSync(
  BOARD,
  [
    '# RAKE - Trapped-candle leaderboard (Base)',
    '',
    `_Auto-generated ${new Date().toISOString()}. Every row is a 1h window of real swaps; rake % = share of pool inflow that left through house cohorts (first-block, deployer-funded, lp, repeat). Full event log: [events.jsonl](./events.jsonl)._`,
    '',
    '| token | rake % | inflow | to the house | window end block |',
    '|---|---:|---:|---:|---|',
    ...board.map((e) => `| ${e.symbol} \`${e.token.slice(0, 10)}…\` | ${e.rakePct}% | ${usd(e.usdIn)} | ${usd(e.houseUsd)} | ${e.toBlock} |`),
    '',
    '## Self-check - does a high rake predict anything?',
    '',
    checked.length < 10
      ? `_${checked.length} events have completed their 12h check so far. The split below prints once there are ≥10 - and it prints whichever way it comes out._`
      : `Of ${hi.length} high-rake events (≥50%), **${downShare(hi)}%** were down ≥30% twelve hours later. Base rate across ${lo.length} low-rake events: **${downShare(lo)}%**. ${downShare(hi) > downShare(lo) ? 'High rake preceded drawdown more often than baseline in this sample.' : '**In this sample, high rake did NOT predict drawdown better than baseline.** The receipts stand either way.'}`,
    '',
  ].join('\n'),
);

console.log(`\n${events.length} events logged, ${checkedUpdates} self-checks completed → ${BOARD}`);
