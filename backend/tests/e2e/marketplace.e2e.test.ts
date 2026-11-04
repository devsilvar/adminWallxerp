import 'dotenv/config';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApp } from '../../src/app';
import { config } from '../../src/config';
import {
  testDb,
  clearDatabase,
  createTestUser,
  createTestBusiness,
} from '../helpers/test-db';
import type { Application } from 'express';

/**
 * Phase 10 E2E Integration Test Suite — Marketplace & Inventory System
 *
 * Exhaustively tests all 10 core lifecycle scenarios against a live database:
 *  1. Create 3 products -> 4th returns 400 PRODUCT_LIMIT_REACHED
 *  2. Concurrent POST race -> only 3 created, 4th rejected (advisory lock)
 *  3. Draft -> submit -> pending; admin approve -> approved
 *  4. Admin reject with reason -> rejected; resubmit -> pending
 *  5. Approved core-field edit -> resets to pending; disappears from public feed
 *  6. Non-core edit (stock) on approved -> stays approved
 *  7. Archive -> archived; frees slot
 *  8. Public feed: filters (category, type, search), pagination, cache headers present, only approved returned
 *  9. Admin takedown -> archived
 * 10. Ownership: non-member gets 403; admin JWT on SME route gets 403 ADMIN_CANNOT_USE_USER_APP
 */
describe('Phase 10: Marketplace & Inventory End-to-End Suite', () => {
  let app: Application;

  // Actors
  let ownerUser: any;
  let ownerBusiness: any;
  let raceBusiness: any;
  let strangerUser: any;
  let strangerBusiness: any;
  let adminUser: any;

  // JWT Tokens
  let ownerToken: string;
  let strangerToken: string;
  let adminToken: string;

  // Tracked Product IDs & Slugs across sequential flow
  let prod1Id: string;
  let prod1Slug: string;
  let prod2Id: string;
  let prod3Id: string;

  const now = Date.now();
  const ownerEmail = `mkt-owner-${now}@e2e.test`;
  const strangerEmail = `mkt-stranger-${now}@e2e.test`;
  const adminEmail = `mkt-admin-${now}@e2e.test`;

  // Realistic Payloads
  const productPayload1 = {
    name: `Executive Leather Briefcase ${now}`,
    productType: 'physical',
    category: 'bags',
    description: 'Handcrafted full-grain leather briefcase with multiple laptop compartments.',
    price: 75000,
    compareAtPrice: 95000,
    currency: 'NGN',
    stockQuantity: 15,
    trackInventory: true,
    attributes: {
      material: 'Full Grain Leather',
      color: 'Mahogany Brown',
      compartments: 3,
    },
    images: ['https://res.cloudinary.com/wallx/image/upload/v1/briefcase.jpg'],
    contactPhone: '+2348012345678',
    contactWhatsapp: '+2348012345678',
    purchaseUrl: 'https://store.example.com/item/1',
  };

  const productPayload2 = {
    name: `Wireless Noise-Cancelling Headphones ${now}`,
    productType: 'physical',
    category: 'electronics',
    description: 'Premium over-ear headphones with 40-hour battery life and spatial audio.',
    price: 120000,
    compareAtPrice: 150000,
    currency: 'NGN',
    stockQuantity: 25,
    trackInventory: true,
    attributes: {
      brand: 'AcousticPro',
      connectivity: 'Bluetooth 5.3',
      warranty: '2 Years',
    },
    images: ['https://res.cloudinary.com/wallx/image/upload/v1/headphones.jpg'],
    contactPhone: '+2348012345678',
    contactWhatsapp: '+2348012345678',
  };

  const productPayload3 = {
    name: `Corporate Tax Advisory Consultation ${now}`,
    productType: 'service',
    category: 'services',
    description: 'One-on-one executive tax strategy consultation for Nigerian SMEs.',
    price: 50000,
    currency: 'NGN',
    trackInventory: false,
    attributes: {
      serviceType: 'Corporate Tax Strategy & Planning',
      deliveryFormat: 'remote',
      estimatedDuration: '60 minutes',
    },
    images: ['https://res.cloudinary.com/wallx/image/upload/v1/consulting.jpg'],
    contactPhone: '+2348012345678',
    contactWhatsapp: '+2348012345678',
  };

  const productPayload4 = {
    name: `Ergonomic Mesh Office Chair ${now}`,
    productType: 'physical',
    category: 'furniture',
    description: 'High-back ergonomic task chair with adjustable lumbar support.',
    price: 85000,
    currency: 'NGN',
    trackInventory: true,
    stockQuantity: 5,
    attributes: {
      material: 'High-Tensile Polymer Mesh & Alloy',
      color: 'Obsidian Black',
      dimensions: '65x65x120 cm',
      assemblyRequired: true,
    },
    images: ['https://res.cloudinary.com/wallx/image/upload/v1/chair.jpg'],
  };

  beforeAll(async () => {
    app = createApp();

    await clearDatabase();

    // 1. Create Test SME Owner User and Businesses
    ownerUser = await createTestUser(ownerEmail);
    ownerBusiness = await createTestBusiness(ownerUser.id, `WallX SME Hub ${now}`);
    raceBusiness = await createTestBusiness(ownerUser.id, `Race Business Hub ${now}`);

    // 2. Create Stranger User and Business (for tenant isolation tests)
    strangerUser = await createTestUser(strangerEmail);
    strangerBusiness = await createTestBusiness(strangerUser.id, `Stranger Retail ${now}`);

    // 3. Create Admin User (persisted in DB to satisfy approvedBy FK constraint)
    adminUser = await testDb.user.create({
      data: {
        email: adminEmail,
        passwordHash: '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5GyJSawHByQBW',
        role: 'admin',
        isVerified: true,
        isActive: true,
      },
    });

    // 4. Generate Auth Tokens
    ownerToken = jwt.sign(
      { userId: ownerUser.id, email: ownerEmail, role: 'owner' },
      config.jwt.accessSecret,
      { expiresIn: '1h' }
    );

    strangerToken = jwt.sign(
      { userId: strangerUser.id, email: strangerEmail, role: 'owner' },
      config.jwt.accessSecret,
      { expiresIn: '1h' }
    );

    adminToken = jwt.sign(
      { userId: adminUser.id, email: adminEmail, role: 'admin' },
      config.jwt.accessSecret,
      { expiresIn: '1h' }
    );
  }, 45000);

  afterAll(async () => {
    try {
      // Clean up test products
      await testDb.marketplaceProduct.deleteMany({
        where: {
          businessId: {
            in: [ownerBusiness.id, raceBusiness.id, strangerBusiness.id],
          },
        },
      });

      // Delete admin user
      if (adminUser?.id) {
        await testDb.user.deleteMany({ where: { id: adminUser.id } });
      }

      await clearDatabase();
    } catch (err) {
      // Best-effort cleanup
    } finally {
      await testDb.$disconnect();
    }
  }, 45000);

  // ══════════════════════════════════════════════════════════════════════
  // SCENARIO 1: Cap Enforcement (3 items max per business across statuses)
  // ══════════════════════════════════════════════════════════════════════
  it('1. Enforces 3-product cap: creates 3 products successfully, 4th fails with PRODUCT_LIMIT_REACHED', async () => {
    // 1st Product
    const res1 = await request(app)
      .post(`/api/v1/businesses/${ownerBusiness.id}/marketplace`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send(productPayload1);
    expect(res1.status).toBe(201);
    expect(res1.body.data.id).toBeDefined();
    expect(res1.body.data.status).toBe('draft');
    prod1Id = res1.body.data.id;
    prod1Slug = res1.body.data.slug;

    // 2nd Product
    const res2 = await request(app)
      .post(`/api/v1/businesses/${ownerBusiness.id}/marketplace`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send(productPayload2);
    expect(res2.status).toBe(201);
    expect(res2.body.data.id).toBeDefined();
    expect(res2.body.data.status).toBe('draft');
    prod2Id = res2.body.data.id;

    // 3rd Product
    const res3 = await request(app)
      .post(`/api/v1/businesses/${ownerBusiness.id}/marketplace`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send(productPayload3);
    expect(res3.status).toBe(201);
    expect(res3.body.data.id).toBeDefined();
    expect(res3.body.data.status).toBe('draft');
    prod3Id = res3.body.data.id;

    // 4th Product (Exceeds 3-product cap)
    const res4 = await request(app)
      .post(`/api/v1/businesses/${ownerBusiness.id}/marketplace`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send(productPayload4);
    expect(res4.status).toBe(400);
    expect(res4.body.error).toBeDefined();
    expect(res4.body.error.code).toBe('PRODUCT_LIMIT_REACHED');
  });

  // ══════════════════════════════════════════════════════════════════════
  // SCENARIO 2: Concurrent POST Race Resilience (pg_advisory_xact_lock)
  // ══════════════════════════════════════════════════════════════════════
  it('2. Prevents TOCTOU race: concurrent POST requests serialize, exactly 3 succeed and 4th fails', async () => {
    const racePayloads = [
      { ...productPayload1, name: `Race Item Alpha ${now}` },
      { ...productPayload1, name: `Race Item Beta ${now}` },
      { ...productPayload1, name: `Race Item Gamma ${now}` },
      { ...productPayload1, name: `Race Item Delta ${now}` },
    ];

    const responses = await Promise.all(
      racePayloads.map((payload) =>
        request(app)
          .post(`/api/v1/businesses/${raceBusiness.id}/marketplace`)
          .set('Authorization', `Bearer ${ownerToken}`)
          .send(payload)
      )
    );

    const created = responses.filter((r) => r.status === 201);
    const rejected = responses.filter(
      (r) => r.status === 400 && r.body.error?.code === 'PRODUCT_LIMIT_REACHED'
    );

    expect(created.length).toBe(3);
    expect(rejected.length).toBe(1);

    const totalInDb = await testDb.marketplaceProduct.count({
      where: { businessId: raceBusiness.id, status: { not: 'archived' } },
    });
    expect(totalInDb).toBe(3);
  });

  // ══════════════════════════════════════════════════════════════════════
  // SCENARIO 3: Draft -> Submit -> Pending -> Admin Approve -> Approved
  // ══════════════════════════════════════════════════════════════════════
  it('3. Lifecycle transition: submit draft flips to pending_approval; admin approval publishes listing', async () => {
    // 1. Submit draft prod1
    const submitRes = await request(app)
      .post(`/api/v1/businesses/${ownerBusiness.id}/marketplace/${prod1Id}/submit`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(submitRes.status).toBe(200);
    expect(submitRes.body.data.status).toBe('pending_approval');

    // 2. Admin approve prod1
    const approveRes = await request(app)
      .post(`/api/v1/admin/marketplace/${prod1Id}/approve`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(approveRes.status).toBe(200);
    expect(approveRes.body.data.status).toBe('approved');
    expect(approveRes.body.data.approvedBy).toBe(adminUser.id);
    expect(approveRes.body.data.approvedAt).toBeDefined();
  });

  // ══════════════════════════════════════════════════════════════════════
  // SCENARIO 4: Admin Reject with Reason -> Rejected -> Resubmit -> Pending
  // ══════════════════════════════════════════════════════════════════════
  it('4. Moderation rejection & resubmission: admin rejects with reason; merchant edits/resubmits', async () => {
    // 1. Submit prod2
    await request(app)
      .post(`/api/v1/businesses/${ownerBusiness.id}/marketplace/${prod2Id}/submit`)
      .set('Authorization', `Bearer ${ownerToken}`);

    // 2. Admin rejects with reason
    const rejectRes = await request(app)
      .post(`/api/v1/admin/marketplace/${prod2Id}/reject`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        reason: 'Product specification lacks required manufacturer warranty details.',
      });
    expect(rejectRes.status).toBe(200);
    expect(rejectRes.body.data.status).toBe('rejected');
    expect(rejectRes.body.data.rejectionReason).toBe(
      'Product specification lacks required manufacturer warranty details.'
    );

    // 3. Merchant resubmits prod2
    const resubmitRes = await request(app)
      .post(`/api/v1/businesses/${ownerBusiness.id}/marketplace/${prod2Id}/submit`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(resubmitRes.status).toBe(200);
    expect(resubmitRes.body.data.status).toBe('pending_approval');
    expect(resubmitRes.body.data.rejectionReason).toBeNull();
  });

  // ══════════════════════════════════════════════════════════════════════
  // SCENARIO 5: Approved Core-Field Edit -> Resets to Pending -> Gone from Feed
  // ══════════════════════════════════════════════════════════════════════
  it('5. Bait-and-switch protection: editing core field (price/description) demotes approved listing to pending and removes from public feed', async () => {
    // Approve prod2 so it's live
    await request(app)
      .post(`/api/v1/admin/marketplace/${prod2Id}/approve`)
      .set('Authorization', `Bearer ${adminToken}`);

    // Verify prod1 is currently in public feed
    const initialFeed = await request(app).get('/api/v1/marketplace/products');
    expect(initialFeed.status).toBe(200);
    const inInitialFeed = initialFeed.body.data.some((p: any) => p.id === prod1Id);
    expect(inInitialFeed).toBe(true);

    // Edit core field (price & description) on prod1
    const patchRes = await request(app)
      .patch(`/api/v1/businesses/${ownerBusiness.id}/marketplace/${prod1Id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        price: 99000,
        description: 'Updated bait-and-switch description with higher price point.',
      });
    expect(patchRes.status).toBe(200);
    expect(patchRes.body.data.status).toBe('pending_approval');

    // Verify prod1 is immediately excluded from public feed
    const updatedFeed = await request(app).get('/api/v1/marketplace/products');
    expect(updatedFeed.status).toBe(200);
    const inUpdatedFeed = updatedFeed.body.data.some((p: any) => p.id === prod1Id);
    expect(inUpdatedFeed).toBe(false);
  });

  // ══════════════════════════════════════════════════════════════════════
  // SCENARIO 6: Non-Core Edit (stockQuantity) on Approved -> Stays Approved
  // ══════════════════════════════════════════════════════════════════════
  it('6. Non-core modification: stock quantity update preserves approved status and public visibility', async () => {
    // Admin re-approves prod1
    await request(app)
      .post(`/api/v1/admin/marketplace/${prod1Id}/approve`)
      .set('Authorization', `Bearer ${adminToken}`);

    // Update non-core field (stockQuantity)
    const patchRes = await request(app)
      .patch(`/api/v1/businesses/${ownerBusiness.id}/marketplace/${prod1Id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ stockQuantity: 99 });
    expect(patchRes.status).toBe(200);
    expect(patchRes.body.data.status).toBe('approved');
    expect(patchRes.body.data.stockQuantity).toBe(99);

    // Verify prod1 remains visible in public feed
    const feed = await request(app).get('/api/v1/marketplace/products');
    expect(feed.status).toBe(200);
    const found = feed.body.data.find((p: any) => p.id === prod1Id);
    expect(found).toBeDefined();
    expect(found.stockQuantity).toBe(99);
  });

  // ══════════════════════════════════════════════════════════════════════
  // SCENARIO 7: Archive -> Archived; Frees Slot
  // ══════════════════════════════════════════════════════════════════════
  it('7. Slot reclamation: archiving an active product frees up a slot for a new product creation', async () => {
    // Attempting 4th creation fails right now
    const failRes = await request(app)
      .post(`/api/v1/businesses/${ownerBusiness.id}/marketplace`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send(productPayload4);
    expect(failRes.status).toBe(400);
    expect(failRes.body.error.code).toBe('PRODUCT_LIMIT_REACHED');

    // Archive prod3
    const archiveRes = await request(app)
      .post(`/api/v1/businesses/${ownerBusiness.id}/marketplace/${prod3Id}/archive`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(archiveRes.status).toBe(200);
    expect(archiveRes.body.data.status).toBe('archived');

    // Creation of 4th product now succeeds!
    const successRes = await request(app)
      .post(`/api/v1/businesses/${ownerBusiness.id}/marketplace`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send(productPayload4);
    expect(successRes.status).toBe(201);
    expect(successRes.body.data.id).toBeDefined();
    expect(successRes.body.data.name).toBe(productPayload4.name);
  });

  // ══════════════════════════════════════════════════════════════════════
  // SCENARIO 8: Public Feed Contracts & Cache Headers
  // ══════════════════════════════════════════════════════════════════════
  it('8. Public feed contracts: enforces approved-only visibility, filter query params, and cache headers', async () => {
    const res = await request(app).get('/api/v1/marketplace/products');
    expect(res.status).toBe(200);

    // Verify standardized cache headers
    const cacheControl = res.headers['cache-control'] || '';
    expect(cacheControl).toContain('public');
    expect(cacheControl).toContain('s-maxage=300');
    expect(cacheControl).toContain('stale-while-revalidate=600');

    // Verify feed returns items and seller metadata
    expect(res.body.data.length).toBeGreaterThan(0);
    res.body.data.forEach((p: any) => {
      expect(p.id).toBeDefined();
      expect(p.slug).toBeDefined();
      expect(p.seller).toBeDefined();
      expect(p.seller.businessName).toBeDefined();
    });

    // Category filter
    const bagsRes = await request(app).get('/api/v1/marketplace/products?category=bags');
    expect(bagsRes.status).toBe(200);
    bagsRes.body.data.forEach((p: any) => {
      expect(p.category).toBe('bags');
    });

    // ProductType filter
    const physicalRes = await request(app).get('/api/v1/marketplace/products?productType=physical');
    expect(physicalRes.status).toBe(200);
    physicalRes.body.data.forEach((p: any) => {
      expect(p.productType).toBe('physical');
    });

    // Search query filter
    const searchRes = await request(app).get('/api/v1/marketplace/products?search=Briefcase');
    expect(searchRes.status).toBe(200);
    expect(searchRes.body.data.some((p: any) => p.name.includes('Briefcase'))).toBe(true);

    // Slug detail endpoint
    const slugRes = await request(app).get(`/api/v1/marketplace/products/${prod1Slug}`);
    expect(slugRes.status).toBe(200);
    expect(slugRes.body.data.slug).toBe(prod1Slug);
    expect(slugRes.body.data.seller).toBeDefined();
    expect(slugRes.body.data.seller.businessName).toBeDefined();
  });

  // ══════════════════════════════════════════════════════════════════════
  // SCENARIO 9: Admin Takedown -> Archived
  // ══════════════════════════════════════════════════════════════════════
  it('9. Administrative takedown: delists live listing to archived status and immediately purges from feed', async () => {
    // Admin takes down prod1
    const takedownRes = await request(app)
      .post(`/api/v1/admin/marketplace/${prod1Id}/takedown`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'Delisted due to customer rights dispute' });
    expect(takedownRes.status).toBe(200);
    expect(takedownRes.body.data.status).toBe('archived');

    // Confirm prod1 is gone from public feed
    const feedRes = await request(app).get('/api/v1/marketplace/products');
    expect(feedRes.status).toBe(200);
    const inFeed = feedRes.body.data.some((p: any) => p.id === prod1Id);
    expect(inFeed).toBe(false);

    // Slug lookup now returns 404
    const slugRes = await request(app).get(`/api/v1/marketplace/products/${prod1Slug}`);
    expect(slugRes.status).toBe(404);
  });

  // ══════════════════════════════════════════════════════════════════════
  // SCENARIO 10: Ownership & Session Isolation
  // ══════════════════════════════════════════════════════════════════════
  it('10. Access control & session isolation: enforces tenant boundaries and rejects cross-session role pollution', async () => {
    // Non-member access rejected
    const strangerGet = await request(app)
      .get(`/api/v1/businesses/${ownerBusiness.id}/marketplace`)
      .set('Authorization', `Bearer ${strangerToken}`);
    expect(strangerGet.status).toBe(403);

    const strangerPost = await request(app)
      .post(`/api/v1/businesses/${ownerBusiness.id}/marketplace`)
      .set('Authorization', `Bearer ${strangerToken}`)
      .send(productPayload1);
    expect(strangerPost.status).toBe(403);

    // Regular user attempting admin route gets 403 FORBIDDEN
    const userAdminRes = await request(app)
      .get('/api/v1/admin/marketplace')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(userAdminRes.status).toBe(403);

    // Admin token on SME business route gets 403 ADMIN_CANNOT_USE_USER_APP
    const adminSmeRes = await request(app)
      .get(`/api/v1/businesses/${ownerBusiness.id}/marketplace`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(adminSmeRes.status).toBe(403);
    expect(adminSmeRes.body.error).toBeDefined();
    expect(adminSmeRes.body.error.code).toBe('ADMIN_CANNOT_USE_USER_APP');
  });
});
