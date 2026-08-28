'use client';

// Slim nav: transparent at rest, backdrop when scrolled, hides on scroll-down
// and returns on scroll-up. Client-side navigation via next/link.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Send, BookOpen } from 'lucide-react';
import GitHubIcon from './GitHubIcon.jsx';
import Mark from './Mark.jsx';
import { BOT_URL, GITHUB_URL } from '../lib/links.js';

export default function Nav() {
  const [hidden, setHidden] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    let last = 0;
    const onScroll = () => {
      const y = window.scrollY;
      setScrolled(y > 24);
      setHidden(y > last && y > 160);
      last = y;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${hidden ? '-translate-y-full' : 'translate-y-0'} ${
        scrolled ? 'border-b border-noir-line bg-noir-950/85 backdrop-blur' : 'border-b border-transparent'
      }`}
    >
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-5 py-3 text-gold-400">
        <Link href="/" className="flex items-center gap-3">
          <Mark className="h-7 w-7" />
          <span className="font-display text-lg font-black tracking-[0.08em]">RAKE</span>
        </Link>
        <nav className="ml-auto flex items-center gap-1 text-[13px] text-cream-dim sm:gap-2">
          <Link href="/#floor" className="hidden rounded-lg px-3 py-1.5 transition hover:bg-noir-800 hover:text-cream sm:block">The floor</Link>
          <Link href="/#house" className="hidden rounded-lg px-3 py-1.5 transition hover:bg-noir-800 hover:text-cream md:block">House rules</Link>
          <Link href="/docs" className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition hover:bg-noir-800 hover:text-cream">
            <BookOpen className="h-3.5 w-3.5" /> Docs
          </Link>
          <a href={BOT_URL} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-gold-400 transition hover:bg-noir-800">
            <Send className="h-3.5 w-3.5" /> Bot
          </a>
          <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" aria-label="GitHub" className="rounded-lg px-3 py-1.5 transition hover:bg-noir-800 hover:text-cream">
            <GitHubIcon className="h-4 w-4" />
          </a>
        </nav>
      </div>
    </header>
  );
}
