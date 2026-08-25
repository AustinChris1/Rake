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

    log('locating pool creation block…');
    const creationBlock = await findCreationBlock(tape.pool, toBlock);
    log(`pool deployed at block ${creationBlock}`);

    const [firstBlock, lp, repeat, initialLp] = await Promise.all([
      firstBlockCohort({ pool: tape.pool, creationBlock, log }),
      lpCohort({ pool: tape.pool, fromBlock, toBlock }),
      repeatCohort({ ctx: tape.ctx, fromBlock, toBlock, log }),
      initialLpEoa({ pool: tape.pool, creationBlock }),
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
