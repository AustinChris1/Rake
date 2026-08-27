// RPC layer: failover across public Base endpoints, chunked eth_getLogs, bounded concurrency.

import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';
import { RPC_URLS } from './config.js';

// Deliberately no Alchemy here (free tier throttles bulk work); it serves funding walks only, via src/alchemy.js.
const clients = RPC_URLS.map((url) =>
  createPublicClient({
    chain: base,
    transport: http(url, { timeout: 20_000, retryCount: 0, batch: { batchSize: 10, wait: 16 } }),
  }),
);

let cursor = 0;
const coolUntil = new Array(clients.length).fill(0);

// Rotating failover; throttled endpoints (403/429) cool for 30s; one retry pass before throwing.
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

// Chunked eth_getLogs; halves the chunk on range rejection down to a floor.
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
      if (chunk <= 45n) throw err; // below every known endpoint's range cap - give up
      chunk = chunk / 2n < 45n ? 45n : chunk / 2n;
    }
  }
  return logs;
}

// getTransaction with failover; null when all endpoints fail (pruned tx). Null means unattributed, never guessed.
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
