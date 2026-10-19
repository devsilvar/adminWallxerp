/**
 * Subscription Guard Service — WallXERP
 *
 * Provides central access control evaluation, resource limit checks,
 * and quota enforcement across businesses, team members, and AI queries.
 *
 * Strictly follows AGENTS.md:
 * - Pure read calculations during request verification (zero DB writes on GETs)
 * - Single-Owner Boundary: team caps are resolved against the business owner's tier
 * - Central Easy-Edit configuration consumed directly from subscription-plans.ts
 *
 * @author WallX Engineering Team
 */

import prisma, { TxClient } from '@/lib/prisma';
import config from '@/config';
import { getPlanLimits, isFeatureAllowed, PlanDefinition } from '@/config/subscription-plans';

export interface SubscriptionStatusResult {
  tier: string;
  planName: string;
  hasAccess: boolean;
  isReadOnlyGrace: boolean;
  isExpired: boolean;
  isPaid: boolean;
  expiresAt: Date | null;
  reason?: 'ACTIVE' | 'TRIAL_ACTIVE' | 'TRIAL_IN_GRACE_PERIOD' | 'TRIAL_EXPIRED' | 'SUBSCRIPTION_IN_GRACE_PERIOD' | 'SUBSCRIPTION_EXPIRED';
}

export interface ResourceLimitResult {
  allowed: boolean;
  current: number;
  max: number;
  tier: string;
  ownerTier?: string;
}

/**
 * Pure Functional Evaluation:
 * Determines active subscription, trial countdown, or 2-day read-only grace period status.
 * Never performs database mutations.
 * 
 * Admin users bypass all subscription checks and have unlimited access.
 */
export function getSubscriptionStatus(user: {
  id?: string;
  role?: string;
  createdAt: Date | string;
  subscriptionTier?: string | null;
  subscriptionExpiresAt?: Date | string | null;
  trialEndsAt?: Date | string | null;
}): SubscriptionStatusResult {
  // Admin users bypass all subscription checks - unlimited access
  if (user.role === 'admin') {
    return {
      tier: 'admin',
      planName: 'System Administrator',
      hasAccess: true,
      isReadOnlyGrace: false,
      isExpired: false,
      isPaid: true,
      expiresAt: null,
      reason: 'ACTIVE',
    };
  }

  const tier = (user.subscriptionTier || 'free').toLowerCase().trim();
  const plan = getPlanLimits(tier);
  const now = new Date();
  const graceMs = (config.subscription?.graceDays ?? 2) * 24 * 60 * 60 * 1000;

  // 1. Paid Subscription Tiers (starter, business, scale)
  if (tier !== 'free') {
    if (!user.subscriptionExpiresAt) {
      // Grandfathered or indefinite paid entitlement
      return {
        tier,
        planName: plan.name,
        hasAccess: true,
        isReadOnlyGrace: false,
        isExpired: false,
        isPaid: true,
        expiresAt: null,
        reason: 'ACTIVE',
      };
    }

    const expiresAt = new Date(user.subscriptionExpiresAt);
    if (now <= expiresAt) {
      return {
        tier,
        planName: plan.name,
        hasAccess: true,
        isReadOnlyGrace: false,
        isExpired: false,
        isPaid: true,
        expiresAt,
        reason: 'ACTIVE',
      };
    }

    // Past expiry — check 2-day read-only grace period
    const graceUntil = new Date(expiresAt.getTime() + graceMs);
    if (now <= graceUntil) {
      return {
        tier,
        planName: plan.name,
        hasAccess: true,
        isReadOnlyGrace: true,
        isExpired: true,
        isPaid: true,
        expiresAt,
        reason: 'SUBSCRIPTION_IN_GRACE_PERIOD',
      };
    }

    // Past grace period — full lock out
    return {
      tier,
      planName: plan.name,
      hasAccess: false,
      isReadOnlyGrace: false,
      isExpired: true,
      isPaid: true,
      expiresAt,
      reason: 'SUBSCRIPTION_EXPIRED',
    };
  }

  // 2. Free Trial Tier (30 Days from registration or explicit trialEndsAt)
  // If trialEndsAt was stamped when trial was 10 days, it would keep expired
  // users locked after we bump to 30. Use the longer of stored vs derived so
  // we never shorten a trial when the configured length increases.
  let trialEndsAt: Date;
  const trialDays = config.subscription?.trialDays ?? 30;
  if (user.trialEndsAt) {
    const stored = new Date(user.trialEndsAt);
    const derived = new Date(new Date(user.createdAt).getTime() + trialDays * 24 * 60 * 60 * 1000);
    trialEndsAt = stored.getTime() > derived.getTime() ? stored : derived;
  } else {
    const created = new Date(user.createdAt);
    trialEndsAt = new Date(created.getTime() + trialDays * 24 * 60 * 60 * 1000);
  }

  if (now <= trialEndsAt) {
    return {
      tier: 'free',
      planName: plan.name,
      hasAccess: true,
      isReadOnlyGrace: false,
      isExpired: false,
      isPaid: false,
      expiresAt: trialEndsAt,
      reason: 'TRIAL_ACTIVE',
    };
  }

  // Past trial — check 2-day read-only grace period
  const trialGraceUntil = new Date(trialEndsAt.getTime() + graceMs);
  if (now <= trialGraceUntil) {
    return {
      tier: 'free',
      planName: plan.name,
      hasAccess: true,
      isReadOnlyGrace: true,
      isExpired: true,
      isPaid: false,
      expiresAt: trialEndsAt,
      reason: 'TRIAL_IN_GRACE_PERIOD',
    };
  }

  // Past trial grace period — full lockout
  return {
    tier: 'free',
    planName: plan.name,
    hasAccess: false,
    isReadOnlyGrace: false,
    isExpired: true,
    isPaid: false,
    expiresAt: trialEndsAt,
    reason: 'TRIAL_EXPIRED',
  };
}

/**
 * Check if the user has reached their maximum allowed businesses for their plan tier.
 * Admin users have unlimited businesses.
 */
export async function checkBusinessLimit(
  userId: string,
  tier?: string | null,
  tx?: TxClient | typeof prisma
): Promise<ResourceLimitResult> {
  const db = tx ?? prisma;
  
  // Check if user is admin - admins bypass all limits
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });

  if (user?.role === 'admin') {
    const current = await db.business.count({ where: { userId } });
    return { allowed: true, current, max: -1, tier: 'admin' };
  }

  const plan = getPlanLimits(tier);
  const max = plan.maxBusinesses;

  const current = await db.business.count({
    where: { userId },
  });

  if (max === -1) {
    return { allowed: true, current, max, tier: plan.tier };
  }

  return {
    allowed: current < max,
    current,
    max,
    tier: plan.tier,
  };
}

/**
 * Check if a business has reached its maximum allowed team members.
 *
 * CRITICAL RBAC INVARIANT:
 * Resolves the cap based on the BUSINESS OWNER'S subscription tier,
 * allowing managers or invited staff to invite members up to the owner's plan limit.
 * Admin users have unlimited team members.
 */
export async function checkTeamLimit(
  businessId: string,
  tx?: TxClient | typeof prisma
): Promise<ResourceLimitResult> {
  const db = tx ?? prisma;

  // 1. Resolve business owner and their subscription tier
  const business = await db.business.findUnique({
    where: { id: businessId },
    select: {
      userId: true,
      user: {
        select: {
          role: true,
          subscriptionTier: true,
        },
      },
    },
  });

  // Admin users bypass all limits
  if (business?.user?.role === 'admin') {
    const [activeNonOwnerCount, pendingInviteCount] = await Promise.all([
      db.businessMember.count({
        where: {
          businessId,
          role: { not: 'owner' },
          isActive: true,
        },
      }),
      db.invitation.count({
        where: {
          businessId,
          status: 'pending',
          expiresAt: { gt: new Date() },
        },
      }),
    ]);
    const current = activeNonOwnerCount + pendingInviteCount;
    return { allowed: true, current, max: -1, tier: 'admin', ownerTier: 'admin' };
  }

  const ownerTier = business?.user?.subscriptionTier || 'free';
  const plan = getPlanLimits(ownerTier);
  const max = plan.maxTeamMembers;

  // 2. Count active non-owner members + pending unexpired invitations
  const [activeNonOwnerCount, pendingInviteCount] = await Promise.all([
    db.businessMember.count({
      where: {
        businessId,
        role: { not: 'owner' },
        isActive: true,
      },
    }),
    db.invitation.count({
      where: {
        businessId,
        status: 'pending',
        expiresAt: { gt: new Date() },
      },
    }),
  ]);

  const current = activeNonOwnerCount + pendingInviteCount;

  if (max === -1) {
    return { allowed: true, current, max, tier: plan.tier, ownerTier };
  }

  return {
    allowed: current < max,
    current,
    max,
    tier: plan.tier,
    ownerTier,
  };
}

/**
 * Check if the user has reached their monthly AI CFO query limit.
 * Uses UTC month boundaries matching financial reporting conventions.
 * Admin users have unlimited AI queries.
 */
export async function checkAiQueryLimit(
  userId: string,
  tier?: string | null,
  tx?: TxClient | typeof prisma
): Promise<ResourceLimitResult> {
  const db = tx ?? prisma;
  
  // Check if user is admin - admins bypass all limits
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });

  if (user?.role === 'admin') {
    return { allowed: true, current: 0, max: -1, tier: 'admin' };
  }

  const plan = getPlanLimits(tier);
  const max = plan.maxMonthlyAiQueries;

  if (max === -1) {
    return { allowed: true, current: 0, max, tier: plan.tier };
  }

  const now = new Date();
  const utcMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));

  const current = await db.aiQueryLog.count({
    where: {
      userId,
      createdAt: { gte: utcMonthStart },
    },
  });

  return {
    allowed: current < max,
    current,
    max,
    tier: plan.tier,
  };
}

/**
 * Log an AI query after successful response generation.
 */
export async function logAiQuery(
  userId: string,
  businessId: string | undefined,
  queryText: string,
  responseLength?: number,
  tx?: TxClient | typeof prisma
): Promise<void> {
  const db = tx ?? prisma;

  await db.aiQueryLog.create({
    data: {
      userId,
      businessId: businessId || null,
      queryText,
      responseLength: responseLength || null,
    },
  });
}

export { isFeatureAllowed, getPlanLimits, PlanDefinition };
