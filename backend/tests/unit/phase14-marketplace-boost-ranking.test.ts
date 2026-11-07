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
    findUnique: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    update: jest.fn(),
    groupBy: jest.fn(),
  },
  marketplaceBoost: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    count: jest.fn(),
  },
  marketplaceListingEvent: {
    create: jest.fn(),
    createMany: jest.fn(),
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

const mockLogAudit = jest.fn();
jest.mock('../../src/lib/audit', () => ({
  __esModule: true,
  logAudit: mockLogAudit,
}));

import {
  listPublicFeed,
  recordListingEvent,
  archiveProduct,
  markProductAsSold,
  updateProduct,
} from '../../src/services/marketplace/marketplace.service';

describe('Phase 14: Marketplace Boost Ranking, Interleaving & Impression Tracking', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.business.findUnique.mockResolvedValue({
      id: 'biz-1',
      userId: 'user-1',
      businessName: 'Biz 1',
    });
    mockPrisma.business.findFirst.mockResolvedValue({
      id: 'biz-1',
      userId: 'user-1',
      businessName: 'Biz 1',
    });
    mockPrisma.marketplaceProduct.count.mockResolvedValue(20);
    mockPrisma.marketplaceProduct.groupBy.mockResolvedValue([{ category: 'electronics', _count: 20 }]);
    mockPrisma.$queryRaw.mockResolvedValue([]);
    mockPrisma.marketplaceListingEvent.createMany.mockResolvedValue({ count: 1 });
    mockPrisma.businessMember.findFirst.mockResolvedValue({
      id: 'mem-1',
      userId: 'user-1',
      businessId: 'biz-1',
      role: 'owner',
    });
  });

  const makeMockProduct = (id: string, name: string, category: string, city: string, state: string, createdAt: Date) => ({
    id,
    slug: `slug-${id}`,
    name,
    category,
    productType: 'physical',
    description: `Description for ${name}`,
    price: 50000,
    compareAtPrice: null,
    currency: 'NGN',
    stockQuantity: 10,
    trackInventory: true,
    attributes: {},
    images: ['https://example.com/item.jpg'],
    purchaseUrl: null,
    contactWhatsapp: '08012345678',
    contactPhone: '08012345678',
    business: {
      businessName: `${city} Merchant`,
      city,
      state,
      user: { isVerified: true },
    },
    createdAt,
  });

  describe('1. Ranking Rules & Never Position 1', () => {
    it('interleaves boosts into page 1 with slot 0 reserved for newest organic listing', async () => {
      const now = new Date();
      const organic0 = makeMockProduct('org-0', 'Organic Newest', 'electronics', 'Ikeja', 'Lagos', new Date(now.getTime() - 1000));
      const organic1 = makeMockProduct('org-1', 'Organic Second', 'electronics', 'Ikeja', 'Lagos', new Date(now.getTime() - 2000));
      const organic2 = makeMockProduct('org-2', 'Organic Third', 'electronics', 'Ikeja', 'Lagos', new Date(now.getTime() - 3000));

      const boostedProduct = makeMockProduct('bst-1', 'Boosted Phone', 'electronics', 'Ikeja', 'Lagos', new Date(now.getTime() - 10000));

      // Active boost query returns bst-1
      mockPrisma.marketplaceBoost.findMany.mockResolvedValue([
        {
          id: 'boost-row-1',
          productId: 'bst-1',
          status: 'active',
          endsAt: new Date(now.getTime() + 86400000),
          product: boostedProduct,
        },
      ]);

      // Organic query excludes bst-1 and returns organic items
      mockPrisma.marketplaceProduct.findMany.mockResolvedValue([organic0, organic1, organic2]);

      const result = await listPublicFeed({ sort: 'newest', page: 1, limit: 10 });

      // Slot 0 MUST be organic newest (Never position 1 for boost!)
      expect(result.data[0].id).toBe('org-0');
      expect(result.data[0].promoted).toBe(false);

      // Slot 1 is the boosted listing with promoted: true
      expect(result.data[1].id).toBe('bst-1');
      expect(result.data[1].promoted).toBe(true);

      // Slot 2 is organic second
      expect(result.data[2].id).toBe('org-1');
      expect(result.data[2].promoted).toBe(false);
    });

    it('boost applies ONLY to sort=newest and NEVER to price_asc or price_desc', async () => {
      const now = new Date();
      const p1 = makeMockProduct('p1', 'Cheap Phone', 'electronics', 'Ikeja', 'Lagos', now);

      mockPrisma.marketplaceProduct.findMany.mockResolvedValue([p1]);

      const result = await listPublicFeed({ sort: 'price_asc', page: 1 });

      // Boost query must NOT even be invoked for price sorts
      expect(mockPrisma.marketplaceBoost.findMany).not.toHaveBeenCalled();
      expect(result.data[0].promoted).toBe(false);
    });
  });

  describe('2. Cap at 3 Boosts per Category & Earliest Expiry Ordering', () => {
    it('caps active category boosts at at most 3 per page even when 5 are active', async () => {
      const now = new Date();
      const boosts = [1, 2, 3, 4, 5].map((i) => ({
        id: `boost-${i}`,
        productId: `bst-${i}`,
        status: 'active',
        endsAt: new Date(now.getTime() + i * 3600000), // Ordered by endsAt asc
        product: makeMockProduct(`bst-${i}`, `Boosted ${i}`, 'electronics', 'Ikeja', 'Lagos', now),
      }));

      mockPrisma.marketplaceBoost.findMany.mockResolvedValue(boosts);

      const organicItems = [
        makeMockProduct('org-0', 'Organic 0', 'electronics', 'Ikeja', 'Lagos', now),
        makeMockProduct('org-1', 'Organic 1', 'electronics', 'Ikeja', 'Lagos', now),
        makeMockProduct('org-2', 'Organic 2', 'electronics', 'Ikeja', 'Lagos', now),
        makeMockProduct('org-3', 'Organic 3', 'electronics', 'Ikeja', 'Lagos', now),
      ];
      mockPrisma.marketplaceProduct.findMany.mockResolvedValue(organicItems);

      const result = await listPublicFeed({ category: 'electronics', page: 1, limit: 10 });

      const promotedItems = result.data.filter((item) => item.promoted === true);
      // Maximum 3 boosts allowed per category
      expect(promotedItems.length).toBe(3);
      // Ordered by endsAt asc: bst-1, bst-2, bst-3
      expect(promotedItems.map((p) => p.id)).toEqual(['bst-1', 'bst-2', 'bst-3']);
      // Position 0 is still organic 0
      expect(result.data[0].id).toBe('org-0');
      expect(result.data[0].promoted).toBe(false);
    });
  });

  describe('3. Filter Satisfaction (Lagos vs Kano & In-Stock)', () => {
    it('passes active search, category, and state filters to the boost query', async () => {
      mockPrisma.marketplaceBoost.findMany.mockResolvedValue([]);
      mockPrisma.marketplaceProduct.findMany.mockResolvedValue([]);

      await listPublicFeed({
        state: 'Lagos',
        category: 'electronics',
        verifiedOnly: true,
        inStockOnly: true,
        minPrice: 10000,
        maxPrice: 100000,
      });

      // Boost query MUST receive the identical active filter criteria
      expect(mockPrisma.marketplaceBoost.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'active',
            product: expect.objectContaining({
              AND: expect.arrayContaining([
                expect.objectContaining({
                  status: 'approved',
                  category: 'electronics',
                }),
                expect.objectContaining({
                  OR: [
                    { trackInventory: false },
                    { stockQuantity: null },
                    { stockQuantity: { gt: 0 } },
                  ],
                }),
              ]),
            }),
          }),
        })
      );
    });
  });

  describe('4. Offset Math & Page 2 Pagination Without Duplicates', () => {
    it('applies correct organic take and skip on page 1 vs page 2 when boosts exist', async () => {
      const now = new Date();
      const mockBoosts = [
        {
          id: 'b1',
          productId: 'bst-1',
          status: 'active',
          endsAt: new Date(now.getTime() + 10000),
          product: makeMockProduct('bst-1', 'Boosted 1', 'fashion', 'Ikeja', 'Lagos', now),
        },
        {
          id: 'b2',
          productId: 'bst-2',
          status: 'active',
          endsAt: new Date(now.getTime() + 20000),
          product: makeMockProduct('bst-2', 'Boosted 2', 'fashion', 'Ikeja', 'Lagos', now),
        },
      ];
      mockPrisma.marketplaceBoost.findMany.mockResolvedValue(mockBoosts);
      mockPrisma.marketplaceProduct.findMany.mockResolvedValue([]);

      // Page 1 with limit = 10 and 2 boosts:
      // Organic take = limit - boostIds.length = 10 - 2 = 8, skip = 0
      await listPublicFeed({ page: 1, limit: 10, sort: 'newest' });

      expect(mockPrisma.marketplaceProduct.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: { notIn: ['bst-1', 'bst-2'] },
          }),
          skip: 0,
          take: 8,
        })
      );

      // Page 2 with limit = 10 and 2 boosts:
      // Organic skip = (2 - 1) * 10 - 2 = 8, take = 10
      await listPublicFeed({ page: 2, limit: 10, sort: 'newest' });

      expect(mockPrisma.marketplaceProduct.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: { notIn: ['bst-1', 'bst-2'] },
          }),
          skip: 8,
          take: 10,
        })
      );
    });
  });

  describe('5. Impression Tracking (boost_impression)', () => {
    it('increments impressions on active MarketplaceBoost when boost_impression event is received', async () => {
      mockPrisma.marketplaceProduct.findUnique.mockResolvedValue({
        id: 'prod-boosted',
        businessId: 'biz-1',
        status: 'approved',
      });

      mockPrisma.marketplaceBoost.findFirst.mockResolvedValue({
        id: 'boost-active-1',
        productId: 'prod-boosted',
        status: 'active',
        endsAt: new Date(Date.now() + 86400000),
      });

      await recordListingEvent({
        productId: 'prod-boosted',
        eventType: 'boost_impression',
        source: 'feed_page1',
        ip: '127.0.0.1',
        userAgent: 'Mozilla/5.0',
      });

      // Increments impressions on MarketplaceBoost record
      expect(mockPrisma.marketplaceBoost.update).toHaveBeenCalledWith({
        where: { id: 'boost-active-1' },
        data: {
          impressions: { increment: 1 },
        },
      });

      // Writes listing event row
      expect(mockPrisma.marketplaceListingEvent.createMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.arrayContaining([
            expect.objectContaining({
              productId: 'prod-boosted',
              eventType: 'boost_impression',
              source: 'feed_page1',
            }),
          ]),
        })
      );
    });
  });

  describe('6. Auto-Pause Triggers (Archive, Mark as Sold, Demotion, Stock Depletion)', () => {
    it('auto-pauses active boost when product is archived', async () => {
      mockPrisma.marketplaceProduct.findFirst.mockResolvedValue({
        id: 'prod-1',
        businessId: 'biz-1',
        status: 'approved',
      });
      mockPrisma.marketplaceProduct.update.mockResolvedValue({ id: 'prod-1', status: 'archived' });

      await archiveProduct('user-1', 'biz-1', 'prod-1');

      expect(mockPrisma.marketplaceProduct.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'prod-1' },
          data: { status: 'archived', boostEndsAt: null },
        })
      );
      expect(mockPrisma.marketplaceBoost.updateMany).toHaveBeenCalledWith({
        where: { productId: 'prod-1', status: 'active' },
        data: { status: 'paused' },
      });
    });

    it('auto-pauses active boost when product is marked as sold', async () => {
      mockPrisma.marketplaceProduct.findFirst.mockResolvedValue({
        id: 'prod-2',
        businessId: 'biz-1',
        status: 'approved',
      });
      mockPrisma.marketplaceProduct.update.mockResolvedValue({ id: 'prod-2', status: 'archived' });

      await markProductAsSold('user-1', 'biz-1', 'prod-2');

      expect(mockPrisma.marketplaceProduct.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'prod-2' },
          data: expect.objectContaining({ status: 'archived', boostEndsAt: null }),
        })
      );
      expect(mockPrisma.marketplaceBoost.updateMany).toHaveBeenCalledWith({
        where: { productId: 'prod-2', status: 'active' },
        data: { status: 'paused' },
      });
    });

    it('auto-pauses active boost when product core fields are modified (demoted to pending_approval)', async () => {
      mockPrisma.marketplaceProduct.findFirst.mockResolvedValue({
        id: 'prod-3',
        businessId: 'biz-1',
        status: 'approved',
        name: 'Original Title',
        category: 'fashion',
        trackInventory: true,
        stockQuantity: 10,
      });
      mockPrisma.marketplaceProduct.update.mockResolvedValue({ id: 'prod-3', status: 'pending_approval' });

      await updateProduct('user-1', 'biz-1', 'prod-3', {
        name: 'Changed Title Triggers Demotion',
      });

      expect(mockPrisma.marketplaceProduct.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'prod-3' },
          data: expect.objectContaining({
            status: 'pending_approval',
            boostEndsAt: null,
          }),
        })
      );
      expect(mockPrisma.marketplaceBoost.updateMany).toHaveBeenCalledWith({
        where: { productId: 'prod-3', status: 'active' },
        data: { status: 'paused' },
      });
    });

    it('auto-pauses active boost when inventory drops to 0 (sold out)', async () => {
      mockPrisma.marketplaceProduct.findFirst.mockResolvedValue({
        id: 'prod-4',
        businessId: 'biz-1',
        status: 'approved',
        name: 'Same Title',
        category: 'fashion',
        trackInventory: true,
        stockQuantity: 5,
      });
      mockPrisma.marketplaceProduct.update.mockResolvedValue({ id: 'prod-4', stockQuantity: 0 });

      await updateProduct('user-1', 'biz-1', 'prod-4', {
        stockQuantity: 0,
      });

      expect(mockPrisma.marketplaceProduct.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'prod-4' },
          data: expect.objectContaining({
            boostEndsAt: null,
          }),
        })
      );
      expect(mockPrisma.marketplaceBoost.updateMany).toHaveBeenCalledWith({
        where: { productId: 'prod-4', status: 'active' },
        data: { status: 'paused' },
      });
    });
  });
});
