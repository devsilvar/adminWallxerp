/**
 * Voucher Ledger Request Expiry Cron — WallX ERP
 *
 * Runs nightly at 00:35 Africa/Lagos.
 * Sweeps all pending voucher ledger requests in 'awaiting_customer' status whose
 * verification link has expired (verificationExpiresAt < now()) and flips their status to 'expired'.
 *
 * Concurrency: wrapped in a Postgres transaction-scoped advisory lock (LOCK_KEY = 947363).
 * Gating: registerVoucherCron() is a no-op unless config.cron.enabled.
 */

import cron from 'node-cron';
import prisma from '@/lib/prisma';
import logger from '@/lib/logger';
import config from '@/config';

// Documented lock key for voucher expiry sweep (does not collide with reminder 947362)
const LOCK_KEY = 947363;
const SCHEDULE = '35 0 * * *';
const TIMEZONE = 'Africa/Lagos';

/**
 * Registers the voucher expiry cron job.
 */
export function registerVoucherCron(): void {
  if (!config.cron.enabled) {
    logger.info(
      'Voucher expiry cron skipped (set ENABLE_CRON=true to enable in non-production)'
    );
    return;
  }

  cron.schedule(
    SCHEDULE,
    () => {
      void runVoucherExpirySweep().catch((err) => {
        logger.error('Unhandled failure in voucher expiry cron sweep', {
          error: err instanceof Error ? err.message : String(err),
          stack: err instanceof Error ? err.stack : undefined,
        });
      });
    },
    { timezone: TIMEZONE }
  );

  logger.info('Voucher expiry cron registered', { schedule: SCHEDULE, timezone: TIMEZONE });
}

/**
 * Executes the voucher expiry sweep directly.
 * Can be called with bypassLock for manual scripts or integration tests.
 */
export async function runVoucherExpirySweep(opts?: {
  bypassLock?: boolean;
}): Promise<{ expiredCount: number }> {
  if (opts?.bypassLock) {
    return executeExpirySweep();
  }

  return prisma.$transaction(async (tx) => {
    const lockResult = await tx.$queryRaw<Array<{ locked: boolean }>>`
      SELECT pg_try_advisory_xact_lock(${LOCK_KEY}) AS locked
    `;
    const locked = lockResult[0]?.locked === true;

    if (!locked) {
      logger.info('Voucher expiry cron: lock held by another worker, skipping');
      return { expiredCount: 0 };
    }

    return executeExpirySweep(tx);
  });
}

async function executeExpirySweep(client: any = prisma): Promise<{ expiredCount: number }> {
  const now = new Date();

  const updateResult = await client.voucherLedgerRequest.updateMany({
    where: {
      status: 'awaiting_customer',
      verificationExpiresAt: {
        lt: now,
      },
    },
    data: {
      status: 'expired',
      verificationTokenHash: null,
    },
  });

  if (updateResult.count > 0) {
    logger.info(`Voucher expiry cron: expired ${updateResult.count} unverified request(s)`);
  }

  return { expiredCount: updateResult.count };
}
