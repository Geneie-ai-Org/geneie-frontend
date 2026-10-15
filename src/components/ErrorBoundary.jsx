import React from 'react';
import { capture } from '@/lib/analytics';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[ErrorBoundary] Uncaught render error:', error, errorInfo);
    // Match the app's convention: surface broken renders in analytics the way
    // NotFoundPage reports bad routes, so these stop being invisible.
    try {
      capture('render_error', {
        message: String(error?.message || error).slice(0, 300),
        path: typeof window !== 'undefined' ? window.location?.pathname : undefined,
      });
    } catch {
      /* analytics must never mask the original error */
    }
  }

  render() {
    if (!this.state.error) return this.props.children;

    // Plain elements only: this renders when the app tree is broken, so it must not depend
    // on routing, theme or UI primitives. Tokens come from <html> and still apply.
    return (
      <div
        role="alert"
        className="flex min-h-dvh flex-col items-center justify-center bg-background px-5 py-8 text-foreground"
      >
        <div className="w-full max-w-md">
          <h1 className="text-xl font-semibold tracking-tight">Something went wrong</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            This page hit an unexpected error.
            Reloading usually clears it. If it keeps happening, email{' '}
            <a className="text-primary underline underline-offset-2" href="mailto:support@geneie.chat">
              support@geneie.chat
            </a>
            .
          </p>
          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:items-center">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex h-11 items-center justify-center rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 sm:h-10"
            >
              Reload page
            </button>
            <a
              href="/app"
              className="inline-flex h-11 items-center justify-center rounded-lg px-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground sm:h-10"
            >
              Back to Geneie
            </a>
          </div>
          {import.meta.env.DEV && (
            <pre className="mt-6 max-h-64 overflow-auto rounded-lg border border-border bg-muted p-3 text-left font-mono text-xs text-[var(--error)]">
              {this.state.error?.stack || String(this.state.error)}
            </pre>
          )}
        </div>
      </div>
    );
  }
}
