import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import api from '@/lib/axios';
import { useMarketplaceStore } from '@/stores/marketplace.store';
import { useBusinessStore } from '@/stores/business.store';
import LockedSlotCard from '@/components/marketplace/LockedSlotCard';
import ListingOptimizationPanel from '@/components/marketplace/ListingOptimizationPanel';
import Inventory from '@/pages/Inventory';
import type { Business, MarketplaceProduct } from '@/types/index';

// Mock ProductModal to focus on inventory page and slot capacity behavior
vi.mock('@/components/marketplace/ProductModal.tsx', () => ({
  default: () => null,
}));

describe('Phase 12: Merchant Slot UI & Upsell Suite', () => {
  const businessId = 'biz_p12_test';

  const mockBusiness: Business = {
    id: businessId,
    userId: 'user_123',
    merchantId: 'merch_123',
    businessName: 'Ace Fashion Ltd',
    ownerName: 'Ace Trader',
    businessType: 'retail',
    marketplaceSlotAllowance: 3,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const sampleProducts: MarketplaceProduct[] = [
    {
      id: 'prod_1',
      businessId,
      name: 'Leather Handbag',
      slug: 'leather-handbag',
      productType: 'physical',
      category: 'bags',
      description: 'Genuine leather handbag with strap.',
      price: 25000,
      currency: 'NGN',
      trackInventory: true,
      stockQuantity: 10,
      images: ['https://cdn.wallx.ng/bag.jpg'],
      status: 'approved',
      viewCount: 140,
      contactCount: 8,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'prod_2',
      businessId,
      name: 'Sneakers',
      slug: 'sneakers',
      productType: 'physical',
      category: 'fashion',
      description: 'Comfortable running sneakers.',
      price: 18000,
      currency: 'NGN',
      trackInventory: true,
      stockQuantity: 5,
      images: ['https://cdn.wallx.ng/shoes.jpg'],
      status: 'pending_approval',
      // Analytics missing / unrecorded edge case: should render '—', never '0'
      viewCount: undefined,
      contactCount: undefined,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'prod_3',
      businessId,
      name: 'Classic Watch',
      slug: 'classic-watch',
      productType: 'physical',
      category: 'fashion',
      description: 'Stainless steel analog wrist watch.',
      price: 32000,
      currency: 'NGN',
      trackInventory: true,
      stockQuantity: 3,
      images: ['https://cdn.wallx.ng/watch.jpg'],
      status: 'approved',
      viewCount: 45,
      contactCount: 2,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];

  beforeEach(() => {
    vi.restoreAllMocks();
    useMarketplaceStore.getState().clear();
    useBusinessStore.setState({
      businesses: [mockBusiness],
      activeBusiness: { ...mockBusiness },
      isLoading: false,
      lastFetchedAt: Date.now(),
    });
  });

  describe('Marketplace Store Slot Actions', () => {
    it('purchaseSlotsViaWallet debits wallet and updates activeBusiness allowance reactively', async () => {
      vi.spyOn(api, 'post').mockResolvedValueOnce({
        data: {
          success: true,
          message: 'Successfully purchased 1 marketplace showcase slot(s)',
          data: {
            purchase: {
              id: 'slot_tx_1',
              businessId,
              slots: 1,
              amount: 2500,
              paymentMethod: 'wallet',
              status: 'completed',
              createdAt: new Date().toISOString(),
            },
            allowance: {
              previous: 3,
              current: 4,
              added: 1,
            },
            wallet: {
              newBalance: 7500,
              amountDebited: 2500,
            },
          },
        },
      });

      expect(useBusinessStore.getState().activeBusiness?.marketplaceSlotAllowance).toBe(3);

      const result = await useMarketplaceStore.getState().purchaseSlotsViaWallet(businessId, 1);

      expect(api.post).toHaveBeenCalledWith(`/businesses/${businessId}/marketplace/slots`, { slots: 1 });
      expect(result.allowance?.current).toBe(4);

      // Verify reactive update in business store (without needing a page reload)
      const updatedBusiness = useBusinessStore.getState().activeBusiness;
      expect(updatedBusiness?.marketplaceSlotAllowance).toBe(4);
    });

    it('submitSlotProof sends multipart FormData with slots and proof', async () => {
      vi.spyOn(api, 'post').mockResolvedValueOnce({
        data: {
          success: true,
          message: 'Payment proof submitted for review',
          data: {
            purchase: {
              id: 'slot_proof_1',
              businessId,
              slots: 2,
              amount: 5000,
              paymentMethod: 'bank_transfer',
              status: 'pending',
              proofDocumentUrl: 'https://cdn.wallx.ng/proofs/receipt.pdf',
              createdAt: new Date().toISOString(),
            },
            status: 'pending',
          },
        },
      });

      const mockFile = new File(['fake receipt data'], 'receipt.pdf', { type: 'application/pdf' });
      const result = await useMarketplaceStore.getState().submitSlotProof(businessId, 2, mockFile);

      expect(api.post).toHaveBeenCalledTimes(1);
      const [calledUrl, formData] = (api.post as any).mock.calls[0];
      expect(calledUrl).toBe(`/businesses/${businessId}/marketplace/slots/proof`);
      expect(formData instanceof FormData).toBe(true);
      expect(result.status).toBe('pending');
    });

    it('getWalletBalance fetches available central wallet balance', async () => {
      vi.spyOn(api, 'get').mockResolvedValueOnce({
        data: {
          success: true,
          data: {
            balance: 10000,
            lockedBalance: 2000,
            availableBalance: 8000,
            currency: 'NGN',
          },
        },
      });

      const balance = await useMarketplaceStore.getState().getWalletBalance();
      expect(api.get).toHaveBeenCalledWith('/wallet');
      expect(balance).toBe(8000);
    });
  });

  describe('LockedSlotCard Component', () => {
    it('gates the upsell on contactCount >= 1: hides price during seed window when totalContacts === 0', () => {
      const onUnlock = vi.fn();
      render(<LockedSlotCard slotNumber={4} totalContacts={0} onUnlock={onUnlock} />);

      // Shows seed window capacity note
      expect(
        screen.getByText(/Get at least 1 buyer inquiry on your active showcase to unlock additional slot capacity/i)
      ).toBeInTheDocument();

      // Does NOT show price
      expect(screen.queryByText(/₦2,500/i)).not.toBeInTheDocument();

      // CTA is disabled
      const button = screen.getByRole('button', { name: /Inquiry Required to Unlock/i });
      expect(button).toBeDisabled();

      fireEvent.click(button);
      expect(onUnlock).not.toHaveBeenCalled();
    });

    it('shows evidence and price ₦2,500 when totalContacts >= 1 and triggers onUnlock', () => {
      const onUnlock = vi.fn();
      render(<LockedSlotCard slotNumber={4} totalContacts={5} onUnlock={onUnlock} />);

      // Shows inquiry evidence
      expect(screen.getByText(/5 buyer inquiries/i)).toBeInTheDocument();

      // Shows price ₦2,500
      expect(screen.getByText('₦2,500')).toBeInTheDocument();

      // CTA is active with price
      const button = screen.getByRole('button', { name: /Unlock Slot \(₦2,500\)/i });
      expect(button).toBeEnabled();

      fireEvent.click(button);
      expect(onUnlock).toHaveBeenCalledTimes(1);
    });
  });

  describe('ListingOptimizationPanel ("Why isn\'t this selling?") Component', () => {
    const lowScoreProduct: MarketplaceProduct = {
      id: 'prod_low',
      businessId,
      name: 'Budget Cotton T-Shirt',
      slug: 'budget-cotton-tshirt',
      productType: 'physical',
      category: 'fashion',
      description: 'A t-shirt.',
      price: 5000,
      currency: 'NGN',
      trackInventory: true,
      images: [],
      status: 'approved',
      listingScore: {
        score: 45,
        label: 'needs_work',
        breakdown: {
          images: { met: false, points: 0, maxPoints: 25, hint: 'Add at least 2 high-quality photos' },
          description: { met: false, points: 0, maxPoints: 25, hint: 'Add at least 120 characters description' },
          attributes: { met: false, points: 0, maxPoints: 25, hint: 'Add product attributes' },
          pricing: { met: true, points: 25, maxPoints: 25, hint: 'Price is competitive' },
        },
        tips: ['Add at least 2 high-quality photos', 'Add at least 120 characters description'],
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const highScoreProduct: MarketplaceProduct = {
      ...lowScoreProduct,
      id: 'prod_high',
      name: 'Premium Silk Dress',
      listingScore: {
        score: 85,
        label: 'excellent',
        breakdown: {
          images: { met: true, points: 25, maxPoints: 25, hint: 'Photos added' },
          description: { met: true, points: 25, maxPoints: 25, hint: 'Detailed description' },
          attributes: { met: true, points: 25, maxPoints: 25, hint: 'Attributes provided' },
          pricing: { met: true, points: 10, maxPoints: 25, hint: 'Price is set' },
        },
        tips: [],
      },
    };

    it('renders optimization panel above upsell when any active listing has score < 70', () => {
      const onEdit = vi.fn();
      render(<ListingOptimizationPanel products={[lowScoreProduct, highScoreProduct]} onEditProduct={onEdit} />);

      expect(screen.getByText(/Why isn't this selling\? Optimize your listings first/i)).toBeInTheDocument();
      expect(screen.getByText(/1 listing needs attention/i)).toBeInTheDocument();
      expect(screen.getByText(/Budget Cotton T-Shirt/i)).toBeInTheDocument();
      expect(screen.getByText(/Score: 45\/100/i)).toBeInTheDocument();

      const improveBtn = screen.getByRole('button', { name: /Improve Listing/i });
      fireEvent.click(improveBtn);
      expect(onEdit).toHaveBeenCalledWith(lowScoreProduct);
    });

    it('renders null when all active listings have score >= 70 and no tips', () => {
      const onEdit = vi.fn();
      const { container } = render(<ListingOptimizationPanel products={[highScoreProduct]} onEditProduct={onEdit} />);
      expect(container.firstChild).toBeNull();
    });
  });

  describe('Inventory Page Dynamic Slot Allowance & Edge Cases', () => {
    it('renders 3 of 3 used slots, locked 4th slot with price ₦2,500, and dash fallback for missing analytics', async () => {
      vi.spyOn(api, 'get').mockResolvedValueOnce({
        data: {
          success: true,
          data: sampleProducts,
        },
      });

      render(
        <MemoryRouter>
          <Inventory />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText(/3 of 3 Active Slots Used/i)).toBeInTheDocument();
      });

      // Product 1 has 140 views and 8 contacts
      expect(screen.getByText('140')).toBeInTheDocument();
      expect(screen.getByText('8')).toBeInTheDocument();

      // Product 2 has missing analytics (undefined) => renders '—', never '0'
      const dashes = screen.getAllByText('—');
      expect(dashes.length).toBeGreaterThanOrEqual(2);

      // Total inquiries = 8 + 2 = 10 (>= 1). Locked slot 4 is ready to unlock with ₦2,500
      expect(screen.getByText(/Slot 4 · Locked/i)).toBeInTheDocument();
      expect(screen.getByText(/Ready to Unlock/i)).toBeInTheDocument();
      expect(screen.getByText(/10 buyer inquiries/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Unlock Slot \(₦2,500\)/i })).toBeEnabled();
    });

    it('handles business with 0 listings: shows allowance, empty slots, seed stage on slot 4, and no views theatre', async () => {
      vi.spyOn(api, 'get').mockResolvedValueOnce({
        data: {
          success: true,
          data: [],
        },
      });

      render(
        <MemoryRouter>
          <Inventory />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText(/0 of 3 Active Slots Used/i)).toBeInTheDocument();
      });

      // Shows 3 available empty slots
      expect(screen.getByText(/\(3 slots available\)/i)).toBeInTheDocument();
      const addButtons = screen.getAllByText(/\+ Add Product/i);
      expect(addButtons).toHaveLength(3);

      // Locked card for slot 4 is in seed stage
      expect(screen.getByText(/Slot 4 · Locked/i)).toBeInTheDocument();
      expect(screen.getByText(/Seed Stage/i)).toBeInTheDocument();
      expect(screen.queryByText(/₦2,500/i)).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Inquiry Required to Unlock/i })).toBeDisabled();

      // No performance numbers or "0 views" theatre
      expect(screen.queryByText(/0 views/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/0 contacts/i)).not.toBeInTheDocument();
    });

    it('instant reactive slot unlock: buying slot 4 increases allowance to 4 without page reload', async () => {
      // 1. Initial load with 3 products
      vi.spyOn(api, 'get').mockImplementation(async (url: string) => {
        if (url === '/wallet') {
          return {
            data: {
              success: true,
              data: { balance: 10000, availableBalance: 10000, lockedBalance: 0, currency: 'NGN' },
            },
          };
        }
        return {
          data: {
            success: true,
            data: sampleProducts,
          },
        };
      });

      render(
        <MemoryRouter>
          <Inventory />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText(/3 of 3 Active Slots Used/i)).toBeInTheDocument();
      });

      // 2. Click "Unlock Slot (₦2,500)" to open PurchaseSlotModal
      const unlockCta = screen.getByRole('button', { name: /Unlock Slot \(₦2,500\)/i });
      fireEvent.click(unlockCta);

      // Verify Modal opened
      expect(screen.getByText(/Unlock Showcase Capacity/i)).toBeInTheDocument();
      expect(screen.getByText(/Central Wallet/i)).toBeInTheDocument();

      // 3. Mock wallet slot purchase API success
      vi.spyOn(api, 'post').mockResolvedValueOnce({
        data: {
          success: true,
          message: 'Successfully purchased 1 marketplace showcase slot(s)',
          data: {
            purchase: {
              id: 'slot_purchase_1',
              businessId,
              slots: 1,
              amount: 2500,
              paymentMethod: 'wallet',
              status: 'completed',
              createdAt: new Date().toISOString(),
            },
            allowance: {
              previous: 3,
              current: 4,
              added: 1,
            },
            wallet: {
              newBalance: 7500,
              amountDebited: 2500,
            },
          },
        },
      });

      // 4. Click "Pay ₦2,500 & Unlock Now"
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Pay ₦2,500 & Unlock Now/i })).toBeEnabled();
      });
      const payButton = screen.getByRole('button', { name: /Pay ₦2,500 & Unlock Now/i });
      fireEvent.click(payButton);

      // 5. Without page reload:
      // Capacity is now 4!
      await waitFor(() => {
        expect(screen.getByText(/3 of 4 Active Slots Used/i)).toBeInTheDocument();
      });

      // Slot 4 is now unlocked as an empty "+ Add Product" slot!
      expect(screen.getByText(/Slot 4 of 4 available/i)).toBeInTheDocument();

      // Next upsell card has automatically become Slot 5!
      expect(screen.getByText(/Slot 5 · Locked/i)).toBeInTheDocument();
    });
  });
});
