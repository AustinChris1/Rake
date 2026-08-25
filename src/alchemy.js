// RAKE — funding walks. Native ETH transfers emit no logs, so "who funded this
// wallet first" cannot come from eth_getLogs. Alchemy's alchemy_getAssetTransfers
// (external + internal categories) answers it in one call per wallet.
// Without a key, every funding-based cohort reports DISABLED — never guessed.

import { alchemyRpcUrl } from './env.js';

const cache = new Map();
let reqId = 1;

export const fundingEnabled = () => Boolean(alchemyRpcUrl());

async function alchemyRequest(method, params) {
  const url = alchemyRpcUrl();
  if (!url) throw new Error('ALCHEMY_API_KEY not set');
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: reqId++, method, params }),
  });
  if (!res.ok) throw new Error(`Alchemy HTTP ${res.status}`);
  const json = await res.json();
  if (json.error) throw new Error(`Alchemy: ${json.error.message}`);
  return json.result;
}

// First inbound value transfer (ETH external/internal or ERC-20) ever received
// by `address` on Base: { funder, txHash, category, asset } or null if none found.
export async function firstFunder(address) {
  const key = address.toLowerCase();
  if (cache.has(key)) return cache.get(key);
  // Note: the 'internal' category is not supported on Base — external (native ETH
  // from an EOA) + erc20 cover the funding paths we can see.
  const result = await alchemyRequest('alchemy_getAssetTransfers', [
    {
      toAddress: address,
      category: ['external', 'erc20'],
      order: 'asc',
      maxCount: '0x1',
      excludeZeroValue: true,
      fromBlock: '0x0',
    },
  ]);
  const t = result?.transfers?.[0] ?? null;
  const out = t
    ? { funder: t.from.toLowerCase(), txHash: t.hash, category: t.category, asset: t.asset ?? null }
    : null;
  cache.set(key, out);
  return out;
}

// Bounded, cached funding walk over a set of wallets with limited concurrency.
// Failures are counted and the first error is kept — a fully-failed walk must be
// reported as FAILED upstream, never passed off as "walked N sellers".
export async function walkFunders(wallets, { concurrency = 4, onProgress = () => {} } = {}) {
  const list = [...wallets];
  const out = {};
  let next = 0;
  let done = 0;
  let failed = 0;
  let firstError = null;
  async function worker() {
    while (next < list.length) {
      const w = list[next++];
      try {
        out[w] = await firstFunder(w);
      } catch (err) {
        out[w] = undefined; // unknown, not guessed
        failed++;
        firstError ??= err.message;
      }
      onProgress(++done, list.length);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, list.length) }, worker));
  return { funderOf: out, failed, firstError };
}
