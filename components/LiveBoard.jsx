'use client';

// Live extraction leaderboard, read straight from the public GitHub log the agent
// commits hourly. A ticker of real receipts plus a ranked table with GSAP reveals.

import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useGSAP } from '@gsap/react';
import { ExternalLink, Radio } from 'lucide-react';
import { LOG_RAW_URL, GITHUB_URL } from '../lib/links.js';

gsap.registerPlugin(ScrollTrigger, useGSAP);

const usd = (n) => '$' + Math.round(n).toLocaleString('en-US');

export default function LiveBoard() {
  const [rows, setRows] = useState([]);
  const [checked, setChecked] = useState(0);
  const scope = useRef(null);

  useEffect(() => {
    fetch(LOG_RAW_URL)
      .then((r) => r.text())
      .then((text) => {
        const events = text.trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
        const latest = {};
        for (const e of events) latest[e.token] = e; // chronological file, last write wins
        setChecked(events.filter((e) => e.checked).length);
        setRows(
          Object.values(latest)
            .filter((e) => e.status === 'OK' && e.rakePct != null)
            .sort((a, b) => b.rakePct - a.rakePct)
            .slice(0, 10),
        );
      })
      .catch(() => {});
  }, []);

  useGSAP(
    () => {
      gsap.from('.board-row', {
        opacity: 0,
        x: -24,
        stagger: 0.06,
        duration: 0.5,
        ease: 'power2.out',
        scrollTrigger: { trigger: scope.current, start: 'top 75%', once: true },
      });
    },
    { scope, dependencies: [rows.length] },
  );

  if (!rows.length) return null;
  const ticker = rows.map((e) => `${e.symbol} ${e.rakePct}% of ${usd(e.usdIn)}`).join('  ·  ');

  return (
    <section id="board" ref={scope} className="mx-auto mt-28 max-w-5xl scroll-mt-24 px-5">
      <h2 className="flex items-center gap-2 font-display text-2xl font-bold tracking-wide text-cream">
        <Radio className="h-5 w-5 animate-pulse text-loss" />
        The table, <span className="text-gold-400">live</span>
      </h2>
      <p className="mt-3 max-w-[68ch] text-cream-dim">
        The agent rakes Base's trending tokens every hour and commits every event to a public,
        tamper-evident log. This is the latest reading per token - the most extractive candles on Base right now.
      </p>

      {/* live receipts ticker */}
      <div className="mt-6 overflow-hidden rounded-lg border border-noir-line bg-noir-950 py-2">
        <div className="ticker whitespace-nowrap font-mono text-[13px] text-gold-400">
          <span className="px-8">{ticker}</span>
          <span className="px-8">{ticker}</span>
        </div>
      </div>

      <div className="mt-4 overflow-x-auto rounded-xl border border-noir-line bg-noir-900">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-noir-line text-left text-cream-dim">
              <th className="px-4 py-2.5 font-medium">token</th>
              <th className="px-4 py-2.5 text-right font-medium">rake (1h)</th>
              <th className="px-4 py-2.5 text-right font-medium">inflow</th>
              <th className="px-4 py-2.5 text-right font-medium">to the house</th>
              <th className="px-4 py-2.5 font-medium">receipt</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => (
              <tr key={e.token} className="board-row border-b border-noir-line/50 last:border-0">
                <td className="px-4 py-2.5 font-semibold text-cream">{e.symbol}</td>
                <td className={`px-4 py-2.5 text-right font-bold ${e.rakePct >= 50 ? 'text-loss' : e.rakePct >= 20 ? 'text-gold-400' : 'text-win'}`}>
                  {e.rakePct}%
                </td>
                <td className="px-4 py-2.5 text-right text-cream-dim">{usd(e.usdIn)}</td>
                <td className="px-4 py-2.5 text-right text-cream-dim">{usd(e.houseUsd)}</td>
                <td className="px-4 py-2.5">
                  <a href={`/?token=${e.token}&hours=1`} className="text-gold-400 underline decoration-dotted underline-offset-2 hover:decoration-solid">
                    rake it <ExternalLink className="inline h-3 w-3" />
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-cream-dim">
        {checked > 0 ? `${checked} events have completed their 12h self-check. ` : ''}Full history and the self-check split:{' '}
        <a className="text-gold-400 underline decoration-dotted underline-offset-2" href={`${GITHUB_URL}/blob/main/log/LEADERBOARD.md`} target="_blank" rel="noopener noreferrer">
          the public log
        </a>{' '}
        - published whichever way it comes out.
      </p>
    </section>
  );
}
