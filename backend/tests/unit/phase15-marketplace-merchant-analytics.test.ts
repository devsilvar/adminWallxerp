import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';

const mockPrisma: any = {
  business: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
  },
  businessMember: {
    findFirst: jest.fn(),
  },
  marketplaceProduct: {
    findMany: jest.fn(),
    count: jest.fn(),
  },
  marketplaceListingEvent: {
    findMany: jest.fn(),
  },
  marketplaceBoost: {
    aggregate: jest.fn(),
  },
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

import { getMarketplaceAnalytics } from '../../src/services/marketplace/marketplace.service';
import { getMarketplaceAnalytics as controllerGetAnalytics } from '../../src/controllers/marketplace.controller';
import { errorHandler } from '../../src/middleware/errorHandler';

describe('Phase 15: Marketplace Merchant Analytics Service & API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.business.findUnique.mockResolvedValue({
      id: 'biz-1',
      userId: 'user-1',
      businessName: 'Lagos Tech Store',
    });
    mockPrisma.businessMember.findFirst.mockResolvedValue({
      id: 'mem-1',
      userId: 'user-1',
      businessId: 'biz-1',
      role: 'owner',
    });
  });

  const makeMockProduct = (id: string, name: string, category: string, status: string, views = 0, contacts = 0) => ({
    id,
    businessId: 'biz-1',
    name,
    slug: `slug-${id}`,
    category,
    status,
    price: 45000,
    images: ['https://example.com/img.jpg'],
    viewCount: views,
    contactCount: contacts,
    createdAt: new Date('2026-11-01T10:00:00Z'),
  });

  describe('1. Analytics Service (getMarketplaceAnalytics)', () => {
    it('aggregates views, contacts, and gap-filled daily timeseries over 30 days', async () => {
      const now = new Date();
      const p1 = makeMockProduct('prod-1', 'iPhone 13', 'electronics', 'approved', 50, 5);
      const p2 = makeMockProduct('prod-2', 'MacBook Air', 'electronics', 'approved', 30, 2);

      mockPrisma.marketplaceProduct.findMany.mockResolvedValue([p1, p2]);

      // Category counts: 5 approved products in electronics, 1 newer than p1
      mockPrisma.marketplaceProduct.count
        .mockResolvedValueOnce(5) // distinct category total
        .mockResolvedValueOnce(1) // newer for p1 -> rank #2
        .mockResolvedValueOnce(3); // newer for p2 -> rank #4

      mockPrisma.marketplaceBoost.aggregate.mockResolvedValue({
        _sum: { impressions: 120 },
      });

      // Events scattered across days
      const yesterday = new Date(Date.now() - 86400000);
      mockPrisma.marketplaceListingEvent.findMany.mockResolvedValue([
        { productId: 'prod-1', eventType: 'view', occurredAt: now },
        { productId: 'prod-1', eventType: 'whatsapp_click', occurredAt: now },
        { productId: 'prod-2', eventType: 'call_click', occurredAt: yesterday },
        { productId: 'prod-1', eventType: 'boost_impression', occurredAt: now },
      ]);

      const result = await getMarketplaceAnalytics('user-1', 'biz-1', 30);

      // Period and summary verification
      expect(result.periodDays).toBe(30);
      expect(result.summary.totalProducts).toBe(2);
      expect(result.summary.liveProducts).toBe(2);
      expect(result.summary.totalViews).toBe(80); // 50 + 30
      expect(result.summary.totalContacts).toBe(7); // 5 + 2
      expect(result.summary.conversionRate).toBe(8.8); // (7 / 80) * 100

      // Timeseries verification: Exactly 30 gap-filled days (no missing days)
      expect(result.timeseries.length).toBe(30);
      expect(result.timeseries[0]).toHaveProperty('date');
      expect(result.timeseries[0]).toHaveProperty('views');
      expect(result.timeseries[0]).toHaveProperty('contacts');
      expect(result.timeseries[0]).toHaveProperty('impressions');

      // Today's point has 1 view, 1 contact, 1 impression
      const todayStr = now.toISOString().split('T')[0];
      const todayPoint = result.timeseries.find((t) => t.date === todayStr);
      expect(todayPoint).toBeDefined();
      expect(todayPoint?.views).toBe(1);
      expect(todayPoint?.contacts).toBe(1);
      expect(todayPoint?.impressions).toBe(1);

      // Per-product rank verification
      expect(result.products.length).toBe(2);
      expect(result.products[0].id).toBe('prod-1');
      expect(result.products[0].rankInCategory).toBe(2); // #2 of 5
      expect(result.products[0].categoryTotalApproved).toBe(5);
      expect(result.products[1].id).toBe('prod-2');
      expect(result.products[1].rankInCategory).toBe(4); // #4 of 5
    });

    it('returns zeroed metrics and zero-filled series for a business with zero events (never null)', async () => {
      mockPrisma.marketplaceProduct.findMany.mockResolvedValue([]);
      mockPrisma.marketplaceListingEvent.findMany.mockResolvedValue([]);

      const result = await getMarketplaceAnalytics('user-1', 'biz-1', 7);

      expect(result.periodDays).toBe(7);
      expect(result.summary.totalProducts).toBe(0);
      expect(result.summary.liveProducts).toBe(0);
      expect(result.summary.totalViews).toBe(0);
      expect(result.summary.totalContacts).toBe(0);
      expect(result.summary.totalImpressions).toBe(0);
      expect(result.summary.conversionRate).toBe(0);

      // Timeseries has exactly 7 zero-filled days (not null)
      expect(result.timeseries.length).toBe(7);
      for (const point of result.timeseries) {
        expect(point.views).toBe(0);
        expect(point.contacts).toBe(0);
        expect(point.impressions).toBe(0);
      }
      expect(result.products).toEqual([]);
    });

    it('sets rankInCategory to null for unapproved products (draft, rejected, archived)', async () => {
      const draft = makeMockProduct('p-draft', 'Draft Shoes', 'fashion', 'draft');
      const archived = makeMockProduct('p-archived', 'Sold Watch', 'fashion', 'archived');
      mockPrisma.marketplaceProduct.findMany.mockResolvedValue([draft, archived]);
      mockPrisma.marketplaceProduct.count.mockResolvedValue(10);
      mockPrisma.marketplaceListingEvent.findMany.mockResolvedValue([]);

      const result = await getMarketplaceAnalytics('user-1', 'biz-1', 7);

      expect(result.products[0].rankInCategory).toBeNull();
      expect(result.products[1].rankInCategory).toBeNull();
      expect(result.summary.liveProducts).toBe(0);
    });

    it('throws 404/403 if business access is invalid', async () => {
      mockPrisma.business.findUnique.mockResolvedValue(null);

      await expect(
        getMarketplaceAnalytics('unauth-user', 'biz-1', 30)
      ).rejects.toThrow('Business not found');
    });
  });

  describe('2. HTTP Controller & Route Integration (GET /analytics)', () => {
    const app = express();
    app.use(express.json());

    // Mock auth middleware injects user
    app.use((req: any, _res, next) => {
      req.user = { userId: 'user-1' };
      next();
    });

    app.get('/businesses/:businessId/marketplace/analytics', controllerGetAnalytics);
    app.use(errorHandler);

    it('responds 200 with structured analytics payload', async () => {
      mockPrisma.marketplaceProduct.findMany.mockResolvedValue([]);
      mockPrisma.marketplaceListingEvent.findMany.mockResolvedValue([]);

      const res = await request(app)
        .get('/businesses/biz-1/marketplace/analytics?days=7')
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.periodDays).toBe(7);
      expect(res.body.data.summary).toBeDefined();
      expect(res.body.data.timeseries).toBeInstanceOf(Array);
      expect(res.body.data.timeseries.length).toBe(7);
    });

    it('defaults to 30 days when query parameter is omitted', async () => {
      mockPrisma.marketplaceProduct.findMany.mockResolvedValue([]);
      mockPrisma.marketplaceListingEvent.findMany.mockResolvedValue([]);

      const res = await request(app)
        .get('/businesses/biz-1/marketplace/analytics')
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.periodDays).toBe(30);
      expect(res.body.data.timeseries.length).toBe(30);
    });
  });
});
