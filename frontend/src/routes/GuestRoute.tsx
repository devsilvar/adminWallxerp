import { useEffect } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth.store.ts';
import PageLoader from '@/components/ui/PageLoader.tsx';

export default function GuestRoute() {
  const isBootstrapping = useAuthStore((s) => s.isBootstrapping);
  const hasCheckedAuth = useAuthStore((s) => s.hasCheckedAuth);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    if (isAuthenticated && user?.role === 'admin') {
      useAuthStore.getState().logout();
      const adminUrl = import.meta.env.VITE_ADMIN_URL || 'https://admin.paymytax.ng';
      window.location.replace(`${adminUrl}/admin/login`);
    }
  }, [isAuthenticated, user]);

  if (isBootstrapping || !hasCheckedAuth) {
    return <PageLoader minHeight="min-h-screen" message="Loading WallXERP..." />;
  }

  if (isAuthenticated) {
    if (user?.role === 'admin') {
      return null;
    }
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
}
