import React, { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

const cleanUrl = () => window.history.replaceState({}, document.title, window.location.pathname);

/**
 * Calm confirmation after a top-up checkout. Renders as a plain panel (the parent supplies
 * any overlay): working, then done with one next action.
 */
const TopUpSuccess = ({ onClose }) => {
  const [loading, setLoading] = useState(true);
  // ChatPage passes a fresh inline onClose on every render; keep the countdown independent of it.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    // Wait a moment for webhook to process, then show success
    let closeTimer;
    const timer = setTimeout(() => {
      setLoading(false);
      // Auto-close after 5 seconds
      if (onCloseRef.current) {
        closeTimer = setTimeout(() => {
          onCloseRef.current?.();
          // Clean up URL
          cleanUrl();
        }, 5000);
      }
    }, 2000);

    return () => {
      clearTimeout(timer);
      clearTimeout(closeTimer);
    };
  }, []);

  const handleContinue = () => {
    if (onClose) onClose();
    cleanUrl();
  };

  return (
    <div className="flex min-h-[60dvh] items-center justify-center p-4">
      <div
        role="status"
        aria-live="polite"
        className="w-full max-w-md rounded-xl border border-border bg-card p-8 text-center shadow-lg"
      >
        {loading ? (
          <>
            <Loader2 aria-hidden="true" className="mx-auto mb-4 size-8 animate-spin text-muted-foreground motion-reduce:animate-none" />
            <h2 className="text-base font-medium text-foreground">Confirming your purchase</h2>
            <p className="mt-1.5 text-sm text-muted-foreground">This usually takes a few seconds.</p>
          </>
        ) : (
          <>
            <CheckCircle2 aria-hidden="true" className="mx-auto mb-4 size-8 text-[var(--success)]" />
            <h2 className="text-base font-medium text-foreground">Top-up added</h2>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Your queries are on your account now and don&rsquo;t expire. Your updated balance is in Settings, under Plan and usage.
            </p>
            <Button size="lg" className="mt-6 h-10 w-full" onClick={handleContinue} autoFocus>
              Continue to Geneie
            </Button>
            <p className="mt-3 text-xs text-muted-foreground">This closes on its own in a few seconds.</p>
          </>
        )}
      </div>
    </div>
  );
};

export default TopUpSuccess;
