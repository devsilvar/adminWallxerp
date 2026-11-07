import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import SubscriptionGraceBanner from '../SubscriptionGraceBanner';
import { useAuthStore } from '@/stores/auth.store';
import type { User } from '@/types/index';

describe('SubscriptionGraceBanner (Soft Read-Only Grace & Expiry)', () => {
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;

  beforeEach(() => {
    useAuthStore.setState({ user: null, isAuthenticated: false });
  });

  it('renders read-only grace warning during 2-day grace period (Day 31)', () => {
    // Day 31 (within 2-day grace period for 30-day trial)
    const createdAt = new Date(Date.now() - 31 * ONE_DAY_MS).toISOString();
    const mockUser = {
      id: 'u-grace',
      email: 'grace@test.com',
      createdAt,
      subscriptionTier: 'free',
    } as unknown as User;

    useAuthStore.setState({ user: mockUser, isAuthenticated: true });

    render(
      <MemoryRouter>
        <SubscriptionGraceBanner />
      </MemoryRouter>
    );

    expect(screen.getByText(/Read-Only Grace Period:/i)).toBeInTheDocument();
    expect(screen.getByText(/Upgrade Now/i)).toBeInTheDocument();
  });

  it('does not render when trial is active (Day 15)', () => {
    const createdAt = new Date(Date.now() - 15 * ONE_DAY_MS).toISOString();
    const mockUser = {
      id: 'u-active',
      email: 'active@test.com',
      createdAt,
      subscriptionTier: 'free',
    } as unknown as User;

    useAuthStore.setState({ user: mockUser, isAuthenticated: true });

    render(
      <MemoryRouter>
        <SubscriptionGraceBanner />
      </MemoryRouter>
    );

    expect(screen.queryByText(/Read-Only Grace Period:/i)).toBeNull();
    expect(screen.queryByText(/Your trial has ended/i)).toBeNull();
  });

  it('renders non-blocking expired notice when past grace period (Day 35)', () => {
    const createdAt = new Date(Date.now() - 35 * ONE_DAY_MS).toISOString();
    const mockUser = {
      id: 'u-expired',
      email: 'expired@test.com',
      createdAt,
      subscriptionTier: 'free',
    } as unknown as User;

    useAuthStore.setState({ user: mockUser, isAuthenticated: true });

    render(
      <MemoryRouter>
        <SubscriptionGraceBanner />
      </MemoryRouter>
    );

    expect(screen.getByText(/Your trial has ended/i)).toBeInTheDocument();
    expect(screen.getByText(/Upgrade Now/i)).toBeInTheDocument();
  });

  it('allows dismissing banner for current session', () => {
    const createdAt = new Date(Date.now() - 31 * ONE_DAY_MS).toISOString();
    const mockUser = {
      id: 'u-grace',
      email: 'grace@test.com',
      createdAt,
      subscriptionTier: 'free',
    } as unknown as User;

    useAuthStore.setState({ user: mockUser, isAuthenticated: true });

    render(
      <MemoryRouter>
        <SubscriptionGraceBanner />
      </MemoryRouter>
    );

    const dismissBtn = screen.getByRole('button', { name: /Dismiss banner/i });
    fireEvent.click(dismissBtn);

    expect(screen.queryByText(/Read-Only Grace Period:/i)).toBeNull();
  });

  it('renders team member tailored copy and View Status button when subscription is inherited', () => {
    const createdAt = new Date(Date.now() - 31 * ONE_DAY_MS).toISOString();
    const mockUser = {
      id: 'u-staff',
      email: 'staff@test.com',
      createdAt,
      subscriptionTier: 'free',
      isSubscriptionInherited: true,
      subscriptionOwner: {
        id: 'u-owner',
        name: 'Chief Owner',
        email: 'owner@test.com',
      },
    } as unknown as User;

    useAuthStore.setState({ user: mockUser, isAuthenticated: true });

    render(
      <MemoryRouter>
        <SubscriptionGraceBanner />
      </MemoryRouter>
    );

    expect(screen.getByText(/Please contact Chief Owner to renew/i)).toBeInTheDocument();
    expect(screen.getByText(/View Status/i)).toBeInTheDocument();
  });
});

