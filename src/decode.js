// RAKE — swap event decoding. The decoder for each log is chosen by its topic0,
// so a pool never has to be classified ahead of time: the event signature is the truth.

import { keccak256, toBytes, decodeEventLog } from 'viem';

const DEFS = [
  {
    kind: 'uniswap-v2',
    signature: 'Swap(address,uint256,uint256,uint256,uint256,address)',
    abi: {
      type: 'event',
      name: 'Swap',
      inputs: [
        { name: 'sender', type: 'address', indexed: true },
        { name: 'amount0In', type: 'uint256', indexed: false },
        { name: 'amount1In', type: 'uint256', indexed: false },
        { name: 'amount0Out', type: 'uint256', indexed: false },
        { name: 'amount1Out', type: 'uint256', indexed: false },
        { name: 'to', type: 'address', indexed: true },
      ],
    },
  },
  {
    // Solidly-lineage pools: Aerodrome volatile/stable (Velodrome v2 fork)
    kind: 'solidly',
    signature: 'Swap(address,address,uint256,uint256,uint256,uint256)',
    abi: {
      type: 'event',
      name: 'Swap',
      inputs: [
        { name: 'sender', type: 'address', indexed: true },
        { name: 'to', type: 'address', indexed: true },
        { name: 'amount0In', type: 'uint256', indexed: false },
        { name: 'amount1In', type: 'uint256', indexed: false },
        { name: 'amount0Out', type: 'uint256', indexed: false },
        { name: 'amount1Out', type: 'uint256', indexed: false },
      ],
    },
  },
  {
    // Uniswap v3 and Aerodrome Slipstream (CL) share this signature
    kind: 'uniswap-v3',
    signature: 'Swap(address,address,int256,int256,uint160,uint128,int24)',
    abi: {
      type: 'event',
      name: 'Swap',
      inputs: [
        { name: 'sender', type: 'address', indexed: true },
        { name: 'recipient', type: 'address', indexed: true },
        { name: 'amount0', type: 'int256', indexed: false },
        { name: 'amount1', type: 'int256', indexed: false },
        { name: 'sqrtPriceX96', type: 'uint160', indexed: false },
        { name: 'liquidity', type: 'uint128', indexed: false },
        { name: 'tick', type: 'int24', indexed: false },
      ],
    },
  },
  {
    // Uniswap v4 singleton: topic1 is the pool id. Amounts are USER-perspective
    // (positive = user received from the pool) — the inverse of v3. Verified
    // on-chain: a sell (token Transfer TO PoolManager) logs a negative token delta.
    kind: 'uniswap-v4',
    signature: 'Swap(bytes32,address,int128,int128,uint160,uint128,int24,uint24)',
    abi: {
      type: 'event',
      name: 'Swap',
      inputs: [
        { name: 'id', type: 'bytes32', indexed: true },
        { name: 'sender', type: 'address', indexed: true },
        { name: 'amount0', type: 'int128', indexed: false },
        { name: 'amount1', type: 'int128', indexed: false },
        { name: 'sqrtPriceX96', type: 'uint160', indexed: false },
        { name: 'liquidity', type: 'uint128', indexed: false },
        { name: 'tick', type: 'int24', indexed: false },
        { name: 'fee', type: 'uint24', indexed: false },
      ],
    },
  },
  {
    kind: 'pancake-v3',
    signature: 'Swap(address,address,int256,int256,uint160,uint128,int24,uint128,uint128)',
    abi: {
      type: 'event',
      name: 'Swap',
      inputs: [
        { name: 'sender', type: 'address', indexed: true },
        { name: 'recipient', type: 'address', indexed: true },
        { name: 'amount0', type: 'int256', indexed: false },
        { name: 'amount1', type: 'int256', indexed: false },
        { name: 'sqrtPriceX96', type: 'uint160', indexed: false },
        { name: 'liquidity', type: 'uint128', indexed: false },
        { name: 'tick', type: 'int24', indexed: false },
        { name: 'protocolFeesToken0', type: 'uint128', indexed: false },
        { name: 'protocolFeesToken1', type: 'uint128', indexed: false },
      ],
    },
  },
];

export const TOPIC_MAP = Object.fromEntries(
  DEFS.map((d) => [keccak256(toBytes(d.signature)), d]),
);

export const ALL_SWAP_TOPICS = Object.keys(TOPIC_MAP);

// Decode a raw log into a normalized swap from the target token's perspective:
// { side: 'buy'|'sell', tokenAmount, quoteAmount } (raw bigints), or null if not a swap topic.
export function normalizeSwap(log, tokenIsToken0) {
  const def = TOPIC_MAP[log.topics[0]];
  if (!def) return null;
  const { args } = decodeEventLog({ abi: [def.abi], data: log.data, topics: log.topics });

  let tokenIn, tokenOut, quoteIn, quoteOut;
  if (def.kind === 'uniswap-v2' || def.kind === 'solidly') {
    const a0In = args.amount0In, a1In = args.amount1In, a0Out = args.amount0Out, a1Out = args.amount1Out;
    tokenIn = tokenIsToken0 ? a0In : a1In;
    tokenOut = tokenIsToken0 ? a0Out : a1Out;
    quoteIn = tokenIsToken0 ? a1In : a0In;
    quoteOut = tokenIsToken0 ? a1Out : a0Out;
  } else {
    // v3-style: amounts are pool-perspective deltas; positive = pool received.
    // v4 amounts are user-perspective — negate to get pool-perspective.
    const sign = def.kind === 'uniswap-v4' ? -1n : 1n;
    const tokenDelta = sign * (tokenIsToken0 ? args.amount0 : args.amount1);
    const quoteDelta = sign * (tokenIsToken0 ? args.amount1 : args.amount0);
    tokenIn = tokenDelta > 0n ? tokenDelta : 0n;
    tokenOut = tokenDelta < 0n ? -tokenDelta : 0n;
    quoteIn = quoteDelta > 0n ? quoteDelta : 0n;
    quoteOut = quoteDelta < 0n ? -quoteDelta : 0n;
  }

  const netToken = tokenIn - tokenOut;
  if (netToken === 0n) return { def, side: 'flat', tokenAmount: 0n, quoteAmount: 0n };
  const side = netToken > 0n ? 'sell' : 'buy'; // pool received token => someone sold it
  const tokenAmount = netToken > 0n ? netToken : -netToken;
  // USD is always measured on the quote leg of this very swap:
  // sell => quote left the pool toward the seller; buy => quote entered the pool.
  const quoteAmount = side === 'sell' ? quoteOut : quoteIn;
  return { def, side, tokenAmount, quoteAmount };
}
