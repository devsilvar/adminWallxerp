import prisma from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { AppError } from '@/middleware/errorHandler';
import * as pinService from '@/services/pin.service';
import crypto from 'crypto';
import { quoteAdvance, AdvanceQuote } from '@/lib/paystack-fees';
import { PlatformConfigService } from '@/services/platform-config.service';
import {
  toNumber,
  getWithdrawalActor,
  LIVE_SALE_STATUSES,
} from '@/shared/helpers';
import { verifyBusinessAccess } from '@/lib/ownership';
import { WalletService } from '@/services/wallet.service';
import { getAdvancePreview } from '@/services/settlement/payout-preview.service';
import { assertWithinDailyPayoutCap } from '@/modules/wallet/services/daily-payout-cap.service';
import {
  AdvanceRequestInput,
  PayoutHistoryQueryInput,
} from '@/validators/settlement.validator';
import { dispatchAdvanceWithdrawalEmail } from '@/services/email-dispatch.service';
import { emitToAdmins } from '@/services/admin/realtime-admin.helper';
import { createReminderOnce } from '@/services/reminder.service';
import { formatNaira } from '@/lib/format';
import logger from '@/lib/logger';

// Re-export getAdvancePreview for convenient domain facade access
export { getAdvancePreview } from '@/services/settlement/payout-preview.service';

/**
 * Initiates a settlement advance under the strict One-Shot 30% per batch rule.
 *
 * An advance is an INTERNAL BUCKET TRANSFER, not a bank payout:
 *   settlement (unsettled DVA inflows)  ->  wallet (available balance)
 * The merchant's wallet is credited immediately; the gross advance is recovered
 * from the maturing inflows by the T+1 settlement release sweep. No Paystack
 * transfer is initiated here.
 *
 * Requirements & Invariants:
 * 1. Actor must be verified owner of the business with connected commercial bank account.
 * 2. Explicit acceptance of the advance fee (params.acceptCharge === true).
 * 3. 4-digit transaction PIN or step-up token verified BEFORE entering the DB transaction.
 * 4. Serialized per user via PostgreSQL transaction advisory lock: hashtextextended(userId, 0).
 * 5. One-Shot Batch Gate:
 *    - Finds oldest unsettled live DVA sale: batchStart = MIN(transactionDate) WHERE walletTx IS NULL.
 *    - If no pending sales exist -> 400 NO_UNSETTLED_BALANCE.
 *    - If an advance already exists for this batch (createdAt >= batchStart and active status) -> 409 ADVANCE_ALREADY_TAKEN.
 * 6. Bounds enforcement:
 *    - Minimum advance floor (default ₦1,000) -> 400 ADVANCE_BELOW_MINIMUM.
 *    - requested <= maxAdvance (floor(pooledPending * 30%)) -> 400 ADVANCE_LIMIT_EXCEEDED.
 * 7. Shared daily payout cap: gross debit (requested + fee) asserted against Lagos-day cap.
 * 8. Sales-neutrality: zero mutations on SalesTransaction rows.
 * 9. Wallet ledger: credits the central wallet inside the tx via WalletService.creditWallet
 *    (type 'advance', source 'settlement_advance'). The matching recovery is applied by
 *    the settlement release cron when the underlying inflows mature.
 */
export async function requestAdvance(
  userId: string,
  businessId: string,
  params: AdvanceRequestInput
) {
  const business = await getWithdrawalActor(userId, businessId);

  const settlementAccountNumber =
    business.settlementAccountNumber || business.user.settlementAccountNumber;
  const settlementBankCode =
    business.settlementBankCode || business.user.settlementBankCode;
  const settlementBankName =
    business.settlementBankName || business.user.settlementBankName;
  const settlementAccountName =
    business.settlementAccountName || business.user.settlementAccountName;

  // 1. Settlement bank account check
  if (!settlementAccountNumber || !settlementBankCode) {
    throw new AppError(
      400,
      'No settlement bank connected. Please connect your commercial bank account first.',
      'SETTLEMENT_ACCOUNT_REQUIRED'
    );
  }

  // 2. Explicit fee charge acceptance check
  if (params.acceptCharge !== true) {
    throw new AppError(
      400,
      'You must accept the advance fee',
      'ACCEPT_CHARGE_REQUIRED'
    );
  }

  // 3. Verify transaction PIN or step-up authorization token (outside DB transaction)
  if (params.stepUpToken) {
    pinService.verifyStepUpToken(userId, params.stepUpToken);
  } else if (params.pin) {
    await pinService.verifyPin(userId, params.pin);
  } else {
    throw new AppError(
      400,
      'Transaction PIN or step-up authorization token is required',
      'PIN_REQUIRED'
    );
  }

  // 4. Generate unique advance transfer reference BEFORE the transaction
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
  const transferReference = `ADV-${dateStr}-${crypto.randomBytes(5).toString('hex').toUpperCase()}`;

  // 5. Price the advance against dynamic platform fee schedule
  const feeConfig = await PlatformConfigService.getFeeConfig();
  let quote: AdvanceQuote;
  try {
    quote = quoteAdvance(params.amount, {
      pct: feeConfig.advanceFeePct,
      cap: feeConfig.advanceFeeCap,
      minAmount: feeConfig.minAdvanceAmount,
    });
  } catch (err) {
    throw new AppError(
      400,
      err instanceof Error ? err.message : 'Invalid advance amount',
      'INVALID_ADVANCE_AMOUNT'
    );
  }

  // 6. Atomic advance request creation with one-shot batch gate and wallet reservation
  const payout = await prisma.$transaction(
    async (tx) => {
      // Step A: Advisory lock — serializes per user to prevent concurrent double-draws
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${userId}::text, 0))`;

      // Step B: Query all businesses owned by user (pooled liquidity boundary)
      const userBusinesses = await tx.business.findMany({
        where: { userId },
        select: { id: true },
      });
      const userBizIds = userBusinesses.map((b) => b.id);

      // Step C: Batch Gate — find oldest unsettled live DVA sale
      const oldestPending = await tx.salesTransaction.findFirst({
        where: {
          businessId: { in: userBizIds },
          source: 'bank_transfer',
          dvaOrigin: true,
          status: { in: LIVE_SALE_STATUSES },
          needsVerification: false,
          walletTx: null,
        },
        orderBy: { transactionDate: 'asc' },
        select: { transactionDate: true },
      });

      if (!oldestPending) {
        throw new AppError(
          400,
          'No unsettled balance available for advance',
          'NO_UNSETTLED_BALANCE'
        );
      }
      const batchStart = oldestPending.transactionDate;

      // Step D: Batch Gate — check if an advance was already taken for current batch
      const existingAdvance = await tx.settlementPayout.findFirst({
        where: {
          businessId: { in: userBizIds },
          isAdvance: true,
          OR: [
            { status: { in: ['pending', 'processing', 'completed'] } },
            { status: 'failed', needsReconciliation: true },
          ],
          createdAt: { gte: batchStart },
        },
        select: { id: true, transferReference: true, createdAt: true },
      });

      if (existingAdvance) {
        throw new AppError(
          409,
          'An advance has already been taken for the current unsettled batch.',
          'ADVANCE_ALREADY_TAKEN',
          {
            existingReference: existingAdvance.transferReference,
            createdAt: existingAdvance.createdAt,
          }
        );
      }

      // Step E: Compute advance preview inside the transaction
      const preview = await getAdvancePreview(userId, businessId, tx);

      if (preview.pooledPendingSettlement <= 0) {
        throw new AppError(
          400,
          'No unsettled balance available for advance',
          'NO_UNSETTLED_BALANCE'
        );
      }

      if (preview.maxAdvance < preview.minAdvanceAmount) {
        throw new AppError(
          400,
          `Unsettled balance does not qualify for the minimum advance of ₦${preview.minAdvanceAmount.toLocaleString('en-NG', { minimumFractionDigits: 2 })}`,
          'ADVANCE_BELOW_MINIMUM',
          {
            maxAdvance: preview.maxAdvance,
            minAdvanceAmount: preview.minAdvanceAmount,
            pooledPending: preview.pooledPendingSettlement,
          }
        );
      }

      if (params.amount > preview.maxAdvance) {
        throw new AppError(
          400,
          `Requested advance of ₦${params.amount.toLocaleString('en-NG', { minimumFractionDigits: 2 })} exceeds maximum available advance of ₦${preview.maxAdvance.toLocaleString('en-NG', { minimumFractionDigits: 2 })}`,
          'ADVANCE_LIMIT_EXCEEDED',
          {
            maxAdvance: preview.maxAdvance,
            pooledPending: preview.pooledPendingSettlement,
            requested: params.amount,
            fee: quote.fee,
          }
        );
      }

      // Step F: Assert gross debit against user daily payout cap
      await assertWithinDailyPayoutCap({ userId, amount: quote.amount, tx });

      // Step G: Create SettlementPayout record (internal transfer — completed immediately)
      const payoutRecord = await tx.settlementPayout.create({
        data: {
          businessId,
          isAdvance: true,
          amount: quote.amount, // gross debit: requested + fee
          fee: quote.fee,
          netAmount: quote.netAmount, // wallet credit: requested
          destinationBankCode: settlementBankCode,
          destinationBankName: settlementBankName || 'Commercial Bank',
          destinationAccountNum: settlementAccountNumber,
          destinationAccountName: settlementAccountName || business.businessName,
          transferReference,
          status: 'completed',
          completedAt: now,
          adminApprovedBy: 'SYSTEM_ADVANCE_TO_WALLET',
          adminApprovedAt: now,
          narration: params.narration,
        },
      });

      // Step H: Credit the central wallet — the advance moves settlement -> wallet.
      // The gross amount (requested + fee) is recovered from maturing inflows by
      // the settlement release sweep, so the merchant never receives it twice.
      await WalletService.creditWallet(
        {
          userId,
          businessId,
          amount: quote.amount,
          fee: quote.fee,
          netAmount: quote.netAmount,
          reference: transferReference,
          source: 'settlement_advance',
          type: 'advance',
          description: `Settlement advance credited to wallet for ${business.businessName}`,
          linkedPayoutId: payoutRecord.id,
          metadata: {
            advance: true,
            grossDebit: quote.amount,
            fee: quote.fee,
            requested: quote.netAmount,
          },
        },
        tx
      );

      return payoutRecord;
    },
    { maxWait: 20000, timeout: 60000 }
  );

  // 7. Fire-and-forget notification dispatch (post-commit, outside transaction)
  void dispatchAdvanceWithdrawalEmail(payout.id);

  void emitToAdmins({
    type: 'advance_created',
    withdrawalId: payout.id,
    businessId,
    businessName: business.businessName,
    amount: quote.amount,
    timestamp: new Date().toISOString(),
  }).catch((err) => {
    logger.warn('Failed to emit advance_created to admins (non-critical)', { payoutId: payout.id, err });
  });

  void createReminderOnce({
    businessId,
    reminderType: 'advance_withdrawal',
    scheduledDate: new Date(),
    message: `Your advance of ${formatNaira(quote.netAmount)} (ref ${transferReference}) has been credited to your wallet. The remaining unsettled inflows will settle normally on schedule.`,
    referenceType: 'settlement_payout',
    referenceId: payout.id,
  }).catch((remErr) => {
    logger.warn('Failed to create advance_withdrawal reminder (non-critical)', { payoutId: payout.id, err: remErr });
  });

  return {
    id: payout.id,
    amount: quote.amount,
    fee: quote.fee,
    netAmount: quote.netAmount,
    transferReference,
    status: 'completed' as const,
    isAdvance: true,
    destinationBankName: settlementBankName || 'Commercial Bank',
    destinationAccountNum: settlementAccountNumber,
    destinationAccountName: settlementAccountName || business.businessName,
    initiatedAt: payout.initiatedAt,
    completedAt: payout.completedAt,
    message: `Settlement advance of ${formatNaira(quote.netAmount)} credited to your wallet.`,
  };
}

/**
 * Returns paginated advance payout history for a business.
 */
export async function listAdvanceHistory(
  userId: string,
  businessId: string,
  query: PayoutHistoryQueryInput
) {
  await verifyBusinessAccess(userId, businessId, 'wallet.read');

  const where: Prisma.SettlementPayoutWhereInput = {
    businessId,
    isAdvance: true,
  };

  if (query.status) {
    where.status = query.status;
  }

  if (query.search) {
    where.OR = [
      { transferReference: { contains: query.search, mode: 'insensitive' } },
      { destinationBankName: { contains: query.search, mode: 'insensitive' } },
      { destinationAccountName: { contains: query.search, mode: 'insensitive' } },
      { destinationAccountNum: { contains: query.search } },
      { narration: { contains: query.search, mode: 'insensitive' } },
    ];
  }

  const [items, total] = await Promise.all([
    prisma.settlementPayout.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.settlementPayout.count({ where }),
  ]);

  const totalPages = Math.ceil(total / query.limit) || 1;

  return {
    items: items.map((p) => ({
      id: p.id,
      amount: toNumber(p.amount),
      fee: toNumber(p.fee),
      netAmount: toNumber(p.netAmount),
      isAdvance: p.isAdvance,
      destinationBankName: p.destinationBankName,
      destinationAccountNum: p.destinationAccountNum,
      destinationAccountName: p.destinationAccountName,
      transferReference: p.transferReference,
      status: p.status,
      failureReason: p.failureReason,
      initiatedAt: p.initiatedAt,
      completedAt: p.completedAt,
      narration: p.narration,
    })),
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages,
      hasNext: query.page < totalPages,
      hasPrev: query.page > 1,
    },
  };
}
