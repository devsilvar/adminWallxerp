import { useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/stores/auth.store.ts';
import {
  touchActivity,
  isSessionExpired,
  isIdleExpired,
  isAbsoluteExpired,
} from '@/lib/session.ts';

const CHECK_INTERVAL_MS = 60_000;
const TOUCH_THROTTLE_MS = 30_000;

const ACTIVITY_EVENTS: Array<keyof DocumentEventMap> = [
  'mousemove',
  'mousedown',
  'keydown',
  'click',
  'scroll',
  'touchstart',
];

export function useSessionTimeout() {
  const navigate = useNavigate();
  const lastTouchRef = useRef(0);

  const doLogout = useCallback(
    async (reason: 'idle' | 'absolute') => {
      const wasAuthenticated = useAuthStore.getState().isAuthenticated;
      if (!wasAuthenticated) return;
      await useAuthStore.getState().logout();
      navigate('/login', { replace: true });
      toast.dismiss();
      if (reason === 'idle') {
        toast.error('Session expired due to inactivity — please log in again.', {
          duration: 4500,
        });
      } else {
        toast('Session expired — please log in again.', { duration: 3500 });
      }
    },
    [navigate],
  );

  const checkExpiry = useCallback(() => {
    const s = useAuthStore.getState();
    if (!s.isAuthenticated || s.isBootstrapping || !s.hasCheckedAuth) return;
    if (!localStorage.getItem('accessToken')) return;
    if (isIdleExpired()) {
      void doLogout('idle');
      return;
    }
    if (isAbsoluteExpired()) {
      void doLogout('absolute');
    }
  }, [doLogout]);

  const throttledTouch = useCallback(() => {
    const now = Date.now();
    if (now - lastTouchRef.current < TOUCH_THROTTLE_MS) return;
    lastTouchRef.current = now;
    const s = useAuthStore.getState();
    if (!s.isAuthenticated || s.isBootstrapping) return;
    touchActivity();
  }, []);

  useEffect(() => {
    const opts: AddEventListenerOptions = { passive: true, capture: true };

    for (const evt of ACTIVITY_EVENTS) {
      document.addEventListener(evt, throttledTouch as EventListener, opts);
    }

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        if (isSessionExpired()) checkExpiry();
        else throttledTouch();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    const onStorage = (e: StorageEvent) => {
      if (e.key === 'accessToken' && e.newValue === null) {
        const s = useAuthStore.getState();
        if (s.isAuthenticated) {
          void s.logout();
          navigate('/login', { replace: true });
        }
      }
      if (
        e.key === 'wallx_last_active_at' ||
        e.key === 'wallx_session_started_at'
      ) {
        checkExpiry();
      }
    };
    window.addEventListener('storage', onStorage);

    const interval = window.setInterval(checkExpiry, CHECK_INTERVAL_MS);

    return () => {
      for (const evt of ACTIVITY_EVENTS) {
        document.removeEventListener(evt, throttledTouch as EventListener, opts as any);
      }
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('storage', onStorage);
      window.clearInterval(interval);
    };
  }, [throttledTouch, checkExpiry, navigate]);
}
