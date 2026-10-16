import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Check } from 'lucide-react';
import BrandLogo from '@/components/public/BrandLogo';

const POINTS = [
  'Upload a VCF and get annotated, filterable variants.',
  'ACMG classification and phenotype-driven ranking run in deterministic pipelines.',
  'Ask questions in plain language; every answer points back to the data.',
];

const PILL_LINK =
  'inline-flex h-9 items-center gap-1.5 rounded-full border border-transparent px-3.5 text-[13px] text-muted-foreground outline-none transition-colors duration-150 hover:border-[hsl(var(--wb-line))] hover:bg-[hsl(var(--wb-card))] hover:text-foreground focus-visible:ring-2 focus-visible:ring-[hsl(var(--brand-500))]';

/**
 * Split layout shared by /auth and the in-app sign-in gate. Left: a calm, static statement
 * of what the product does (desktop only). Right: the form in a white hairline card on the
 * canvas, one column on mobile.
 */
const AuthPageLayout = ({ children, showHomeLink = false }) => (
  <div className="wb-scope pub-scope min-h-dvh font-sans text-foreground lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
    <aside className="pub-aside tx tx--lattice hidden flex-col justify-between px-12 py-10 lg:flex xl:px-16">
      <Link to="/" aria-label="Geneie home" className="inline-flex w-fit rounded-md outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--brand-500))]">
        <BrandLogo className="h-9 w-auto" />
      </Link>

      <div className="max-w-md">
        <h1 className="text-[1.75rem] font-semibold leading-tight tracking-tight text-balance xl:text-[2rem]">
          Variant analysis you can ask questions of.
        </h1>
        <ul className="mt-7 space-y-3 text-sm leading-6 text-muted-foreground">
          {POINTS.map((p, i) => (
            <li key={p} className="wb-rise flex gap-3" style={{ animationDelay: `${120 + i * 70}ms` }}>
              <span
                className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border border-[hsl(var(--brand-200))] bg-[hsl(var(--brand-100))] text-[hsl(var(--brand-700))]"
                aria-hidden="true"
              >
                <Check className="size-3" strokeWidth={2.4} />
              </span>
              <span>{p}</span>
            </li>
          ))}
        </ul>
      </div>

      <div aria-hidden="true" className="pub-helix tx tx--helix" style={{ position: 'absolute', insetInline: 0, bottom: '7rem', '--tx-fade': '50% 120%' }} />

      <p className="max-w-md text-xs leading-5 text-[var(--text-tertiary)]">
        Closed beta. Geneie supports research and professional review; it is not a diagnostic device.
      </p>
    </aside>

    <div className="flex min-h-dvh flex-col lg:min-h-0">
      <header className="flex items-center justify-between border-b border-[hsl(var(--wb-line))] bg-[var(--pub-tint)] px-5 py-4 sm:px-8 lg:hidden">
        <Link to="/" aria-label="Geneie home" className="inline-flex rounded-md outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--brand-500))]">
          <BrandLogo className="h-8 w-auto" />
        </Link>
        {showHomeLink && (
          <Link to="/" className={PILL_LINK}>
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Home
          </Link>
        )}
      </header>

      {showHomeLink && (
        <div className="hidden justify-end px-10 pt-8 lg:flex">
          <Link to="/" className={PILL_LINK}>
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back to home
          </Link>
        </div>
      )}

      <main className="flex flex-1 items-start justify-center px-5 pb-10 pt-6 sm:px-8 sm:pt-12 lg:items-center lg:pt-0">
        <div className="wb-card pub-card wb-rise w-full max-w-[26rem] p-6 sm:p-8" style={{ borderRadius: 20 }}>{children}</div>
      </main>

      <footer className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 px-5 pb-6 text-xs text-[var(--text-tertiary)]">
        <Link to="/legal/terms" className="rounded-full px-3 py-2 transition-colors hover:bg-[hsl(var(--wb-pill))] hover:text-foreground">Terms</Link>
        <Link to="/legal/privacy" className="rounded-full px-3 py-2 transition-colors hover:bg-[hsl(var(--wb-pill))] hover:text-foreground">Privacy</Link>
        <a href="mailto:support@geneie.chat" className="rounded-full px-3 py-2 transition-colors hover:bg-[hsl(var(--wb-pill))] hover:text-foreground">support@geneie.chat</a>
      </footer>
    </div>
  </div>
);

export default AuthPageLayout;
