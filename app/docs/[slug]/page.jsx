// Docs pages: markdown from /docs rendered statically in the noir theme.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { notFound } from 'next/navigation';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const SLUGS = ['overview', 'how-it-works', 'usage'];
export const dynamic = 'force-static';

export function generateStaticParams() {
  return SLUGS.map((slug) => ({ slug }));
}

const slugify = (children) =>
  String(Array.isArray(children) ? children.join('') : children)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

const components = {
  h1: ({ children }) => (
    <h1 className="font-display text-3xl font-black tracking-wide text-cream">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 id={slugify(children)} className="mt-10 scroll-mt-24 border-b border-noir-line pb-2 font-display text-xl font-bold tracking-wide text-gold-400">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 id={slugify(children)} className="mt-7 scroll-mt-24 font-display text-base font-bold tracking-wide text-cream">
      {children}
    </h3>
  ),
  p: ({ children }) => <p className="mt-4 leading-relaxed text-cream-dim">{children}</p>,
  a: ({ href, children }) => (
    <a href={href} className="text-gold-400 underline decoration-dotted underline-offset-2 hover:decoration-solid">
      {children}
    </a>
  ),
  strong: ({ children }) => <strong className="font-semibold text-cream">{children}</strong>,
  ul: ({ children }) => <ul className="mt-4 list-disc space-y-2 pl-5 text-cream-dim marker:text-gold-400">{children}</ul>,
  ol: ({ children }) => <ol className="mt-4 list-decimal space-y-2 pl-5 text-cream-dim marker:text-gold-400">{children}</ol>,
  blockquote: ({ children }) => (
    <blockquote className="mt-4 border-l-2 border-gold-400 pl-4 italic text-cream">{children}</blockquote>
  ),
  code: ({ children, className }) =>
    className ? (
      <code className="font-mono text-[13px] text-gold-300">{children}</code>
    ) : (
      <code className="rounded bg-noir-800 px-1.5 py-0.5 font-mono text-[13px] text-gold-400">{children}</code>
    ),
  pre: ({ children }) => (
    <pre className="mt-4 overflow-x-auto rounded-xl border border-noir-line bg-noir-950 p-4">{children}</pre>
  ),
  table: ({ children }) => (
    <div className="mt-4 overflow-x-auto rounded-xl border border-noir-line">
      <table className="w-full border-collapse text-[13px]">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-noir-800 text-left text-cream">{children}</thead>,
  th: ({ children }) => <th className="px-4 py-2.5 font-semibold">{children}</th>,
  td: ({ children }) => <td className="border-t border-noir-line/50 px-4 py-2.5 text-cream-dim">{children}</td>,
  hr: () => <hr className="mt-8 border-noir-line" />,
};

export default async function DocsPage({ params }) {
  const { slug } = await params;
  if (!SLUGS.includes(slug)) notFound();
  const md = readFileSync(join(process.cwd(), 'docs', `${slug}.md`), 'utf8');
  return (
    <article className="max-w-3xl pb-16 text-[15px]">
      <Markdown remarkPlugins={[remarkGfm]} components={components}>
        {md}
      </Markdown>
    </article>
  );
}
