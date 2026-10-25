import React from 'react';

/**
 * Full-screen auth bootstrap loader. Says what is happening; nothing to click while it runs.
 * It fades in after a short beat so a fast session check never flashes a screen at all.
 */
const SessionLoadingScreen = ({ message = 'Loading your session' }) => (
  <div
    role="status"
    aria-live="polite"
    className="wb-scope flex min-h-dvh w-full flex-col items-center justify-center text-foreground"
  >
    <div
      className="wb-fade inline-flex h-10 items-center gap-2.5 rounded-full border border-[hsl(var(--wb-line))] bg-[hsl(var(--wb-card))] pl-3 pr-4"
      style={{ animationDelay: '180ms' }}
    >
      <span className="wb-spin-inline text-[hsl(var(--brand-500))]" aria-hidden="true" />
      <p className="text-[13px] text-muted-foreground">{message}</p>
    </div>
  </div>
);

export default SessionLoadingScreen;
