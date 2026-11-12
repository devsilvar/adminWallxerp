import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth.store.ts';
import PageLoader from '@/components/ui/PageLoader.tsx';

export default function AdminRoute() {
  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const hasCheckedAuth = useAuthStore((s) => s.hasCheckedAuth);

  if (!isAuthenticated) return <Navigate to="/admin/login" replace />;
  if (!hasCheckedAuth && !user) {
    return <PageLoader minHeight="min-h-screen" message="Verifying session…" />;
  }
  if (!user) return <Navigate to="/admin/login" replace />;
  if (user.role !== 'admin') return <Navigate to="/admin/login" replace />;

  return <Outlet />;
}
