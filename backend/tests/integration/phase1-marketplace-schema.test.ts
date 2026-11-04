import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { testDb, clearDatabase, createTestUser, createTestBusiness } from '../helpers/test-db';
import { Prisma } from '@prisma/client';

/**
 * Phase 1 QA Hunter Integration Tests: MarketplaceProduct Schema & Migration
 *
 * Verifies:
 * 1. Database table existence, column specifications, and defaults
 * 2. Enum type integrity (ProductType, ProductListingStatus) and adversarial invalid enum values
 * 3. PostgreSQL indexes including GIN index on JSONB attributes and Unique constraint on slug
 * 4. Foreign key integrity and ON DELETE CASCADE behavior
 * 5. Prisma Client CRUD operations, decimal precision, and array types
 * 6. Polymorphism (physical inventory vs service listing)
 * 7. JSON attribute querying capabilities
 * 8. Bidirectional relations between Business and MarketplaceProduct
 */
describe('Phase 1: Marketplace Product Database Schema & Prisma Client', () => {
  let testUserId: string;
  let testBusinessId: string;
  const testProductIds: string[] = [];

  beforeAll(async () => {
    // Dynamic baseline protection
    await clearDatabase();

    const user = await createTestUser('qa-hunter-phase1@e2e.com');
    testUserId = user.id;

    const business = await createTestBusiness(testUserId, 'QA Hunter Phase 1 Business');
    testBusinessId = business.id;
  }, 45000);

  afterAll(async () => {
    // Clean up created products specifically
    if (testProductIds.length > 0) {
      await testDb.marketplaceProduct.deleteMany({
        where: { id: { in: testProductIds } },
      });
    }

    await clearDatabase();
    await testDb.$disconnect();
  }, 45000);

  describe('1. Database Table & Information Schema Integrity', () => {
    test('marketplace_products table exists in public schema', async () => {
      const tables = await testDb.$queryRaw<Array<{ table_name: string }>>`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'marketplace_products'
      `;
      expect(tables.length).toBe(1);
      expect(tables[0].table_name).toBe('marketplace_products');
    });

    test('all required columns exist with expected PostgreSQL data types', async () => {
      const columns = await testDb.$queryRaw<Array<{ column_name: string; data_type: string; is_nullable: string; column_default: string | null }>>`
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'marketplace_products'
        ORDER BY ordinal_position
      `;

      const columnMap = new Map(columns.map(c => [c.column_name, c]));

      // Verify core columns
      expect(columnMap.has('id')).toBe(true);
      expect(columnMap.get('id')?.is_nullable).toBe('NO');

      expect(columnMap.has('business_id')).toBe(true);
      expect(columnMap.get('business_id')?.is_nullable).toBe('NO');

      expect(columnMap.has('name')).toBe(true);
      expect(columnMap.get('name')?.is_nullable).toBe('NO');

      expect(columnMap.has('slug')).toBe(true);
      expect(columnMap.get('slug')?.is_nullable).toBe('NO');

      expect(columnMap.has('category')).toBe(true);
      expect(columnMap.get('category')?.is_nullable).toBe('NO');

      expect(columnMap.has('description')).toBe(true);
      expect(columnMap.get('description')?.data_type).toBe('text');

      expect(columnMap.has('price')).toBe(true);
      expect(columnMap.get('price')?.data_type).toBe('numeric');

      expect(columnMap.has('compare_at_price')).toBe(true);
      expect(columnMap.get('compare_at_price')?.is_nullable).toBe('YES');

      expect(columnMap.has('currency')).toBe(true);
      expect(columnMap.get('currency')?.column_default).toContain('NGN');

      expect(columnMap.has('stock_quantity')).toBe(true);
      expect(columnMap.has('track_inventory')).toBe(true);
      expect(columnMap.get('track_inventory')?.column_default).toContain('true');

      expect(columnMap.has('attributes')).toBe(true);
      expect(columnMap.get('attributes')?.data_type).toBe('jsonb');

      expect(columnMap.has('images')).toBe(true);
      expect(columnMap.get('images')?.data_type).toBe('ARRAY');

      expect(columnMap.has('status')).toBe(true);
      expect(columnMap.has('rejection_reason')).toBe(true);
      expect(columnMap.has('approved_at')).toBe(true);
      expect(columnMap.has('approved_by')).toBe(true);
    });
  });

  describe('2. Postgres Enums Integrity', () => {
    test('ProductType enum exists with physical and service values', async () => {
      const enumValues = await testDb.$queryRaw<Array<{ enumlabel: string }>>`
        SELECT e.enumlabel
        FROM pg_enum e
        JOIN pg_type t ON e.enumtypid = t.oid
        WHERE t.typname = 'ProductType'
        ORDER BY e.enumsortorder
      `;
      const labels = enumValues.map(v => v.enumlabel);
      expect(labels).toEqual(['physical', 'service']);
    });

    test('ProductListingStatus enum exists with all lifecycle states', async () => {
      const enumValues = await testDb.$queryRaw<Array<{ enumlabel: string }>>`
        SELECT e.enumlabel
        FROM pg_enum e
        JOIN pg_type t ON e.enumtypid = t.oid
        WHERE t.typname = 'ProductListingStatus'
        ORDER BY e.enumsortorder
      `;
      const labels = enumValues.map(v => v.enumlabel);
      expect(labels).toEqual(['draft', 'pending_approval', 'approved', 'rejected', 'archived']);
    });

    test('adversarial: database rejects invalid ProductType values', async () => {
      await expect(
        testDb.$executeRawUnsafe(`
          INSERT INTO "marketplace_products" (
            id, business_id, name, slug, category, product_type, description, price, updated_at
          ) VALUES (
            gen_random_uuid(), '${testBusinessId}', 'Bad Product', 'bad-product-${Date.now()}', 'fashion', 'invalid_type'::"ProductType", 'Desc', 1000, NOW()
          );
        `)
      ).rejects.toThrow();
    });

    test('adversarial: database rejects invalid ProductListingStatus values', async () => {
      await expect(
        testDb.$executeRawUnsafe(`
          INSERT INTO "marketplace_products" (
            id, business_id, name, slug, category, description, price, status, updated_at
          ) VALUES (
            gen_random_uuid(), '${testBusinessId}', 'Bad Status', 'bad-status-${Date.now()}', 'fashion', 'Desc', 1000, 'published'::"ProductListingStatus", NOW()
          );
        `)
      ).rejects.toThrow();
    });
  });

  describe('3. Database Indexes & Constraints', () => {
    test('GIN index on attributes column exists', async () => {
      const indexes = await testDb.$queryRaw<Array<{ indexname: string; indexdef: string }>>`
        SELECT indexname, indexdef 
        FROM pg_indexes 
        WHERE tablename = 'marketplace_products' AND indexname = 'marketplace_products_attributes_idx'
      `;
      expect(indexes.length).toBe(1);
      expect(indexes[0].indexdef.toUpperCase()).toContain('GIN');
      expect(indexes[0].indexdef).toContain('attributes');
    });

    test('unique constraint on slug prevents duplicate slug insertion', async () => {
      const slug = `unique-test-slug-${Date.now()}`;

      const p1 = await testDb.marketplaceProduct.create({
        data: {
          businessId: testBusinessId,
          name: 'First Product',
          slug,
          category: 'fashion',
          description: 'A test product',
          price: new Prisma.Decimal('15000.00'),
        },
      });
      testProductIds.push(p1.id);

      // Attempt duplicate slug
      await expect(
        testDb.marketplaceProduct.create({
          data: {
            businessId: testBusinessId,
            name: 'Second Product With Same Slug',
            slug,
            category: 'fashion',
            description: 'Duplicate slug test',
            price: new Prisma.Decimal('20000.00'),
          },
        })
      ).rejects.toThrow();
    });

    test('business_id, category, and composite status indexes exist', async () => {
      const indexes = await testDb.$queryRaw<Array<{ indexname: string }>>`
        SELECT indexname 
        FROM pg_indexes 
        WHERE tablename = 'marketplace_products'
      `;
      const indexNames = new Set(indexes.map(i => i.indexname));

      expect(indexNames.has('marketplace_products_business_id_idx')).toBe(true);
      expect(indexNames.has('marketplace_products_category_idx')).toBe(true);
      expect(indexNames.has('marketplace_products_status_created_at_idx')).toBe(true);
    });
  });

  describe('4. Foreign Key & Cascading Deletion', () => {
    test('adversarial: cannot create product with non-existent businessId', async () => {
      const nonExistentBusinessId = '00000000-0000-0000-0000-000000000000';
      await expect(
        testDb.marketplaceProduct.create({
          data: {
            businessId: nonExistentBusinessId,
            name: 'Orphan Product',
            slug: `orphan-prod-${Date.now()}`,
            category: 'books',
            description: 'Should fail FK constraint',
            price: new Prisma.Decimal('5000.00'),
          },
        })
      ).rejects.toThrow();
    });

    test('deleting a business cascades and deletes associated marketplace products', async () => {
      // Create temporary business and product
      const tempBusiness = await createTestBusiness(testUserId, 'Temp Business For Cascade');
      const tempProduct = await testDb.marketplaceProduct.create({
        data: {
          businessId: tempBusiness.id,
          name: 'Temp Product For Cascade',
          slug: `temp-prod-cascade-${Date.now()}`,
          category: 'electronics',
          description: 'Will be deleted on business cascade',
          price: new Prisma.Decimal('35000.00'),
        },
      });

      // Verify product exists
      const foundBefore = await testDb.marketplaceProduct.findUnique({ where: { id: tempProduct.id } });
      expect(foundBefore).not.toBeNull();

      // Delete business
      await testDb.business.delete({ where: { id: tempBusiness.id } });

      // Verify product was cascaded
      const foundAfter = await testDb.marketplaceProduct.findUnique({ where: { id: tempProduct.id } });
      expect(foundAfter).toBeNull();
    });
  });

  describe('5. Polymorphism, JSON Attributes & Prisma CRUD', () => {
    test('creates and queries physical product with inventory and attributes', async () => {
      const physicalProduct = await testDb.marketplaceProduct.create({
        data: {
          businessId: testBusinessId,
          name: 'Classic Oxford Shoes',
          slug: `classic-oxford-shoes-${Date.now()}`,
          category: 'fashion',
          productType: 'physical',
          description: 'Handcrafted leather shoes',
          price: new Prisma.Decimal('45000.00'),
          compareAtPrice: new Prisma.Decimal('55000.00'),
          currency: 'NGN',
          stockQuantity: 12,
          trackInventory: true,
          attributes: {
            size: '43',
            color: 'Oxblood Brown',
            material: 'Calfskin Leather',
          },
          images: [
            'https://res.cloudinary.com/wallx/image/upload/shoes1.webp',
            'https://res.cloudinary.com/wallx/image/upload/shoes2.webp',
          ],
          contactWhatsapp: '+2348011223344',
          status: 'draft',
        },
      });
      testProductIds.push(physicalProduct.id);

      expect(physicalProduct.productType).toBe('physical');
      expect(physicalProduct.stockQuantity).toBe(12);
      expect(physicalProduct.trackInventory).toBe(true);
      expect(physicalProduct.price.toString()).toBe('45000');
      expect(physicalProduct.compareAtPrice?.toString()).toBe('55000');
      expect(physicalProduct.images.length).toBe(2);

      // JSON attribute retrieval
      const attrs = physicalProduct.attributes as Record<string, string>;
      expect(attrs.size).toBe('43');
      expect(attrs.material).toBe('Calfskin Leather');
    });

    test('creates and queries service product without inventory', async () => {
      const serviceProduct = await testDb.marketplaceProduct.create({
        data: {
          businessId: testBusinessId,
          name: 'Annual Corporate Tax Audit',
          slug: `corp-tax-audit-${Date.now()}`,
          category: 'services',
          productType: 'service',
          description: 'Comprehensive tax filing and representation for SMEs',
          price: new Prisma.Decimal('250000.00'),
          compareAtPrice: null,
          currency: 'NGN',
          stockQuantity: null,
          trackInventory: false,
          attributes: {
            serviceType: 'Tax Compliance & Audit',
            turnaroundDays: 5,
            includesFirsLiaison: true,
          },
          status: 'draft',
        },
      });
      testProductIds.push(serviceProduct.id);

      expect(serviceProduct.productType).toBe('service');
      expect(serviceProduct.stockQuantity).toBeNull();
      expect(serviceProduct.trackInventory).toBe(false);
      expect(serviceProduct.price.toString()).toBe('250000');
    });

    test('supports full status lifecycle transitions', async () => {
      const product = await testDb.marketplaceProduct.create({
        data: {
          businessId: testBusinessId,
          name: 'Lifecycle Test Product',
          slug: `lifecycle-prod-${Date.now()}`,
          category: 'books',
          description: 'Testing status transitions',
          price: new Prisma.Decimal('7500.00'),
          status: 'draft',
        },
      });
      testProductIds.push(product.id);

      // 1. Submit for approval
      const pending = await testDb.marketplaceProduct.update({
        where: { id: product.id },
        data: { status: 'pending_approval' },
      });
      expect(pending.status).toBe('pending_approval');

      // 2. Admin approval
      const approved = await testDb.marketplaceProduct.update({
        where: { id: product.id },
        data: {
          status: 'approved',
          approvedAt: new Date(),
          approvedBy: testUserId,
        },
      });
      expect(approved.status).toBe('approved');
      expect(approved.approvedBy).toBe(testUserId);
      expect(approved.approvedAt).toBeInstanceOf(Date);

      // 3. Admin rejection / takedown
      const rejected = await testDb.marketplaceProduct.update({
        where: { id: product.id },
        data: {
          status: 'rejected',
          rejectionReason: 'Product violates listing standards.',
        },
      });
      expect(rejected.status).toBe('rejected');
      expect(rejected.rejectionReason).toBe('Product violates listing standards.');

      // 4. Archive
      const archived = await testDb.marketplaceProduct.update({
        where: { id: product.id },
        data: { status: 'archived' },
      });
      expect(archived.status).toBe('archived');
    });

    test('bidirectional relation navigation between Business and MarketplaceProduct works', async () => {
      // Query Business with included marketplaceProducts
      const businessWithProducts = await testDb.business.findUnique({
        where: { id: testBusinessId },
        include: { marketplaceProducts: true },
      });
      expect(businessWithProducts).not.toBeNull();
      expect(Array.isArray(businessWithProducts?.marketplaceProducts)).toBe(true);
      expect(businessWithProducts!.marketplaceProducts.length).toBeGreaterThan(0);

      // Query MarketplaceProduct with included Business
      const firstProduct = businessWithProducts!.marketplaceProducts[0];
      const productWithBusiness = await testDb.marketplaceProduct.findUnique({
        where: { id: firstProduct.id },
        include: { business: true },
      });
      expect(productWithBusiness).not.toBeNull();
      expect(productWithBusiness?.business.id).toBe(testBusinessId);
      expect(productWithBusiness?.business.businessName).toBe('QA Hunter Phase 1 Business');
    });
  });
});
