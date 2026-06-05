import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import SessionLoadingScreen from '@/components/SessionLoadingScreen';

const ProtectedRoute = ({ children }) => {
  const { isAuthReady, userLoading, userId } = useAuth();
  const location = useLocation();

  if (userLoading && !isAuthReady) {
    return <SessionLoadingScreen message="Loading..." />;
  }

  if (!userId) {
    return <Navigate to="/auth" state={{ from: location }} replace />;
  }

  return children;
};

export default ProtectedRoute;