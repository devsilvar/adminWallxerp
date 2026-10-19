import prisma, { TxClient } from '@/lib/prisma';
import { AppError } from '@/middleware/errorHandler';
import type { Business } from '@prisma/client';
import type { BusinessRole } from '@prisma/client';
import { hasPermission, resolvePermissions, type PermissionKey } from '@/services/team/permission.service';

interface CachedOwnership {
  business: Business;
  expiresAt: number;
}

export interface BusinessAccessResult {
  business: Business;
  role: BusinessRole;
  permissions: Record<PermissionKey, boolean>;
  isOwner: boolean;
}

interface CachedAccess {
  result: BusinessAccessResult;
  expiresAt: number;
}

const OWNERSHIP_TTL_MS = 60 * 1000; // 60 seconds TTL
const ownershipCache = new Map<string, CachedOwnership>();
const accessCache = new Map<string, CachedAccess>();

function getCacheKey(userId: string, businessId: string): string {
  return `${userId}:${businessId}`;
}

/**
 * Invalidate cached business ownership (call on business update/delete/reconnect).
 * 
 * @param businessId - The business ID to invalidate
 * @param userId - Optional user ID. If provided, only invalidates that user's cache entry.
 *                 If omitted, invalidates all cache entries for this business.
 */
export function invalidateOwnershipCache(businessId: string, userId?: string): void {
  if (userId) {
    const key = getCacheKey(userId, businessId);
    ownershipCache.delete(key);
    accessCache.delete(key);
  } else {
    // Invalidate all entries for this business across all users
    for (const [key] of ownershipCache.entries()) {
      if (key.endsWith(`:${businessId}`)) {
        ownershipCache.delete(key);
      }
    }
    for (const [key] of accessCache.entries()) {
      if (key.endsWith(`:${businessId}`)) {
        accessCache.delete(key);
      }
    }
  }
}

/**
 * Verifies that a business exists and belongs to the authenticated user.
 * 
 * Uses a fast 60-second in-memory cache for standard queries to eliminate
 * redundant database hits. When called within a transaction context, bypasses
 * the cache to read fresh database state within the transaction's isolation level.
 * 
 * @param userId - The authenticated user's ID
 * @param businessId - The business ID to verify
 * @param tx - Optional transaction client. When provided, cache is bypassed.
 * @returns The verified Business object
 * @throws AppError 404 if business not found
 * @throws AppError 403 if business belongs to a different user
 */
export async function verifyBusinessOwnership(
  userId: string,
  businessId: string,
  tx?: TxClient
): Promise<Business> {
  const db = tx ?? prisma;

  // Transactions must read fresh DB state within their isolation level
  if (!tx) {
    const key = getCacheKey(userId, businessId);
    const cached = ownershipCache.get(key);
    if (cached && Date.now() < cached.expiresAt) {
      return cached.business;
    }
  }

  const business = await db.business.findUnique({
    where: { id: businessId },
  });

  if (!business) {
    throw new AppError(404, 'Business not found', 'BUSINESS_NOT_FOUND');
  }

  if (business.userId !== userId) {
    throw new AppError(403, 'You do not have access to this business', 'FORBIDDEN');
  }

  // Cache warm result (only for non-transactional queries)
  if (!tx) {
    const key = getCacheKey(userId, businessId);
    ownershipCache.set(key, {
      business,
      expiresAt: Date.now() + OWNERSHIP_TTL_MS,
    });
  }

  return business;
}

/**
 * Verifies that a user has access to a business (as owner OR active team member)
 * and optionally checks a specific permission.
 *
 * Uses a fast 60-second in-memory cache for standard queries. When called
 * within a transaction context, bypasses the cache.
 *
 * @param userId - The authenticated user's ID
 * @param businessId - The business ID to verify access for
 * @param requiredPermission - Optional permission key to check
 * @param tx - Optional transaction client. When provided, cache is bypassed.
 * @returns BusinessAccessResult with business, role, permissions, and isOwner flag
 * @throws AppError 404 if business not found
 * @throws AppError 403 if user has no access to this business
 * @throws AppError 403 PERMISSION_DENIED if user lacks the required permission
 */
export async function verifyBusinessAccess(
  userId: string,
  businessId: string,
  requiredPermission?: PermissionKey,
  tx?: TxClient
): Promise<BusinessAccessResult> {
  const db = tx ?? prisma;
  const key = getCacheKey(userId, businessId);

  // Check cache (only for non-transactional queries)
  if (!tx) {
    const cached = accessCache.get(key);
    if (cached && Date.now() < cached.expiresAt) {
      // Still need to check the specific permission even on cache hit
      if (requiredPermission && !hasPermission(cached.result.role, cached.result.permissions as Record<string, boolean>, requiredPermission)) {
        throw new AppError(403, `You do not have permission to perform this action (requires ${requiredPermission})`, 'PERMISSION_DENIED');
      }
      return cached.result;
    }
  }

  // Look up the business
  const business = await db.business.findUnique({
    where: { id: businessId },
  });

  if (!business) {
    throw new AppError(404, 'Business not found', 'BUSINESS_NOT_FOUND');
  }

  let role: BusinessRole;
  let overrides: Record<string, boolean> | null = null;

  if (business.userId === userId) {
    // User is the business owner
    role = 'owner' as BusinessRole;
  } else {
    // Check if user is an active team member
    const membership = await db.businessMember.findUnique({
      where: {
        businessId_userId: { businessId, userId },
      },
    });

    if (!membership || !membership.isActive) {
      throw new AppError(403, 'You do not have access to this business', 'FORBIDDEN');
    }

    role = membership.role;
    overrides = (membership.permissions as Record<string, boolean>) ?? null;
  }

  const permissions = resolvePermissions(role, overrides);
  const result: BusinessAccessResult = {
    business,
    role,
    permissions,
    isOwner: role === ('owner' as BusinessRole),
  };

  // Cache warm result (only for non-transactional queries)
  if (!tx) {
    accessCache.set(key, {
      result,
      expiresAt: Date.now() + OWNERSHIP_TTL_MS,
    });
  }

  // Check required permission
  if (requiredPermission && !hasPermission(role, overrides, requiredPermission)) {
    throw new AppError(403, `You do not have permission to perform this action (requires ${requiredPermission})`, 'PERMISSION_DENIED');
  }

  return result;
}
