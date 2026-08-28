'use client';

// House rules: sticky chapter on the left, the five cohorts filing past on the
// right with ghost numerals, each revealed by scroll.

import { useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useGSAP } from '@gsap/react';
import { Zap, GitBranch, Network, Droplets, Repeat2, Scale } from 'lucide-react';

gsap.registerPlugin(ScrollTrigger, useGSAP);

const COHORTS = [
  { icon: Zap, name: 'first-block', rule: 'Traded in the first 50 swaps after the pool was deployed. The snipers.' },
  { icon: GitBranch, name: 'deployer-funded', rule: 'First inbound transfer ever came from the initial-LP wallet or a first-block wallet.' },
  { icon: Network, name: 'cluster', rule: 'Sold alongside sellers first-funded by the same low-degree wallet. One operator, many hands. Exchanges and infra never count.' },
  { icon: Droplets, name: 'lp', rule: 'Minted or burned liquidity in this pool in-window, plus the pool itself.' },
  { icon: Repeat2, name: 'repeat', rule: 'Also sold in the previous window of equal length. Sells every window, every time.' },
];

export default function HowItWorks() {
  const scope = useRef(null);

  useGSAP(
    () => {
      gsap.utils.toArray('.cohort-card').forEach((el) => {
        gsap.from(el, {
          opacity: 0,
          y: 50,
          duration: 0.6,
          ease: 'power2.out',
          scrollTrigger: { trigger: el, start: 'top 88%', once: true },
        });
      });
    },
    { scope },
  );

  return (
    <section id="house" ref={scope} className="mx-auto mt-32 max-w-6xl scroll-mt-24 px-5">
      <div className="grid gap-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        {/* sticky chapter */}
        <div className="lg:sticky lg:top-28 lg:self-start">
          <div className="flex items-center gap-3 text-[11px] uppercase tracking-[0.3em] text-cream-dim">
            <span className="font-display text-gold-400">03</span>
            <span className="h-px w-10 bg-noir-line" />
            house rules
          </div>
          <h2 className="mt-4 font-display text-3xl font-black leading-tight tracking-wide text-cream">
            The house is a <span className="text-gold-400">rule</span>,<br />not an opinion.
          </h2>
          <p className="mt-4 max-w-[48ch] text-cream-dim">
            Every sell is attributed to the human behind it - the UserOp sender for ERC-4337 bundles,{' '}
            <code className="text-gold-400">tx.from</code> otherwise; never the router, never the bundler.
            The rake is the share of USD entering the pool that left through five mechanical cohorts.
            No model produces a number.
          </p>
          <div className="mt-6 rounded-xl border border-gold-400/25 bg-noir-900 p-5">
            <Scale className="h-4 w-4 text-gold-400" />
            <p className="mt-2 text-[13px] leading-relaxed text-cream-dim">
              Thin windows read <code className="text-gold-400">TOO THIN</code>; unreadable pools read{' '}
              <code className="text-gold-400">UNPRICEABLE</code>. USD comes from each swap's own quote leg
              at its execution hour. Never estimated - and "house" never claims identity, only behavior
              with receipts.
            </p>
          </div>
        </div>

        {/* the cohorts file past */}
        <div className="flex flex-col gap-5">
          {COHORTS.map((c, i) => (
            <div key={c.name} className="cohort-card relative overflow-hidden rounded-xl border border-noir-line bg-noir-900 p-6">
              <span className="pointer-events-none absolute -right-2 -top-6 font-display text-[88px] font-black leading-none text-cream/[0.045]">
                {String(i + 1).padStart(2, '0')}
              </span>
              <c.icon className="h-5 w-5 text-gold-400" />
              <h3 className="mt-3 font-display text-sm font-bold uppercase tracking-[0.14em] text-cream">{c.name}</h3>
              <p className="mt-2 max-w-[52ch] text-[13px] leading-relaxed text-cream-dim">{c.rule}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
