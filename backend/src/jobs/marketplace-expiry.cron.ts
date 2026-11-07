/**
 * Marketplace Listing Expiry Cron Job (Phase 8a)
 *
 * Automatically sweeps and archives approved listings whose 90-day active period
 * has elapsed (status = 'approved' AND expiresAt <= now).
 *
 * Requirements:
 * - LOCK_KEY 947366 (transaction-scoped advisory lock, try/finally release)
 * - Schedule: Daily at 01:00 Africa/Lagos timezone
 * - Per-row transaction with try/catch so one failure never aborts the sweep
 * - Idempotent: filters on status = 'approved', so retry sweeps find only pending rows
 * - Audit log: action 'marketplace.listing_expired'
 * - Email dispatch wrapper (post-transaction, fire-and-forget)
 */

import cron from 'node-cron';
import { prisma } from '../lib/prisma';
import logger from '../lib/logger';
import { config } from '../config';
import { logAudit } from '../lib/audit';
import { sendEmail } from '../lib/email';

export const LOCK_KEY = 947366;
const SCHEDULE = '0 1 * * *'; // Daily at 01:00
const TIMEZONE = 'Africa/Lagos';

export function registerMarketplaceExpiryCron(): void {
  if (!config.cron.enabled) {
    logger.info('Marketplace expiry cron skipped (set ENABLE_CRON=true to enable in non-production)');
    return;
  }

  cron.schedule(
    SCHEDULE,
    () => {
      void runMarketplaceExpirySweep();
    },
    { timezone: TIMEZONE }
  );
  logger.info('Marketplace expiry cron registered', { schedule: SCHEDULE, timezone: TIMEZONE });
}

export interface MarketplaceExpiryResult {
  expiredFound: number;
  expiredCount: number;
  failedCount: number;
}

/**
 * Runs the expiry sweep. Supports bypassLock for dry runs and unit tests.
 *
 * Locking: uses a transaction-scoped advisory lock (pg_try_advisory_xact_lock)
 * held for the duration of the sweep by keeping the lock transaction open until
 * executeExpirySweep() completes. The sweep itself runs against the base prisma
 * client (not the lock tx) because executeExpirySweep performs per-row
 * db.$transaction() calls; a Prisma TransactionClient does not support nesting
 * $transaction, which would cause every row to fail in the locked path.
 */
export async function runMarketplaceExpirySweep(opts?: {
  bypassLock?: boolean;
}): Promise<MarketplaceExpiryResult> {
  if (opts?.bypassLock) {
    return executeExpirySweep();
  }

  return prisma.$transaction(
    async (tx) => {
      const lockResult = await tx.$queryRaw<Array<{ locked: boolean }>>`
        SELECT pg_try_advisory_xact_lock(${LOCK_KEY}) AS locked
      `;
      const locked = lockResult[0]?.locked === true;
      if (!locked) {
        logger.warn('Marketplace expiry sweep skipped — another worker holds the lock', { lockKey: LOCK_KEY });
        return { expiredFound: 0, expiredCount: 0, failedCount: 0 };
      }
      // Run on the base client; see JSDoc. The lock tx stays open until this returns.
      return executeExpirySweep();
    },
    { maxWait: 10000, timeout: 120000 }
  );
}

export async function executeExpirySweep(db: typeof prisma = prisma): Promise<MarketplaceExpiryResult> {
  const now = new Date();

  // Edge case: expiresAt MUST NOT be null (never expire unbackfilled or draft rows)
  const expiredProducts = await db.marketplaceProduct.findMany({
    where: {
      status: 'approved',
      expiresAt: {
        not: null,
        lte: now,
      },
    },
    select: {
      id: true,
      name: true,
      slug: true,
      businessId: true,
      expiresAt: true,
      boostEndsAt: true,
      business: {
        select: {
          businessName: true,
          userId: true,
          user: {
            select: {
              email: true,
              fullName: true,
            },
          },
        },
      },
    },
    orderBy: { expiresAt: 'asc' },
    take: 500,
  });

  if (expiredProducts.length === 0) {
    return { expiredFound: 0, expiredCount: 0, failedCount: 0 };
  }

  let expiredCount = 0;
  let failedCount = 0;

  for (const product of expiredProducts) {
    try {
      // Archive listing and record audit log inside a row transaction
      await db.$transaction(async (rowTx) => {
        const updateData: { status: 'archived'; boostEndsAt?: null } = {
          status: 'archived',
        };
        if (product.boostEndsAt) {
          updateData.boostEndsAt = null;
        }

        await rowTx.marketplaceProduct.update({
          where: { id: product.id },
          data: updateData,
        });

        // Auto-pause any active boosts for the expired listing (Phase 14)
        if (rowTx.marketplaceBoost?.updateMany) {
          await rowTx.marketplaceBoost.updateMany({
            where: { productId: product.id, status: 'active' },
            data: { status: 'paused' },
          });
        }

        await logAudit(
          {
            userId: product.business.userId,
            businessId: product.businessId,
            action: 'marketplace.listing_expired',
            resourceType: 'marketplace_product',
            resourceId: product.id,
            oldData: { status: 'approved', expiresAt: product.expiresAt },
            newData: { status: 'archived', expiredAt: now },
          },
          rowTx
        );
      });

      expiredCount++;

      // Dispatch notification email post-transaction (fire-and-forget, never breaks the sweep)
      const recipientEmail = product.business?.user?.email;
      if (recipientEmail) {
        const merchantName = product.business.user?.fullName || product.business.businessName || 'Merchant';
        const renewalUrl = `${process.env.PUBLIC_APP_URL || 'http://localhost:5173'}/inventory?renew=${product.id}`;

        sendEmail({
          to: recipientEmail,
          subject: `Your listing "${product.name}" has expired — renew in one click`,
          text: `Hello ${merchantName},\n\nYour listing "${product.name}" on WallX Marketplace has reached its 90-day active period and has expired.\n\nYou can renew it in one click for another 90 days for free:\n${renewalUrl}\n\nThank you,\nWallX Marketplace Team`,
          html: `<p>Hello ${merchantName},</p><p>Your listing <strong>"${product.name}"</strong> on WallX Marketplace has reached its 90-day active period and has expired.</p><p><a href="${renewalUrl}" style="display:inline-block;padding:10px 20px;background:#352778;color:#fff;text-decoration:none;border-radius:20px;font-weight:bold;">Renew Listing in One Click</a></p><p>Or visit your merchant inventory: <a href="${renewalUrl}">${renewalUrl}</a></p>`,
        }).catch((err) => {
          logger.warn('[MARKETPLACE_EXPIRY] Failed to send expiry email notification', {
            productId: product.id,
            err: err instanceof Error ? err.message : String(err),
          });
        });
      }
    } catch (err) {
      logger.warn('[MARKETPLACE_EXPIRY] Failed to expire product', {
        productId: product.id,
        err: err instanceof Error ? err.message : String(err),
      });
      failedCount++;
    }
  }

  logger.info('[MARKETPLACE_EXPIRY] Expiry sweep completed', {
    expiredFound: expiredProducts.length,
    expiredCount,
    failedCount,
  });

  return {
    expiredFound: expiredProducts.length,
    expiredCount,
    failedCount,
  };
}
