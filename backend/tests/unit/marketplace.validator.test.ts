import { describe, test, expect } from '@jest/globals';
import {
  createProductSchema,
  updateProductSchema,
  submitProductSchema,
  listProductsQuerySchema,
  approveSchema,
  rejectSchema,
  takedownSchema,
  MARKETPLACE_CATEGORIES,
} from '../../src/validators/marketplace.validator';

/**
 * Phase 2 QA Hunter Unit Tests: Marketplace Zod Validators
 *
 * Verifies:
 * 1. Discriminated union validation across all 8 product categories
 * 2. Category-specific attribute schemas and path-accurate error reporting
 * 3. Polymorphism constraints: physical goods vs service listings
 * 4. Price & compare-at price sanity validation
 * 5. Media limits (max 3 images, valid URLs)
 * 6. Partial update validation with category-attribute synchronization
 * 7. Query parameter coercion and pagination defaults
 * 8. Admin moderation schemas (mandatory reject/takedown reasons <= 500 chars)
 */
describe('Phase 2: Marketplace Zod Validators', () => {
  const validBaseProduct = {
    name: 'Luxury Velvet Armchair',
    productType: 'physical',
    description: 'High quality handcrafted velvet armchair suitable for modern living rooms.',
    price: 85000,
    compareAtPrice: 100000,
    currency: 'NGN',
    stockQuantity: 5,
    trackInventory: true,
    images: [
      'https://res.cloudinary.com/wallx/image/upload/chair1.jpg',
      'https://res.cloudinary.com/wallx/image/upload/chair2.jpg',
    ],
    contactPhone: '+2348012345678',
    contactWhatsapp: '+2348012345678',
    purchaseUrl: 'https://marketplace.wallx.co/item/armchair',
  };

  describe('1. Discriminated Union & Category Attribute Validation', () => {
    test('fashion: valid when size and color are supplied', () => {
      const result = createProductSchema.safeParse({
        ...validBaseProduct,
        category: 'fashion',
        attributes: {
          size: 'XL',
          color: 'Midnight Blue',
          material: 'Cotton',
          gender: 'unisex',
        },
      });

      expect(result.success).toBe(true);
    });

    test('fashion: fails when size is missing with precise path', () => {
      const result = createProductSchema.safeParse({
        ...validBaseProduct,
        category: 'fashion',
        attributes: {
          color: 'Midnight Blue',
        },
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        const sizeError = result.error.issues.find(i => i.path.join('.') === 'attributes.size');
        expect(sizeError).toBeDefined();
        expect(sizeError?.message).toContain('size is required');
      }
    });

    test('bags: valid when material is supplied', () => {
      const result = createProductSchema.safeParse({
        ...validBaseProduct,
        category: 'bags',
        attributes: {
          material: 'Full-Grain Italian Leather',
          color: 'Tan Brown',
          compartments: 3,
        },
      });

      expect(result.success).toBe(true);
    });

    test('bags: fails when material is missing', () => {
      const result = createProductSchema.safeParse({
        ...validBaseProduct,
        category: 'bags',
        attributes: {
          color: 'Tan Brown',
        },
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        const matError = result.error.issues.find(i => i.path.join('.') === 'attributes.material');
        expect(matError).toBeDefined();
      }
    });

    test('books: valid when author is supplied', () => {
      const result = createProductSchema.safeParse({
        ...validBaseProduct,
        category: 'books',
        attributes: {
          author: 'Chimamanda Ngozi Adichie',
          publisher: 'Fourth Estate',
          binding: 'hardcover',
          pages: 448,
          language: 'English',
        },
      });

      expect(result.success).toBe(true);
    });

    test('books: fails when author is missing', () => {
      const result = createProductSchema.safeParse({
        ...validBaseProduct,
        category: 'books',
        attributes: {
          pages: 300,
        },
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        const authorError = result.error.issues.find(i => i.path.join('.') === 'attributes.author');
        expect(authorError).toBeDefined();
      }
    });

    test('furniture: valid when primary material is supplied', () => {
      const result = createProductSchema.safeParse({
        ...validBaseProduct,
        category: 'furniture',
        attributes: {
          material: 'Solid Mahogany Wood',
          dimensions: '120cm x 60cm x 75cm',
          color: 'Dark Walnut',
          assemblyRequired: false,
        },
      });

      expect(result.success).toBe(true);
    });

    test('furniture: fails when material is missing', () => {
      const result = createProductSchema.safeParse({
        ...validBaseProduct,
        category: 'furniture',
        attributes: {
          color: 'Dark Walnut',
        },
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        const matError = result.error.issues.find(i => i.path.join('.') === 'attributes.material');
        expect(matError).toBeDefined();
      }
    });

    test('electronics: valid when brand is supplied', () => {
      const result = createProductSchema.safeParse({
        ...validBaseProduct,
        category: 'electronics',
        attributes: {
          brand: 'Sony',
          model: 'WH-1000XM5',
          warrantyMonths: 12,
          color: 'Silver',
        },
      });

      expect(result.success).toBe(true);
    });

    test('electronics: fails when brand is missing', () => {
      const result = createProductSchema.safeParse({
        ...validBaseProduct,
        category: 'electronics',
        attributes: {
          warrantyMonths: 12,
        },
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        const brandError = result.error.issues.find(i => i.path.join('.') === 'attributes.brand');
        expect(brandError).toBeDefined();
      }
    });

    test('food: valid with optional food specifications', () => {
      const result = createProductSchema.safeParse({
        ...validBaseProduct,
        category: 'food',
        attributes: {
          brand: 'Golden Penny',
          weightKg: 2.5,
          shelfLifeDays: 90,
          storageRequirement: 'ambient',
        },
      });

      expect(result.success).toBe(true);
    });

    test('food: fails if shelfLifeDays is zero or negative', () => {
      const result = createProductSchema.safeParse({
        ...validBaseProduct,
        category: 'food',
        attributes: {
          shelfLifeDays: 0,
        },
      });

      expect(result.success).toBe(false);
    });

    test('services: valid when serviceType is supplied', () => {
      const result = createProductSchema.safeParse({
        ...validBaseProduct,
        productType: 'service',
        trackInventory: false,
        stockQuantity: null,
        category: 'services',
        attributes: {
          serviceType: 'Accounting & Payroll Setup',
          deliveryFormat: 'remote',
          estimatedDuration: '3 business days',
        },
      });

      expect(result.success).toBe(true);
    });

    test('services: fails when serviceType is missing', () => {
      const result = createProductSchema.safeParse({
        ...validBaseProduct,
        productType: 'service',
        trackInventory: false,
        stockQuantity: null,
        category: 'services',
        attributes: {
          deliveryFormat: 'remote',
        },
      });

      expect(result.success).toBe(false);
    });

    test('other: valid with arbitrary custom attributes or empty object', () => {
      const result = createProductSchema.safeParse({
        ...validBaseProduct,
        category: 'other',
        attributes: {
          customSpec: 'Artisan hand-woven craft',
          collectorEdition: true,
        },
      });

      expect(result.success).toBe(true);
    });

    test('adversarial: rejects unknown category', () => {
      const result = createProductSchema.safeParse({
        ...validBaseProduct,
        category: 'automotive_parts', // Not in 8 categories
        attributes: {},
      });

      expect(result.success).toBe(false);
    });
  });

  describe('2. Physical vs Service Polymorphism', () => {
    test('physical: requires stockQuantity when trackInventory is true', () => {
      const result = createProductSchema.safeParse({
        ...validBaseProduct,
        category: 'fashion',
        productType: 'physical',
        trackInventory: true,
        stockQuantity: null, // Invalid: tracking enabled but stock is null
        attributes: { size: 'M', color: 'White' },
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        const stockErr = result.error.issues.find(i => i.path.includes('stockQuantity'));
        expect(stockErr).toBeDefined();
        expect(stockErr?.message).toContain('Stock quantity is required');
      }
    });

    test('physical: rejects negative stockQuantity', () => {
      const result = createProductSchema.safeParse({
        ...validBaseProduct,
        category: 'fashion',
        productType: 'physical',
        trackInventory: true,
        stockQuantity: -10,
        attributes: { size: 'M', color: 'White' },
      });

      expect(result.success).toBe(false);
    });

    test('service: rejects trackInventory = true', () => {
      const result = createProductSchema.safeParse({
        ...validBaseProduct,
        category: 'services',
        productType: 'service',
        trackInventory: true, // Invalid for services
        stockQuantity: null,
        attributes: { serviceType: 'Legal Advisory' },
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        const trackErr = result.error.issues.find(i => i.path.includes('trackInventory'));
        expect(trackErr).toBeDefined();
        expect(trackErr?.message).toContain('Services cannot have inventory tracking');
      }
    });

    test('service: rejects non-null stockQuantity', () => {
      const result = createProductSchema.safeParse({
        ...validBaseProduct,
        category: 'services',
        productType: 'service',
        trackInventory: false,
        stockQuantity: 15, // Invalid for services
        attributes: { serviceType: 'Legal Advisory' },
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        const stockErr = result.error.issues.find(i => i.path.includes('stockQuantity'));
        expect(stockErr).toBeDefined();
        expect(stockErr?.message).toContain('Services cannot have stock quantity');
      }
    });
  });

  describe('3. Pricing Sanity & Boundaries', () => {
    test('accepts compareAtPrice greater than price', () => {
      const result = createProductSchema.safeParse({
        ...validBaseProduct,
        category: 'fashion',
        price: 20000,
        compareAtPrice: 25000,
        attributes: { size: 'L', color: 'Red' },
      });

      expect(result.success).toBe(true);
    });

    test('rejects compareAtPrice lower than price (discount inversion)', () => {
      const result = createProductSchema.safeParse({
        ...validBaseProduct,
        category: 'fashion',
        price: 25000,
        compareAtPrice: 18000, // Invalid: strike-through is cheaper than sell price
        attributes: { size: 'L', color: 'Red' },
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        const compErr = result.error.issues.find(i => i.path.includes('compareAtPrice'));
        expect(compErr).toBeDefined();
        expect(compErr?.message).toContain('cannot be lower than the selling price');
      }
    });

    test('rejects zero or negative price', () => {
      const zeroResult = createProductSchema.safeParse({
        ...validBaseProduct,
        category: 'fashion',
        price: 0,
        attributes: { size: 'L', color: 'Red' },
      });
      expect(zeroResult.success).toBe(false);

      const negResult = createProductSchema.safeParse({
        ...validBaseProduct,
        category: 'fashion',
        price: -500,
        attributes: { size: 'L', color: 'Red' },
      });
      expect(negResult.success).toBe(false);
    });

    test('rejects excessive price exceeding platform ceiling', () => {
      const result = createProductSchema.safeParse({
        ...validBaseProduct,
        category: 'fashion',
        price: 2_000_000_000, // 2 Billion Naira exceeds 1 Billion cap
        attributes: { size: 'L', color: 'Red' },
      });

      expect(result.success).toBe(false);
    });
  });

  describe('4. Media & Contact Field Validations', () => {
    test('accepts up to 3 valid image URLs', () => {
      const result = createProductSchema.safeParse({
        ...validBaseProduct,
        category: 'fashion',
        images: [
          'https://res.cloudinary.com/wallx/img1.png',
          'https://res.cloudinary.com/wallx/img2.png',
          'https://res.cloudinary.com/wallx/img3.png',
        ],
        attributes: { size: 'S', color: 'Green' },
      });

      expect(result.success).toBe(true);
    });

    test('rejects more than 3 images', () => {
      const result = createProductSchema.safeParse({
        ...validBaseProduct,
        category: 'fashion',
        images: [
          'https://res.cloudinary.com/wallx/img1.png',
          'https://res.cloudinary.com/wallx/img2.png',
          'https://res.cloudinary.com/wallx/img3.png',
          'https://res.cloudinary.com/wallx/img4.png',
        ],
        attributes: { size: 'S', color: 'Green' },
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        const imgErr = result.error.issues.find(i => i.path.includes('images'));
        expect(imgErr).toBeDefined();
        expect(imgErr?.message).toContain('Maximum of 3 images allowed');
      }
    });

    test('rejects invalid image URLs', () => {
      const result = createProductSchema.safeParse({
        ...validBaseProduct,
        category: 'fashion',
        images: ['not-a-valid-url'],
        attributes: { size: 'S', color: 'Green' },
      });

      expect(result.success).toBe(false);
    });

    test('accepts empty string for purchaseUrl', () => {
      const result = createProductSchema.safeParse({
        ...validBaseProduct,
        category: 'fashion',
        purchaseUrl: '',
        attributes: { size: 'S', color: 'Green' },
      });

      expect(result.success).toBe(true);
    });
  });

  describe('5. Update Product Schema', () => {
    test('allows partial updates with valid single fields', () => {
      const priceUpdate = updateProductSchema.safeParse({ price: 92000 });
      expect(priceUpdate.success).toBe(true);

      const stockUpdate = updateProductSchema.safeParse({ stockQuantity: 20 });
      expect(stockUpdate.success).toBe(true);

      const nameUpdate = updateProductSchema.safeParse({ name: 'Updated Armchair Deluxe' });
      expect(nameUpdate.success).toBe(true);
    });

    test('validates attributes against category when both are provided in update', () => {
      const validUpdate = updateProductSchema.safeParse({
        category: 'books',
        attributes: {
          author: 'Wole Soyinka',
          pages: 280,
        },
      });
      expect(validUpdate.success).toBe(true);

      const invalidUpdate = updateProductSchema.safeParse({
        category: 'books',
        attributes: {
          pages: 280, // Missing required author!
        },
      });
      expect(invalidUpdate.success).toBe(false);
      if (!invalidUpdate.success) {
        const authorErr = invalidUpdate.error.issues.find(i => i.path.includes('author'));
        expect(authorErr).toBeDefined();
      }
    });

    test('rejects service with inventory tracking on update', () => {
      const result = updateProductSchema.safeParse({
        productType: 'service',
        trackInventory: true,
      });

      expect(result.success).toBe(false);
    });
  });

  describe('6. Query Schema & Pagination Coercion', () => {
    test('coerces string numbers for pagination and applies defaults', () => {
      const parsed = listProductsQuerySchema.parse({
        page: '3',
        limit: '15',
        category: 'electronics',
        type: 'physical',
        search: 'Sony',
      });

      expect(parsed.page).toBe(3);
      expect(parsed.limit).toBe(15);
      expect(parsed.category).toBe('electronics');
      expect(parsed.type).toBe('physical');
      expect(parsed.search).toBe('Sony');
    });

    test('applies default pagination when query is empty', () => {
      const parsed = listProductsQuerySchema.parse({});

      expect(parsed.page).toBe(1);
      expect(parsed.limit).toBe(24);
      expect(parsed.category).toBeUndefined();
    });

    test('rejects invalid limit exceeding 100', () => {
      const result = listProductsQuerySchema.safeParse({
        limit: '500',
      });

      expect(result.success).toBe(false);
    });
  });

  describe('7. Admin Moderation Schemas', () => {
    test('approveSchema: accepts empty payload or optional notes', () => {
      expect(approveSchema.safeParse({}).success).toBe(true);
      expect(approveSchema.safeParse({ notes: 'Verified image quality' }).success).toBe(true);
    });

    test('rejectSchema: requires reason between 3 and 500 characters', () => {
      // Valid reason
      const valid = rejectSchema.safeParse({
        reason: 'Image resolution is too blurry. Please upload clear photos.',
      });
      expect(valid.success).toBe(true);

      // Missing reason
      const missing = rejectSchema.safeParse({});
      expect(missing.success).toBe(false);

      // Too short reason
      const tooShort = rejectSchema.safeParse({ reason: 'No' });
      expect(tooShort.success).toBe(false);

      // Too long reason (> 500 chars)
      const tooLong = rejectSchema.safeParse({ reason: 'a'.repeat(501) });
      expect(tooLong.success).toBe(false);
    });

    test('takedownSchema: requires reason between 3 and 500 characters', () => {
      const valid = takedownSchema.safeParse({
        reason: 'Product was flagged by customer reports for counterfeit branding.',
      });
      expect(valid.success).toBe(true);

      const empty = takedownSchema.safeParse({ reason: '' });
      expect(empty.success).toBe(false);
    });
  });
});
