import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import AdminUserDetail from '../AdminUserDetail';
import api from '@/lib/axios';

vi.mock('@/lib/axios', () => ({
  default: {
    get: vi.fn(),
    patch: vi.fn(),
    post: vi.fn(),
  },
  getErrorMessage: (err: any) => err?.message || 'Error occurred',
}));

vi.mock('react-hot-toast', () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe('AdminUserDetail Page', () => {
  const mockUserDetail = {
    id: 'user-001',
    email: 'merchant1@example.com',
    phone: '+2348012345678',
    role: 'user',
    isVerified: true,
    isActive: true,
    lastLoginAt: '2026-10-08T10:00:00.000Z',
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-10-08T10:00:00.000Z',
    autoPayoutEnabled: false,
    subscriptionTier: 'scale_up',
    subscriptionExpiresAt: '2026-11-01T00:00:00.000Z',
    trialEndsAt: null,
    walletBalance: {
      balance: 150000,
      lockedBalance: 25000,
      currency: 'NGN',
    },
    businesses: [
      {
        id: 'biz-101',
        businessName: 'Apex Supermarket Ltd',
        ownerName: 'Chief Emeka',
        taxId: 'TIN-98765432',
        businessType: 'Retail',
        city: 'Ikeja',
        state: 'Lagos',
        virtualAccountNumber: '9988776655',
        virtualAccountBank: 'Wema Bank',
        settlementAccountNumber: '0123456789',
        settlementBankName: 'Zenith Bank',
        settlementAccountName: 'Apex Supermarket Ltd',
        createdAt: '2026-08-05T00:00:00.000Z',
        _count: {
          sales: 42,
          invoices: 15,
          expenses: 8,
          customers: 30,
        },
      },
    ],
    subscriptionSubmissions: [
      {
        id: 'sub-sub-1',
        plan: 'scale_up',
        billingCycle: 'yearly',
        amount: 250000,
        status: 'approved',
        notes: 'Annual renewal via bank transfer',
        receiptUrl: 'https://example.com/receipt.pdf',
        createdAt: '2026-08-01T00:00:00.000Z',
      },
    ],
    feedbacks: [
      {
        id: 'fb-1',
        rating: 5,
        sentiment: 'positive',
        comment: 'Outstanding platform for automated tax filing and invoicing!',
        tags: ['invoicing', 'speed'],
        createdAt: '2026-09-01T00:00:00.000Z',
      },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (api.get as any).mockResolvedValue({
      data: {
        success: true,
        data: mockUserDetail,
      },
    });
  });

  const renderComponent = (userId = 'user-001') => {
    return render(
      <MemoryRouter initialEntries={[`/admin/users/${userId}`]}>
        <Routes>
          <Route path='/admin/users/:userId' element={<AdminUserDetail />} />
        </Routes>
      </MemoryRouter>
    );
  };

  it('renders complete user profile, subscription, wallet balance, and business data', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: 'merchant1@example.com' })).toBeInTheDocument();
    });

    // Profile & ID
    expect(screen.getAllByText('user-001').length).toBeGreaterThan(0);
    expect(screen.getByText('+2348012345678')).toBeInTheDocument();

    // Badges & Status Pills
    expect(screen.getByText('Active Account')).toBeInTheDocument();
    expect(screen.getByText('Email Verified')).toBeInTheDocument();
    expect(screen.getAllByText('Scale-Up').length).toBeGreaterThan(0);

    // Wallet balance
    expect(screen.getByText('₦150,000')).toBeInTheDocument();

    // Business details
    expect(screen.getByText('Apex Supermarket Ltd')).toBeInTheDocument();
    expect(screen.getByText('Chief Emeka')).toBeInTheDocument();
    expect(screen.getByText('9988776655')).toBeInTheDocument();
    expect(screen.getByText('Wema Bank')).toBeInTheDocument();
    expect(screen.getByText('0123456789')).toBeInTheDocument();
    expect(screen.getByText('Zenith Bank')).toBeInTheDocument();

    // Counters
    expect(screen.getByText('42')).toBeInTheDocument();

    // Subscription submissions
    expect(screen.getByText(/Annual renewal via bank transfer/i)).toBeInTheDocument();

    // Feedback
    expect(screen.getByText(/Outstanding platform for automated tax filing/i)).toBeInTheDocument();
  });

  it('toggles payout mode via PATCH /admin/users/:id/auto-payout', async () => {
    (api.patch as any).mockResolvedValue({
      data: { success: true },
    });

    renderComponent();

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: 'merchant1@example.com' })).toBeInTheDocument();
    });

    // Switch to Automatic Transfers button
    const autoPayoutBtn = screen.getByRole('button', { name: /Switch to Automatic Payout/i });
    fireEvent.click(autoPayoutBtn);

    await waitFor(() => {
      expect(api.patch).toHaveBeenCalledWith('/admin/users/user-001/auto-payout', {
        enabled: true,
      });
    });
  });

  it('toggles account active status via PATCH /admin/users/:id/status', async () => {
    (api.patch as any).mockResolvedValue({
      data: { success: true },
    });

    renderComponent();

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: 'merchant1@example.com' })).toBeInTheDocument();
    });

    const deactivateBtn = screen.getByRole('button', { name: /Deactivate Account/i });
    fireEvent.click(deactivateBtn);

    await waitFor(() => {
      expect(api.patch).toHaveBeenCalledWith('/admin/users/user-001/status', {
        isActive: false,
      });
    });
  });

  it('toggles email verification via PATCH /admin/users/:id/email-verification', async () => {
    (api.patch as any).mockResolvedValue({
      data: { success: true },
    });

    renderComponent();

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: 'merchant1@example.com' })).toBeInTheDocument();
    });

    const verifyBtn = screen.getByRole('button', { name: /Mark Unverified/i });
    fireEvent.click(verifyBtn);

    await waitFor(() => {
      expect(api.patch).toHaveBeenCalledWith('/admin/users/user-001/email-verification', {
        isVerified: false,
      });
    });
  });

  it('opens ChangePlanModal when clicking Change Subscription Plan', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: 'merchant1@example.com' })).toBeInTheDocument();
    });

    const changePlanBtn = screen.getByRole('button', { name: /Change Subscription Plan/i });
    fireEvent.click(changePlanBtn);

    expect(screen.getByText('Manage User Subscription')).toBeInTheDocument();
    expect(screen.getByText(/Assign or adjust subscription plan for merchant1@example\.com/i)).toBeInTheDocument();
  });
});
