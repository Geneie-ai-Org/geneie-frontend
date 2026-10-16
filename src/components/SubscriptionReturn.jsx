import React, { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import BrandLogo from '@/components/public/BrandLogo';
import SubscriptionSuccess from '@/components/SubscriptionSuccess';
import SubscriptionCanceled from '@/components/SubscriptionCanceled';

/**
 * Landing page for the payment provider's redirect (`/subscription-success`, `/subscription-canceled`,
 * and the same paths under `/app/`). These used to be redirects to /app (which dropped the path and
 * `?session_id`) or, under /app/, were read as a conversation id and bounced, so the confirmation never
 * showed. Here the outcome screen is the page: a calm canvas with the confirmation over it, and closing
 * (button, Escape or the auto-close) continues to the app.
 */
export default function SubscriptionReturn({ kind }) {
  const navigate = useNavigate();
  const { refreshSubscriptionStatus } = useAuth();
  const refreshRef = useRef(refreshSubscriptionStatus);
  refreshRef.current = refreshSubscriptionStatus;

  useEffect(() => {
    if (kind === 'success') refreshRef.current?.();
  }, [kind]);

  const close = () => navigate('/app', { replace: true });

  return (
    <div className="wb-scope pub-scope pub-hero tx tx--lattice flex min-h-dvh flex-col font-sans text-foreground" style={{ '--tx-at': '50% 45%', '--tx-fade': '50% 60%' }}>
      <header className="px-5 py-4 sm:px-8">
        <BrandLogo className="h-8 w-auto" />
      </header>
      {kind === 'success' ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <SubscriptionSuccess onClose={close} />
        </div>
      ) : (
        <SubscriptionCanceled onClose={close} />
      )}
    </div>
  );
}
