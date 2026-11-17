import React from 'react';
import {Navigate, Outlet} from 'react-router-dom';
import {ArixMascot} from './ArixMascot';
import {useAuth} from '../contexts/AuthContext';

export function ProtectedRoute() {
  const {user, isLoading} = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen arix-backdrop flex flex-col items-center justify-center gap-4">
        <ArixMascot size="md" mood="thinking" />
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Loading Arix AI workspace...
        </p>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  return <Outlet />;
}
