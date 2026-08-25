// RAKE — pool discovery via Dexscreener's free token-pairs API (no key, 300 rpm).
// The quote token's USD price is derived from the pair's own priceUsd/priceNative,
// so every USD figure traces to the same source as the pool itself.

import { DEXSCREENER_TOKEN_PAIRS, QUOTE_TOKENS } from './config.js';

export async function fetchPairs(token) {
  const res = await fetch(DEXSCREENER_TOKEN_PAIRS(token));
  if (!res.ok) throw new Error(`Dexscreener ${res.status} for ${token}`);
  const pairs = await res.json();
  if (!Array.isArray(pairs)) throw new Error('Unexpected Dexscreener response shape');
  return pairs.filter((p) => p.chainId === 'base');
}

// Pick the pool to read: priceable quote token, highest 24h volume.
// Returns { pair, quote, quoteUsd, status } — status 'OK' or 'UNPRICEABLE'.
export function selectPool(pairs, { pairAddress } = {}) {
  let candidates = pairs.filter((p) => {
    const q = QUOTE_TOKENS[p.quoteToken?.address?.toLowerCase()];
    return q && p.pairAddress;
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
