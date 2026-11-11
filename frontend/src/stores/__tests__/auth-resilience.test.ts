import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import api from '@/lib/axios';
import { useAuthStore } from '../auth.store';

describe('Auth Resilience & Logout Prevention (runcode.md verified)', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    useAuthStore.setState({
      user: null,
      isAuthenticated: false,
      isBootstrapping: false,
      hasCheckedAuth: true,
      isLoading: false,
    });
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('fetchMe 401-only logout gate (Fix 1)', () => {
    it('does NOT log out the user when /auth/me encounters a 500 internal server error', async () => {
      localStorage.setItem('accessToken', 'valid-token-123');
      useAuthStore.setState({
        isAuthenticated: true,
        user: { id: 'u1', email: 'test@example.com' } as any,
      });

      const serverError = {
        name: 'AxiosError',
        response: { status: 500, data: { message: 'Internal Server Error' } },
      };
      vi.spyOn(api, 'get').mockRejectedValueOnce(serverError);
      const logoutSpy = vi.spyOn(useAuthStore.getState(), 'logout');

      await useAuthStore.getState().fetchMe();

      // User must stay authenticated despite 500 error
      expect(useAuthStore.getState().isAuthenticated).toBe(true);
      expect(logoutSpy).not.toHaveBeenCalled();
      expect(localStorage.getItem('accessToken')).toBe('valid-token-123');
    });

    it('does NOT log out the user when /auth/me encounters a network connection failure (ERR_NETWORK)', async () => {
      localStorage.setItem('accessToken', 'valid-token-123');
      useAuthStore.setState({
        isAuthenticated: true,
        user: { id: 'u1', email: 'test@example.com' } as any,
      });

      const networkError = {
        name: 'AxiosError',
        code: 'ERR_NETWORK',
        message: 'Network Error',
      };
      vi.spyOn(api, 'get').mockRejectedValueOnce(networkError);
      const logoutSpy = vi.spyOn(useAuthStore.getState(), 'logout');

      await useAuthStore.getState().fetchMe();

      expect(useAuthStore.getState().isAuthenticated).toBe(true);
      expect(logoutSpy).not.toHaveBeenCalled();
      expect(localStorage.getItem('accessToken')).toBe('valid-token-123');
    });

    it('DOES log out the user when /auth/me explicitly returns 401 Unauthorized', async () => {
      localStorage.setItem('accessToken', 'revoked-token');
      useAuthStore.setState({
        isAuthenticated: true,
        user: { id: 'u1', email: 'test@example.com' } as any,
      });

      const unauthorizedError = {
        name: 'AxiosError',
        response: { status: 401, data: { message: 'Unauthorized' } },
      };
      vi.spyOn(api, 'get').mockRejectedValueOnce(unauthorizedError);

      await useAuthStore.getState().fetchMe();

      expect(useAuthStore.getState().isAuthenticated).toBe(false);
      expect(localStorage.getItem('accessToken')).toBeNull();
    });
  });
});
