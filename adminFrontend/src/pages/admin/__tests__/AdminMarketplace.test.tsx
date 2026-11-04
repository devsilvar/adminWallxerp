import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AdminMarketplace from '../AdminMarketplace';
import api from '@/lib/axios';
import toast from 'react-hot-toast';

vi.mock('@/lib/axios', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
  getErrorMessage: vi.fn((err: any) => err?.message || 'Error'),
}));

vi.mock('react-hot-toast', () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

const sampleProduct = {
  id: 'prod-001',
  businessId: 'biz-101',
  name: 'Executive Leather Briefcase',
  slug: 'executive-leather-briefcase',
  productType: 'physical',
  category: 'fashion',
  description: 'Handcrafted premium leather briefcase with brass buckles.',
  price: 75000,
  compareAtPrice: 95000,
  currency: 'NGN',
  stockQuantity: 12,
  trackInventory: true,
  attributes: { size: 'One Size', color: 'Mahogany Brown', material: 'Full Grain Leather' },
  images: [
    'https://res.cloudinary.com/wallx/image/upload/v1/marketplace/biz-101/bag-front.jpg',
    'https://res.cloudinary.com/wallx/image/upload/v1/marketplace/biz-101/bag-inside.jpg',
  ],
  contactPhone: '+234 801 234 5678',
  contactWhatsapp: '+234 801 234 5678',
  purchaseUrl: 'https://store.example.com/item/1',
  status: 'pending_approval',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  business: {
    id: 'biz-101',
    businessName: 'Lagos Leatherworks Ltd',
    city: 'Ikeja',
    state: 'Lagos',
    isVerified: true,
    user: {
      email: 'owner@lagosleather.ng',
      phone: '+234 801 234 5678',
      isVerified: true,
    },
  },
};

describe('AdminMarketplace Moderation Console (Phase 8)', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    (api.get as any).mockImplementation((url: string, config?: any) => {
      if (url === '/admin/marketplace') {
        const status = config?.params?.status || 'pending_approval';
        if (status === 'pending_approval') {
          return Promise.resolve({
            data: {
              success: true,
              data: [sampleProduct],
              pagination: { page: 1, totalPages: 1, total: 1, limit: 15 },
            },
          });
        }
        return Promise.resolve({
          data: {
            success: true,
            data: [],
            pagination: { page: 1, totalPages: 1, total: 0, limit: 15 },
          },
        });
      }
      return Promise.reject(new Error('Unknown url'));
    });
  });

  it('renders queue header, moderation tabs, and loads pending listing', async () => {
    render(<AdminMarketplace />);

    expect(screen.getByText('Marketplace Moderation')).toBeInTheDocument();
    expect(screen.getByText('Pending Review')).toBeInTheDocument();
    expect(screen.getByText('Live Listings')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Executive Leather Briefcase')).toBeInTheDocument();
      expect(screen.getByText('Lagos Leatherworks Ltd')).toBeInTheDocument();
      expect(screen.getByText('₦75,000')).toBeInTheDocument();
      expect(screen.getByText('₦95,000')).toBeInTheDocument();
      expect(screen.getByText('Verified')).toBeInTheDocument();
    });
  });

  it('handles one-click approval with optimistic update and toast confirmation', async () => {
    (api.post as any).mockResolvedValueOnce({
      data: { success: true, message: 'Product approved successfully' },
    });

    render(<AdminMarketplace />);

    await waitFor(() => {
      expect(screen.getByText('Executive Leather Briefcase')).toBeInTheDocument();
    });

    const approveButton = screen.getByRole('button', { name: /approve/i });
    fireEvent.click(approveButton);

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/admin/marketplace/prod-001/approve');
      expect(toast.success).toHaveBeenCalledWith(
        expect.stringContaining('approved and published to marketplace')
      );
    });
  });

  it('opens rejection modal, inputs feedback reason, and submits rejection', async () => {
    (api.post as any).mockResolvedValueOnce({
      data: { success: true, message: 'Product listing rejected' },
    });

    render(<AdminMarketplace />);

    await waitFor(() => {
      expect(screen.getByText('Executive Leather Briefcase')).toBeInTheDocument();
    });

    // Open reject dialog
    const rejectButton = screen.getByRole('button', { name: /^reject$/i });
    fireEvent.click(rejectButton);

    await waitFor(() => {
      expect(screen.getByText('Reject Marketplace Listing')).toBeInTheDocument();
    });

    // Enter rejection feedback
    const textarea = screen.getByPlaceholderText(/explain clearly what needs to be fixed/i);
    fireEvent.change(textarea, { target: { value: 'Product images are blurry and lack proper contrast.' } });

    // Confirm rejection
    const confirmButton = screen.getByRole('button', { name: /confirm rejection & notify merchant/i });
    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/admin/marketplace/prod-001/reject', {
        reason: 'Product images are blurry and lack proper contrast.',
      });
      expect(toast.success).toHaveBeenCalledWith(
        expect.stringContaining('Feedback emailed to merchant')
      );
    });
  });

  it('detects and flags pricing sanity issues on suspect products', async () => {
    const suspectProduct = {
      ...sampleProduct,
      id: 'prod-002',
      name: 'Glitch Item',
      price: 0,
      compareAtPrice: 500,
      images: [],
    };

    (api.get as any).mockResolvedValueOnce({
      data: {
        success: true,
        data: [suspectProduct],
        pagination: { page: 1, totalPages: 1, total: 1, limit: 15 },
      },
    });

    render(<AdminMarketplace />);

    await waitFor(() => {
      expect(screen.getByText('Glitch Item')).toBeInTheDocument();
      expect(screen.getByText('Zero or Negative Price')).toBeInTheDocument();
      expect(screen.getByText('No Product Images')).toBeInTheDocument();
    });
  });

  it('opens full technical inspector modal on clicking View Full Details', async () => {
    render(<AdminMarketplace />);

    await waitFor(() => {
      expect(screen.getByText('Executive Leather Briefcase')).toBeInTheDocument();
    });

    const inspectBtn = screen.getByRole('button', { name: /view full details/i });
    fireEvent.click(inspectBtn);

    await waitFor(() => {
      expect(screen.getByText(/Slug: \/p\/executive-leather-briefcase/i)).toBeInTheDocument();
      expect(screen.getByText('Full Technical Specifications')).toBeInTheDocument();
      expect(screen.getAllByText('Full Grain Leather').length).toBeGreaterThanOrEqual(1);
    });
  });
});
