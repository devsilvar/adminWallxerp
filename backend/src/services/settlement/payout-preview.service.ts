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
import { resolveTaxPolicy } from '@/services/tax/tax-policy.service';
import { verifyBusinessAccess } from '@/lib/ownership';
import { getDailyPayoutAllowance } from '@/modules/wallet/services/daily-payout-cap.service';
import { WalletService } from '@/services/wallet/wallet.service';

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

  // Advances fulfilled as a bank transfer (the original advance mode) already
  // debited the wallet, so they are cash out of the wallet just like a normal
  // withdrawal — but they carry isAdvance = true and were therefore skipped by
  // the `isAdvance: false` filters above. Counting them keeps the advertised
  // spendable balance from exceeding what the wallet actually holds.
  // Advances credited to the wallet (current mode) are identified by the type of
  // their linked ledger entry, so the two modes never double-count.
  const legacyAdvanceWhere = (scope: Prisma.SettlementPayoutWhereInput): Prisma.SettlementPayoutWhereInput => ({
    ...scope,
    isAdvance: true,
    status: 'completed',
    walletTx: { is: { type: 'payout' } },
  });

  const [legacyAdvanceAgg, bizLegacyAdvanceAgg] = await Promise.all([
    db.settlementPayout.aggregate({
      where: legacyAdvanceWhere({ businessId: { in: userBizIds } }),
      _sum: { amount: true },
    }),
    db.settlementPayout.aggregate({
      where: legacyAdvanceWhere({ businessId }),
      _sum: { amount: true },
    }),
  ]);
  const legacyAdvanceWithdrawn = toNumber(legacyAdvanceAgg._sum.amount ?? 0);
  const bizLegacyAdvanceWithdrawn = toNumber(bizLegacyAdvanceAgg._sum.amount ?? 0);

  // 3. Tax Liability calculation (unpaid reports or estimated monthly liability)
  const policy = await resolveTaxPolicy(businessId, db);
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

  // If no finalized reports yet, compute tax escrow reserve on total qualified taxable sales minus expenses.
  if (unpaidReports.length === 0 && policy.vat.chargeable) {
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
      const effectiveRate = policy.vat.rate / 100;
      estimatedTaxLiability = Math.round(grossProfit * effectiveRate * 100) / 100;
    }
  }

  // 4. Tax due (display-only) and available balance.
  // Exempt business => reserve 0.
  const taxReserve = policy.vat.chargeable ? Math.max(0, estimatedTaxLiability) : 0;

  // Settlement advances are an internal bucket transfer: the wallet was credited
  // up-front and the gross amount is recovered from maturing inflows. The net
  // advance still sitting in the wallet is therefore withdrawable alongside
  // settled inflows.
  const outstandingAdvance = await WalletService.getOutstandingAdvance(business.userId, tx);
  const businessOutstandingAdvance = await WalletService.getOutstandingAdvance(
    business.userId,
    tx,
    { businessId }
  );

  // The amount still "in settlement" is what will actually land in the merchant's
  // wallet when this batch matures. Any advance already drawn against the batch
  // has been handed over up-front — as a wallet credit or a bank payout — and is
  // recovered from these inflows, so it must not be advertised a second time.
  // `businessInflows` below stays gross on purpose: it is the inflow ledger, not
  // the amount still owed to the merchant.
  const netPendingSettlement = Math.max(0, round2(pendingSettlement - businessOutstandingAdvance.gross));
  const netPooledPendingSettlement = Math.max(0, round2(userPendingSettlement - outstandingAdvance.gross));

  // Available balance: Platform-held DVA funds minus total withdrawals, plus any
  // settlement advance already credited to the wallet and not yet recovered.
  // The platform absorbs Paystack's 1% DVA processing fee, so customer available balance is 100% of their DVA deposits.
  const availableForWithdrawal = Math.max(
    0,
    Math.round(
      (platformHeldFunds - totalWithdrawn - legacyAdvanceWithdrawn + outstandingAdvance.net) * 100
    ) / 100
  );

  // Attributable settled balance for this specific business:
  // Settled DVA inflows for this business minus all completed/pending withdrawals from this business.
  // Capped at overall availableForWithdrawal (cannot exceed pooled liquidity) and floored at 0.
  const businessBalance = Math.min(
    availableForWithdrawal,
    Math.max(
      0,
      Math.round(
        (businessSettledInflows - bizTotalWithdrawn - bizLegacyAdvanceWithdrawn + outstandingAdvance.net) * 100
      ) / 100
    )
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
    // Net of any advance already drawn against this batch — see note above.
    pendingSettlement: netPendingSettlement,
    pooledPendingSettlement: netPooledPendingSettlement,
    // Gross, pre-advance figures for callers that need the inflow ledger.
    grossPendingSettlement: pendingSettlement,
    grossPooledPendingSettlement: userPendingSettlement,
    /** Gross advance drawn from unsettled inflows and not yet recovered. */
    outstandingAdvance: outstandingAdvance.gross,
    /** Advances already paid out to the bank, deducted from the spendable balance. */
    legacyAdvanceWithdrawn,
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
  /** Unsettled inflows less any advance drawn against them. */
  pendingSettlement: number;
  pooledPendingSettlement: number;
  /** Unsettled inflows before netting off advances. */
  grossPendingSettlement: number;
  grossPooledPendingSettlement: number;
  maxAdvance: number;
  maxAdvancePct: number;
  minAdvanceAmount: number;
  remainingPending: number;
  /** Gross advance already credited to the wallet and not yet recovered. */
  outstandingAdvance: number;
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

  // An advance is an internal settlement -> wallet transfer. The gross amount
  // already advanced is recovered from the maturing inflows, so it is no longer
  // part of the balance that will settle normally.
  const outstandingAdvance = await WalletService.getOutstandingAdvance(business.userId, tx);
  const availablePending = Math.max(
    0,
    round2(pooledPendingSettlement - outstandingAdvance.gross)
  );

  // One-shot 30% math:
  // maxAdvance = floor(availablePending * maxAdvancePct / 100) via round2
  // If hasOutstandingAdvance is true, merchant already took an advance for this batch => maxAdvance = 0
  let maxAdvance = 0;
  let remainingPending = availablePending;

  if (!hasOutstandingAdvance && availablePending > 0) {
    maxAdvance = round2(Math.floor((availablePending * maxAdvancePct) / 100));
    remainingPending = Math.max(0, round2(availablePending - maxAdvance));
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
    // Net of any advance already drawn, so the card agrees with the settlement page.
    pendingSettlement: Math.max(0, round2(pendingSettlement - outstandingAdvance.gross)),
    pooledPendingSettlement: availablePending,
    grossPendingSettlement: pendingSettlement,
    grossPooledPendingSettlement: pooledPendingSettlement,
    maxAdvance,
    maxAdvancePct: feeConfig.maxAdvancePct,
    minAdvanceAmount: feeConfig.minAdvanceAmount,
    remainingPending,
    outstandingAdvance: outstandingAdvance.gross,
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
