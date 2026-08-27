// Who is the human behind a log: UserOp sender for ERC-4337 bundles, tx.from otherwise.

import { keccak256, toBytes } from 'viem';
import { withFailover, getTransactionSafe, mapLimit } from './rpc.js';

export const ENTRYPOINTS = new Set([
  '0x5ff137d4b0fdcd49dca30c7cf57e578a026d2789', // EntryPoint v0.6
  '0x0000000071727de22e5e9d8baf0edac6f37da032', // EntryPoint v0.7
  '0x4337084d9e255ff0702461cf8895ce9e3b5ff108', // EntryPoint v0.8
]);

const USEROP_EVENT_TOPIC = keccak256(
  toBytes('UserOperationEvent(bytes32,address,address,uint256,bool,uint256,uint256)'),
);

// Attribution metadata per tx hash; EntryPoint txs also collect UserOperationEvents.
export async function buildTxAttribution(txHashes, { log = () => {} } = {}) {
  const meta = {};
  let unattributed = 0;
  let bundles = 0;
  // High concurrency is safe here: the transport batches these into few HTTP calls
  // (10 per POST), so 100 workers ≈ 10 batch requests in flight.
  await mapLimit(txHashes, 100, async (hash) => {
    const tx = await getTransactionSafe(hash);
    if (!tx) {
      unattributed++;
      return;
    }
    const to = tx.to ? tx.to.toLowerCase() : null;
    const m = { from: tx.from.toLowerCase(), router: to, userOps: null };
    if (to && ENTRYPOINTS.has(to)) {
      bundles++;
      try {
        const receipt = await withFailover((c) => c.getTransactionReceipt({ hash }));
        m.userOps = receipt.logs
          .filter((l) => l.topics?.[0] === USEROP_EVENT_TOPIC && l.topics.length > 2)
          .map((l) => ({ logIndex: Number(l.logIndex), sender: ('0x' + l.topics[2].slice(26)).toLowerCase() }))
          .sort((a, b) => a.logIndex - b.logIndex);
      } catch {
        // receipt unavailable - traderForLog falls back to tx.from
      }
    }
    meta[hash] = m;
  });
  if (bundles > 0) log(`${bundles} ERC-4337 bundle txs - attributing to UserOp senders, not bundlers`);
  if (unattributed > 0) log(`${unattributed} txs unattributable (pruned on all RPCs) - kept in totals, excluded from cohorts`);
  return meta;
}

// A UserOp's logs precede its UserOperationEvent, so the log's owner is the first event after it.
export function traderForLog(meta, txHash, logIndex) {
  const m = meta[txHash];
  if (!m) return 'unattributed';
  if (m.userOps?.length) {
    const op = m.userOps.find((u) => u.logIndex > logIndex);
    if (op) return op.sender;
  }
  return m.from;
}
