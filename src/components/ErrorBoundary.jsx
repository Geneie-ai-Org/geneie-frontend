import React from 'react';

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
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div
        role="alert"
        style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '1rem',
          padding: '2rem',
          textAlign: 'center',
          background: 'var(--bg-app)',
          color: 'var(--text-primary)',
        }}
      >
        <p style={{ fontSize: '1rem', margin: 0 }}>Something went wrong.</p>
        <p style={{ fontSize: '0.875rem', margin: 0, color: 'var(--text-secondary)' }}>
          The page hit an unexpected error. Reloading usually clears it.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          style={{
            marginTop: '0.5rem',
            padding: '0.5rem 1.25rem',
            fontSize: '0.875rem',
            borderRadius: '9999px',
            border: '1px solid var(--border-default)',
            background: 'var(--bg-surface)',
            color: 'var(--text-primary)',
            cursor: 'pointer',
          }}
        >
          Reload page
        </button>
        {import.meta.env.DEV && (
          <pre
            style={{
              marginTop: '1rem',
              maxWidth: '48rem',
              overflowX: 'auto',
              textAlign: 'left',
              fontSize: '0.75rem',
              color: 'var(--error)',
            }}
          >
            {this.state.error?.stack || String(this.state.error)}
          </pre>
        )}
      </div>
    );
  }
}
