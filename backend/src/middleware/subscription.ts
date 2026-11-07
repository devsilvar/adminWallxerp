/**
 * Subscription Middleware — WallXERP
 *
 * Enforces active subscription status, 2-day read-only grace period,
 * and feature gating (e.g. BNPL credits blocked on Starter).
 *
 * Supports soft-launch monitoring mode via `config.subscription.enforcementEnabled`.
 *
 * @author WallX Engineering Team
 */

import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '@/types';
import prisma from '@/lib/prisma';
import config from '@/config';
import logger from '@/lib/logger';
import { AppError } from '@/middleware/errorHandler';
import {
  getSubscriptionStatus,
  isFeatureAllowed,
} from '@/services/subscription/subscription-guard.service';
import type { PlanFeatures } from '@/config/subscription-plans';

// Wallet/billing exempt list — allowed even when trial or subscription is expired/in grace
const SUBSCRIPTION_EXEMPT_PATTERNS = [
  /\/settlement\/withdraw/,          // POST withdraw
  /\/settlement\/resolve/,           // POST resolve
  /\/settlement\/connect/,           // POST connect
  /\/settlement\/preview/,           // GET preview
  /\/settlement\/history/,           // GET history
  /\/wallet\//,                      // wallet reads/writes
  /\/banks\/resolve/,                // bank resolve helper for withdraw
  /\/subscription\//,                // upgrade path
  /\/public\/subscription-plans/,    // public pricing
  /\/tax\/pay/,                      // POST pay
  /\/tax\/payments\/.*\/verify/,     // GET verify
  /\/tax\/payments\/.*\/abandon/,    // POST abandon
];

function isFundAccessExempt(req: AuthenticatedRequest): boolean {
  const url = req.originalUrl || req.url || '';
  return SUBSCRIPTION_EXEMPT_PATTERNS.some((p) => p.test(url));
}

/**
 * Middleware: Verify that the caller has an active subscription or trial.
 * Enforces read-only access (GETs allowed, mutating writes blocked) during
 * grace period and upon trial/subscription expiry, keeping wallet/billing exempt.
 * 
 * Admin users bypass all subscription enforcement.
 */
export async function requireActiveSubscription(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const userId = req.user?.userId;
  if (!userId) {
    return next(new AppError(401, 'Unauthorized', 'UNAUTHORIZED'));
  }

  try {
    // Pure read: fetch user subscription metadata
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        role: true,
        createdAt: true,
        subscriptionTier: true,
        subscriptionExpiresAt: true,
        trialEndsAt: true,
      },
    });

    if (!user) {
      return next(new AppError(401, 'User not found', 'UNAUTHORIZED'));
    }

    // Admin users bypass all subscription checks
    if (user.role === 'admin') {
      req.subscription = {
        tier: 'admin',
        planName: 'System Administrator',
        hasAccess: true,
        isReadOnlyGrace: false,
        isExpired: false,
        isPaid: true,
        expiresAt: null,
        reason: 'ACTIVE',
      };
      return next();
    }

    // Check if user is a team member - inherit owner's subscription
    let subscriptionUser = user;
    const ownedCount = await prisma.business.count({ where: { userId } });
    if (ownedCount === 0) {
      const membership = await prisma.businessMember.findFirst({
        where: { userId, isActive: true },
        include: {
          business: {
            include: {
              user: {
                select: {
                  id: true,
                  role: true,
                  createdAt: true,
                  subscriptionTier: true,
                  subscriptionExpiresAt: true,
                  trialEndsAt: true,
                },
              },
            },
          },
        },
        orderBy: { joinedAt: 'asc' },
      });
      if (membership?.business?.user) {
        // If owner is admin, treat as admin access
        if (membership.business.user.role === 'admin') {
          req.subscription = {
            tier: 'admin',
            planName: 'System Administrator',
            hasAccess: true,
            isReadOnlyGrace: false,
            isExpired: false,
            isPaid: true,
            expiresAt: null,
            reason: 'ACTIVE',
          };
          return next();
        }
        subscriptionUser = membership.business.user as any;
      }
    }

    const status = getSubscriptionStatus(subscriptionUser);

    // Soft-launch monitoring mode: log warnings without rejecting client
    const enforcementEnabled = config.subscription?.enforcementEnabled ?? false;
    if (!enforcementEnabled) {
      if (!status.hasAccess || status.isReadOnlyGrace) {
        logger.warn('[subscription] would enforce (monitoring mode)', {
          userId,
          reason: status.reason,
          method: req.method,
          path: req.originalUrl,
        });
      }
      req.subscription = status;
      return next();
    }

    // Both expired and grace period enforce read-allowed, write-blocked behavior
    const isReadMethod = ['GET', 'HEAD', 'OPTIONS'].includes(req.method.toUpperCase());

    if (!status.hasAccess || status.isReadOnlyGrace) {
      if (!isReadMethod) {
        // Wallet, settlement, bank resolve, and tax payment verification always pass
        if (isFundAccessExempt(req)) {
          req.subscription = status;
          return next();
        }

        const isGrace =
          status.reason === 'TRIAL_IN_GRACE_PERIOD' ||
          status.reason === 'SUBSCRIPTION_IN_GRACE_PERIOD';

        const msg = isGrace
          ? 'Your account is in a 2-day read-only grace period. Upgrade your plan to create or modify records.'
          : 'Your trial or subscription has expired. Please upgrade to continue using WallXERP.';

        return next(
          new AppError(403, msg, status.reason, {
            tier: status.tier,
            expiresAt: status.expiresAt,
            readOnlyGrace: status.isReadOnlyGrace,
          })
        );
      }
      // Reads pass — even when expired or in grace period
    }

    req.subscription = status;
    return next();
  } catch (err) {
    logger.error('Failed to evaluate subscription status in middleware', { err, userId });
    next(err);
  }
}

/**
 * Middleware Factory: Gate specific features based on subscription tier.
 * Automatically resolves business owner's tier when `businessId` is in route parameters.
 * Admin users bypass all feature gates.
 */
export function requireFeature(feature: keyof PlanFeatures) {
  return async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const isRead = Boolean(req.method && ['GET', 'HEAD', 'OPTIONS'].includes(req.method.toUpperCase()));
      if (isRead) return next(); // reads never FEATURE_BLOCKED

      // Check if user is admin - admins bypass all feature gates
      if (req.user?.userId) {
        const userCheck = await prisma.user.findUnique({
          where: { id: req.user.userId },
          select: { role: true },
        });

        if (userCheck?.role === 'admin') {
          return next();
        }
      }

      let tier = req.subscription?.tier;

      // If tier was not yet resolved, query database
      if (!tier && req.user?.userId) {
        const userId = req.user.userId;
        const businessId = req.params.businessId || req.params.id;
        if (businessId) {
          const business = await prisma.business.findUnique({
            where: { id: businessId },
            select: {
              user: { select: { subscriptionTier: true, role: true } },
            },
          });
          if (business?.user?.role === 'admin') {
            tier = 'admin';
          } else {
            tier = business?.user?.subscriptionTier || 'free';
          }
        } else {
          const ownedCount = await prisma.business.count({ where: { userId } });
          if (ownedCount === 0) {
            const membership = await prisma.businessMember.findFirst({
              where: { userId, isActive: true },
              include: {
                business: {
                  include: {
                    user: { select: { subscriptionTier: true, role: true } },
                  },
                },
              },
              orderBy: { joinedAt: 'asc' },
            });
            if (membership?.business?.user?.role === 'admin') {
              tier = 'admin';
            } else if (membership?.business?.user) {
              tier = membership.business.user.subscriptionTier || 'free';
            } else {
              const user = await prisma.user.findUnique({
                where: { id: userId },
                select: { subscriptionTier: true },
              });
              tier = user?.subscriptionTier || 'free';
            }
          } else {
            const user = await prisma.user.findUnique({
              where: { id: userId },
              select: { subscriptionTier: true },
            });
            tier = user?.subscriptionTier || 'free';
          }
        }
      }

      const allowed = isFeatureAllowed(tier, feature);

      // Soft-launch monitoring mode
      const enforcementEnabled = config.subscription?.enforcementEnabled ?? false;
      if (!allowed && !enforcementEnabled) {
        logger.warn('[subscription] would block feature (monitoring mode)', {
          userId: req.user?.userId,
          feature,
          tier,
          path: req.originalUrl,
        });
        return next();
      }

      if (!allowed) {
        return next(
          new AppError(
            403,
            `The ${feature} feature requires an upgraded subscription plan.`,
            'FEATURE_BLOCKED',
            { feature, currentTier: tier }
          )
        );
      }

      next();
    } catch (err) {
      logger.error('Failed to evaluate feature gate in middleware', { err, feature });
      next(err);
    }
  };
}
