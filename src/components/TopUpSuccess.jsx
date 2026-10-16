import React, { useEffect, useRef, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StageMark } from '@/components/motion';
import AutoCloseBar from './account/AutoCloseBar';

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
    <div className="wb-scope flex min-h-[60dvh] items-center justify-center p-4">
      <div className="wb-card wb-pop w-full max-w-md rounded-3xl p-8 text-center">
        {loading ? (
          <div role="status">
            <span className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full border border-[hsl(var(--wb-line))] bg-[hsl(var(--wb-pill))]">
              <StageMark state="running" size={28} />
            </span>
            <h2 className="text-[18px] font-medium text-foreground">Confirming your purchase</h2>
            <p className="mt-1.5 text-[14px] text-muted-foreground">This usually takes a few seconds.</p>
          </div>
        ) : (
          <>
            <span className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full border border-[hsl(var(--brand-200))] bg-[hsl(var(--brand-100))]">
              <StageMark state="done" size={32} />
            </span>
            <div role="status">
              <h2 className="text-[18px] font-medium text-foreground">Top-up added</h2>
              <p className="mt-1.5 text-[14px] text-muted-foreground">
                Your queries are on your account now and don&rsquo;t expire. Your updated balance is in Settings, under Plan and usage.
              </p>
            </div>
            <Button size="lg" className="mt-6 h-10 w-full" onClick={handleContinue} autoFocus>
              Continue to Geneie <ArrowRight aria-hidden="true" />
            </Button>
            <AutoCloseBar seconds={5} />
            <p className="mt-2 text-[12px] text-muted-foreground">This closes on its own in a few seconds.</p>
          </>
        )}
      </div>
    </div>
  );
};

export default TopUpSuccess;
