'use client';

// RAKE - the table. Noir casino: graphite, champagne gold, cream receipts.

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useGSAP } from '@gsap/react';
import { Flame, Loader2, Play, Wallet, Send, BookOpen, ArrowDown } from 'lucide-react';
import GitHubIcon from '../components/GitHubIcon.jsx';
import Nav from '../components/Nav.jsx';
import TickerBar from '../components/TickerBar.jsx';
import Receipt from '../components/Receipt.jsx';
import HowItWorks from '../components/HowItWorks.jsx';
import LiveBoard from '../components/LiveBoard.jsx';
import { isAddress } from '../lib/format.js';
import { BOT_URL, GITHUB_URL } from '../lib/links.js';

gsap.registerPlugin(ScrollTrigger, useGSAP);

const WINDOWS = ['1', '4', '24'];
const HEADLINE = ['EVERY', 'CANDLE', 'HAS A', 'HOUSE.'];

export default function Page() {
  const [token, setToken] = useState('');
  const [wallet, setWallet] = useState('');
  const [hours, setHours] = useState('4');
  const [trending, setTrending] = useState([]);
  const [trace, setTrace] = useState([]);
  const [report, setReport] = useState(null);
  const [fatal, setFatal] = useState(null);
  const [running, setRunning] = useState(false);
  const [analystPending, setAnalystPending] = useState(false);
  const sourceRef = useRef(null);
  const tapeRef = useRef(null);
  const resultRef = useRef(null);
  const rootRef = useRef(null);

  useGSAP(
    () => {
      // headline lines wipe up like dealt cards
      gsap.from('.hero-line', { yPercent: 110, stagger: 0.1, duration: 0.9, ease: 'power4.out', delay: 0.1 });
      gsap.from('.hero-fade', { opacity: 0, y: 20, stagger: 0.1, delay: 0.6, duration: 0.7, ease: 'power2.out' });
      // ghost mark drifts as you scroll
      gsap.to('.ghost-mark', {
        yPercent: 24,
        rotate: -4,
        ease: 'none',
        scrollTrigger: { trigger: '.hero-wrap', start: 'top top', end: 'bottom top', scrub: true },
      });
      // chips raked across the divider, scrubbed to scroll
      gsap.fromTo(
        '.sweep-chips',
        { x: '-14vw' },
        { x: '90vw', ease: 'none', scrollTrigger: { trigger: '.sweep-lane', start: 'top 95%', end: 'top 20%', scrub: 0.5 } },
      );
    },
    { scope: rootRef },
  );

  useEffect(() => {
    fetch('/api/trending').then((r) => r.json()).then(setTrending).catch(() => {});
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
    tapeRef.current?.scrollTo({ top: tapeRef.current.scrollHeight });
  }, [trace]);

  function run(tok, hrs, wal) {
    if (!isAddress(tok)) return;
    sourceRef.current?.close();
    setTrace([]);
    setReport(null);
    setFatal(null);
    setRunning(true);
    setAnalystPending(false);
    history.replaceState(null, '', '?' + new URLSearchParams({ token: tok, hours: hrs, ...(wal ? { wallet: wal } : {}) }));

    const params = new URLSearchParams({ token: tok, hours: hrs });
    if (wal) params.set('wallet', wal);
    const es = new EventSource('/api/rake?' + params);
    sourceRef.current = es;

    es.addEventListener('progress', (ev) => setTrace((t) => [...t, JSON.parse(ev.data).message]));
    es.addEventListener('result', (ev) => {
      const next = JSON.parse(ev.data);
      setReport(next);
      // A receipt with no note yet means the analyst is still reading.
      setAnalystPending(next.status === 'OK' && !next.diagnosis);
      setRunning(false);
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 250);
    });
    es.addEventListener('analyst', (ev) => {
      const diagnosis = JSON.parse(ev.data);
      setReport((prev) => (prev ? { ...prev, diagnosis } : prev));
      setAnalystPending(false);
      es.close();
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
    <div ref={rootRef}>
      <Nav />

      <main className="relative overflow-x-clip pt-14">
        <TickerBar />

        {/* ── hero ─────────────────────────────── */}
        <section className="hero-wrap relative mx-auto max-w-6xl px-5 pb-10 pt-16 sm:pt-24">
          <svg
            viewBox="0 0 64 64"
            fill="none"
            aria-hidden="true"
            className="ghost-mark pointer-events-none absolute -right-16 -top-4 h-[280px] w-[280px] rotate-[8deg] text-gold-400 opacity-5 sm:-right-10 sm:-top-10 sm:h-[540px] sm:w-[540px]"
          >
            <g stroke="currentColor" strokeWidth="5" strokeLinecap="round">
              <path d="M48 9 L26 37" />
              <path d="M10 42 L38 42" />
            </g>
            <g fill="currentColor">
              <circle cx="16" cy="52" r="5" />
              <circle cx="29" cy="53" r="5" />
            </g>
            <circle cx="45" cy="54" r="5" stroke="currentColor" strokeWidth="3" fill="none" />
          </svg>

          <div className="hero-fade flex items-center gap-3 text-[11px] uppercase tracking-[0.3em] text-cream-dim">
            <span className="h-px w-10 bg-gold-400" />
            onchain market forensics · base
          </div>

          <h1 className="mt-6 font-display font-black leading-[0.95] tracking-wide text-cream" style={{ fontSize: 'clamp(44px, 9vw, 110px)' }}>
            {HEADLINE.map((line, i) => (
              <span key={i} className="block overflow-hidden">
                <span className={`hero-line block ${i === 3 ? 'text-gold-400' : ''}`}>{line}</span>
              </span>
            ))}
          </h1>

          <div className="mt-8 flex flex-wrap items-end justify-between gap-6">
            <p className="hero-fade max-w-[52ch] text-cream-dim">
              Paste a Base token. RAKE reconstructs the real swaps, names who extracted the money, and
              prints the receipt. Every number is a log or a quote - never an opinion.
            </p>
            <a href="#tape" className="hero-fade group flex items-center gap-2 font-mono text-[12px] uppercase tracking-[0.2em] text-gold-400">
              pull the tape <ArrowDown className="h-4 w-4 transition group-hover:translate-y-1" />
            </a>
          </div>
        </section>

        {/* ── 01 · the table ───────────────────── */}
        <section id="tape" className="mx-auto max-w-6xl scroll-mt-24 px-5 pt-8">
          <div className="flex items-center gap-3 text-[11px] uppercase tracking-[0.3em] text-cream-dim">
            <span className="font-display text-gold-400">01</span>
            <span className="h-px w-10 bg-noir-line" />
            the table
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              run(token.trim(), hours, wallet.trim());
            }}
            className="mt-4 rounded-2xl border border-noir-line bg-gradient-to-b from-noir-800 to-noir-900 p-6 shadow-[0_20px_60px_rgba(0,0,0,0.5)]"
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
                  Your wallet <em className="normal-case opacity-70">(optional - get your ticket)</em>
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
        </section>

        {/* ── the tape prints ──────────────────── */}
        <AnimatePresence>
          {(trace.length > 0 || running) && (
            <motion.section
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="mx-auto mt-10 max-w-2xl px-5"
            >
              <div className="printer-slot mx-1 sm:mx-6" />
              <motion.div
                layout
                className="tape mx-2 -mt-[2px] rotate-[0.4deg] px-3 pb-4 pt-3 font-mono text-[11.5px] shadow-[0_18px_50px_rgba(0,0,0,0.6)] sm:mx-8 sm:px-5 sm:text-[12.5px]"
              >
                <div className="flex items-center justify-between border-b border-dashed border-ink-soft pb-2 text-[10px] uppercase tracking-[0.22em] text-ink-soft">
                  <span>RAKE · live tape</span>
                  <span className={running ? 'text-ink' : ''}>{running ? '● printing' : '■ done'}</span>
                </div>
                <div ref={tapeRef} className="trace-scroll max-h-60 overflow-y-auto pt-2 text-ink">
                  {trace.map((line, i) => (
                    <motion.div key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="break-all leading-relaxed">
                      <span className="text-ink-soft">·</span> {line}
                    </motion.div>
                  ))}
                  {running && <div className="animate-pulse text-ink-soft">▍</div>}
                </div>
              </motion.div>
            </motion.section>
          )}
        </AnimatePresence>

        {/* ── the receipt ──────────────────────── */}
        <div ref={resultRef} className="mx-auto mt-10 max-w-6xl scroll-mt-24 px-5">
          {fatal && (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-xl border border-dashed border-loss p-5 font-display text-sm tracking-wider text-loss"
            >
              ⚠ {fatal}
            </motion.div>
          )}
          {report && <Receipt report={report} analystPending={analystPending} />}
        </div>

        {/* ── the sweep ────────────────────────── */}
        <div className="sweep-lane relative mt-28 h-16 overflow-hidden border-y border-noir-line bg-noir-900/60">
          <div className="sweep-chips absolute top-1/2 flex -translate-y-1/2 items-center gap-3">
            <svg viewBox="0 0 64 64" className="h-9 w-9 text-gold-400" fill="none" aria-hidden="true">
              <g stroke="currentColor" strokeWidth="5" strokeLinecap="round">
                <path d="M48 9 L26 37" />
                <path d="M10 42 L38 42" />
              </g>
            </svg>
            {[5, 4, 3].map((n) => (
              <span key={n} className="h-3.5 w-3.5 rounded-full bg-gold-400" style={{ opacity: n / 5 }} />
            ))}
            <span className="h-3.5 w-3.5 rounded-full border-2 border-gold-400" />
            <span className="ml-3 whitespace-nowrap font-mono text-[11px] uppercase tracking-[0.2em] text-cream-dim">
              the house collects
            </span>
          </div>
        </div>

        <LiveBoard />
        <HowItWorks />

        {/* ── 04 · beyond the page ─────────────── */}
        <section className="mx-auto mt-32 max-w-6xl px-5">
          <div className="flex items-center gap-3 text-[11px] uppercase tracking-[0.3em] text-cream-dim">
            <span className="font-display text-gold-400">04</span>
            <span className="h-px w-10 bg-noir-line" />
            beyond the page
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <a
              href={BOT_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="group rounded-xl border border-noir-line bg-noir-900 p-6 transition hover:border-gold-400/50"
            >
              <Send className="h-5 w-5 text-gold-400" />
              <h3 className="mt-3 font-display text-sm font-bold uppercase tracking-[0.14em] text-cream">The watch - @basedrakebot</h3>
              <p className="mt-2 text-[13px] leading-relaxed text-cream-dim">
                A guard, not a lookup. /watch any token and Telegram pings you the moment the house starts
                collecting - rake over your threshold or a 3x drain, receipts attached. Serverless, forever.
              </p>
              <span className="mt-3 inline-block text-[13px] text-gold-400 transition group-hover:translate-x-1">open the bot →</span>
            </a>
            <Link href="/docs/usage#the-deep-pass" className="group rounded-xl border border-noir-line bg-noir-900 p-6 transition hover:border-gold-400/50">
              <BookOpen className="h-5 w-5 text-gold-400" />
              <h3 className="mt-3 font-display text-sm font-bold uppercase tracking-[0.14em] text-cream">The deep pass - for agents</h3>
              <p className="mt-2 text-[13px] leading-relaxed text-cream-dim">
                One GET, one nickel. Any agent pays $0.05 USDC over x402 and receives the full forensic receipt:
                every seller funding-walked, two-hop cluster graphs. No account, no API key.
              </p>
              <span className="mt-3 inline-block text-[13px] text-gold-400 transition group-hover:translate-x-1">read the API docs →</span>
            </Link>
          </div>
        </section>
      </main>

      <footer className="mx-auto mt-28 max-w-6xl border-t border-noir-line px-5 py-10 text-[13px] text-cream-dim">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <span>
            Built on Base for the <span className="text-gold-400">Orion Builder Hackathon</span>.
          </span>
          <a className="flex items-center gap-1.5 hover:text-cream" href={BOT_URL} target="_blank" rel="noopener noreferrer"><Send className="h-3.5 w-3.5" /> @basedrakebot</a>
          <a className="flex items-center gap-1.5 hover:text-cream" href={GITHUB_URL} target="_blank" rel="noopener noreferrer"><GitHubIcon className="h-3.5 w-3.5" /> GitHub</a>
          <Link className="flex items-center gap-1.5 hover:text-cream" href="/docs"><BookOpen className="h-3.5 w-3.5" /> Docs</Link>
        </div>
        <p className="mt-3 opacity-75">Data: Base RPC logs, Dexscreener, Alchemy transfers. Not financial advice - it's a receipt.</p>
      </footer>
    </div>
  );
}
