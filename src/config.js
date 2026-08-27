// RAKE - configuration: chain endpoints and known quote tokens on Base.

// Order matters: publicnode is fastest and batch-friendly; base.org caps batches at 10; llamarpc excluded (serves HTML).
export const RPC_URLS = [
  'https://base.publicnode.com',
  'https://mainnet.base.org',
  'https://1rpc.io/base',
];

// Base mainnet quote tokens we can price. Everything else => pair is skipped as UNPRICEABLE.
export const QUOTE_TOKENS = {
  '0x4200000000000000000000000000000000000006': { symbol: 'WETH', stable: false },
  '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913': { symbol: 'USDC', stable: true },
  '0xd9aaec86b65d86f6a7b5b1b0c42ffa531710b6ca': { symbol: 'USDbC', stable: true },
  '0x50c5725949a6f0c72e6c4a641f24049a917db0cb': { symbol: 'DAI', stable: true },
  '0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf': { symbol: 'cbBTC', stable: false },
};

// Uniswap v4 singleton on Base: pools are 32-byte ids inside this contract, not contracts.
export const V4_POOL_MANAGER = '0x498581fF718922c3f8e6A244956aF099B2652b2b';

export const BASE_BLOCK_TIME_S = 2; // Base mainnet: fixed 2s block time
export const BLOCKS_PER_HOUR = 1800n;

export const DEXSCREENER_TOKEN_PAIRS = (token) =>
  `https://api.dexscreener.com/token-pairs/v1/base/${token}`;
