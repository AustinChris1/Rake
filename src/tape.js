// RAKE — the tape: every swap in a bounded window of a token's top Base pool,
// decoded, attributed to the human behind it (UserOp sender for 4337 bundles,
// tx.from otherwise), and priced in USD from its own quote leg at execution hour.

import { withFailover, getLogsChunked } from './rpc.js';
import { fetchPairs, selectPool } from './dexscreener.js';
import { ALL_SWAP_TOPICS, normalizeSwap } from './decode.js';
import { buildTxAttribution, traderForLog } from './attribute.js';
import { wethHourlyCloses, priceAt } from './price.js';
import { BLOCKS_PER_HOUR, V4_POOL_MANAGER } from './config.js';

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

// A v4 "pool" is a 32-byte id inside the PoolManager singleton, not a contract.
const isV4Pool = (pool) => pool.length === 66;

// v4 orientation cannot come from token0() (no pool contract). It is resolved
// empirically: decode sample swaps under both hypotheses and keep the one whose
// implied price matches Dexscreener's priceNative — the hypotheses differ by many
// orders of magnitude, so the test is unambiguous. Refuses to guess on no match.
function resolveV4Orientation(rawLogs, { tokenDecimals, quoteDecimals, priceNative }) {
  const samples = rawLogs.slice(-5);
  const median = (xs) => xs.slice().sort((a, b) => a - b)[Math.floor(xs.length / 2)];
  for (const tokenIsToken0 of [true, false]) {
    const prices = [];
    for (const l of samples) {
      const norm = normalizeSwap({ topics: l.topics, data: l.data }, tokenIsToken0);
      if (!norm || norm.side === 'flat' || norm.tokenAmount === 0n) continue;
      const tokenAmt = Number(norm.tokenAmount) / 10 ** tokenDecimals;
      const quoteAmt = Number(norm.quoteAmount) / 10 ** quoteDecimals;
      if (tokenAmt > 0) prices.push(quoteAmt / tokenAmt);
    }
    if (prices.length && priceNative > 0) {
      const ratio = median(prices) / priceNative;
      if (ratio > 0.01 && ratio < 100) return tokenIsToken0;
    }
  }
  return null;
}

// Fetch, decode, price, and EOA-attribute every swap in [fromBlock, toBlock] for one pool.
// Reused for the main window, the previous window (repeat cohort), and the first-swaps scan.
// ctx.tokenIsToken0 === null means "v4, unresolved" — resolved here on first use and
// written back into ctx so cohort passes reuse it.
export async function fetchAttributedSwaps(ctx) {
  const { fromBlock, toBlock, log = () => {} } = ctx;
  const rawLogs = await getLogsChunked({
    address: ctx.logAddress,
    topics: ctx.topicFilter ? [ALL_SWAP_TOPICS, ctx.topicFilter] : [ALL_SWAP_TOPICS],
    fromBlock,
    toBlock,
    onProgress: (done, total, n) => log(`logs ${done}/${total} blocks, ${n} swaps`),
  });

  if (ctx.tokenIsToken0 === null && rawLogs.length > 0) {
    ctx.tokenIsToken0 = resolveV4Orientation(rawLogs, ctx);
    if (ctx.tokenIsToken0 === null) throw new Error('v4 pool orientation could not be verified against the pair price — refusing to guess.');
    log(`v4 orientation: token is currency${ctx.tokenIsToken0 ? '0' : '1'} (verified against pair price)`);
  }

  const { tokenIsToken0, tokenDecimals, quoteDecimals, quoteUsd } = ctx;
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
  if (txHashes.length) log(`attributing ${txHashes.length} transactions...`);
  const txMeta = await buildTxAttribution(txHashes, { log });
  for (const s of swaps) {
    s.trader = traderForLog(txMeta, s.txHash, s.logIndex);
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

  // 3. Pool orientation + decimals (onchain reads, cached per run).
  // v4 pools have no contract to ask — orientation resolves empirically below.
  const v4 = isV4Pool(pool);
  const [token0, tokenDecimals, quoteDecimals] = await Promise.all([
    v4 ? null : withFailover((c) => c.readContract({ address: pool, abi: POOL_ABI, functionName: 'token0' })),
    withFailover((c) => c.readContract({ address: token, abi: ERC20_ABI, functionName: 'decimals' })),
    withFailover((c) => c.readContract({ address: pair.quoteToken.address, abi: ERC20_ABI, functionName: 'decimals' })),
  ]);
  const tokenIsToken0 = v4 ? null : token0.toLowerCase() === tokenLc;

  // 4. Swaps: fetch, decode, price from own quote leg, attribute to the human
  const ctx = {
    pool,
    isV4: v4,
    logAddress: v4 ? V4_POOL_MANAGER : pool,
    topicFilter: v4 ? pool : null,
    tokenIsToken0,
    tokenDecimals,
    quoteDecimals,
    quoteUsd,
    priceNative: Number(pair.priceNative) || 0,
  };
  const runCtx = { ...ctx, fromBlock, toBlock, log };
  const swaps = await fetchAttributedSwaps(runCtx);
  ctx.tokenIsToken0 = runCtx.tokenIsToken0; // v4 orientation resolved during the fetch

  if (swaps.length === 0) {
    return { status: 'TOO_THIN', token, pool, ctx, window: { fromBlock: Number(fromBlock), toBlock: Number(toBlock), hours }, reason: 'No swaps in window.' };
  }

  // 5. Window timestamps (Base has a fixed 2s block time; we read the boundary blocks)
  const [firstBlock, lastBlock] = await Promise.all([
    withFailover((c) => c.getBlock({ blockNumber: fromBlock })),
    withFailover((c) => c.getBlock({ blockNumber: toBlock })),
  ]);

  // 5b. Reprice WETH-quoted swaps at their execution hour's WETH/USD close, so a
  //     long window doesn't get one end-of-window print. Falls back to the single
  //     current print — and the receipt says which method priced it.
  let pricing = quote.stable ? 'stable quote ($1)' : 'single current print';
  if (!quote.stable && quote.symbol === 'WETH') {
    const closes = await wethHourlyCloses(Math.max(6, hours + 4), quoteUsd);
    if (closes) {
      const lastTs = Number(lastBlock.timestamp);
      const toBlockNum = Number(toBlock);
      for (const s of swaps) {
        const ts = lastTs - (toBlockNum - s.block) * 2; // Base: fixed 2s blocks
        s.usd = s.quoteAmount * priceAt(closes, ts);
      }
      pricing = 'hourly WETH/USD close (GeckoTerminal)';
    }
    log(`pricing: ${pricing}`);
  }

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
    poolUrl: pair.url ?? null,
    pairCreatedAt: pair.pairCreatedAt ?? null,
    dex: `${pair.dexId}${pair.labels ? '/' + pair.labels.join(',') : ''}`,
    quote: { address: pair.quoteToken.address.toLowerCase(), symbol: quote.symbol, usd: quoteUsd, pricing },
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
