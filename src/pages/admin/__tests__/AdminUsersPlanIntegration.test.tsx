import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AdminUsers from '../AdminUsers';
import api from '@/lib/axios';

// Mock api
vi.mock('@/lib/axios', () => ({
  default: {
    get: vi.fn(),
    patch: vi.fn(),
  },
  getErrorMessage: (err: any) => err?.message || 'Error occurred',
}));

vi.mock('react-hot-toast', () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe('AdminUsers Directory Page', () => {
  const mockUsers = [
    {
      id: 'u-1',
      email: 'founder@starter.ng',
      role: 'user',
      isVerified: true,
      isActive: true,
      lastLoginAt: null,
      createdAt: new Date().toISOString(),
      _count: { businesses: 1 },
      autoPayoutEnabled: false,
      subscriptionTier: 'starter',
      subscriptionExpiresAt: new Date(Date.now() + 20 * 86400000).toISOString(),
      trialEndsAt: null,
    },
    {
      id: 'u-2',
      email: 'corp@enterprise.ng',
      role: 'user',
      isVerified: true,
      isActive: true,
      lastLoginAt: null,
      createdAt: new Date().toISOString(),
      _count: { businesses: 5 },
      autoPayoutEnabled: true,
      subscriptionTier: 'scale_up',
      subscriptionExpiresAt: null,
      trialEndsAt: null,
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    (api.get as any).mockResolvedValue({
      data: {
        success: true,
        data: mockUsers,
        pagination: { page: 1, limit: 15, total: 2, totalPages: 1 },
      },
    });
  });

  it('renders the Plan column header and correct status badges for each user', async () => {
    render(
      <MemoryRouter>
        <AdminUsers />
      </MemoryRouter>
    );

    // Verify Plan header
    await waitFor(() => {
      expect(screen.getByRole('columnheader', { name: 'Plan' })).toBeInTheDocument();
    });

    // Verify User 1 badge
    expect(screen.getByText('founder@starter.ng')).toBeInTheDocument();
    expect(screen.getByText('Starter')).toBeInTheDocument();

    // Verify User 2 badge
    expect(screen.getByText('corp@enterprise.ng')).toBeInTheDocument();
    expect(screen.getByText('Scale-Up')).toBeInTheDocument();
  });

  it('renders direct navigation links to the dedicated User Details page without opening a modal', async () => {
    render(
      <MemoryRouter>
        <AdminUsers />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('founder@starter.ng')).toBeInTheDocument();
    });

    // Verify clean "Details" links are present for each row
    const detailLinks = screen.getAllByRole('link', { name: /Details/i });
    expect(detailLinks.length).toBe(2);

    expect(detailLinks[0]).toHaveAttribute('href', '/admin/users/u-1');
    expect(detailLinks[1]).toHaveAttribute('href', '/admin/users/u-2');

    // Verify email links also point to User Details page
    const emailLink1 = screen.getByRole('link', { name: 'founder@starter.ng' });
    expect(emailLink1).toHaveAttribute('href', '/admin/users/u-1');

    // Verify NO modal dialog is present in the DOM
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
