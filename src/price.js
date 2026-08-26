// RAKE — quote-asset USD pricing. A stable quote is $1. WETH is priced per HOUR of
// execution from GeckoTerminal's free OHLC on Base's deepest WETH/USDC pool, so a
// 24h window doesn't get one end-of-window print applied to old swaps. If the OHLC
// fetch fails, the single current print is used and the receipt SAYS so.

const WETH_USDC_POOL = '0xd0b53D9277642d899DF5C87A3966A349A798F224'; // Uniswap v3 WETH/USDC 0.05% on Base

async function fetchCloses(limit, side) {
  const r = await fetch(
    `https://api.geckoterminal.com/api/v2/networks/base/pools/${WETH_USDC_POOL}/ohlcv/hour?limit=${limit}&token=${side}`,
    { headers: { Accept: 'application/json' } },
  );
  if (!r.ok) return null;
  const list = (await r.json())?.data?.attributes?.ohlcv_list;
  if (!Array.isArray(list) || list.length === 0) return null;
  // rows: [ts, open, high, low, close, volume], newest first — keep ascending
  return list
    .map(([ts, , , , close]) => ({ ts: Number(ts), close: Number(close) }))
    .filter((x) => x.ts > 0 && x.close > 0)
    .sort((a, b) => a.ts - b.ts);
}

// The OHLC series prices the pool's BASE token, and which side is WETH is an API
// detail we refuse to assume: both orientations are tried, and only a series whose
// latest close agrees with the pair's own current WETH print (within 25%) is used.
export async function wethHourlyCloses(limit, expectedUsd) {
  for (const side of ['base', 'quote']) {
    try {
      const closes = await fetchCloses(limit, side);
      if (!closes) continue;
      const latest = closes[closes.length - 1].close;
      if (expectedUsd > 0 && Math.abs(latest / expectedUsd - 1) <= 0.25) return closes;
    } catch {
      // try the other side / fall through to null
    }
  }
  return null;
}

// Close of the latest hour at-or-before ts; earliest close if ts predates the series.
export function priceAt(closes, ts) {
  let best = closes[0].close;
  for (const c of closes) {
    if (c.ts <= ts) best = c.close;
    else break;
  }
  return best;
}
