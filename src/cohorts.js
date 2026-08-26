// RAKE — cohort engine. Cohorts are rules over public data, never a model's opinion:
//   first-block : EOAs behind the first N swaps after the pool was deployed
//   lp          : EOAs that minted/burned liquidity in this pool, in-window, plus the pool itself
//   repeat      : EOAs that also sold in the previous window of equal length
//   unlabeled   : everyone else
// The deployer-funded cohort (first inbound ETH from deployer) requires an RPC with
// asset-transfer tracing (e.g. Alchemy) and is DISABLED until a key is configured.

import { keccak256, toBytes } from 'viem';
import { withFailover, getLogsChunked } from './rpc.js';
import { fetchAttributedSwaps } from './tape.js';
import { ALL_SWAP_TOPICS } from './decode.js';
import { buildTxAttribution, traderForLog, ENTRYPOINTS } from './attribute.js';
import { fundingEnabled, walkFunders, outgoingTransferCount } from './alchemy.js';
import { V4_POOL_MANAGER } from './config.js';

// Protocol plumbing can show up as a wallet's "first funder" (e.g. a fresh wallet
// whose first inbound asset is the token it bought, delivered by the v4 singleton).
// Plumbing is never an operator — it neither clusters nor marks deployer funding.
const PLUMBING = new Set([
  V4_POOL_MANAGER.toLowerCase(),
  ...ENTRYPOINTS,
  '0x0000000000000000000000000000000000000000',
  '0x4200000000000000000000000000000000000006', // WETH — wrap/unwrap flows, never an operator
]);

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
  'ModifyLiquidity(bytes32,address,int24,int24,int256,bytes32)', // Uni v4 singleton (topic1 = pool id)
].map((s) => keccak256(toBytes(s)));

// Swap/LP log query for a pool: a v4 pool is queried on the PoolManager with its
// pool id as topic1; a real pool contract is queried directly.
const poolTopics = (ctx, topicList) => (ctx.topicFilter ? [topicList, ctx.topicFilter] : [topicList]);

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
export async function firstBlockCohort({ ctx, creationBlock, log = () => {} }) {
  let from = creationBlock;
  const logs = [];
  while (logs.length < FIRST_SWAPS_N && from < creationBlock + FIRST_SCAN_MAX_BLOCKS) {
    const to = from + 1799n;
    const chunk = await getLogsChunked({ address: ctx.logAddress, topics: poolTopics(ctx, ALL_SWAP_TOPICS), fromBlock: from, toBlock: to });
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
  const meta = await buildTxAttribution(hashes);
  const wallets = new Set();
  for (const l of firstN) {
    const t = traderForLog(meta, l.transactionHash, parseInt(l.logIndex, 16));
    if (t !== 'unattributed') wallets.add(t);
  }
  return {
    wallets,
    scannedTo: Number(from),
    found: firstN.length,
    complete: firstN.length >= FIRST_SWAPS_N,
  };
}

// EOAs that touched liquidity in-window (mint or burn on this pool), plus the pool address itself.
export async function lpCohort({ ctx, fromBlock, toBlock }) {
  const logs = await getLogsChunked({ address: ctx.logAddress, topics: poolTopics(ctx, LP_TOPICS), fromBlock, toBlock });
  const wallets = new Set([ctx.pool.toLowerCase(), ctx.logAddress.toLowerCase()]);
  const hashes = [...new Set(logs.map((l) => l.transactionHash))];
  const meta = await buildTxAttribution(hashes);
  for (const l of logs) {
    const t = traderForLog(meta, l.transactionHash, parseInt(l.logIndex, 16));
    if (t !== 'unattributed') wallets.add(t);
  }
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
export async function initialLpEoa({ ctx, creationBlock }) {
  if (creationBlock === null) return null;
  const logs = await getLogsChunked({
    address: ctx.logAddress,
    topics: poolTopics(ctx, LP_TOPICS),
    fromBlock: creationBlock,
    toBlock: creationBlock + 5000n,
  });
  if (logs.length === 0) return null;
  logs.sort((a, b) => parseInt(a.blockNumber, 16) - parseInt(b.blockNumber, 16));
  const meta = await buildTxAttribution([logs[0].transactionHash]);
  const t = traderForLog(meta, logs[0].transactionHash, parseInt(logs[0].logIndex, 16));
  return t === 'unattributed' ? null : t;
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
    if (!info || PLUMBING.has(info.funder)) continue;
    if (houseFunders.has(info.funder)) deployerFunded.add(wallet);
    (byFunder[info.funder] ??= []).push({ wallet, txHash: info.txHash });
  }
  const clusters = Object.entries(byFunder)
    .filter(([, members]) => members.length >= 2)
    .map(([funder, members]) => ({ funder, members, size: members.length }))
    .sort((a, b) => b.size - a.size);

  // Infrastructure guard: a shared first-funder only implies one operator when the
  // funder is a low-degree EOA. Contracts (bridges, factories, paymasters, routers)
  // and exchange hot wallets / disperse bots fund thousands of unrelated addresses —
  // accusing their users would be a smear. Operators fund fleets from EOAs.
  const INFRA_DEGREE = 1000;
  for (const cl of clusters) {
    try {
      const code = await withFailover((c) => c.getCode({ address: cl.funder }));
      if (code && code !== '0x') {
        cl.infra = true;
        cl.infraReason = 'contract funder (bridge/factory/paymaster)';
        continue;
      }
      // Members that are themselves contracts are smart accounts — a shared funder
      // is then usually the wallet product's gas tank seeding unrelated users, not
      // one operator. Shown, never counted. (Ambiguity never accuses.)
      const sampled = cl.members.slice(0, 5);
      const codes = await Promise.all(
        sampled.map((m) => withFailover((c) => c.getCode({ address: m.wallet })).catch(() => '0x')),
      );
      const contractMembers = codes.filter((c) => c && c !== '0x').length;
      if (contractMembers * 2 >= sampled.length) {
        cl.infra = true;
        cl.infraReason = 'members are smart accounts — funder may be wallet infrastructure';
        continue;
      }
      cl.funderOutgoing = await outgoingTransferCount(cl.funder); // capped at 1000
      cl.infra = cl.funderOutgoing >= INFRA_DEGREE;
      if (cl.infra) {
        cl.infraReason = `high-degree funder (${cl.funderOutgoing}+ lifetime transfers)`;
      }
    } catch {
      cl.funderOutgoing = null;
      cl.infra = true; // unknown → never accuse
      cl.infraReason = 'funder degree unknown';
    }
  }
  const clusterHouse = new Set(
    clusters.filter((c) => !c.infra).flatMap((c) => c.members.map((m) => m.wallet)),
  );

  return { enabled: true, initialLp, funderOf, deployerFunded, clusters, clusterHouse, walked: targets.length };
}

// Classify every seller in the tape and compute the rake.
// Priority when a wallet is in several cohorts:
// first-block > deployer-funded > cluster > lp > repeat.
export function computeRake(tape, { firstBlock, lp, repeat, funding = { enabled: false } }) {
  const classify = (wallet) => {
    if (wallet === 'unattributed') return 'unlabeled'; // pruned tx — never cohorted
    if (firstBlock.wallets.has(wallet)) return 'first-block';
    if (funding.enabled && funding.deployerFunded.has(wallet)) return 'deployer-funded';
    if (funding.enabled && funding.clusterHouse?.has(wallet)) return 'cluster';
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

  const houseUsd = ['first-block', 'deployer-funded', 'cluster', 'lp', 'repeat'].reduce(
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
