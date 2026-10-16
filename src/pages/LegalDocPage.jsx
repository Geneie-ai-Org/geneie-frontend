import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Printer } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useSeo } from '@/hooks/useSeo';
import BrandLogo from '@/components/public/BrandLogo';
import { Button } from '@/components/ui/button';
import { SelectionMarker } from '@/components/motion';

const DOCS = {
  terms: {
    file: '/legal/terms.md',
    title: 'Terms of Use',
    path: '/legal/terms',
    description: 'The terms that govern access to and use of Geneie during closed beta.',
  },
  privacy: {
    file: '/legal/privacy.md',
    title: 'Privacy Policy',
    path: '/legal/privacy',
    description: 'What Geneie collects, how it is used and processed, and your choices during closed beta.',
  },
};

/**
 * Splits the front block (`# Title`, Version/Effective/Product lines) off the body so the
 * page can render it as a header instead of repeating it as markdown.
 */
function splitFrontMatter(markdown) {
  const meta = {};
  let body = markdown;

  const heading = body.match(/^#\s+(.+)\n/);
  if (heading) body = body.slice(heading[0].length);

  const metaLine = /^\*\*(Version|Effective|Product):\*\*\s*`?([^`\n]+?)`?\s*$/;
  const lines = body.split('\n');
  let consumed = 0;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      consumed += 1;
      continue;
    }
    const m = trimmed.match(metaLine);
    if (!m) break;
    meta[m[1].toLowerCase()] = m[2].trim();
    consumed += 1;
  }
  body = lines.slice(consumed).join('\n').replace(/^\s*---\s*\n/, '').trim();

  return { meta, body };
}

function nodeText(children) {
  return React.Children.toArray(children)
    .map((c) => (typeof c === 'string' ? c : c?.props?.children ? nodeText(c.props.children) : ''))
    .join('');
}

const slugify = (text) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

/** Level-2 headings of the document body, for the in-page nav. */
function extractSections(body) {
  return body
    .split('\n')
    .map((l) => l.match(/^##\s+(.+?)\s*$/))
    .filter(Boolean)
    .map((m) => ({ id: slugify(m[1].replace(/[`*_]/g, '')), title: m[1].replace(/[`*_]/g, '') }));
}

const MARKDOWN_COMPONENTS = {
  h2: ({ children }) => (
    <h2 id={slugify(nodeText(children))} className="mt-10 mb-3 text-lg font-semibold tracking-tight text-[var(--text-primary)] scroll-mt-24 first:mt-0">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="mt-8 mb-2 text-sm font-semibold tracking-tight text-[var(--text-primary)]">
      {children}
    </h3>
  ),
  p: ({ children }) => (
    <p className="my-4 text-[0.9375rem] leading-[1.75] text-[var(--text-secondary)]">{children}</p>
  ),
  ul: ({ children }) => (
    <ul className="my-4 space-y-2 pl-5 text-[0.9375rem] leading-[1.75] text-[var(--text-secondary)] marker:text-[var(--text-tertiary)] list-disc">
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="my-4 space-y-2 pl-5 text-[0.9375rem] leading-[1.75] text-[var(--text-secondary)] marker:text-[var(--text-tertiary)] list-decimal">
      {children}
    </ol>
  ),
  li: ({ children }) => <li className="pl-1">{children}</li>,
  strong: ({ children }) => (
    <strong className="font-semibold text-[var(--text-primary)]">{children}</strong>
  ),
  a: ({ children, href }) => (
    <a
      href={href}
      target={href?.startsWith('http') ? '_blank' : undefined}
      rel="noreferrer"
      className="text-[hsl(var(--brand-700))] underline underline-offset-4 decoration-[hsl(var(--brand-300))] hover:decoration-[hsl(var(--brand-500))] transition-colors"
    >
      {children}
    </a>
  ),
  code: ({ children }) => (
    <code className="rounded-full border border-[hsl(var(--wb-line))] bg-[hsl(var(--wb-pill))] px-2 py-0.5 font-mono text-[0.8125rem] text-[var(--text-primary)]">
      {children}
    </code>
  ),
  hr: () => <hr className="my-8 border-0 border-t border-[hsl(var(--wb-line))] print:hidden" />,
  blockquote: ({ children }) => (
    <blockquote className="my-4 rounded-2xl border border-[hsl(var(--brand-200))] bg-[hsl(var(--brand-50))] px-4 py-3 text-[0.9375rem] leading-[1.75] text-[var(--text-secondary)]">
      {children}
    </blockquote>
  ),
  table: ({ children }) => (
    <div className="my-6 overflow-x-auto rounded-2xl border border-[hsl(var(--wb-line))]">
      <table className="w-full text-left text-[0.875rem]">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border-b border-[hsl(var(--wb-line))] bg-[hsl(var(--wb-pill))] px-3 py-2 font-semibold text-[var(--text-primary)]">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border-b border-[hsl(var(--wb-line))] px-3 py-2 align-top text-[var(--text-secondary)]">
      {children}
    </td>
  ),
};

/** Renders public/legal/{terms|privacy}.md as a styled document. */
export default function LegalDocPage({ doc }) {
  const active = DOCS[doc] || DOCS.terms;
  const activeKey = DOCS[doc] ? doc : 'terms';
  const [raw, setRaw] = useState('');
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [activeSection, setActiveSection] = useState('');

  // Without this the page keeps index.html's canonical (the landing page), which tells
  // search engines these documents are duplicates of `/` and keeps them out of the index.
  useSeo({ title: `${active.title} · Geneie`, description: active.description, path: active.path });

  useEffect(() => {
    let cancelled = false;
    setRaw('');
    setError('');
    fetch(active.file)
      .then((r) => {
        if (!r.ok) throw new Error('Document not found');
        return r.text();
      })
      .then((t) => {
        if (!cancelled) setRaw(t);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message || 'Failed to load');
      });
    return () => {
      cancelled = true;
    };
  }, [active.file, attempt]);

  const { meta, body } = useMemo(() => splitFrontMatter(raw), [raw]);
  const sections = useMemo(() => extractSections(body), [body]);

  // Highlight the section being read in the in-page nav.
  useEffect(() => {
    if (!sections.length || typeof IntersectionObserver === 'undefined') return undefined;
    const els = sections.map((s) => document.getElementById(s.id)).filter(Boolean);
    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActiveSection(visible[0].target.id);
      },
      { rootMargin: '-72px 0px -65% 0px', threshold: 0 },
    );
    els.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [sections]);

  const jump = (e, id) => {
    e.preventDefault();
    document.getElementById(id)?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    setActiveSection(id);
    try { window.history.replaceState(null, '', `#${id}`); } catch { /* ignore */ }
  };

  const navLink = (id, title, group) => (
    <a
      key={id}
      href={`#${id}`}
      onClick={(e) => jump(e, id)}
      aria-current={activeSection === id ? 'location' : undefined}
      className={`relative block rounded-full px-3.5 py-1.5 text-[0.8125rem] leading-5 outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-[hsl(var(--brand-500))] ${
        activeSection === id
          ? 'font-medium text-[hsl(var(--brand-700))]'
          : 'text-muted-foreground hover:bg-[hsl(var(--wb-pill))] hover:text-foreground'
      }`}
    >
      {activeSection === id ? <SelectionMarker group={group} bar={false} /> : null}
      <span className="relative">{title}</span>
    </a>
  );

  return (
    <div className="wb-scope min-h-dvh text-foreground">
      <header className="sticky top-0 z-20 border-b border-[hsl(var(--wb-line))] bg-[hsl(var(--wb-bg))] print:hidden">
        <div className="mx-auto flex h-14 max-w-[68rem] items-center justify-between gap-4 px-5 sm:px-8">
          <Link to="/" aria-label="Geneie home" className="inline-flex rounded-md outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--brand-500))]">
            <BrandLogo className="h-7 w-auto" />
          </Link>
          <nav aria-label="Legal documents" className="flex items-center gap-1">
            {Object.entries(DOCS).map(([key, d]) => (
              <Link
                key={key}
                to={d.path}
                aria-current={key === activeKey ? 'page' : undefined}
                data-selected={key === activeKey ? 'true' : 'false'}
                className="wb-tab px-3.5 text-[13px] font-medium outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--brand-500))]"
              >
                {d.title.split(' ')[0]}
              </Link>
            ))}
            <Link
              to="/app"
              className="wb-tab ml-1 !hidden px-3.5 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--brand-500))] sm:!flex"
            >
              Open app
            </Link>
          </nav>
        </div>
      </header>

      <div className="mx-auto grid max-w-[68rem] gap-x-10 px-5 pb-20 pt-8 sm:px-8 lg:grid-cols-[13rem_minmax(0,1fr)] print:block print:px-0 print:pt-0">
        {/* In-page nav: sticky column on desktop, collapsible on mobile */}
        <aside className="print:hidden lg:order-first">
          {sections.length > 0 && (
            <>
              <details className="wb-card mb-6 lg:hidden">
                <summary className="flex min-h-11 cursor-pointer items-center px-4 text-sm font-medium">
                  On this page
                </summary>
                <div className="border-t border-[hsl(var(--wb-line))] p-2">{sections.map((s) => navLink(s.id, s.title, 'legal-m'))}</div>
              </details>
              <nav aria-label="On this page" className="sticky top-24 hidden max-h-[calc(100dvh-8rem)] overflow-y-auto lg:block">
                <p className="mb-2 pl-3.5 text-xs font-medium text-[var(--text-tertiary)]">On this page</p>
                {sections.map((s) => navLink(s.id, s.title, 'legal-d'))}
              </nav>
            </>
          )}
        </aside>

        <main className="wb-card wb-rise min-w-0 max-w-[48rem] p-6 sm:p-10 print:max-w-none print:border-0 print:bg-transparent print:p-0" style={{ borderRadius: 20 }}>
          <h1 className="text-[1.75rem] font-semibold leading-tight tracking-tight sm:text-[2rem]">{active.title}</h1>

          {(meta.version || meta.effective) && (
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-muted-foreground">
              {meta.effective && <span>Effective {meta.effective}</span>}
              {meta.version && (
                <span className="wb-chip font-mono tabular-nums">Version {meta.version}</span>
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => window.print()}
                className="ml-auto h-8 gap-1.5 px-3 text-muted-foreground print:hidden"
              >
                <Printer className="h-3.5 w-3.5" aria-hidden="true" /> Print
              </Button>
            </div>
          )}

          <hr className="mt-6 border-0 border-t border-[hsl(var(--wb-line))]" />

          {error ? (
            <div role="alert" className="wb-rise mt-8 rounded-2xl border border-[var(--error)]/25 bg-[var(--error-soft)] p-4 text-sm">
              <p className="font-medium text-[var(--error)]">We could not load this document.</p>
              <p className="mt-1 text-muted-foreground">{error}. Check your connection and try again.</p>
              <Button type="button" variant="outline" className="mt-3 h-9" onClick={() => setAttempt((n) => n + 1)}>
                Try again
              </Button>
            </div>
          ) : !raw ? (
            <div role="status" aria-label="Loading document" className="mt-8 space-y-3" aria-busy="true">
              {[92, 100, 84, 96, 60].map((w, i) => (
                <div key={i} className="wb-shimmer h-3.5 rounded-full" style={{ width: `${w}%` }} />
              ))}
              <div className="h-4" />
              {[100, 88, 94].map((w, i) => (
                <div key={i} className="wb-shimmer h-3.5 rounded-full" style={{ width: `${w}%` }} />
              ))}
              <span className="sr-only">Loading document…</span>
            </div>
          ) : (
            <article className="mt-6">
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={MARKDOWN_COMPONENTS}>
                {body}
              </ReactMarkdown>
            </article>
          )}

          <p className="mt-12 border-t border-[hsl(var(--wb-line))] pt-6 text-sm text-muted-foreground">
            Questions about this document? Email{' '}
            <a className="text-[hsl(var(--brand-700))] underline underline-offset-2" href="mailto:support@geneie.chat">support@geneie.chat</a>.
          </p>
        </main>
      </div>
    </div>
  );
}
