'use client';

import { Send, BookOpen } from 'lucide-react';
import GitHubIcon from './GitHubIcon.jsx';
import Mark from './Mark.jsx';
import { BOT_URL, GITHUB_URL } from '../lib/links.js';

export default function Nav() {
  return (
    <header className="sticky top-0 z-40 border-b border-noir-line bg-noir-950/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-5 py-3.5 text-gold-400">
        <a href="/" className="flex items-center gap-3">
          <Mark className="h-8 w-8" />
          <span className="font-display text-xl font-black tracking-[0.08em]">RAKE</span>
        </a>
        <nav className="ml-auto flex items-center gap-1 text-[13px] text-cream-dim sm:gap-2">
          <a href="/#tape" className="hidden rounded-lg px-3 py-1.5 transition hover:bg-noir-800 hover:text-cream md:block">Pull the tape</a>
          <a href="/#board" className="hidden rounded-lg px-3 py-1.5 transition hover:bg-noir-800 hover:text-cream sm:block">Leaderboard</a>
          <a href="/#how" className="hidden rounded-lg px-3 py-1.5 transition hover:bg-noir-800 hover:text-cream sm:block">How it works</a>
          <a href="/docs" className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition hover:bg-noir-800 hover:text-cream">
            <BookOpen className="h-3.5 w-3.5" /> Docs
          </a>
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
