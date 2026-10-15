import React, { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

const cleanUrl = () => window.history.replaceState({}, document.title, window.location.pathname);

/**
 * Calm confirmation after checkout. The parent supplies the overlay, so this renders as a
 * plain panel: working (waiting for the payment webhook), then done with one next action.
 */
const SubscriptionSuccess = ({ onClose }) => {
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
    <div
      role="status"
      aria-live="polite"
      className="mx-4 w-full max-w-md rounded-xl border border-border bg-card p-8 text-center shadow-lg"
    >
      {loading ? (
        <>
          <Loader2 aria-hidden="true" className="mx-auto mb-4 size-8 animate-spin text-muted-foreground motion-reduce:animate-none" />
          <h2 className="text-base font-medium text-foreground">Confirming your payment</h2>
          <p className="mt-1.5 text-sm text-muted-foreground">This usually takes a few seconds.</p>
        </>
      ) : (
        <>
          <CheckCircle2 aria-hidden="true" className="mx-auto mb-4 size-8 text-[var(--success)]" />
          <h2 className="text-base font-medium text-foreground">Pro is active</h2>
          <p className="mt-1.5 text-sm text-muted-foreground">
            You now have unlimited chat exchanges and access to bioinformatics pipelines.
          </p>
          <Button size="lg" className="mt-6 h-10 w-full" onClick={handleContinue} autoFocus>
            Continue to Geneie
          </Button>
          <p className="mt-3 text-xs text-muted-foreground">This closes on its own in a few seconds.</p>
        </>
      )}
    </div>
  );
};

export default SubscriptionSuccess;
