import Nav from '../../components/Nav.jsx';

const PAGES = [
  { slug: 'overview', title: 'Overview' },
  { slug: 'how-it-works', title: 'How it works' },
  { slug: 'usage', title: 'Usage' },
];

export const metadata = { title: 'RAKE Docs' };

export default function DocsLayout({ children }) {
  return (
    <>
      <Nav />
      <div className="mx-auto flex max-w-6xl gap-10 px-5 py-10">
        <aside className="hidden w-48 shrink-0 md:block">
          <p className="font-display text-xs font-bold uppercase tracking-[0.18em] text-gold-400">Docs</p>
          <nav className="mt-4 flex flex-col gap-1">
            {PAGES.map((p) => (
              <a
                key={p.slug}
                href={`/docs/${p.slug}`}
                className="rounded-lg px-3 py-2 text-[13px] text-cream-dim transition hover:bg-noir-800 hover:text-cream"
              >
                {p.title}
              </a>
            ))}
          </nav>
        </aside>
        <div className="min-w-0 flex-1">
          <nav className="mb-6 flex gap-2 md:hidden">
            {PAGES.map((p) => (
              <a key={p.slug} href={`/docs/${p.slug}`} className="rounded-full border border-noir-line px-3 py-1 text-[13px] text-gold-400">
                {p.title}
              </a>
            ))}
          </nav>
          {children}
        </div>
      </div>
    </>
  );
}
