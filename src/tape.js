// RAKE — the tape: every swap in a bounded window of a token's top Base pool,
// decoded, attributed to the transaction's EOA, and priced in USD from its own quote leg.

import { withFailover, getLogsChunked, getTransactionSafe, mapLimit } from './rpc.js';
import { fetchPairs, selectPool } from './dexscreener.js';
import { ALL_SWAP_TOPICS, normalizeSwap } from './decode.js';
import { BLOCKS_PER_HOUR } from './config.js';

const ERC20_ABI = [
  { type: 'function', name: 'decimals', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint8' }] },
  { type: 'function', name: 'symbol', stateMutability: 'view', inputs: [], outputs: [{ type: 'string' }] },
];
const POOL_ABI = [
  { type: 'function', name: 'token0', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
];

function toUsd(rawAmount, decimals, unitUsd) {
  return (Number(rawAmount) / 10 ** decimals) * unitUsd;
}

// Fetch, decode, price, and EOA-attribute every swap in [fromBlock, toBlock] for one pool.
// Reused for the main window, the previous window (repeat cohort), and the first-swaps scan.
export async function fetchAttributedSwaps({
  pool, tokenIsToken0, tokenDecimals, quoteDecimals, quoteUsd, fromBlock, toBlock, log = () => {},
}) {
  const rawLogs = await getLogsChunked({
    address: pool,
    topics: [ALL_SWAP_TOPICS],
    fromBlock,
    toBlock,
    onProgress: (done, total, n) => log(`logs ${done}/${total} blocks, ${n} swaps`),
  });

  const swaps = [];
  for (const l of rawLogs) {
    const norm = normalizeSwap({ topics: l.topics, data: l.data }, tokenIsToken0);
    if (!norm || norm.side === 'flat') continue;
    swaps.push({
      txHash: l.transactionHash,
      logIndex: parseInt(l.logIndex, 16),
      block: parseInt(l.blockNumber, 16),
      amm: norm.def.kind,
      side: norm.side,
      tokenAmount: Number(norm.tokenAmount) / 10 ** tokenDecimals,
      quoteAmount: Number(norm.quoteAmount) / 10 ** quoteDecimals,
      usd: toUsd(norm.quoteAmount, quoteDecimals, quoteUsd),
    });
  }

  const txHashes = [...new Set(swaps.map((s) => s.txHash))];
  if (txHashes.length) log(`attributing ${txHashes.length} transactions to EOAs...`);
  const txMeta = {};
  let unattributed = 0;
  await mapLimit(txHashes, 6, async (hash) => {
    const tx = await getTransactionSafe(hash);
    if (tx) txMeta[hash] = { from: tx.from.toLowerCase(), router: tx.to ? tx.to.toLowerCase() : null };
    else unattributed++;
  });
  if (unattributed > 0) log(`${unattributed} txs unattributable (pruned on all RPCs) — kept in totals, excluded from cohorts`);
  for (const s of swaps) {
    s.trader = txMeta[s.txHash]?.from ?? 'unattributed';
    s.router = txMeta[s.txHash]?.router ?? null;
  }
  swaps.sort((a, b) => a.block - b.block || a.logIndex - b.logIndex);
  return swaps;
}

export async function buildTape(token, { hours = 4, pairAddress, log = () => {} } = {}) {
  const tokenLc = token.toLowerCase();

  // 1. Pool discovery
  const pairs = await fetchPairs(token);
  const sel = selectPool(pairs, { pairAddress });
  if (sel.status !== 'OK') {
    return { status: 'UNPRICEABLE', token, reason: 'No pool with a priceable quote token on Base.' };
  }
  const { pair, quote, quoteUsd } = sel;
  const pool = pair.pairAddress;
  log(`pool ${pool} (${pair.dexId}${pair.labels ? '/' + pair.labels.join(',') : ''}) quote=${quote.symbol} @ $${quoteUsd.toFixed(2)}`);

  // 2. Window
  const latest = await withFailover((c) => c.getBlockNumber());
  const fromBlock = latest - BigInt(Math.round(hours * Number(BLOCKS_PER_HOUR)));
  const toBlock = latest;

  // 3. Pool orientation + decimals (onchain reads, cached per run)
  const [token0, tokenDecimals, quoteDecimals] = await Promise.all([
    withFailover((c) => c.readContract({ address: pool, abi: POOL_ABI, functionName: 'token0' })),
    withFailover((c) => c.readContract({ address: token, abi: ERC20_ABI, functionName: 'decimals' })),
    withFailover((c) => c.readContract({ address: pair.quoteToken.address, abi: ERC20_ABI, functionName: 'decimals' })),
  ]);
  const tokenIsToken0 = token0.toLowerCase() === tokenLc;

  // 4. Swaps: fetch, decode, price from own quote leg, attribute to tx.from
  const ctx = { pool, tokenIsToken0, tokenDecimals, quoteDecimals, quoteUsd };
  const swaps = await fetchAttributedSwaps({ ...ctx, fromBlock, toBlock, log });

  if (swaps.length === 0) {
    return { status: 'TOO_THIN', token, pool, ctx, window: { fromBlock: Number(fromBlock), toBlock: Number(toBlock), hours }, reason: 'No swaps in window.' };
  }

  // 5. Window timestamps (Base has a fixed 2s block time; we read the boundary blocks)
  const [firstBlock, lastBlock] = await Promise.all([
    withFailover((c) => c.getBlock({ blockNumber: fromBlock })),
    withFailover((c) => c.getBlock({ blockNumber: toBlock })),
  ]);

  // 6. Aggregate
  const buys = swaps.filter((s) => s.side === 'buy');
  const sells = swaps.filter((s) => s.side === 'sell');
  const usdIn = buys.reduce((t, s) => t + s.usd, 0);
  const usdOut = sells.reduce((t, s) => t + s.usd, 0);

  const byTrader = (list) => {
    const m = {};
    for (const s of list) {
      m[s.trader] ??= { usd: 0, swaps: 0, txs: new Set() };
      m[s.trader].usd += s.usd;
      m[s.trader].swaps += 1;
      m[s.trader].txs.add(s.txHash);
    }
    return Object.entries(m)
      .map(([trader, v]) => ({ trader, usd: v.usd, swaps: v.swaps, txs: [...v.txs] }))
      .sort((a, b) => b.usd - a.usd);
  };

  return {
    status: swaps.length < 10 ? 'TOO_THIN' : 'OK',
    ctx, // pool read context, reused by the cohort engine
    token: tokenLc,
    tokenSymbol: pair.baseToken?.symbol,
    pool,
    dex: `${pair.dexId}${pair.labels ? '/' + pair.labels.join(',') : ''}`,
    quote: { address: pair.quoteToken.address.toLowerCase(), symbol: quote.symbol, usd: quoteUsd },
    window: {
      hours,
      fromBlock: Number(fromBlock),
      toBlock: Number(toBlock),
      fromTime: new Date(Number(firstBlock.timestamp) * 1000).toISOString(),
      toTime: new Date(Number(lastBlock.timestamp) * 1000).toISOString(),
    },
    totals: {
      swaps: swaps.length,
      buys: buys.length,
      sells: sells.length,
      usdIn,
      usdOut,
      uniqueBuyers: new Set(buys.map((s) => s.trader)).size,
      uniqueSellers: new Set(sells.map((s) => s.trader)).size,
    },
    topSellers: byTrader(sells).slice(0, 10),
    topBuyers: byTrader(buys).slice(0, 10),
    swaps,
  };
}
