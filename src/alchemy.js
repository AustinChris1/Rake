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
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: reqId++, method, params }),
    });
    if (res.status === 429 && attempt < 5) {
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1))); // burst limit — back off and retry
      continue;
    }
    if (!res.ok) throw new Error(`Alchemy HTTP ${res.status}: ${(await res.text()).slice(0, 140)}`);
    const json = await res.json();
    if (json.error) throw new Error(`Alchemy: ${json.error.message}`);
    return json.result;
  }
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

// Recent inbound ERC-20 transfers to a wallet (newest first) — used to catch
// same-symbol/different-contract confusion when a ticket comes back empty.
export async function recentInboundTransfers(wallet, maxCount = 20) {
  const result = await alchemyRequest('alchemy_getAssetTransfers', [
    {
      toAddress: wallet,
      category: ['erc20'],
      order: 'desc',
      maxCount: '0x' + maxCount.toString(16),
      excludeZeroValue: true,
      withMetadata: true,
    },
  ]);
  return (result?.transfers ?? []).map((t) => ({
    asset: t.asset ?? null,
    address: t.rawContract?.address?.toLowerCase() ?? null,
    value: t.value ?? null,
    ts: t.metadata?.blockTimestamp ?? null,
    txHash: t.hash,
  }));
}

// Lifetime outgoing transfer count, capped at 1000 — enough to separate an operator
// wallet (tens of transfers) from exchange hot wallets and disperse bots that fund
// thousands of unrelated addresses.
export async function outgoingTransferCount(address) {
  const result = await alchemyRequest('alchemy_getAssetTransfers', [
    {
      fromAddress: address,
      category: ['external', 'erc20'],
      order: 'asc',
      maxCount: '0x3e8',
      excludeZeroValue: true,
      fromBlock: '0x0',
    },
  ]);
  return result?.transfers?.length ?? 0;
}

// Bounded, cached funding walk over a set of wallets with limited concurrency.
// Failures are counted and the first error is kept — a fully-failed walk must be
// reported as FAILED upstream, never passed off as "walked N sellers".
// Concurrency 2: getAssetTransfers is ~150 CU and the free tier sustains ~330 CU/s —
// two lanes ride just under the throttle instead of tripping 429 storms.
export async function walkFunders(wallets, { concurrency = 2, onProgress = () => {} } = {}) {
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
