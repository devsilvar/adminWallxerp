import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Subscription from '../Subscription';
import { useAuthStore } from '@/stores/auth.store';
import { useBusinessStore } from '@/stores/business.store';
import type { User, Business } from '@/types/index';

// Mock clipboard and window scrollTo
beforeEach(() => {
  useAuthStore.setState({ user: null, isAuthenticated: false });
  useBusinessStore.setState({ activeBusiness: null, businesses: [] });
  vi.clearAllMocks();
});

describe('Subscription Page Role Differentiation (SUB-10)', () => {
  it('renders Team Member Overview and hides payment proof upload when user is a non-owner team member', () => {
    const mockStaff = {
      id: 'staff-u1',
      fullName: 'Emeka Cashier',
      email: 'emeka@store.com',
      role: 'user',
      isOwnerAccount: false,
      isSubscriptionInherited: true,
      subscriptionTier: 'business',
      subscriptionOwner: {
        id: 'owner-u1',
        name: 'Chief Owner',
        email: 'chief@store.com',
      },
    } as unknown as User;

    const mockBiz = {
      id: 'biz-1',
      businessName: 'Lagos Main Branch',
    } as unknown as Business;

    useAuthStore.setState({ user: mockStaff, isAuthenticated: true });
    useBusinessStore.setState({ activeBusiness: mockBiz, businesses: [mockBiz] });

    render(
      <MemoryRouter>
        <Subscription />
      </MemoryRouter>
    );

    // Verify Team Member Overview elements
    expect(screen.getByText(/Team Member Access/i)).toBeInTheDocument();
    expect(screen.getByText(/Organization Subscription/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Chief Owner/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Billing Notice/i)).toBeInTheDocument();

    // Verify owner payment proof upload and pricing plan cards are hidden
    expect(screen.queryByText(/Zenith Bank Plc/i)).toBeNull();
    expect(screen.queryByText(/Upload Payment Receipt/i)).toBeNull();
  });

  it('renders full pricing plan cards and owner flows when user is an owner', () => {
    const mockOwner = {
      id: 'owner-u1',
      fullName: 'Chief Owner',
      email: 'chief@store.com',
      role: 'user',
      isOwnerAccount: true,
      isSubscriptionInherited: false,
      subscriptionTier: 'starter',
      trialEndsAt: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(),
    } as unknown as User;

    const mockBiz = {
      id: 'biz-1',
      businessName: 'Lagos Main Branch',
    } as unknown as Business;

    useAuthStore.setState({ user: mockOwner, isAuthenticated: true });
    useBusinessStore.setState({ activeBusiness: mockBiz, businesses: [mockBiz] });

    render(
      <MemoryRouter>
        <Subscription />
      </MemoryRouter>
    );

    // Verify owner elements
    expect(screen.getByText(/Subscription & Plans/i)).toBeInTheDocument();
    expect(screen.getByText(/1\. Plan/i)).toBeInTheDocument();
    expect(screen.queryByText(/Team Member Access/i)).toBeNull();
  });
});
