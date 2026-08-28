import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { MotionConfig } from 'motion/react';
import { AuthProvider } from './hooks/useAuth';
import { ThemeProvider, useTheme } from './hooks/useTheme';
import PublicRoute from './components/PublicRoute';
import ErrorBoundary from './components/ErrorBoundary';
import SessionLoadingScreen from './components/SessionLoadingScreen';
import { initAnalytics } from './lib/analytics';
import { Toaster } from '@/components/ui/sonner';
import './index.css';
import './App.css';

initAnalytics();

const LandingPage = React.lazy(() => import('./pages/LandingPage'));
const AuthPage = React.lazy(() => import('./pages/AuthPage'));
const ChatPage = React.lazy(() => import('./pages/ChatPage'));
const AdminPage = React.lazy(() => import('./pages/AdminPage'));

function ThemedToaster() {
  const { theme } = useTheme();
  return (
    <Toaster
      theme={theme}
      position="bottom-center"
      richColors
      toastOptions={{
        classNames: {
          toast: 'font-sans shadow-lg',
        },
      }}
    />
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));

root.render(
  <React.StrictMode>
    <ErrorBoundary>
    <ThemeProvider>
    <MotionConfig reducedMotion="user">
    <BrowserRouter>
      <AuthProvider>
        <React.Suspense fallback={<SessionLoadingScreen message="Loading..." />}>
        <Routes>
          <Route
            path="/"
            element={
              <PublicRoute>
                <LandingPage />
              </PublicRoute>
            }
          />
          <Route
            path="/auth"
            element={
              <PublicRoute>
                <AuthPage />
              </PublicRoute>
            }
          />

          {/* Chat — guests and authenticated users */}
          <Route path="/app" element={<ChatPage />} />
          <Route path="/app/:conversationId" element={<ChatPage />} />
          <Route path="/admin-haha" element={<AdminPage />} />
          <Route path="/subscription-success" element={<Navigate to="/app" replace />} />
          <Route path="/subscription-canceled" element={<Navigate to="/app" replace />} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </React.Suspense>
        <ThemedToaster />
      </AuthProvider>
    </BrowserRouter>
    </MotionConfig>
    </ThemeProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
