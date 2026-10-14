import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth.store.ts';
import PageLoader from '@/components/ui/PageLoader.tsx';

export default function AdminRoute() {
  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  if (!isAuthenticated) return <Navigate to="/admin/login" replace />;

  if (!user) {
    return <PageLoader minHeight="min-h-screen" message="Verifying session…" />;
  }

  if (user.role !== 'admin') return <Navigate to="/dashboard" replace />;

  return <Outlet />;
}
