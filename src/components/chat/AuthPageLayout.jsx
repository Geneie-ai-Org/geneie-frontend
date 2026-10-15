import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import BrandLogo from '@/components/public/BrandLogo';

const POINTS = [
  'Upload a VCF and get annotated, filterable variants.',
  'ACMG classification and phenotype-driven ranking run in deterministic pipelines.',
  'Ask questions in plain language; every answer points back to the data.',
];

/**
 * Split layout shared by /auth and the in-app sign-in gate. Left: a calm, static statement
 * of what the product does (desktop only). Right: the form, one column on mobile.
 */
const AuthPageLayout = ({ children, showHomeLink = false }) => (
  <div className="min-h-dvh bg-background font-sans text-foreground lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
    <aside className="hidden flex-col justify-between border-r border-border bg-[var(--bg-surface-sunken)] px-12 py-10 lg:flex xl:px-16">
      <Link to="/" aria-label="Geneie home" className="inline-flex w-fit rounded-md">
        <BrandLogo className="h-9 w-auto" />
      </Link>

      <div className="max-w-md">
        <h1 className="text-[1.75rem] font-semibold leading-tight tracking-tight text-balance xl:text-[2rem]">
          Variant analysis you can ask questions of.
        </h1>
        <ul className="mt-6 space-y-3 text-sm leading-6 text-muted-foreground">
          {POINTS.map((p) => (
            <li key={p} className="flex gap-3">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden="true" />
              <span>{p}</span>
            </li>
          ))}
        </ul>
      </div>

      <p className="max-w-md text-xs leading-5 text-[var(--text-tertiary)]">
        Closed beta. Geneie supports research and professional review; it is not a diagnostic device.
      </p>
    </aside>

    <div className="flex min-h-dvh flex-col lg:min-h-0">
      <header className="flex items-center justify-between px-5 py-4 sm:px-8 lg:hidden">
        <Link to="/" aria-label="Geneie home" className="inline-flex rounded-md">
          <BrandLogo className="h-8 w-auto" />
        </Link>
        {showHomeLink && (
          <Link
            to="/"
            className="inline-flex h-11 items-center gap-1.5 rounded-md px-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Home
          </Link>
        )}
      </header>

      {showHomeLink && (
        <div className="hidden justify-end px-10 pt-8 lg:flex">
          <Link
            to="/"
            className="inline-flex h-9 items-center gap-1.5 rounded-md px-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back to home
          </Link>
        </div>
      )}

      <main className="flex flex-1 items-start justify-center px-5 pb-10 pt-6 sm:px-8 sm:pt-12 lg:items-center lg:pt-0">
        <div className="w-full max-w-[24rem]">{children}</div>
      </main>

      <footer className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1 px-5 pb-6 text-xs text-[var(--text-tertiary)]">
        <Link to="/legal/terms" className="py-2 hover:text-foreground hover:underline">Terms</Link>
        <Link to="/legal/privacy" className="py-2 hover:text-foreground hover:underline">Privacy</Link>
        <a href="mailto:support@geneie.chat" className="py-2 hover:text-foreground hover:underline">support@geneie.chat</a>
      </footer>
    </div>
  </div>
);

export default AuthPageLayout;
