import React, { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useSeo } from '@/hooks/useSeo';
import { capture } from '@/lib/analytics';
import BrandLogo from '@/components/public/BrandLogo';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * ASCII helix with a stretch missing, drawn from two sine strands so the pieces line up.
 * Built once at module load; the gap is where the page "should" be.
 */
const GLYPH = (() => {
  const cols = 46;
  const rows = 5;
  const gapFrom = 18;
  const gapTo = 28;
  const grid = Array.from({ length: rows }, () => Array(cols).fill(' '));
  for (let x = 0; x < cols; x += 1) {
    const inGap = x >= gapFrom && x < gapTo;
    const phase = (x / 14) * Math.PI * 2;
    const a = Math.round(2 - 2 * Math.sin(phase));
    const b = Math.round(2 + 2 * Math.sin(phase));
    if (inGap) {
      if (x % 3 === 0) grid[a][x] = '.';
      continue;
    }
    if (x % 3 === 0 && a !== b) {
      const [lo, hi] = a < b ? [a, b] : [b, a];
      for (let y = lo + 1; y < hi; y += 1) grid[y][x] = ':';
    }
    grid[a][x] = 'o';
    grid[b][x] = 'o';
  }
  return grid.map((r) => r.join('').trimEnd()).join('\n');
})();

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
    <div className="wb-scope pub-scope pub-hero tx tx--lattice flex min-h-dvh flex-col text-foreground" style={{ '--tx-at': '50% 42%', '--tx-fade': '50% 60%' }}>
      <header className="px-5 py-4 sm:px-8">
        <Link to="/" aria-label="Geneie home" className="inline-flex rounded-md outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--brand-500))]">
          <BrandLogo className="h-8 w-auto" />
        </Link>
      </header>

      <main className="flex flex-1 items-center justify-center px-5 pb-10">
        <div className="wb-card pub-card wb-rise w-full max-w-md p-6 sm:p-8" style={{ borderRadius: 20 }}>
          {/* A helix with a piece missing; decorative, so hidden from assistive tech. */}
          <pre
            aria-hidden="true"
            className="mb-5 select-none overflow-hidden font-mono text-[13px] leading-[1.25] text-[hsl(var(--brand-500))]"
          >{GLYPH}</pre>
          <span className="wb-chip font-mono tabular-nums">404</span>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight">This page does not exist</h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            The link may be mistyped, or the page may have moved. Nothing was found at:
          </p>

          <code className="mt-3 block break-all rounded-2xl border border-[hsl(var(--wb-line))] bg-[hsl(var(--wb-pill))] px-3.5 py-2 font-mono text-[0.8125rem] text-muted-foreground">
            {pathname}
          </code>

          <div className="mt-7 flex flex-col gap-2 sm:flex-row sm:items-center">
            <Link to="/app" className={cn(buttonVariants(), 'h-10 rounded-full bg-[hsl(var(--brand-solid))] px-5 text-sm text-[hsl(var(--on-brand))] hover:bg-[hsl(var(--brand-solid-hover))] active:scale-[0.97]')}>
              Open Geneie
            </Link>
            <Link
              to="/"
              className="inline-flex h-10 items-center justify-center rounded-full px-4 text-sm font-medium text-muted-foreground transition-colors hover:bg-[hsl(var(--wb-pill))] hover:text-foreground"
            >
              Back to home page
            </Link>
          </div>
        </div>
      </main>
      <div aria-hidden="true" className="pub-helix tx tx--helix" />
    </div>
  );
}
