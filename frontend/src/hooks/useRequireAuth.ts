import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth.store.ts';

/**
 * Imperative guard for pages that cannot use <ProtectedRoute>.
 * Respects the bootstrap gate — will not redirect while auth is
 * still being verified on cold boot (otherwise direct nav to /tax
 * bounces to /login before fetchMe resolves).
 */
export function useRequireAuth() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const hasCheckedAuth = useAuthStore((s) => s.hasCheckedAuth);
  const isBootstrapping = useAuthStore((s) => s.isBootstrapping);
  const navigate = useNavigate();

  useEffect(() => {
    if (isBootstrapping || !hasCheckedAuth) return;
    if (!isAuthenticated) {
      navigate('/login', { replace: true });
    }
  }, [isAuthenticated, hasCheckedAuth, isBootstrapping, navigate]);

  return isAuthenticated;
}
