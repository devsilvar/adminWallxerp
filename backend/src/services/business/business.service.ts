import prisma, { TxClient } from '@/lib/prisma';
import logger from '@/lib/logger';
import { AppError } from '@/middleware/errorHandler';
import { CreateBusinessInput, UpdateBusinessInput } from '@/validators/business.validator';
import { logAudit } from '@/lib/audit';
import { invalidateOwnershipCache, verifyBusinessAccess } from '@/lib/ownership';
import { resolvePermissions } from '@/services/team/permission.service';
import type { BusinessRole } from '@prisma/client';
import {
  uploadLogoToCloudinary,
  deleteLogoFromCloudinary,
  isAllowedLogoFile,
  MAX_LOGO_BYTES,
} from '@/lib/cloudinary';
import { checkBusinessLimit } from '@/services/subscription/subscription-guard.service';
import config from '@/config';
import { toNumber } from '@/shared/helpers';



async function generateMerchantId(db: TxClient | typeof prisma): Promise<string> {
  const PREFIX = 'PMTW';
  const PAD_LENGTH = 7;

  // Find all businesses with the standard PMTW prefix
  const pmtwBusinesses = await db.business.findMany({
    where: { merchantId: { startsWith: PREFIX } },
    select: { merchantId: true },
  });

  let maxNum = 0;
  for (const b of pmtwBusinesses) {
    if (!b.merchantId) continue;
    const numPart = b.merchantId.slice(PREFIX.length);
    const parsed = parseInt(numPart, 10);
    if (!isNaN(parsed) && parsed > maxNum) {
      maxNum = parsed;
    }
  }

  let candidateNum = maxNum + 1;
  let candidate = `${PREFIX}${String(candidateNum).padStart(PAD_LENGTH, '0')}`;

  // Defend against race conditions or pre-existing matching IDs
  while (await db.business.findUnique({ where: { merchantId: candidate }, select: { id: true } })) {
    candidateNum++;
    candidate = `${PREFIX}${String(candidateNum).padStart(PAD_LENGTH, '0')}`;
  }

  return candidate;
}

export async function createBusiness(userId: string, input: CreateBusinessInput, tx?: TxClient) {
  const db = tx ?? prisma;

  // Only owner accounts can register new businesses.
  // Team members who only belong to businesses where they are non-owners cannot register new businesses.
  const [ownedCount, nonOwnerMemberships] = await Promise.all([
    db.business.count({ where: { userId } }),
    db.businessMember.count({ where: { userId, role: { not: 'owner' }, isActive: true } }),
  ]);

  if (ownedCount === 0 && nonOwnerMemberships > 0) {
    throw new AppError(
      403,
      'Only business owner accounts can register new businesses. Team member accounts can only access businesses they are invited to manage.',
      'ONLY_OWNER_CAN_CREATE_BUSINESS'
    );
  }

  const merchantId = await generateMerchantId(db);

  // Fetch user to inherit central credentials if already established
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      primaryBusinessId: true,
      settlementBankCode: true,
      settlementBankName: true,
      settlementAccountNumber: true,
      settlementAccountName: true,
      settlementConnectedAt: true,
      paystackCustomerCode: true,
      virtualAccountNumber: true,
      virtualAccountBank: true,
      subscriptionTier: true,
    },
  });

  // Enforce tier business limit
  const businessLimit = await checkBusinessLimit(userId, user?.subscriptionTier, db);
  if (!businessLimit.allowed) {
    throw new AppError(
      403,
      `Your ${businessLimit.tier} plan allows a maximum of ${businessLimit.max} businesses. Upgrade your plan to create more.`,
      'BUSINESS_LIMIT_REACHED',
      { currentPlan: businessLimit.tier, maxBusinesses: businessLimit.max }
    );
  }

  const business = await db.business.create({
    data: {
      ...input,
      userId,
      merchantId,
      // Auto-inherit central DVA credentials
      paystackCustomerCode: user?.paystackCustomerCode ?? null,
      virtualAccountNumber: user?.virtualAccountNumber ?? null,
      virtualAccountBank: user?.virtualAccountBank ?? null,
    },
  });

  // Auto-create owner membership
  await db.businessMember.create({
    data: {
      businessId: business.id,
      userId,
      role: 'owner',
      isActive: true,
    },
  });

  // Designate as primary business if none set yet
  if (user && !user.primaryBusinessId) {
    await db.user.update({
      where: { id: userId },
      data: { primaryBusinessId: business.id },
    });
  }

  await logAudit({
    userId,
    businessId: business.id,
    action: 'business.created',
    resourceType: 'business',
    resourceId: business.id,
    newData: { businessName: input.businessName, ownerName: input.ownerName },
  }, tx);

  logger.info('Business created', { businessId: business.id, userId });

  return {
    ...business,
    myRole: 'owner' as BusinessRole,
    myPermissions: resolvePermissions('owner' as BusinessRole),
    memberCount: 1,
  };
}

export async function listBusinesses(userId: string, page: number, limit: number) {
  const offset = (page - 1) * limit;

  // Find all businesses where user is owner OR active team member
  const membershipBusinessIds = await prisma.businessMember.findMany({
    where: { userId, isActive: true },
    select: { businessId: true, role: true, permissions: true },
  });

  const businessIds = membershipBusinessIds.map((m) => m.businessId);
  const membershipMap = new Map(
    membershipBusinessIds.map((m) => [
      m.businessId,
      {
        role: m.role,
        permissions: (m.permissions as Record<string, boolean>) ?? null,
      },
    ])
  );

  // Also include businesses where user is owner (for backward compatibility with pre-migration data)
  const [businesses, total] = await Promise.all([
    prisma.business.findMany({
      where: {
        OR: [
          { id: { in: businessIds } },
          { userId },
        ],
      },
      skip: offset,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { members: { where: { isActive: true } } } },
      },
    }),
    prisma.business.count({
      where: {
        OR: [
          { id: { in: businessIds } },
          { userId },
        ],
      },
    }),
  ]);

  const totalPages = Math.ceil(total / limit);

  return {
    data: businesses.map((b) => {
      const isOwner = b.userId === userId;
      const memberInfo = membershipMap.get(b.id);
      const myRole = isOwner
        ? ('owner' as BusinessRole)
        : (memberInfo?.role ?? ('viewer' as BusinessRole));
      const overrides = isOwner ? null : (memberInfo?.permissions ?? null);
      return {
        ...b,
        voucherBonusPct: toNumber(b.voucherBonusPct as any),
        voucherAdjustmentThreshold:
          b.voucherAdjustmentThreshold !== null && b.voucherAdjustmentThreshold !== undefined
            ? toNumber(b.voucherAdjustmentThreshold as any)
            : 50000,
        _count: undefined,
        myRole,
        myPermissions: resolvePermissions(myRole, overrides),
        memberCount: b._count?.members ?? 1,
      };
    }),
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    },
  };
}

export async function getBusinessById(userId: string, businessId: string) {
  const access = await verifyBusinessAccess(userId, businessId);

  const memberCount = await prisma.businessMember.count({
    where: { businessId, isActive: true },
  });

  return {
    ...access.business,
    voucherBonusPct: toNumber(access.business.voucherBonusPct as any),
    voucherAdjustmentThreshold:
      access.business.voucherAdjustmentThreshold !== null &&
      access.business.voucherAdjustmentThreshold !== undefined
        ? toNumber(access.business.voucherAdjustmentThreshold as any)
        : 50000,
    myRole: access.role,
    myPermissions: access.permissions,
    memberCount,
  };
}

export async function updateBusiness(
  userId: string,
  businessId: string,
  input: UpdateBusinessInput,
  tx?: TxClient
) {
  const db = tx ?? prisma;

  const { business: existingBusiness } = await verifyBusinessAccess(userId, businessId, 'settings.update', db);

  const updated = await db.business.update({
    where: { id: businessId },
    data: input,
  });

  await logAudit({
    userId,
    businessId,
    action: 'business.updated',
    resourceType: 'business',
    resourceId: businessId,
    oldData: { businessName: existingBusiness.businessName },
    newData: input as Record<string, any>,
  }, tx);

  // Invalidate ownership cache after update
  invalidateOwnershipCache(businessId, userId);

  logger.info('Business updated', { businessId, userId });

  return updated;
}

export async function deleteBusiness(userId: string, businessId: string, tx?: TxClient) {
  const db = tx ?? prisma;

  const { business } = await verifyBusinessAccess(userId, businessId, 'business.delete', db);

  // Cascade delete logo from Cloudinary if present
  if (business.logoPublicId) {
    await deleteLogoFromCloudinary(business.logoPublicId).catch(() => {});
  }

  await db.business.delete({
    where: { id: businessId },
  });

  await logAudit({
    userId,
    action: 'business.deleted',
    resourceType: 'business',
    resourceId: businessId,
    oldData: { businessId, businessName: business.businessName },
  }, tx);

  // Invalidate ownership cache after deletion
  invalidateOwnershipCache(businessId, userId);

  logger.info('Business deleted', { businessId, userId });

  return { message: 'Business deleted successfully' };
}

export async function uploadLogo(
  userId: string,
  businessId: string,
  file: { buffer: Buffer; mimetype: string; size: number; originalname?: string },
) {
  if (!isAllowedLogoFile(file.mimetype, file.originalname)) {
    throw new AppError(400, 'Only JPEG, PNG, WebP or SVG images are accepted.', 'LOGO_BAD_TYPE');
  }
  if (file.size > MAX_LOGO_BYTES) {
    throw new AppError(400, 'Logo must be 5 MB or smaller.', 'LOGO_TOO_LARGE');
  }

  const { business } = await verifyBusinessAccess(userId, businessId, 'settings.update');

  const { url, publicId } = await uploadLogoToCloudinary(
    businessId,
    file.buffer,
    file.mimetype,
    business.logoPublicId,
  );

  const updated = await prisma.business.update({
    where: { id: businessId },
    data: { logoUrl: url, logoPublicId: publicId },
  });

  logAudit({
    userId,
    businessId,
    action: 'business.logo_uploaded',
    resourceType: 'business',
    resourceId: businessId,
    newData: { logoUrl: url },
  });

  invalidateOwnershipCache(businessId, userId);
  logger.info('Business logo uploaded', { businessId, userId });

  return updated;
}

export async function removeLogo(userId: string, businessId: string) {
  const { business } = await verifyBusinessAccess(userId, businessId, 'settings.update');
  if (!business.logoUrl) throw new AppError(404, 'No logo to remove', 'LOGO_NOT_FOUND');

  if (business.logoPublicId) {
    await deleteLogoFromCloudinary(business.logoPublicId);
  }

  const updated = await prisma.business.update({
    where: { id: businessId },
    data: { logoUrl: null, logoPublicId: null },
  });

  logAudit({
    userId,
    businessId,
    action: 'business.logo_deleted',
    resourceType: 'business',
    resourceId: businessId,
  });

  invalidateOwnershipCache(businessId, userId);
  logger.info('Business logo removed', { businessId, userId });

  return updated;
}

export async function updateBusinessVoucherBonus(userId: string, businessId: string, voucherBonusPct: number) {
  await verifyBusinessAccess(userId, businessId, 'settings.update');
  if (voucherBonusPct < 0 || voucherBonusPct > config.voucher.maxBonusPct) {
    throw new AppError(400, `Voucher bonus must be between 0 and ${config.voucher.maxBonusPct}%`, 'INVALID_BONUS_PCT');
  }
  const business = await prisma.business.update({
    where: { id: businessId },
    data: { voucherBonusPct },
    select: { id: true, businessName: true, voucherBonusPct: true },
  });
  await logAudit({
    userId,
    businessId,
    action: 'business.voucher_bonus_updated',
    resourceType: 'business',
    resourceId: businessId,
    newData: { voucherBonusPct },
  });
  invalidateOwnershipCache(businessId, userId);
  return { ...business, voucherBonusPct: toNumber(business.voucherBonusPct as any) };
}

export async function updateBusinessVoucherAdjustmentThreshold(
  userId: string,
  businessId: string,
  threshold: number
) {
  // Explicit verifyBusinessAccess without 'settings.update' permission so managers are not blocked by FINANCIAL_OWNER_ONLY
  const { role } = await verifyBusinessAccess(userId, businessId);
  if (role !== 'owner' && role !== 'manager') {
    throw new AppError(403, 'Only managers and owners can change the voucher threshold', 'PERMISSION_DENIED');
  }

  if (typeof threshold !== 'number' || isNaN(threshold) || threshold < 0 || threshold > 10_000_000) {
    throw new AppError(400, 'Threshold must be between ₦0 and ₦10,000,000', 'INVALID_THRESHOLD');
  }

  const existing = await prisma.business.findUnique({
    where: { id: businessId },
    select: { voucherAdjustmentThreshold: true },
  });

  const previousThreshold =
    existing?.voucherAdjustmentThreshold !== null && existing?.voucherAdjustmentThreshold !== undefined
      ? toNumber(existing.voucherAdjustmentThreshold as any)
      : 50000;

  const business = await prisma.business.update({
    where: { id: businessId },
    data: { voucherAdjustmentThreshold: threshold },
    select: { id: true, businessName: true, voucherAdjustmentThreshold: true },
  });

  await logAudit({
    userId,
    businessId,
    action: 'business.voucher_adjustment_threshold_updated',
    resourceType: 'business',
    resourceId: businessId,
    oldData: { voucherAdjustmentThreshold: previousThreshold },
    newData: { voucherAdjustmentThreshold: threshold },
  });

  invalidateOwnershipCache(businessId, userId);
  return {
    ...business,
    voucherAdjustmentThreshold: toNumber(business.voucherAdjustmentThreshold as any),
  };
}
