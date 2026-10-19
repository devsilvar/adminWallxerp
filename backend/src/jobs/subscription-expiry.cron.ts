/**
 * Subscription Expiry Cron Job — WallXERP
 *
 * Runs daily at 01:00 Africa/Lagos.
 * Checks for expired free trials and expired paid subscriptions,
 * updating status and sending email alerts.
 *
 * Invariants:
 * 1. Concurrency-safe: Wrapped in a Postgres transaction-scoped advisory lock (LOCK_KEY = 947365).
 * 2. Gated by `config.cron.enabled` to prevent spamming in dev watch mode.
 * 3. Never throws unhandled errors that could crash the server process.
 *
 * @author WallX Engineering Team
 */

import cron from 'node-cron';
import prisma from '@/lib/prisma';
import logger from '@/lib/logger';
import config from '@/config';
import { checkAndMarkExpiredSubscriptions } from '@/services/subscription/subscription-expiry.service';

// Arbitrary 32-bit integer distinct from reminders (947362) and wallet reconciliation (947363).
const LOCK_KEY = 947365;

// 01:00 daily Africa/Lagos
const SCHEDULE = '0 1 * * *';
const TIMEZONE = 'Africa/Lagos';

/**
 * Executes a single concurrency-guarded sweep. Exported for manual invocations and tests.
 */
export async function runSubscriptionExpirySweep(): Promise<void> {
  const start = Date.now();

  try {
    await prisma.$transaction(async (tx) => {
      // 1. Acquire transaction-scoped advisory lock
      const lockRows = await tx.$queryRaw<Array<{ locked: boolean }>>`
        SELECT pg_try_advisory_xact_lock(${LOCK_KEY}) AS locked
      `;
      const acquired = lockRows[0]?.locked ?? false;

      if (!acquired) {
        logger.info('[subscription-cron] Skipped: advisory lock held by another instance');
        return;
      }

      logger.info('[subscription-cron] Acquired advisory lock; starting subscription expiry check');

      const result = await checkAndMarkExpiredSubscriptions();

      logger.info('[subscription-cron] Subscription expiry check complete', {
        expiredTrials: result.expiredTrials,
        expiredSubs: result.expiredSubs,
        remindedUsers: result.remindedUsers,
        durationMs: Date.now() - start,
      });
    });
  } catch (err: any) {
    logger.error('[subscription-cron] Subscription expiry sweep failed:', {
      error: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - start,
    });
  }
}

/**
 * Registers the daily cron job on server startup.
 */
export function registerSubscriptionExpiryCron(): void {
  if (!config.cron.enabled) {
    logger.info('[subscription-cron] Cron skipped (set ENABLE_CRON=true to enable in non-production)');
    return;
  }

  cron.schedule(
    SCHEDULE,
    () => {
      void runSubscriptionExpirySweep().catch((err) => {
        logger.error('[subscription-cron] Unhandled error in scheduled job:', {
          error: err instanceof Error ? err.message : String(err),
        });
      });
    },
    {
      timezone: TIMEZONE,
    }
  );

  logger.info('[subscription-cron] Registered daily subscription expiry cron', {
    schedule: SCHEDULE,
    timezone: TIMEZONE,
  });
}
