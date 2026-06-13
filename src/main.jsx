import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { MotionConfig } from 'motion/react';
import * as Sentry from "@sentry/react";
import { AuthProvider } from './hooks/useAuth';
import LandingPage from './pages/LandingPage';
import AuthPage from './pages/AuthPage';
import ChatPage from './pages/ChatPage';
import PublicRoute from './components/PublicRoute';
import { Toaster } from 'sonner';
import './index.css';

Sentry.init({
  dsn: "https://21eb629f3af2e173607c06c6affe5e7c@o4511525430427648.ingest.de.sentry.io/4511525433245776",
  sendDefaultPii: true,
  integrations: [
    Sentry.browserTracingIntegration(),
    Sentry.replayIntegration(),
  ],
  tracesSampleRate: 1.0,
  tracePropagationTargets: ["localhost", /^https:\/\/api\.geneie\.chat/],
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
  enableLogs: true,
});

const root = ReactDOM.createRoot(document.getElementById('root'));

root.render(
  <React.StrictMode>
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
        <Toaster
          theme="dark"
          position="bottom-center"
          richColors
          toastOptions={{
            classNames: {
              toast: 'font-sans shadow-lg',
            },
          }}
        />
      </AuthProvider>
    </BrowserRouter>
    </MotionConfig>
  </React.StrictMode>
);
