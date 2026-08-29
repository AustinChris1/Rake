// The full pipeline, shared by CLI and web; both stream the same trace via onProgress.

import { buildTape } from './tape.js';
import {
  findCreationBlock,
  firstBlockCohort,
  lpCohort,
  repeatCohort,
  initialLpEoa,
  fundingCohort,
  computeRake,
} from './cohorts.js';
import { buildTicket } from './ticket.js';
import { diagnose } from './diagnose.js';
import { fundingEnabled, recentInboundTransfers } from './alchemy.js';

// fundingCap: top sellers walked (default fits the free tier). deep: adds two-hop cluster funder walks.
export async function runRake(
  token,
  { hours = 4, pairAddress, wallet, llm = true, fundingCap, deep = false, onProgress = () => {}, onReport, deadline = null } = {},
) {
  const log = (msg) => onProgress(msg);

  log(`resolving top Base pool for ${token}…`);
  const tape = await buildTape(token, { hours, pairAddress, log });
  if (tape.status === 'UNPRICEABLE') return { status: 'UNPRICEABLE', token, reason: tape.reason };

  let rake = null;
  let ticket = null;
  let diagnosis = null;

  if (tape.status === 'OK' || tape.status === 'TOO_THIN') {
    const fromBlock = BigInt(tape.window.fromBlock);
    const toBlock = BigInt(tape.window.toBlock);

    // v4 pools are not contracts - creation is anchored from Dexscreener's
    // pairCreatedAt via Base's fixed 2s block time (small safety margin, scan forward).
    let creationBlock = null;
    if (tape.ctx.isV4) {
      if (tape.pairCreatedAt) {
        const toTimeMs = Date.parse(tape.window.toTime);
        creationBlock = toBlock - BigInt(Math.ceil((toTimeMs - tape.pairCreatedAt) / 2000)) - 300n;
        if (creationBlock < 1n) creationBlock = 1n;
        log(`v4 pool - creation anchored from pairCreatedAt at ~block ${creationBlock}`);
      } else {
        log('v4 pool without pairCreatedAt - first-block cohort disabled for this run');
      }
    } else {
      log('locating pool creation block…');
      creationBlock = await findCreationBlock(tape.pool, toBlock);
      log(`pool deployed at block ${creationBlock}`);
    }

    const [firstBlock, lp, repeat, initialLp] = await Promise.all([
      creationBlock === null
        ? { wallets: new Set(), found: 0, complete: false }
        : firstBlockCohort({ ctx: tape.ctx, creationBlock, log }),
      lpCohort({ ctx: tape.ctx, fromBlock, toBlock }),
      repeatCohort({ ctx: tape.ctx, fromBlock, toBlock, log }),
      initialLpEoa({ ctx: tape.ctx, creationBlock }),
    ]);

    const sellerTotals = {};
    for (const s of tape.swaps) {
      if (s.side !== 'sell') continue;
      sellerTotals[s.trader] = (sellerTotals[s.trader] ?? 0) + s.usd;
    }
    const funding = await fundingCohort({
      sellers: Object.entries(sellerTotals).map(([wallet, usd]) => ({ wallet, usd })),
      initialLp,
      firstBlockWallets: firstBlock.wallets,
      cap: fundingCap,
      deadline,
      log,
    });
    if (deep && funding.enabled) {
      // Two-hop: who funded the fleet funders themselves - often the actual operator.
      const { firstFunder } = await import('./alchemy.js');
      for (const cl of funding.clusters ?? []) {
        if (cl.infra) continue;
        if (deadline && Date.now() > deadline + 45_000) break; // two-hop is a handful of calls: allow past the walk budget
        try {
          log(`deep pass: walking funder-of-funder for ${cl.funder}…`);
          cl.funderFundedBy = await firstFunder(cl.funder);
        } catch {
          cl.funderFundedBy = null;
        }
      }
    }
    if (!funding.enabled) log('funding walks disabled (no ALCHEMY_API_KEY) - deployer-funded cohort skipped');

    rake = computeRake(tape, { firstBlock, lp, repeat, funding });

    if (wallet) {
      log(`building ticket for ${wallet}…`);
      ticket = buildTicket(tape, rake, wallet);
      // An empty ticket deserves an explanation, not a shrug. Two cheap checks on the
      // wallet's recent inbound transfers:
      //  1. This very token received IN-window => the buy routed through a different
      //     pool of the token (this tape reads the top-volume pool only).
      //  2. A same-symbol token at a DIFFERENT contract => the classic wrong-CA trap.
      if (ticket.status === 'NOT_IN_WINDOW' && fundingEnabled() && tape.tokenSymbol) {
        try {
          const inbound = await recentInboundTransfers(wallet, 50);
          const fromTs = Date.parse(tape.window.fromTime);
          const toTs = Date.parse(tape.window.toTime);
          const received = inbound.filter(
            (t) => t.address === tape.token && t.ts && Date.parse(t.ts) >= fromTs && Date.parse(t.ts) <= toTs,
          );
          if (received.length) {
            ticket.receivedThisToken = received.slice(0, 5);
            log(`ticket: wallet DID receive ${tape.tokenSymbol} in-window via ${received.length} transfer(s) - outside this pool's tape`);
          }
          const suspect = inbound.find(
            (t) =>
              t.asset &&
              t.address &&
              t.asset.toLowerCase() === tape.tokenSymbol.toLowerCase() &&
              t.address !== tape.token,
          );
          if (suspect && !received.length) {
            ticket.sameSymbolSuspect = suspect;
            log(`⚠ wallet holds a DIFFERENT token also named "${tape.tokenSymbol}" - ${suspect.address}`);
          }
        } catch (err) {
          log(`ticket: inbound-transfer check unavailable (${err.message}) - advisory only`);
        }
      }
    }

    if (llm && tape.status === 'OK') {
      // Hand the finished receipt over before the analyst runs, so a slow or
      // rate-limited model never delays the numbers.
      onReport?.({ status: tape.status, generatedAt: new Date().toISOString(), tape, rake, ticket, diagnosis: null });
      diagnosis = await diagnose({ tape, rake, ticket, onProgress });
    }
  }

  // The full swap list stays in the receipt file; strip nothing - receipts are the product.
  return {
    status: tape.status,
    generatedAt: new Date().toISOString(),
    tape,
    rake,
    ticket,
    diagnosis,
  };
}
