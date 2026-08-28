'use client';

// The receipt. Rows are grids, not tables: they stack on phones and line up on desktop.

import { useEffect, useState } from 'react';
import { motion, animate } from 'framer-motion';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { AlertTriangle, Download, ExternalLink, Eye, Network, Ticket, Bot } from 'lucide-react';
import { usd, short, addrUrl, txUrl } from '../lib/format.js';
import { botDeepLink } from '../lib/links.js';

// Results mount after a run completes - animate on mount, never gate on scroll.
const reveal = {
  initial: { opacity: 0, y: 28 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.55, ease: 'easeOut' },
};

// min-w-0: these are grid items, whose default min-width:auto would let wide
// content push the card past the viewport on phones.
const CARD = 'receipt min-w-0 rounded-sm px-4 py-5 shadow-[0_16px_50px_rgba(0,0,0,0.55)] sm:px-7 sm:py-6';
const HEAD = 'border-b-2 border-dashed border-ink-soft pb-2 font-display text-[12px] font-bold uppercase tracking-[0.16em] sm:text-[13px] sm:tracking-[0.18em]';

function CountUp({ value, decimals = 1, suffix = '' }) {
  const [txt, setTxt] = useState('0');
  useEffect(() => {
    const controls = animate(0, value, {
      duration: 1.4,
      ease: 'easeOut',
      onUpdate: (v) => setTxt(v.toFixed(decimals)),
    });
    return () => controls.stop();
  }, [value, decimals]);
  return (
    <span>
      {txt}
      {suffix}
    </span>
  );
}

const A = ({ href, children }) => (
  <a href={href} target="_blank" rel="noopener noreferrer" className="underline decoration-dotted underline-offset-2 hover:decoration-solid">
    {children}
  </a>
);
const Tx = ({ h }) => (
  <A href={txUrl(h)}>
    <ExternalLink className="inline h-3 w-3" />
  </A>
);

const TAG_STYLES = {
  'first-block': 'text-loss-deep border-loss-deep',
  'deployer-funded': 'text-loss-deep border-loss-deep',
  cluster: 'text-[#8a3d6e] border-[#8a3d6e]',
  lp: 'text-gold-600 border-gold-600',
  repeat: 'text-[#4a5f8a] border-[#4a5f8a]',
  unlabeled: 'text-ink-soft border-ink-soft',
};
const Tag = ({ name }) => (
  <span className={`ml-2 inline-block whitespace-nowrap rounded-full border px-2 py-px text-[10px] uppercase tracking-wider ${TAG_STYLES[name]}`}>
    {name}
  </span>
);

export default function Receipt({ report }) {
  if (report.status === 'UNPRICEABLE') {
    return (
      <motion.div {...reveal} className="rounded-xl border border-dashed border-gold-400 p-5 font-display text-sm tracking-wider text-gold-400">
        <AlertTriangle className="mr-2 inline h-5 w-5" /> UNPRICEABLE - {report.reason}
      </motion.div>
    );
  }

  const { tape, rake, ticket, diagnosis } = report;
  const pct = rake?.rakePct;
  // A drain window (outflow far above inflow) must never look reassuring, whatever the rake %.
  const drainRatio = rake && rake.usdIn > 0 ? rake.usdOut / rake.usdIn : 0;
  const isDrain = drainRatio >= 2;
  const pctColor =
    pct == null ? 'text-gold-600' : isDrain || pct >= 50 ? 'text-loss' : pct < 20 ? 'text-win' : 'text-gold-600';

  const cohortRows = [];
  for (const name of ['first-block', 'deployer-funded', 'cluster', 'lp', 'repeat', 'unlabeled']) {
    const c = rake?.cohorts?.[name];
    if (!c) continue;
    for (const w of c.walletList.slice(0, name === 'unlabeled' ? 5 : 8)) {
      cohortRows.push({ name, ...w });
    }
  }

  const download = () => {
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `rake_${tape.tokenSymbol ?? 'token'}_${tape.window.toBlock}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-10">
      {report.status === 'TOO_THIN' && (
        <motion.div {...reveal} className="rounded-xl border border-dashed border-gold-400 p-5 font-display text-sm tracking-wider text-gold-400">
          TOO THIN - only {tape.totals?.swaps ?? 0} swaps in this window. Numbers below are shown but not judged.
        </motion.div>
      )}

      {/* headline */}
      <motion.section {...reveal} className={CARD}>
        <h2 className={HEAD}>
          The rake - {tape.tokenSymbol} · {tape.dex} · {tape.window.hours}h
        </h2>
        <p className="mt-3 text-[12px] text-ink-soft sm:text-[13px]">
          pool <A href={tape.poolUrl ?? addrUrl(tape.pool)}>{short(tape.pool)}</A> · {tape.window.fromTime.slice(0, 16).replace('T', ' ')} →{' '}
          {tape.window.toTime.slice(11, 16)} UTC · blocks {tape.window.fromBlock}–{tape.window.toBlock}
        </p>
        <div className={`my-3 font-display text-[clamp(56px,13vw,92px)] font-black leading-none ${pctColor}`}>
          {pct == null ? 'n/a' : <CountUp value={pct} suffix="%" />}
        </div>
        <p className="max-w-[62ch] text-[14px] sm:text-[15px]">
          Of <strong>{usd(rake.usdIn)}</strong> that entered this pool, <strong>{usd(rake.houseUsd)}</strong> left through house
          cohorts - wallets that were there first, funded each other, provide the liquidity, or sell every window.
        </p>
        {isDrain && (
          <p className="mt-2 max-w-[62ch] border-l-2 border-loss pl-3 text-[13px] text-loss-deep">
            Drain window: sellers took out {usd(rake.usdOut)} against {usd(rake.usdIn)} of buying -{' '}
            {drainRatio >= 10 ? Math.round(drainRatio) : drainRatio.toFixed(1)}× the inflow. A low rake % here only means the
            engine could not tie the sellers to the house, not that the exit was safe.
          </p>
        )}
        <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 border-t border-paper-dim pt-3 text-[12px] text-ink-soft sm:flex sm:flex-wrap sm:gap-x-8 sm:text-[13px]">
          <div><dt className="order-2">swaps</dt><dd className="text-[15px] font-bold text-ink">{tape.totals.swaps}</dd></div>
          <div><dt className="order-2">in · {tape.totals.uniqueBuyers} buyers</dt><dd className="text-[15px] font-bold text-ink">{usd(tape.totals.usdIn)}</dd></div>
          <div><dt className="order-2">out · {tape.totals.uniqueSellers} sellers</dt><dd className="text-[15px] font-bold text-ink">{usd(tape.totals.usdOut)}</dd></div>
          <div><dt className="order-2">funding walks</dt><dd className="text-[13px] font-bold wrap-break-word text-ink">{String(rake.meta.deployerFunded)}</dd></div>
          <div className="col-span-2 sm:col-span-1"><dt className="order-2">USD pricing</dt><dd className="text-[13px] font-bold text-ink">{tape.quote.pricing ?? 'single print'}</dd></div>
        </dl>
      </motion.section>

      {/* ledger */}
      <motion.section {...reveal} className={CARD}>
        <h2 className={HEAD}>Who got paid</h2>
        <div className="mt-3 hidden grid-cols-[minmax(0,1fr)_auto_auto] gap-x-4 border-b border-ink-soft pb-1 text-[12px] text-ink-soft sm:grid">
          <span>seller (the human, not the router)</span>
          <span className="text-right">took out</span>
          <span>receipts</span>
        </div>
        <ul className="text-[13px]">
          {cohortRows.map((r, i) => (
            <motion.li
              key={r.wallet + i}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: Math.min(i * 0.03, 0.4) }}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 border-b border-dotted border-paper-dim py-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]"
            >
              <span className="min-w-0 truncate">
                <A href={addrUrl(r.wallet)}>{short(r.wallet)}</A>
                <Tag name={r.name} />
              </span>
              <span className="whitespace-nowrap text-right font-semibold">{usd(r.usd)}</span>
              <span className="col-span-2 flex gap-3 text-ink-soft sm:col-span-1 sm:justify-end">
                {r.txs.slice(0, 2).map((h) => (
                  <Tx key={h} h={h} />
                ))}
              </span>
            </motion.li>
          ))}
        </ul>
      </motion.section>

      {/* clusters */}
      {rake.clusters?.length > 0 && (
        <motion.section {...reveal} className={CARD}>
          <h2 className={`${HEAD} flex items-center gap-2`}>
            <Network className="h-4 w-4 shrink-0" /> Funding clusters - one funder, many sellers
          </h2>
          {rake.clusters.slice(0, 5).map((cl) => (
            <p key={cl.funder} className="mt-3 text-[13px] leading-relaxed text-ink-soft">
              funder <A href={addrUrl(cl.funder)}>{short(cl.funder)}</A> first-funded <b className="text-ink">{cl.size}</b> of this
              window's sellers: {cl.members.slice(0, 6).map((m, i) => (
                <span key={m.wallet}>{i > 0 && ', '}<A href={addrUrl(m.wallet)}>{short(m.wallet)}</A></span>
              ))}{cl.size > 6 ? '…' : ''}{' '}
              {cl.infra ? (
                <em>- {cl.infraReason ?? 'infrastructure funder'}: NOT counted as house</em>
              ) : (
                <b className="text-[#8a3d6e]">- low-degree EOA funder ({cl.funderOutgoing} lifetime transfers): counted as house, cohort "cluster"</b>
              )}
            </p>
          ))}
        </motion.section>
      )}

      {/* ticket */}
      {ticket && (
        <motion.section {...reveal} className={CARD}>
          <h2 className={`${HEAD} flex flex-wrap items-center gap-2`}>
            <Ticket className="h-4 w-4 shrink-0" /> Your ticket{ticket.wallet ? <> - <A href={addrUrl(ticket.wallet)}>{short(ticket.wallet)}</A></> : null}
          </h2>
          {ticket.status === 'NOT_IN_WINDOW' ? (
            <>
              <p className="mt-3 text-[13px] text-ink-soft">{ticket.reason}</p>
              {ticket.receivedThisToken?.length > 0 && (
                <div className="mt-3 border-l-2 border-gold-600 pl-3 text-[13px]">
                  <p className="font-semibold text-ink">
                    But this wallet DID receive {tape.tokenSymbol} inside this window - through a different pool.
                  </p>
                  {ticket.receivedThisToken.map((t) => (
                    <p key={t.txHash} className="mt-1 text-ink-soft">
                      {Math.round(t.value ?? 0).toLocaleString()} {tape.tokenSymbol}
                      {t.ts ? ` on ${t.ts.slice(0, 16).replace('T', ' ')} UTC` : ''} - <A href={txUrl(t.txHash)}>receipt</A>
                    </p>
                  ))}
                  <p className="mt-1 text-ink-soft">
                    This tape reads the token's top-volume pool only; the router filled these swaps elsewhere. The receipts
                    above are the proof of your buy - it just never touched this pool.
                  </p>
                </div>
              )}
              {ticket.sameSymbolSuspect && (
                <div className="mt-3 border-l-2 border-loss pl-3 text-[13px]">
                  <p className="font-semibold text-loss-deep">
                    ⚠ Same ticker, different contract - you may be looking at the wrong token.
                  </p>
                  <p className="mt-1 text-ink-soft">
                    This wallet received <b className="text-ink">{Math.round(ticket.sameSymbolSuspect.value ?? 0).toLocaleString()}</b> of a token
                    also named "{tape.tokenSymbol}" at{' '}
                    <A href={addrUrl(ticket.sameSymbolSuspect.address)}>{short(ticket.sameSymbolSuspect.address)}</A>
                    {ticket.sameSymbolSuspect.ts ? ` on ${ticket.sameSymbolSuspect.ts.slice(0, 16).replace('T', ' ')} UTC` : ''} (
                    <A href={txUrl(ticket.sameSymbolSuspect.txHash)}>receipt</A>).{' '}
                    <a
                      className="font-semibold text-loss-deep underline"
                      href={`/?token=${ticket.sameSymbolSuspect.address}&hours=${tape.window.hours}&wallet=${ticket.wallet}`}
                    >
                      Rake that contract instead →
                    </a>
                  </p>
                </div>
              )}
            </>
          ) : (
            <>
              <p className="mt-3 max-w-[62ch] text-[14px] sm:text-[15px]">
                You bought <strong>{usd(ticket.buys.usd)}</strong> ({ticket.buys.count} tx) and sold{' '}
                <strong>{usd(ticket.sells.usd)}</strong> ({ticket.sells.count} tx) in a window where{' '}
                {ticket.windowRakePct?.toFixed(1)}% of inflow went to the house.
              </p>
              <ul className="mt-3 text-[13px]">
                {ticket.buyEvents.map((b) => (
                  <li key={b.txHash} className="border-b border-dotted border-paper-dim py-2.5">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                      <span className="whitespace-nowrap">
                        your buy <b>{usd(b.usd)}</b> @ block {b.block} <Tx h={b.txHash} />
                      </span>
                      <span className="whitespace-nowrap text-ink-soft">
                        house sold <b className="text-ink">{usd(b.nearbyHouseSellUsd)}</b> within ±{ticket.nearbyBlocks} blocks
                      </span>
                    </div>
                    {b.nearbyHouseSells.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-ink-soft">
                        {b.nearbyHouseSells.map((s) => (
                          <span key={s.txHash} className="whitespace-nowrap">
                            <A href={addrUrl(s.wallet)}>{short(s.wallet)}</A> {usd(s.usd)} <Tx h={s.txHash} />
                          </span>
                        ))}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
        </motion.section>
      )}

      {/* analyst */}
      {diagnosis && (
        <motion.section {...reveal} className="rounded-xl border border-noir-line bg-noir-900 px-4 py-5 sm:px-7 sm:py-6">
          <h2 className="flex flex-wrap items-center gap-2 font-display text-[12px] font-bold uppercase tracking-[0.16em] text-gold-400 sm:text-[13px]">
            <Bot className="h-4 w-4 shrink-0" /> Analyst note{diagnosis.status === 'OK' ? ` - ${diagnosis.model}` : ''}
          </h2>
          {diagnosis.status === 'OK' ? (
            <>
              <div className="mt-4 min-w-0 font-mono text-[13px] leading-relaxed text-cream sm:text-sm">
                <Markdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    p: ({ children }) => <p className="mt-3 wrap-break-word first:mt-0">{children}</p>,
                    strong: ({ children }) => <strong className="font-semibold text-gold-300">{children}</strong>,
                    em: ({ children }) => <em className="text-cream-dim">{children}</em>,
                    ul: ({ children }) => <ul className="mt-2 list-disc space-y-1.5 pl-4 marker:text-gold-400">{children}</ul>,
                    ol: ({ children }) => <ol className="mt-2 list-decimal space-y-1.5 pl-4 marker:text-gold-400">{children}</ol>,
                    li: ({ children }) => <li className="wrap-break-word">{children}</li>,
                    code: ({ children }) => <code className="wrap-break-word text-gold-300">{children}</code>,
                    a: ({ href, children }) => (
                      <a href={href} target="_blank" rel="noopener noreferrer" className="wrap-break-word text-gold-400 underline decoration-dotted">
                        {children}
                      </a>
                    ),
                    h1: ({ children }) => <h3 className="mt-4 font-display text-[13px] uppercase tracking-[0.14em] text-gold-400">{children}</h3>,
                    h2: ({ children }) => <h3 className="mt-4 font-display text-[13px] uppercase tracking-[0.14em] text-gold-400">{children}</h3>,
                    h3: ({ children }) => <h3 className="mt-4 font-display text-[13px] uppercase tracking-[0.14em] text-gold-400">{children}</h3>,
                  }}
                >
                  {diagnosis.text}
                </Markdown>
              </div>
              {diagnosis.walks?.length > 0 && (
                <p className="mt-3 wrap-break-word text-xs text-cream-dim">
                  funding walks spent: {diagnosis.walks.map((w) => `${short(w.wallet)} (${w.why})`).join(' · ')}
                </p>
              )}
            </>
          ) : (
            <p className="mt-4 wrap-break-word text-sm text-cream-dim">{diagnosis.status} - {diagnosis.reason}</p>
          )}
        </motion.section>
      )}

      <motion.div {...reveal} className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <a
          href={botDeepLink('watch', tape.token)}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 rounded-lg bg-gold-400 px-4 py-3 text-[13px] font-semibold text-noir-950 transition hover:brightness-110"
        >
          <Eye className="h-4 w-4" /> watch {tape.tokenSymbol} on Telegram
        </a>
        <button
          onClick={download}
          className="flex items-center justify-center gap-2 rounded-lg border border-noir-line px-4 py-3 text-[13px] text-gold-400 transition hover:bg-noir-800"
        >
          <Download className="h-4 w-4" /> download full receipt (JSON)
        </button>
        <a
          href="/docs/usage#the-deep-pass"
          className="flex items-center justify-center gap-2 rounded-lg border border-noir-line px-4 py-3 text-[13px] text-cream-dim transition hover:bg-noir-800 hover:text-cream"
        >
          deep pass API →
        </a>
      </motion.div>
    </div>
  );
}
