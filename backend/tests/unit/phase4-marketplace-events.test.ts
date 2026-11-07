import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import { AppError } from '../../src/middleware/errorHandler';

const mockPrisma = {
  marketplaceProduct: {
    findUnique: jest.fn<any>(),
    findMany: jest.fn<any>(),
    count: jest.fn<any>(),
    update: jest.fn<any>(),
    groupBy: jest.fn<any>().mockResolvedValue([]),
  },
  marketplaceListingEvent: {
    createMany: jest.fn<any>(),
    create: jest.fn<any>(),
  },
  $queryRaw: jest.fn<any>().mockResolvedValue([]),
};

jest.mock('../../src/lib/prisma', () => ({
  __esModule: true,
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

import { recordListingEvent, listPublicFeed } from '../../src/services/marketplace/marketplace.service';
import { recordEventSchema } from '../../src/validators/marketplace.validator';
import { recordEvent } from '../../src/controllers/public-marketplace.controller';

describe('Phase 4: Marketplace Events, Counters & Trimmed Payload', () => {
  const approvedProduct = {
    id: 'prod-123',
    businessId: 'biz-456',
    status: 'approved',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.MARKETPLACE_SESSION_SECRET = 'test-session-secret-key-1234567890';
  });

  describe('recordListingEvent() service logic', () => {
    it('Two view beacons same session/day -> 1 event row inserted, viewCount incremented once', async () => {
      mockPrisma.marketplaceProduct.findUnique.mockResolvedValue(approvedProduct);
      
      // First view: createMany inserts 1 row
      mockPrisma.marketplaceListingEvent.createMany.mockResolvedValueOnce({ count: 1 });
      mockPrisma.marketplaceProduct.update.mockResolvedValueOnce({});

      await recordListingEvent({
        productId: 'prod-123',
        eventType: 'view',
        ip: '192.168.1.1',
        userAgent: 'Mozilla/5.0 Chrome',
      });

      expect(mockPrisma.marketplaceListingEvent.createMany).toHaveBeenCalledTimes(1);
      expect(mockPrisma.marketplaceProduct.update).toHaveBeenCalledWith({
        where: { id: 'prod-123' },
        data: { viewCount: { increment: 1 } },
      });

      // Second view in same session/day: createMany skips duplicate and returns count: 0
      mockPrisma.marketplaceListingEvent.createMany.mockResolvedValueOnce({ count: 0 });

      await recordListingEvent({
        productId: 'prod-123',
        eventType: 'view',
        ip: '192.168.1.1',
        userAgent: 'Mozilla/5.0 Chrome',
      });

      expect(mockPrisma.marketplaceListingEvent.createMany).toHaveBeenCalledTimes(2);
      // viewCount increment was NOT called a second time
      expect(mockPrisma.marketplaceProduct.update).toHaveBeenCalledTimes(1);
    });

    it('view beacon on different day / different session -> 2 rows, viewCount incremented twice', async () => {
      mockPrisma.marketplaceProduct.findUnique.mockResolvedValue(approvedProduct);
      mockPrisma.marketplaceListingEvent.createMany.mockResolvedValue({ count: 1 });
      mockPrisma.marketplaceProduct.update.mockResolvedValue({});

      // Session A
      await recordListingEvent({
        productId: 'prod-123',
        eventType: 'view',
        ip: '192.168.1.1',
        userAgent: 'Mozilla/5.0 Chrome',
      });

      // Session B (different IP)
      await recordListingEvent({
        productId: 'prod-123',
        eventType: 'view',
        ip: '10.0.0.1',
        userAgent: 'Safari iPhone',
      });

      expect(mockPrisma.marketplaceListingEvent.createMany).toHaveBeenCalledTimes(2);
      expect(mockPrisma.marketplaceProduct.update).toHaveBeenCalledTimes(2);
    });

    it('whatsapp_click twice -> contactCount = 2, lastContactedAt updated each time', async () => {
      mockPrisma.marketplaceProduct.findUnique.mockResolvedValue(approvedProduct);
      mockPrisma.marketplaceListingEvent.create.mockResolvedValue({});
      mockPrisma.marketplaceProduct.update.mockResolvedValue({});

      await recordListingEvent({
        productId: 'prod-123',
        eventType: 'whatsapp_click',
        ip: '192.168.1.1',
        userAgent: 'Mozilla/5.0 Chrome',
      });

      await recordListingEvent({
        productId: 'prod-123',
        eventType: 'whatsapp_click',
        ip: '192.168.1.1',
        userAgent: 'Mozilla/5.0 Chrome',
      });

      expect(mockPrisma.marketplaceListingEvent.create).toHaveBeenCalledTimes(2);
      expect(mockPrisma.marketplaceProduct.update).toHaveBeenCalledTimes(2);
      expect(mockPrisma.marketplaceProduct.update).toHaveBeenLastCalledWith(
        expect.objectContaining({
          where: { id: 'prod-123' },
          data: expect.objectContaining({
            contactCount: { increment: 1 },
            lastContactedAt: expect.any(Date),
          }),
        })
      );
    });

    it('share_click -> event inserted, no counter change on MarketplaceProduct', async () => {
      mockPrisma.marketplaceProduct.findUnique.mockResolvedValue(approvedProduct);
      mockPrisma.marketplaceListingEvent.create.mockResolvedValue({});

      await recordListingEvent({
        productId: 'prod-123',
        eventType: 'share_click',
        ip: '192.168.1.1',
        userAgent: 'Mozilla/5.0 Chrome',
      });

      expect(mockPrisma.marketplaceListingEvent.create).toHaveBeenCalledTimes(1);
      expect(mockPrisma.marketplaceProduct.update).not.toHaveBeenCalled();
    });

    it('Non-existent productId -> 404 AppError', async () => {
      mockPrisma.marketplaceProduct.findUnique.mockResolvedValue(null);

      await expect(
        recordListingEvent({
          productId: 'non-existent-id',
          eventType: 'view',
          ip: '192.168.1.1',
          userAgent: 'Mozilla/5.0',
        })
      ).rejects.toThrow(AppError);

      await expect(
        recordListingEvent({
          productId: 'non-existent-id',
          eventType: 'view',
          ip: '192.168.1.1',
          userAgent: 'Mozilla/5.0',
        })
      ).rejects.toMatchObject({ statusCode: 404 });
    });

    it('Draft or rejected product -> 404 AppError', async () => {
      mockPrisma.marketplaceProduct.findUnique.mockResolvedValue({
        id: 'prod-draft',
        businessId: 'biz-1',
        status: 'draft',
      });

      await expect(
        recordListingEvent({
          productId: 'prod-draft',
          eventType: 'view',
          ip: '192.168.1.1',
          userAgent: 'Mozilla/5.0',
        })
      ).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  describe('Validator: recordEventSchema', () => {
    it('accepts valid event types and optional source', () => {
      const valid = recordEventSchema.safeParse({
        type: 'whatsapp_click',
        source: 'marketplace_pdp',
      });
      expect(valid.success).toBe(true);
    });

    it('rejects invalid event types', () => {
      const invalid = recordEventSchema.safeParse({
        type: 'purchase_complete',
      });
      expect(invalid.success).toBe(false);
    });
  });

  describe('Feed mapper trimming (listPublicFeed)', () => {
    it('feed mapper does NOT contain contactPhone or contactWhatsapp', async () => {
      mockPrisma.marketplaceProduct.count.mockResolvedValue(1);
      mockPrisma.marketplaceProduct.findMany.mockResolvedValue([
        {
          id: 'prod-1',
          slug: 'leather-shoes',
          name: 'Leather Shoes',
          category: 'fashion',
          productType: 'physical',
          description: 'Finest leather shoes',
          price: 25000,
          compareAtPrice: 30000,
          currency: 'NGN',
          stockQuantity: 10,
          trackInventory: true,
          attributes: { size: '42', color: 'black' },
          images: ['https://example.com/shoe.jpg'],
          contactPhone: '+2348011111111',
          contactWhatsapp: '+2348022222222',
          purchaseUrl: null,
          business: {
            businessName: 'Lagos Footwear',
            city: 'Ikeja',
            state: 'Lagos',
            user: { isVerified: true },
          },
          createdAt: new Date(),
        },
      ]);

      const result = await listPublicFeed({ page: 1, limit: 10 });

      expect(result.data).toHaveLength(1);
      const product = result.data[0];

      // Verifying contactPhone and contactWhatsapp are stripped from list feed to prevent phone harvesting
      expect((product as any).contactPhone).toBeUndefined();
      expect((product as any).contactWhatsapp).toBeUndefined();

      // Verifying other vital fields remain intact
      expect(product.id).toBe('prod-1');
      expect(product.name).toBe('Leather Shoes');
      expect(product.seller.businessName).toBe('Lagos Footwear');
    });
  });

  describe('Controller: recordEvent (HTTP)', () => {
    let app: express.Express;

    beforeEach(() => {
      app = express();
      app.use(express.json());
      app.post('/marketplace/products/:productId/events', recordEvent);
    });

    it('returns 204 on valid event', async () => {
      mockPrisma.marketplaceProduct.findUnique.mockResolvedValue(approvedProduct);
      mockPrisma.marketplaceListingEvent.create.mockResolvedValue({});
      mockPrisma.marketplaceProduct.update.mockResolvedValue({});

      const res = await request(app)
        .post('/marketplace/products/prod-123/events')
        .send({ type: 'whatsapp_click', source: 'marketplace_pdp' });

      expect(res.status).toBe(204);
    });

    it('returns 204 even on invalid payload (fire-and-forget)', async () => {
      const res = await request(app)
        .post('/marketplace/products/prod-123/events')
        .send({ type: 'non_existent_type' });

      expect(res.status).toBe(204);
    });

    it('returns 204 even when product is not found (swallows error to not disrupt client)', async () => {
      mockPrisma.marketplaceProduct.findUnique.mockResolvedValue(null);

      const res = await request(app)
        .post('/marketplace/products/non-existent/events')
        .send({ type: 'view' });

      expect(res.status).toBe(204);
    });
  });
});
