import React from 'react';
import { useBackendHealth } from '@/hooks/useBackendHealth';
import SessionLoadingScreen from '@/components/SessionLoadingScreen';

// Loaded only when the backend is down, so the normal path pays nothing for the canvas effect.
const BackendDownScreen = React.lazy(() => import('@/components/BackendDownScreen'));

/**
 * Wraps the signed-in app. While the backend is unreachable it shows the "We'll be right back" screen instead of a
 * half-broken app; when the backend answers again it remounts the app (new key) so everything refetches.
 *
 * The app mounts straight away (no extra round trip when all is well) but stays hidden behind the loading screen until
 * the first health answer, so if the backend is down nobody sees the app's own error cards before this screen.
 */
export default function BackendGate({ children }) {
  const { down, checking, retry, epoch, ready } = useBackendHealth();
  if (down) {
    return (
      <React.Suspense fallback={null}>
        <BackendDownScreen checking={checking} onRetry={retry} />
      </React.Suspense>
    );
  }
  return (
    <>
      {!ready && (
        <div className="fixed inset-0 z-[100]">
          <SessionLoadingScreen message="Loading..." />
        </div>
      )}
      <div key={epoch} style={{ display: 'contents', visibility: ready ? 'visible' : 'hidden' }}>
        {children}
      </div>
    </>
  );
}
