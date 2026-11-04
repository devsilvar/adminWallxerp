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

    // 2. Count non-archived products for this business
    const activeCount = await tx.marketplaceProduct.count({
      where: {
        businessId,
        status: { not: 'archived' },
      },
    });

    if (activeCount >= 3) {
      throw new AppError(
        400,
        'Maximum of 3 products permitted per business',
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

    // Check if any core field changed
    let coreFieldChanged = false;

    if (patch.name !== undefined && patch.name !== existing.name) {
      coreFieldChanged = true;
    }
    if (
      patch.price !== undefined &&
      Number(patch.price) !== Number(existing.price)
    ) {
      coreFieldChanged = true;
    }
    if (patch.compareAtPrice !== undefined) {
      const existingComp =
        existing.compareAtPrice != null
          ? Number(existing.compareAtPrice)
          : null;
      const patchComp =
        patch.compareAtPrice != null ? Number(patch.compareAtPrice) : null;
      if (existingComp !== patchComp) {
        coreFieldChanged = true;
      }
    }
    if (patch.images !== undefined) {
      const existingImages = existing.images || [];
      if (JSON.stringify(existingImages) !== JSON.stringify(patch.images)) {
        coreFieldChanged = true;
      }
    }
    if (patch.category !== undefined && patch.category !== existing.category) {
      coreFieldChanged = true;
    }
    if (
      patch.productType !== undefined &&
      patch.productType !== existing.productType
    ) {
      coreFieldChanged = true;
    }
    if (
      patch.description !== undefined &&
      patch.description !== existing.description
    ) {
      coreFieldChanged = true;
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

    // Bait-and-switch demotion: resetting approved item when core fields mutate
    if (existing.status === 'approved' && coreFieldChanged) {
      updateData.status = 'pending_approval';
      updateData.approvedAt = null;
      updateData.approvedBy = null;
      updateData.rejectionReason = null;
      logger.info(
        `Product ${productId} core fields modified while approved. Demoting status to pending_approval.`
      );
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

    if (existing.status !== 'draft' && existing.status !== 'rejected') {
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

    const updated = await tx.marketplaceProduct.update({
      where: { id: productId },
      data: {
        status: 'pending_approval',
        rejectionReason: null,
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
      },
    });

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

  return await prisma.marketplaceProduct.findMany({
    where,
    orderBy: { createdAt: 'desc' },
  });
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

  return product;
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
      },
    });

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
 * ─────────────────────────────────────────────────────────────────────────────
 * Public Read-API Operations (Marketplace Syndication)
 * ─────────────────────────────────────────────────────────────────────────────
 */

export async function listPublicFeed(params: {
  page?: number;
  limit?: number;
  category?: string;
  type?: ProductType;
  productType?: ProductType;
  search?: string;
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

  if (params.search && params.search.trim()) {
    const term = params.search.trim();
    where.OR = [
      { name: { contains: term, mode: 'insensitive' } },
      { description: { contains: term, mode: 'insensitive' } },
      { business: { businessName: { contains: term, mode: 'insensitive' } } },
    ];
  }

  const [total, items] = await Promise.all([
    prisma.marketplaceProduct.count({ where }),
    prisma.marketplaceProduct.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
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
    }),
  ]);

  const data = items.map((p) => ({
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
    contactPhone: p.contactPhone,
    contactWhatsapp: p.contactWhatsapp,
    purchaseUrl: p.purchaseUrl,
    seller: {
      businessName: p.business.businessName,
      city: p.business.city,
      state: p.business.state,
      isVerified: p.business.user?.isVerified ?? false,
    },
    createdAt: p.createdAt,
  }));

  return {
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
  };
}

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
