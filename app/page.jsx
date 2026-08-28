'use client';

// RAKE - the table. Noir casino: graphite, champagne gold, cream receipts.

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useGSAP } from '@gsap/react';
import { Flame, Loader2, Play, Wallet, Send, BookOpen } from 'lucide-react';
import GitHubIcon from '../components/GitHubIcon.jsx';
import Nav from '../components/Nav.jsx';
import Receipt from '../components/Receipt.jsx';
import HowItWorks from '../components/HowItWorks.jsx';
import LiveBoard from '../components/LiveBoard.jsx';
import { isAddress } from '../lib/format.js';
import { BOT_URL, GITHUB_URL } from '../lib/links.js';

gsap.registerPlugin(ScrollTrigger, useGSAP);

const WINDOWS = ['1', '4', '24'];
const HEADLINE = ['Every', 'candle', 'has', 'a', 'house.'];

export default function Page() {
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
  const heroRef = useRef(null);

  useGSAP(
    () => {
      // headline: words dealt in like cards
      gsap.from('.hero-word', {
        yPercent: 120,
        opacity: 0,
        rotateX: -40,
        stagger: 0.09,
        duration: 0.8,
        ease: 'power3.out',
      });
      gsap.from('.hero-sub, .hero-form', { opacity: 0, y: 24, delay: 0.5, duration: 0.7, stagger: 0.12, ease: 'power2.out' });
      // scroll progress bar
      gsap.to('.progress-bar', {
        scaleX: 1,
        ease: 'none',
        scrollTrigger: { start: 0, end: 'max', scrub: 0.3 },
      });
      // glow parallax
      gsap.to('.hero-glow', {
        yPercent: 35,
        opacity: 0.25,
        ease: 'none',
        scrollTrigger: { trigger: heroRef.current, start: 'top top', end: 'bottom top', scrub: true },
      });
      // the rake sweep: chips dragged across the divider as you scroll past the hero
      gsap.fromTo(
        '.sweep-chips',
        { x: '-12vw' },
        {
          x: '88vw',
          ease: 'none',
          scrollTrigger: { trigger: '.sweep-lane', start: 'top 95%', end: 'top 25%', scrub: 0.5 },
        },
      );
    },
    { scope: heroRef },
  );

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
    <div ref={heroRef}>
      <div className="progress-bar fixed inset-x-0 top-0 z-50 h-0.5 origin-left scale-x-0 bg-gold-400" />
      <Nav />

      <main className="relative overflow-x-clip">
        <div
          aria-hidden
          className="hero-glow pointer-events-none absolute left-1/2 top-[-260px] h-[560px] w-[900px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(233,193,94,0.14),transparent)]"
        />

        {/* hero */}
        <section className="mx-auto max-w-6xl px-5 pt-20 text-center">
          <h1 className="font-display text-[clamp(34px,6.4vw,64px)] font-black leading-[1.05] tracking-wide text-cream" style={{ perspective: 600 }}>
            {HEADLINE.map((w, i) => (
              <span key={i} className="inline-block overflow-hidden pb-1 align-bottom">
                <span className={`hero-word inline-block ${w === 'house.' ? 'text-gold-400' : ''}`}>{w}&nbsp;</span>
              </span>
            ))}
          </h1>
          <p className="hero-sub mx-auto mt-5 max-w-[62ch] text-cream-dim">
            Onchain market forensics for Base. Paste a token - RAKE reconstructs the real swaps, names who
            extracted the money, and prints the receipt. Every number is a log or a quote, never an opinion.
          </p>
        </section>

        {/* form */}
        <section id="tape" className="hero-form mx-auto mt-10 max-w-6xl scroll-mt-24 px-5">
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

        {/* trace */}
        <AnimatePresence>
          {(trace.length > 0 || running) && (
            <motion.section
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mx-auto mt-6 max-w-6xl px-5"
            >
              <div className="overflow-hidden rounded-xl border border-noir-line">
                <div className="flex items-center gap-2 bg-noir-800 px-4 py-2 text-[11px] uppercase tracking-[0.12em] text-cream-dim">
                  <span className={`h-2 w-2 rounded-full ${running ? 'animate-pulse bg-win' : 'bg-cream-dim'}`} />
                  live trace - every line is a real call
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
          {report && <Receipt report={report} />}
        </div>

        {/* the rake sweep divider */}
        <div className="sweep-lane relative mt-24 h-16 overflow-hidden border-y border-noir-line bg-noir-900/60">
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

        {/* watch + deep pass CTA */}
        <section className="mx-auto mt-24 grid max-w-5xl gap-4 px-5 sm:grid-cols-2">
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
              collecting - rake over your threshold or a 3x drain, receipts attached. Runs serverless, forever.
            </p>
            <span className="mt-3 inline-block text-[13px] text-gold-400 transition group-hover:translate-x-1">open the bot →</span>
          </a>
          <a href="/docs/usage#the-deep-pass" className="group rounded-xl border border-noir-line bg-noir-900 p-6 transition hover:border-gold-400/50">
            <BookOpen className="h-5 w-5 text-gold-400" />
            <h3 className="mt-3 font-display text-sm font-bold uppercase tracking-[0.14em] text-cream">The deep pass - for agents</h3>
            <p className="mt-2 text-[13px] leading-relaxed text-cream-dim">
              One GET, one nickel. Any agent pays $0.05 USDC over x402 and receives the full forensic receipt:
              every seller funding-walked, two-hop cluster graphs. No account, no API key.
            </p>
            <span className="mt-3 inline-block text-[13px] text-gold-400 transition group-hover:translate-x-1">read the API docs →</span>
          </a>
        </section>
      </main>

      <footer className="mx-auto mt-24 max-w-6xl border-t border-noir-line px-5 py-10 text-[13px] text-cream-dim">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <span>
            Built on Base for the <span className="text-gold-400">Orion Builder Hackathon</span>.
          </span>
          <a className="flex items-center gap-1.5 hover:text-cream" href={BOT_URL} target="_blank" rel="noopener noreferrer"><Send className="h-3.5 w-3.5" /> @basedrakebot</a>
          <a className="flex items-center gap-1.5 hover:text-cream" href={GITHUB_URL} target="_blank" rel="noopener noreferrer"><GitHubIcon className="h-3.5 w-3.5" /> GitHub</a>
          <a className="flex items-center gap-1.5 hover:text-cream" href="/docs"><BookOpen className="h-3.5 w-3.5" /> Docs</a>
        </div>
        <p className="mt-3 opacity-75">Data: Base RPC logs, Dexscreener, Alchemy transfers. Not financial advice - it's a receipt.</p>
      </footer>
    </div>
  );
}
