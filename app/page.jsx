'use client';

// RAKE — the table. Noir casino: graphite, champagne gold, cream receipts.

import { useEffect, useRef, useState } from 'react';
import { motion, useScroll, AnimatePresence } from 'framer-motion';
import { Flame, Loader2, Play, Wallet } from 'lucide-react';
import Mark from '../components/Mark.jsx';
import Receipt from '../components/Receipt.jsx';
import HowItWorks from '../components/HowItWorks.jsx';
import { isAddress } from '../lib/format.js';

const WINDOWS = ['1', '4', '24'];

export default function Page() {
  const { scrollYProgress } = useScroll();
  const [token, setToken] = useState('');
  const [wallet, setWallet] = useState('');
  const [hours, setHours] = useState('4');
  const [trending, setTrending] = useState([]);
  const [trace, setTrace] = useState([]);
  const [report, setReport] = useState(null);
  const [fatal, setFatal] = useState(null);
  const [running, setRunning] = useState(false);
  const sourceRef = useRef(null);
  const traceRef = useRef(null);
  const resultRef = useRef(null);

  useEffect(() => {
    fetch('/api/trending').then((r) => r.json()).then(setTrending).catch(() => {});
    // Shareable links: /?token=0x…&hours=4&wallet=0x… auto-runs on load.
    const boot = new URLSearchParams(location.search);
    if (isAddress(boot.get('token'))) {
      const h = WINDOWS.includes(boot.get('hours')) ? boot.get('hours') : '4';
      const w = isAddress(boot.get('wallet')) ? boot.get('wallet') : '';
      setToken(boot.get('token'));
      setHours(h);
      setWallet(w);
      run(boot.get('token'), h, w);
    }
    return () => sourceRef.current?.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    traceRef.current?.scrollTo({ top: traceRef.current.scrollHeight });
  }, [trace]);

  function run(tok, hrs, wal) {
    if (!isAddress(tok)) return;
    sourceRef.current?.close();
    setTrace([]);
    setReport(null);
    setFatal(null);
    setRunning(true);
    history.replaceState(null, '', '?' + new URLSearchParams({ token: tok, hours: hrs, ...(wal ? { wallet: wal } : {}) }));

    const params = new URLSearchParams({ token: tok, hours: hrs });
    if (wal) params.set('wallet', wal);
    const es = new EventSource('/api/rake?' + params);
    sourceRef.current = es;

    es.addEventListener('progress', (ev) => setTrace((t) => [...t, JSON.parse(ev.data).message]));
    es.addEventListener('result', (ev) => {
      setReport(JSON.parse(ev.data));
      setRunning(false);
      es.close();
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 250);
    });
    es.addEventListener('fatal', (ev) => {
      setFatal(JSON.parse(ev.data).message);
      setRunning(false);
      es.close();
    });
    es.onerror = () => {
      setRunning(false);
      es.close();
    };
  }

  return (
    <>
      {/* scroll progress */}
      <motion.div style={{ scaleX: scrollYProgress }} className="fixed inset-x-0 top-0 z-50 h-0.5 origin-left bg-gold-400" />

      {/* header */}
      <header className="sticky top-0 z-40 border-b border-noir-line bg-noir-950/80 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-5 py-3.5 text-gold-400">
          <Mark className="h-8 w-8" />
          <span className="font-display text-xl font-black tracking-[0.08em]">RAKE</span>
          <span className="ml-auto hidden text-xs text-cream-dim sm:block">every number is a log or a quote</span>
        </div>
      </header>

      <main className="relative overflow-x-clip">
        {/* hero glow */}
        <motion.div
          aria-hidden
          animate={{ opacity: [0.5, 0.8, 0.5], scale: [1, 1.06, 1] }}
          transition={{ duration: 9, repeat: Infinity, ease: 'easeInOut' }}
          className="pointer-events-none absolute left-1/2 top-[-260px] h-[560px] w-[900px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(233,193,94,0.13),transparent)]"
        />

        {/* hero */}
        <section className="mx-auto max-w-5xl px-5 pt-20 text-center">
          <motion.h1
            initial={{ opacity: 0, y: 26 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: 'easeOut' }}
            className="font-display text-[clamp(30px,6vw,58px)] font-black leading-[1.05] tracking-wide text-cream"
          >
            Every candle has a <span className="text-gold-400">house</span>.
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15, duration: 0.7 }}
            className="mx-auto mt-5 max-w-[58ch] text-cream-dim"
          >
            Paste a Base token. Rake reconstructs the real swaps, names who got paid — from the actual transactions, in dollars —
            and prints the receipt.
          </motion.p>
        </section>

        {/* form */}
        <motion.section
          initial={{ opacity: 0, y: 26 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.7 }}
          className="mx-auto mt-10 max-w-5xl px-5"
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              run(token.trim(), hours, wallet.trim());
            }}
            className="rounded-2xl border border-noir-line bg-gradient-to-b from-noir-800 to-noir-900 p-6 shadow-[0_20px_60px_rgba(0,0,0,0.5)]"
          >
            <div className="flex flex-wrap items-end gap-4">
              <label className="min-w-[240px] flex-1">
                <span className="text-xs uppercase tracking-[0.12em] text-cream-dim">Base token address</span>
                <input
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="0x… paste any Base token"
                  spellCheck={false}
                  required
                  pattern="0x[0-9a-fA-F]{40}"
                  className="mt-1.5 w-full rounded-lg border border-noir-line bg-noir-950 px-3 py-2.5 text-sm outline-none focus:border-gold-400"
                />
              </label>
              <label>
                <span className="text-xs uppercase tracking-[0.12em] text-cream-dim">Window</span>
                <div className="mt-1.5 flex overflow-hidden rounded-lg border border-noir-line">
                  {WINDOWS.map((h) => (
                    <button
                      key={h}
                      type="button"
                      onClick={() => setHours(h)}
                      className={`px-4 py-2.5 text-sm transition ${
                        hours === h ? 'bg-gold-400 font-semibold text-noir-950' : 'bg-noir-950 text-cream-dim hover:text-cream'
                      }`}
                    >
                      {h}h
                    </button>
                  ))}
                </div>
              </label>
              <label className="min-w-[220px] flex-1">
                <span className="text-xs uppercase tracking-[0.12em] text-cream-dim">
                  <Wallet className="mr-1 inline h-3 w-3" />
                  Your wallet <em className="normal-case opacity-70">(optional — get your ticket)</em>
                </span>
                <input
                  value={wallet}
                  onChange={(e) => setWallet(e.target.value)}
                  placeholder="0x…"
                  spellCheck={false}
                  pattern="0x[0-9a-fA-F]{40}"
                  className="mt-1.5 w-full rounded-lg border border-noir-line bg-noir-950 px-3 py-2.5 text-sm outline-none focus:border-gold-400"
                />
              </label>
              <motion.button
                whileTap={{ scale: 0.97 }}
                disabled={running}
                type="submit"
                className="flex items-center gap-2 rounded-lg bg-gold-400 px-6 py-3 font-display text-sm font-bold tracking-[0.08em] text-noir-950 transition hover:brightness-110 disabled:opacity-50"
              >
                {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                {running ? 'RAKING…' : 'PULL THE TAPE'}
              </motion.button>
            </div>

            {trending.length > 0 && (
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <span className="flex items-center gap-1 text-xs uppercase tracking-[0.1em] text-cream-dim">
                  <Flame className="h-3.5 w-3.5 text-gold-400" /> trending:
                </span>
                {trending.map((t) => (
                  <motion.button
                    key={t.address}
                    type="button"
                    whileHover={{ y: -2 }}
                    onClick={() => setToken(t.address)}
                    className="rounded-full border border-noir-line px-3 py-1 text-[13px] text-gold-400 transition hover:bg-noir-800"
                  >
                    {t.symbol}
                  </motion.button>
                ))}
              </div>
            )}
          </form>
        </motion.section>

        {/* trace */}
        <AnimatePresence>
          {(trace.length > 0 || running) && (
            <motion.section
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mx-auto mt-6 max-w-5xl px-5"
            >
              <div className="overflow-hidden rounded-xl border border-noir-line">
                <div className="flex items-center gap-2 bg-noir-800 px-4 py-2 text-[11px] uppercase tracking-[0.12em] text-cream-dim">
                  <span className={`h-2 w-2 rounded-full ${running ? 'animate-pulse bg-win' : 'bg-cream-dim'}`} />
                  live trace — every line is a real call
                </div>
                <div ref={traceRef} className="trace-scroll max-h-56 overflow-y-auto bg-noir-950 px-4 py-3 text-[13px] text-cream-dim">
                  {trace.map((line, i) => (
                    <motion.div key={i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} className="break-all">
                      · {line}
                    </motion.div>
                  ))}
                </div>
              </div>
            </motion.section>
          )}
        </AnimatePresence>

        {/* result */}
        <div ref={resultRef} className="mx-auto mt-10 max-w-5xl scroll-mt-24 px-5">
          {fatal && (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-xl border border-dashed border-loss p-5 font-display text-sm tracking-wider text-loss"
            >
              ⚠ {fatal}
            </motion.div>
          )}
          {report && <Receipt report={report} />}
        </div>

        <HowItWorks />
      </main>

      <footer className="mx-auto mt-24 max-w-5xl border-t border-noir-line px-5 py-10 text-[13px] text-cream-dim">
        <p>
          Built on Base for the <span className="text-gold-400">Orion Builder Hackathon</span>. Data: Base RPC logs, Dexscreener,
          Alchemy transfers. Not financial advice — it's a receipt.
        </p>
      </footer>
    </>
  );
}
