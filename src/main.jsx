import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { MotionConfig } from 'motion/react';
import { AuthProvider } from './hooks/useAuth';
import { ThemeProvider, useTheme } from './hooks/useTheme';
import LandingPage from './pages/LandingPage';
import AuthPage from './pages/AuthPage';
import ChatPage from './pages/ChatPage';
import PublicRoute from './components/PublicRoute';
import ErrorBoundary from './components/ErrorBoundary';
import { initAnalytics } from './lib/analytics';
import { Toaster } from '@/components/ui/sonner';
import './index.css';
import './App.css';

initAnalytics();

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

          {/* Stripe return URLs → chat with modal handling */}
          <Route path="/subscription-success" element={<Navigate to="/app" replace />} />
          <Route path="/subscription-canceled" element={<Navigate to="/app" replace />} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <ThemedToaster />
      </AuthProvider>
    </BrowserRouter>
    </MotionConfig>
    </ThemeProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
