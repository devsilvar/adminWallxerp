import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { Prisma } from '@prisma/client';
import express from 'express';
import request from 'supertest';

const mockPrisma: any = {
  business: {
    findUnique: jest.fn(),
  },
  marketplaceProduct: {
    findUnique: jest.fn(),
    findUniqueOrThrow: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
  marketplaceBoost: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
  walletBalance: {
    update: jest.fn(),
  },
  walletTransaction: {
    create: jest.fn(),
  },
  auditLog: {
    create: jest.fn(),
  },
  $transaction: jest.fn(async (cb: any) => cb(mockPrisma)),
};

jest.mock('../../src/lib/prisma', () => ({
  __esModule: true,
  prisma: mockPrisma,
  default: mockPrisma,
}));

jest.mock('../../src/lib/logger', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const mockGetWalletBalance = jest.fn();
jest.mock('../../src/services/wallet/wallet.service', () => ({
  __esModule: true,
  WalletService: {
    getWalletBalance: (...args: any[]) => mockGetWalletBalance(...args),
  },
}));

import { MarketplaceBoostsService } from '../../src/services/marketplace/marketplace-boosts.service';
import { purchaseProductBoost, getProductBoost } from '../../src/controllers/marketplace.controller';
import { errorHandler } from '../../src/middleware/errorHandler';

describe('Phase 13: Marketplace Boost Purchase Service & Endpoints', () => {
  const businessId = 'biz_boost_test_1';
  const ownerUserId = 'user_owner_1';
  const otherUserId = 'user_hacker_2';
  const productId = 'prod_boost_test_1';

  const mockApprovedProduct = {
    id: productId,
    businessId,
    name: 'Handmade Nigerian Leather Boots',
    slug: 'handmade-nigerian-leather-boots',
    category: 'fashion',
    status: 'approved',
    stockQuantity: 10,
    trackInventory: true,
    boostEndsAt: null,
    business: {
      id: businessId,
      userId: ownerUserId,
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.$transaction.mockImplementation(async (cb: any) => cb(mockPrisma));
    mockPrisma.marketplaceProduct.findUnique.mockResolvedValue(mockApprovedProduct);
    mockPrisma.marketplaceProduct.findUniqueOrThrow.mockResolvedValue(mockApprovedProduct);
    mockPrisma.marketplaceBoost.findUnique.mockResolvedValue(null);
    mockPrisma.marketplaceBoost.findFirst.mockResolvedValue(null);
    mockPrisma.marketplaceBoost.count.mockResolvedValue(0);
    mockPrisma.marketplaceProduct.count.mockResolvedValue(15);
    mockGetWalletBalance.mockResolvedValue({
      id: 'wallet_1',
      userId: ownerUserId,
      balance: 10000,
      lockedBalance: 0,
      availableBalance: 10000,
    });
  });

  describe('Core Service: purchaseBoost', () => {
    it('successfully purchases a 1-week boost: debits wallet, creates active boost, and sets boostEndsAt', async () => {
      const createdBoost = {
        id: 'boost_row_1',
        productId,
        businessId,
        plan: 'week',
        amount: new Prisma.Decimal(2000),
        startsAt: new Date(),
        endsAt: new Date(Date.now() + 7 * 86400000),
        status: 'active',
        impressions: 0,
        walletTxRef: 'BOOST-TX-1',
        createdAt: new Date(),
      };
      mockPrisma.marketplaceBoost.create.mockResolvedValueOnce(createdBoost);
      mockPrisma.marketplaceProduct.update.mockResolvedValueOnce({
        ...mockApprovedProduct,
        boostEndsAt: createdBoost.endsAt,
      });

      const result = await MarketplaceBoostsService.purchaseBoost({
        businessId,
        productId,
        plan: 'week',
        userId: ownerUserId,
      });

      // 1. Debits wallet ₦2,000
      expect(mockPrisma.walletBalance.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: ownerUserId },
          data: expect.objectContaining({
            balance: { decrement: new Prisma.Decimal(2000) },
          }),
        })
      );

      // 2. Creates ledger transaction with source 'marketplace_boost'
      expect(mockPrisma.walletTransaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            source: 'marketplace_boost',
            amount: new Prisma.Decimal(2000),
            type: 'debit',
          }),
        })
      );

      // 3. Creates boost row with status active
      expect(mockPrisma.marketplaceBoost.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            productId,
            businessId,
            plan: 'week',
            status: 'active',
          }),
        })
      );

      // 4. Sets denormalized boostEndsAt on product
      expect(mockPrisma.marketplaceProduct.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: productId },
          data: expect.objectContaining({
            boostEndsAt: expect.any(Date),
          }),
        })
      );

      expect(result.boost.plan).toBe('week');
      expect(result.boost.status).toBe('active');
      expect(result.isWaitlisted).toBe(false);
      expect(result.wallet.amountDebited).toBe(2000);
    });

    it('blocks boost purchase if product is not approved (e.g. draft, rejected, archived)', async () => {
      mockPrisma.marketplaceProduct.findUnique.mockResolvedValueOnce({
        ...mockApprovedProduct,
        status: 'draft',
      });

      await expect(
        MarketplaceBoostsService.purchaseBoost({
          businessId,
          productId,
          plan: 'week',
          userId: ownerUserId,
        })
      ).rejects.toThrow(/Cannot boost listing with status "draft"/i);
    });

    it('blocks boost purchase if product is out of stock', async () => {
      mockPrisma.marketplaceProduct.findUnique.mockResolvedValueOnce({
        ...mockApprovedProduct,
        stockQuantity: 0,
        trackInventory: true,
      });

      await expect(
        MarketplaceBoostsService.purchaseBoost({
          businessId,
          productId,
          plan: 'fortnight',
          userId: ownerUserId,
        })
      ).rejects.toThrow(/Cannot boost an out-of-stock product/i);
    });

    it('blocks boost purchase if requester is not the business owner (403)', async () => {
      await expect(
        MarketplaceBoostsService.purchaseBoost({
          businessId,
          productId,
          plan: 'week',
          userId: otherUserId,
        })
      ).rejects.toThrow(/Only the business owner can purchase visibility boosts/i);
    });

    it('blocks boost purchase if wallet balance is insufficient (402)', async () => {
      mockGetWalletBalance.mockResolvedValueOnce({
        id: 'wallet_1',
        userId: ownerUserId,
        balance: 1000,
        availableBalance: 1000, // Needs 2000 for week
      });

      await expect(
        MarketplaceBoostsService.purchaseBoost({
          businessId,
          productId,
          plan: 'week',
          userId: ownerUserId,
        })
      ).rejects.toThrow(/Insufficient available wallet balance/i);
    });

    it('extending an active boost charges plan price and pushes endsAt out without creating a second row', async () => {
      const existingActiveEndsAt = new Date(Date.now() + 3 * 86400000); // 3 days remaining
      const existingBoost = {
        id: 'boost_existing_1',
        productId,
        businessId,
        plan: 'week',
        amount: new Prisma.Decimal(2000),
        startsAt: new Date(Date.now() - 4 * 86400000),
        endsAt: existingActiveEndsAt,
        status: 'active',
      };
      mockPrisma.marketplaceBoost.findFirst.mockResolvedValueOnce(existingBoost);

      const extendedEndsAt = new Date(existingActiveEndsAt.getTime() + 7 * 86400000);
      mockPrisma.marketplaceBoost.update.mockResolvedValueOnce({
        ...existingBoost,
        endsAt: extendedEndsAt,
      });

      const result = await MarketplaceBoostsService.purchaseBoost({
        businessId,
        productId,
        plan: 'week',
        userId: ownerUserId,
      });

      // Verified: update called on existing row, create NOT called
      expect(mockPrisma.marketplaceBoost.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'boost_existing_1' },
          data: expect.objectContaining({
            endsAt: expect.any(Date),
          }),
        })
      );
      expect(mockPrisma.marketplaceBoost.create).not.toHaveBeenCalled();
      expect(result.boost.id).toBe('boost_existing_1');
    });

    it('upgrading plan (e.g. week -> month) charges the price difference and extends endsAt', async () => {
      const existingBoost = {
        id: 'boost_existing_week',
        productId,
        businessId,
        plan: 'week',
        amount: new Prisma.Decimal(2000),
        startsAt: new Date(),
        endsAt: new Date(Date.now() + 7 * 86400000),
        status: 'active',
      };
      mockPrisma.marketplaceBoost.findFirst.mockResolvedValueOnce(existingBoost);

      // Month is ₦6,000. Difference = 6000 - 2000 = 4000
      mockPrisma.marketplaceBoost.update.mockResolvedValueOnce({
        ...existingBoost,
        plan: 'month',
        amount: new Prisma.Decimal(6000),
      });

      const result = await MarketplaceBoostsService.purchaseBoost({
        businessId,
        productId,
        plan: 'month',
        userId: ownerUserId,
      });

      // Wallet debited ₦4,000 (the difference)
      expect(mockPrisma.walletBalance.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            balance: { decrement: new Prisma.Decimal(4000) },
          }),
        })
      );
      expect(result.wallet.amountDebited).toBe(4000);
    });

    it('capacity check: when 3 active boosts exist in category, marks new boost as waitlisted with startsAt', async () => {
      // 3 active boosts already in category
      mockPrisma.marketplaceBoost.count.mockResolvedValueOnce(3);

      const earliestExpiringEndsAt = new Date(Date.now() + 2 * 86400000);
      mockPrisma.marketplaceBoost.findFirst.mockResolvedValueOnce(null); // No existing boost for THIS product
      mockPrisma.marketplaceBoost.findFirst.mockResolvedValueOnce({
        id: 'other_boost_1',
        endsAt: earliestExpiringEndsAt,
      }); // Earliest expiring

      const waitlistedBoost = {
        id: 'boost_waitlist_1',
        productId,
        businessId,
        plan: 'week',
        amount: new Prisma.Decimal(2000),
        startsAt: earliestExpiringEndsAt,
        endsAt: new Date(earliestExpiringEndsAt.getTime() + 7 * 86400000),
        status: 'waitlisted',
        impressions: 0,
        walletTxRef: 'BOOST-WAITLIST-1',
        createdAt: new Date(),
      };
      mockPrisma.marketplaceBoost.create.mockResolvedValueOnce(waitlistedBoost);

      const result = await MarketplaceBoostsService.purchaseBoost({
        businessId,
        productId,
        plan: 'week',
        userId: ownerUserId,
      });

      expect(mockPrisma.marketplaceBoost.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'waitlisted',
            startsAt: earliestExpiringEndsAt,
          }),
        })
      );
      // Waitlisted boost does NOT activate product.boostEndsAt immediately
      expect(mockPrisma.marketplaceProduct.update).not.toHaveBeenCalled();
      expect(result.isWaitlisted).toBe(true);
      expect(result.waitlistNotice).toMatch(/priority waitlist/i);
    });

    it('small category honesty notice: discloses when category has fewer than 12 approved listings', async () => {
      mockPrisma.marketplaceProduct.count.mockResolvedValueOnce(5); // 5 approved listings in category

      const createdBoost = {
        id: 'boost_small_cat',
        productId,
        businessId,
        plan: 'week',
        amount: new Prisma.Decimal(2000),
        startsAt: new Date(),
        endsAt: new Date(Date.now() + 7 * 86400000),
        status: 'active',
        impressions: 0,
        walletTxRef: 'BOOST-TX-SMALL',
        createdAt: new Date(),
      };
      mockPrisma.marketplaceBoost.create.mockResolvedValueOnce(createdBoost);
      mockPrisma.marketplaceProduct.update.mockResolvedValueOnce(mockApprovedProduct);

      const result = await MarketplaceBoostsService.purchaseBoost({
        businessId,
        productId,
        plan: 'week',
        userId: ownerUserId,
      });

      expect(result.advisoryNotice).toMatch(/5 approved listing/i);
    });

    it('idempotency replay returns existing boost without double charging', async () => {
      const existingMatch = {
        id: 'boost_replay_1',
        productId,
        businessId,
        plan: 'week',
        amount: new Prisma.Decimal(2000),
        startsAt: new Date(),
        endsAt: new Date(),
        status: 'active',
        impressions: 0,
        walletTxRef: 'BOOST-TX-PREV',
        createdAt: new Date(),
        product: {
          id: productId,
          name: 'Handmade Boots',
          category: 'fashion',
          boostEndsAt: new Date(),
        },
      };
      mockPrisma.marketplaceBoost.findUnique.mockResolvedValueOnce(existingMatch);

      const result = await MarketplaceBoostsService.purchaseBoost({
        businessId,
        productId,
        plan: 'week',
        userId: ownerUserId,
        requestId: 'req_123',
      });

      expect(mockPrisma.walletBalance.update).not.toHaveBeenCalled();
      expect(mockPrisma.marketplaceBoost.create).not.toHaveBeenCalled();
      expect(result.isIdempotentReplay).toBe(true);
      expect(result.wallet.amountDebited).toBe(0);
    });
  });

  describe('HTTP Controller & Route Integration', () => {
    let app: express.Express;

    beforeEach(() => {
      app = express();
      app.use(express.json());

      // Mock auth middleware injecting owner user
      app.use((req: any, _res, next) => {
        req.user = { userId: ownerUserId, role: 'user' };
        next();
      });

      app.post('/businesses/:businessId/marketplace/:id/boost', purchaseProductBoost);
      app.get('/businesses/:businessId/marketplace/:id/boost', getProductBoost);
      app.use(errorHandler);
    });

    it('POST /businesses/:businessId/marketplace/:id/boost processes valid boost request', async () => {
      const createdBoost = {
        id: 'boost_ctrl_1',
        productId,
        businessId,
        plan: 'week',
        amount: new Prisma.Decimal(2000),
        startsAt: new Date(),
        endsAt: new Date(Date.now() + 7 * 86400000),
        status: 'active',
        impressions: 0,
        walletTxRef: 'BOOST-TX-CTRL',
        createdAt: new Date(),
      };
      mockPrisma.marketplaceBoost.create.mockResolvedValueOnce(createdBoost);
      mockPrisma.marketplaceProduct.update.mockResolvedValueOnce(mockApprovedProduct);

      const res = await request(app)
        .post(`/businesses/${businessId}/marketplace/${productId}/boost`)
        .send({ plan: 'week' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.boost.plan).toBe('week');
      expect(res.body.message).toMatch(/Successfully boosted listing for week/i);
    });

    it('POST /businesses/:businessId/marketplace/:id/boost validates invalid plan with 400', async () => {
      const res = await request(app)
        .post(`/businesses/${businessId}/marketplace/${productId}/boost`)
        .send({ plan: 'century' }); // Invalid plan

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('GET /businesses/:businessId/marketplace/:id/boost returns active boost status', async () => {
      mockPrisma.marketplaceBoost.findFirst.mockResolvedValueOnce({
        id: 'boost_active_read',
        productId,
        businessId,
        plan: 'month',
        amount: new Prisma.Decimal(6000),
        startsAt: new Date(),
        endsAt: new Date(Date.now() + 30 * 86400000),
        status: 'active',
        impressions: 42,
        createdAt: new Date(),
      });

      const res = await request(app).get(`/businesses/${businessId}/marketplace/${productId}/boost`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.plan).toBe('month');
      expect(res.body.data.impressions).toBe(42);
    });
  });
});
