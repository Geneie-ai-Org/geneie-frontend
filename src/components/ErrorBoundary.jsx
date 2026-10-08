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

    return (
      <div
        role="alert"
        className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[var(--bg-app)] px-6 py-8 text-center text-[var(--text-primary)]"
      >
        <p className="m-0 text-base font-medium">Something went wrong.</p>
        <p className="m-0 max-w-sm text-sm text-[var(--text-secondary)]">
          The page hit an unexpected error. Reloading usually clears it.
        </p>
        <div className="mt-2 flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="inline-flex h-10 items-center justify-center rounded-full bg-[var(--text-primary)] px-5 text-sm font-medium text-[var(--bg-app)] transition-opacity hover:opacity-85"
          >
            Reload page
          </button>
          <a
            href="/app"
            className="inline-flex h-10 items-center justify-center rounded-full border border-[var(--border-subtle)] px-5 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
          >
            Back to app
          </a>
        </div>
        {import.meta.env.DEV && (
          <pre className="mt-4 max-w-3xl overflow-x-auto text-left text-[13px] text-[var(--error)]">
            {this.state.error?.stack || String(this.state.error)}
          </pre>
        )}
      </div>
    );
  }
}
