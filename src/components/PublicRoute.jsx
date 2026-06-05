import React, { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import SessionLoadingScreen from '@/components/SessionLoadingScreen';

const PublicRoute = ({ children }) => {
  const { userId, isAuthReady, userLoading } = useAuth();
  const location = useLocation();

  useEffect(() => {
    // If auth is ready and user is logged in, redirect to app
    if (isAuthReady && !userLoading && userId) {
      if (!location.pathname.startsWith('/app')) {
        window.location.replace('/app');
      }
    }
  }, [userId, isAuthReady, userLoading, location.pathname]);

  if (!isAuthReady || userLoading) {
    return <SessionLoadingScreen message="Loading..." />;
  }

  if (userId) {
    return null;
  }

  return children;
};

export default PublicRoute;
