import React, { useEffect, useId, useRef, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StageMark } from '@/components/motion';
import AutoCloseBar from './account/AutoCloseBar';

const cleanUrl = () => window.history.replaceState({}, document.title, window.location.pathname);

/**
 * Calm confirmation after checkout. The parent supplies the overlay, so this renders as a
 * plain panel: working (waiting for the payment webhook), then done with one next action.
 */
const SubscriptionSuccess = ({ onClose }) => {
  const [loading, setLoading] = useState(true);
  const titleId = useId();
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

  // The parent supplies a plain overlay, so Escape is handled here.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        if (onCloseRef.current) onCloseRef.current();
        cleanUrl();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="wb-scope wb-card wb-pop mx-4 w-full max-w-md rounded-3xl p-8 text-center shadow-[var(--shadow-lg)]"
      style={{ backgroundColor: 'hsl(var(--wb-card))' }}
    >
      {loading ? (
        <div role="status">
          <span className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full border border-[hsl(var(--wb-line))] bg-[hsl(var(--wb-pill))]">
            <StageMark state="running" size={28} />
          </span>
          <h2 id={titleId} className="text-[18px] font-medium text-foreground">Confirming your payment</h2>
          <p className="mt-1.5 text-[14px] text-muted-foreground">This usually takes a few seconds.</p>
        </div>
      ) : (
        <>
          <span className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full border border-[hsl(var(--brand-200))] bg-[hsl(var(--brand-100))]">
            <StageMark state="done" size={32} />
          </span>
          <div role="status">
            <h2 id={titleId} className="text-[18px] font-medium text-foreground">Pro is active</h2>
            <p className="mt-1.5 text-[14px] text-muted-foreground">
              You now have unlimited chat exchanges and access to bioinformatics pipelines.
            </p>
          </div>
          <Button size="lg" className="mt-6 h-10 w-full" onClick={handleContinue} autoFocus>
            Continue to Geneie <ArrowRight aria-hidden="true" />
          </Button>
          {/* The track drains over the same 5 seconds as the existing auto-close timer. */}
          <AutoCloseBar seconds={5} />
          <p className="mt-2 text-[12px] text-muted-foreground">This closes on its own in a few seconds.</p>
        </>
      )}
    </div>
  );
};

export default SubscriptionSuccess;
