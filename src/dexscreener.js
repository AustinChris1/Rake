// Pool discovery via Dexscreener's free API; quote USD derives from the pair's own priceUsd/priceNative.

import { DEXSCREENER_TOKEN_PAIRS, QUOTE_TOKENS } from './config.js';

export async function fetchPairs(token) {
  const res = await fetch(DEXSCREENER_TOKEN_PAIRS(token));
  if (!res.ok) throw new Error(`Dexscreener ${res.status} for ${token}`);
  const pairs = await res.json();
  if (!Array.isArray(pairs)) throw new Error('Unexpected Dexscreener response shape');
  return pairs.filter((p) => p.chainId === 'base');
}

// Pick the pool: priceable quote token, highest 24h volume; 'OK' or 'UNPRICEABLE'.
export function selectPool(pairs, { pairAddress } = {}) {
  let candidates = pairs.filter((p) => {
    const q = QUOTE_TOKENS[p.quoteToken?.address?.toLowerCase()];
    // 40-hex = pool contract; 64-hex = Uniswap v4 pool id. Anything else is unreadable.
    return q && /^0x([0-9a-fA-F]{40}|[0-9a-fA-F]{64})$/.test(p.pairAddress ?? '');
  });
  if (pairAddress) {
    candidates = candidates.filter(
      (p) => p.pairAddress.toLowerCase() === pairAddress.toLowerCase(),
    );
  }
  if (candidates.length === 0) return { status: 'UNPRICEABLE', pair: null };

  candidates.sort((a, b) => (b.volume?.h24 ?? 0) - (a.volume?.h24 ?? 0));
  const pair = candidates[0];
  const quote = QUOTE_TOKENS[pair.quoteToken.address.toLowerCase()];

  const priceUsd = Number(pair.priceUsd);
  const priceNative = Number(pair.priceNative);
  const quoteUsd = quote.stable
    ? 1
    : priceUsd > 0 && priceNative > 0
      ? priceUsd / priceNative
      : null;
  if (quoteUsd === null) return { status: 'UNPRICEABLE', pair: null };

  return { status: 'OK', pair, quote, quoteUsd };
}
