import prisma from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import {
  dvaFeeCapThreshold,
  dvaFeeTotalFromBuckets,
  feeSchedule,
  round2,
} from '@/lib/paystack-fees';
import config from '@/config';
import {
  toNumber,
  getWithdrawalActor,
  SETTLED_SALE_STATUSES,
  LIVE_SALE_STATUSES,
} from '@/shared/helpers';
import { getPayoutLockStatus } from '@/lib/payout-lock';
import { PlatformConfigService } from '@/services/platform-config.service';
import { verifyBusinessAccess } from '@/lib/ownership';
import { getDailyPayoutAllowance } from '@/modules/wallet/services/daily-payout-cap.service';

/**
 * Computes available withdrawal balance, tax due (display-only), and settlement details.
 *
 * Withdrawal semantics: D2 permanently retires the 7.5% auto-split.
 * 100% of customer deposits land in WallX balance and are credited in full to
 * the merchant's wallet. Unpaid tax is reported via `taxReserve` for UI/reminders
 * but is NOT subtracted from `availableForWithdrawal`.
 *
 * @param tx - Optional transaction client (for use inside withdraw/approve fences)
 * @param opts - Optional excludePayoutId (for admin approve-time recheck)
 */
export async function getPayoutPreview(
  userId: string,
  businessId: string,
  tx?: Prisma.TransactionClient,
  opts?: { excludePayoutId?: string }
) {
  const { business: accessBiz } = await verifyBusinessAccess(userId, businessId, 'wallet.read', tx);
  const business = await getWithdrawalActor(accessBiz.userId, businessId, tx);
  const db = tx ?? prisma;

  // 1. DVA Inflows breakdown:
  // DVA-originated inflows only — matches getDVABalance (dva.service.ts:363-367).
  // Centralized Banking: Because the DVA and Paystack balance are centralized at the User level
  // (1 human = 1 BVN = 1 DVA), total withdrawable wallet funds reflect the user's pooled DVA
  // balance across all their businesses, while sales and tax remain strictly compartmentalized.
  const userBizRecords = await db.business.findMany({
    where: { userId: business.userId },
    select: { id: true },
  });
  const userBizIds = userBizRecords.length > 0 ? userBizRecords.map((b) => b.id) : [businessId];

  // D2: Split retired; totalPlatformRetained is always 0
  const totalPlatformRetained = 0;
  const now = new Date();

  // D1 / D3 / §4.4: In settlement vs released buckets
  // In settlement = DVA inflow, status ∈ LIVE_SALE_STATUSES, AND walletTx IS NULL (not yet released)
  // Released / withdrawable base = DVA inflow with linked WalletTransaction (walletTx IS NOT NULL)
  const userDvaBase: Prisma.SalesTransactionWhereInput = {
    businessId: { in: userBizIds },
    source: 'bank_transfer',
    dvaOrigin: true,
    status: { in: LIVE_SALE_STATUSES },
  };

  const [userSettledAgg, userSettlingAgg] = await Promise.all([
    db.salesTransaction.aggregate({
      where: {
        ...userDvaBase,
        walletTx: { isNot: null },
      },
      _sum: { amount: true },
    }),
    db.salesTransaction.aggregate({
      where: {
        ...userDvaBase,
        walletTx: null,
      },
      _sum: { amount: true },
    }),
  ]);

  const totalSettledInflowsAll = toNumber(userSettledAgg._sum.amount ?? 0);
  const userPendingSettlement = toNumber(userSettlingAgg._sum.amount ?? 0);
  const totalInflowsAll = totalSettledInflowsAll + userPendingSettlement;
  // Platform-held and withdrawable funds strictly reflect SETTLED (released) inflows
  const platformHeldFunds = totalSettledInflowsAll;

  // Active business's own settled & settling DVA inflows
  const businessDvaBase: Prisma.SalesTransactionWhereInput = {
    businessId,
    source: 'bank_transfer',
    dvaOrigin: true,
    status: { in: LIVE_SALE_STATUSES },
  };

  const [bizSettledAgg, bizSettlingAgg] = await Promise.all([
    db.salesTransaction.aggregate({
      where: {
        ...businessDvaBase,
        walletTx: { isNot: null },
      },
      _sum: { amount: true },
    }),
    db.salesTransaction.aggregate({
      where: {
        ...businessDvaBase,
        walletTx: null,
      },
      _sum: { amount: true },
    }),
  ]);

  const businessSettledInflows = toNumber(bizSettledAgg._sum.amount ?? 0);
  const pendingSettlement = toNumber(bizSettlingAgg._sum.amount ?? 0);
  const businessInflows = businessSettledInflows + pendingSettlement;

  // 1b. Processing fees Paystack has ALREADY taken on those inflows.
  let estimatedProcessingFees = 0;
  const capThreshold = dvaFeeCapThreshold();
  if (Number.isFinite(capThreshold)) {
    const dvaBase: Prisma.SalesTransactionWhereInput = {
      businessId: { in: userBizIds },
      source: 'bank_transfer',
      dvaOrigin: true,
      status: { in: SETTLED_SALE_STATUSES },
    };

    // Plain inflows pool 100% on the platform, so the platform bears the full fee.
    const plainBelow = await db.salesTransaction.aggregate({
      where: { ...dvaBase, settledViaSplit: false, amount: { lte: capThreshold } },
      _sum: { amount: true },
    });
    const plainAbove = await db.salesTransaction.count({
      where: { ...dvaBase, settledViaSplit: false, amount: { gt: capThreshold } },
    });

    // Split-settled inflows: the SME's subaccount already took its share, so the
    // platform only bears the fee on the slice it retained.
    const splitBelow = await db.salesTransaction.aggregate({
      where: { ...dvaBase, settledViaSplit: true, platformRetained: { lte: capThreshold } },
      _sum: { platformRetained: true },
    });
    const splitAbove = await db.salesTransaction.count({
      where: { ...dvaBase, settledViaSplit: true, platformRetained: { gt: capThreshold } },
    });

    estimatedProcessingFees =
      dvaFeeTotalFromBuckets(toNumber(plainBelow._sum.amount ?? 0), plainAbove) +
      dvaFeeTotalFromBuckets(toNumber(splitBelow._sum.platformRetained ?? 0), splitAbove);
  }

  // 2. Total completed / pending / processing withdrawals across user's businesses
  // Exclude advance withdrawals (isAdvance: false) so normal withdrawals and advances are disjoint
  const payoutsWhere: any = {
    businessId: { in: userBizIds },
    status: { in: ['completed', 'pending', 'processing'] },
    isAdvance: false,
  };
  // When rechecking affordability at approval time, exclude the payout being approved
  if (opts?.excludePayoutId) {
    payoutsWhere.id = { not: opts.excludePayoutId };
  }
  const payoutsAggregate = await db.settlementPayout.aggregate({
    where: payoutsWhere,
    _sum: {
      amount: true,
    },
  });
  const totalWithdrawn = toNumber(payoutsAggregate._sum.amount ?? 0);

  const [completedAggregate, pendingAggregate] = await Promise.all([
    db.settlementPayout.aggregate({
      where: { businessId: { in: userBizIds }, status: 'completed', isAdvance: false },
      _sum: { amount: true },
    }),
    db.settlementPayout.aggregate({
      where: { businessId: { in: userBizIds }, status: { in: ['pending', 'processing'] }, isAdvance: false },
      _sum: { amount: true },
    }),
  ]);
  const completedWithdrawn = toNumber(completedAggregate._sum.amount ?? 0);
  const pendingWithdrawn = toNumber(pendingAggregate._sum.amount ?? 0);

  // Active business's own completed/pending withdrawals (strictly for this business's outflow tracking)
  const [bizCompletedAggregate, bizPendingAggregate] = await Promise.all([
    db.settlementPayout.aggregate({
      where: { businessId, status: 'completed', isAdvance: false },
      _sum: { amount: true },
    }),
    db.settlementPayout.aggregate({
      where: { businessId, status: { in: ['pending', 'processing'] }, isAdvance: false },
      _sum: { amount: true },
    }),
  ]);
  const bizCompletedWithdrawn = toNumber(bizCompletedAggregate._sum.amount ?? 0);
  const bizPendingWithdrawn = toNumber(bizPendingAggregate._sum.amount ?? 0);
  const bizTotalWithdrawn = bizCompletedWithdrawn + bizPendingWithdrawn;

  // 3. Tax Liability calculation (unpaid reports or estimated monthly liability)
  const unpaidReports = await db.monthlyTaxReport.findMany({
    where: {
      businessId,
      paymentStatus: { in: ['pending', 'failed'] },
    },
  });

  let estimatedTaxLiability = 0;
  for (const report of unpaidReports) {
    estimatedTaxLiability += toNumber(report.taxPayable);
  }

  // If no finalized reports yet, compute 7.5% tax escrow reserve on total qualified taxable sales minus expenses (R9).
  if (unpaidReports.length === 0) {
    const qualifiedTaxableSalesAgg = await db.salesTransaction.aggregate({
      where: {
        businessId,
        source: 'bank_transfer',
        dvaOrigin: true,
        status: { in: SETTLED_SALE_STATUSES },
        isTaxable: true,
      },
      _sum: { amount: true },
    });
    const qualifiedTaxableSales = toNumber(qualifiedTaxableSalesAgg._sum.amount ?? 0);

    if (qualifiedTaxableSales > 0) {
      const totalExpensesAgg = await db.expense.aggregate({
        where: { businessId, isDeductible: true },
        _sum: { amount: true },
      });
      const totalExpenses = toNumber(totalExpensesAgg._sum.amount ?? 0);
      const grossProfit = Math.max(0, qualifiedTaxableSales - totalExpenses);
      estimatedTaxLiability = Math.round(grossProfit * 0.075 * 100) / 100;
    }
  }

  // 4. Tax due (display-only) and available balance.
  const taxReserve = Math.max(0, estimatedTaxLiability);

  // Available balance: Platform-held DVA funds minus total withdrawals.
  // The platform absorbs Paystack's 1% DVA processing fee, so customer available balance is 100% of their DVA deposits.
  const availableForWithdrawal = Math.max(
    0,
    Math.round((platformHeldFunds - totalWithdrawn) * 100) / 100
  );

  // Attributable settled balance for this specific business:
  // Settled DVA inflows for this business minus all completed/pending withdrawals from this business.
  // Capped at overall availableForWithdrawal (cannot exceed pooled liquidity) and floored at 0.
  const businessBalance = Math.min(
    availableForWithdrawal,
    Math.max(0, Math.round((businessSettledInflows - bizTotalWithdrawn) * 100) / 100)
  );

  const isPinLocked = Boolean(
    business.user.pinLockedUntil && business.user.pinLockedUntil > new Date()
  );

  const payoutChangeLock = getPayoutLockStatus(business);
  const feeConfig = await PlatformConfigService.getFeeConfig();
  const dailyAllowance = await getDailyPayoutAllowance(userId, tx);

  return {
    businessId: business.id,
    businessName: business.businessName,
    walletBalance: availableForWithdrawal,
    availableForWithdrawal,
    businessBalance,
    isPooled: userBizRecords.length > 1,
    dailyPayoutLimit: dailyAllowance.dailyLimit,
    dailyPaidOut: dailyAllowance.alreadyPaidOut,
    dailyRemaining: Number.isFinite(dailyAllowance.remaining) ? dailyAllowance.remaining : null,
    totalInflows: businessInflows,
    businessInflows,
    pooledInflows: totalInflowsAll,
    pendingSettlement,
    pooledPendingSettlement: userPendingSettlement,
    totalSplitSettled: 0,
    totalWithdrawn: bizTotalWithdrawn,
    businessWithdrawn: bizTotalWithdrawn,
    pooledTotalWithdrawn: totalWithdrawn,
    pendingWithdrawn: bizPendingWithdrawn,
    pooledPendingWithdrawn: pendingWithdrawn,
    completedWithdrawn: bizCompletedWithdrawn,
    pooledCompletedWithdrawn: completedWithdrawn,
    estimatedProcessingFees,
    taxReserve,
    fees: feeSchedule({
      pct: feeConfig.withdrawalFeePct,
      cap: feeConfig.withdrawalFeeCap,
      minAmount: feeConfig.minWithdrawalAmount,
    }),
    settlementAccount: {
      isConnected: Boolean(
        (business.settlementAccountNumber || business.user.settlementAccountNumber) &&
        (business.settlementBankCode || business.user.settlementBankCode)
      ),
      bankName: business.settlementBankName || business.user.settlementBankName,
      bankCode: business.settlementBankCode || business.user.settlementBankCode,
      accountNumber: business.settlementAccountNumber || business.user.settlementAccountNumber,
      accountName: business.settlementAccountName || business.user.settlementAccountName,
      connectedAt: business.settlementConnectedAt || business.user.settlementConnectedAt,
    },
    autoSplit: {
      enabled: business.autoSplitEnabled,
      taxSplitPercentage: toNumber(business.taxSplitPercentage),
      subaccountCode: business.paystackSubaccountCode,
    },
    autoPayoutEnabled: Boolean(business.user.autoPayoutEnabled),
    security: {
      hasPin: Boolean(business.user.transactionPin),
      isPinLocked,
      remainingAttempts: isPinLocked ? 0 : Math.max(0, config.pin.maxAttempts - (business.user.pinAttempts || 0)),
    },
    payoutChange: payoutChangeLock,
  };
}

export interface AdvancePreviewResult {
  businessId: string;
  businessName: string;
  isPooled: boolean;
  pendingSettlement: number;
  pooledPendingSettlement: number;
  maxAdvance: number;
  maxAdvancePct: number;
  minAdvanceAmount: number;
  remainingPending: number;
  hasOutstandingAdvance: boolean;
  lastAdvance: {
    reference: string;
    amount: number;
    fee: number;
    netAmount: number;
    status: string;
    createdAt: Date;
  } | null;
  fees: {
    advance: {
      pct: number;
      cap: number;
      maxPct: number;
      minAmount: number;
      note: string;
    };
  };
  settlementAccount: {
    isConnected: boolean;
    bankName?: string | null;
    bankCode?: string | null;
    accountNumber?: string | null;
    accountName?: string | null;
    connectedAt?: Date | null;
  };
  security: {
    hasPin: boolean;
    isPinLocked: boolean;
    remainingAttempts: number;
  };
  dailyPayoutLimit: number;
  dailyPaidOut: number;
  dailyRemaining: number | null;
  payoutChange: any;
}

/**
 * Computes settlement advance availability under the strict One-Shot 30% per batch rule.
 *
 * Sales-neutral invariant: This function NEVER mutates any SalesTransaction rows.
 *
 * Pool definition:
 *   source: 'bank_transfer'
 *   dvaOrigin: true
 *   status: IN LIVE_SALE_STATUSES
 *   needsVerification: false (excludes unverified inflow counter-deposits)
 *   walletTx: null (unsettled / awaiting T+1 release)
 *
 * Batch gate:
 *   batchStart = MIN(transactionDate) of the current pending pool.
 *   If any isAdvance=true payout exists with createdAt >= batchStart in pending/processing/completed,
 *   the one advance for this batch has already been consumed: maxAdvance=0, hasOutstandingAdvance=true.
 */
export async function getAdvancePreview(
  userId: string,
  businessId: string,
  tx?: Prisma.TransactionClient
): Promise<AdvancePreviewResult> {
  const { business: accessBiz } = await verifyBusinessAccess(userId, businessId, 'wallet.read', tx);
  const business = await getWithdrawalActor(accessBiz.userId, businessId, tx);
  const db = tx ?? prisma;

  // 1. Identify user's businesses for pooled liquidity
  const userBizRecords = await db.business.findMany({
    where: { userId: business.userId },
    select: { id: true },
  });
  const userBizIds = userBizRecords.length > 0 ? userBizRecords.map((b) => b.id) : [businessId];

  // 2. Pending Settlement condition:
  // LIVE_SALE_STATUSES = ['pending', 'confirmed', 'completed']
  // Exclude reversed and disputed transactions, exclude unverified counter-deposits
  const userPendingWhere: Prisma.SalesTransactionWhereInput = {
    businessId: { in: userBizIds },
    source: 'bank_transfer',
    dvaOrigin: true,
    status: { in: LIVE_SALE_STATUSES },
    needsVerification: false,
    walletTx: null,
  };

  const bizPendingWhere: Prisma.SalesTransactionWhereInput = {
    businessId,
    source: 'bank_transfer',
    dvaOrigin: true,
    status: { in: LIVE_SALE_STATUSES },
    needsVerification: false,
    walletTx: null,
  };

  const [bizPendingAgg, userPendingAgg, batchStartAgg] = await Promise.all([
    db.salesTransaction.aggregate({
      where: bizPendingWhere,
      _sum: { amount: true },
    }),
    db.salesTransaction.aggregate({
      where: userPendingWhere,
      _sum: { amount: true },
    }),
    db.salesTransaction.aggregate({
      where: userPendingWhere,
      _min: { transactionDate: true },
    }),
  ]);

  const pendingSettlement = toNumber(bizPendingAgg._sum.amount ?? 0);
  const pooledPendingSettlement = toNumber(userPendingAgg._sum.amount ?? 0);
  const batchStart = batchStartAgg._min.transactionDate;

  // 3. ONE-SHOT BATCH GATE:
  // If batchStart is null => 0 pending => hasOutstandingAdvance=false, maxAdvance=0
  // Else, check if an advance was already taken where createdAt >= batchStart
  let hasOutstandingAdvance = false;
  let lastAdvance: AdvancePreviewResult['lastAdvance'] = null;

  if (batchStart) {
    // One-shot gate: an advance counts as "already taken" for this batch when
    // it is pending/processing/completed, OR failed with needsReconciliation
    // (the transfer is ambiguous/failed but the funds are still locked, so a
    // second draw must not be allowed). Keep this in lock-step with the
    // request-side gate in advance.service.ts (Step D).
    const existingAdvance = await db.settlementPayout.findFirst({
      where: {
        businessId: { in: userBizIds },
        isAdvance: true,
        OR: [
          { status: { in: ['pending', 'processing', 'completed'] } },
          { status: 'failed', needsReconciliation: true },
        ],
        createdAt: { gte: batchStart },
      },
      orderBy: { createdAt: 'desc' },
      select: {
        transferReference: true,
        amount: true,
        fee: true,
        netAmount: true,
        status: true,
        createdAt: true,
      },
    });

    if (existingAdvance) {
      hasOutstandingAdvance = true;
      lastAdvance = {
        reference: existingAdvance.transferReference,
        amount: toNumber(existingAdvance.amount),
        fee: toNumber(existingAdvance.fee),
        netAmount: toNumber(existingAdvance.netAmount),
        status: existingAdvance.status,
        createdAt: existingAdvance.createdAt,
      };
    }
  }

  const feeConfig = await PlatformConfigService.getFeeConfig();
  const maxAdvancePct = feeConfig.maxAdvancePct;

  // One-shot 30% math:
  // maxAdvance = floor(pooledPendingSettlement * maxAdvancePct / 100) via round2
  // If hasOutstandingAdvance is true, merchant already took an advance for this batch => maxAdvance = 0
  let maxAdvance = 0;
  let remainingPending = pooledPendingSettlement;

  if (!hasOutstandingAdvance && pooledPendingSettlement > 0) {
    maxAdvance = round2(Math.floor((pooledPendingSettlement * maxAdvancePct) / 100));
    remainingPending = Math.max(0, round2(pooledPendingSettlement - maxAdvance));
  }

  const isPinLocked = Boolean(
    business.user.pinLockedUntil && business.user.pinLockedUntil > new Date()
  );
  const payoutChangeLock = getPayoutLockStatus(business);
  const dailyAllowance = await getDailyPayoutAllowance(userId, tx);

  return {
    businessId: business.id,
    businessName: business.businessName,
    isPooled: userBizRecords.length > 1,
    pendingSettlement,
    pooledPendingSettlement,
    maxAdvance,
    maxAdvancePct: feeConfig.maxAdvancePct,
    minAdvanceAmount: feeConfig.minAdvanceAmount,
    remainingPending,
    hasOutstandingAdvance,
    lastAdvance,
    fees: {
      advance: {
        pct: feeConfig.advanceFeePct,
        cap: feeConfig.advanceFeeCap,
        maxPct: feeConfig.maxAdvancePct,
        minAmount: feeConfig.minAdvanceAmount,
        note: `Advance fee: ${feeConfig.advanceFeePct}% capped at ₦${feeConfig.advanceFeeCap.toLocaleString('en-NG', { minimumFractionDigits: 2 })}. Maximum advance is ${feeConfig.maxAdvancePct}% of unsettled balance.`,
      },
    },
    settlementAccount: {
      isConnected: Boolean(
        (business.settlementAccountNumber || business.user.settlementAccountNumber) &&
        (business.settlementBankCode || business.user.settlementBankCode)
      ),
      bankName: business.settlementBankName || business.user.settlementBankName,
      bankCode: business.settlementBankCode || business.user.settlementBankCode,
      accountNumber: business.settlementAccountNumber || business.user.settlementAccountNumber,
      accountName: business.settlementAccountName || business.user.settlementAccountName,
      connectedAt: business.settlementConnectedAt || business.user.settlementConnectedAt,
    },
    security: {
      hasPin: Boolean(business.user.transactionPin),
      isPinLocked,
      remainingAttempts: isPinLocked ? 0 : Math.max(0, config.pin.maxAttempts - (business.user.pinAttempts || 0)),
    },
    dailyPayoutLimit: dailyAllowance.dailyLimit,
    dailyPaidOut: dailyAllowance.alreadyPaidOut,
    dailyRemaining: Number.isFinite(dailyAllowance.remaining) ? dailyAllowance.remaining : null,
    payoutChange: payoutChangeLock,
  };
}
