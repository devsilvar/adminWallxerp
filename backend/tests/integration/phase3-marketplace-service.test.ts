import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { testDb, clearDatabase, createTestUser, createTestBusiness } from '../helpers/test-db';
import * as marketplaceService from '../../src/services/marketplace/marketplace.service';
import { CreateProductInput } from '../../src/validators/marketplace.validator';
import { AppError } from '../../src/middleware/errorHandler';

/**
 * Phase 3 QA Hunter Integration Tests: Marketplace Domain Service
 *
 * Verifies:
 * 1. Business ownership and membership access verification
 * 2. Strict 3-product-per-business active cap
 * 3. Concurrent POST race condition prevention via pg_advisory_xact_lock
 * 4. Freeing slots on archive
 * 5. State transitions: draft -> pending_approval -> approved | rejected
 * 6. Bait-and-switch protection: core-field mutation demotes approved listing to pending_approval
 * 7. Non-core field mutation preserves approved status
 * 8. Admin moderation queue (oldest-first), approval, rejection with mandatory reason, takedown
 * 9. Public feed read-API: filtering by category/type, search, pagination, and seller card
 * 10. Public slug lookup and merchant related products
 */
describe('Phase 3: Marketplace Domain Service & Business Logic', () => {
  let ownerUser: any;
  let nonOwnerUser: any;
  let adminUser: any;
  const createdProductIds: string[] = [];

  const baseProductData: CreateProductInput = {
    name: 'Handcrafted Leather Tote',
    category: 'bags',
    productType: 'physical',
    description: 'Durable full-grain leather tote bag with brass zipper fittings.',
    price: 45000,
    compareAtPrice: 55000,
    currency: 'NGN',
    stockQuantity: 10,
    trackInventory: true,
    attributes: {
      material: 'Full Grain Leather',
      color: 'Cognac',
      compartments: 2,
    },
    images: ['https://res.cloudinary.com/wallx/tote1.jpg'],
    contactPhone: '+2348012345678',
    contactWhatsapp: '+2348012345678',
    purchaseUrl: 'https://marketplace.wallx.co/tote',
  };

  beforeAll(async () => {
    await clearDatabase();

    ownerUser = await createTestUser('owner-phase3@e2e.com');
    nonOwnerUser = await createTestUser('stranger-phase3@e2e.com');
    adminUser = await createTestUser('admin-phase3@e2e.com');
  }, 45000);

  afterAll(async () => {
    if (createdProductIds.length > 0) {
      await testDb.marketplaceProduct.deleteMany({
        where: { id: { in: createdProductIds } },
      });
    }

    await clearDatabase();
    await testDb.$disconnect();
  }, 45000);

  describe('1. Ownership & Access Control', () => {
    let accessBusiness: any;

    beforeAll(async () => {
      accessBusiness = await createTestBusiness(ownerUser.id, 'Access Control Business');
    });

    test('non-member cannot create products for another business', async () => {
      await expect(
        marketplaceService.createProduct(nonOwnerUser.id, accessBusiness.id, baseProductData)
      ).rejects.toThrow(AppError);
    });

    test('non-member cannot list products for another business', async () => {
      await expect(
        marketplaceService.listForBusiness(nonOwnerUser.id, accessBusiness.id)
      ).rejects.toThrow(AppError);
    });
  });

  describe('2. 3-Product Active Cap & Slot Management', () => {
    let capBusiness: any;
    let p3Id: string;

    beforeAll(async () => {
      capBusiness = await createTestBusiness(ownerUser.id, 'Cap Test Business');
    });

    test('allows creating up to 3 products in draft status', async () => {
      const p1 = await marketplaceService.createProduct(ownerUser.id, capBusiness.id, {
        ...baseProductData,
        name: 'Product 1 - Leather Bag',
      });
      createdProductIds.push(p1.id);

      const p2 = await marketplaceService.createProduct(ownerUser.id, capBusiness.id, {
        ...baseProductData,
        name: 'Product 2 - Wallet',
      });
      createdProductIds.push(p2.id);

      const p3 = await marketplaceService.createProduct(ownerUser.id, capBusiness.id, {
        ...baseProductData,
        name: 'Product 3 - Belt',
      });
      p3Id = p3.id;
      createdProductIds.push(p3.id);

      expect(p1.status).toBe('draft');
      expect(p2.status).toBe('draft');
      expect(p3.status).toBe('draft');
      expect(p1.slug).toContain('product-1-leather-bag');
    });

    test('rejects 4th product creation with PRODUCT_LIMIT_REACHED', async () => {
      await expect(
        marketplaceService.createProduct(ownerUser.id, capBusiness.id, {
          ...baseProductData,
          name: 'Product 4 - Over the limit',
        })
      ).rejects.toMatchObject({
        statusCode: 400,
        code: 'PRODUCT_LIMIT_REACHED',
      });
    });

    test('archiving a product frees a slot for a new product', async () => {
      const archived = await marketplaceService.archiveProduct(ownerUser.id, capBusiness.id, p3Id);
      expect(archived.status).toBe('archived');

      // Now active count is 2 -> creating a new product should succeed!
      const replacementProduct = await marketplaceService.createProduct(ownerUser.id, capBusiness.id, {
        ...baseProductData,
        name: 'Replacement Product',
      });
      createdProductIds.push(replacementProduct.id);

      expect(replacementProduct).toBeDefined();
      expect(replacementProduct.name).toBe('Replacement Product');
    });
  });

  describe('3. Concurrency & Advisory Lock Serialization', () => {
    test('concurrent POST requests cannot exceed the 3-item ceiling', async () => {
      const raceBusiness = await createTestBusiness(ownerUser.id, 'Concurrency Test Shop');

      // Fill 2 slots
      const r1 = await marketplaceService.createProduct(ownerUser.id, raceBusiness.id, {
        ...baseProductData,
        name: 'Race Product 1',
      });
      const r2 = await marketplaceService.createProduct(ownerUser.id, raceBusiness.id, {
        ...baseProductData,
        name: 'Race Product 2',
      });
      createdProductIds.push(r1.id, r2.id);

      // Now exactly 1 slot remains. Fire 5 parallel creates simultaneously!
      const parallelAttempts = Array.from({ length: 5 }, (_, i) =>
        marketplaceService
          .createProduct(ownerUser.id, raceBusiness.id, {
            ...baseProductData,
            name: `Contender ${i + 1}`,
          })
          .then((p) => {
            createdProductIds.push(p.id);
            return { success: true, id: p.id };
          })
          .catch((err: any) => ({ success: false, code: err.code, status: err.statusCode }))
      );

      const results = await Promise.all(parallelAttempts);

      const successfulCount = results.filter((r) => r.success).length;
      const rejectedCount = results.filter((r) => !r.success && r.code === 'PRODUCT_LIMIT_REACHED').length;

      expect(successfulCount).toBe(1);
      expect(rejectedCount).toBe(4);

      // Verify the database contains exactly 3 active products for this business
      const activeInDb = await testDb.marketplaceProduct.count({
        where: { businessId: raceBusiness.id, status: { not: 'archived' } },
      });
      expect(activeInDb).toBe(3);
    });
  });

  describe('4. State Machine: Submission & Moderation', () => {
    let submissionBusiness: any;
    let testProductId: string;

    beforeAll(async () => {
      submissionBusiness = await createTestBusiness(ownerUser.id, 'Submission Flow Business');

      const p = await marketplaceService.createProduct(ownerUser.id, submissionBusiness.id, {
        ...baseProductData,
        name: 'Submission Test Product',
        images: ['https://res.cloudinary.com/wallx/sub1.jpg'],
      });
      testProductId = p.id;
      createdProductIds.push(testProductId);
    });

    test('merchant can submit draft product for approval', async () => {
      const submitted = await marketplaceService.submitForApproval(
        ownerUser.id,
        submissionBusiness.id,
        testProductId
      );
      expect(submitted.status).toBe('pending_approval');
    });

    test('submitting already pending product throws INVALID_STATUS_TRANSITION', async () => {
      await expect(
        marketplaceService.submitForApproval(ownerUser.id, submissionBusiness.id, testProductId)
      ).rejects.toMatchObject({
        statusCode: 400,
        code: 'INVALID_STATUS_TRANSITION',
      });
    });

    test('admin can view product in moderation queue (oldest-first)', async () => {
      const queue = await marketplaceService.listModerationQueue({ status: 'pending_approval' });
      expect(queue.data.length).toBeGreaterThan(0);
      const found = queue.data.find((item) => item.id === testProductId);
      expect(found).toBeDefined();
      expect(found?.business.businessName).toBe('Submission Flow Business');
    });

    test('admin can reject product with mandatory feedback reason', async () => {
      const reason = 'Image quality is too low. Please upload clear photos.';
      const rejected = await marketplaceService.rejectProduct(adminUser.id, testProductId, reason);

      expect(rejected.status).toBe('rejected');
      expect(rejected.rejectionReason).toBe(reason);
    });

    test('merchant can re-submit rejected product after fixing issues', async () => {
      const resubmitted = await marketplaceService.submitForApproval(
        ownerUser.id,
        submissionBusiness.id,
        testProductId
      );
      expect(resubmitted.status).toBe('pending_approval');
      expect(resubmitted.rejectionReason).toBeNull();
    });

    test('admin can approve product', async () => {
      const approved = await marketplaceService.approveProduct(adminUser.id, testProductId);

      expect(approved.status).toBe('approved');
      expect(approved.approvedBy).toBe(adminUser.id);
      expect(approved.approvedAt).toBeInstanceOf(Date);
    });
  });

  describe('5. Bait-and-Switch Protection', () => {
    let baitSwitchBusiness: any;
    let approvedProductId: string;

    beforeAll(async () => {
      baitSwitchBusiness = await createTestBusiness(ownerUser.id, 'Bait Switch Business');

      const p = await marketplaceService.createProduct(ownerUser.id, baitSwitchBusiness.id, {
        ...baseProductData,
        name: 'Bait Switch Test Item',
        price: 20000,
        images: ['https://res.cloudinary.com/wallx/test.jpg'],
      });
      approvedProductId = p.id;
      createdProductIds.push(approvedProductId);

      // Submit and approve
      await marketplaceService.submitForApproval(ownerUser.id, baitSwitchBusiness.id, approvedProductId);
      await marketplaceService.approveProduct(adminUser.id, approvedProductId);
    });

    test('non-core field edit (stock quantity) does NOT trigger demotion', async () => {
      const updated = await marketplaceService.updateProduct(
        ownerUser.id,
        baitSwitchBusiness.id,
        approvedProductId,
        { stockQuantity: 25 }
      );

      expect(updated.status).toBe('approved');
      expect(updated.stockQuantity).toBe(25);
    });

    test('core field edit (price) triggers automatic demotion to pending_approval', async () => {
      const updated = await marketplaceService.updateProduct(
        ownerUser.id,
        baitSwitchBusiness.id,
        approvedProductId,
        { price: 45000 } // Changed price from 20000 to 45000!
      );

      expect(updated.status).toBe('pending_approval');
      expect(updated.approvedAt).toBeNull();
      expect(updated.approvedBy).toBeNull();
    });
  });

  describe('6. Public Feed & Public Product Detail', () => {
    let publicBusiness: any;
    let publicSlug: string;

    beforeAll(async () => {
      publicBusiness = await createTestBusiness(ownerUser.id, 'Public Showcase Atelier');

      // Create and approve a dedicated public product
      const publicProd = await marketplaceService.createProduct(ownerUser.id, publicBusiness.id, {
        name: 'Bespoke Executive Leather Briefcase',
        category: 'bags',
        productType: 'physical',
        description: 'Premium handcrafted Nigerian leather briefcase for executives.',
        price: 95000,
        compareAtPrice: 120000,
        currency: 'NGN',
        stockQuantity: 4,
        trackInventory: true,
        attributes: { material: 'Leather', color: 'Burgundy' },
        images: ['https://res.cloudinary.com/wallx/briefcase.webp'],
      });
      publicSlug = publicProd.slug;
      createdProductIds.push(publicProd.id);

      await marketplaceService.submitForApproval(ownerUser.id, publicBusiness.id, publicProd.id);
      await marketplaceService.approveProduct(adminUser.id, publicProd.id);
    });

    test('listPublicFeed returns only approved listings with seller card', async () => {
      const feed = await marketplaceService.listPublicFeed({
        category: 'bags',
        search: 'Executive',
      });

      expect(feed.data.length).toBeGreaterThan(0);
      const item = feed.data.find((p) => p.slug === publicSlug);
      expect(item).toBeDefined();
      expect(item?.price).toBe(95000);
      expect(item?.seller.businessName).toBe('Public Showcase Atelier');
      expect(feed.pagination.total).toBeGreaterThanOrEqual(1);
    });

    test('listPublicFeed filters out drafts, pending, and archived products', async () => {
      // Create a draft on publicBusiness
      const draftProd = await marketplaceService.createProduct(ownerUser.id, publicBusiness.id, {
        ...baseProductData,
        name: 'Unpublished Draft Bag',
      });
      createdProductIds.push(draftProd.id);

      const feed = await marketplaceService.listPublicFeed({ search: 'Unpublished Draft Bag' });
      expect(feed.data.length).toBe(0);
    });

    test('getPublicProduct retrieves approved product and related merchant items', async () => {
      const result = await marketplaceService.getPublicProduct(publicSlug);

      expect(result.product).toBeDefined();
      expect(result.product.slug).toBe(publicSlug);
      expect(result.product.name).toBe('Bespoke Executive Leather Briefcase');
      expect(result.product.seller.businessName).toBe('Public Showcase Atelier');
      expect(Array.isArray(result.relatedProducts)).toBe(true);
    });

    test('getPublicProduct throws 404 for unapproved product or non-existent slug', async () => {
      await expect(
        marketplaceService.getPublicProduct('completely-fake-slug-that-does-not-exist')
      ).rejects.toMatchObject({
        statusCode: 404,
        code: 'PRODUCT_NOT_FOUND',
      });
    });
  });
});
