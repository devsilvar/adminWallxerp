import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useSessionTimeout } from '../useSessionTimeout';
import { useAuthStore } from '@/stores/auth.store';
import * as sessionModule from '@/lib/session';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

vi.mock('react-hot-toast', () => ({
  default: {
    dismiss: vi.fn(),
    error: vi.fn(),
  },
}));

describe('useSessionTimeout - Visibility Grace Period (Fix 3)', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    mockNavigate.mockClear();

    localStorage.setItem('accessToken', 'valid-token');
    useAuthStore.setState({
      user: { id: 'user-1' } as any,
      isAuthenticated: true,
      isBootstrapping: false,
      hasCheckedAuth: true,
    });

    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('delays logout by 45s grace period when tab becomes visible and session is expired', async () => {
    // Session is marked as expired
    vi.spyOn(sessionModule, 'isSessionExpired').mockReturnValue(true);
    vi.spyOn(sessionModule, 'isIdleExpired').mockReturnValue(true);
    const logoutSpy = vi.spyOn(useAuthStore.getState(), 'logout');

    renderHook(() => useSessionTimeout());

    // Trigger visibilitychange to visible
    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      configurable: true,
    });

    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });

    // Immediately at t=0: logout must NOT have been called yet (grace period in effect)
    expect(logoutSpy).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();

    // At t=30s: still within 45s grace window
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(logoutSpy).not.toHaveBeenCalled();

    // At t=45s: grace window closes, user did not interact -> logout enforced
    await act(async () => {
      vi.advanceTimersByTime(15_000);
    });

    expect(logoutSpy).toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith('/login', { replace: true });
  });

  it('cancels logout if user interacts within the 45s grace window', async () => {
    // Initial state: expired when tab first focused
    const isExpiredMock = vi.spyOn(sessionModule, 'isSessionExpired');
    isExpiredMock.mockReturnValue(true);
    const touchSpy = vi.spyOn(sessionModule, 'touchActivity');
    const logoutSpy = vi.spyOn(useAuthStore.getState(), 'logout');

    renderHook(() => useSessionTimeout());

    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      configurable: true,
    });

    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });

    expect(logoutSpy).not.toHaveBeenCalled();

    // User clicks within the grace window at t=10s
    act(() => {
      vi.advanceTimersByTime(10_000);
      document.dispatchEvent(new MouseEvent('mousedown'));
    });

    // Touch activity was recorded
    expect(touchSpy).toHaveBeenCalled();

    // User activity makes the session valid again
    isExpiredMock.mockReturnValue(false);

    // Fast-forward past the 45s mark (another 40s)
    await act(async () => {
      vi.advanceTimersByTime(40_000);
    });

    // Logout was successfully avoided!
    expect(logoutSpy).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('cancels the grace timer if the tab is hidden again before 45s', async () => {
    vi.spyOn(sessionModule, 'isSessionExpired').mockReturnValue(true);
    vi.spyOn(sessionModule, 'isIdleExpired').mockReturnValue(true);
    const logoutSpy = vi.spyOn(useAuthStore.getState(), 'logout');

    renderHook(() => useSessionTimeout());

    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      configurable: true,
    });

    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });

    expect(logoutSpy).not.toHaveBeenCalled();

    // User hides the tab at t=20s
    act(() => {
      vi.advanceTimersByTime(20_000);
      Object.defineProperty(document, 'visibilityState', {
        value: 'hidden',
        configurable: true,
      });
      document.dispatchEvent(new Event('visibilitychange'));
    });

    // Advance another 30s (total elapsed 50s > 45s grace period, but < 60s check interval)
    await act(async () => {
      vi.advanceTimersByTime(30_000);
    });

    // Grace timer was cleared when hidden, so it didn't fire at 45s
    expect(logoutSpy).not.toHaveBeenCalled();
  });
});
