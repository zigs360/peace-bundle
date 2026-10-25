import React, { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import api from '../../services/api';
import { getStoredUser } from '../../utils/storage';
import { Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

interface AdminRouteProps {
  children: React.ReactElement;
}

const isAdmin = (role?: string) => {
  const clean = String(role || '').trim().toLowerCase();
  return clean === 'admin' || clean === 'super_admin' || clean === 'superadmin';
};

export default function AdminRoute({ children }: AdminRouteProps) {
  const location = useLocation();
  const token = localStorage.getItem('token');
  const storedUser = getStoredUser();

  const [authorized, setAuthorized] = useState<boolean | null>(() => {
    if (!token) return false;
    if (storedUser && !isAdmin(storedUser.role)) return false;
    if (storedUser && isAdmin(storedUser.role)) return true;
    return null; // need verification
  });

  useEffect(() => {
    if (!token) {
      setAuthorized(false);
      return;
    }

    let isMounted = true;
    api.get('/auth/profile')
      .then((res) => {
        if (!isMounted) return;
        const role = res.data?.role;
        if (isAdmin(role)) {
          setAuthorized(true);
        } else {
          setAuthorized(false);
          toast.error('Access denied. Administrator privileges required.');
        }
      })
      .catch(() => {
        if (!isMounted) return;
        setAuthorized(false);
      });

    return () => {
      isMounted = false;
    };
  }, [token]);

  if (authorized === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary-600" />
          <p className="text-sm text-slate-500 font-medium">Verifying administrator access...</p>
        </div>
      </div>
    );
  }

  if (!token) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (!authorized) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}
