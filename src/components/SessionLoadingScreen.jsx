import React from 'react';
import { Loader2 } from 'lucide-react';

/** Full-screen auth bootstrap loader. Says what is happening; nothing to click while it runs. */
const SessionLoadingScreen = ({ message = 'Loading your session…' }) => (
  <div
    role="status"
    aria-live="polite"
    className="flex min-h-dvh w-full flex-col items-center justify-center gap-3 bg-background text-foreground"
  >
    <Loader2 className="h-5 w-5 shrink-0 animate-spin text-primary motion-reduce:animate-none" aria-hidden="true" />
    <p className="text-sm text-muted-foreground">{message}</p>
  </div>
);

export default SessionLoadingScreen;
