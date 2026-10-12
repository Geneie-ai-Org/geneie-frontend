import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import SessionLoadingScreen from '@/components/SessionLoadingScreen';

const ProtectedRoute = ({ children }) => {
  const { isAuthReady, userLoading, userId } = useAuth();
  const location = useLocation();

  // Wait for Firebase to settle: redirecting while auth is still loading would bounce a
  // signed-in user to /auth on every hard refresh.
  if (!isAuthReady || userLoading) {
    return <SessionLoadingScreen message="Loading..." />;
  }

  if (!userId) {
    return <Navigate to="/auth" state={{ from: location }} replace />;
  }

  return children;
};

export default ProtectedRoute;