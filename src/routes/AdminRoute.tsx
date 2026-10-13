import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth.store.ts';

export default function AdminRoute() {
  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  if (!isAuthenticated) return <Navigate to="/admin/login" replace />;

  // User data not loaded yet — wait for fetchMe to resolve
  if (!user) return <div className="flex h-screen items-center justify-center text-gray-400">Loading...</div>;

  if (user.role !== 'admin') return <Navigate to="/dashboard" replace />;

  return <Outlet />;
}
