'use client';

// The floor, live: latest reading per trending token from the hourly public log.
// Rows stack on phones, line up on desktop.

import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowUpRight } from 'lucide-react';
import { useLogEvents } from '../lib/useLog.js';
import { GITHUB_URL } from '../lib/links.js';

const usd = (n) => '$' + Math.round(n).toLocaleString('en-US');
const rakeColor = (p) => (p >= 50 ? 'text-loss' : p >= 20 ? 'text-gold-400' : 'text-win');

export default function LiveBoard() {
  const { rows, checked } = useLogEvents();
  if (!rows.length) return null;

  return (
    <section id="floor" className="mx-auto mt-32 max-w-6xl scroll-mt-24 px-5">
      <div className="flex items-center gap-3 text-[11px] uppercase tracking-[0.3em] text-cream-dim">
        <span className="font-display text-gold-400">02</span>
        <span className="h-px w-10 bg-noir-line" />
        the floor, live
      </div>
      <h2 className="mt-4 font-display text-2xl font-black leading-tight tracking-wide text-cream sm:text-3xl">
        The most extractive candles on Base, <span className="text-gold-400">right now</span>
      </h2>
      <p className="mt-3 max-w-[68ch] text-cream-dim">
        The agent rakes Base's trending tokens every hour and commits every event to a public,
        tamper-evident log. Twelve hours later it audits its own signal - and publishes the split
        whichever way it comes out.
      </p>

      <div className="mt-6 overflow-hidden rounded-xl border border-noir-line bg-noir-900">
        <div className="hidden grid-cols-[minmax(0,1.4fr)_auto_repeat(2,minmax(0,1fr))_auto] gap-4 border-b border-noir-line px-4 py-2.5 text-[12px] text-cream-dim sm:grid">
          <span>token</span>
          <span className="text-right">rake (1h)</span>
          <span className="text-right">inflow</span>
          <span className="text-right">to the house</span>
          <span />
        </div>
        <ul>
          {rows.map((e, i) => (
            <motion.li
              key={e.token}
              initial={{ opacity: 0, x: -16 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, amount: 0.4 }}
              transition={{ delay: Math.min(i * 0.05, 0.4), duration: 0.45, ease: 'easeOut' }}
              className="border-b border-noir-line/50 px-4 py-3 last:border-0 sm:grid sm:grid-cols-[minmax(0,1.4fr)_auto_repeat(2,minmax(0,1fr))_auto] sm:items-center sm:gap-4 sm:py-2.5"
            >
              {/* phone: symbol + big rake on one line, figures beneath */}
              <div className="flex items-baseline justify-between gap-3 sm:block">
                <span className="truncate font-semibold text-cream">{e.symbol}</span>
                <span className={`font-display text-lg font-black sm:hidden ${rakeColor(e.rakePct)}`}>{e.rakePct}%</span>
              </div>
              <span className={`hidden text-right font-bold sm:block ${rakeColor(e.rakePct)}`}>{e.rakePct}%</span>
              <span className="mt-1 flex justify-between text-[13px] text-cream-dim sm:mt-0 sm:block sm:text-right">
                <span className="sm:hidden">inflow</span>
                {usd(e.usdIn)}
              </span>
              <span className="flex justify-between text-[13px] text-cream-dim sm:block sm:text-right">
                <span className="sm:hidden">to the house</span>
                {usd(e.houseUsd)}
              </span>
              <Link
                href={`/?token=${e.token}&hours=1`}
                className="mt-2 flex items-center gap-1 text-[13px] text-gold-400 underline decoration-dotted underline-offset-2 hover:decoration-solid sm:mt-0 sm:justify-end"
              >
                rake it <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            </motion.li>
          ))}
        </ul>
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
