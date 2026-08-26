// RAKE — the full pipeline, shared by the CLI and the web server.
// Emits progress lines through `onProgress` so both surfaces stream the same trace.

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

export async function runRake(token, { hours = 4, pairAddress, wallet, llm = true, onProgress = () => {} } = {}) {
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

    // v4 pools are not contracts — creation is anchored from Dexscreener's
    // pairCreatedAt via Base's fixed 2s block time (small safety margin, scan forward).
    let creationBlock = null;
    if (tape.ctx.isV4) {
      if (tape.pairCreatedAt) {
        const toTimeMs = Date.parse(tape.window.toTime);
        creationBlock = toBlock - BigInt(Math.ceil((toTimeMs - tape.pairCreatedAt) / 2000)) - 300n;
        if (creationBlock < 1n) creationBlock = 1n;
        log(`v4 pool — creation anchored from pairCreatedAt at ~block ${creationBlock}`);
      } else {
        log('v4 pool without pairCreatedAt — first-block cohort disabled for this run');
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
      log,
    });
    if (!funding.enabled) log('funding walks disabled (no ALCHEMY_API_KEY) — deployer-funded cohort skipped');

    rake = computeRake(tape, { firstBlock, lp, repeat, funding });

    if (wallet) {
      log(`building ticket for ${wallet}…`);
      ticket = buildTicket(tape, rake, wallet);
      // Empty ticket + a same-symbol token at a DIFFERENT contract in the wallet's
      // recent inbound transfers = the classic wrong-CA trap. Say so, with receipts.
      if (ticket.status === 'NOT_IN_WINDOW' && fundingEnabled() && tape.tokenSymbol) {
        try {
          const inbound = await recentInboundTransfers(wallet);
          const suspect = inbound.find(
            (t) =>
              t.asset &&
              t.address &&
              t.asset.toLowerCase() === tape.tokenSymbol.toLowerCase() &&
              t.address !== tape.token,
          );
          if (suspect) {
            ticket.sameSymbolSuspect = suspect;
            log(`⚠ wallet holds a DIFFERENT token also named "${tape.tokenSymbol}" — ${suspect.address}`);
          }
        } catch {
          // advisory only — never fails the run
        }
      }
    }

    if (llm && tape.status === 'OK') {
      diagnosis = await diagnose({ tape, rake, ticket, onProgress });
    }
  }

  // The full swap list stays in the receipt file; strip nothing — receipts are the product.
  return {
    status: tape.status,
    generatedAt: new Date().toISOString(),
    tape,
    rake,
    ticket,
    diagnosis,
  };
}
