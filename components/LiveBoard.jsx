'use client';

// The floor, live: latest reading per trending token from the hourly public log.

import { useRef } from 'react';
import Link from 'next/link';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useGSAP } from '@gsap/react';
import { ExternalLink } from 'lucide-react';
import { useLogEvents } from '../lib/useLog.js';
import { GITHUB_URL } from '../lib/links.js';

gsap.registerPlugin(ScrollTrigger, useGSAP);

const usd = (n) => '$' + Math.round(n).toLocaleString('en-US');

export default function LiveBoard() {
  const { rows, checked } = useLogEvents();
  const scope = useRef(null);

  useGSAP(
    () => {
      gsap.from('.board-row', {
        opacity: 0,
        x: -24,
        stagger: 0.06,
        duration: 0.5,
        ease: 'power2.out',
        scrollTrigger: { trigger: scope.current, start: 'top 85%', once: true },
      });
    },
    { scope, dependencies: [rows.length] },
  );

  if (!rows.length) return null;

  return (
    <section id="floor" ref={scope} className="mx-auto mt-32 max-w-6xl scroll-mt-24 px-5">
      <div className="flex items-center gap-3 text-[11px] uppercase tracking-[0.3em] text-cream-dim">
        <span className="font-display text-gold-400">02</span>
        <span className="h-px w-10 bg-noir-line" />
        the floor, live
      </div>
      <h2 className="mt-4 font-display text-3xl font-black tracking-wide text-cream">
        The most extractive candles on Base, <span className="text-gold-400">right now</span>
      </h2>
      <p className="mt-3 max-w-[68ch] text-cream-dim">
        The agent rakes Base's trending tokens every hour and commits every event to a public,
        tamper-evident log. Twelve hours later it audits its own signal - and publishes the split
        whichever way it comes out.
      </p>

      <div className="mt-6 overflow-x-auto rounded-xl border border-noir-line bg-noir-900">
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
                  <Link href={`/?token=${e.token}&hours=1`} className="text-gold-400 underline decoration-dotted underline-offset-2 hover:decoration-solid">
                    rake it <ExternalLink className="inline h-3 w-3" />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-cream-dim">
        {checked > 0 ? `${checked} events have completed their 12h self-check. ` : ''}Full history:{' '}
        <a className="text-gold-400 underline decoration-dotted underline-offset-2" href={`${GITHUB_URL}/blob/main/log/LEADERBOARD.md`} target="_blank" rel="noopener noreferrer">
          the public log
        </a>
        .
      </p>
    </section>
  );
}
