// RAKE CLI.
// Usage: node src/cli.js <tokenAddress> [--hours 4] [--pair 0x...] [--wallet 0x...] [--no-llm]

import { mkdirSync, writeFileSync } from 'node:fs';
import { runRake } from './report.js';

const args = process.argv.slice(2);
const addrs = args.filter((a) => /^0x[0-9a-fA-F]{40}$/.test(a));
const token = addrs[0];
if (!token) {
  console.error('Usage: node src/cli.js <tokenAddress> [--hours 4] [--pair 0x...] [--wallet 0x...] [--no-llm]');
  process.exit(1);
}
const flag = (name, dflt) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : dflt;
};

const usd = (n) => '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 });
const short = (a) => a.slice(0, 6) + '…' + a.slice(-4);

const t0 = Date.now();
const report = await runRake(token, {
  hours: Number(flag('hours', '4')),
  pairAddress: flag('pair', undefined),
  wallet: flag('wallet', undefined),
  llm: !args.includes('--no-llm'),
  onProgress: (m) => console.error('  · ' + m),
});

if (report.status === 'UNPRICEABLE') {
  console.log(`UNPRICEABLE - ${report.reason}`);
  process.exit(0);
}

const { tape, rake, ticket, diagnosis } = report;
console.log('');
console.log(`RAKE - ${tape.tokenSymbol} on ${tape.dex}  pool ${tape.pool}`);
console.log(`window  ${tape.window.fromTime} → ${tape.window.toTime}  (${tape.window.hours}h)`);
console.log(`status  ${report.status}`);
console.log('');
console.log(`swaps   ${tape.totals.swaps}  (${tape.totals.buys} buys / ${tape.totals.sells} sells)`);
console.log(`in      ${usd(tape.totals.usdIn)} from ${tape.totals.uniqueBuyers} buyers`);
console.log(`out     ${usd(tape.totals.usdOut)} to ${tape.totals.uniqueSellers} sellers`);

if (rake) {
  console.log('');
  console.log('─'.repeat(72));
  const pct = rake.rakePct === null ? 'n/a' : rake.rakePct.toFixed(1) + '%';
  console.log(`THE RAKE: of ${usd(rake.usdIn)} that entered this pool in ${tape.window.hours}h,`);
  console.log(`${usd(rake.houseUsd)} (${pct} of inflow) left through house cohorts.`);
  console.log('─'.repeat(72));
  for (const [name, c] of Object.entries(rake.cohorts).sort((a, b) => b[1].usd - a[1].usd)) {
    console.log(`  ${name.padEnd(16)} ${usd(c.usd).padStart(10)}  ${c.walletList.length} wallets, ${c.swaps} sells`);
    for (const w of c.walletList.slice(0, 3)) {
      console.log(`     ${short(w.wallet)}  ${usd(w.usd).padStart(10)}  e.g. ${w.txs[0]}`);
    }
  }
  if (rake.clusters?.length) {
    console.log('');
    console.log('  funding clusters (sellers sharing one first-funder):');
    for (const cl of rake.clusters.slice(0, 5)) {
      const tag = cl.infra ? `  [${cl.infraReason ?? 'infra'} - not house]` : '  [HOUSE: cluster]';
      console.log(`     funder ${short(cl.funder)} → ${cl.size} sellers: ${cl.members.slice(0, 4).map((m) => short(m.wallet)).join(', ')}${cl.size > 4 ? '…' : ''}${tag}`);
    }
  }
  console.log('');
  console.log(`  deployer-funded: ${rake.meta.deployerFunded}`);
}

if (ticket) {
  console.log('');
  console.log('YOUR TICKET');
  if (ticket.status === 'NOT_IN_WINDOW') {
    console.log(`  ${ticket.reason}`);
    for (const t of ticket.receivedThisToken ?? []) {
      console.log(`  ✓ but the wallet DID receive ${Math.round(t.value ?? 0)} ${tape.tokenSymbol} in-window via a DIFFERENT pool - tx ${t.txHash}`);
    }
    if (ticket.sameSymbolSuspect) {
      const s = ticket.sameSymbolSuspect;
      console.log(`  ⚠ SAME TICKER, DIFFERENT CONTRACT: this wallet received ${Math.round(s.value ?? 0)} "${tape.tokenSymbol}" at ${s.address}${s.ts ? ' on ' + s.ts : ''} (tx ${s.txHash})`);
      console.log(`    You may be raking the wrong token - run RAKE on that address instead.`);
    }
  } else {
    console.log(`  buys ${usd(ticket.buys.usd)} (${ticket.buys.count} tx), sells ${usd(ticket.sells.usd)} (${ticket.sells.count} tx)`);
    for (const b of ticket.buyEvents) {
      console.log(`  buy ${usd(b.usd)} @ block ${b.block} - house sold ${usd(b.nearbyHouseSellUsd)} within ±${ticket.nearbyBlocks} blocks`);
    }
  }
}

if (diagnosis) {
  console.log('');
  console.log('ANALYST' + (diagnosis.status === 'OK' ? ` (${diagnosis.model})` : ` - ${diagnosis.status}: ${diagnosis.reason}`));
  if (diagnosis.status === 'OK') console.log(diagnosis.text.split('\n').map((l) => '  ' + l).join('\n'));
}

mkdirSync('out', { recursive: true });
const outFile = `out/rake_${tape.tokenSymbol ?? 'token'}_${tape.window.toBlock}.json`;
writeFileSync(outFile, JSON.stringify(report, null, 2));
console.log('');
console.log(`receipt → ${outFile}  (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
