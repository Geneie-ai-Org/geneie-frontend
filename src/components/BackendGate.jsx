import React from 'react';
import { useBackendHealth } from '@/hooks/useBackendHealth';

// Loaded only when the backend is down, so the normal path pays nothing for the canvas effect.
const BackendDownScreen = React.lazy(() => import('@/components/BackendDownScreen'));

/**
 * Wraps the signed-in app. While the backend is unreachable it shows the "We'll be right back" screen instead of a
 * half-broken app; when the backend answers again it remounts the app (new key) so everything refetches.
 */
export default function BackendGate({ children }) {
  const { down, checking, retry, epoch } = useBackendHealth();
  if (down) {
    return (
      <React.Suspense fallback={null}>
        <BackendDownScreen checking={checking} onRetry={retry} />
      </React.Suspense>
    );
  }
  return <React.Fragment key={epoch}>{children}</React.Fragment>;
}
