// RAKE — RPC layer: failover across public Base endpoints, chunked eth_getLogs,
// and a bounded-concurrency helper for per-tx lookups.

import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';
import { RPC_URLS } from './config.js';
import { alchemyRpcUrl } from './env.js';

// Alchemy (when a key is configured) goes first — highest reliability; public endpoints are fallback.
const urls = [alchemyRpcUrl(), ...RPC_URLS].filter(Boolean);
const clients = urls.map((url) =>
  createPublicClient({ chain: base, transport: http(url, { timeout: 20_000, retryCount: 0 }) }),
);

let cursor = 0;

// Try each RPC once, starting from a rotating cursor so load spreads across endpoints.
export async function withFailover(fn) {
  let lastErr;
  for (let i = 0; i < clients.length; i++) {
    const client = clients[(cursor + i) % clients.length];
    try {
      const res = await fn(client);
      cursor = (cursor + i) % clients.length;
      return res;
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}

// eth_getLogs over a large range, chunked. Halves the chunk size when an endpoint
// rejects the range, down to a floor, rotating endpoints on every failure.
export async function getLogsChunked({ address, topics, fromBlock, toBlock, onProgress }) {
  const logs = [];
  let chunk = 1800n;
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
      if (chunk <= 100n) throw err;
      chunk = chunk / 2n;
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
