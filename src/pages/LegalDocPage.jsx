import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Loader2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const DOCS = {
  terms: { file: '/legal/terms.md', title: 'Terms of Use', path: '/legal/terms' },
  privacy: { file: '/legal/privacy.md', title: 'Privacy Policy', path: '/legal/privacy' },
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

const MARKDOWN_COMPONENTS = {
  h2: ({ children }) => (
    <h2 className="mt-12 mb-3 text-lg font-semibold tracking-tight text-[var(--text-primary)] scroll-mt-24">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="mt-8 mb-2 text-sm font-semibold tracking-tight text-[var(--text-primary)]">
      {children}
    </h3>
  ),
  p: ({ children }) => (
    <p className="my-4 text-[0.9375rem] leading-7 text-[var(--text-secondary)]">{children}</p>
  ),
  ul: ({ children }) => (
    <ul className="my-4 space-y-2 pl-5 text-[0.9375rem] leading-7 text-[var(--text-secondary)] marker:text-[var(--text-tertiary)] list-disc">
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="my-4 space-y-2 pl-5 text-[0.9375rem] leading-7 text-[var(--text-secondary)] marker:text-[var(--text-tertiary)] list-decimal">
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
      className="text-[var(--accent-teal)] underline underline-offset-4 decoration-[var(--accent-teal-soft)] hover:decoration-[var(--accent-teal)] transition-colors"
    >
      {children}
    </a>
  ),
  code: ({ children }) => (
    <code className="rounded px-1.5 py-0.5 font-mono text-[0.8125rem] bg-[var(--bg-surface-raised)] text-[var(--text-primary)]">
      {children}
    </code>
  ),
  hr: () => <hr className="my-10 border-0 border-t border-[var(--border-subtle)]" />,
  blockquote: ({ children }) => (
    <blockquote className="my-4 rounded-lg px-4 py-3 text-[0.9375rem] leading-7 bg-[var(--bg-surface-raised)] text-[var(--text-secondary)]">
      {children}
    </blockquote>
  ),
  table: ({ children }) => (
    <div className="my-6 overflow-x-auto rounded-lg border border-[var(--border-subtle)]">
      <table className="w-full text-left text-[0.875rem]">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border-b border-[var(--border-subtle)] px-3 py-2 font-semibold text-[var(--text-primary)]">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border-b border-[var(--border-subtle)] px-3 py-2 align-top text-[var(--text-secondary)]">
      {children}
    </td>
  ),
};

/** Renders public/legal/{terms|privacy}.md as a styled document. */
export default function LegalDocPage({ doc }) {
  const active = DOCS[doc] || DOCS.terms;
  const [raw, setRaw] = useState('');
  const [error, setError] = useState('');

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
  }, [active.file]);

  const { meta, body } = useMemo(() => splitFrontMatter(raw), [raw]);

  return (
    <div className="min-h-screen bg-[var(--bg-app)] text-[var(--text-primary)]">
      <header
        className="sticky top-0 z-10 border-b border-[var(--border-subtle)] backdrop-blur-md"
        style={{ backgroundColor: 'color-mix(in srgb, var(--bg-app) 85%, transparent)' }}
      >
        <div className="mx-auto flex max-w-[46rem] items-center justify-between gap-4 px-6 py-3">
          <Link
            to="/app"
            className="inline-flex items-center gap-1.5 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to app
          </Link>
          <nav className="flex items-center gap-1 rounded-full border border-[var(--border-subtle)] p-0.5">
            {Object.entries(DOCS).map(([key, d]) => {
              const isActive = key === (DOCS[doc] ? doc : 'terms');
              return (
                <Link
                  key={key}
                  to={d.path}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    isActive
                      ? 'bg-[var(--accent-teal-soft)] text-[var(--accent-teal)]'
                      : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  {d.title.split(' ')[0]}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-[46rem] px-6 pb-24 pt-12">
        <h1 className="text-[2rem] font-semibold leading-tight tracking-tight">{active.title}</h1>

        {(meta.version || meta.effective || meta.product) && (
          <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-[var(--text-tertiary)]">
            {meta.version && (
              <span className="rounded-full bg-[var(--bg-surface-raised)] px-2.5 py-1 font-mono text-[0.6875rem] text-[var(--text-secondary)]">
                v{meta.version}
              </span>
            )}
            {meta.effective && <span>Effective {meta.effective}</span>}
            {meta.product && (
              <>
                <span aria-hidden="true">·</span>
                <span>{meta.product}</span>
              </>
            )}
          </div>
        )}

        <hr className="mt-8 border-0 border-t border-[var(--border-subtle)]" />

        {error ? (
          <p className="mt-8 text-sm text-[var(--error)]">{error}</p>
        ) : !raw ? (
          <div className="mt-10 flex items-center gap-2 text-sm text-[var(--text-tertiary)]">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : (
          <article className="mt-2">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={MARKDOWN_COMPONENTS}>
              {body}
            </ReactMarkdown>
          </article>
        )}
      </main>
    </div>
  );
}
