import { describe, it, expect, beforeEach, jest } from '@jest/globals';

const mockPrisma: any = {
  business: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
  },
  businessMember: {
    findFirst: jest.fn(),
  },
  marketplaceProduct: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    update: jest.fn(),
    groupBy: jest.fn(),
  },
  auditLog: {
    findFirst: jest.fn(),
    create: jest.fn(),
  },
  $transaction: jest.fn(async (cb: any) => cb(mockPrisma)),
  $queryRaw: jest.fn(),
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

const mockSendEmail = jest.fn(async () => Promise.resolve());
jest.mock('../../src/lib/email', () => ({
  __esModule: true,
  sendEmail: mockSendEmail,
}));

const mockLogAudit = jest.fn();
jest.mock('../../src/lib/audit', () => ({
  __esModule: true,
  logAudit: mockLogAudit,
}));

import {
  computeListingQualityScore,
  markProductAsSold,
  renewProduct,
  submitForApproval,
} from '../../src/services/marketplace/marketplace.service';
import {
  runMarketplaceExpirySweep,
  executeExpirySweep,
} from '../../src/jobs/marketplace-expiry.cron';
import { AppError } from '../../src/middleware/errorHandler';

describe('Phase 8: Listing Lifecycle (Expiry, Mark as Sold, Renewal & Quality Scoring)', () => {
  const userId = 'usr-123';
  const businessId = 'bus-456';
  const productId = 'prod-789';

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.business.findUnique.mockResolvedValue({
      id: businessId,
      userId,
    });
    mockPrisma.$transaction.mockImplementation(async (cb: any) => cb(mockPrisma));
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 1. Listing Quality Score (8c)
  // ───────────────────────────────────────────────────────────────────────────
  describe('Listing Quality Score Computation', () => {
    it('computes 100/100 when all 4 criteria are fulfilled', async () => {
      const product = {
        name: 'High End Leather Bag',
        category: 'fashion',
        description: 'A'.repeat(150), // >= 120 chars (+25)
        images: ['https://img.com/1.jpg', 'https://img.com/2.jpg'], // >= 2 images (+25)
        attributes: { color: 'black', material: 'leather' }, // >= 1 key (+25)
        price: 50000,
      };
      // Median is 50,000; product is 1x median (within 0.5x - 2x) (+25)
      const medianOverride = { median: 50000, count: 10 };

      const result = await computeListingQualityScore(product, medianOverride);

      expect(result.score).toBe(100);
      expect(result.missingItems).toHaveLength(0);
      expect(result.breakdown.hasEnoughImages).toBe(true);
      expect(result.breakdown.hasDetailedDescription).toBe(true);
      expect(result.breakdown.hasAttributes).toBe(true);
      expect(result.breakdown.isPriceReasonable).toBe(true);
    });

    it('returns 0/100 with actionable tips when no criteria are met', async () => {
      const product = {
        name: 'Item',
        category: 'electronics',
        description: 'Short desc', // < 120 chars
        images: ['https://img.com/1.jpg'], // < 2 images
        attributes: {}, // empty
        price: 1000000, // median is 50,000 -> 20x median (out of bounds)
      };
      const medianOverride = { median: 50000, count: 10 };

      const result = await computeListingQualityScore(product, medianOverride);

      expect(result.score).toBe(0);
      expect(result.missingItems.length).toBeGreaterThanOrEqual(4);
      expect(result.breakdown.hasEnoughImages).toBe(false);
      expect(result.breakdown.hasDetailedDescription).toBe(false);
      expect(result.breakdown.hasAttributes).toBe(false);
      expect(result.breakdown.isPriceReasonable).toBe(false);
    });

    it('renormalises score across 3 criteria when category has fewer than 3 listings', async () => {
      const product = {
        name: 'Handmade Craft',
        category: 'other',
        description: 'B'.repeat(130), // passed
        images: ['https://img.com/1.jpg', 'https://img.com/2.jpg'], // passed
        attributes: { origin: 'Kano' }, // passed
        price: 999999, // price criterion waived
      };
      const medianOverride = { median: null, count: 2 }; // < 3 listings

      const result = await computeListingQualityScore(product, medianOverride);

      // 3 passed criteria out of 3 -> 100
      expect(result.score).toBe(100);
      expect(result.breakdown.isPriceReasonable).toBeNull();
      expect(result.breakdown.hasEnoughImages).toBe(true);
      expect(result.breakdown.hasDetailedDescription).toBe(true);
      expect(result.breakdown.hasAttributes).toBe(true);
    });

    it('enforces score >= 50 on submitForApproval and blocks low quality listings', async () => {
      // Product has 1 image (passes MISSING_IMAGES check), but <120 chars, no attributes, price out of bounds -> score = 0 < 50
      mockPrisma.marketplaceProduct.findFirst.mockResolvedValueOnce({
        id: productId,
        businessId,
        name: 'Vague Product',
        category: 'services',
        status: 'draft',
        images: ['https://img.com/1.jpg'], // 1 image (< 2)
        description: 'Short', // < 120 chars
        attributes: null,
        price: 10000,
      });

      // Price median query returning median = 50,000 (10k < 0.5x median -> fails pricing too)
      mockPrisma.$queryRaw.mockResolvedValueOnce([{ median_price: 50000, cnt: 15 }]);

      await expect(
        submitForApproval(userId, businessId, productId)
      ).rejects.toMatchObject({
        code: 'LOW_QUALITY_SCORE',
        statusCode: 400,
      });
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. Mark Product as Sold (8b)
  // ───────────────────────────────────────────────────────────────────────────
  describe('Mark Product as Sold', () => {
    it('successfully transitions an approved product to archived with soldAt timestamp', async () => {
      const existingProduct = {
        id: productId,
        businessId,
        name: 'iPhone 13',
        status: 'approved',
        price: 450000,
      };

      mockPrisma.marketplaceProduct.findFirst.mockResolvedValueOnce(existingProduct);
      mockPrisma.marketplaceProduct.update.mockResolvedValueOnce({
        ...existingProduct,
        status: 'archived',
        soldAt: new Date(),
      });

      const updated = await markProductAsSold(userId, businessId, productId);

      expect(updated.status).toBe('archived');
      expect(mockPrisma.marketplaceProduct.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: productId },
          data: expect.objectContaining({
            status: 'archived',
            soldAt: expect.any(Date),
          }),
        })
      );
      expect(mockLogAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'marketplace.sale_confirmed',
          resourceType: 'marketplace_product',
          resourceId: productId,
        }),
        expect.anything()
      );
    });

    it('rejects marking a draft or rejected listing as sold', async () => {
      mockPrisma.marketplaceProduct.findFirst.mockResolvedValueOnce({
        id: productId,
        businessId,
        name: 'Draft Item',
        status: 'draft',
      });

      await expect(
        markProductAsSold(userId, businessId, productId)
      ).rejects.toThrow('Only active/approved listings can be marked as sold');
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 3. Product Renewal (8b)
  // ───────────────────────────────────────────────────────────────────────────
  describe('Listing Renewal', () => {
    it('successfully renews an expired listing for 90 days', async () => {
      const expiredProduct = {
        id: productId,
        businessId,
        name: 'Vintage Watch',
        status: 'archived',
        soldAt: null,
      };

      mockPrisma.marketplaceProduct.findFirst.mockResolvedValueOnce(expiredProduct);

      // Audit logs verify listing was expired by cron
      mockPrisma.auditLog.findFirst
        .mockResolvedValueOnce({
          action: 'marketplace.listing_expired',
          createdAt: new Date('2026-03-01T01:00:00Z'),
        }) // expiredAudit
        .mockResolvedValueOnce(null); // userArchivedAudit

      const renewedProduct = {
        ...expiredProduct,
        status: 'approved',
        expiresAt: new Date('2026-06-01T01:00:00Z'),
      };
      mockPrisma.marketplaceProduct.update.mockResolvedValueOnce(renewedProduct);

      const result = await renewProduct(userId, businessId, productId);

      expect(result.status).toBe('approved');
      expect(mockPrisma.marketplaceProduct.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: productId },
          data: expect.objectContaining({
            status: 'approved',
            expiresAt: expect.any(Date),
          }),
        })
      );
      expect(mockLogAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'marketplace.listing_renewed',
          resourceType: 'marketplace_product',
          resourceId: productId,
        }),
        expect.anything()
      );
    });

    it('refuses renewal if product was marked as sold', async () => {
      mockPrisma.marketplaceProduct.findFirst.mockResolvedValueOnce({
        id: productId,
        businessId,
        name: 'Sold Laptop',
        status: 'archived',
        soldAt: new Date('2026-02-15T10:00:00Z'),
      });

      await expect(
        renewProduct(userId, businessId, productId)
      ).rejects.toThrow('Cannot renew a product that was marked as sold');
    });

    it('refuses renewal if product was manually archived by merchant', async () => {
      mockPrisma.marketplaceProduct.findFirst.mockResolvedValueOnce({
        id: productId,
        businessId,
        name: 'Merchant Archived Desk',
        status: 'archived',
        soldAt: null,
      });

      // userArchivedAudit is newer than expiredAudit
      mockPrisma.auditLog.findFirst
        .mockResolvedValueOnce({
          action: 'marketplace.listing_expired',
          createdAt: new Date('2026-02-01T01:00:00Z'),
        })
        .mockResolvedValueOnce({
          action: 'product.archived',
          createdAt: new Date('2026-02-10T12:00:00Z'),
        });

      await expect(
        renewProduct(userId, businessId, productId)
      ).rejects.toThrow('Only listings expired by the system can be renewed');
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 4. Expiry Cron Job Sweep (8a)
  // ───────────────────────────────────────────────────────────────────────────
  describe('Expiry Cron Sweep', () => {
    it('sweeps only approved listings whose expiresAt <= now', async () => {
      const expiredProduct = {
        id: 'prod-expired',
        name: 'Expired Generator',
        businessId: 'bus-1',
        status: 'approved',
        expiresAt: new Date('2026-01-01T00:00:00Z'),
        business: {
          id: 'bus-1',
          businessName: 'Lagos Power Ltd',
          user: {
            email: 'owner@lagospower.com',
            fullName: 'Tunde Balogun',
          },
        },
      };

      mockPrisma.marketplaceProduct.findMany.mockResolvedValueOnce([expiredProduct]);
      mockPrisma.marketplaceProduct.update.mockResolvedValueOnce({
        ...expiredProduct,
        status: 'archived',
      });

      const result = await executeExpirySweep(mockPrisma);

      expect(result.expiredFound).toBe(1);
      expect(result.expiredCount).toBe(1);
      expect(result.failedCount).toBe(0);

      expect(mockPrisma.marketplaceProduct.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'prod-expired' },
          data: { status: 'archived' },
        })
      );

      expect(mockLogAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'marketplace.listing_expired',
          resourceId: 'prod-expired',
        }),
        expect.anything()
      );

      // Verify email notification dispatched
      expect(mockSendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'owner@lagospower.com',
          subject: expect.stringContaining('expired'),
        })
      );
    });

    it('skips sweep cleanly if advisory lock is already held by another worker', async () => {
      mockPrisma.$queryRaw.mockResolvedValueOnce([{ pg_try_advisory_lock: false }]);

      const result = await runMarketplaceExpirySweep();

      expect(result.expiredFound).toBe(0);
      expect(result.expiredCount).toBe(0);
      expect(mockPrisma.marketplaceProduct.findMany).not.toHaveBeenCalled();
    });

    it('continues processing remaining items if one notification or update fails', async () => {
      const prod1 = {
        id: 'prod-err',
        name: 'Err Prod',
        businessId: 'bus-1',
        status: 'approved',
        expiresAt: new Date('2026-01-01'),
        business: {
          id: 'bus-1',
          businessName: 'Biz 1',
          user: { email: 'biz1@test.com', fullName: 'A' },
        },
      };
      const prod2 = {
        id: 'prod-ok',
        name: 'Ok Prod',
        businessId: 'bus-2',
        status: 'approved',
        expiresAt: new Date('2026-01-01'),
        business: {
          id: 'bus-2',
          businessName: 'Biz 2',
          user: { email: 'biz2@test.com', fullName: 'B' },
        },
      };

      mockPrisma.marketplaceProduct.findMany.mockResolvedValueOnce([prod1, prod2]);
      // First update throws
      mockPrisma.marketplaceProduct.update
        .mockRejectedValueOnce(new Error('DB Lock failure'))
        .mockResolvedValueOnce({ ...prod2, status: 'archived' });

      const result = await executeExpirySweep(mockPrisma);

      expect(result.expiredFound).toBe(2);
      expect(result.expiredCount).toBe(1);
      expect(result.failedCount).toBe(1);
    });
  });
});
