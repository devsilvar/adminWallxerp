import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';
import toast from 'react-hot-toast';
import { useAdminIdle } from '../useAdminIdle.ts';
import { useAuthStore, User } from '@/stores/auth.store.ts';
import {
  clearActivity,
  ADMIN_IDLE_TIMEOUT_MS,
} from '@/lib/session.ts';

const mockNavigate = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock('react-hot-toast', () => ({
  default: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

const mockAdminUser: User = {
  id: 'admin-1',
  email: 'admin@wallx.co',
  role: 'admin',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

describe('useAdminIdle Hook — Phase 4 (qahunter.md RTM)', () => {
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <MemoryRouter>{children}</MemoryRouter>
  );

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    sessionStorage.clear();
    localStorage.clear();

    useAuthStore.setState({
      user: null,
      isAuthenticated: false,
      hasCheckedAuth: true,
      sessionEpoch: 0,
      isLoading: false,
    });

    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    clearActivity();
  });

  // REQ-HOOK-01: Negative Unauthenticated Path
  it('does nothing when user is not authenticated [negative]', () => {
    renderHook(() => useAdminIdle(), { wrapper });

    expect(sessionStorage.getItem('admin:lastActivityAt')).toBeNull();
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });

  // REQ-HOOK-02: Immediate Expiry on Mount (e.g. browser restored tab after >30m)
  it('immediately logs out and navigates to login if session was already expired on mount [boundary]', () => {
    const expiredTimestamp = Date.now() - (ADMIN_IDLE_TIMEOUT_MS + 10_000);
    sessionStorage.setItem('admin:lastActivityAt', String(expiredTimestamp));

    useAuthStore.setState({
      user: mockAdminUser,
      isAuthenticated: true,
      hasCheckedAuth: true,
      sessionEpoch: 1,
    });

    renderHook(() => useAdminIdle(), { wrapper });

    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(useAuthStore.getState().user).toBeNull();
    expect(sessionStorage.getItem('admin:lastActivityAt')).toBeNull();
    expect(toast.error).toHaveBeenCalledWith('Session expired. Please sign in again.');
    expect(mockNavigate).toHaveBeenCalledWith('/admin/login', { replace: true });
  });

  // REQ-HOOK-03: Fresh Session Initialization
  it('initializes lastActivityAt on mount for active authenticated user [positive]', () => {
    useAuthStore.setState({
      user: mockAdminUser,
      isAuthenticated: true,
      hasCheckedAuth: true,
      sessionEpoch: 1,
    });

    renderHook(() => useAdminIdle(), { wrapper });

    expect(sessionStorage.getItem('admin:lastActivityAt')).toBe(String(Date.now()));
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });

  // REQ-HOOK-04: Throttled Activity Events (pointerdown, keydown)
  it('throttles activity writes to sessionStorage within 30-second window [boundary]', () => {
    useAuthStore.setState({
      user: mockAdminUser,
      isAuthenticated: true,
      hasCheckedAuth: true,
      sessionEpoch: 1,
    });

    const startTime = Date.now();
    renderHook(() => useAdminIdle(), { wrapper });

    expect(sessionStorage.getItem('admin:lastActivityAt')).toBe(String(startTime));

    // Advance 10s: should be throttled (< 30s)
    act(() => {
      vi.advanceTimersByTime(10_000);
      window.dispatchEvent(new Event('pointerdown'));
    });
    // Timestamp should NOT have updated because lastWrite was 0, but on mount lastWrite was 0
    // Note: in useAdminIdle, let lastWrite = 0.
    // The first event at 10,000 has (10,000 - 0 = 10,000) which is < 30,000, so it is throttled!
    expect(sessionStorage.getItem('admin:lastActivityAt')).toBe(String(startTime));

    // Advance 25s more (total 35s from start): >= 30s throttle
    act(() => {
      vi.advanceTimersByTime(25_000);
      window.dispatchEvent(new Event('pointerdown'));
    });
    expect(sessionStorage.getItem('admin:lastActivityAt')).toBe(String(startTime + 35_000));

    // Keydown immediately at +36s (< 30s since lastWrite at 35s): throttled
    act(() => {
      vi.advanceTimersByTime(1_000);
      window.dispatchEvent(new Event('keydown'));
    });
    expect(sessionStorage.getItem('admin:lastActivityAt')).toBe(String(startTime + 35_000));

    // Keydown after 31s (at +66s): updates
    act(() => {
      vi.advanceTimersByTime(30_000);
      window.dispatchEvent(new Event('keydown'));
    });
    expect(sessionStorage.getItem('admin:lastActivityAt')).toBe(String(startTime + 66_000));
  });

  // REQ-HOOK-05: Tab Visibility Handling
  it('logs out on visibility change if idle expired while tab was hidden [positive]', () => {
    useAuthStore.setState({
      user: mockAdminUser,
      isAuthenticated: true,
      hasCheckedAuth: true,
      sessionEpoch: 1,
    });

    renderHook(() => useAdminIdle(), { wrapper });

    // Tab is hidden
    Object.defineProperty(document, 'visibilityState', {
      value: 'hidden',
      configurable: true,
    });

    // Advance 31 minutes while tab is hidden
    act(() => {
      vi.advanceTimersByTime(31 * 60 * 1000);
      document.dispatchEvent(new Event('visibilitychange'));
    });

    // Because document was hidden, onVisible returns early
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
    expect(mockNavigate).not.toHaveBeenCalled();

    // Now tab becomes visible
    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      configurable: true,
    });

    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });

    // Idle expired -> triggers logout
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(toast.error).toHaveBeenCalledWith('Session expired. Please sign in again.');
    expect(mockNavigate).toHaveBeenCalledWith('/admin/login', { replace: true });
  });

  // REQ-HOOK-06: Active Inactivity Interval (User leaves open tab in foreground)
  it('logs out via background 60s check interval when 30 mins pass without activity [positive]', () => {
    useAuthStore.setState({
      user: mockAdminUser,
      isAuthenticated: true,
      hasCheckedAuth: true,
      sessionEpoch: 1,
    });

    renderHook(() => useAdminIdle(), { wrapper });

    // Advance 29 minutes — still active
    act(() => {
      vi.advanceTimersByTime(29 * 60 * 1000);
    });
    expect(useAuthStore.getState().isAuthenticated).toBe(true);

    // Advance another 2 minutes (total 31 minutes > 30 minutes)
    act(() => {
      vi.advanceTimersByTime(2 * 60 * 1000);
    });

    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(toast.error).toHaveBeenCalledWith('Session expired. Please sign in again.');
    expect(mockNavigate).toHaveBeenCalledWith('/admin/login', { replace: true });
  });

  // REQ-HOOK-07: Cleanup on Unmount
  it('removes all event listeners and clears interval on unmount [boundary]', () => {
    useAuthStore.setState({
      user: mockAdminUser,
      isAuthenticated: true,
      hasCheckedAuth: true,
      sessionEpoch: 1,
    });

    const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');
    const removeDocListenerSpy = vi.spyOn(document, 'removeEventListener');
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval');

    const { unmount } = renderHook(() => useAdminIdle(), { wrapper });

    unmount();

    expect(removeEventListenerSpy).toHaveBeenCalledWith('pointerdown', expect.any(Function));
    expect(removeEventListenerSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
    expect(removeDocListenerSpy).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
    expect(clearIntervalSpy).toHaveBeenCalled();
  });
});
