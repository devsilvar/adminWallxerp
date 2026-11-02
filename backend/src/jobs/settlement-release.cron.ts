// T+1 Settlement Release — funds move settlement → wallet on the NEXT business day (00:00 Lagos).
// D1 / D3: A sale lands with settledAt = nextBusinessDayStart(paid_at). This cron credits the
// central user wallet only when now >= settledAt, so the payout-preview's "In settlement" bucket
// (walletTx IS NULL, status ∈ LIVE_SALE_STATUSES) drains into "withdrawable" (walletTx IS NOT NULL)
// exactly on the Lagos business-day boundary (Fri → Mon, etc). No T+1 = no withdrawable funds.
//
// LOCK_KEY 947364 (advisory xact lock, same pattern as reminders:947362 / wallet-recon:947363).

import cron from 'node-cron';
import { prisma } from '../lib/prisma';
import logger from '../lib/logger';
import { config } from '../config';
import { toNumber } from '../shared/helpers/number';
import { WalletService } from '../services/wallet/wallet.service';
import { LIVE_SALE_STATUSES } from '../shared/helpers/settled-status';

const LOCK_KEY = 947364;
const SCHEDULE = '0 0 * * *';
const TIMEZONE = 'Africa/Lagos';

export function registerSettlementReleaseCron(): void {
  if (!config.cron.enabled) {
    logger.info('Settlement release cron skipped (set ENABLE_CRON=true to enable in non-production)');
    return;
  }

  cron.schedule(
    SCHEDULE,
    () => {
      void runSettlementReleaseSweep();
    },
    { timezone: TIMEZONE }
  );
  logger.info('Settlement release cron registered', { schedule: SCHEDULE, timezone: TIMEZONE });
}

export interface SettlementReleaseResult {
  salesFound: number;
  credited: number;
  failed: number;
}

export async function runSettlementReleaseSweep(opts?: { bypassLock?: boolean }): Promise<SettlementReleaseResult> {
  if (opts?.bypassLock) {
    return executeRelease();
  }

  return prisma.$transaction(
    async (tx) => {
      const lockResult = await tx.$queryRaw<Array<{ locked: boolean }>>`
        SELECT pg_try_advisory_xact_lock(${LOCK_KEY}) AS locked
      `;
      const locked = lockResult[0]?.locked === true;
      if (!locked) {
        logger.warn('Settlement release sweep skipped — another worker holds the lock', { lockKey: LOCK_KEY });
        return { salesFound: 0, credited: 0, failed: 0 };
      }
      return executeRelease(tx as unknown as typeof prisma);
    },
    { maxWait: 10000, timeout: 120000 }
  );
}

async function executeRelease(db: typeof prisma = prisma): Promise<SettlementReleaseResult> {
  const now = new Date();

  const maturingSales = await db.salesTransaction.findMany({
    where: {
      source: 'bank_transfer',
      dvaOrigin: true,
      status: { in: [...LIVE_SALE_STATUSES] },
      settledAt: { lte: now },
      walletTx: null,
    },
    select: { id: true, businessId: true, amount: true, referenceId: true, transactionDate: true, settledAt: true },
    orderBy: { settledAt: 'asc' },
    take: 500,
  });

  if (maturingSales.length === 0) {
    return { salesFound: 0, credited: 0, failed: 0 };
  }

  let credited = 0;
  let failed = 0;

  for (const sale of maturingSales) {
    try {
      const biz = await db.business.findUnique({
        where: { id: sale.businessId },
        select: { userId: true },
      });
      if (!biz) {
        logger.warn('[SETTLEMENT_RELEASE] Sale has no business, skipping', { saleId: sale.id });
        failed++;
        continue;
      }

      const amountNum = toNumber(sale.amount);
      const reference = sale.referenceId || `SETTLEMENT-RELEASE-${sale.id}`;

      await WalletService.creditWallet({
        userId: biz.userId,
        businessId: sale.businessId,
        amount: amountNum,
        fee: 0,
        netAmount: amountNum,
        reference,
        source: 'dva',
        type: 'credit',
        description: `Settlement release (T+1 business day)`,
        linkedSaleId: sale.id,
        metadata: { settlementRelease: true, settledAt: sale.settledAt },
      });

      credited++;
    } catch (err: any) {
      if (err?.code === 'P2002') {
        // Idempotency: another worker already linked this sale's walletTx
        credited++;
        continue;
      }
      failed++;
      logger.error('[SETTLEMENT_RELEASE] Failed to credit wallet for maturing sale', {
        saleId: sale.id,
        error: err.message,
      });
    }
  }

  logger.info('[SETTLEMENT_RELEASE] Sweep complete', {
    found: maturingSales.length,
    credited,
    failed,
  });

  return { salesFound: maturingSales.length, credited, failed };
}
