import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axios from 'axios';
import api, { getErrorMessage } from '../axios';

describe('Axios Authentication & Interceptor Suite', () => {
  let originalLocation: Location;
  let originalAdapter: any;

  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();

    originalAdapter = api.defaults.adapter;
    // Set mock adapter so replayed requests resolve without network calls
    api.defaults.adapter = async (config: any) => ({
      data: { success: true, replayedUrl: config.url },
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
    });

    // Mock window.location to prevent jsdom navigation TypeError
    originalLocation = window.location;
    delete (window as any).location;
    window.location = {
      ...originalLocation,
      pathname: '/dashboard',
      href: 'http://localhost:5173/dashboard',
      replace: vi.fn((url: string) => {
        window.location.href = url;
      }),
    } as any;
  });

  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    api.defaults.adapter = originalAdapter;
    window.location = originalLocation as any;
  });

  // Dynamically locate the auth request handler
  const getAuthRequestHandler = () => {
    const handlers = (api.interceptors.request as any).handlers || [];
    const handlerObj = handlers.find(
      (h: any) => h?.fulfilled && h.fulfilled.toString().includes('accessToken')
    );
    return handlerObj?.fulfilled;
  };

  // Dynamically locate the 401 response error handler
  const getAuthResponseErrorHandler = () => {
    const handlers = (api.interceptors.response as any).handlers || [];
    const handlerObj = handlers.find(
      (h: any) => h?.rejected && h.rejected.toString().includes('isRefreshing')
    );
    return handlerObj?.rejected;
  };

  describe('Request Interceptor', () => {
    it('appends Authorization: Bearer <token> when token is present in localStorage', async () => {
      localStorage.setItem('accessToken', 'my-secret-access-token');
      const requestHandler = getAuthRequestHandler();
      expect(requestHandler).toBeDefined();

      const config: any = {
        headers: {},
      };

      const resultConfig = await requestHandler(config);
      expect(resultConfig.headers.Authorization).toBe('Bearer my-secret-access-token');
    });

    it('does not append Authorization header when localStorage is empty', async () => {
      const requestHandler = getAuthRequestHandler();
      expect(requestHandler).toBeDefined();

      const config: any = {
        headers: {},
      };

      const resultConfig = await requestHandler(config);
      expect(resultConfig.headers.Authorization).toBeUndefined();
    });

    it('removes Content-Type when request data is FormData so browser sets boundary', async () => {
      const requestHandler = getAuthRequestHandler();
      expect(requestHandler).toBeDefined();

      const formData = new FormData();
      const config: any = {
        headers: { 'Content-Type': 'application/json' },
        data: formData,
      };

      const resultConfig = await requestHandler(config);
      expect(resultConfig.headers['Content-Type']).toBeUndefined();
    });
  });

  describe('Response 401 Refresh Interceptor', () => {
    it('rejects immediately for recursive auth routes to prevent infinite loops', async () => {
      const responseErrorHandler = getAuthResponseErrorHandler();
      expect(responseErrorHandler).toBeDefined();

      const authRoutes = ['/auth/refresh', '/auth/login', '/auth/register'];

      for (const url of authRoutes) {
        const error = {
          config: { url },
          response: { status: 401 },
        };

        await expect(responseErrorHandler(error)).rejects.toEqual(error);
      }
    });

    it('rejects if response is 401 but no refreshToken exists in localStorage', async () => {
      const responseErrorHandler = getAuthResponseErrorHandler();
      expect(responseErrorHandler).toBeDefined();

      localStorage.removeItem('refreshToken');

      const error = {
        config: { url: '/businesses/123/sales', headers: {} },
        response: { status: 401 },
      };

      await expect(responseErrorHandler(error)).rejects.toEqual(error);
    });

    it('successfully calls /auth/refresh on 401, stores new token, and replays request', async () => {
      const responseErrorHandler = getAuthResponseErrorHandler();
      expect(responseErrorHandler).toBeDefined();

      localStorage.setItem('accessToken', 'expired-token');
      localStorage.setItem('refreshToken', 'valid-refresh-token');

      const axiosPostSpy = vi.spyOn(axios, 'post').mockResolvedValueOnce({
        data: {
          data: {
            accessToken: 'shiny-new-token',
          },
        },
      });

      const originalRequest: any = {
        url: '/businesses/123/sales',
        headers: {
          Authorization: 'Bearer expired-token',
        },
      };

      const error = {
        config: originalRequest,
        response: { status: 401 },
      };

      const replayResult = await responseErrorHandler(error);

      // Verify refresh endpoint was invoked with refresh token
      expect(axiosPostSpy).toHaveBeenCalledWith(
        expect.stringContaining('/auth/refresh'),
        { refreshToken: 'valid-refresh-token' }
      );

      // Verify new token was stored in localStorage
      expect(localStorage.getItem('accessToken')).toBe('shiny-new-token');
      expect(originalRequest._retry).toBe(true);
      expect(replayResult.data.success).toBe(true);
    });

    it('handles cross-tab token synchronization when newer token exists in storage', async () => {
      const responseErrorHandler = getAuthResponseErrorHandler();
      expect(responseErrorHandler).toBeDefined();

      // Another tab already refreshed the token
      localStorage.setItem('accessToken', 'token-refreshed-by-tab-2');

      const axiosPostSpy = vi.spyOn(axios, 'post');

      const originalRequest: any = {
        url: '/businesses/123/sales',
        headers: {
          Authorization: 'Bearer old-token-from-tab-1',
        },
      };

      const error = {
        config: originalRequest,
        response: { status: 401 },
      };

      const replayResult = await responseErrorHandler(error);

      // Should NOT call /auth/refresh because token was already updated
      expect(axiosPostSpy).not.toHaveBeenCalled();
      expect(originalRequest.headers.Authorization).toBe('Bearer token-refreshed-by-tab-2');
      expect(replayResult.data.success).toBe(true);
    });

    it('rejects queue when refresh token endpoint fails and isLoggedOut synchronously, with delayed hard-replace safety net', async () => {
      const responseErrorHandler = getAuthResponseErrorHandler();
      expect(responseErrorHandler).toBeDefined();

      localStorage.setItem('accessToken', 'expired-token');
      localStorage.setItem('refreshToken', 'revoked-refresh-token');

      const refreshFailure = new Error('Refresh token invalid');
      vi.spyOn(axios, 'post').mockRejectedValueOnce(refreshFailure);

      const originalRequest: any = {
        url: '/businesses/123/sales',
        headers: { Authorization: 'Bearer expired-token' },
      };

      const error = {
        config: originalRequest,
        response: { status: 401 },
      };

      // Install fake timers BEFORE the axios call so the 1.5s safety-net
      // setTimeout is captured by the fake clock. Without this, the real
      // setTimeout would be scheduled and advanceTimersByTimeAsync would
      // have nothing to advance.
      vi.useFakeTimers();
      try {
        // Pathname in beforeEach is '/dashboard' — a protected path. The
        // handler will schedule a 1.5s window.location.replace('/login')
        // safety net, but synchronously call logout() first.
        await expect(responseErrorHandler(error)).rejects.toThrow('Refresh token invalid');

        // Synchronously the user is logged out (auth store isAuthenticated=false).
        // React Router will soft-redirect via <Navigate>.
        const { useAuthStore } = await import('@/stores/auth.store');
        expect(useAuthStore.getState().isAuthenticated).toBe(false);

        // window.location.href has NOT changed yet — the safety net is
        // scheduled, not immediate. This is the bug-fix assertion: an
        // immediate hard replace used to strip ?token=... during invite flow.
        expect(window.location.href).toBe('http://localhost:5173/dashboard');

        // Fast-forward the 1.5s safety-net timer. With pathname equality
        // intact (still /dashboard — React didn't run because we never
        // mounted a router here), the hard replace fires.
        await vi.advanceTimersByTimeAsync(1500);
        expect(window.location.href).toBe('/login');
      } finally {
        vi.useRealTimers();
      }
    });

    it('does NOT fire hard-replace safety net when user is already on an auth page', async () => {
      const responseErrorHandler = getAuthResponseErrorHandler();
      expect(responseErrorHandler).toBeDefined();

      localStorage.setItem('accessToken', 'expired-token');
      localStorage.setItem('refreshToken', 'revoked-refresh-token');

      const refreshFailure = new Error('Refresh token invalid');
      vi.spyOn(axios, 'post').mockRejectedValueOnce(refreshFailure);

      const originalRequest: any = {
        url: '/businesses/123/sales',
        headers: { Authorization: 'Bearer expired-token' },
      };

      // Pretend we're already on /login — simulate a refresh failure on
      // an unauthenticated path. beforeEach already set pathname to
      // '/dashboard', so override it for this test.
      Object.defineProperty(window, 'location', {
        configurable: true,
        value: { ...window.location, pathname: '/login', href: 'http://localhost:5173/login' },
      });

      const error = {
        config: originalRequest,
        response: { status: 401 },
      };

      vi.useFakeTimers();
      try {
        await expect(responseErrorHandler(error)).rejects.toThrow('Refresh token invalid');

        await vi.advanceTimersByTimeAsync(2000);
        // Still on /login — no hard replace was scheduled because the
        // pathname was already in the auth-page allowlist.
        expect(window.location.href).toBe('http://localhost:5173/login');
      } finally {
        vi.useRealTimers();
        // Restore so subsequent tests see the original /dashboard path.
        Object.defineProperty(window, 'location', {
          configurable: true,
          value: { ...originalLocation, pathname: '/dashboard', href: 'http://localhost:5173/dashboard' },
        });
      }
    });
  });

  describe('Subscription Error Message Mapping', () => {
    it('returns friendly message for TRIAL_EXPIRED code', () => {
      const error = {
        isAxiosError: true,
        response: {
          status: 403,
          data: {
            error: {
              code: 'TRIAL_EXPIRED',
              message: 'Raw server trial expired message',
            },
          },
        },
      };
      vi.spyOn(axios, 'isAxiosError').mockReturnValue(true);

      const msg = getErrorMessage(error);
      expect(msg).toContain('30-day free trial has ended');
    });

    it('returns friendly message for TRIAL_IN_GRACE_PERIOD code', () => {
      const error = {
        isAxiosError: true,
        response: {
          status: 403,
          data: {
            error: {
              code: 'TRIAL_IN_GRACE_PERIOD',
              message: 'Raw server grace period message',
            },
          },
        },
      };
      vi.spyOn(axios, 'isAxiosError').mockReturnValue(true);

      const msg = getErrorMessage(error);
      expect(msg).toContain('2-day grace period');
    });
  });
});
