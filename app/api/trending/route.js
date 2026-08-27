// Trending Base tokens for the one-click chips (GeckoTerminal).

export const runtime = 'nodejs';
export const revalidate = 120;

export async function GET() {
  try {
    const r = await fetch('https://api.geckoterminal.com/api/v2/networks/base/trending_pools', {
      headers: { Accept: 'application/json' },
      next: { revalidate: 120 },
    });
    const j = await r.json();
    const seen = new Set();
    const items = [];
    for (const p of j.data ?? []) {
      const address = (p.relationships?.base_token?.data?.id ?? '').replace('base_', '');
      const symbol = (p.attributes?.name ?? '').split('/')[0].trim();
      if (!address || seen.has(address) || address === '0x4200000000000000000000000000000000000006') continue;
      seen.add(address);
      items.push({ symbol, address, volH24: Math.round(p.attributes?.volume_usd?.h24 ?? 0) });
      if (items.length >= 8) break;
    }
    return Response.json(items);
  } catch {
    return Response.json([]);
  }
}
