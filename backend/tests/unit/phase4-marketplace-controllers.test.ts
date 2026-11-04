import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import express, { Request, Response, NextFunction } from 'express';
import request from 'supertest';
import { errorHandler } from '@/middleware/errorHandler';

// Mock the marketplace service functions
jest.mock('@/services/marketplace/marketplace.service', () => ({
  createProduct: jest.fn(),
  updateProduct: jest.fn(),
  submitForApproval: jest.fn(),
  archiveProduct: jest.fn(),
  listForBusiness: jest.fn(),
  getProduct: jest.fn(),
  listModerationQueue: jest.fn(),
  approveProduct: jest.fn(),
  rejectProduct: jest.fn(),
  takedownProduct: jest.fn(),
  listPublicFeed: jest.fn(),
  getPublicProduct: jest.fn(),
  uploadImage: jest.fn(),
  deleteImage: jest.fn(),
}));

import * as marketplaceService from '@/services/marketplace/marketplace.service';
import {
  createProduct,
  updateProduct,
  submitForApproval,
  archiveProduct,
  listProducts,
  getProduct,
  uploadProductImage,
  deleteProductImage,
} from '@/controllers/marketplace.controller';
import {
  listQueue,
  approveProduct,
  rejectProduct,
  takedownProduct,
} from '@/controllers/marketplace-admin.controller';
import {
  listFeed,
  getBySlug,
} from '@/controllers/public-marketplace.controller';

describe('Phase 4: Marketplace Controllers Unit Tests', () => {
  let app: express.Express;
  let mockUser: { userId: string; email: string } | null = {
    userId: 'usr_merchant_1',
    email: 'merchant@example.com',
  };

  // Auth injector middleware simulating authenticate middleware
  const injectAuth = (req: any, _res: Response, next: NextFunction) => {
    if (mockUser) {
      req.user = mockUser;
    }
    next();
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockUser = { userId: 'usr_merchant_1', email: 'merchant@example.com' };

    app = express();
    app.use(express.json());

    // SME routes
    app.post('/businesses/:businessId/marketplace', injectAuth, createProduct);
    app.get('/businesses/:businessId/marketplace', injectAuth, listProducts);
    app.get('/businesses/:businessId/marketplace/:id', injectAuth, getProduct);
    app.patch('/businesses/:businessId/marketplace/:id', injectAuth, updateProduct);
    app.post('/businesses/:businessId/marketplace/:id/submit', injectAuth, submitForApproval);
    app.post('/businesses/:businessId/marketplace/:id/archive', injectAuth, archiveProduct);

    const multer = require('multer');
    const upload = multer({ storage: multer.memoryStorage() });
    app.post('/businesses/:businessId/marketplace/images', injectAuth, upload.single('file'), uploadProductImage);
    app.delete('/businesses/:businessId/marketplace/images', injectAuth, deleteProductImage);

    // Admin routes
    app.get('/admin/marketplace', injectAuth, listQueue);
    app.post('/admin/marketplace/:id/approve', injectAuth, approveProduct);
    app.post('/admin/marketplace/:id/reject', injectAuth, rejectProduct);
    app.post('/admin/marketplace/:id/takedown', injectAuth, takedownProduct);

    // Public routes (no auth)
    app.get('/marketplace/products', listFeed);
    app.get('/marketplace/products/:slug', getBySlug);

    // Error handler
    app.use(errorHandler);
  });

  const validPhysicalBody = {
    name: 'Executive Leather Briefcase',
    productType: 'physical',
    category: 'bags',
    description: 'Handcrafted full-grain leather laptop briefcase with brass buckles.',
    price: 45000,
    compareAtPrice: 50000,
    trackInventory: true,
    stockQuantity: 15,
    attributes: {
      bagType: 'briefcase',
      material: 'Full grain leather',
      laptopCompartment: true,
    },
    images: ['https://res.cloudinary.com/wallx/image/upload/v1/briefcase.jpg'],
    contactPhone: '+2348011223344',
  };

  describe('1. SME Controller (marketplace.controller.ts)', () => {
    it('POST /businesses/:businessId/marketplace returns 401 when unauthenticated', async () => {
      mockUser = null;
      const res = await request(app)
        .post('/businesses/biz_1/marketplace')
        .send(validPhysicalBody);

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('POST /businesses/:businessId/marketplace rejects invalid body with 400', async () => {
      const res = await request(app)
        .post('/businesses/biz_1/marketplace')
        .send({ name: 'AB', price: -5 });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('POST /businesses/:businessId/marketplace succeeds and returns 201', async () => {
      const mockCreated = { id: 'prod_1', ...validPhysicalBody, status: 'draft' };
      (marketplaceService.createProduct as any).mockResolvedValue(mockCreated);

      const res = await request(app)
        .post('/businesses/biz_1/marketplace')
        .send(validPhysicalBody);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe('prod_1');
      expect(res.body.message).toBe('Product created successfully');
      expect(marketplaceService.createProduct).toHaveBeenCalledWith(
        'usr_merchant_1',
        'biz_1',
        expect.objectContaining({ name: validPhysicalBody.name })
      );
    });

    it('PATCH /businesses/:businessId/marketplace/:id updates product and returns 200', async () => {
      const mockUpdated = { id: 'prod_1', price: 42000, status: 'pending_approval' };
      (marketplaceService.updateProduct as any).mockResolvedValue(mockUpdated);

      const res = await request(app)
        .patch('/businesses/biz_1/marketplace/prod_1')
        .send({ price: 42000 });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.price).toBe(42000);
      expect(marketplaceService.updateProduct).toHaveBeenCalledWith(
        'usr_merchant_1',
        'biz_1',
        'prod_1',
        expect.objectContaining({ price: 42000 })
      );
    });

    it('POST /businesses/:businessId/marketplace/:id/submit submits product for approval', async () => {
      const mockSubmitted = { id: 'prod_1', status: 'pending_approval' };
      (marketplaceService.submitForApproval as any).mockResolvedValue(mockSubmitted);

      const res = await request(app)
        .post('/businesses/biz_1/marketplace/prod_1/submit')
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Product submitted for approval');
      expect(marketplaceService.submitForApproval).toHaveBeenCalledWith(
        'usr_merchant_1',
        'biz_1',
        'prod_1'
      );
    });

    it('POST /businesses/:businessId/marketplace/:id/archive archives product and frees slot', async () => {
      const mockArchived = { id: 'prod_1', status: 'archived' };
      (marketplaceService.archiveProduct as any).mockResolvedValue(mockArchived);

      const res = await request(app)
        .post('/businesses/biz_1/marketplace/prod_1/archive')
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Product archived successfully');
      expect(marketplaceService.archiveProduct).toHaveBeenCalledWith(
        'usr_merchant_1',
        'biz_1',
        'prod_1'
      );
    });

    it('GET /businesses/:businessId/marketplace lists all products for business', async () => {
      const mockList = [{ id: 'prod_1' }, { id: 'prod_2' }];
      (marketplaceService.listForBusiness as any).mockResolvedValue(mockList);

      const res = await request(app).get('/businesses/biz_1/marketplace');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(2);
      expect(marketplaceService.listForBusiness).toHaveBeenCalledWith(
        'usr_merchant_1',
        'biz_1',
        expect.any(Object)
      );
    });

    it('GET /businesses/:businessId/marketplace/:id retrieves single product detail', async () => {
      const mockProd = { id: 'prod_1', name: 'Item 1' };
      (marketplaceService.getProduct as any).mockResolvedValue(mockProd);

      const res = await request(app).get('/businesses/biz_1/marketplace/prod_1');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe('prod_1');
      expect(marketplaceService.getProduct).toHaveBeenCalledWith(
        'usr_merchant_1',
        'biz_1',
        'prod_1'
      );
    });

    it('POST /businesses/:businessId/marketplace/images returns 400 when no file attached', async () => {
      const res = await request(app)
        .post('/businesses/biz_1/marketplace/images');

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('NO_FILE_UPLOADED');
    });

    it('POST /businesses/:businessId/marketplace/images uploads file and returns url & publicId', async () => {
      (marketplaceService.uploadImage as any).mockResolvedValue({
        url: 'https://res.cloudinary.com/wallx/image/upload/v1/marketplace/biz_1/prod.jpg',
        publicId: 'paymytax/marketplace/biz_1/prod',
      });

      const res = await request(app)
        .post('/businesses/biz_1/marketplace/images')
        .attach('file', Buffer.from('fake-image-bytes'), 'test-image.jpg');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.url).toContain('cloudinary.com');
      expect(res.body.data.publicId).toBe('paymytax/marketplace/biz_1/prod');
      expect(marketplaceService.uploadImage).toHaveBeenCalledWith(
        'usr_merchant_1',
        'biz_1',
        expect.any(Object)
      );
    });

    it('DELETE /businesses/:businessId/marketplace/images calls deleteImage with publicId', async () => {
      (marketplaceService.deleteImage as any).mockResolvedValue(undefined);

      const res = await request(app)
        .delete('/businesses/biz_1/marketplace/images')
        .send({ publicId: 'paymytax/marketplace/biz_1/prod' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(marketplaceService.deleteImage).toHaveBeenCalledWith(
        'usr_merchant_1',
        'biz_1',
        'paymytax/marketplace/biz_1/prod'
      );
    });

    it('DELETE /businesses/:businessId/marketplace/images validates publicId is required', async () => {
      const res = await request(app)
        .delete('/businesses/biz_1/marketplace/images')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_PARAM');
    });
  });

  describe('2. Admin Controller (marketplace-admin.controller.ts)', () => {
    it('GET /admin/marketplace lists moderation queue', async () => {
      const mockQueueResult = {
        data: [{ id: 'prod_1', status: 'pending_approval' }],
        pagination: { total: 1, page: 1, limit: 20, totalPages: 1 },
      };
      (marketplaceService.listModerationQueue as any).mockResolvedValue(mockQueueResult);

      const res = await request(app).get('/admin/marketplace?page=1&limit=20');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
      expect(marketplaceService.listModerationQueue).toHaveBeenCalledWith(
        expect.objectContaining({ page: 1, limit: 20 })
      );
    });

    it('POST /admin/marketplace/:id/approve approves product and returns 200', async () => {
      const mockApproved = { id: 'prod_1', status: 'approved' };
      (marketplaceService.approveProduct as any).mockResolvedValue(mockApproved);

      const res = await request(app)
        .post('/admin/marketplace/prod_1/approve')
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Product approved successfully');
      expect(marketplaceService.approveProduct).toHaveBeenCalledWith(
        'usr_merchant_1',
        'prod_1'
      );
    });

    it('POST /admin/marketplace/:id/reject rejects if reason is missing or < 3 chars', async () => {
      const res = await request(app)
        .post('/admin/marketplace/prod_1/reject')
        .send({ reason: 'no' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('POST /admin/marketplace/:id/reject rejects product with valid feedback reason', async () => {
      const mockRejected = {
        id: 'prod_1',
        status: 'rejected',
        rejectionReason: 'Image is too blurry; please re-upload clear photos.',
      };
      (marketplaceService.rejectProduct as any).mockResolvedValue(mockRejected);

      const res = await request(app)
        .post('/admin/marketplace/prod_1/reject')
        .send({ reason: 'Image is too blurry; please re-upload clear photos.' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Product rejected successfully');
      expect(marketplaceService.rejectProduct).toHaveBeenCalledWith(
        'usr_merchant_1',
        'prod_1',
        'Image is too blurry; please re-upload clear photos.'
      );
    });

    it('POST /admin/marketplace/:id/takedown takes down live product with reason', async () => {
      const mockTakedown = {
        id: 'prod_1',
        status: 'archived',
        rejectionReason: 'Policy violation: prohibited item.',
      };
      (marketplaceService.takedownProduct as any).mockResolvedValue(mockTakedown);

      const res = await request(app)
        .post('/admin/marketplace/prod_1/takedown')
        .send({ reason: 'Policy violation: prohibited item.' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Product taken down successfully');
      expect(marketplaceService.takedownProduct).toHaveBeenCalledWith(
        'usr_merchant_1',
        'prod_1',
        'Policy violation: prohibited item.'
      );
    });
  });

  describe('3. Public Controller (public-marketplace.controller.ts)', () => {
    it('GET /marketplace/products returns cache headers and feed data without auth', async () => {
      const mockFeed = {
        data: [{ id: 'prod_1', slug: 'exec-bag', name: 'Executive Bag' }],
        pagination: { page: 1, limit: 24, total: 1, totalPages: 1 },
      };
      (marketplaceService.listPublicFeed as any).mockResolvedValue(mockFeed);

      const res = await request(app).get('/marketplace/products?category=bags');

      expect(res.status).toBe(200);
      expect(res.headers['cache-control']).toBe(
        'public, max-age=0, s-maxage=300, stale-while-revalidate=600'
      );
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
      expect(marketplaceService.listPublicFeed).toHaveBeenCalledWith(
        expect.objectContaining({ category: 'bags' })
      );
    });

    it('GET /marketplace/products/:slug returns cache headers, product, and related items', async () => {
      const mockResult = {
        product: { id: 'prod_1', slug: 'exec-bag', name: 'Executive Bag' },
        relatedProducts: [{ id: 'prod_2', slug: 'leather-wallet' }],
      };
      (marketplaceService.getPublicProduct as any).mockResolvedValue(mockResult);

      const res = await request(app).get('/marketplace/products/exec-bag');

      expect(res.status).toBe(200);
      expect(res.headers['cache-control']).toBe(
        'public, max-age=0, s-maxage=300, stale-while-revalidate=600'
      );
      expect(res.body.success).toBe(true);
      expect(res.body.data.slug).toBe('exec-bag');
      expect(res.body.relatedProducts).toHaveLength(1);
      expect(marketplaceService.getPublicProduct).toHaveBeenCalledWith('exec-bag');
    });

    it('GET /marketplace/products/:slug handles service 404 cleanly', async () => {
      const { AppError } = await import('@/middleware/errorHandler');
      (marketplaceService.getPublicProduct as any).mockRejectedValue(
        new AppError(404, 'Product not found', 'PRODUCT_NOT_FOUND')
      );

      const res = await request(app).get('/marketplace/products/non-existent-item');

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('PRODUCT_NOT_FOUND');
    });
  });
});
