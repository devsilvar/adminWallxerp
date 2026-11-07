import { describe, it, expect, beforeEach, jest } from '@jest/globals';

const mockPrisma = {
  business: {
    findFirst: jest.fn<any>(),
  },
  marketplaceProduct: {
    findMany: jest.fn<any>(),
    findUnique: jest.fn<any>(),
    update: jest.fn<any>(),
    count: jest.fn<any>(),
    groupBy: jest.fn<any>(),
  },
  marketplaceListingEvent: {
    create: jest.fn<any>(),
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

import {
  getSellerStorefront,
  getPublicWhatsAppRedirectUrl,
} from '../../src/services/marketplace/marketplace.service';
import { publicMarketplaceController } from '../../src/controllers/public-marketplace.controller';
import { AppError } from '../../src/middleware/errorHandler';

describe('Phase 7: Contact on the Card + Seller Storefront', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const mockBusiness = {
    id: '11111111-1111-1111-1111-111111111111',
    merchantId: 'MERCH-ABC123XYZ',
    businessName: 'Lagos Premier Gadgets',
    city: 'Ikeja',
    state: 'Lagos',
    address: '12 Computer Village, Ikeja',
    logoUrl: 'https://example.com/logo.jpg',
    createdAt: new Date('2024-01-15T10:00:00Z'),
    user: {
      isVerified: true,
    },
  };

  const mockProducts = [
    {
      id: 'prod-1',
      slug: 'iphone-15-pro-max',
      name: 'iPhone 15 Pro Max',
      category: 'electronics',
      productType: 'physical',
      description: 'Brand new in box',
      price: '1850000',
      compareAtPrice: '1950000',
      currency: 'NGN',
      stockQuantity: 5,
      trackInventory: true,
      attributes: { storage: '256GB', color: 'Titanium' },
      images: ['https://example.com/iphone.jpg'],
      contactWhatsapp: '+2348012345678',
      contactPhone: '08012345678',
      purchaseUrl: 'https://seller.wallx.ng/p/1',
      createdAt: new Date('2026-02-01T12:00:00Z'),
      status: 'approved',
    },
    {
      id: 'prod-2',
      slug: 'macbook-air-m2',
      name: 'MacBook Air M2',
      category: 'electronics',
      productType: 'physical',
      description: 'Midnight, 16GB RAM',
      price: '1450000',
      compareAtPrice: null,
      currency: 'NGN',
      stockQuantity: 2,
      trackInventory: true,
      attributes: { ram: '16GB' },
      images: ['https://example.com/macbook.jpg'],
      contactWhatsapp: null,
      contactPhone: '08098765432',
      purchaseUrl: null,
      createdAt: new Date('2026-02-02T12:00:00Z'),
      status: 'approved',
    },
  ];

  describe('1. getSellerStorefront Service', () => {
    it('retrieves merchant profile and approved listings by merchantId', async () => {
      mockPrisma.business.findFirst.mockResolvedValue(mockBusiness);
      mockPrisma.marketplaceProduct.count.mockResolvedValue(2);
      mockPrisma.marketplaceProduct.findMany.mockResolvedValue(mockProducts);

      const result = await getSellerStorefront('MERCH-ABC123XYZ');

      expect(mockPrisma.business.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { merchantId: 'MERCH-ABC123XYZ' },
        })
      );
      expect(mockPrisma.marketplaceProduct.count).toHaveBeenCalledWith({
        where: { businessId: mockBusiness.id, status: 'approved' },
      });

      expect(result.seller.businessName).toBe('Lagos Premier Gadgets');
      expect(result.seller.merchantId).toBe('MERCH-ABC123XYZ');
      expect(result.seller.isVerified).toBe(true);
      expect(result.seller.city).toBe('Ikeja');
      expect(result.seller.state).toBe('Lagos');
      expect(result.seller.contactWhatsapp).toBe('+2348012345678');
      expect(result.total).toBe(2);
      expect(result.products).toHaveLength(2);
    });

    it('retrieves merchant profile and listings by business UUID', async () => {
      mockPrisma.business.findFirst.mockResolvedValue(mockBusiness);
      mockPrisma.marketplaceProduct.count.mockResolvedValue(2);
      mockPrisma.marketplaceProduct.findMany.mockResolvedValue(mockProducts);

      const uuid = '11111111-1111-1111-1111-111111111111';
      const result = await getSellerStorefront(uuid);

      expect(mockPrisma.business.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { OR: [{ id: uuid }, { merchantId: uuid }] },
        })
      );
      expect(result.seller.id).toBe(uuid);
    });

    it('throws AppError 404 when seller is not found', async () => {
      mockPrisma.business.findFirst.mockResolvedValue(null);

      await expect(getSellerStorefront('NON_EXISTENT_MERCH')).rejects.toThrow(AppError);
      await expect(getSellerStorefront('NON_EXISTENT_MERCH')).rejects.toMatchObject({
        statusCode: 404,
        code: 'SELLER_NOT_FOUND',
      });
    });

    it('throws AppError 400 when identifier is empty', async () => {
      await expect(getSellerStorefront('   ')).rejects.toThrow(AppError);
      await expect(getSellerStorefront('')).rejects.toMatchObject({
        statusCode: 400,
        code: 'INVALID_PARAM',
      });
    });

    it('NEVER leaks contactPhone in its listings list payload (anti-scraping edge case)', async () => {
      mockPrisma.business.findFirst.mockResolvedValue(mockBusiness);
      mockPrisma.marketplaceProduct.count.mockResolvedValue(2);
      mockPrisma.marketplaceProduct.findMany.mockResolvedValue(mockProducts);

      const result = await getSellerStorefront('MERCH-ABC123XYZ');

      for (const product of result.products) {
        expect((product as any).contactPhone).toBeUndefined();
      }
    });

    it('guarantees storefront count and public approved count agree', async () => {
      mockPrisma.business.findFirst.mockResolvedValue(mockBusiness);
      mockPrisma.marketplaceProduct.count.mockResolvedValue(2);
      mockPrisma.marketplaceProduct.findMany.mockResolvedValue(mockProducts);

      const result = await getSellerStorefront('MERCH-ABC123XYZ');

      expect(result.total).toBe(2);
      expect(result.products.length).toBe(result.total);
    });
  });

  describe('2. Controller (getSellerStorefront)', () => {
    it('returns 200 with Cache-Control headers and json payload', async () => {
      mockPrisma.business.findFirst.mockResolvedValue(mockBusiness);
      mockPrisma.marketplaceProduct.count.mockResolvedValue(2);
      mockPrisma.marketplaceProduct.findMany.mockResolvedValue(mockProducts);

      const req: any = {
        params: { identifier: 'MERCH-ABC123XYZ' },
      };
      const res: any = {
        setHeader: jest.fn(),
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };

      await new Promise<void>((resolve, reject) => {
        res.json.mockImplementation(() => {
          resolve();
        });
        const next = (err?: any) => {
          if (err) reject(err);
          else resolve();
        };
        publicMarketplaceController.getSellerStorefront(req, res, next);
      });

      expect(res.setHeader).toHaveBeenCalledWith(
        'Cache-Control',
        'public, max-age=0, s-maxage=300, stale-while-revalidate=600'
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            seller: expect.objectContaining({
              businessName: 'Lagos Premier Gadgets',
            }),
            total: 2,
          }),
        })
      );
    });

    it('rejects with 400 if route parameter identifier is missing', async () => {
      const req: any = {
        params: { identifier: '' },
      };
      const res: any = {
        setHeader: jest.fn(),
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      await publicMarketplaceController.getSellerStorefront(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(AppError));
      const err = next.mock.calls[0][0];
      expect(err.statusCode).toBe(400);
    });
  });

  describe('3. getPublicWhatsAppRedirectUrl & redirectWhatsApp (anti-scrape redirect)', () => {
    const approvedProduct = {
      id: 'prod-whatsapp-1',
      name: 'Sony WH-1000XM5 Headphones',
      price: '350000',
      currency: 'NGN',
      slug: 'sony-wh-1000xm5-headphones',
      status: 'approved',
      contactWhatsapp: '+2348012345678',
      contactPhone: '+2348099998888',
      businessId: 'biz-1',
    };

    it('builds wa.me URL, logs whatsapp_click event and increments contactCount', async () => {
      mockPrisma.marketplaceProduct.findUnique.mockResolvedValue(approvedProduct);
      mockPrisma.marketplaceListingEvent.create.mockResolvedValue({ id: 'evt-1' });
      mockPrisma.marketplaceProduct.update.mockResolvedValue({ id: 'prod-whatsapp-1' });

      const url = await getPublicWhatsAppRedirectUrl({
        productId: 'prod-whatsapp-1',
        ip: '192.168.1.1',
        userAgent: 'Mozilla/5.0 Test',
        source: 'card_mobile',
      });

      expect(url).toContain('https://wa.me/2348012345678?text=');
      expect(decodeURIComponent(url)).toContain('Sony WH-1000XM5 Headphones');
      expect(decodeURIComponent(url)).toContain('/p/sony-wh-1000xm5-headphones');
      expect(mockPrisma.marketplaceListingEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            productId: 'prod-whatsapp-1',
            businessId: 'biz-1',
            eventType: 'whatsapp_click',
            source: 'card_mobile',
          }),
        })
      );
      expect(mockPrisma.marketplaceProduct.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'prod-whatsapp-1' },
          data: expect.objectContaining({
            contactCount: { increment: 1 },
          }),
        })
      );
    });

    it('falls back to contactPhone when contactWhatsapp is missing and normalizes 080... to 23480...', async () => {
      mockPrisma.marketplaceProduct.findUnique.mockResolvedValue({
        ...approvedProduct,
        contactWhatsapp: null,
        contactPhone: '08033334444',
      });
      mockPrisma.marketplaceListingEvent.create.mockResolvedValue({ id: 'evt-2' });
      mockPrisma.marketplaceProduct.update.mockResolvedValue({ id: 'prod-whatsapp-1' });

      const url = await getPublicWhatsAppRedirectUrl({
        productId: 'prod-whatsapp-1',
        ip: '192.168.1.1',
        userAgent: 'Mozilla/5.0 Test',
      });

      expect(url).toContain('https://wa.me/2348033334444?text=');
    });

    it('throws 404 PRODUCT_NOT_FOUND if listing does not exist', async () => {
      mockPrisma.marketplaceProduct.findUnique.mockResolvedValue(null);

      await expect(
        getPublicWhatsAppRedirectUrl({
          productId: 'non-existent',
          ip: '192.168.1.1',
          userAgent: 'Mozilla/5.0 Test',
        })
      ).rejects.toThrow(
        expect.objectContaining({
          statusCode: 404,
          code: 'PRODUCT_NOT_FOUND',
        })
      );
      expect(mockPrisma.marketplaceListingEvent.create).not.toHaveBeenCalled();
    });

    it('throws 404 PRODUCT_NOT_FOUND if listing is not approved', async () => {
      mockPrisma.marketplaceProduct.findUnique.mockResolvedValue({
        ...approvedProduct,
        status: 'pending_approval',
      });

      await expect(
        getPublicWhatsAppRedirectUrl({
          productId: 'prod-whatsapp-1',
          ip: '192.168.1.1',
          userAgent: 'Mozilla/5.0 Test',
        })
      ).rejects.toThrow(
        expect.objectContaining({
          statusCode: 404,
          code: 'PRODUCT_NOT_FOUND',
        })
      );
      expect(mockPrisma.marketplaceListingEvent.create).not.toHaveBeenCalled();
    });

    it('throws 404 CONTACT_UNAVAILABLE if merchant provided no phone or invalid digits', async () => {
      mockPrisma.marketplaceProduct.findUnique.mockResolvedValue({
        ...approvedProduct,
        contactWhatsapp: null,
        contactPhone: '   ',
      });

      await expect(
        getPublicWhatsAppRedirectUrl({
          productId: 'prod-whatsapp-1',
          ip: '192.168.1.1',
          userAgent: 'Mozilla/5.0 Test',
        })
      ).rejects.toThrow(
        expect.objectContaining({
          statusCode: 404,
          code: 'CONTACT_UNAVAILABLE',
        })
      );
      expect(mockPrisma.marketplaceListingEvent.create).not.toHaveBeenCalled();
    });

    it('redirectWhatsApp controller performs 302 redirect with Cache-Control no-store', async () => {
      mockPrisma.marketplaceProduct.findUnique.mockResolvedValue(approvedProduct);
      mockPrisma.marketplaceListingEvent.create.mockResolvedValue({ id: 'evt-3' });
      mockPrisma.marketplaceProduct.update.mockResolvedValue({ id: 'prod-whatsapp-1' });

      const req: any = {
        params: { productId: 'prod-whatsapp-1' },
        query: { source: 'detail_page' },
        headers: {
          'user-agent': 'Jest-Agent',
          'x-forwarded-for': '10.0.0.1',
        },
        ip: '10.0.0.1',
      };
      const res: any = {
        setHeader: jest.fn(),
        redirect: jest.fn(),
      };

      await new Promise<void>((resolve, reject) => {
        res.redirect.mockImplementation(() => {
          resolve();
        });
        const next = (err?: any) => {
          if (err) reject(err);
          else resolve();
        };
        publicMarketplaceController.redirectWhatsApp(req, res, next);
      });

      expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
      expect(res.redirect).toHaveBeenCalledWith(
        302,
        expect.stringContaining('https://wa.me/2348012345678?text=')
      );
    });
  });
});
