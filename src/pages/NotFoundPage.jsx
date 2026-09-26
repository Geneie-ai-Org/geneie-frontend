import React, { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowLeft, MessageSquare } from 'lucide-react';
import { useTheme } from '@/hooks/useTheme';
import { useSeo } from '@/hooks/useSeo';
import { capture } from '@/lib/analytics';
import BrokenHelix from '@/components/BrokenHelix';

/**
 * Catch-all for unknown routes. Previously `*` redirected to `/`, which hid broken links;
 * this shows the requested path instead and reports it, so bad inbound links surface.
 */
export default function NotFoundPage() {
  const { pathname } = useLocation();
  const { isDark } = useTheme();

  useSeo({
    title: 'Page not found · Geneie',
    description: 'This page does not exist.',
    path: pathname,
    noindex: true,
  });

  useEffect(() => {
    capture('page_not_found', { path: pathname });
  }, [pathname]);

  return (
    <div className="flex min-h-screen flex-col bg-[var(--bg-app)] text-[var(--text-primary)]">
      <header className="px-6 py-5">
        <Link to="/" aria-label="Geneie home" className="inline-flex">
          <img
            src={isDark ? '/logo/Final gene dark.svg' : '/logo/Final gene light.svg'}
            alt="Geneie"
            className="h-8 w-auto"
          />
        </Link>
      </header>

      <main className="flex flex-1 items-center justify-center px-6 pb-24">
        <div className="w-full max-w-[28rem] text-center">
          <BrokenHelix className="mx-auto mb-8 h-auto w-full max-w-[20rem]" />
          <p className="font-mono text-xs font-medium uppercase tracking-[0.2em] text-[var(--accent-teal)]">
            Error 404
          </p>
          <h1 className="mt-3 text-[2rem] font-semibold leading-tight tracking-tight">
            Page not found
          </h1>
          <p className="mt-3 text-sm text-[var(--text-secondary)]">
            Nothing lives at this address. The link may be mistyped, or the page may have moved.
          </p>

          <code className="mt-6 block truncate rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface-raised)] px-3 py-2 font-mono text-[0.8125rem] text-[var(--text-secondary)]">
            {pathname}
          </code>

          <div className="mt-8 flex flex-col items-stretch justify-center gap-2 sm:flex-row sm:items-center">
            <Link
              to="/app"
              className="inline-flex h-10 items-center justify-center gap-2 rounded-full bg-[var(--text-primary)] px-5 text-sm font-medium text-[var(--bg-app)] transition-opacity hover:opacity-85"
            >
              <MessageSquare className="h-4 w-4" />
              Open app
            </Link>
            <Link
              to="/"
              className="inline-flex h-10 items-center justify-center gap-2 rounded-full border border-[var(--border-subtle)] px-5 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
            >
              <ArrowLeft className="h-4 w-4" />
              Go home
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
