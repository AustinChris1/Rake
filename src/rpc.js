// RAKE — RPC layer: failover across public Base endpoints, chunked eth_getLogs,
// and a bounded-concurrency helper for per-tx lookups.

import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';
import { RPC_URLS } from './config.js';

// Deliberately NO Alchemy here: its free tier throttles at ~330 CU/s and caps
// eth_getLogs at a 10-block range, so bulk scans and tx fetches ride the public
// endpoints (measured ~3-5x faster at tape scale). Alchemy serves only what public
// RPCs cannot: alchemy_getAssetTransfers funding walks, via src/alchemy.js.
// JSON-RPC batching: tx-attribution fans out thousands of small calls; batching
// collapses them into few HTTP round-trips (batch kept small — some hosts cap it).
const clients = RPC_URLS.map((url) =>
  createPublicClient({
    chain: base,
    transport: http(url, { timeout: 20_000, retryCount: 0, batch: { batchSize: 10, wait: 16 } }),
  }),
);

let cursor = 0;
const coolUntil = new Array(clients.length).fill(0);

// Try each RPC starting from a rotating cursor. An endpoint answering with a
// throttle/ban (403/429) is cooled for 30s so we stop hammering it. If the whole
// rotation fails, pause, clear cooldowns, and try one last pass before throwing.
export async function withFailover(fn) {
  let lastErr;
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < clients.length; i++) {
      const idx = (cursor + i) % clients.length;
      if (Date.now() < coolUntil[idx]) continue;
      try {
        const res = await fn(clients[idx]);
        cursor = idx;
        return res;
      } catch (err) {
        lastErr = err;
        if (/403|429|rate.?limit|forbidden|too many/i.test(String(err?.message ?? ''))) {
          coolUntil[idx] = Date.now() + 30_000;
        }
      }
    }
    await new Promise((r) => setTimeout(r, 2500));
    coolUntil.fill(0);
  }
  throw lastErr;
}

// eth_getLogs over a large range, chunked. Halves the chunk size when an endpoint
// rejects the range, down to a floor, rotating endpoints on every failure.
export async function getLogsChunked({ address, topics, fromBlock, toBlock, onProgress }) {
  const logs = [];
  let chunk = 4800n; // publicnode/llamarpc accept wide ranges; auto-halves on rejection
  let start = fromBlock;
  while (start <= toBlock) {
    const end = start + chunk - 1n > toBlock ? toBlock : start + chunk - 1n;
    try {
      const part = await withFailover((c) =>
        c.request({
          method: 'eth_getLogs',
          params: [
            {
              address,
              topics,
              fromBlock: `0x${start.toString(16)}`,
              toBlock: `0x${end.toString(16)}`,
            },
          ],
        }),
      );
      logs.push(...part);
      onProgress?.(end - fromBlock + 1n, toBlock - fromBlock + 1n, logs.length);
      start = end + 1n;
    } catch (err) {
      if (chunk <= 45n) throw err; // below every known endpoint's range cap — give up
      chunk = chunk / 2n < 45n ? 45n : chunk / 2n;
    }
  }
  return logs;
}

// getTransaction with failover; returns null instead of throwing when no endpoint
// can serve the tx (some free RPCs prune old transaction data). Callers must treat
// null as "unattributed", never guess.
export async function getTransactionSafe(hash) {
  try {
    return await withFailover((c) => c.getTransaction({ hash }));
  } catch {
    return null;
  }
}

// Run tasks with bounded concurrency; returns results in order.
export async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
