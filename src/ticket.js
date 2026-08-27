// Your ticket: window-based framing only, never a causal "A paid B" claim.

const NEARBY_BLOCKS = 20; // ±20 Base blocks = ±40 seconds

export function buildTicket(tape, rake, wallet) {
  const w = wallet.toLowerCase();
  const mine = tape.swaps.filter((s) => s.trader === w);
  if (mine.length === 0) {
    return {
      status: 'NOT_IN_WINDOW',
      wallet: w,
      reason:
        'This wallet made no swaps in THIS pool during THIS window. A longer window may catch it; a buy routed through one of the token\'s other pools will not appear in this pool\'s tape.',
    };
  }

  const houseWallets = new Set();
  for (const key of ['first-block', 'deployer-funded', 'cluster', 'lp', 'repeat']) {
    for (const entry of rake.cohorts[key]?.walletList ?? []) houseWallets.add(entry.wallet);
  }

  const buys = mine.filter((s) => s.side === 'buy');
  const sells = mine.filter((s) => s.side === 'sell');

  const buyEvents = buys.map((b) => {
    const nearbyHouseSells = tape.swaps.filter(
      (s) =>
        s.side === 'sell' &&
        houseWallets.has(s.trader) &&
        Math.abs(s.block - b.block) <= NEARBY_BLOCKS &&
        s.trader !== w,
    );
    return {
      txHash: b.txHash,
      block: b.block,
      usd: b.usd,
      nearbyHouseSellUsd: nearbyHouseSells.reduce((t, s) => t + s.usd, 0),
      nearbyHouseSells: nearbyHouseSells
        .sort((a, x) => x.usd - a.usd)
        .slice(0, 5)
        .map((s) => ({ wallet: s.trader, usd: s.usd, txHash: s.txHash, block: s.block })),
    };
  });

  return {
    status: 'OK',
    wallet: w,
    windowRakePct: rake.rakePct,
    buys: { count: buys.length, usd: buys.reduce((t, s) => t + s.usd, 0) },
    sells: { count: sells.length, usd: sells.reduce((t, s) => t + s.usd, 0) },
    buyEvents,
    nearbyBlocks: NEARBY_BLOCKS,
  };
}
