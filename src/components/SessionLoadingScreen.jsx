import React from 'react';
import { Loader2 } from 'lucide-react';

/** Full-screen auth bootstrap loader — matches Geneie dark theme. */
const SessionLoadingScreen = ({ message = 'Loading user session...' }) => (
  <div
    className="flex items-center justify-center h-screen min-h-dvh w-full"
    style={{ backgroundColor: 'var(--bg-app, #0F0F0F)', color: 'var(--text-primary, #E8EAED)' }}
  >
    <Loader2
      className="h-8 w-8 animate-spin shrink-0"
      style={{ color: 'var(--accent-teal, #4DB6AC)' }}
      aria-hidden
    />
    <p className="ml-3 text-sm" style={{ color: 'var(--text-secondary, #9AA0A6)' }}>
      {message}
    </p>
  </div>
);

export default SessionLoadingScreen;
