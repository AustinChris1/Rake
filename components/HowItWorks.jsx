'use client';

// Scroll-revealed explainer: the cohort rules and the honesty rules.

import { motion } from 'framer-motion';
import { Zap, GitBranch, Network, Droplets, Repeat2, Scale } from 'lucide-react';

const COHORTS = [
  {
    icon: Zap,
    name: 'first-block',
    rule: 'EOA behind one of the first 50 swaps after the pool was deployed. The snipers.',
  },
  {
    icon: GitBranch,
    name: 'deployer-funded',
    rule: 'Seller whose first inbound transfer ever came from the initial-LP wallet or a first-block wallet.',
  },
  {
    icon: Network,
    name: 'cluster',
    rule: 'Sold alongside ≥1 other seller first-funded by the same low-degree wallet. One operator, many hands. High-degree funders (exchanges, disperse bots) never count.',
  },
  {
    icon: Droplets,
    name: 'lp',
    rule: 'Minted or burned liquidity in this pool in-window - plus the pool itself.',
  },
  {
    icon: Repeat2,
    name: 'repeat',
    rule: 'Also sold in the previous window of equal length. Sells every window, every time.',
  },
];

export default function HowItWorks() {
  return (
    <section className="mx-auto mt-28 max-w-5xl px-5">
      <motion.h2
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-80px' }}
        transition={{ duration: 0.5 }}
        className="font-display text-2xl font-bold tracking-wide text-cream"
      >
        The house is a <span className="text-gold-400">rule</span>, not an opinion
      </motion.h2>
      <motion.p
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ delay: 0.15, duration: 0.5 }}
        className="mt-3 max-w-[68ch] text-cream-dim"
      >
        Every sell in the window is attributed to the human behind it - the UserOp sender for ERC-4337 bundles,{' '}
        <code className="text-gold-400">tx.from</code> otherwise; never the router, never the bundler - and classified by
        mechanical rules over public data. The rake is the share of USD entering the pool that left through these five cohorts:
      </motion.p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {COHORTS.map((c, i) => (
          <motion.div
            key={c.name}
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={{ delay: i * 0.08, duration: 0.5 }}
            whileHover={{ y: -3 }}
            className="rounded-xl border border-noir-line bg-noir-900 p-5"
          >
            <c.icon className="h-5 w-5 text-gold-400" />
            <h3 className="mt-3 font-display text-sm font-bold uppercase tracking-[0.14em] text-cream">{c.name}</h3>
            <p className="mt-2 text-[13px] leading-relaxed text-cream-dim">{c.rule}</p>
          </motion.div>
        ))}
      </div>

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-60px' }}
        transition={{ duration: 0.5 }}
        className="mt-6 rounded-xl border border-gold-400/30 bg-noir-900 p-5"
      >
        <Scale className="h-5 w-5 text-gold-400" />
        <h3 className="mt-3 font-display text-sm font-bold uppercase tracking-[0.14em] text-gold-400">House rules</h3>
        <p className="mt-2 max-w-[75ch] text-[13px] leading-relaxed text-cream-dim">
          No model produces a number - the analyst interprets the deterministic report and spends a bounded budget of funding
          walks, nothing more. Thin windows read <code className="text-gold-400">TOO THIN</code>; unreadable pools read{' '}
          <code className="text-gold-400">UNPRICEABLE</code>. USD comes from each swap's own WETH/USDC leg at execution, priced
          at that hour's WETH/USD close - single current print as fallback, and the receipt states which method priced it.
        </p>
      </motion.div>
    </section>
  );
}
