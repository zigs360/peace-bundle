import React, { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import api from '../../services/api';
import { getStoredUser } from '../../utils/storage';
import { Loader2 } from 'lucide-react';

interface ProtectedRouteProps {
  children: React.ReactElement;
}

export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  const location = useLocation();
  const token = localStorage.getItem('token');
  const storedUser = getStoredUser();

  const [authenticated, setAuthenticated] = useState<boolean | null>(() => {
    if (!token && !storedUser) return false;
    if (storedUser) return true;
    return null;
  });

  useEffect(() => {
    if (!token) {
      setAuthenticated(false);
      return;
    }

    let isMounted = true;
    api.get('/auth/profile')
      .then(() => {
        if (!isMounted) return;
        setAuthenticated(true);
      })
      .catch(() => {
        if (!isMounted) return;
        // If profile fetch fails completely, check if we have stored token or if session expired
        if (!localStorage.getItem('token')) {
          setAuthenticated(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [token]);

  if (authenticated === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary-600" />
          <p className="text-sm text-slate-500 font-medium">Authenticating session...</p>
        </div>
      </div>
    );
  }

  if (!authenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
}
