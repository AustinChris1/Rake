// RAKE — cohort engine. Cohorts are rules over public data, never a model's opinion:
//   first-block : EOAs behind the first N swaps after the pool was deployed
//   lp          : EOAs that minted/burned liquidity in this pool, in-window, plus the pool itself
//   repeat      : EOAs that also sold in the previous window of equal length
//   unlabeled   : everyone else
// The deployer-funded cohort (first inbound ETH from deployer) requires an RPC with
// asset-transfer tracing (e.g. Alchemy) and is DISABLED until a key is configured.

import { keccak256, toBytes } from 'viem';
import { withFailover, getLogsChunked, getTransactionSafe, mapLimit } from './rpc.js';
import { fetchAttributedSwaps } from './tape.js';
import { ALL_SWAP_TOPICS } from './decode.js';
import { fundingEnabled, walkFunders } from './alchemy.js';

const FUNDING_MIN_USD = 25; // funding walks only for sellers above this, bounded
const FUNDING_MAX_WALLETS = 120;

const FIRST_SWAPS_N = 50;
const FIRST_SCAN_MAX_BLOCKS = 200_000n; // give up the first-swaps scan after ~4.6 days of blocks

// Mint/Burn signatures across Uni v2, Solidly/Aerodrome, Uni v3/Slipstream.
// We never decode these — an LP actor is identified by the tx's EOA, so topic0 presence is enough.
const LP_TOPICS = [
  'Mint(address,uint256,uint256)', // Uni v2 + Solidly share this one
  'Burn(address,uint256,uint256,address)', // Uni v2
  'Burn(address,address,uint256,uint256)', // Solidly
  'Mint(address,address,int24,int24,uint128,uint256,uint256)', // v3-style
  'Burn(address,int24,int24,uint128,uint256,uint256)', // v3-style
].map((s) => keccak256(toBytes(s)));

// Binary-search the block where the pool contract's code first exists (~26 eth_getCode calls).
export async function findCreationBlock(pool, latest) {
  let lo = 1n;
  let hi = latest;
  while (lo < hi) {
    const mid = (lo + hi) / 2n;
    const code = await withFailover((c) => c.getCode({ address: pool, blockNumber: mid }));
    if (code && code !== '0x') hi = mid;
    else lo = mid + 1n;
  }
  return lo;
}

// EOAs behind the first N swaps after pool creation.
// Raw logs are collected first and sliced to N — only those txs are attributed,
// so a pool with a thousand launch-hour swaps still costs ~50 tx lookups.
export async function firstBlockCohort({ pool, creationBlock, log = () => {} }) {
  let from = creationBlock;
  const logs = [];
  while (logs.length < FIRST_SWAPS_N && from < creationBlock + FIRST_SCAN_MAX_BLOCKS) {
    const to = from + 1799n;
    const chunk = await getLogsChunked({ address: pool, topics: [ALL_SWAP_TOPICS], fromBlock: from, toBlock: to });
    logs.push(...chunk);
    from = to + 1n;
  }
  logs.sort(
    (a, b) =>
      parseInt(a.blockNumber, 16) - parseInt(b.blockNumber, 16) ||
      parseInt(a.logIndex, 16) - parseInt(b.logIndex, 16),
  );
  const firstN = logs.slice(0, FIRST_SWAPS_N);
  const hashes = [...new Set(firstN.map((l) => l.transactionHash))];
  log(`first-swaps scan: ${firstN.length} swaps, ${hashes.length} txs to attribute`);
  const wallets = new Set();
  await mapLimit(hashes, 6, async (hash) => {
    const tx = await getTransactionSafe(hash);
    if (tx) wallets.add(tx.from.toLowerCase());
  });
  return {
    wallets,
    scannedTo: Number(from),
    found: firstN.length,
    complete: firstN.length >= FIRST_SWAPS_N,
  };
}

// EOAs that touched liquidity in-window (mint or burn on this pool), plus the pool address itself.
export async function lpCohort({ pool, fromBlock, toBlock }) {
  const logs = await getLogsChunked({ address: pool, topics: [LP_TOPICS], fromBlock, toBlock });
  const wallets = new Set([pool.toLowerCase()]);
  const hashes = [...new Set(logs.map((l) => l.transactionHash))];
  await mapLimit(hashes, 6, async (hash) => {
    const tx = await getTransactionSafe(hash);
    if (tx) wallets.add(tx.from.toLowerCase());
  });
  return { wallets, events: logs.length };
}

// EOAs that sold in the previous window of the same length.
export async function repeatCohort({ ctx, fromBlock, toBlock, log = () => {} }) {
  const span = toBlock - fromBlock;
  const swaps = await fetchAttributedSwaps({
    ...ctx,
    fromBlock: fromBlock - span - 1n,
    toBlock: fromBlock - 1n,
    log,
  });
  return { wallets: new Set(swaps.filter((s) => s.side === 'sell').map((s) => s.trader)) };
}

// The EOA that provided the pool's initial liquidity — "holder #0" for rug analysis.
export async function initialLpEoa({ pool, creationBlock }) {
  const logs = await getLogsChunked({
    address: pool,
    topics: [LP_TOPICS],
    fromBlock: creationBlock,
    toBlock: creationBlock + 5000n,
  });
  if (logs.length === 0) return null;
  logs.sort((a, b) => parseInt(a.blockNumber, 16) - parseInt(b.blockNumber, 16));
  const tx = await getTransactionSafe(logs[0].transactionHash);
  return tx ? tx.from.toLowerCase() : null;
}

// Funding annotations for the window's sellers (requires an Alchemy key):
//   deployerFunded — sellers whose first inbound transfer came from the initial-LP EOA
//                    or a first-block wallet
//   clusters       — groups of ≥2 sellers sharing the same first funder (one operator's fleet)
export async function fundingCohort({ sellers, initialLp, firstBlockWallets, log = () => {} }) {
  if (!fundingEnabled()) return { enabled: false };
  const targets = sellers
    .filter((s) => s.usd >= FUNDING_MIN_USD)
    .sort((a, b) => b.usd - a.usd)
    .slice(0, FUNDING_MAX_WALLETS)
    .map((s) => s.wallet);
  log(`funding walk: ${targets.length} sellers ≥ $${FUNDING_MIN_USD}`);
  const { funderOf, failed, firstError } = await walkFunders(targets, {
    onProgress: (d, t) => d % 25 === 0 && log(`funding walk ${d}/${t}`),
  });
  if (failed > 0) log(`⚠ ${failed}/${targets.length} funding walks FAILED: ${firstError}`);
  if (targets.length > 0 && failed === targets.length) {
    return { enabled: false, failedReason: `all walks failed — ${firstError}` };
  }

  const houseFunders = new Set([...(initialLp ? [initialLp] : []), ...firstBlockWallets]);
  const deployerFunded = new Set();
  const byFunder = {};
  for (const [wallet, info] of Object.entries(funderOf)) {
    if (!info) continue;
    if (houseFunders.has(info.funder)) deployerFunded.add(wallet);
    (byFunder[info.funder] ??= []).push({ wallet, txHash: info.txHash });
  }
  const clusters = Object.entries(byFunder)
    .filter(([, members]) => members.length >= 2)
    .map(([funder, members]) => ({ funder, members, size: members.length }))
    .sort((a, b) => b.size - a.size);

  return { enabled: true, initialLp, funderOf, deployerFunded, clusters, walked: targets.length };
}

// Classify every seller in the tape and compute the rake.
// Priority when a wallet is in several cohorts:
// first-block > deployer-funded > lp > repeat.
export function computeRake(tape, { firstBlock, lp, repeat, funding = { enabled: false } }) {
  const classify = (wallet) => {
    if (wallet === 'unattributed') return 'unlabeled'; // pruned tx — never cohorted
    if (firstBlock.wallets.has(wallet)) return 'first-block';
    if (funding.enabled && funding.deployerFunded.has(wallet)) return 'deployer-funded';
    if (lp.wallets.has(wallet)) return 'lp';
    if (repeat.wallets.has(wallet)) return 'repeat';
    return 'unlabeled';
  };

  const cohorts = {};
  for (const s of tape.swaps) {
    if (s.side !== 'sell') continue;
    const c = classify(s.trader);
    cohorts[c] ??= { usd: 0, wallets: {}, swaps: 0 };
    cohorts[c].usd += s.usd;
    cohorts[c].swaps += 1;
    cohorts[c].wallets[s.trader] ??= { usd: 0, txs: [] };
    cohorts[c].wallets[s.trader].usd += s.usd;
    cohorts[c].wallets[s.trader].txs.push(s.txHash);
  }
  for (const c of Object.values(cohorts)) {
    c.walletList = Object.entries(c.wallets)
      .map(([w, v]) => ({ wallet: w, usd: v.usd, txs: v.txs }))
      .sort((a, b) => b.usd - a.usd);
  }

  const houseUsd = ['first-block', 'deployer-funded', 'lp', 'repeat'].reduce(
    (t, k) => t + (cohorts[k]?.usd ?? 0),
    0,
  );
  const usdIn = tape.totals.usdIn;

  return {
    usdIn,
    usdOut: tape.totals.usdOut,
    houseUsd,
    rakePct: usdIn > 0 ? (houseUsd / usdIn) * 100 : null,
    cohorts,
    clusters: funding.enabled ? funding.clusters : null,
    meta: {
      firstBlockComplete: firstBlock.complete,
      firstBlockWallets: firstBlock.wallets.size,
      lpEventsInWindow: lp.events,
      initialLp: funding.enabled ? funding.initialLp : null,
      deployerFunded: funding.enabled
        ? `walked ${funding.walked} sellers`
        : funding.failedReason
          ? `FAILED (${funding.failedReason})`
          : 'DISABLED (set ALCHEMY_API_KEY to enable funding walks)',
    },
  };
}
