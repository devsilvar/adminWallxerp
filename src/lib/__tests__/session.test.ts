import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getAccessToken,
  getRefreshToken,
  setTokens,
  setAccessToken,
  clearTokens,
  touchActivity,
  isIdleExpired,
  clearActivity,
  ADMIN_IDLE_TIMEOUT_MS,
} from '../session.ts';

describe('Admin Session Storage Isolation & Activity Tracking (qahunter.md RTM)', () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    vi.restoreAllMocks();
  });

  // REQ-SES-01: Positive Token Read & Write
  it('stores and retrieves access and refresh tokens exclusively in sessionStorage [positive]', () => {
    expect(getAccessToken()).toBeNull();
    expect(getRefreshToken()).toBeNull();

    setTokens('admin-jwt-access-123', 'admin-jwt-refresh-456');

    expect(getAccessToken()).toBe('admin-jwt-access-123');
    expect(getRefreshToken()).toBe('admin-jwt-refresh-456');

    // Strict boundary: MUST NOT touch localStorage
    expect(localStorage.getItem('accessToken')).toBeNull();
    expect(localStorage.getItem('refreshToken')).toBeNull();
  });

  // REQ-SES-02: Isolated Access Token Rotation
  it('updates only the accessToken on setAccessToken without altering refreshToken [boundary]', () => {
    setTokens('initial-access', 'constant-refresh');

    setAccessToken('rotated-access');

    expect(getAccessToken()).toBe('rotated-access');
    expect(getRefreshToken()).toBe('constant-refresh');
    expect(localStorage.getItem('accessToken')).toBeNull();
  });

  // REQ-SES-03: Token Clearing on Sign-Out
  it('removes all tokens and activity from sessionStorage on clearTokens [positive]', () => {
    setTokens('access-to-clear', 'refresh-to-clear');
    touchActivity();

    expect(sessionStorage.getItem('admin:lastActivityAt')).not.toBeNull();

    clearTokens();

    expect(getAccessToken()).toBeNull();
    expect(getRefreshToken()).toBeNull();
    expect(sessionStorage.getItem('admin:lastActivityAt')).toBeNull();
  });

  // REQ-SES-04: Idempotent Token Clearing
  it('clearTokens is safely idempotent when no tokens exist [negative/edge]', () => {
    expect(() => {
      clearTokens();
      clearTokens();
    }).not.toThrow();

    expect(getAccessToken()).toBeNull();
    expect(getRefreshToken()).toBeNull();
  });

  // REQ-IDLE-01: Touch Activity records current timestamp
  it('touchActivity records the current timestamp in sessionStorage [positive]', () => {
    const fixedNow = 1700000000000;
    vi.spyOn(Date, 'now').mockReturnValue(fixedNow);

    touchActivity();

    expect(sessionStorage.getItem('admin:lastActivityAt')).toBe(String(fixedNow));
  });

  // REQ-IDLE-02: isIdleExpired when no marker is set
  it('isIdleExpired returns false when no activity marker has been set [negative/boundary]', () => {
    expect(isIdleExpired()).toBe(false);
  });

  // REQ-IDLE-03: isIdleExpired within 30 min window
  it('isIdleExpired returns false when elapsed time is within ADMIN_IDLE_TIMEOUT_MS [positive]', () => {
    const baseTime = 1700000000000;
    vi.spyOn(Date, 'now').mockReturnValue(baseTime);
    touchActivity();

    // 15 minutes later (900,000 ms)
    vi.spyOn(Date, 'now').mockReturnValue(baseTime + 15 * 60 * 1000);
    expect(isIdleExpired()).toBe(false);
  });

  // REQ-IDLE-04: isIdleExpired boundary condition at exactly 30 mins vs 30 mins + 1ms
  it('isIdleExpired returns false at exactly ADMIN_IDLE_TIMEOUT_MS, and true at +1ms [boundary]', () => {
    const baseTime = 1700000000000;
    vi.spyOn(Date, 'now').mockReturnValue(baseTime);
    touchActivity();

    // Exactly 30 minutes
    vi.spyOn(Date, 'now').mockReturnValue(baseTime + ADMIN_IDLE_TIMEOUT_MS);
    expect(isIdleExpired()).toBe(false);

    // 30 minutes + 1 millisecond
    vi.spyOn(Date, 'now').mockReturnValue(baseTime + ADMIN_IDLE_TIMEOUT_MS + 1);
    expect(isIdleExpired()).toBe(true);
  });

  // REQ-IDLE-05: clearActivity removes lastActivityAt marker
  it('clearActivity removes the activity timestamp from sessionStorage [positive]', () => {
    touchActivity();
    expect(sessionStorage.getItem('admin:lastActivityAt')).not.toBeNull();

    clearActivity();
    expect(sessionStorage.getItem('admin:lastActivityAt')).toBeNull();
  });
});
