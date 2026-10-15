import React, { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useSeo } from '@/hooks/useSeo';
import { capture } from '@/lib/analytics';
import BrandLogo from '@/components/public/BrandLogo';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Catch-all for unknown routes. Previously `*` redirected to `/`, which hid broken links;
 * this shows the requested path instead and reports it, so bad inbound links surface.
 */
export default function NotFoundPage() {
  const { pathname } = useLocation();

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
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <header className="px-5 py-4 sm:px-8">
        <Link to="/" aria-label="Geneie home" className="inline-flex rounded-md">
          <BrandLogo className="h-8 w-auto" />
        </Link>
      </header>

      <main className="flex flex-1 items-center justify-center px-5 pb-24">
        <div className="w-full max-w-md">
          <p className="font-mono text-xs text-[var(--text-tertiary)]">404</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">This page does not exist</h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            The link may be mistyped, or the page may have moved. Nothing was found at:
          </p>

          <code className="mt-3 block break-all rounded-lg border border-border bg-muted px-3 py-2 font-mono text-[0.8125rem] text-muted-foreground">
            {pathname}
          </code>

          <div className="mt-8 flex flex-col gap-2 sm:flex-row sm:items-center">
            <Link to="/app" className={cn(buttonVariants(), 'h-11 px-5 text-sm sm:h-10')}>
              Open Geneie
            </Link>
            <Link
              to="/"
              className="inline-flex h-11 items-center justify-center rounded-lg px-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground sm:h-10"
            >
              Back to home page
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
