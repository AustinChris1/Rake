'use client';

// Casino-floor ticker: the latest live rakes, straight from the public log.

import { useLogEvents } from '../lib/useLog.js';

const usd = (n) => '$' + Math.round(n).toLocaleString('en-US');

export default function TickerBar() {
  const { rows } = useLogEvents();
  if (!rows.length) return <div className="h-8 border-b border-noir-line" />;
  const text = rows.map((e) => `${e.symbol} raked ${e.rakePct}% of ${usd(e.usdIn)}`).join('   ✦   ');
  return (
    <div className="flex h-8 items-center overflow-hidden border-b border-noir-line bg-noir-950">
      <span className="z-10 flex h-full shrink-0 items-center gap-1.5 border-r border-noir-line bg-noir-900 px-3 font-display text-[10px] font-bold tracking-[0.2em] text-loss">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-loss" /> LIVE
      </span>
      <div className="ticker whitespace-nowrap font-mono text-[11px] uppercase tracking-wider text-cream-dim">
        <span className="px-6">{text}</span>
        <span className="px-6">{text}</span>
      </div>
    </div>
  );
}
