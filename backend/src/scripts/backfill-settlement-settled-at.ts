/**
 * One-off backfill: fills `settledAt` on DVA sales that landed BEFORE the T+1
 * fix was deployed, then immediately releases already-matured holds into the
 * withdrawable wallet.
 *
 * Run once per env after deploying settlement-release.cron.ts:
 *   npm run db:backfill-settlement   (add to package.json)  OR
 *   npx tsx src/scripts/backfill-settlement-settled-at.ts [--dry-run]
 *
 * Safe to re-run — rows with `settledAt IS NOT NULL` are untouched.
 * Idempotent on wallet: WalletService.creditWallet dedupes on `linkedSaleId`.
 *
 * Why this exists: `settlement-release.cron.ts` only moves sales whose
 * `settledAt <= now() AND walletTx IS NULL`. Pre-fix rows have `settledAt=NULL`
 * so they would stay stuck in "In settlement" forever.
 */

import { prisma } from '../lib/prisma';
import logger from '../lib/logger';
import { nextBusinessDayStart } from '../shared/helpers/business-day';
import { WalletService } from '../services/wallet/wallet.service';
import { LIVE_SALE_STATUSES } from '../shared/helpers/settled-status';
import { toNumber } from '../shared/helpers/number';

const isDryRun = process.argv.includes('--dry-run');
const BATCH = 500;

async function backfillSettledAt(dryRun: boolean): Promise<{ filled: number; released: number; skipped: number }> {
  // 1. Fill settledAt where NULL (DVA inflows, all statuses that can mature)
  const candidates = await prisma.salesTransaction.findMany({
    where: {
      source: 'bank_transfer',
      dvaOrigin: true,
      settledAt: null,
    },
    select: { id: true, transactionDate: true, createdAt: true, status: true, amount: true },
    orderBy: { createdAt: 'asc' },
    take: 5000,
  });

  let filled = 0;
  for (const row of candidates) {
    // Anchor on the actual money-land instant: prefer transactionDate (the
    // effective business date after month-lock adjustment), fall back to createdAt.
    const anchor = row.transactionDate ?? row.createdAt;
    const settledAt = nextBusinessDayStart(anchor);
    if (dryRun) {
      logger.info('[BACKFILL_SETTLED_AT][dry-run] would set settledAt', {
        saleId: row.id,
        status: row.status,
        amount: toNumber(row.amount),
        anchor: anchor.toISOString(),
        settledAt: settledAt.toISOString(),
      });
    } else {
      await prisma.salesTransaction.update({
        where: { id: row.id },
        data: { settledAt },
      });
    }
    filled++;
  }

  // 2. Release already-matured holds into wallet (T+1 boundary already passed)
  const now = new Date();
  const maturing = await prisma.salesTransaction.findMany({
    where: {
      source: 'bank_transfer',
      dvaOrigin: true,
      status: { in: [...LIVE_SALE_STATUSES] },
      settledAt: { lte: now },
      walletTx: null,
    },
    select: { id: true, businessId: true, amount: true, referenceId: true, settledAt: true },
    orderBy: { settledAt: 'asc' },
    take: BATCH,
  });

  let released = 0;
  let skipped = 0;

  for (const sale of maturing) {
    const biz = await prisma.business.findUnique({ where: { id: sale.businessId }, select: { userId: true } });
    if (!biz) {
      skipped++;
      continue;
    }
    if (dryRun) {
      logger.info('[BACKFILL_SETTLED_AT][dry-run] would release to wallet', {
        saleId: sale.id,
        businessId: sale.businessId,
        settledAt: sale.settledAt?.toISOString(),
      });
      released++;
      continue;
    }
    try {
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
        description: 'Settlement release (backfill — T+1 business day)',
        linkedSaleId: sale.id,
        metadata: { settlementRelease: true, backfill: true, settledAt: sale.settledAt },
      });
      released++;
    } catch (err: any) {
      if (err?.code === 'P2002') {
        released++; // already linked by a concurrent worker
      } else {
        skipped++;
        logger.error('[BACKFILL_SETTLED_AT] release failed', { saleId: sale.id, error: err.message });
      }
    }
  }

  return { filled, released, skipped };
}

async function main() {
  console.log(`\n[BACKFILL_SETTLED_AT] ${isDryRun ? 'DRY RUN' : 'LIVE WRITE'} — scanning...\n`);
  const res = await backfillSettledAt(isDryRun);
  console.log(
    `\n[BACKFILL_SETTLED_AT] done — filled: ${res.filled}, released: ${res.released}, skipped: ${res.skipped} ${isDryRun ? '(dry-run, no writes)' : ''}\n`
  );
}

main()
  .catch((err) => {
    console.error('[BACKFILL_SETTLED_AT] fatal', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
