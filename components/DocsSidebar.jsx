'use client';

// Sticky docs nav with active-page state; client-side navigation, no reloads.

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const PAGES = [
  { slug: 'overview', title: 'Overview' },
  { slug: 'how-it-works', title: 'How it works' },
  { slug: 'usage', title: 'Usage' },
];

export default function DocsSidebar() {
  const pathname = usePathname();
  return (
    <>
      <aside className="hidden w-48 shrink-0 md:block">
        <div className="sticky top-24">
          <p className="font-display text-xs font-bold uppercase tracking-[0.18em] text-gold-400">Docs</p>
          <nav className="mt-4 flex flex-col gap-1">
            {PAGES.map((p) => {
              const active = pathname === `/docs/${p.slug}`;
              return (
                <Link
                  key={p.slug}
                  href={`/docs/${p.slug}`}
                  className={`rounded-lg border-l-2 px-3 py-2 text-[13px] transition ${
                    active
                      ? 'border-gold-400 bg-noir-800 text-gold-400'
                      : 'border-transparent text-cream-dim hover:bg-noir-800 hover:text-cream'
                  }`}
                >
                  {p.title}
                </Link>
              );
            })}
          </nav>
        </div>
      </aside>
      <nav className="mb-6 flex gap-2 md:hidden">
        {PAGES.map((p) => {
          const active = pathname === `/docs/${p.slug}`;
          return (
            <Link
              key={p.slug}
              href={`/docs/${p.slug}`}
              className={`rounded-full border px-3 py-1 text-[13px] ${
                active ? 'border-gold-400 bg-noir-800 text-gold-400' : 'border-noir-line text-cream-dim'
              }`}
            >
              {p.title}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
