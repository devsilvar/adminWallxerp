import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useSubscriptionStatus } from '../useSubscriptionStatus';
import { useAuthStore } from '@/stores/auth.store';
import type { User } from '@/types/index';

describe('Phase 4: useSubscriptionStatus Hook Unit Tests', () => {
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;

  beforeEach(() => {
    useAuthStore.setState({ user: null, isAuthenticated: false });
  });

  it('provides active trial status for a fresh account (within 30 days)', () => {
    const createdAt = new Date(Date.now() - 3 * ONE_DAY_MS).toISOString();
    const mockUser = {
      id: 'u-1',
      email: 'owner@sme.ng',
      createdAt,
      subscriptionTier: 'free',
      trialEndsAt: null,
      subscriptionExpiresAt: null,
    } as unknown as User;

    useAuthStore.setState({ user: mockUser, isAuthenticated: true });

    const { result } = renderHook(() => useSubscriptionStatus());

    expect(result.current.hasAccess).toBe(true);
    expect(result.current.canWrite).toBe(true);
    expect(result.current.isReadOnlyGrace).toBe(false);
    expect(result.current.isExpired).toBe(false);
    expect(result.current.isTrial).toBe(true);
    expect(result.current.isPaid).toBe(false);
    expect(result.current.tier).toBe('free');
    expect(result.current.daysRemaining).toBe(27);
  });

  it('activates 2-day read-only grace period on day 31', () => {
    const createdAt = new Date(Date.now() - 31 * ONE_DAY_MS).toISOString();
    const mockUser = {
      id: 'u-2',
      email: 'grace@sme.ng',
      createdAt,
      subscriptionTier: 'free',
      trialEndsAt: null,
      subscriptionExpiresAt: null,
    } as unknown as User;

    useAuthStore.setState({ user: mockUser, isAuthenticated: true });

    const { result } = renderHook(() => useSubscriptionStatus());

    expect(result.current.hasAccess).toBe(true);
    expect(result.current.canWrite).toBe(false); // Mutating writes blocked
    expect(result.current.isReadOnlyGrace).toBe(true);
    expect(result.current.isExpired).toBe(true);
    expect(result.current.graceHoursRemaining).toBeGreaterThan(0);
    expect(result.current.formattedCountdown).toContain('Grace period');
  });

  it('completely marks expired and blocks access on day 33 (past grace period)', () => {
    const createdAt = new Date(Date.now() - 33 * ONE_DAY_MS).toISOString();
    const mockUser = {
      id: 'u-3',
      email: 'expired@sme.ng',
      createdAt,
      subscriptionTier: 'free',
      trialEndsAt: null,
      subscriptionExpiresAt: null,
    } as unknown as User;

    useAuthStore.setState({ user: mockUser, isAuthenticated: true });

    const { result } = renderHook(() => useSubscriptionStatus());

    expect(result.current.hasAccess).toBe(false);
    expect(result.current.canWrite).toBe(false);
    expect(result.current.isReadOnlyGrace).toBe(false);
    expect(result.current.isExpired).toBe(true);
    expect(result.current.formattedCountdown).toBe('Expired');
  });

  it('identifies active paid business tier with full write capacity', () => {
    const mockUser = {
      id: 'u-4',
      email: 'business@sme.ng',
      createdAt: new Date(Date.now() - 100 * ONE_DAY_MS).toISOString(),
      subscriptionTier: 'business',
      subscriptionExpiresAt: new Date(Date.now() + 60 * ONE_DAY_MS).toISOString(),
    } as unknown as User;

    useAuthStore.setState({ user: mockUser, isAuthenticated: true });

    const { result } = renderHook(() => useSubscriptionStatus());

    expect(result.current.hasAccess).toBe(true);
    expect(result.current.canWrite).toBe(true);
    expect(result.current.isPaid).toBe(true);
    expect(result.current.isTrial).toBe(false);
    expect(result.current.tier).toBe('business');
    expect(result.current.planName).toBe('Business');
  });
});
