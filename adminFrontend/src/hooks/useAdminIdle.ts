import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/stores/auth.store.ts';
import { isIdleExpired, touchActivity, clearActivity } from '@/lib/session.ts';

const THROTTLE_MS = 30_000;
const CHECK_MS = 60_000;

export function useAdminIdle(): void {
  const navigate = useNavigate();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  useEffect(() => {
    if (!isAuthenticated) return;

    const checkIdle = (): boolean => {
      if (isIdleExpired()) {
        useAuthStore.getState().logout();
        clearActivity();
        toast.error('Session expired. Please sign in again.');
        navigate('/admin/login', { replace: true });
        return true;
      }
      return false;
    };

    if (checkIdle()) {
      return;
    }

    touchActivity();
    let lastWrite = Date.now();

    const onActivity = () => {
      const now = Date.now();
      if (now - lastWrite < THROTTLE_MS) return;
      lastWrite = now;
      touchActivity();
    };

    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      if (checkIdle()) return;
      onActivity();
    };

    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        checkIdle();
      }
    }, CHECK_MS);

    window.addEventListener('pointerdown', onActivity);
    window.addEventListener('keydown', onActivity);
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      clearInterval(interval);
      window.removeEventListener('pointerdown', onActivity);
      window.removeEventListener('keydown', onActivity);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [isAuthenticated, navigate]);
}
