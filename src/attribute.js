// RAKE — who is the human behind a log?
// Normal tx: tx.from. ERC-4337 bundle (tx.to = EntryPoint): tx.from is the BUNDLER,
// not the trader — the UserOperationEvent that follows the log in the receipt names
// the smart account that actually acted. Billing the bundler would be naming the
// mailman for the letter.

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

// Fetch attribution metadata for a set of tx hashes. For EntryPoint txs the receipt
// is also read to collect the bundle's UserOperationEvents (logIndex + sender).
export async function buildTxAttribution(txHashes, { log = () => {} } = {}) {
  const meta = {};
  let unattributed = 0;
  let bundles = 0;
  await mapLimit(txHashes, 6, async (hash) => {
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
        // receipt unavailable — traderForLog falls back to tx.from
      }
    }
    meta[hash] = m;
  });
  if (bundles > 0) log(`${bundles} ERC-4337 bundle txs — attributing to UserOp senders, not bundlers`);
  if (unattributed > 0) log(`${unattributed} txs unattributable (pruned on all RPCs) — kept in totals, excluded from cohorts`);
  return meta;
}

// The trader behind one specific log. In a 4337 bundle, each UserOp's logs precede
// its UserOperationEvent, so the log's owner is the first UserOp event after it.
export function traderForLog(meta, txHash, logIndex) {
  const m = meta[txHash];
  if (!m) return 'unattributed';
  if (m.userOps?.length) {
    const op = m.userOps.find((u) => u.logIndex > logIndex);
    if (op) return op.sender;
  }
  return m.from;
}
