import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import config from '@/config';

// Mock the underlying domain service so route tests isolate routing, middleware & wiring
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
}));

import * as marketplaceService from '@/services/marketplace/marketplace.service';
import mainRouter from '@/routes/index';
import { errorHandler } from '@/middleware/errorHandler';

describe('Phase 5: Marketplace Routes & Wiring Tests', () => {
  let app: express.Express;

  const validPhysicalBody = {
    name: 'Vintage Leather Handbag',
    productType: 'physical',
    category: 'bags',
    description: 'Authentic handcrafted leather bag with brass hardware.',
    price: 35000,
    compareAtPrice: 40000,
    trackInventory: true,
    stockQuantity: 10,
    attributes: {
      bagType: 'handbag',
      material: 'Leather',
    },
    images: ['https://res.cloudinary.com/wallx/image/upload/v1/bag.jpg'],
    contactPhone: '+2348011223344',
  };

  const createToken = (userId: string, role: string, email: string = 'test@example.com'): string => {
    return jwt.sign({ userId, email, role }, config.jwt.accessSecret, {
      algorithm: 'HS256',
      expiresIn: '1h',
    });
  };

  const merchantToken = createToken('usr_merchant_1', 'user', 'merchant@example.com');
  const adminToken = createToken('usr_admin_1', 'admin', 'admin@wallx.ng');

  beforeEach(() => {
    jest.clearAllMocks();

    app = express();
    app.use(express.json());
    app.use('/api', mainRouter);
    app.use(errorHandler);
  });

  describe('1. Public Marketplace Catalog Endpoints (No Auth Required + CDN Headers)', () => {
    it('GET /api/v1/marketplace/products returns feed and CDN cache-control headers', async () => {
      const mockFeed = {
        data: [{ id: 'prod_1', name: 'Vintage Bag', slug: 'vintage-bag' }],
        pagination: { page: 1, limit: 24, total: 1, totalPages: 1 },
      };
      (marketplaceService.listPublicFeed as any).mockResolvedValue(mockFeed);

      const res = await request(app).get('/api/v1/marketplace/products?category=bags');

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

    it('GET /api/v1/public/marketplace/products also resolves via public prefix route', async () => {
      const mockFeed = {
        data: [{ id: 'prod_1', name: 'Vintage Bag', slug: 'vintage-bag' }],
        pagination: { page: 1, limit: 24, total: 1, totalPages: 1 },
      };
      (marketplaceService.listPublicFeed as any).mockResolvedValue(mockFeed);

      const res = await request(app).get('/api/v1/public/marketplace/products');

      expect(res.status).toBe(200);
      expect(res.headers['cache-control']).toBe(
        'public, max-age=0, s-maxage=300, stale-while-revalidate=600'
      );
      expect(res.body.success).toBe(true);
    });

    it('GET /api/v1/marketplace/products/:slug returns product detail and related products', async () => {
      const mockResult = {
        product: { id: 'prod_1', name: 'Vintage Bag', slug: 'vintage-bag' },
        relatedProducts: [],
      };
      (marketplaceService.getPublicProduct as any).mockResolvedValue(mockResult);

      const res = await request(app).get('/api/v1/marketplace/products/vintage-bag');

      expect(res.status).toBe(200);
      expect(res.headers['cache-control']).toBe(
        'public, max-age=0, s-maxage=300, stale-while-revalidate=600'
      );
      expect(res.body.success).toBe(true);
      expect(res.body.data.slug).toBe('vintage-bag');
      expect(marketplaceService.getPublicProduct).toHaveBeenCalledWith('vintage-bag');
    });

    it('GET /api/v1/public/marketplace/products/:slug also resolves via public prefix', async () => {
      const mockResult = {
        product: { id: 'prod_1', name: 'Vintage Bag', slug: 'vintage-bag' },
        relatedProducts: [],
      };
      (marketplaceService.getPublicProduct as any).mockResolvedValue(mockResult);

      const res = await request(app).get('/api/v1/public/marketplace/products/vintage-bag');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.slug).toBe('vintage-bag');
    });
  });

  describe('2. SME Business Marketplace Routes Security & Mounting', () => {
    const businessId = 'biz_test_100';

    it('rejects unauthenticated requests with 401 UNAUTHORIZED', async () => {
      const res = await request(app)
        .get(`/api/v1/businesses/${businessId}/marketplace`);

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('enforces session isolation: rejects admin JWTs on SME routes with 403 ADMIN_CANNOT_USE_USER_APP', async () => {
      const res = await request(app)
        .get(`/api/v1/businesses/${businessId}/marketplace`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('ADMIN_CANNOT_USE_USER_APP');
    });

    it('enforces session isolation on POST /businesses/:businessId/marketplace', async () => {
      const res = await request(app)
        .post(`/api/v1/businesses/${businessId}/marketplace`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(validPhysicalBody);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('ADMIN_CANNOT_USE_USER_APP');
    });

    it('POST /businesses/:businessId/marketplace creates product with user auth', async () => {
      const mockProduct = { id: 'prod_100', ...validPhysicalBody, status: 'draft' };
      (marketplaceService.createProduct as any).mockResolvedValue(mockProduct);

      const res = await request(app)
        .post(`/api/v1/businesses/${businessId}/marketplace`)
        .set('Authorization', `Bearer ${merchantToken}`)
        .send(validPhysicalBody);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe('prod_100');
      expect(marketplaceService.createProduct).toHaveBeenCalledWith(
        'usr_merchant_1',
        businessId,
        expect.objectContaining({ name: validPhysicalBody.name })
      );
    });

    it('GET /businesses/:businessId/marketplace lists products with user auth', async () => {
      (marketplaceService.listForBusiness as any).mockResolvedValue([{ id: 'prod_100' }]);

      const res = await request(app)
        .get(`/api/v1/businesses/${businessId}/marketplace`)
        .set('Authorization', `Bearer ${merchantToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
      expect(marketplaceService.listForBusiness).toHaveBeenCalledWith(
        'usr_merchant_1',
        businessId,
        expect.any(Object)
      );
    });

    it('GET /businesses/:businessId/marketplace/:id retrieves product detail with user auth', async () => {
      (marketplaceService.getProduct as any).mockResolvedValue({ id: 'prod_100' });

      const res = await request(app)
        .get(`/api/v1/businesses/${businessId}/marketplace/prod_100`)
        .set('Authorization', `Bearer ${merchantToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe('prod_100');
      expect(marketplaceService.getProduct).toHaveBeenCalledWith(
        'usr_merchant_1',
        businessId,
        'prod_100'
      );
    });

    it('PATCH /businesses/:businessId/marketplace/:id updates product with user auth', async () => {
      (marketplaceService.updateProduct as any).mockResolvedValue({ id: 'prod_100', price: 32000 });

      const res = await request(app)
        .patch(`/api/v1/businesses/${businessId}/marketplace/prod_100`)
        .set('Authorization', `Bearer ${merchantToken}`)
        .send({ price: 32000 });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(marketplaceService.updateProduct).toHaveBeenCalledWith(
        'usr_merchant_1',
        businessId,
        'prod_100',
        expect.objectContaining({ price: 32000 })
      );
    });

    it('POST /businesses/:businessId/marketplace/:id/submit submits product for approval', async () => {
      (marketplaceService.submitForApproval as any).mockResolvedValue({ id: 'prod_100', status: 'pending_approval' });

      const res = await request(app)
        .post(`/api/v1/businesses/${businessId}/marketplace/prod_100/submit`)
        .set('Authorization', `Bearer ${merchantToken}`)
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Product submitted for approval');
      expect(marketplaceService.submitForApproval).toHaveBeenCalledWith(
        'usr_merchant_1',
        businessId,
        'prod_100'
      );
    });

    it('POST /businesses/:businessId/marketplace/:id/archive archives product', async () => {
      (marketplaceService.archiveProduct as any).mockResolvedValue({ id: 'prod_100', status: 'archived' });

      const res = await request(app)
        .post(`/api/v1/businesses/${businessId}/marketplace/prod_100/archive`)
        .set('Authorization', `Bearer ${merchantToken}`)
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Product archived successfully');
      expect(marketplaceService.archiveProduct).toHaveBeenCalledWith(
        'usr_merchant_1',
        businessId,
        'prod_100'
      );
    });
  });

  describe('3. Admin Moderation Routes Security & Mounting', () => {
    it('GET /api/v1/admin/marketplace rejects unauthenticated requests with 401', async () => {
      const res = await request(app).get('/api/v1/admin/marketplace');

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('GET /api/v1/admin/marketplace rejects non-admin users with 403 FORBIDDEN', async () => {
      const res = await request(app)
        .get('/api/v1/admin/marketplace')
        .set('Authorization', `Bearer ${merchantToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('POST /api/v1/admin/marketplace/:id/approve rejects non-admin users with 403 FORBIDDEN', async () => {
      const res = await request(app)
        .post('/api/v1/admin/marketplace/prod_100/approve')
        .set('Authorization', `Bearer ${merchantToken}`)
        .send({});

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('GET /api/v1/admin/marketplace allows admin users to list moderation queue', async () => {
      (marketplaceService.listModerationQueue as any).mockResolvedValue({
        data: [{ id: 'prod_100' }],
        pagination: { total: 1, page: 1, limit: 20, totalPages: 1 },
      });

      const res = await request(app)
        .get('/api/v1/admin/marketplace')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
      expect(marketplaceService.listModerationQueue).toHaveBeenCalled();
    });

    it('POST /api/v1/admin/marketplace/:id/approve approves product with admin auth', async () => {
      (marketplaceService.approveProduct as any).mockResolvedValue({ id: 'prod_100', status: 'approved' });

      const res = await request(app)
        .post('/api/v1/admin/marketplace/prod_100/approve')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Product approved successfully');
      expect(marketplaceService.approveProduct).toHaveBeenCalledWith('usr_admin_1', 'prod_100');
    });

    it('POST /api/v1/admin/marketplace/:id/reject rejects product with admin auth and feedback reason', async () => {
      (marketplaceService.rejectProduct as any).mockResolvedValue({ id: 'prod_100', status: 'rejected' });

      const res = await request(app)
        .post('/api/v1/admin/marketplace/prod_100/reject')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ reason: 'Image quality is poor; please re-upload clear photos.' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Product rejected successfully');
      expect(marketplaceService.rejectProduct).toHaveBeenCalledWith(
        'usr_admin_1',
        'prod_100',
        'Image quality is poor; please re-upload clear photos.'
      );
    });

    it('POST /api/v1/admin/marketplace/:id/takedown takes down live product with admin auth', async () => {
      (marketplaceService.takedownProduct as any).mockResolvedValue({ id: 'prod_100', status: 'archived' });

      const res = await request(app)
        .post('/api/v1/admin/marketplace/prod_100/takedown')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ reason: 'Item violates platform terms of service.' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Product taken down successfully');
      expect(marketplaceService.takedownProduct).toHaveBeenCalledWith(
        'usr_admin_1',
        'prod_100',
        'Item violates platform terms of service.'
      );
    });
  });
});
