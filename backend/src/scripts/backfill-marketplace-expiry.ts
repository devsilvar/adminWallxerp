/**
 * Backfill script for Marketplace Product listing expiry (Decision D6: default 90 days).
 *
 * Sets expiresAt = approvedAt + 90 days for products where status = 'approved' AND expiresAt IS NULL.
 * Draft, pending_approval, and rejected listings remain expiresAt = NULL.
 *
 * Usage:
 *   npx tsx src/scripts/backfill-marketplace-expiry.ts          # Dry run (default)
 *   npx tsx src/scripts/backfill-marketplace-expiry.ts --apply  # Live write
 */

import prisma from '../lib/prisma';
import logger from '../lib/logger';

const EXPIRY_DAYS = 90;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export async function runBackfill(apply: boolean = false): Promise<{
  totalCandidates: number;
  processed: number;
  skipped: number;
  isDryRun: boolean;
}> {
  const isDryRun = !apply;
  logger.info(
    `[BACKFILL_EXPIRY] Starting marketplace expiry backfill (${isDryRun ? 'DRY-RUN' : 'APPLY mode'})...`,
  );

  const candidates = await prisma.marketplaceProduct.findMany({
    where: {
      status: 'approved',
      expiresAt: null,
    },
    select: {
      id: true,
      name: true,
      approvedAt: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  logger.info(
    `[BACKFILL_EXPIRY] Found ${candidates.length} approved product(s) needing expiresAt backfill.`,
  );

  let processed = 0;
  let skipped = 0;
  for (const product of candidates) {
    const baseDate = product.approvedAt ?? product.createdAt;
    if (!baseDate || Number.isNaN(baseDate.getTime())) {
      skipped++;
      logger.warn(
        `[BACKFILL_EXPIRY] Skipping product ${product.id} ("${product.name}"): missing/invalid base date.`,
      );
      continue;
    }
    if (!product.approvedAt) {
      logger.info(
        `[BACKFILL_EXPIRY] Product ${product.id} ("${product.name}") has no approvedAt; using createdAt as base date.`,
      );
    }
    const expiresAt = new Date(baseDate.getTime() + EXPIRY_DAYS * MS_PER_DAY);

    if (isDryRun) {
      logger.info(
        `[BACKFILL_EXPIRY][DRY-RUN] Product "${product.name}" (${product.id}): would set expiresAt to ${expiresAt.toISOString()} (base=${baseDate.toISOString()}).`,
      );
      processed++;
      continue;
    }

    // Idempotent guard: only update rows still approved with null expiresAt.
    const updated = await prisma.marketplaceProduct.updateMany({
      where: { id: product.id, status: 'approved', expiresAt: null },
      data: { expiresAt },
    });
    if (updated.count === 1) {
      logger.info(
        `[BACKFILL_EXPIRY][APPLIED] Product "${product.name}" (${product.id}): set expiresAt to ${expiresAt.toISOString()} (base=${baseDate.toISOString()}).`,
      );
      processed++;
    } else {
      skipped++;
      logger.info(
        `[BACKFILL_EXPIRY] Skipped product ${product.id} ("${product.name}"): row no longer eligible (already backfilled or status changed).`,
      );
    }
  }

  logger.info(
    `[BACKFILL_EXPIRY] Backfill completed. Total candidates: ${candidates.length}, Processed: ${processed}, Skipped: ${skipped}, Mode: ${
      isDryRun ? 'DRY-RUN (no changes made, pass --apply to persist)' : 'APPLIED'
    }.`,
  );

  return {
    totalCandidates: candidates.length,
    processed,
    skipped,
    isDryRun,
  };
}

if (require.main === module) {
  const apply = process.argv.includes('--apply');
  runBackfill(apply)
    .then(async () => {
      await prisma.$disconnect();
      process.exit(0);
    })
    .catch(async (error) => {
      logger.error('[BACKFILL_EXPIRY] Error during backfill:', error);
      await prisma.$disconnect();
      process.exit(1);
    });
}
