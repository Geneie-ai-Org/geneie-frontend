import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2 } from 'lucide-react';

/** Renders public/legal/{terms|privacy}.md as plain preformatted text for beta. */
export default function LegalDocPage({ doc }) {
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const file = doc === 'privacy' ? '/legal/privacy.md' : '/legal/terms.md';
  const title = doc === 'privacy' ? 'Privacy Policy' : 'Terms of Use';

  useEffect(() => {
    let cancelled = false;
    fetch(file)
      .then((r) => {
        if (!r.ok) throw new Error('Document not found');
        return r.text();
      })
      .then((t) => {
        if (!cancelled) setText(t);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message || 'Failed to load');
      });
    return () => {
      cancelled = true;
    };
  }, [file]);

  return (
    <div className="mx-auto min-h-screen max-w-3xl px-4 py-8">
      <Link to="/app" className="text-sm text-primary underline">
        ← Back to app
      </Link>
      <h1 className="mt-4 text-2xl font-semibold">{title}</h1>
      {error ? <p className="mt-4 text-destructive">{error}</p> : null}
      {!text && !error ? (
        <div className="mt-8 flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : null}
      {text ? (
        <pre className="mt-6 whitespace-pre-wrap font-sans text-sm leading-relaxed text-foreground">
          {text}
        </pre>
      ) : null}
    </div>
  );
}
