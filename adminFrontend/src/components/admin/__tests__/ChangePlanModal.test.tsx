import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ChangePlanModal from '../ChangePlanModal';
import api from '@/lib/axios';
import toast from 'react-hot-toast';
import type { AdminUser } from '@/types/index';

// Mock dependencies
vi.mock('@/lib/axios', () => ({
  default: {
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

describe('Phase 2 Component Test: ChangePlanModal', () => {
  const mockUser: AdminUser = {
    id: 'user-456',
    email: 'merchant@wallx.ng',
    role: 'user',
    isVerified: true,
    isActive: true,
    lastLoginAt: null,
    createdAt: new Date().toISOString(),
    _count: { businesses: 2 },
    autoPayoutEnabled: false,
    subscriptionTier: 'starter',
    subscriptionExpiresAt: new Date(Date.now() + 15 * 86400000).toISOString(),
    trialEndsAt: null,
  };

  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    user: mockUser,
    onSuccess: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders modal with target user details, current plan, and options when isOpen is true', () => {
    render(<ChangePlanModal {...defaultProps} />);

    expect(screen.getByText('Manage User Subscription')).toBeInTheDocument();
    expect(screen.getByText(/Assign or adjust subscription plan for merchant@wallx\.ng/i)).toBeInTheDocument();
    expect(screen.getByText('Current Plan')).toBeInTheDocument();
    expect(screen.getByText('Starter')).toBeInTheDocument();

    // Verify Tier cards are rendered
    expect(screen.getByText('Starter')).toBeInTheDocument();
    expect(screen.getByText('Business')).toBeInTheDocument();
    expect(screen.getByText('Scale-Up')).toBeInTheDocument();
    expect(screen.getByText('Free Trial')).toBeInTheDocument();

    // Verify Duration buttons are rendered
    expect(screen.getByText(/30 Days \(1 Mo\)/i)).toBeInTheDocument();
    expect(screen.getByText(/90 Days \(Quarter\)/i)).toBeInTheDocument();
    expect(screen.getByText(/1 Year \(Annual\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Lifetime \(No Expiry\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Reset 30-Day Trial/i)).toBeInTheDocument();
    expect(screen.getByText(/Custom Date/i)).toBeInTheDocument();
  });

  it('does not render content when isOpen is false', () => {
    render(<ChangePlanModal {...defaultProps} isOpen={false} />);
    expect(screen.queryByText('Manage User Subscription')).toBeNull();
  });

  it('validates mandatory reason and prevents submission if reason is empty or under 3 chars', async () => {
    render(<ChangePlanModal {...defaultProps} />);

    const reasonInput = screen.getByPlaceholderText(/Paid via GTBank direct transfer/i);
    fireEvent.change(reasonInput, { target: { value: 'ab' } }); // under 3 chars

    const submitBtn = screen.getByRole('button', { name: /Save Plan Changes/i });
    fireEvent.click(submitBtn);

    expect(toast.error).toHaveBeenCalledWith('Please provide a mandatory audit reason (minimum 3 characters)');
    expect(api.patch).not.toHaveBeenCalled();
  });

  it('submits tier upgrade with 90-day duration and calls onSuccess and onClose', async () => {
    (api.patch as any).mockResolvedValueOnce({
      data: {
        success: true,
        message: 'Subscription successfully updated to business',
        data: {
          id: mockUser.id,
          subscriptionTier: 'business',
          subscriptionExpiresAt: new Date(Date.now() + 90 * 86400000).toISOString(),
          trialEndsAt: null,
        },
      },
    });

    render(<ChangePlanModal {...defaultProps} />);

    // Select Business Tier
    const businessCard = screen.getByText('Business');
    fireEvent.click(businessCard);

    // Select 90 Days preset
    const ninetyDaysBtn = screen.getByText(/90 Days \(Quarter\)/i);
    fireEvent.click(ninetyDaysBtn);

    // Fill in audit reason
    const reasonInput = screen.getByPlaceholderText(/Paid via GTBank direct transfer/i);
    fireEvent.change(reasonInput, { target: { value: 'Paid quarterly invoice #5021' } });

    // Submit form
    const submitBtn = screen.getByRole('button', { name: /Save Plan Changes/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(api.patch).toHaveBeenCalledWith('/admin/users/user-456/subscription', {
        tier: 'business',
        durationDays: 90,
        resetTrial: false,
        customExpiresAt: undefined,
        confirmDowngrade: false,
        reason: 'Paid quarterly invoice #5021',
      });
    });

    expect(toast.success).toHaveBeenCalledWith('Subscription successfully updated to business');
    expect(defaultProps.onSuccess).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'user-456',
        subscriptionTier: 'business',
      })
    );
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it('handles resetting 30-day trial correctly', async () => {
    (api.patch as any).mockResolvedValueOnce({
      data: {
        success: true,
        message: 'Subscription successfully updated to free',
        data: {
          id: mockUser.id,
          subscriptionTier: 'free',
          subscriptionExpiresAt: null,
          trialEndsAt: new Date(Date.now() + 30 * 86400000).toISOString(),
        },
      },
    });

    render(<ChangePlanModal {...defaultProps} />);

    // Select Free Trial Tier
    const freeCard = screen.getByText('Free Trial');
    fireEvent.click(freeCard);

    // Select Reset 30-Day Trial preset
    const resetTrialBtn = screen.getByText(/Reset 30-Day Trial/i);
    fireEvent.click(resetTrialBtn);

    // Fill in reason
    const reasonInput = screen.getByPlaceholderText(/Paid via GTBank direct transfer/i);
    fireEvent.change(reasonInput, { target: { value: 'Courtesy 30-day sales evaluation extension' } });

    // Submit
    const submitBtn = screen.getByRole('button', { name: /Save Plan Changes/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(api.patch).toHaveBeenCalledWith('/admin/users/user-456/subscription', {
        tier: 'free',
        durationDays: undefined,
        resetTrial: true,
        customExpiresAt: undefined,
        confirmDowngrade: false,
        reason: 'Courtesy 30-day sales evaluation extension',
      });
    });

    expect(defaultProps.onSuccess).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'user-456',
        subscriptionTier: 'free',
      })
    );
  });

  it('handles lifetime (no expiry) subscription correctly', async () => {
    (api.patch as any).mockResolvedValueOnce({
      data: {
        success: true,
        data: {
          id: mockUser.id,
          subscriptionTier: 'scale',
          subscriptionExpiresAt: null,
        },
      },
    });

    render(<ChangePlanModal {...defaultProps} />);

    // Select Scale-Up
    const scaleUpCard = screen.getByText('Scale-Up');
    fireEvent.click(scaleUpCard);

    // Select Lifetime
    const lifetimeBtn = screen.getByText(/Lifetime \(No Expiry\)/i);
    fireEvent.click(lifetimeBtn);

    // Fill reason
    const reasonInput = screen.getByPlaceholderText(/Paid via GTBank direct transfer/i);
    fireEvent.change(reasonInput, { target: { value: 'Strategic VIP partner lifetime waiver' } });

    // Submit
    const submitBtn = screen.getByRole('button', { name: /Save Plan Changes/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(api.patch).toHaveBeenCalledWith('/admin/users/user-456/subscription', {
        tier: 'scale',
        durationDays: null,
        resetTrial: false,
        customExpiresAt: undefined,
        confirmDowngrade: false,
        reason: 'Strategic VIP partner lifetime waiver',
      });
    });

    expect(defaultProps.onSuccess).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'user-456',
        subscriptionTier: 'scale',
        subscriptionExpiresAt: null,
      })
    );
  });
});
