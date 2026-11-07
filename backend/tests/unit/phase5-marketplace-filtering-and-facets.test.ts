import { describe, it, expect, beforeEach, jest } from '@jest/globals';

const mockPrisma = {
  marketplaceProduct: {
    findMany: jest.fn<any>(),
    count: jest.fn<any>(),
    groupBy: jest.fn<any>(),
  },
  $queryRaw: jest.fn<any>(),
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

import { listPublicFeed } from '../../src/services/marketplace/marketplace.service';
import { listProductsQuerySchema } from '../../src/validators/marketplace.validator';

describe('Phase 5: Server-side Filtering, Sorting & Facets', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('1. Validator (listProductsQuerySchema)', () => {
    it('normalizes sort aliases: price-asc -> price_asc, price-desc -> price_desc', () => {
      const parsedAsc = listProductsQuerySchema.parse({ sort: 'price-asc' });
      expect(parsedAsc.sort).toBe('price_asc');

      const parsedDesc = listProductsQuerySchema.parse({ sort: 'price-desc' });
      expect(parsedDesc.sort).toBe('price_desc');

      const parsedRelevance = listProductsQuerySchema.parse({ sort: 'relevance' });
      expect(parsedRelevance.sort).toBe('relevance');

      const parsedDefault = listProductsQuerySchema.parse({});
      expect(parsedDefault.sort).toBe('newest');
    });

    it('rejects invalid minPrice > maxPrice with a validation error', () => {
      const result = listProductsQuerySchema.safeParse({
        minPrice: 50000,
        maxPrice: 20000,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe('minPrice cannot be greater than maxPrice');
      }
    });

    it('parses boolean query parameters correctly', () => {
      const parsed = listProductsQuerySchema.parse({
        verifiedOnly: 'true',
        hasDiscount: 'true',
        inStockOnly: 'false',
      });

      expect(parsed.verifiedOnly).toBe(true);
      expect(parsed.hasDiscount).toBe(true);
      expect(parsed.inStockOnly).toBe(false);
    });
  });

  describe('2. Service Filtering & Where Clause (listPublicFeed)', () => {
    const mockProduct = {
      id: 'prod-1',
      slug: 'item-1',
      name: 'Item 1',
      category: 'fashion',
      productType: 'physical',
      description: 'Test description',
      price: 15000,
      compareAtPrice: 20000,
      currency: 'NGN',
      stockQuantity: 5,
      trackInventory: true,
      attributes: {},
      images: [],
      purchaseUrl: null,
      business: {
        businessName: 'Lagos Store',
        city: 'Ikeja',
        state: 'Lagos',
        user: { isVerified: true },
      },
      createdAt: new Date(),
    };

    beforeEach(() => {
      mockPrisma.marketplaceProduct.count.mockResolvedValue(1);
      mockPrisma.marketplaceProduct.findMany.mockResolvedValue([mockProduct]);
      mockPrisma.marketplaceProduct.groupBy.mockResolvedValue([{ category: 'fashion', _count: 1 }]);
      mockPrisma.$queryRaw.mockResolvedValue([{ name: 'Lagos', count: 1 }]);
    });

    it('applies state alias filter correctly (e.g. Abuja matches both abuja and fct)', async () => {
      await listPublicFeed({ state: 'Abuja' });

      expect(mockPrisma.marketplaceProduct.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'approved',
            AND: expect.arrayContaining([
              expect.objectContaining({
                OR: expect.arrayContaining([
                  { business: { state: { contains: 'abuja', mode: 'insensitive' } } },
                  { business: { city: { contains: 'abuja', mode: 'insensitive' } } },
                  { business: { state: { contains: 'fct', mode: 'insensitive' } } },
                  { business: { city: { contains: 'fct', mode: 'insensitive' } } },
                ]),
              }),
            ]),
          }),
        })
      );
    });

    it('applies verifiedOnly, inStockOnly, minPrice, maxPrice, and hasDiscount', async () => {
      await listPublicFeed({
        verifiedOnly: true,
        inStockOnly: true,
        minPrice: 10000,
        maxPrice: 30000,
        hasDiscount: true,
      });

      expect(mockPrisma.marketplaceProduct.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'approved',
            AND: expect.arrayContaining([
              { business: { user: { isVerified: true } } },
              {
                OR: [
                  { trackInventory: false },
                  { stockQuantity: null },
                  { stockQuantity: { gt: 0 } },
                ],
              },
              { price: { gte: 10000, lte: 30000 } },
              { discountActive: true },
            ]),
          }),
        })
      );
    });

    it('orders by price_asc with deterministic createdAt/id tie-break', async () => {
      await listPublicFeed({ sort: 'price_asc' });

      expect(mockPrisma.marketplaceProduct.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: [{ price: 'asc' }, { createdAt: 'desc' }, { id: 'desc' }],
        })
      );
    });

    it('orders by price_desc with deterministic createdAt/id tie-break', async () => {
      await listPublicFeed({ sort: 'price_desc' });

      expect(mockPrisma.marketplaceProduct.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: [{ price: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
        })
      );
    });

    it('orders by relevance when search is provided: exact name match first, prefix second', async () => {
      const candidates = [
        { id: '1', name: 'Shoes Casual Leather', createdAt: new Date('2026-01-01') },
        { id: '2', name: 'Leather', createdAt: new Date('2026-01-02') }, // exact match
        { id: '3', name: 'Leather Boots', createdAt: new Date('2026-01-03') }, // prefix match
      ];

      mockPrisma.marketplaceProduct.findMany
        .mockResolvedValueOnce(candidates) // candidates query
        .mockResolvedValueOnce([
          { ...mockProduct, id: '2', name: 'Leather' },
          { ...mockProduct, id: '3', name: 'Leather Boots' },
          { ...mockProduct, id: '1', name: 'Shoes Casual Leather' },
        ]);

      const res = await listPublicFeed({ search: 'leather', sort: 'relevance' });

      // Relevance order: exact match ("Leather") first, prefix ("Leather Boots") second
      expect(res.data[0].id).toBe('2');
      expect(res.data[1].id).toBe('3');
      expect(res.data[2].id).toBe('1');
    });
  });

  describe('3. Facets Computation (listPublicFeed)', () => {
    it('returns facets alongside pagination with categories, states, priceBands, verifiedCount, and discountCount', async () => {
      mockPrisma.marketplaceProduct.count.mockImplementation(async (args: any) => {
        if (args?.where?.business?.user?.isVerified) return 10;
        if (args?.where?.discountActive) return 4;
        return 15; // total
      });

      mockPrisma.marketplaceProduct.findMany.mockResolvedValue([
        {
          id: 'prod-1',
          slug: 'item-1',
          name: 'Item 1',
          category: 'fashion',
          productType: 'physical',
          description: 'Desc',
          price: 25000,
          compareAtPrice: 30000,
          currency: 'NGN',
          stockQuantity: 5,
          trackInventory: true,
          attributes: {},
          images: [],
          purchaseUrl: null,
          business: {
            businessName: 'Merchant',
            city: 'Ikeja',
            state: 'Lagos',
            user: { isVerified: true },
          },
          createdAt: new Date(),
        },
      ]);

      mockPrisma.marketplaceProduct.groupBy.mockResolvedValue([
        { category: 'fashion', _count: 10 },
        { category: 'electronics', _count: 5 },
      ]);

      mockPrisma.$queryRaw
        .mockResolvedValueOnce([{ name: 'Lagos', count: 12 }, { name: 'Abuja', count: 3 }]) // states
        .mockResolvedValueOnce([
          {
            under_25k: 2,
            b_25k_50k: 5,
            b_50k_100k: 4,
            b_100k_250k: 2,
            b_250k_1m: 1,
            over_1m: 1,
          },
        ]); // priceBands

      const res = await listPublicFeed({ page: 1, limit: 16 });

      expect(res.facets).toBeDefined();
      expect(res.facets.categories).toEqual([
        { slug: 'fashion', count: 10 },
        { slug: 'electronics', count: 5 },
      ]);
      expect(res.facets.states).toEqual([
        { name: 'Lagos', count: 12 },
        { name: 'Abuja', count: 3 },
      ]);
      expect(res.facets.priceBands).toHaveLength(6);
      expect(res.facets.priceBands[0]).toEqual({ id: 'under_25k', label: 'Under ₦25,000', count: 2 });
      expect(res.facets.priceBands[1]).toEqual({ id: '25k_50k', label: '₦25,000 - ₦50,000', count: 5 });
      expect(res.facets.verifiedCount).toBe(10);
      expect(res.facets.discountCount).toBe(4);
    });

    it('returns empty arrays and zeroed counters on empty catalogue (never null)', async () => {
      mockPrisma.marketplaceProduct.count.mockResolvedValue(0);
      mockPrisma.marketplaceProduct.findMany.mockResolvedValue([]);
      mockPrisma.marketplaceProduct.groupBy.mockResolvedValue([]);
      mockPrisma.$queryRaw
        .mockResolvedValueOnce([]) // states
        .mockResolvedValueOnce([]); // priceBands

      const res = await listPublicFeed({ page: 1, limit: 16 });

      expect(res.data).toEqual([]);
      expect(res.pagination.total).toBe(0);
      expect(res.facets.categories).toEqual([]);
      expect(res.facets.states).toEqual([]);
      expect(res.facets.priceBands).toHaveLength(6);
      expect(res.facets.priceBands.every((b) => b.count === 0)).toBe(true);
      expect(res.facets.verifiedCount).toBe(0);
      expect(res.facets.discountCount).toBe(0);
    });
  });
});
