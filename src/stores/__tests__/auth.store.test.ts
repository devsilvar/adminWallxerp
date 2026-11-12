import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AxiosResponse } from 'axios';
import api from '@/lib/axios.ts';
import { useAuthStore } from '../auth.store.ts';
import { getAccessToken, getRefreshToken, setTokens } from '@/lib/session.ts';
import type { User } from '@/types/index.ts';

// Mock axios methods
vi.mock('@/lib/axios.ts', () => {
  return {
    default: {
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      patch: vi.fn(),
      delete: vi.fn(),
      defaults: {
        headers: {
          common: {},
        },
      },
      interceptors: {
        request: { use: vi.fn() },
        response: { use: vi.fn() },
      },
    },
  };
});

// Mock admin.stats.store to prevent dependency chain side-effects
vi.mock('@/stores/admin.stats.store.ts', () => ({
  useAdminStatsStore: {
    getState: () => ({
      clear: vi.fn(),
    }),
  },
}));

describe('useAuthStore — Session Hardening & Token Rotation (Phase 1 & 3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    useAuthStore.setState({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      hasCheckedAuth: false,
    });
  });

  // REQ-PHASE1-01 & REQ-PHASE3: Token rotation in sessionStorage during fetchMe
  it('sets the user when /auth/me succeeds after the interceptor rotated the token in sessionStorage', async () => {
    setTokens('expired-token', 'refresh-token');
    useAuthStore.setState({ isAuthenticated: true });

    const mockAdmin = { id: 'u1', email: 'richmond@wallx.co', role: 'admin' } as User;

    // Simulate interceptor: request succeeds, but the token in sessionStorage
    // is rotated/different by the time the response is handled.
    vi.mocked(api.get).mockImplementation(async () => {
      setTokens('fresh-token', 'refresh-token');
      return { data: { data: mockAdmin } } as AxiosResponse;
    });

    await useAuthStore.getState().fetchMe();

    expect(useAuthStore.getState().user).toEqual(mockAdmin);
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
    expect(useAuthStore.getState().hasCheckedAuth).toBe(true);
    expect(getAccessToken()).toBe('fresh-token');
  });

  // REQ-PHASE1-02: Logout while fetchMe in-flight does not resurrect session
  it('does not set user and leaves user null when logout() is called while fetchMe is in flight', async () => {
    setTokens('valid-token', 'refresh-token');
    useAuthStore.setState({ isAuthenticated: true });

    const mockAdmin = { id: 'u1', email: 'richmond@wallx.co', role: 'admin' } as User;

    let resolveApi: (value: AxiosResponse) => void;
    const pendingPromise = new Promise<AxiosResponse>((resolve) => {
      resolveApi = resolve;
    });

    vi.mocked(api.get).mockImplementation(() => pendingPromise);

    // Start fetchMe
    const fetchPromise = useAuthStore.getState().fetchMe();

    // Explicit logout while in flight (bumps sessionEpoch and clears tokens)
    useAuthStore.getState().logout();
    expect(useAuthStore.getState().user).toBeNull();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);

    // Resolve the delayed api.get response
    resolveApi!({ data: { data: mockAdmin } } as AxiosResponse);
    await fetchPromise;

    // Must NOT resurrect the session
    expect(useAuthStore.getState().user).toBeNull();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(useAuthStore.getState().hasCheckedAuth).toBe(true);
    expect(getAccessToken()).toBeNull();
  });

  // REQ-PHASE1-03: Genuinely bad token (401) logs out
  it('logs out and sets hasCheckedAuth: true on 401 Unauthorized', async () => {
    setTokens('bad-token', 'bad-refresh');
    useAuthStore.setState({ isAuthenticated: true });

    vi.mocked(api.get).mockRejectedValue({
      response: { status: 401 },
    });

    await useAuthStore.getState().fetchMe();

    expect(useAuthStore.getState().user).toBeNull();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(useAuthStore.getState().hasCheckedAuth).toBe(true);
    expect(getAccessToken()).toBeNull();
    expect(getRefreshToken()).toBeNull();
  });

  // REQ-PHASE1-04: Non-401 error (500, 502, network drop) does NOT sign admin out
  it('does NOT sign out on 502/500 transient errors, sets hasCheckedAuth: true', async () => {
    setTokens('valid-token', 'valid-refresh');
    useAuthStore.setState({ isAuthenticated: true });

    vi.mocked(api.get).mockRejectedValue({
      response: { status: 502 },
    });

    await useAuthStore.getState().fetchMe();

    // User is still null (fetch failed), but session is NOT cleared/logged out
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
    expect(useAuthStore.getState().hasCheckedAuth).toBe(true);
    expect(getAccessToken()).toBe('valid-token');
  });

  // REQ-PHASE1-05: When no token exists, fetchMe completes immediately with hasCheckedAuth: true
  it('immediately sets hasCheckedAuth: true when no access token exists', async () => {
    expect(getAccessToken()).toBeNull();

    await useAuthStore.getState().fetchMe();

    expect(api.get).not.toHaveBeenCalled();
    expect(useAuthStore.getState().user).toBeNull();
    expect(useAuthStore.getState().hasCheckedAuth).toBe(true);
  });

  // REQ-PHASE1-06 & REQ-PHASE3: setAuthSession sets user and stores tokens in sessionStorage
  it('sets user, isAuthenticated: true, and stores tokens in sessionStorage on setAuthSession', () => {
    const adminUser = { id: 'u2', email: 'admin@wallx.co', role: 'admin' } as User;
    useAuthStore.getState().setAuthSession(adminUser, 'tok-access', 'tok-refresh');

    expect(useAuthStore.getState().user).toEqual(adminUser);
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
    expect(getAccessToken()).toBe('tok-access');
    expect(getRefreshToken()).toBe('tok-refresh');
    expect(localStorage.getItem('accessToken')).toBeNull();
  });
});
