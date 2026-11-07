import {
  uploadProductImageToCloudinary,
  deleteProductImageFromCloudinary,
  isAllowedProductImage,
  isValidImageBuffer,
  MAX_PRODUCT_IMAGE_BYTES,
} from '@/lib/cloudinary';
import crypto from 'crypto';
import prisma from '@/lib/prisma';
import { AppError } from '@/middleware/errorHandler';
import { verifyBusinessAccess } from '@/lib/ownership';
import { logAudit } from '@/lib/audit';
import logger from '@/lib/logger';
import { Prisma, ProductListingStatus, ProductType } from '@prisma/client';
import { config } from '@/config';
import { sendEmail } from '@/lib/email';
import {
  dispatchProductApprovedEmail,
  dispatchProductRejectedEmail,
} from '@/services/email-dispatch.service';
import {
  renderMarketplaceProductApprovedEmail,
} from '@/lib/email/templates/marketplace-product-approved';
import {
  renderMarketplaceProductRejectedEmail,
} from '@/lib/email/templates/marketplace-product-rejected';
import {
  CreateProductInput,
  UpdateProductInput,
  categoryAttributeSchemas,
} from '@/validators/marketplace.validator';

let warnedMissingMarketplaceSessionSecret = false;
function warnIfMarketplaceSessionSecretMissing(secret: string): void {
  if (secret || warnedMissingMarketplaceSessionSecret) return;
  warnedMissingMarketplaceSessionSecret = true;
  if (process.env.NODE_ENV !== 'test') {
    logger.warn(
      'MARKETPLACE_SESSION_SECRET is not set; marketplace view/boost dedupe hashes will be weaker. Set a server-only secret in production.',
    );
  }
}

/**
 * URL-friendly slug generator
 */
export function slugify(text: string): string {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-') // Replace spaces with -
    .replace(/[^\w-]+/g, '') // Remove all non-word chars
    .replace(/--+/g, '-') // Replace multiple - with single -
    .replace(/^-+/, '') // Trim - from start of text
    .replace(/-+$/, ''); // Trim - from end of text
}

/**
 * Generate unique slug with collision resilience
 */
async function generateUniqueSlug(
  tx: Prisma.TransactionClient,
  name: string
): Promise<string> {
  const baseSlug = slugify(name) || 'product';
  for (let attempt = 0; attempt < 3; attempt++) {
    const candidate = `${baseSlug}-${crypto.randomBytes(4).toString('hex')}`;
    const existing = await tx.marketplaceProduct.findUnique({
      where: { slug: candidate },
      select: { id: true },
    });
    if (!existing) return candidate;
  }
  return `${baseSlug}-${crypto.randomUUID()}`;
}

/**
 * Core product fields whose mutation triggers bait-and-switch status demotion
 * @deprecated — review-everything policy; kept to avoid breaking external imports.
 */
export const CORE_PRODUCT_FIELDS = [
  'name',
  'price',
  'compareAtPrice',
  'images',
  'category',
  'productType',
  'description',
] as const;

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * SME Merchant Product Management
 * ─────────────────────────────────────────────────────────────────────────────
 */

/**
 * Create a new product listing (default status: draft)
 * Guarded by advisory transaction lock and 3-product-per-business active cap
 */
export async function createProduct(
  userId: string,
  businessId: string,
  data: CreateProductInput
) {
  await verifyBusinessAccess(userId, businessId);

  return await prisma.$transaction(async (tx) => {
    // 1. Transaction-scoped advisory lock serialized on businessId
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${businessId}, 0));`;

    // 2. Fetch business slot allowance inside transaction (Phase 9)
    const business = await tx.business.findUnique({
      where: { id: businessId },
      select: { marketplaceSlotAllowance: true },
    });
    const allowance = business?.marketplaceSlotAllowance ?? 3;

    // 3. Count live products for this business: draft, pending_approval, approved
    // (excludes archived and rejected per plan §2.1 & Phase 9 rule)
    const activeCount = await tx.marketplaceProduct.count({
      where: {
        businessId,
        status: { in: ['draft', 'pending_approval', 'approved'] },
      },
    });

    if (activeCount >= allowance) {
      throw new AppError(
        400,
        `Maximum of ${allowance} product${allowance === 1 ? '' : 's'} permitted for this business`,
        'PRODUCT_LIMIT_REACHED'
      );
    }

    // 3. Generate collision-resilient slug
    const slug = await generateUniqueSlug(tx, data.name);

    // 4. Create product row
    const created = await tx.marketplaceProduct.create({
      data: {
        businessId,
        name: data.name,
        slug,
        category: data.category,
        productType: data.productType ?? 'physical',
        description: data.description,
        price: new Prisma.Decimal(data.price),
        compareAtPrice:
          data.compareAtPrice != null
            ? new Prisma.Decimal(data.compareAtPrice)
            : null,
        currency: data.currency ?? 'NGN',
        stockQuantity:
          data.productType === 'service'
            ? null
            : (data.stockQuantity ?? 1),
        trackInventory:
          data.productType === 'service'
            ? false
            : (data.trackInventory ?? true),
        attributes: (data.attributes ?? {}) as Prisma.InputJsonValue,
        images: data.images ?? [],
        contactPhone: data.contactPhone ?? null,
        contactWhatsapp: data.contactWhatsapp ?? null,
        purchaseUrl: data.purchaseUrl || null,
        status: 'draft',
      },
    });

    await logAudit(
      {
        userId,
        businessId,
        action: 'product.created',
        resourceType: 'marketplace_product',
        resourceId: created.id,
        newData: { name: created.name, category: created.category, status: created.status },
      },
      tx
    );

    return created;
  });
}

/**
 * Update an existing product.
 * Core field modifications on an 'approved' listing reset status to 'pending_approval'.
 */
export async function updateProduct(
  userId: string,
  businessId: string,
  productId: string,
  patch: UpdateProductInput
) {
  await verifyBusinessAccess(userId, businessId);

  return await prisma.$transaction(async (tx) => {
    const existing = await tx.marketplaceProduct.findFirst({
      where: { id: productId, businessId },
    });

    if (!existing) {
      throw new AppError(404, 'Product not found', 'PRODUCT_NOT_FOUND');
    }

    if (existing.status === 'archived') {
      throw new AppError(
        400,
        'Archived products cannot be updated',
        'PRODUCT_ARCHIVED'
      );
    }

    // Re-validate attributes against the stored category when attributes are
    // patched without a new category (validator only checks when both are sent).
    if (
      patch.attributes !== undefined &&
      patch.attributes !== null &&
      patch.category === undefined
    ) {
      const validator =
        categoryAttributeSchemas[
          existing.category as keyof typeof categoryAttributeSchemas
        ];
      if (validator) {
        const result = validator.safeParse(patch.attributes);
        if (!result.success) {
          throw new AppError(
            400,
            'Invalid attributes for product category',
            'INVALID_ATTRIBUTES',
            { issues: result.error.issues }
          );
        }
      }
    }

    const updateData: Prisma.MarketplaceProductUpdateInput = {};

    if (patch.name !== undefined) updateData.name = patch.name;
    if (patch.category !== undefined) updateData.category = patch.category;
    if (patch.productType !== undefined) {
      updateData.productType = patch.productType;
      if (patch.productType === 'service') {
        updateData.trackInventory = false;
        updateData.stockQuantity = null;
      }
    }
    if (patch.description !== undefined) updateData.description = patch.description;
    if (patch.price !== undefined) updateData.price = new Prisma.Decimal(patch.price);
    if (patch.compareAtPrice !== undefined) {
      updateData.compareAtPrice =
        patch.compareAtPrice != null
          ? new Prisma.Decimal(patch.compareAtPrice)
          : null;
    }
    if (patch.currency !== undefined) updateData.currency = patch.currency;
    if (patch.stockQuantity !== undefined) updateData.stockQuantity = patch.stockQuantity;
    if (patch.trackInventory !== undefined) updateData.trackInventory = patch.trackInventory;
    if (patch.attributes !== undefined) {
      updateData.attributes = (patch.attributes ?? {}) as Prisma.InputJsonValue;
    }
    if (patch.images !== undefined) updateData.images = patch.images;
    if (patch.contactPhone !== undefined) updateData.contactPhone = patch.contactPhone;
    if (patch.contactWhatsapp !== undefined) updateData.contactWhatsapp = patch.contactWhatsapp;
    if (patch.purchaseUrl !== undefined) updateData.purchaseUrl = patch.purchaseUrl || null;

    if (Object.keys(updateData).length === 0) {
      throw new AppError(400, 'No changes submitted', 'NO_CHANGES');
    }

    // Demotion: any modification to an approved listing resets status to pending_approval for re-review
    const isDemoted = existing.status === 'approved' && Object.keys(updateData).length > 0;
    if (isDemoted) {
      updateData.status = 'pending_approval';
      updateData.approvedAt = null;
      updateData.approvedBy = null;
      updateData.rejectionReason = null;
      logger.info(
        `Product ${productId} modified while approved. Demoting status to pending_approval.`
      );
    }

    // Phase 14: Auto-pause boost if listing is demoted to pending_approval or is out of stock
    const isNowOutOfStock =
      (patch.trackInventory ?? existing.trackInventory) &&
      (patch.stockQuantity !== undefined ? patch.stockQuantity : existing.stockQuantity) !== null &&
      (patch.stockQuantity !== undefined ? patch.stockQuantity : existing.stockQuantity)! <= 0;

    if (isDemoted || isNowOutOfStock) {
      updateData.boostEndsAt = null;
      if (tx.marketplaceBoost?.updateMany) {
        await tx.marketplaceBoost.updateMany({
          where: { productId, status: 'active' },
          data: { status: 'paused' },
        });
      }
    }

    const updated = await tx.marketplaceProduct.update({
      where: { id: productId },
      data: updateData,
    });

    await logAudit(
      {
        userId,
        businessId,
        action: 'product.updated',
        resourceType: 'marketplace_product',
        resourceId: productId,
        oldData: { status: existing.status },
        newData: updateData as Record<string, any>,
      },
      tx
    );

    return updated;
  });
}

/**
 * Submit product for admin moderation (allowed only from draft or rejected status)
 */
export async function submitForApproval(
  userId: string,
  businessId: string,
  productId: string
) {
  await verifyBusinessAccess(userId, businessId);

  return await prisma.$transaction(async (tx) => {
    const existing = await tx.marketplaceProduct.findFirst({
      where: { id: productId, businessId },
    });

    if (!existing) {
      throw new AppError(404, 'Product not found', 'PRODUCT_NOT_FOUND');
    }

    // Early return if already pending approval (before image and quality score checks)
    if (existing.status === 'pending_approval') {
      return existing;
    }

    if (
      existing.status !== 'draft' &&
      existing.status !== 'rejected' &&
      existing.status !== 'approved'
    ) {
      throw new AppError(
        400,
        `Product cannot be submitted for approval from status: ${existing.status}`,
        'INVALID_STATUS_TRANSITION'
      );
    }

    if (!existing.images || existing.images.length === 0) {
      throw new AppError(
        400,
        'Product must have at least 1 image before submission',
        'MISSING_IMAGES'
      );
    }

    // Phase 8c: Block submission if quality score is below 50
    const quality = await computeListingQualityScore(existing);
    if (quality.score < 50) {
      throw new AppError(
        400,
        `Listing quality score must be at least 50 to submit for approval (current score: ${quality.score}). Missing: ${quality.missingItems.join('; ')}`,
        'LOW_QUALITY_SCORE',
        { quality }
      );
    }

    // If an approved product is submitted, reset approval stamps and pause any active boosts
    if (existing.status === 'approved' && tx.marketplaceBoost?.updateMany) {
      await tx.marketplaceBoost.updateMany({
        where: { productId, status: 'active' },
        data: { status: 'paused' },
      });
    }

    const updated = await tx.marketplaceProduct.update({
      where: { id: productId },
      data: {
        status: 'pending_approval',
        rejectionReason: null,
        approvedAt: null,
        approvedBy: null,
        boostEndsAt: null,
      },
    });

    await logAudit(
      {
        userId,
        businessId,
        action: 'product.submitted',
        resourceType: 'marketplace_product',
        resourceId: productId,
        oldData: { status: existing.status },
        newData: { status: 'pending_approval' },
      },
      tx
    );

    return updated;
  });
}

/**
 * Archive a product (frees the merchant slot)
 */
export async function archiveProduct(
  userId: string,
  businessId: string,
  productId: string
) {
  await verifyBusinessAccess(userId, businessId);

  return await prisma.$transaction(async (tx) => {
    const existing = await tx.marketplaceProduct.findFirst({
      where: { id: productId, businessId },
    });

    if (!existing) {
      throw new AppError(404, 'Product not found', 'PRODUCT_NOT_FOUND');
    }

    if (existing.status === 'archived') {
      throw new AppError(
        400,
        'Product is already archived',
        'INVALID_STATUS_TRANSITION'
      );
    }

    const updated = await tx.marketplaceProduct.update({
      where: { id: productId },
      data: {
        status: 'archived',
        boostEndsAt: null,
      },
    });

    // Auto-pause active boost if listing is archived (Phase 14)
    if (tx.marketplaceBoost?.updateMany) {
      await tx.marketplaceBoost.updateMany({
        where: { productId, status: 'active' },
        data: { status: 'paused' },
      });
    }

    await logAudit(
      {
        userId,
        businessId,
        action: 'product.archived',
        resourceType: 'marketplace_product',
        resourceId: productId,
        oldData: { status: existing.status },
        newData: { status: 'archived' },
      },
      tx
    );

    return updated;
  });
}

// ─── Quality Scoring & Median Caching (Phase 8c) ─────────────────────────────

interface CachedCategoryMedian {
  median: number | null;
  count: number;
  cachedAt: number;
}
const categoryMedianCache = new Map<string, CachedCategoryMedian>();
const CATEGORY_MEDIAN_TTL_MS = 60 * 1000; // 1-minute TTL

export async function getCategoryPriceMedian(
  category: string,
  db: typeof prisma | Prisma.TransactionClient = prisma
): Promise<{ median: number | null; count: number }> {
  const cached = categoryMedianCache.get(category);
  if (cached && Date.now() - cached.cachedAt < CATEGORY_MEDIAN_TTL_MS) {
    return { median: cached.median, count: cached.count };
  }

  const rows = await db.$queryRaw<Array<{ median_price: number | null; cnt: bigint | number }>>`
    SELECT
      percentile_cont(0.5) WITHIN GROUP (ORDER BY price) AS median_price,
      COUNT(*)::bigint AS cnt
    FROM "marketplace_products"
    WHERE category = ${category} AND status = 'approved';
  `;

  const rawMedian = rows?.[0]?.median_price;
  const count = Number(rows?.[0]?.cnt ?? 0);
  const median = rawMedian !== null && rawMedian !== undefined ? Number(rawMedian) : null;

  categoryMedianCache.set(category, { median, count, cachedAt: Date.now() });
  return { median, count };
}

export interface ListingQualityScore {
  score: number;
  label: 'poor' | 'fair' | 'good' | 'excellent';
  breakdown: {
    hasEnoughImages: boolean;
    hasDetailedDescription: boolean;
    hasAttributes: boolean;
    isPriceReasonable: boolean | null;
  };
  missingItems: string[];
}

export async function computeListingQualityScore(
  product: {
    category: string;
    description?: string | null;
    images?: string[] | null;
    attributes?: unknown;
    price: number | Prisma.Decimal;
  },
  medianOverride?: { median: number | null; count: number }
): Promise<ListingQualityScore> {
  const imagesCount = product.images?.length ?? 0;
  const hasEnoughImages = imagesCount >= 2;

  const descLength = (product.description ?? '').trim().length;
  const hasDetailedDescription = descLength >= 120;

  const attrs = product.attributes;
  const hasAttributes = Boolean(
    attrs && typeof attrs === 'object' && !Array.isArray(attrs) && Object.keys(attrs as object).length > 0
  );

  const priceNum = Number(product.price);
  const medianInfo = medianOverride ?? (await getCategoryPriceMedian(product.category));

  const hasSufficientCategoryData = medianInfo.count >= 3 && medianInfo.median !== null && medianInfo.median > 0;

  let isPriceReasonable: boolean | null = null;
  if (hasSufficientCategoryData && medianInfo.median !== null) {
    const lowerBound = 0.5 * medianInfo.median;
    const upperBound = 2.0 * medianInfo.median;
    isPriceReasonable = priceNum >= lowerBound && priceNum <= upperBound;
  }

  const missingItems: string[] = [];
  if (!hasEnoughImages) {
    missingItems.push('Add at least 2 product images');
  }
  if (!hasDetailedDescription) {
    missingItems.push('Provide a description of at least 120 characters');
  }
  if (!hasAttributes) {
    missingItems.push('Specify product attributes or specifications');
  }

  let score = 0;
  if (hasSufficientCategoryData) {
    if (hasEnoughImages) score += 25;
    if (hasDetailedDescription) score += 25;
    if (hasAttributes) score += 25;
    if (isPriceReasonable === true) {
      score += 25;
    } else {
      missingItems.push('Price is outside typical range (0.5x–2.0x category median)');
    }
  } else {
    let passedComponents = 0;
    if (hasEnoughImages) passedComponents++;
    if (hasDetailedDescription) passedComponents++;
    if (hasAttributes) passedComponents++;
    score = Math.round((passedComponents / 3) * 100);
  }

  let label: 'poor' | 'fair' | 'good' | 'excellent';
  if (score >= 85) label = 'excellent';
  else if (score >= 70) label = 'good';
  else if (score >= 50) label = 'fair';
  else label = 'poor';

  return {
    score,
    label,
    breakdown: {
      hasEnoughImages,
      hasDetailedDescription,
      hasAttributes,
      isPriceReasonable,
    },
    missingItems,
  };
}

/**
 * Mark an approved/active product as sold and transition to archived (Phase 8b)
 */
export async function markProductAsSold(
  userId: string,
  businessId: string,
  productId: string
) {
  await verifyBusinessAccess(userId, businessId);

  return await prisma.$transaction(async (tx) => {
    const existing = await tx.marketplaceProduct.findFirst({
      where: { id: productId, businessId },
    });

    if (!existing) {
      throw new AppError(404, 'Product not found', 'PRODUCT_NOT_FOUND');
    }

    if (existing.status === 'archived' || existing.status === 'rejected' || existing.status === 'draft') {
      throw new AppError(
        400,
        `Cannot mark product as sold: product is in '${existing.status}' status. Only active/approved listings can be marked as sold.`,
        'INVALID_STATUS_TRANSITION'
      );
    }

    const now = new Date();
    const updated = await tx.marketplaceProduct.update({
      where: { id: productId },
      data: {
        status: 'archived',
        soldAt: now,
        boostEndsAt: null,
      },
    });

    // Auto-pause active boost if listing is sold out (Phase 14)
    if (tx.marketplaceBoost?.updateMany) {
      await tx.marketplaceBoost.updateMany({
        where: { productId, status: 'active' },
        data: { status: 'paused' },
      });
    }

    await logAudit(
      {
        userId,
        businessId,
        action: 'marketplace.sale_confirmed',
        resourceType: 'marketplace_product',
        resourceId: productId,
        oldData: { status: existing.status },
        newData: { status: 'archived', soldAt: now },
      },
      tx
    );

    return updated;
  });
}

/**
 * Renew an expired product listing for 90 days (Phase 8b)
 */
export async function renewProduct(
  userId: string,
  businessId: string,
  productId: string
) {
  await verifyBusinessAccess(userId, businessId);

  return await prisma.$transaction(async (tx) => {
    const existing = await tx.marketplaceProduct.findFirst({
      where: { id: productId, businessId },
    });

    if (!existing) {
      throw new AppError(404, 'Product not found', 'PRODUCT_NOT_FOUND');
    }

    if (existing.status === 'approved' || existing.status === 'pending_approval') {
      throw new AppError(
        400,
        'Product is already active and does not require renewal',
        'INVALID_STATUS_TRANSITION'
      );
    }

    if (existing.status !== 'archived') {
      throw new AppError(
        400,
        'Only archived listings that expired can be renewed',
        'INVALID_STATUS_TRANSITION'
      );
    }

    if (existing.soldAt !== null) {
      throw new AppError(400, 'Cannot renew a product that was marked as sold', 'INVALID_STATUS_TRANSITION');
    }

    // Verify listing was expired by the system job rather than archived by merchant
    const expiredAudit = await tx.auditLog.findFirst({
      where: {
        resourceType: 'marketplace_product',
        resourceId: productId,
        action: 'marketplace.listing_expired',
      },
      orderBy: { createdAt: 'desc' },
    });

    const userArchivedAudit = await tx.auditLog.findFirst({
      where: {
        resourceType: 'marketplace_product',
        resourceId: productId,
        action: 'product.archived',
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!expiredAudit || (userArchivedAudit && userArchivedAudit.createdAt > expiredAudit.createdAt)) {
      throw new AppError(
        400,
        'Only listings expired by the system can be renewed. Listings archived by merchant cannot be renewed.',
        'INVALID_STATUS_TRANSITION'
      );
    }

    const now = new Date();
    const ninetyDaysFromNow = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);

    const updated = await tx.marketplaceProduct.update({
      where: { id: productId },
      data: {
        status: 'approved',
        expiresAt: ninetyDaysFromNow,
      },
    });

    await logAudit(
      {
        userId,
        businessId,
        action: 'marketplace.listing_renewed',
        resourceType: 'marketplace_product',
        resourceId: productId,
        oldData: { status: existing.status, expiresAt: existing.expiresAt },
        newData: { status: 'approved', expiresAt: ninetyDaysFromNow },
      },
      tx
    );

    return updated;
  });
}

/**
 * Asserts that a proposed new allowance does not drop below currently active products
 * (draft, pending_approval, approved). Used for slot refund validations (Phase 9 & Phase 11).
 */
export async function assertAllowanceNotBelowLiveProducts(
  businessId: string,
  newAllowance: number,
  db: typeof prisma | Prisma.TransactionClient = prisma
): Promise<void> {
  const liveCount = await db.marketplaceProduct.count({
    where: {
      businessId,
      status: { in: ['draft', 'pending_approval', 'approved'] },
    },
  });

  if (newAllowance < liveCount) {
    throw new AppError(
      409,
      `Cannot reduce slot allowance to ${newAllowance}; business currently has ${liveCount} active product(s). Have merchant archive products first.`,
      'ALLOWANCE_BELOW_LIVE_COUNT',
      { liveCount, newAllowance }
    );
  }
}


/**
 * List all products for a business (including drafts, pending, approved, archived)
 */
export async function listForBusiness(
  userId: string,
  businessId: string,
  filters?: { status?: ProductListingStatus }
) {
  await verifyBusinessAccess(userId, businessId);

  const where: Prisma.MarketplaceProductWhereInput = { businessId };
  if (filters?.status) {
    where.status = filters.status;
  }

  const products = await prisma.marketplaceProduct.findMany({
    where,
    orderBy: { createdAt: 'desc' },
  });

  return await Promise.all(
    products.map(async (p) => {
      const listingScore = await computeListingQualityScore(p);
      return { ...p, listingScore };
    })
  );
}

/**
 * Retrieve a specific product for a business
 */
export async function getProduct(
  userId: string,
  businessId: string,
  productId: string
) {
  await verifyBusinessAccess(userId, businessId);

  const product = await prisma.marketplaceProduct.findFirst({
    where: { id: productId, businessId },
  });

  if (!product) {
    throw new AppError(404, 'Product not found', 'PRODUCT_NOT_FOUND');
  }

  const listingScore = await computeListingQualityScore(product);
  return { ...product, listingScore };
}

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Admin Moderation Operations
 * ─────────────────────────────────────────────────────────────────────────────
 */

export async function listModerationQueue(filters?: {
  status?: ProductListingStatus;
  category?: any;
  search?: string;
  page?: number;
  limit?: number;
}) {
  const status = filters?.status ?? 'pending_approval';
  const page = Math.max(Number(filters?.page) || 1, 1);
  const limit = Math.min(Math.max(Number(filters?.limit) || 20, 1), 100);
  const skip = (page - 1) * limit;

  const where: Prisma.MarketplaceProductWhereInput = {
    status,
  };

  if (filters?.category) {
    where.category = filters.category;
  }

  if (filters?.search && filters.search.trim()) {
    const q = filters.search.trim();
    where.OR = [
      { name: { contains: q, mode: 'insensitive' } },
      { description: { contains: q, mode: 'insensitive' } },
      { business: { businessName: { contains: q, mode: 'insensitive' } } },
      { business: { user: { email: { contains: q, mode: 'insensitive' } } } },
    ];
  }

  const [total, data] = await Promise.all([
    prisma.marketplaceProduct.count({ where }),
    prisma.marketplaceProduct.findMany({
      where,
      orderBy: { createdAt: 'asc' }, // Oldest-first review queue
      skip,
      take: limit,
      include: {
        business: {
          select: {
            id: true,
            businessName: true,
            ownerName: true,
            taxId: true,
            city: true,
            state: true,
            user: {
              select: {
                email: true,
                phone: true,
                isVerified: true,
              },
            },
          },
        },
      },
    }),
  ]);

  return {
    data,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    },
  };
}

export async function approveProduct(adminId: string, productId: string) {
  const product = await prisma.marketplaceProduct.findUnique({
    where: { id: productId },
    include: {
      business: {
        select: {
          businessName: true,
          user: { select: { email: true, fullName: true } },
        },
      },
    },
  });

  if (!product) {
    throw new AppError(404, 'Product not found', 'PRODUCT_NOT_FOUND');
  }

  if (product.status !== 'pending_approval') {
    throw new AppError(
      400,
      `Cannot approve product in status: ${product.status}`,
      'INVALID_STATUS_TRANSITION'
    );
  }

  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.marketplaceProduct.update({
      where: { id: productId },
      data: {
        status: 'approved',
        approvedAt: new Date(),
        approvedBy: adminId,
        rejectionReason: null,
      },
    });

    await logAudit(
      {
        userId: adminId,
        businessId: product.businessId,
        action: 'product.approved',
        resourceType: 'marketplace_product',
        resourceId: productId,
        oldData: { status: product.status },
        newData: { status: 'approved' },
      },
      tx
    );

    return u;
  });

  // Post-transaction fire-and-forget notification
  void dispatchProductApprovedEmail(productId);
  void dispatchProductEmailNotification({
    type: 'approved',
    recipientEmail: product.business.user?.email,
    recipientName:
      product.business.user?.fullName || product.business.businessName,
    productName: product.name,
    businessName: product.business.businessName,
    slug: product.slug,
    category: product.category,
    priceFormatted: `NGN ${Number(product.price).toLocaleString()}`,
  });

  return updated;
}

export async function rejectProduct(
  adminId: string,
  productId: string,
  reason: string
) {
  if (!reason || reason.trim().length < 3 || reason.trim().length > 500) {
    throw new AppError(
      400,
      'Rejection reason must be between 3 and 500 characters',
      'INVALID_REASON'
    );
  }

  const product = await prisma.marketplaceProduct.findUnique({
    where: { id: productId },
    include: {
      business: {
        select: {
          businessName: true,
          user: { select: { email: true, fullName: true } },
        },
      },
    },
  });

  if (!product) {
    throw new AppError(404, 'Product not found', 'PRODUCT_NOT_FOUND');
  }

  if (product.status !== 'pending_approval') {
    throw new AppError(
      400,
      `Cannot reject product in status: ${product.status}`,
      'INVALID_STATUS_TRANSITION'
    );
  }

  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.marketplaceProduct.update({
      where: { id: productId },
      data: {
        status: 'rejected',
        rejectionReason: reason.trim(),
      },
    });

    await logAudit(
      {
        userId: adminId,
        businessId: product.businessId,
        action: 'product.rejected',
        resourceType: 'marketplace_product',
        resourceId: productId,
        oldData: { status: product.status },
        newData: { status: 'rejected', rejectionReason: reason.trim() },
      },
      tx
    );

    return u;
  });

  // Post-transaction fire-and-forget notification
  void dispatchProductRejectedEmail(productId, reason.trim());
  void dispatchProductEmailNotification({
    type: 'rejected',
    recipientEmail: product.business.user?.email,
    recipientName:
      product.business.user?.fullName || product.business.businessName,
    productName: product.name,
    businessName: product.business.businessName,
    slug: product.slug,
    category: product.category,
    priceFormatted: `NGN ${Number(product.price).toLocaleString()}`,
    reason: reason.trim(),
  });

  return updated;
}

export async function takedownProduct(
  adminId: string,
  productId: string,
  reason: string
) {
  if (!reason || reason.trim().length < 3 || reason.trim().length > 500) {
    throw new AppError(
      400,
      'Takedown reason must be between 3 and 500 characters',
      'INVALID_REASON'
    );
  }

  const product = await prisma.marketplaceProduct.findUnique({
    where: { id: productId },
  });

  if (!product) {
    throw new AppError(404, 'Product not found', 'PRODUCT_NOT_FOUND');
  }

  if (product.status === 'archived') {
    throw new AppError(
      400,
      'Product is already archived',
      'INVALID_STATUS_TRANSITION'
    );
  }

  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.marketplaceProduct.update({
      where: { id: productId },
      data: {
        status: 'archived',
        rejectionReason: reason.trim(),
        boostEndsAt: null,
      },
    });

    // Auto-pause active boost if listing is taken down (Phase 14)
    if (tx.marketplaceBoost?.updateMany) {
      await tx.marketplaceBoost.updateMany({
        where: { productId, status: 'active' },
        data: { status: 'paused' },
      });
    }

    await logAudit(
      {
        userId: adminId,
        businessId: product.businessId,
        action: 'product.takedown',
        resourceType: 'marketplace_product',
        resourceId: productId,
        oldData: { status: product.status },
        newData: { status: 'archived', rejectionReason: reason.trim() },
      },
      tx
    );

    return u;
  });

  return updated;
}

/**
 * Admin action: Send an approved product back for merchant revision / re-review.
 * Reverts status from 'approved' to 'pending_approval' with a moderator reason.
 */
export async function sendProductBack(
  adminId: string,
  productId: string,
  reason: string
) {
  if (!reason || reason.trim().length < 3 || reason.trim().length > 500) {
    throw new AppError(
      400,
      'Reason must be between 3 and 500 characters',
      'INVALID_REASON'
    );
  }

  const product = await prisma.marketplaceProduct.findUnique({
    where: { id: productId },
  });

  if (!product) {
    throw new AppError(404, 'Product not found', 'PRODUCT_NOT_FOUND');
  }

  if (product.status !== 'approved') {
    throw new AppError(
      400,
      `Cannot send product back from status: ${product.status}`,
      'INVALID_STATUS_TRANSITION'
    );
  }

  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.marketplaceProduct.update({
      where: { id: productId },
      data: {
        status: 'pending_approval',
        approvedAt: null,
        approvedBy: null,
        rejectionReason: reason.trim(),
        boostEndsAt: null,
      },
    });

    // Auto-pause active boost if listing is sent back (Phase 14)
    if (tx.marketplaceBoost?.updateMany) {
      await tx.marketplaceBoost.updateMany({
        where: { productId, status: 'active' },
        data: { status: 'paused' },
      });
    }

    await logAudit(
      {
        userId: adminId,
        businessId: product.businessId,
        action: 'product.sent_back',
        resourceType: 'marketplace_product',
        resourceId: productId,
        oldData: { status: product.status },
        newData: { status: 'pending_approval', rejectionReason: reason.trim() },
      },
      tx
    );

    return u;
  });

  return updated;
}

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Public Read-API Operations (Marketplace Syndication)
 * ─────────────────────────────────────────────────────────────────────────────
 */


function normalizeStateTerms(stateQuery: string): string[] {
  const clean = stateQuery.trim().toLowerCase().replace(/\s+state$/, '');
  const terms = new Set<string>([clean]);
  if (clean === 'abuja' || clean === 'fct') {
    terms.add('abuja');
    terms.add('fct');
  }
  return Array.from(terms);
}

export async function listPublicFeed(params: {
  page?: number;
  limit?: number;
  category?: string;
  type?: ProductType;
  productType?: ProductType;
  search?: string;
  sort?: 'newest' | 'price_asc' | 'price_desc' | 'relevance';
  state?: string;
  minPrice?: number;
  maxPrice?: number;
  verifiedOnly?: boolean;
  hasDiscount?: boolean;
  inStockOnly?: boolean;
}) {
  const page = Math.max(Number(params.page) || 1, 1);
  const limit = Math.min(Math.max(Number(params.limit) || 24, 1), 50);
  const skip = (page - 1) * limit;

  const where: Prisma.MarketplaceProductWhereInput = {
    status: 'approved',
  };

  if (params.category) {
    where.category = params.category;
  }

  const effectiveType = params.type || params.productType;
  if (effectiveType) {
    where.productType = effectiveType;
  }

  const andConditions: Prisma.MarketplaceProductWhereInput[] = [];

  if (params.search && params.search.trim()) {
    const term = params.search.trim();
    andConditions.push({
      OR: [
        { name: { contains: term, mode: 'insensitive' } },
        { description: { contains: term, mode: 'insensitive' } },
        { business: { businessName: { contains: term, mode: 'insensitive' } } },
      ],
    });
  }

  if (params.state && params.state.trim()) {
    const terms = normalizeStateTerms(params.state);
    const stateConditions: Prisma.MarketplaceProductWhereInput[] = terms.flatMap((term) => [
      { business: { state: { contains: term, mode: 'insensitive' } } },
      { business: { city: { contains: term, mode: 'insensitive' } } },
    ]);
    andConditions.push({ OR: stateConditions });
  }

  if (params.verifiedOnly === true) {
    andConditions.push({
      business: {
        user: {
          isVerified: true,
        },
      },
    });
  }

  if (params.inStockOnly === true) {
    andConditions.push({
      OR: [
        { trackInventory: false },
        { stockQuantity: null },
        { stockQuantity: { gt: 0 } },
      ],
    });
  }

  if (params.minPrice !== undefined || params.maxPrice !== undefined) {
    const priceFilter: Prisma.DecimalFilter = {};
    if (params.minPrice !== undefined) {
      priceFilter.gte = params.minPrice;
    }
    if (params.maxPrice !== undefined) {
      priceFilter.lte = params.maxPrice;
    }
    andConditions.push({ price: priceFilter });
  }

  if (params.hasDiscount === true) {
    andConditions.push({ discountActive: true });
  }

  if (andConditions.length > 0) {
    where.AND = andConditions;
  }

  let orderBy: Prisma.MarketplaceProductOrderByWithRelationInput[] = [
    { createdAt: 'desc' },
    { id: 'desc' },
  ];

  if (params.sort === 'price_asc') {
    orderBy = [{ price: 'asc' }, { createdAt: 'desc' }, { id: 'desc' }];
  } else if (params.sort === 'price_desc') {
    orderBy = [{ price: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }];
  }

  // ─── Phase 14: Boost Ranking & Interleaving (sort=newest & page=1 only) ───────
  const isNewestSort = !params.sort || params.sort === 'newest';
  const boostIds: string[] = [];
  const boostedProducts: any[] = [];

  if (isNewestSort) {
    const now = new Date();
    // Query active boosts whose products satisfy ALL active filters AND are in stock
    const boostProductConditions: Prisma.MarketplaceProductWhereInput[] = [
      where,
      {
        OR: [
          { trackInventory: false },
          { stockQuantity: null },
          { stockQuantity: { gt: 0 } },
        ],
      },
    ];

    const activeBoosts = prisma.marketplaceBoost?.findMany
      ? await prisma.marketplaceBoost.findMany({
          where: {
            status: 'active',
            endsAt: { gt: now },
            product: {
              AND: boostProductConditions,
            },
          },
          orderBy: { endsAt: 'asc' }, // Prioritize boosts ending soonest
          include: {
            product: {
              include: {
                business: {
                  select: {
                    businessName: true,
                    city: true,
                    state: true,
                    user: {
                      select: {
                        isVerified: true,
                      },
                    },
                  },
                },
              },
            },
          },
        })
      : [];

    const categoryBoostCounts = new Map<string, number>();
    const seenProductIds = new Set<string>();

    for (const b of activeBoosts) {
      if (seenProductIds.has(b.productId)) continue;
      const cat = b.product.category;
      const count = categoryBoostCounts.get(cat) || 0;
      if (count >= 3) continue; // Cap at 3 boosts per category
      if (seenProductIds.size >= 3) break; // Cap at 3 boosts total per page

      categoryBoostCounts.set(cat, count + 1);
      seenProductIds.add(b.productId);
      boostIds.push(b.productId);
      if (page === 1) {
        boostedProducts.push({
          ...b.product,
          promoted: true,
        });
      }
    }
  }

  // Offset math (mandatory):
  // Page 1 takes `limit - boostIds.length` organic rows with skip = 0;
  // Page n > 1 takes `limit` organic rows with skip = (n - 1) * limit - boostIds.length.
  let organicSkip: number;
  let organicTake: number;

  if (isNewestSort && boostIds.length > 0) {
    if (page === 1) {
      organicSkip = 0;
      organicTake = Math.max(limit - boostIds.length, 0);
    } else {
      organicSkip = Math.max((page - 1) * limit - boostIds.length, 0);
      organicTake = limit;
    }
  } else {
    organicSkip = skip;
    organicTake = limit;
  }

  // Boosted listings are excluded from organic query so they never appear twice
  const organicWhere: Prisma.MarketplaceProductWhereInput =
    boostIds.length > 0
      ? {
          ...where,
          id: { notIn: boostIds },
        }
      : where;

  let itemsPromise: Promise<any>;
  if (params.sort === 'relevance' && params.search && params.search.trim()) {
    const term = params.search.trim().toLowerCase();
    itemsPromise = (async () => {
      const candidates = await prisma.marketplaceProduct.findMany({
        where,
        select: { id: true, name: true, createdAt: true },
      });

      candidates.sort((a, b) => {
        const aName = a.name.toLowerCase();
        const bName = b.name.toLowerCase();
        const aExact = aName === term ? 1 : 0;
        const bExact = bName === term ? 1 : 0;
        if (aExact !== bExact) return bExact - aExact;

        const aPrefix = aName.startsWith(term) ? 1 : 0;
        const bPrefix = bName.startsWith(term) ? 1 : 0;
        if (aPrefix !== bPrefix) return bPrefix - aPrefix;

        return b.createdAt.getTime() - a.createdAt.getTime();
      });

      const pageCandidates = candidates.slice(skip, skip + limit);
      const pageIds = pageCandidates.map((c) => c.id);

      if (pageIds.length === 0) return [];

      const fullItems = await prisma.marketplaceProduct.findMany({
        where: { id: { in: pageIds } },
        include: {
          business: {
            select: {
              businessName: true,
              city: true,
              state: true,
              user: {
                select: {
                  isVerified: true,
                },
              },
            },
          },
        },
      });

      const itemMap = new Map(fullItems.map((item) => [item.id, item]));
      return pageIds.map((id) => itemMap.get(id)).filter(Boolean);
    })();
  } else {
    itemsPromise =
      organicTake > 0
        ? prisma.marketplaceProduct.findMany({
            where: organicWhere,
            orderBy,
            skip: organicSkip,
            take: organicTake,
            include: {
              business: {
                select: {
                  businessName: true,
                  city: true,
                  state: true,
                  user: {
                    select: {
                      isVerified: true,
                    },
                  },
                },
              },
            },
          })
        : Promise.resolve([]);
  }

  // Facets computation over base (category + type + search), deliberately ignoring state/price/verified/discount.
  // Counts must equal what clicking them returns (Phase 5 spec).
  const facetBaseWhere: Prisma.MarketplaceProductWhereInput = {
    status: 'approved',
  };
  if (params.category) {
    facetBaseWhere.category = params.category;
  }
  if (effectiveType) {
    facetBaseWhere.productType = effectiveType;
  }
  if (params.search && params.search.trim()) {
    const term = params.search.trim();
    facetBaseWhere.OR = [
      { name: { contains: term, mode: 'insensitive' } },
      { description: { contains: term, mode: 'insensitive' } },
      { business: { businessName: { contains: term, mode: 'insensitive' } } },
    ];
  }

  // Categories facet intentionally ignores the selected category (so users can switch categories)
  // but respects type + search base.
  const categoriesFacetBaseWhere: Prisma.MarketplaceProductWhereInput = {
    status: 'approved',
  };
  if (effectiveType) {
    categoriesFacetBaseWhere.productType = effectiveType;
  }
  if (params.search && params.search.trim()) {
    const term = params.search.trim();
    categoriesFacetBaseWhere.OR = [
      { name: { contains: term, mode: 'insensitive' } },
      { description: { contains: term, mode: 'insensitive' } },
      { business: { businessName: { contains: term, mode: 'insensitive' } } },
    ];
  }

  const categoriesFacetPromise = prisma.marketplaceProduct.groupBy({
    by: ['category'],
    where: categoriesFacetBaseWhere,
    _count: true,
  });

  const facetSearchTerm = params.search && params.search.trim() ? params.search.trim() : null;
  const facetSearchPattern = facetSearchTerm ? `%${facetSearchTerm}%` : null;
  const facetRawConditions: Prisma.Sql[] = [Prisma.sql`p.status = 'approved'`];
  if (params.category && params.category.trim()) {
    facetRawConditions.push(Prisma.sql`p.category = ${params.category.trim()}`);
  }
  if (effectiveType) {
    facetRawConditions.push(Prisma.sql`p.product_type = ${effectiveType}::"ProductType"`);
  }
  if (facetSearchPattern) {
    facetRawConditions.push(
      Prisma.sql`(p.name ILIKE ${facetSearchPattern} OR p.description ILIKE ${facetSearchPattern} OR b.business_name ILIKE ${facetSearchPattern})`,
    );
  }
  const facetRawWhere = Prisma.join(facetRawConditions, ' AND ');

  const statesFacetPromise = (async () => {
    try {
      // Parameterized raw SQL (no interpolation). Uses category+type+search base; ignores state/price/verified/discount.
      return await prisma.$queryRaw<{ name: string | null; count: number }[]>(Prisma.sql`
        SELECT b.state AS name, COUNT(*)::int AS count
        FROM marketplace_products p
        JOIN businesses b ON b.id = p.business_id
        WHERE ${facetRawWhere}
          AND b.state IS NOT NULL
          AND TRIM(b.state) != ''
        GROUP BY b.state
        ORDER BY count DESC
        LIMIT 10;
      `);
    } catch (err) {
      logger.warn('Failed to compute states facet:', { err: err instanceof Error ? err.message : String(err) });
      return [];
    }
  })();

  const priceBandsFacetPromise = (async () => {
    try {
      return await prisma.$queryRaw<
        {
          under_25k: number;
          b_25k_50k: number;
          b_50k_100k: number;
          b_100k_250k: number;
          b_250k_1m: number;
          over_1m: number;
        }[]
      >(Prisma.sql`
        SELECT
          COUNT(*) FILTER (WHERE p.price < 25000)::int AS under_25k,
          COUNT(*) FILTER (WHERE p.price >= 25000 AND p.price < 50000)::int AS b_25k_50k,
          COUNT(*) FILTER (WHERE p.price >= 50000 AND p.price < 100000)::int AS b_50k_100k,
          COUNT(*) FILTER (WHERE p.price >= 100000 AND p.price < 250000)::int AS b_100k_250k,
          COUNT(*) FILTER (WHERE p.price >= 250000 AND p.price < 1000000)::int AS b_250k_1m,
          COUNT(*) FILTER (WHERE p.price >= 1000000)::int AS over_1m
        FROM marketplace_products p
        JOIN businesses b ON b.id = p.business_id
        WHERE ${facetRawWhere}
      `);
    } catch (err) {
      logger.warn('Failed to compute priceBands facet:', { err: err instanceof Error ? err.message : String(err) });
      return [];
    }
  })();

  const verifiedCountPromise = prisma.marketplaceProduct.count({
    where: {
      ...facetBaseWhere,
      business: {
        ...(((facetBaseWhere.business as Prisma.BusinessWhereInput | undefined) ?? {}) as object),
        user: {
          isVerified: true,
        },
      },
    },
  });

  const discountCountPromise = prisma.marketplaceProduct.count({
    where: {
      ...facetBaseWhere,
      discountActive: true,
    },
  });

  const [
    total,
    items,
    categoryGroups,
    stateRows,
    priceBandsRows,
    verifiedCount,
    discountCount,
  ] = await Promise.all([
    prisma.marketplaceProduct.count({ where }),
    itemsPromise,
    categoriesFacetPromise,
    statesFacetPromise,
    priceBandsFacetPromise,
    verifiedCountPromise,
    discountCountPromise,
  ]);

  const bandCounts = priceBandsRows[0] || {
    under_25k: 0,
    b_25k_50k: 0,
    b_50k_100k: 0,
    b_100k_250k: 0,
    b_250k_1m: 0,
    over_1m: 0,
  };

  const priceBands = [
    { id: 'under_25k', label: 'Under ₦25,000', count: Number(bandCounts.under_25k || 0) },
    { id: '25k_50k', label: '₦25,000 - ₦50,000', count: Number(bandCounts.b_25k_50k || 0) },
    { id: '50k_100k', label: '₦50,000 - ₦100,000', count: Number(bandCounts.b_50k_100k || 0) },
    { id: '100k_250k', label: '₦100,000 - ₦250,000', count: Number(bandCounts.b_100k_250k || 0) },
    { id: '250k_1m', label: '₦250,000 - ₦1,000,000', count: Number(bandCounts.b_250k_1m || 0) },
    { id: 'over_1m', label: 'Over ₦1,000,000', count: Number(bandCounts.over_1m || 0) },
  ];

  const categories = categoryGroups.map((g) => ({
    slug: g.category,
    count: g._count,
  }));

  const states = stateRows.map((s) => ({
    name: s.name ?? 'Other',
    count: Number(s.count || 0),
  }));

  // Interleaving on page 1 for newest sort (Phase 14):
  // Organic items are tagged promoted: false. Boosted items have promoted: true.
  // Never position 1: slot 0 (index 0) stays the newest organic listing.
  let finalItems: any[];
  if (isNewestSort && page === 1 && boostedProducts.length > 0) {
    const interleaved: any[] = [];
    let oIdx = 0;
    let bIdx = 0;

    // Slot 0 (index 0) is always the newest organic listing (unless no organic listings exist)
    if (items.length > 0) {
      interleaved.push({ ...items[oIdx++], promoted: false });
    }

    while (oIdx < items.length || bIdx < boostedProducts.length) {
      if (bIdx < boostedProducts.length) {
        interleaved.push(boostedProducts[bIdx++]);
      }
      if (oIdx < items.length) {
        interleaved.push({ ...items[oIdx++], promoted: false });
      }
    }
    finalItems = interleaved;
  } else {
    finalItems = items.map((item) => ({ ...item, promoted: false }));
  }

  const data = finalItems.map((p) => ({
    id: p.id,
    slug: p.slug,
    name: p.name,
    category: p.category,
    productType: p.productType,
    description: p.description,
    price: Number(p.price),
    compareAtPrice: p.compareAtPrice ? Number(p.compareAtPrice) : null,
    currency: p.currency,
    stockQuantity: p.stockQuantity,
    trackInventory: p.trackInventory,
    attributes: p.attributes,
    images: p.images,
    purchaseUrl: p.purchaseUrl,
    // Phase 4: contact fields intentionally omitted from list payloads (anti-scraping/attribution).
    seller: {
      businessName: p.business.businessName,
      city: p.business.city,
      state: p.business.state,
      isVerified: p.business.user?.isVerified ?? false,
    },
    createdAt: p.createdAt,
    promoted: Boolean(p.promoted),
  }));

  return {
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
    facets: {
      categories,
      states,
      priceBands,
      verifiedCount: verifiedCount || 0,
      discountCount: discountCount || 0,
    },
  };
}

/**
 * Retrieve public product detail by unique slug with related items from same seller
 */
export async function getPublicProduct(slug: string) {
  if (!slug || !slug.trim()) {
    throw new AppError(400, 'Product slug is required', 'INVALID_SLUG');
  }

  const product = await prisma.marketplaceProduct.findUnique({
    where: { slug: slug.trim() },
    include: {
      business: {
        select: {
          id: true,
          merchantId: true,
          businessName: true,
          city: true,
          state: true,
          user: {
            select: {
              isVerified: true,
            },
          },
        },
      },
    },
  });

  if (!product || product.status !== 'approved') {
    throw new AppError(404, 'Product not found', 'PRODUCT_NOT_FOUND');
  }

  // Fetch up to 4 other approved products from the same merchant
  const related = await prisma.marketplaceProduct.findMany({
    where: {
      businessId: product.businessId,
      status: 'approved',
      id: { not: product.id },
    },
    take: 4,
    orderBy: { createdAt: 'desc' },
  });

  const formattedProduct = {
    id: product.id,
    slug: product.slug,
    name: product.name,
    category: product.category,
    productType: product.productType,
    description: product.description,
    price: Number(product.price),
    compareAtPrice: product.compareAtPrice
      ? Number(product.compareAtPrice)
      : null,
    currency: product.currency,
    stockQuantity: product.stockQuantity,
    trackInventory: product.trackInventory,
    attributes: product.attributes,
    images: product.images,
    contactPhone: product.contactPhone,
    contactWhatsapp: product.contactWhatsapp,
    purchaseUrl: product.purchaseUrl,
    seller: {
      id: product.business.id,
      merchantId: product.business.merchantId,
      businessName: product.business.businessName,
      city: product.business.city,
      state: product.business.state,
      isVerified: product.business.user?.isVerified ?? false,
    },
    createdAt: product.createdAt,
  };

  const formattedRelated = related.map((r) => ({
    id: r.id,
    slug: r.slug,
    name: r.name,
    category: r.category,
    productType: r.productType,
    price: Number(r.price),
    compareAtPrice: r.compareAtPrice ? Number(r.compareAtPrice) : null,
    currency: r.currency,
    images: r.images,
  }));

  return {
    product: formattedProduct,
    relatedProducts: formattedRelated,
  };
}

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Phase 4 — Anonymous Listing Event Recording
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Records a marketplace interaction event (view, whatsapp_click, etc.) for a
 * given approved listing. Never throws — all errors are swallowed so a beacon
 * failure never disrupts the user experience.
 *
 * Session deduplication: for `view` and `boost_impression`, a daily HMAC-SHA256
 * hash of "ip|userAgent|YYYY-MM-DD" prevents double-counting repeat visitors on
 * the same day. The @@unique([productId, eventType, sessionHash]) constraint
 * in the DB handles race conditions gracefully (skipDuplicates).
 */
export async function recordListingEvent(params: {
  productId: string;
  eventType: 'view' | 'whatsapp_click' | 'call_click' | 'share_click' | 'storefront_view' | 'boost_impression';
  ip: string;
  userAgent: string;
  source?: string;
}): Promise<void> {
  try {
    const { productId, eventType, ip, userAgent, source } = params;

    // Verify product exists and is approved
    const product = await prisma.marketplaceProduct.findUnique({
      where: { id: productId },
      select: { id: true, businessId: true, status: true },
    });

    if (!product || product.status !== 'approved') {
      throw new AppError(404, 'Product not found', 'PRODUCT_NOT_FOUND');
    }

    const secret = process.env.MARKETPLACE_SESSION_SECRET ?? '';
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    warnIfMarketplaceSessionSecretMissing(secret);

    // Compute session hash only for deduplicated event types
    const needsSessionHash = eventType === 'view' || eventType === 'boost_impression';
    const sessionHash = needsSessionHash
      ? crypto
          .createHmac('sha256', secret)
          .update(`${ip}|${userAgent}|${today}`)
          .digest('hex')
          .slice(0, 32)
      : null;

    if (eventType === 'view') {
      const result = await prisma.marketplaceListingEvent.createMany({
        data: [
          {
            productId,
            businessId: product.businessId,
            eventType: 'view',
            sessionHash,
            source: source ?? null,
            occurredAt: new Date(),
          },
        ],
        skipDuplicates: true,
      });

      if (result.count > 0) {
        await prisma.marketplaceProduct.update({
          where: { id: productId },
          data: { viewCount: { increment: 1 } },
        });
      }
    } else if (eventType === 'whatsapp_click' || eventType === 'call_click') {
      await prisma.marketplaceListingEvent.create({
        data: {
          productId,
          businessId: product.businessId,
          eventType,
          sessionHash: null,
          source: source ?? null,
          occurredAt: new Date(),
        },
      });

      await prisma.marketplaceProduct.update({
        where: { id: productId },
        data: {
          contactCount: { increment: 1 },
          lastContactedAt: new Date(),
        },
      });
    } else if (eventType === 'boost_impression') {
      // Phase 14: Find active boost and increment impressions on the boost record
      const activeBoost = prisma.marketplaceBoost?.findFirst
        ? await prisma.marketplaceBoost.findFirst({
            where: {
              productId,
              status: 'active',
              endsAt: { gt: new Date() },
            },
          })
        : null;

      if (activeBoost && prisma.marketplaceBoost?.update) {
        await prisma.marketplaceBoost.update({
          where: { id: activeBoost.id },
          data: {
            impressions: { increment: 1 },
          },
        });
      }

      await prisma.marketplaceListingEvent.createMany({
        data: [
          {
            productId,
            businessId: product.businessId,
            eventType: 'boost_impression',
            sessionHash,
            source: source ?? null,
            occurredAt: new Date(),
          },
        ],
        skipDuplicates: true,
      });
      // No counter increment on MarketplaceProduct for boost_impression
    } else {
      // share_click, storefront_view — insert event only, no counter
      await prisma.marketplaceListingEvent.create({
        data: {
          productId,
          businessId: product.businessId,
          eventType,
          sessionHash: null,
          source: source ?? null,
          occurredAt: new Date(),
        },
      });
    }
  } catch (err) {
    if (err instanceof AppError) {
      throw err; // Re-throw 404s so the controller can respond correctly
    }
    logger.warn('recordListingEvent: unexpected error (swallowed)', { err });
  }
}

/**
 * Phase 7: WhatsApp safe-redirect URL generator and click tracker.
 * Anti-scraping: hides merchant contact numbers from public listing payloads.
 * Records whatsapp_click interaction server-side and increments merchant contact counters.
 */
export async function getPublicWhatsAppRedirectUrl(params: {
  productId: string;
  ip: string;
  userAgent: string;
  source?: string;
}): Promise<string> {
  const { productId, ip, userAgent, source } = params;

  if (!productId || !productId.trim()) {
    throw new AppError(400, 'Product ID is required', 'INVALID_PRODUCT_ID');
  }

  const product = await prisma.marketplaceProduct.findUnique({
    where: { id: productId.trim() },
    select: {
      id: true,
      name: true,
      price: true,
      currency: true,
      slug: true,
      status: true,
      contactWhatsapp: true,
      contactPhone: true,
      businessId: true,
    },
  });

  if (!product || product.status !== 'approved') {
    throw new AppError(404, 'Product not found', 'PRODUCT_NOT_FOUND');
  }

  const rawPhone = product.contactWhatsapp || product.contactPhone || '';
  const cleanPhone = rawPhone.replace(/[^0-9+]/g, '').replace(/^0/, '+234');
  const digitsOnly = cleanPhone.replace('+', '').trim();

  if (!digitsOnly || digitsOnly.length < 7) {
    throw new AppError(404, 'Seller contact information is not available', 'CONTACT_UNAVAILABLE');
  }

  // Record click server-side before redirecting (swallow unexpected analytics errors so buyer redirect UX never breaks)
  try {
    await prisma.marketplaceListingEvent.create({
      data: {
        productId: product.id,
        businessId: product.businessId,
        eventType: 'whatsapp_click',
        sessionHash: null,
        source: source ?? 'whatsapp_redirect',
        occurredAt: new Date(),
      },
    });

    await prisma.marketplaceProduct.update({
      where: { id: product.id },
      data: {
        contactCount: { increment: 1 },
        lastContactedAt: new Date(),
      },
    });
  } catch (err) {
    logger.warn('getPublicWhatsAppRedirectUrl: failed to record click event (swallowed)', { err });
  }

  // Build canonical listing link and WhatsApp message
  const baseUrl =
    process.env.PUBLIC_MARKETPLACE_URL ||
    process.env.MARKETPLACE_URL ||
    (config?.publicUrls?.appBase ? config.publicUrls.appBase : 'https://wallx.ng');
  const cleanBase = baseUrl.replace(/\/+$/, '');
  const listingUrl = `${cleanBase}/p/${product.slug}`;
  const formattedPrice = `₦${Number(product.price).toLocaleString()}`;
  const whatsappMsg = `Hello! I saw your product "${product.name}" (${formattedPrice}) on WallX Marketplace and would like to buy/inquire.\n\nListing: ${listingUrl}`;

  return `https://wa.me/${digitsOnly}?text=${encodeURIComponent(whatsappMsg)}`;
}

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Phase 7 — Seller Storefront
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Retrieves a merchant's public storefront profile and approved listings.
 * Resolves by either merchantId (e.g. MERCH-12345) or business UUID.
 *
 * Edge cases:
 * - 404 if business does not exist
 * - Returns ONLY approved listings (drafts, pending, archived, rejected excluded)
 * - Must NOT leak contactPhone in the listings list payload (anti-scraping)
 * - Total count matches count of approved products for this business
 */
export async function getSellerStorefront(identifier: string) {
  if (!identifier || !identifier.trim()) {
    throw new AppError(400, 'Seller identifier is required', 'INVALID_PARAM');
  }

  const trimmed = identifier.trim();
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed);

  const business = await prisma.business.findFirst({
    where: isUuid
      ? { OR: [{ id: trimmed }, { merchantId: trimmed }] }
      : { merchantId: trimmed },
    include: {
      user: {
        select: {
          isVerified: true,
        },
      },
    },
  });

  if (!business) {
    throw new AppError(404, 'Seller not found', 'SELLER_NOT_FOUND');
  }

  const [total, products] = await Promise.all([
    prisma.marketplaceProduct.count({
      where: {
        businessId: business.id,
        status: 'approved',
      },
    }),
    prisma.marketplaceProduct.findMany({
      where: {
        businessId: business.id,
        status: 'approved',
      },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  // Single seller-profile contact for the storefront CTA (not a list payload). Keep actual WhatsApp only.
  const representativeProduct = products.find((p) => p.contactWhatsapp);
  const contactWhatsapp = representativeProduct?.contactWhatsapp ?? null;

  const seller = {
    id: business.id,
    merchantId: business.merchantId,
    businessName: business.businessName,
    city: business.city,
    state: business.state,
    address: business.address,
    logoUrl: business.logoUrl,
    isVerified: business.user?.isVerified ?? false,
    createdAt: business.createdAt,
    contactWhatsapp,
  };

  const formattedProducts = products.map((p) => ({
    id: p.id,
    slug: p.slug,
    name: p.name,
    category: p.category,
    productType: p.productType,
    description: p.description,
    price: Number(p.price),
    compareAtPrice: p.compareAtPrice ? Number(p.compareAtPrice) : null,
    currency: p.currency,
    stockQuantity: p.stockQuantity,
    trackInventory: p.trackInventory,
    attributes: p.attributes,
    images: p.images,
    // Phase 4/7: contactPhone/contactWhatsapp omitted from storefront listing items (anti-scraping).
    purchaseUrl: p.purchaseUrl,
    seller: {
      id: business.id,
      merchantId: business.merchantId,
      businessName: business.businessName,
      city: business.city,
      state: business.state,
      isVerified: business.user?.isVerified ?? false,
    },
    createdAt: p.createdAt,
  }));

  return {
    seller,
    products: formattedProducts,
    total,
  };
}

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Email Dispatch Wrapper (Fire-and-forget, post-commit)
 * ─────────────────────────────────────────────────────────────────────────────
 */

interface ProductEmailPayload {
  type: 'approved' | 'rejected';
  recipientEmail?: string | null;
  recipientName?: string;
  productName: string;
  reason?: string;
}

export async function dispatchProductEmailNotification(
  payload: ProductEmailPayload & {
    businessName?: string;
    slug?: string;
    category?: string;
    priceFormatted?: string;
  }
) {
  if (!payload.recipientEmail) return { delivered: false };

  try {
    const baseUrl = 'http://localhost:5173';
    let result = { delivered: false };

    if (payload.type === 'approved') {
      const emailContent = renderMarketplaceProductApprovedEmail({
        recipientName: payload.recipientName || 'Merchant',
        businessName: payload.businessName || 'Your Business',
        productName: payload.productName,
        category: payload.category || 'Goods',
        priceFormatted: payload.priceFormatted || 'NGN',
        productSlug: payload.slug || '',
        productUrl: `${baseUrl}/marketplace/products/${payload.slug || ''}`,
        dashboardLink: `${baseUrl}/inventory`,
        approvalDate: new Date().toLocaleDateString('en-NG'),
      });

      result = await sendEmail({
        to: payload.recipientEmail,
        subject: emailContent.subject,
        html: emailContent.html,
        text: emailContent.text,
      });
    } else {
      const emailContent = renderMarketplaceProductRejectedEmail({
        recipientName: payload.recipientName || 'Merchant',
        businessName: payload.businessName || 'Your Business',
        productName: payload.productName,
        category: payload.category || 'Goods',
        priceFormatted: payload.priceFormatted || 'NGN',
        rejectionReason:
          payload.reason || 'Changes requested during moderation review.',
        dashboardLink: `${baseUrl}/inventory`,
        reviewDate: new Date().toLocaleDateString('en-NG'),
      });

      result = await sendEmail({
        to: payload.recipientEmail,
        subject: emailContent.subject,
        html: emailContent.html,
        text: emailContent.text,
      });
    }

    logger.info(
      `Marketplace notification [${payload.type}] to ${payload.recipientEmail} for "${payload.productName}" (delivered=${result.delivered})`
    );

    return result;
  } catch (err: any) {
    logger.warn(`Failed to dispatch marketplace status email: ${err.message}`);
    return { delivered: false };
  }
}

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Product Media Uploads & Cloudinary Integration
 * ─────────────────────────────────────────────────────────────────────────────
 */

export async function uploadImage(
  userId: string,
  businessId: string,
  file: Express.Multer.File
): Promise<{ url: string; publicId: string }> {
  await verifyBusinessAccess(userId, businessId);

  if (!file || !file.buffer || file.buffer.length === 0) {
    throw new AppError(400, 'Empty or invalid file uploaded', 'EMPTY_FILE');
  }

  if (file.buffer.length > MAX_PRODUCT_IMAGE_BYTES) {
    throw new AppError(400, 'File size exceeds 5MB limit', 'FILE_TOO_LARGE');
  }

  if (!isAllowedProductImage(file.mimetype, file.originalname)) {
    throw new AppError(
      400,
      'Invalid file type. Only JPEG, PNG, or WebP images are permitted.',
      'INVALID_FILE_TYPE'
    );
  }

  if (!isValidImageBuffer(file.buffer)) {
    throw new AppError(
      400,
      'File content does not match allowed image formats (corrupted or spoofed binary).',
      'CORRUPTED_IMAGE'
    );
  }

  return await uploadProductImageToCloudinary(businessId, file.buffer, file.mimetype);
}

export async function deleteImage(
  userId: string,
  businessId: string,
  publicId: string
): Promise<void> {
  await verifyBusinessAccess(userId, businessId);
  await deleteProductImageFromCloudinary(publicId);
}

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Phase 15 — Merchant Marketplace Analytics
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Computes per-product views, contacts, rank within category, and a continuous
 * daily timeseries (7 or 30 days) from MarketplaceListingEvent.
 *
 * Invariants:
 * - Pure derivation from MarketplaceListingEvent and MarketplaceProduct.
 * - Zero events returns an array of zeroed points, never null or skipped days.
 * - Gap-fills missing dates with 0 counts.
 * - Category rank computed across live (approved) listings in the same category.
 * - isLocked is NOT checked (strictly tax-related, marketplace analytics is never blocked).
 */

export interface MarketplaceDailySeriesPoint {
  date: string; // YYYY-MM-DD
  views: number;
  contacts: number;
  impressions: number;
}

export interface MarketplaceProductAnalyticsItem {
  id: string;
  name: string;
  slug: string;
  category: string;
  status: string;
  price: number;
  images: string[];
  createdAt: Date;
  viewCount: number;
  contactCount: number;
  impressionsCount: number;
  rankInCategory: number | null;
  categoryTotalApproved: number;
}

export interface MarketplaceAnalyticsResponse {
  summary: {
    totalProducts: number;
    liveProducts: number;
    totalViews: number;
    totalContacts: number;
    totalImpressions: number;
    conversionRate: number; // percentage, e.g. 8.5%
  };
  timeseries: MarketplaceDailySeriesPoint[];
  products: MarketplaceProductAnalyticsItem[];
  periodDays: number;
}

export async function getMarketplaceAnalytics(
  userId: string,
  businessId: string,
  daysParam = 30
): Promise<MarketplaceAnalyticsResponse> {
  await verifyBusinessAccess(userId, businessId);

  const days = daysParam === 7 ? 7 : 30;
  const now = new Date();
  // Midnight UTC boundary for clean, deterministic date buckets
  const startDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - (days - 1)));

  // Pre-seed continuous date buckets for gap-filling
  const dailyMap = new Map<string, MarketplaceDailySeriesPoint>();
  for (let i = 0; i < days; i++) {
    const d = new Date(startDate.getTime() + i * 24 * 60 * 60 * 1000);
    const dateStr = d.toISOString().split('T')[0];
    dailyMap.set(dateStr, {
      date: dateStr,
      views: 0,
      contacts: 0,
      impressions: 0,
    });
  }

  // Fetch business products
  const products = await prisma.marketplaceProduct.findMany({
    where: { businessId },
    orderBy: { createdAt: 'desc' },
  });

  // Fetch all events for this business in the requested period
  const events = prisma.marketplaceListingEvent?.findMany
    ? await prisma.marketplaceListingEvent.findMany({
        where: {
          businessId,
          occurredAt: { gte: startDate },
        },
        select: {
          productId: true,
          eventType: true,
          occurredAt: true,
        },
      })
    : [];

  // Populate daily timeseries
  for (const ev of events) {
    const dateStr = ev.occurredAt.toISOString().split('T')[0];
    const point = dailyMap.get(dateStr);
    if (point) {
      if (ev.eventType === 'view') {
        point.views++;
      } else if (ev.eventType === 'whatsapp_click' || ev.eventType === 'call_click') {
        point.contacts++;
      } else if (ev.eventType === 'boost_impression') {
        point.impressions++;
      }
    }
  }

  const timeseries = Array.from(dailyMap.values());

  // Distinct categories among business products to batch category count queries
  const distinctCategories = Array.from(new Set(products.map((p) => p.category)));
  const categoryTotals = new Map<string, number>();

  await Promise.all(
    distinctCategories.map(async (cat) => {
      const count = await prisma.marketplaceProduct.count({
        where: { category: cat, status: 'approved' },
      });
      categoryTotals.set(cat, count);
    })
  );

  // Compute per-product metrics and category rank
  const productAnalytics: MarketplaceProductAnalyticsItem[] = await Promise.all(
    products.map(async (p) => {
      let rankInCategory: number | null = null;
      if (p.status === 'approved') {
        const newerCount = await prisma.marketplaceProduct.count({
          where: {
            category: p.category,
            status: 'approved',
            createdAt: { gt: p.createdAt },
          },
        });
        rankInCategory = newerCount + 1;
      }

      // Sum boost impressions for this product if available
      let impressionsCount = 0;
      if (prisma.marketplaceBoost?.aggregate) {
        try {
          const agg = await prisma.marketplaceBoost.aggregate({
            where: { productId: p.id },
            _sum: { impressions: true },
          });
          impressionsCount = agg._sum?.impressions ?? 0;
        } catch {
          impressionsCount = 0;
        }
      }

      return {
        id: p.id,
        name: p.name,
        slug: p.slug,
        category: p.category,
        status: p.status,
        price: Number(p.price),
        images: p.images,
        createdAt: p.createdAt,
        viewCount: p.viewCount ?? 0,
        contactCount: p.contactCount ?? 0,
        impressionsCount,
        rankInCategory,
        categoryTotalApproved: categoryTotals.get(p.category) ?? 0,
      };
    })
  );

  const totalViews = products.reduce((acc, p) => acc + (p.viewCount ?? 0), 0);
  const totalContacts = products.reduce((acc, p) => acc + (p.contactCount ?? 0), 0);
  const totalImpressions = timeseries.reduce((acc, d) => acc + d.impressions, 0);
  const liveProducts = products.filter((p) => p.status === 'approved').length;
  const conversionRate = totalViews > 0 ? Math.round((totalContacts / totalViews) * 1000) / 10 : 0;

  return {
    summary: {
      totalProducts: products.length,
      liveProducts,
      totalViews,
      totalContacts,
      totalImpressions,
      conversionRate,
    },
    timeseries,
    products: productAnalytics,
    periodDays: days,
  };
}

