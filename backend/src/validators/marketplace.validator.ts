import { z } from 'zod';
import { asNumber, asStringOptional } from './query.utils';

export const MARKETPLACE_CATEGORIES = [
  'fashion',
  'bags',
  'books',
  'furniture',
  'electronics',
  'food',
  'services',
  'other',
] as const;

export type MarketplaceCategory = (typeof MARKETPLACE_CATEGORIES)[number];

export const PRODUCT_TYPES = ['physical', 'service'] as const;
export type ProductType = (typeof PRODUCT_TYPES)[number];

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Category-Specific Attribute Schemas (Strict & Discriminated)
 * ─────────────────────────────────────────────────────────────────────────────
 */

export const fashionAttributesSchema = z.object({
  size: z
    .string({ error: 'Clothing/shoe size is required' })
    .trim()
    .min(1, 'Clothing/shoe size is required')
    .max(20),
  color: z
    .string({ error: 'Color is required' })
    .trim()
    .min(1, 'Color is required')
    .max(50),
  material: z.string().trim().max(100).optional(),
  gender: z.enum(['men', 'women', 'unisex', 'kids']).optional(),
});

export const bagsAttributesSchema = z.object({
  material: z
    .string({ error: 'Material is required (e.g. Leather, Canvas)' })
    .trim()
    .min(1, 'Material is required (e.g. Leather, Canvas)')
    .max(100),
  color: z.string().trim().max(50).optional(),
  compartments: z.coerce.number().int().min(1).optional(),
});

export const booksAttributesSchema = z.object({
  author: z
    .string({ error: 'Author name is required' })
    .trim()
    .min(1, 'Author name is required')
    .max(120),
  publisher: z.string().trim().max(120).optional(),
  binding: z.enum(['paperback', 'hardcover', 'spiral', 'ebook']).optional(),
  pages: z.coerce.number().int().min(1, 'Page count must be at least 1').optional(),
  language: z.string().trim().max(50).optional(),
});

export const furnitureAttributesSchema = z.object({
  material: z
    .string({ error: 'Primary material is required (e.g. Wood, Metal)' })
    .trim()
    .min(1, 'Primary material is required (e.g. Wood, Metal)')
    .max(100),
  dimensions: z.string().trim().max(100).optional(),
  color: z.string().trim().max(50).optional(),
  assemblyRequired: z.boolean().optional(),
});

export const electronicsAttributesSchema = z.object({
  brand: z
    .string({ error: 'Brand is required' })
    .trim()
    .min(1, 'Brand is required')
    .max(100),
  model: z.string().trim().max(100).optional(),
  warrantyMonths: z.coerce.number().int().min(0, 'Warranty months cannot be negative').optional(),
  color: z.string().trim().max(50).optional(),
});

export const foodAttributesSchema = z.object({
  brand: z.string().trim().max(100).optional(),
  weightKg: z.coerce.number().min(0, 'Weight cannot be negative').optional(),
  shelfLifeDays: z.coerce.number().int().min(1, 'Shelf life must be at least 1 day').optional(),
  storageRequirement: z.enum(['ambient', 'chilled', 'frozen']).optional(),
});

export const servicesAttributesSchema = z.object({
  serviceType: z
    .string({ error: 'Service specialization/type is required' })
    .trim()
    .min(1, 'Service specialization/type is required')
    .max(120),
  deliveryFormat: z.enum(['in_person', 'remote', 'hybrid']).optional(),
  estimatedDuration: z.string().trim().max(100).optional(),
});

export const otherAttributesSchema = z.record(z.string(), z.any()).optional().default({});

export const categoryAttributeSchemas = {
  fashion: fashionAttributesSchema,
  bags: bagsAttributesSchema,
  books: booksAttributesSchema,
  furniture: furnitureAttributesSchema,
  electronics: electronicsAttributesSchema,
  food: foodAttributesSchema,
  services: servicesAttributesSchema,
  other: otherAttributesSchema,
} as const;

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Base Product Attributes
 * ─────────────────────────────────────────────────────────────────────────────
 */

const baseProductObject = z.object({
  name: z.string().trim().min(3, 'Product name must be at least 3 characters').max(120, 'Product name cannot exceed 120 characters'),
  productType: z.enum(PRODUCT_TYPES).default('physical'),
  description: z.string().trim().min(10, 'Description must be at least 10 characters').max(2000, 'Description cannot exceed 2000 characters'),
  price: z.coerce.number().positive('Price must be greater than 0').max(1_000_000_000, 'Price exceeds maximum allowed limit (₦1,000,000,000)'),
  compareAtPrice: z.coerce.number().positive('Compare-at price must be greater than 0').max(1_000_000_000).optional().nullable(),
  currency: z.string().trim().min(3).max(3).default('NGN'),
  stockQuantity: z.coerce.number().int('Stock quantity must be an integer').min(0, 'Stock quantity cannot be negative').optional().nullable(),
  trackInventory: z.boolean().default(true),
  images: z.array(z.string().url('Each image must be a valid URL')).max(3, 'Maximum of 3 images allowed').default([]),
  contactPhone: z.string().trim().max(30).optional().nullable(),
  contactWhatsapp: z.string().trim().max(30).optional().nullable(),
  purchaseUrl: z.string().trim().url('Purchase URL must be a valid URL').max(500).optional().nullable().or(z.literal('')),
});

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Discriminated Union Variants by Category
 * ─────────────────────────────────────────────────────────────────────────────
 */

const fashionProductSchema = baseProductObject.extend({
  category: z.literal('fashion'),
  attributes: fashionAttributesSchema,
});

const bagsProductSchema = baseProductObject.extend({
  category: z.literal('bags'),
  attributes: bagsAttributesSchema,
});

const booksProductSchema = baseProductObject.extend({
  category: z.literal('books'),
  attributes: booksAttributesSchema,
});

const furnitureProductSchema = baseProductObject.extend({
  category: z.literal('furniture'),
  attributes: furnitureAttributesSchema,
});

const electronicsProductSchema = baseProductObject.extend({
  category: z.literal('electronics'),
  attributes: electronicsAttributesSchema,
});

const foodProductSchema = baseProductObject.extend({
  category: z.literal('food'),
  attributes: foodAttributesSchema,
});

const servicesProductSchema = baseProductObject.extend({
  category: z.literal('services'),
  attributes: servicesAttributesSchema,
});

const otherProductSchema = baseProductObject.extend({
  category: z.literal('other'),
  attributes: otherAttributesSchema,
});

/**
 * Create Product Schema: Discriminated Union with Polymorphism Refinement
 */
export const createProductSchema = z
  .discriminatedUnion('category', [
    fashionProductSchema,
    bagsProductSchema,
    booksProductSchema,
    furnitureProductSchema,
    electronicsProductSchema,
    foodProductSchema,
    servicesProductSchema,
    otherProductSchema,
  ])
  .superRefine((data, ctx) => {
    // 1. Physical vs Service Polymorphism
    if (data.productType === 'physical') {
      if (data.trackInventory && (data.stockQuantity === null || data.stockQuantity === undefined)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Stock quantity is required when inventory tracking is enabled for physical products',
          path: ['stockQuantity'],
        });
      }
    } else if (data.productType === 'service') {
      if (data.trackInventory === true) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Services cannot have inventory tracking enabled',
          path: ['trackInventory'],
        });
      }
      if (data.stockQuantity !== null && data.stockQuantity !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Services cannot have stock quantity',
          path: ['stockQuantity'],
        });
      }
    }

    // 2. Compare-at price sanity
    if (data.compareAtPrice !== undefined && data.compareAtPrice !== null && data.price !== undefined) {
      if (Number(data.compareAtPrice) < Number(data.price)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Compare-at price cannot be lower than the selling price',
          path: ['compareAtPrice'],
        });
      }
    }
  });

/**
 * Update Product Schema: Partial fields with conditional category validation
 */
export const updateProductSchema = z
  .object({
    name: z.string().trim().min(3, 'Product name must be at least 3 characters').max(120).optional(),
    productType: z.enum(PRODUCT_TYPES).optional(),
    category: z.enum(MARKETPLACE_CATEGORIES).optional(),
    description: z.string().trim().min(10, 'Description must be at least 10 characters').max(2000).optional(),
    price: z.coerce.number().positive('Price must be greater than 0').max(1_000_000_000).optional(),
    compareAtPrice: z.coerce.number().positive('Compare-at price must be greater than 0').max(1_000_000_000).optional().nullable(),
    currency: z.string().trim().min(3).max(3).optional(),
    stockQuantity: z.coerce.number().int('Stock quantity must be an integer').min(0).optional().nullable(),
    trackInventory: z.boolean().optional(),
    attributes: z.record(z.string(), z.any()).optional().nullable(),
    images: z.array(z.string().url('Each image must be a valid URL')).max(3, 'Maximum of 3 images allowed').optional(),
    contactPhone: z.string().trim().max(30).optional().nullable(),
    contactWhatsapp: z.string().trim().max(30).optional().nullable(),
    purchaseUrl: z.string().trim().url('Purchase URL must be a valid URL').max(500).optional().nullable().or(z.literal('')),
  })
  .superRefine((data, ctx) => {
    // If category and attributes are both passed, validate attributes against the specific schema
    if (data.category && data.attributes) {
      const validator = categoryAttributeSchemas[data.category];
      if (validator) {
        const result = validator.safeParse(data.attributes);
        if (!result.success) {
          for (const issue of result.error.issues) {
            ctx.addIssue({
              ...issue,
              path: ['attributes', ...issue.path],
            });
          }
        }
      }
    }

    // Physical vs Service Polymorphism on update
    if (data.productType === 'service') {
      if (data.trackInventory === true) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Services cannot have inventory tracking enabled',
          path: ['trackInventory'],
        });
      }
      if (data.stockQuantity !== null && data.stockQuantity !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Services cannot have stock quantity',
          path: ['stockQuantity'],
        });
      }
    }

    // Compare-at price sanity
    if (data.compareAtPrice !== undefined && data.compareAtPrice !== null && data.price !== undefined) {
      if (Number(data.compareAtPrice) < Number(data.price)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Compare-at price cannot be lower than the selling price',
          path: ['compareAtPrice'],
        });
      }
    }
  });

/**
 * Submit for Approval Schema
 */
export const submitProductSchema = z
  .object({
    notes: z.string().trim().max(500, 'Submission notes cannot exceed 500 characters').optional(),
  })
  .optional();

/**
 * List / Query Marketplace Products Schema (SME & Public)
 */
export const listProductsQuerySchema = z.object({
  page: asNumber({ min: 1, int: true }).default(1),
  limit: asNumber({ min: 1, max: 100, int: true }).default(24),
  category: z.preprocess(
    (val) => (Array.isArray(val) ? val[0] : val),
    z.enum(MARKETPLACE_CATEGORIES).optional()
  ),
  type: z.preprocess(
    (val) => (Array.isArray(val) ? val[0] : val),
    z.enum(PRODUCT_TYPES).optional()
  ),
  productType: z.preprocess(
    (val) => (Array.isArray(val) ? val[0] : val),
    z.enum(PRODUCT_TYPES).optional()
  ),
  status: z.preprocess(
    (val) => (Array.isArray(val) ? val[0] : val),
    z.enum(['draft', 'pending_approval', 'approved', 'rejected', 'archived']).optional()
  ),
  search: asStringOptional,
});

/**
 * Admin Moderation Schemas
 */
export const approveSchema = z
  .object({
    notes: z.string().trim().max(500, 'Approval notes cannot exceed 500 characters').optional(),
  })
  .optional();

export const rejectSchema = z.object({
  reason: z
    .string({ error: 'Rejection reason is mandatory' })
    .trim()
    .min(3, 'Rejection reason must be at least 3 characters')
    .max(500, 'Rejection reason cannot exceed 500 characters'),
});

export const takedownSchema = z.object({
  reason: z
    .string({ error: 'Takedown reason is mandatory' })
    .trim()
    .min(3, 'Takedown reason must be at least 3 characters')
    .max(500, 'Takedown reason cannot exceed 500 characters'),
});

/**
 * Inferred Types
 */
export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
export type SubmitProductInput = z.infer<typeof submitProductSchema>;
export type ListProductsQuery = z.infer<typeof listProductsQuerySchema>;
export type ApproveProductInput = z.infer<typeof approveSchema>;
export type RejectProductInput = z.infer<typeof rejectSchema>;
export type TakedownProductInput = z.infer<typeof takedownSchema>;
