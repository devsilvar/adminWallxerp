import prisma, { TxClient } from '@/lib/prisma';
import config from '@/config';
import { AppError } from '@/middleware/errorHandler';
import { logAudit } from '@/lib/audit';
import { toNumber } from '@/shared/helpers';
import { ACCRUAL_SALE_INCLUDE, isAccrualLinked } from '@/shared/helpers/accrual';
import { transferFee, stampDuty, withdrawalCost, round2 } from '@/lib/paystack-fees';
import { canonicalTier, getPlanLimits, isFeatureAllowed } from '@/config/subscription-plans';
import { getPaymentProvider } from '@/lib/payment';
import { TreasuryAnalyticsFilterInput, AdminTransactionsQueryInput, AdminOverrideSubscriptionInput } from '@/validators/admin.validator';
import {
  dispatchAccountDeactivatedEmail,
  dispatchNewSignupNotificationEmails,
  dispatchSubscriptionApprovedEmail,
  dispatchSubscriptionRejectedEmail,
} from '@/services/email-dispatch.service';
import { isTestAccountEmail } from '@/lib/test-accounts';
import { formatLagosDateTime } from '@/lib/format';
import logger from '@/lib/logger';
import { emitToAdmins } from './realtime-admin.helper';

export async function getDashboardStats() {
  const [totalUsers, totalBusinesses, totalTaxReports, recentSignups] =
    await Promise.all([
      prisma.user.count(),
      prisma.business.count(),
      prisma.monthlyTaxReport.count(),
      prisma.user.findMany({
        where: {
          createdAt: {
            gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          },
        },
        select: {
          id: true,
          email: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
    ]);

  const [revenueResult, pendingWithdrawals, unverifiedInflowsCount, pendingSubscriptionsCount, disputedWithdrawals] =
    await Promise.all([
      prisma.monthlyTaxReport.aggregate({
        _sum: { totalSales: true },
      }),
      prisma.settlementPayout.findMany({
        where: { status: 'pending' },
        select: { createdAt: true },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.salesTransaction.count({
        where: { needsVerification: true },
      }),
      prisma.subscriptionSubmission.count({
        where: { status: 'pending' },
      }),
      prisma.settlementPayout.findMany({
        where: { status: 'failed', needsReconciliation: true },
        select: { amount: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

  const now = Date.now();
  const breachedWithdrawals = pendingWithdrawals.filter(
    (w) => (now - w.createdAt.getTime()) > 24 * 60 * 60 * 1000
  );
  const oldestPendingHours = pendingWithdrawals.length > 0
    ? Math.round((now - pendingWithdrawals[0].createdAt.getTime()) / (1000 * 60 * 60))
    : 0;

  const oldestDisputeHours = disputedWithdrawals.length > 0
    ? Math.round((now - disputedWithdrawals[0].createdAt.getTime()) / (1000 * 60 * 60))
    : 0;
  const disputeValue = disputedWithdrawals.reduce((sum, w) => sum + toNumber(w.amount), 0);

  return {
    totalUsers,
    totalBusinesses,
    totalTaxReports,
    totalRevenueProcessed: revenueResult._sum.totalSales ?? 0,
    recentSignups,
    withdrawalSla: {
      pendingCount: pendingWithdrawals.length,
      breachedCount: breachedWithdrawals.length,
      oldestPendingHours,
    },
    withdrawalDisputes: {
      count: disputedWithdrawals.length,
      valueNaira: disputeValue,
      oldestHours: oldestDisputeHours,
    },
    unverifiedInflows: {
      count: unverifiedInflowsCount,
    },
    pendingSubscriptionsCount,
  };
}

export async function listUsers(
  page: number,
  limit: number,
  search?: string,
  filters?: { role?: 'user' | 'admin'; isActive?: boolean; isVerified?: boolean }
) {
  const where: Record<string, unknown> = {};
  if (search) {
    (where as Record<string, unknown>).OR = [
      { email: { contains: search, mode: 'insensitive' as const } },
      { phone: { contains: search } },
    ];
  }
  if (filters?.role) where.role = filters.role;
  if (typeof filters?.isActive === 'boolean') where.isActive = filters.isActive;
  if (typeof filters?.isVerified === 'boolean') where.isVerified = filters.isVerified;

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: {
        id: true,
        email: true,
        phone: true,
        role: true,
        isVerified: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
        autoPayoutEnabled: true,
        subscriptionTier: true,
        subscriptionExpiresAt: true,
        trialEndsAt: true,
        _count: { select: { businesses: true } },
      },
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.user.count({ where }),
  ]);

  const totalPages = Math.ceil(total / limit);

  const mappedUsers = users.map((u) => ({
    id: u.id,
    email: u.email,
    phone: u.phone,
    role: u.role,
    isVerified: u.isVerified,
    isActive: u.isActive,
    lastLoginAt: u.lastLoginAt,
    createdAt: u.createdAt,
    _count: u._count,
    autoPayoutEnabled: u.autoPayoutEnabled,
    subscriptionTier: u.subscriptionTier,
    subscriptionExpiresAt: u.subscriptionExpiresAt ? u.subscriptionExpiresAt.toISOString() : null,
    trialEndsAt: u.trialEndsAt ? u.trialEndsAt.toISOString() : null,
  }));

  return {
    data: mappedUsers,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    },
  };
}

export async function getUserDetail(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      phone: true,
      role: true,
      isVerified: true,
      isActive: true,
      lastLoginAt: true,
      createdAt: true,
      updatedAt: true,
      autoPayoutEnabled: true,
      subscriptionTier: true,
      subscriptionExpiresAt: true,
      trialEndsAt: true,
      walletBalance: {
        select: {
          balance: true,
          lockedBalance: true,
          currency: true,
        },
      },
      feedbacks: {
        select: {
          id: true,
          rating: true,
          sentiment: true,
          comment: true,
          tags: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 5,
      },
      subscriptionSubmissions: {
        select: {
          id: true,
          plan: true,
          billingCycle: true,
          amount: true,
          receiptUrl: true,
          status: true,
          notes: true,
          reviewedAt: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 5,
      },
      businesses: {
        select: {
          id: true,
          businessName: true,
          ownerName: true,
          taxId: true,
          businessType: true,
          address: true,
          state: true,
          city: true,
          virtualAccountNumber: true,
          virtualAccountBank: true,
          settlementAccountNumber: true,
          settlementBankName: true,
          settlementAccountName: true,
          createdAt: true,
          _count: {
            select: {
              sales: true,
              expenses: true,
              invoices: true,
              customers: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      },
    },
  });

  if (!user) {
    throw new AppError(404, 'User not found', 'USER_NOT_FOUND');
  }

  let walletBreakdown = undefined;
  if (user.walletBalance) {
    const totalBalance = toNumber(user.walletBalance.balance);
    const lockedBalance = toNumber(user.walletBalance.lockedBalance);
    const availableBalance = Math.max(0, totalBalance - lockedBalance);

    const walletTxs = await prisma.walletTransaction.findMany({
      where: { userId },
      select: {
        businessId: true,
        type: true,
        amount: true,
        netAmount: true,
      },
    });

    const bizMap = new Map<string, { creditTotal: number; debitTotal: number; count: number }>();
    for (const b of user.businesses) {
      bizMap.set(b.id, { creditTotal: 0, debitTotal: 0, count: 0 });
    }

    let unattributedNet = 0;
    for (const tx of walletTxs) {
      const isCredit = tx.type === 'credit' || tx.type === 'reversal';
      const amt = toNumber(tx.netAmount || tx.amount);

      if (tx.businessId && bizMap.has(tx.businessId)) {
        const entry = bizMap.get(tx.businessId)!;
        entry.count += 1;
        if (isCredit) {
          entry.creditTotal += amt;
        } else {
          entry.debitTotal += amt;
        }
      } else {
        if (isCredit) {
          unattributedNet += amt;
        } else {
          unattributedNet -= amt;
        }
      }
    }

    const businessContributions = user.businesses.map((biz) => {
      const stats = bizMap.get(biz.id) || { creditTotal: 0, debitTotal: 0, count: 0 };
      const netContribution = stats.creditTotal - stats.debitTotal;
      const percentageOfTotal = totalBalance > 0 ? Math.max(0, (netContribution / totalBalance) * 100) : 0;
      return {
        businessId: biz.id,
        businessName: biz.businessName,
        netContribution,
        creditTotal: stats.creditTotal,
        debitTotal: stats.debitTotal,
        transactionCount: stats.count,
        percentageOfTotal,
      };
    });

    walletBreakdown = {
      totalBalance,
      lockedBalance,
      availableBalance,
      businesses: businessContributions,
      unattributedBalance: unattributedNet,
    };
  }

  return {
    ...user,
    walletBalance: user.walletBalance
      ? {
          balance: toNumber(user.walletBalance.balance),
          lockedBalance: toNumber(user.walletBalance.lockedBalance),
          currency: user.walletBalance.currency,
        }
      : null,
    walletBreakdown,
    subscriptionSubmissions: user.subscriptionSubmissions.map((s) => ({
      ...s,
      amount: toNumber(s.amount),
    })),
  };
}

export async function toggleUserStatus(
  userId: string,
  isActive: boolean,
  adminId?: string,
  tx?: TxClient,
  reason?: string
) {
  const db = tx ?? prisma;

  const user = await db.user.findUnique({ where: { id: userId } });

  if (!user) {
    throw new AppError(404, 'User not found', 'USER_NOT_FOUND');
  }

  if (user.role === 'admin') {
    throw new AppError(400, 'Cannot change status of an admin user', 'CANNOT_MODIFY_ADMIN');
  }

  const updated = await db.user.update({
    where: { id: userId },
    data: { isActive },
    select: {
      id: true,
      email: true,
      isActive: true,
    },
  });

  await logAudit({
    userId: adminId,
    action: isActive ? 'admin.user_activated' : 'admin.user_deactivated',
    resourceType: 'user',
    resourceId: userId,
    oldData: { isActive: user.isActive },
    newData: { isActive, ...(reason ? { reason } : {}) },
  }, tx);

  if (!tx && !isActive && user.isActive) {
    void dispatchAccountDeactivatedEmail(userId, reason);
  }

  return updated;
}

export async function verifyUserEmail(userId: string, adminId?: string, tx?: TxClient) {
  const db = tx ?? prisma;

  const user = await db.user.findUnique({ where: { id: userId } });

  if (!user) {
    throw new AppError(404, 'User not found', 'USER_NOT_FOUND');
  }

  if (user.isVerified) {
    // Already verified - return current state (idempotent)
    return {
      id: user.id,
      email: user.email,
      isVerified: true,
    };
  }

  const updated = await db.user.update({
    where: { id: userId },
    data: { isVerified: true },
    select: {
      id: true,
      email: true,
      isVerified: true,
    },
  });

  await logAudit({
    userId: adminId,
    action: 'admin.user_email_verified',
    resourceType: 'user',
    resourceId: userId,
    oldData: { isVerified: false },
    newData: { isVerified: true },
  }, tx);

  return updated;
}

export async function unverifyUserEmail(userId: string, adminId?: string, tx?: TxClient) {
  const db = tx ?? prisma;

  const user = await db.user.findUnique({ where: { id: userId } });

  if (!user) {
    throw new AppError(404, 'User not found', 'USER_NOT_FOUND');
  }

  if (!user.isVerified) {
    // Already unverified - return current state (idempotent)
    return {
      id: user.id,
      email: user.email,
      isVerified: false,
    };
  }

  const updated = await db.user.update({
    where: { id: userId },
    data: { isVerified: false },
    select: {
      id: true,
      email: true,
      isVerified: true,
    },
  });

  await logAudit({
    userId: adminId,
    action: 'admin.user_email_unverified',
    resourceType: 'user',
    resourceId: userId,
    oldData: { isVerified: true },
    newData: { isVerified: false },
  }, tx);

  return updated;
}

export async function listAllBusinesses(page: number, limit: number) {
  const [businesses, total] = await Promise.all([
    prisma.business.findMany({
      select: {
        id: true,
        businessName: true,
        ownerName: true,
        taxId: true,
        businessType: true,
        state: true,
        city: true,
        createdAt: true,
        user: {
          select: { id: true, email: true },
        },
      },
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.business.count(),
  ]);

  const totalPages = Math.ceil(total / limit);

  return {
    data: businesses,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    },
  };
}

export async function listAuditLogs(
  page: number,
  limit: number,
  filters?: { userId?: string; action?: string }
) {
  const where: any = {};
  if (filters?.userId) where.userId = filters.userId;
  if (filters?.action) where.action = filters.action;

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      include: {
        user: { select: { id: true, email: true } },
      },
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.auditLog.count({ where }),
  ]);

  const totalPages = Math.ceil(total / limit);

  return {
    data: logs,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    },
  };
}

/**
 * Grants one-time payout account change permission (24h expiry)
 * 
 * Idempotent: re-grant refreshes timestamp
 */
export async function grantPayoutChangePermission(
  businessId: string,
  adminId: string,
  tx?: TxClient
) {
  const db = tx ?? prisma;

  const business = await db.business.findUnique({
    where: { id: businessId },
    select: {
      id: true,
      businessName: true,
      settlementAccountNumber: true,
      userId: true,
    },
  });

  if (!business) {
    throw new AppError(404, 'Business not found', 'BUSINESS_NOT_FOUND');
  }

  if (!business.settlementAccountNumber) {
    throw new AppError(
      400,
      'No payout account connected yet. Nothing to lock or unlock.',
      'NO_PAYOUT_ACCOUNT'
    );
  }

  const now = new Date();
  const updatedBusiness = await db.business.update({
    where: { id: businessId },
    data: {
      payoutChangePermitted: true,
      payoutChangePermittedAt: now,
      payoutChangePermittedBy: adminId,
      // Clear used timestamp if re-granting after a previous use
      payoutChangeUsedAt: null,
    },
    select: {
      id: true,
      businessName: true,
      payoutChangePermitted: true,
      payoutChangePermittedAt: true,
      payoutChangePermittedBy: true,
    },
  });

  await logAudit({
    userId: adminId,
    businessId,
    action: 'admin.payout_change_permitted',
    resourceType: 'business',
    resourceId: businessId,
    newData: {
      permitted: true,
      expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
    },
  }, tx);

  // Fire reminder notification (post-transaction, fire-and-forget)
  if (!tx) {
    // Only fire outside transaction to avoid blocking
    const { createReminderOnce } = await import('@/services/reminder.service');
    createReminderOnce({
      businessId,
      reminderType: 'payout_change_permitted',
      scheduledDate: now,
      referenceType: 'business',
      referenceId: businessId,
      updateMessageOnDup: true,
      message: 'Support approved a one-time payout account change. You can update it now from Account → Payout settings. This permission expires in 24 hours.',
    }).catch((err) => {
      // Fire-and-forget — log but don't fail the grant
      const logger = require('@/lib/logger').default;
      logger.error('Failed to create payout permission reminder', {
        businessId,
        err: err instanceof Error ? err.message : err,
      });
    });
  }

  return updatedBusiness;
}

/**
 * Revokes an unused payout change permission
 */
export async function revokePayoutChangePermission(
  businessId: string,
  adminId: string,
  tx?: TxClient
) {
  const db = tx ?? prisma;

  const business = await db.business.findUnique({
    where: { id: businessId },
    select: {
      id: true,
      businessName: true,
      payoutChangePermitted: true,
      payoutChangeUsedAt: true,
    },
  });

  if (!business) {
    throw new AppError(404, 'Business not found', 'BUSINESS_NOT_FOUND');
  }

  if (!business.payoutChangePermitted) {
    // Already revoked or never granted — idempotent
    return {
      id: business.id,
      businessName: business.businessName,
      payoutChangePermitted: false,
    };
  }

  if (business.payoutChangeUsedAt) {
    throw new AppError(
      400,
      'Permission was already consumed. Cannot revoke.',
      'PERMISSION_ALREADY_USED'
    );
  }

  const updatedBusiness = await db.business.update({
    where: { id: businessId },
    data: {
      payoutChangePermitted: false,
      payoutChangePermittedAt: null,
      payoutChangePermittedBy: null,
    },
    select: {
      id: true,
      businessName: true,
      payoutChangePermitted: true,
    },
  });

  await logAudit({
    userId: adminId,
    businessId,
    action: 'admin.payout_change_permit_revoked',
    resourceType: 'business',
    resourceId: businessId,
    oldData: { permitted: true },
    newData: { permitted: false },
  }, tx);

  return updatedBusiness;
}

export async function getTreasuryAnalytics(filters: TreasuryAnalyticsFilterInput) {
  const page = filters.page || 1;
  const limit = filters.limit || 20;

  // 1. Fetch settled DVA inflows, payouts, merchant liabilities, and live gateway
  // balance in parallel. Gateway balance is best-effort (nullable on failure) so a
  // Paystack outage never blocks the rest of the treasury view.
  const [dvaSales, payouts, liabilitiesAgg, gatewayBalanceNaira] = await Promise.all([
    prisma.salesTransaction.findMany({
      where: {
        source: 'bank_transfer',
        dvaOrigin: true,
        status: { in: ['confirmed', 'completed'] },
      },
      include: {
        business: { select: { id: true, businessName: true } },
      },
      orderBy: { transactionDate: 'desc' },
    }),
    prisma.settlementPayout.findMany({
      where: {
        status: { in: ['completed', 'processing', 'pending'] },
      },
      include: {
        business: { select: { id: true, businessName: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.walletBalance.aggregate({
      _sum: {
        balance: true,
        lockedBalance: true,
      },
    }),
    (async () => {
      try {
        const provider = getPaymentProvider();
        const balances = await provider.getBalance();
        const ngnItem = balances.find((b) => b.currency === 'NGN');
        return ngnItem ? round2(ngnItem.balanceNaira) : 0;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        logger.warn('[TREASURY] Failed to fetch live gateway balance; returning unavailable', {
          error: message,
        });
        return null;
      }
    })(),
  ]);

  // 3. Compute aggregate KPIs
  let totalGrossInflows = 0;
  let totalInflowFeesAbsorbed = 0;
  for (const sale of dvaSales) {
    const gross = toNumber(sale.amount);
    const feeAbsorbed = Math.min(round2(gross * 0.01), 300);
    totalGrossInflows += gross;
    totalInflowFeesAbsorbed += feeAbsorbed;
  }

  let totalGrossOutflows = 0;
  let totalWithdrawalFeesCollected = 0;
  let totalDisbursementCost = 0;
  for (const payout of payouts) {
    const totalDebit = toNumber(payout.amount);
    const feeCollected = toNumber(payout.fee);
    const netDisbursed = toNumber(payout.netAmount) > 0 ? toNumber(payout.netAmount) : Math.max(0, totalDebit - feeCollected);
    const cost = payout.status === 'pending' ? 0 : withdrawalCost(netDisbursed);
    totalGrossOutflows += netDisbursed;
    totalWithdrawalFeesCollected += feeCollected;
    totalDisbursementCost += cost;
  }

  totalGrossInflows = round2(totalGrossInflows);
  totalInflowFeesAbsorbed = round2(totalInflowFeesAbsorbed);
  totalGrossOutflows = round2(totalGrossOutflows);
  totalWithdrawalFeesCollected = round2(totalWithdrawalFeesCollected);
  totalDisbursementCost = round2(totalDisbursementCost);

  const netPlatformMargin = round2(
    totalWithdrawalFeesCollected - totalInflowFeesAbsorbed - totalDisbursementCost
  );

  // 4. Map both into unified transfer margin items
  const allTransfers: Array<{
    id: string;
    date: string;
    type: 'inflow' | 'outflow';
    businessId: string;
    businessName: string;
    reference: string;
    status: string;
    grossAmount: number;
    feeCollected: number;
    gatewayCost: number;
    netMargin: number;
  }> = [];

  for (const sale of dvaSales) {
    const gross = toNumber(sale.amount);
    const cost = Math.min(round2(gross * 0.01), 300);
    allTransfers.push({
      id: sale.id,
      date: sale.transactionDate.toISOString(),
      type: 'inflow',
      businessId: sale.businessId,
      businessName: sale.business?.businessName || 'Unknown Business',
      reference: sale.referenceId || sale.id.slice(0, 8),
      status: sale.status,
      grossAmount: gross,
      feeCollected: 0,
      gatewayCost: cost,
      netMargin: -cost, // Absorbed cost represented as negative margin
    });
  }

  for (const payout of payouts) {
    const totalDebit = toNumber(payout.amount);
    const feeCollected = toNumber(payout.fee);
    const netDisbursed = toNumber(payout.netAmount) > 0 ? toNumber(payout.netAmount) : Math.max(0, totalDebit - feeCollected);
    const cost = payout.status === 'pending' ? 0 : withdrawalCost(netDisbursed);
    const netMargin = round2(feeCollected - cost);
    allTransfers.push({
      id: payout.id,
      date: payout.createdAt.toISOString(),
      type: 'outflow',
      businessId: payout.businessId,
      businessName: payout.business?.businessName || 'Unknown Business',
      reference: payout.transferReference,
      status: payout.status,
      grossAmount: netDisbursed,
      feeCollected,
      gatewayCost: cost,
      netMargin,
    });
  }

  // 5. Apply filters
  let filtered = allTransfers;
  if (filters.type && filters.type !== 'all') {
    filtered = filtered.filter((t) => t.type === filters.type);
  }

  if (filters.outcome === 'profit') {
    filtered = filtered.filter((t) => t.netMargin > 0);
  } else if (filters.outcome === 'loss') {
    filtered = filtered.filter((t) => t.netMargin < 0);
  }

  if (filters.search) {
    const q = filters.search.toLowerCase();
    filtered = filtered.filter(
      (t) =>
        t.reference.toLowerCase().includes(q) ||
        t.businessName.toLowerCase().includes(q)
    );
  }

  // Sort by date descending
  filtered.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  // 6. Paginate
  const total = filtered.length;
  const totalPages = Math.ceil(total / limit) || 1;
  const startIndex = (page - 1) * limit;
  const paginatedItems = filtered.slice(startIndex, startIndex + limit);

  const merchantLiabilityNaira = round2(
    toNumber(liabilitiesAgg._sum.balance ?? 0) + toNumber(liabilitiesAgg._sum.lockedBalance ?? 0)
  );
  const expectedFeeFloatNaira = round2(Math.max(0, netPlatformMargin));
  const floatNaira =
    gatewayBalanceNaira != null ? round2(gatewayBalanceNaira - merchantLiabilityNaira) : null;
  const floatStatus: 'healthy' | 'expected' | 'deficit' | 'unknown' =
    gatewayBalanceNaira == null
      ? 'unknown'
      : floatNaira != null && floatNaira < 0
        ? 'deficit'
        : 'healthy';

  return {
    kpis: {
      totalGrossInflows,
      totalInflowFeesAbsorbed,
      totalGrossOutflows,
      totalWithdrawalFeesCollected,
      totalDisbursementCost,
      netPlatformMargin,
      isProfitable: netPlatformMargin >= 0,
      gatewayBalanceNaira,
      merchantLiabilityNaira,
      floatNaira,
      expectedFeeFloatNaira,
      floatStatus,
      paystackGlobalBalance: gatewayBalanceNaira,
      reconciliationVariance: floatNaira,
    },
    transfers: paginatedItems,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    },
  };
}

export interface AdminTransactionRow {
  id: string;
  sourceType: 'inflow' | 'withdrawal' | 'tax';
  direction: 'in' | 'out';
  date: string;
  businessId: string;
  businessName: string;
  merchantId: string;
  userEmail: string;
  reference: string;
  status: string;
  amount: number;
  fee: number;
  netAmount: number;
  counterparty: string | null;
  description: string | null;
  needsVerification: boolean;
  destinationBankName: string | null;
  destinationAccountNum: string | null;
  failureReason: string | null;
}

/**
 * Platform-wide feed of REAL wallet money: DVA/Paystack bank-transfer inflows
 * (in), withdrawals to merchant banks (out) and tax payments (out).
 * Manually-added sales are excluded by `source:'bank_transfer' + dvaOrigin:true`
 * — the same rule the merchant dva_bank ledger and the Treasury tab use.
 * Summary totals are computed over the full filtered set (before pagination)
 * so they always equal the sum of what the active filters would list.
 */
export async function getAdminTransactions(filters: AdminTransactionsQueryInput) {
  const page = filters.page || 1;
  const limit = filters.limit || 20;

  // @db.Date windows are built in UTC, never local time.
  const fromDate = filters.from ? new Date(`${filters.from}T00:00:00.000Z`) : null;
  const toDate = filters.to ? new Date(`${filters.to}T23:59:59.999Z`) : null;
  const windowOn = (field: 'transactionDate' | 'createdAt') =>
    fromDate || toDate
      ? {
          [field]: {
            ...(fromDate ? { gte: fromDate } : {}),
            ...(toDate ? { lte: toDate } : {}),
          },
        }
      : {};

  const businessSelect = {
    select: {
      id: true,
      businessName: true,
      merchantId: true,
      user: { select: { email: true } },
    },
  } as const;

  const needInflow = filters.source === 'all' || filters.source === 'inflow';
  const needWithdrawal = filters.source === 'all' || filters.source === 'withdrawal';
  const needTax = filters.source === 'all' || filters.source === 'tax';

  const [dvaSales, payouts, taxPayments] = await Promise.all([
    needInflow
      ? prisma.salesTransaction.findMany({
          where: {
            source: 'bank_transfer',
            dvaOrigin: true,
            // 'confirmed' is canonical; 'completed' is the legacy status.
            status: { in: ['confirmed', 'completed'] },
            ...windowOn('transactionDate'),
          },
          include: { business: businessSelect },
          orderBy: { transactionDate: 'desc' },
        })
      : Promise.resolve([]),
    needWithdrawal
      ? prisma.settlementPayout.findMany({
          // All statuses — in-flight and failed must stay visible to admins.
          where: windowOn('createdAt'),
          include: { business: businessSelect },
          orderBy: { createdAt: 'desc' },
        })
      : Promise.resolve([]),
    needTax
      ? prisma.taxPayment.findMany({
          where: windowOn('createdAt'),
          include: { business: businessSelect },
          orderBy: { createdAt: 'desc' },
        })
      : Promise.resolve([]),
  ]);

  const rows: AdminTransactionRow[] = [];

  for (const sale of dvaSales) {
    const amount = toNumber(sale.amount);
    rows.push({
      id: sale.id,
      sourceType: 'inflow',
      direction: 'in',
      date: sale.transactionDate.toISOString(),
      businessId: sale.businessId,
      businessName: sale.business?.businessName || 'Unknown Business',
      merchantId: sale.business?.merchantId || '',
      userEmail: sale.business?.user?.email || '',
      reference: sale.referenceId || sale.id.slice(0, 8),
      status: sale.status,
      amount,
      fee: 0,
      netAmount: amount,
      counterparty: sale.customerName,
      description: sale.description,
      needsVerification: sale.needsVerification,
      destinationBankName: null,
      destinationAccountNum: null,
      failureReason: null,
    });
  }

  for (const payout of payouts) {
    const amount = toNumber(payout.amount);
    const fee = toNumber(payout.fee);
    rows.push({
      id: payout.id,
      sourceType: 'withdrawal',
      direction: 'out',
      date: payout.createdAt.toISOString(),
      businessId: payout.businessId,
      businessName: payout.business?.businessName || 'Unknown Business',
      merchantId: payout.business?.merchantId || '',
      userEmail: payout.business?.user?.email || '',
      reference: payout.transferReference,
      status: payout.status,
      amount,
      fee,
      netAmount: toNumber(payout.netAmount) > 0 ? toNumber(payout.netAmount) : Math.max(0, amount - fee),
      counterparty: payout.destinationAccountName,
      description: payout.narration,
      needsVerification: false,
      destinationBankName: payout.destinationBankName,
      destinationAccountNum: payout.destinationAccountNum,
      failureReason: payout.failureReason,
    });
  }

  for (const tax of taxPayments) {
    const amount = toNumber(tax.amountPaid);
    rows.push({
      id: tax.id,
      sourceType: 'tax',
      direction: 'out',
      date: tax.createdAt.toISOString(),
      businessId: tax.businessId,
      businessName: tax.business?.businessName || 'Unknown Business',
      merchantId: tax.business?.merchantId || '',
      userEmail: tax.business?.user?.email || '',
      reference: tax.transactionReference,
      status: tax.paymentStatus,
      amount,
      fee: 0,
      netAmount: amount,
      counterparty: null,
      description: tax.paymentMethod,
      needsVerification: false,
      destinationBankName: null,
      destinationAccountNum: null,
      failureReason: null,
    });
  }

  let filtered = rows;
  if (filters.search) {
    const q = filters.search.toLowerCase();
    filtered = filtered.filter(
      (r) =>
        r.businessName.toLowerCase().includes(q) ||
        r.reference.toLowerCase().includes(q)
    );
  }

  filtered.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  let totalIn = 0;
  let totalOut = 0;
  let totalFailed = 0;
  let failedCount = 0;
  for (const r of filtered) {
    if (r.direction === 'in') totalIn += r.amount;
    else if (r.status === 'completed') totalOut += r.amount;
    else if (r.status === 'failed') {
      totalFailed += r.amount;
      failedCount += 1;
    }
  }

  const total = filtered.length;
  const totalPages = Math.ceil(total / limit) || 1;
  const startIndex = (page - 1) * limit;

  return {
    summary: {
      totalIn: round2(totalIn),
      totalOut: round2(totalOut),
      net: round2(totalIn - totalOut),
      totalFailed: round2(totalFailed),
      failedCount,
    },
    transfers: filtered.slice(startIndex, startIndex + limit),
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    },
  };
}

export async function getTreasuryTransactionDetail(id: string, type?: 'inflow' | 'outflow') {
  if (type === 'inflow' || (!type && id.length > 0)) {
    const sale = await prisma.salesTransaction.findUnique({
      where: { id },
      include: {
        ...ACCRUAL_SALE_INCLUDE,
        business: {
          include: {
            user: {
              select: { id: true, email: true, phone: true },
            },
          },
        },
      },
    });

    if (sale) {
      const gross = toNumber(sale.amount);
      const paystackFee = Math.min(round2(gross * 0.01), 300);

      const siblingBusinesses = sale.business?.userId
        ? await prisma.business.findMany({
            where: {
              userId: sale.business.userId,
              id: { not: sale.businessId },
            },
            select: {
              id: true,
              businessName: true,
              merchantId: true,
            },
            orderBy: { businessName: 'asc' },
          })
        : [];

      return {
        id: sale.id,
        type: 'inflow' as const,
        reference: sale.referenceId || sale.id,
        date: sale.transactionDate,
        createdAt: sale.createdAt,
        status: sale.status,
        business: {
          id: sale.businessId,
          name: sale.business?.businessName || 'Unknown Business',
          owner: sale.business?.ownerName || 'N/A',
          email: sale.business?.user?.email || 'N/A',
        },
        assignedBusiness: {
          id: sale.businessId,
          businessName: sale.business?.businessName || 'Unknown Business',
          merchantId: sale.business?.merchantId || 'N/A',
        },
        siblingBusinesses,
        accrualLinked: isAccrualLinked(sale),
        financials: {
          grossAmount: gross,
          customerCredit: gross, // 100% credited
          platformFeeCollected: 0,
          paystackInflowFeeAbsorbed: paystackFee,
          federalStampDuty: 0,
          totalGatewayCost: paystackFee,
          netMargin: -paystackFee,
          isProfit: false,
        },
        routing: {
          channel: 'Dedicated Virtual Account (DVA)',
          provider: 'Paystack',
          customerName: sale.customerName || 'N/A',
          description: sale.description || 'Auto-captured DVA bank transfer',
        },
      };
    }
  }

  // Check SettlementPayout
  const payout = await prisma.settlementPayout.findUnique({
    where: { id },
    include: {
      business: {
        include: {
          user: {
            select: { id: true, email: true, phone: true },
          },
        },
      },
    },
  });

  if (!payout) {
    throw new AppError(404, 'Transaction not found in treasury records', 'TRANSACTION_NOT_FOUND');
  }

  const totalDebit = toNumber(payout.amount);
  const withdrawalFee = toNumber(payout.fee);
  const disbursed = toNumber(payout.netAmount) > 0 ? toNumber(payout.netAmount) : Math.max(0, totalDebit - withdrawalFee);
  const paystackFee = payout.status === 'pending' ? 0 : transferFee(disbursed);
  const duty = payout.status === 'pending' ? 0 : stampDuty(disbursed);
  const totalCost = round2(paystackFee + duty);
  const netMargin = round2(withdrawalFee - totalCost);

  return {
    id: payout.id,
    type: 'outflow' as const,
    reference: payout.transferReference,
    date: payout.createdAt,
    completedAt: payout.completedAt,
    status: payout.status,
    business: {
      id: payout.businessId,
      name: payout.business?.businessName || 'Unknown Business',
      owner: payout.business?.ownerName || 'N/A',
      email: payout.business?.user?.email || 'N/A',
    },
    siblingBusinesses: [],
    accrualLinked: false,
    financials: {
      grossAmount: disbursed,
      customerDebit: totalDebit,
      amountDisbursed: disbursed,
      platformFeeCollected: withdrawalFee,
      paystackTransferFee: paystackFee,
      federalStampDuty: duty,
      totalGatewayCost: totalCost,
      netMargin,
      isProfit: netMargin >= 0,
    },
    routing: {
      channel: 'Commercial Bank Transfer',
      destinationBank: payout.destinationBankName,
      destinationBankCode: payout.destinationBankCode,
      destinationAccountNum: payout.destinationAccountNum,
      destinationAccountName: payout.destinationAccountName,
      paystackTransferCode: payout.paystackTransferCode,
      adminApprovedBy: payout.adminApprovedBy,
      adminApprovedAt: payout.adminApprovedAt,
      narration: payout.narration,
      failureReason: payout.failureReason,
    },
  };
}

export async function listSubscriptionSubmissions(filter: {
  page?: number;
  limit?: number;
  status?: 'pending' | 'approved' | 'rejected';
  search?: string;
}) {
  const page = Math.max(1, Number(filter.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(filter.limit) || 20));
  const skip = (page - 1) * limit;

  const where: any = {};
  if (filter.status) {
    where.status = filter.status;
  }
  if (filter.search) {
    const s = filter.search.trim();
    where.OR = [
      { customerName: { contains: s, mode: 'insensitive' } },
      { email: { contains: s, mode: 'insensitive' } },
      { businessName: { contains: s, mode: 'insensitive' } },
      { plan: { contains: s, mode: 'insensitive' } },
      { notes: { contains: s, mode: 'insensitive' } },
    ];
  }

  const [total, submissions, pendingCount, approvedCount, rejectedCount, approvedSum] =
    await Promise.all([
      prisma.subscriptionSubmission.count({ where }),
      prisma.subscriptionSubmission.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          user: {
            select: {
              id: true,
              email: true,
              fullName: true,
              phone: true,
              subscriptionTier: true,
              subscriptionExpiresAt: true,
            },
          },
          business: {
            select: {
              id: true,
              businessName: true,
              ownerName: true,
            },
          },
        },
      }),
      prisma.subscriptionSubmission.count({ where: { status: 'pending' } }),
      prisma.subscriptionSubmission.count({ where: { status: 'approved' } }),
      prisma.subscriptionSubmission.count({ where: { status: 'rejected' } }),
      prisma.subscriptionSubmission.aggregate({
        where: { status: 'approved' },
        _sum: { amount: true },
      }),
    ]);

  return {
    data: submissions,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
    counts: {
      pending: pendingCount,
      approved: approvedCount,
      rejected: rejectedCount,
      totalRevenueApproved: toNumber(approvedSum._sum.amount),
    },
  };
}

export async function getSubscriptionSubmissionDetail(id: string) {
  const submission = await prisma.subscriptionSubmission.findUnique({
    where: { id },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          fullName: true,
          phone: true,
          subscriptionTier: true,
          subscriptionExpiresAt: true,
        },
      },
      business: {
        select: {
          id: true,
          businessName: true,
          ownerName: true,
          taxId: true,
        },
      },
    },
  });

  if (!submission) {
    throw new AppError(404, 'Subscription submission not found', 'NOT_FOUND');
  }

  return submission;
}

export async function getSubscriptionReceipt(id: string) {
  const submission = await prisma.subscriptionSubmission.findUnique({
    where: { id },
    select: {
      id: true,
      receiptUrl: true,
      receiptPath: true,
      receiptFileName: true,
      receiptMime: true,
    },
  });

  if (!submission) {
    throw new AppError(404, 'Subscription submission not found', 'NOT_FOUND');
  }

  return submission;
}

export async function approveSubscription(
  id: string,
  adminUserId: string,
  opts?: { durationDays?: number; adminNotes?: string },
) {
  const submission = await prisma.subscriptionSubmission.findUnique({
    where: { id },
    include: { user: true },
  });

  if (!submission) {
    throw new AppError(404, 'Subscription submission not found', 'NOT_FOUND');
  }

  if (submission.status === 'approved') {
    throw new AppError(409, 'Subscription has already been approved', 'ALREADY_APPROVED');
  }

  // Normalize tier name: 'starter', 'business', 'scale'
  const planLower = submission.plan.toLowerCase();
  let normalizedTier = 'starter';
  if (planLower.includes('scale') || planLower.includes('annual')) {
    normalizedTier = 'scale';
  } else if (planLower.includes('business') || planLower.includes('quarter')) {
    normalizedTier = 'business';
  }

  // Determine duration in days
  let durationInDays = opts?.durationDays;
  if (!durationInDays || durationInDays <= 0) {
    if (submission.billingCycle === 'annual') {
      durationInDays = 365;
    } else if (submission.billingCycle === 'quarterly') {
      durationInDays = 90;
    } else {
      durationInDays = 30;
    }
  }

  const now = new Date();
  const userTierRaw = (submission as any).user?.subscriptionTier ?? 'free';
  const isTierChange = normalizedTier !== canonicalTier(userTierRaw);
  const hasFutureExpiry =
    !!submission.user?.subscriptionExpiresAt &&
    new Date(submission.user.subscriptionExpiresAt).getTime() > now.getTime();
  const baseDate =
    !isTierChange && hasFutureExpiry
      ? new Date(submission.user!.subscriptionExpiresAt as Date)
      : now;
  const expiresAt = new Date(baseDate.getTime() + durationInDays * 24 * 60 * 60 * 1000);

  // Execute interactive transaction: update submission, update user, log audit
  const updatedSubmission = await prisma.$transaction(async (tx) => {
    const updated = await tx.subscriptionSubmission.update({
      where: { id },
      data: {
        status: 'approved',
        reviewedBy: adminUserId,
        reviewedAt: now,
        notes: opts?.adminNotes
          ? `${submission.notes || ''} [Admin: ${opts.adminNotes}]`.trim()
          : undefined,
      },
    });

    if (submission.userId) {
      await tx.user.update({
        where: { id: submission.userId },
        data: {
          subscriptionTier: normalizedTier,
          subscriptionExpiresAt: expiresAt,
        },
      });
    }

    await logAudit(
      {
        userId: adminUserId,
        businessId: submission.businessId || undefined,
        action: 'subscription.approved',
        resourceType: 'subscription_submission',
        resourceId: id,
        newData: {
          tier: normalizedTier,
          durationDays: durationInDays,
          expiresAt: expiresAt.toISOString(),
          amount: toNumber(submission.amount),
        },
      },
      tx,
    );

    return updated;
  });

  void emitToAdmins({
    type: 'subscription_status_changed',
    submissionId: id,
    status: 'approved',
    plan: submission.plan,
    timestamp: new Date().toISOString(),
  }).catch((err) =>
    logger.warn('Failed to emit subscription_status_changed (approved) to admins', { id, err })
  );

  // Post-commit email dispatch
  void dispatchSubscriptionApprovedEmail({
    toEmail: submission.email,
    customerName: submission.customerName,
    planName: submission.plan,
    expiresAt,
    amount: toNumber(submission.amount),
  });

  return {
    ...updatedSubmission,
    activatedTier: normalizedTier,
    subscriptionExpiresAt: expiresAt,
  };
}

export async function rejectSubscription(
  id: string,
  adminUserId: string,
  reason: string,
) {
  const submission = await prisma.subscriptionSubmission.findUnique({
    where: { id },
  });

  if (!submission) {
    throw new AppError(404, 'Subscription submission not found', 'NOT_FOUND');
  }

  if (submission.status === 'approved') {
    throw new AppError(
      409,
      'Cannot reject a subscription that has already been approved and activated',
      'ALREADY_APPROVED',
    );
  }

  const updatedSubmission = await prisma.$transaction(async (tx) => {
    const updated = await tx.subscriptionSubmission.update({
      where: { id },
      data: {
        status: 'rejected',
        rejectionReason: reason,
        reviewedBy: adminUserId,
        reviewedAt: new Date(),
      },
    });

    await logAudit(
      {
        userId: adminUserId,
        businessId: submission.businessId || undefined,
        action: 'subscription.rejected',
        resourceType: 'subscription_submission',
        resourceId: id,
        newData: { reason },
      },
      tx,
    );

    return updated;
  });

  void emitToAdmins({
    type: 'subscription_status_changed',
    submissionId: id,
    status: 'rejected',
    plan: submission.plan,
    timestamp: new Date().toISOString(),
  }).catch((err) =>
    logger.warn('Failed to emit subscription_status_changed (rejected) to admins', { id, err })
  );

  // Post-commit email dispatch
  void dispatchSubscriptionRejectedEmail({
    toEmail: submission.email,
    customerName: submission.customerName,
    planName: submission.plan,
    reason,
  });

  return updatedSubmission;
}

export async function previewDowngrade(userId: string, targetTierRaw: string) {
  const targetTier = canonicalTier(targetTierRaw);
  const plan = getPlanLimits(targetTier);
  const maxBusinesses = plan.maxBusinesses;
  const maxTeamMembers = plan.maxTeamMembers;

  const businessCount = await prisma.business.count({ where: { userId } });
  const ownedBusinesses = await prisma.business.findMany({ where: { userId }, select: { id: true } });
  const businessIds = ownedBusinesses.map((b) => b.id);

  let teamCurrent = 0;
  const overLimitBusinessIds: string[] = [];
  if (businessIds.length) {
    const [memberCount, inviteCount] = await Promise.all([
      prisma.businessMember.count({
        where: { businessId: { in: businessIds }, isActive: true, role: { not: 'owner' } },
      }),
      prisma.invitation.count({
        where: { businessId: { in: businessIds }, status: 'pending', expiresAt: { gt: new Date() } },
      }),
    ]);
    teamCurrent = memberCount + inviteCount;
    if (maxTeamMembers !== -1) {
      for (const bid of businessIds) {
        const c = await prisma.businessMember.count({
          where: { businessId: bid, isActive: true, role: { not: 'owner' } },
        });
        const p = await prisma.invitation.count({
          where: { businessId: bid, status: 'pending', expiresAt: { gt: new Date() } },
        });
        if (c + p > maxTeamMembers) overLimitBusinessIds.push(bid);
      }
    }
  }

  const businessOverLimit = maxBusinesses !== -1 && businessCount > maxBusinesses;
  // Team limit is per-business, not total. A user with 2 businesses each with
  // 2 members (total 4) on Starter (max 3 per business) is NOT over-limit.
  const teamOverLimit = overLimitBusinessIds.length > 0;

  return {
    targetTier,
    targetPlan: plan.name,
    limits: { maxBusinesses, maxTeamMembers, maxMonthlyAiQueries: plan.maxMonthlyAiQueries },
    current: { businessCount, teamCurrent, businessIds },
    overLimit: {
      businesses: businessOverLimit
        ? { current: businessCount, max: maxBusinesses, excess: businessCount - maxBusinesses }
        : null,
      teams: teamOverLimit
        ? { businessIds: overLimitBusinessIds, current: teamCurrent, max: maxTeamMembers }
        : null,
    },
    isOverLimit: businessOverLimit || teamOverLimit,
  };
}

function maxBusinessesFor(t: string) {
  const p = getPlanLimits(t);
  return p.maxBusinesses === -1 ? Number.MAX_SAFE_INTEGER : p.maxBusinesses;
}

function maxTeamMembersFor(t: string) {
  const p = getPlanLimits(t);
  return p.maxTeamMembers === -1 ? Number.MAX_SAFE_INTEGER : p.maxTeamMembers;
}

function isFeatureDowngrade(from: string, to: string) {
  return isFeatureAllowed(from, 'bnplCredits') && !isFeatureAllowed(to, 'bnplCredits');
}

export async function overrideUserSubscription(
  userId: string,
  adminUserId: string,
  input: AdminOverrideSubscriptionInput
) {
  // Canonicalize the tier against the plan catalog. Writing a non-catalog value here
  // (e.g. 'scale_up') would make getPlanLimits fall back to the free plan and silently
  // strip a paid subscriber's entitlements.
  const normalizedTier = canonicalTier(input.tier);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      subscriptionTier: true,
      subscriptionExpiresAt: true,
      trialEndsAt: true,
    },
  });

  if (!user) {
    throw new AppError(404, 'User not found', 'USER_NOT_FOUND');
  }

  const now = new Date();
  let expiresAt: Date | null = null;

  if (input.customExpiresAt) {
    expiresAt = new Date(input.customExpiresAt);
  } else if (input.durationDays === null) {
    // Explicit null = lifetime / indefinite subscription
    expiresAt = null;
  } else if (typeof input.durationDays === 'number' && input.durationDays > 0) {
    const existingTier = canonicalTier(user.subscriptionTier ?? 'free');
    const isTierChange = normalizedTier !== existingTier;
    const hasFutureExpiry =
      !!user.subscriptionExpiresAt &&
      new Date(user.subscriptionExpiresAt).getTime() > now.getTime();
    const baseDate =
      !isTierChange && hasFutureExpiry ? new Date(user.subscriptionExpiresAt as Date) : now;
    expiresAt = new Date(baseDate.getTime() + input.durationDays * 24 * 60 * 60 * 1000);
  } else if (normalizedTier === 'free') {
    expiresAt = null;
  } else {
    const existingTier = canonicalTier(user.subscriptionTier ?? 'free');
    const isTierChange = normalizedTier !== existingTier;
    const hasFutureExpiry =
      !!user.subscriptionExpiresAt &&
      new Date(user.subscriptionExpiresAt).getTime() > now.getTime();
    const baseDate =
      !isTierChange && hasFutureExpiry ? new Date(user.subscriptionExpiresAt as Date) : now;
    expiresAt = new Date(baseDate.getTime() + 30 * 24 * 60 * 60 * 1000);
  }

  // Handle trial reset if requested: 30 days for free trial
  let newTrialEndsAt: Date | null = user.trialEndsAt;
  if (input.resetTrial) {
    const trialDays = config.subscription?.trialDays || 30;
    newTrialEndsAt = new Date(now.getTime() + trialDays * 24 * 60 * 60 * 1000);
  }

  const existingTier = canonicalTier(user.subscriptionTier ?? 'free');
  const isDowngrade =
    maxBusinessesFor(existingTier) > maxBusinessesFor(normalizedTier) ||
    maxTeamMembersFor(existingTier) > maxTeamMembersFor(normalizedTier) ||
    isFeatureDowngrade(existingTier, normalizedTier);

  if (isDowngrade && !input.confirmDowngrade) {
    const preview = await previewDowngrade(userId, normalizedTier);
    if (preview.isOverLimit) {
      throw new AppError(409, 'Downgrade would leave account over plan limits. Confirm to proceed.', 'DOWNGRADE_OVER_LIMIT', {
        overLimit: preview.overLimit,
        targetTier: preview.targetTier,
        limits: preview.limits,
      });
    }
  }

  const updatedUser = await prisma.$transaction(async (tx) => {
    if (isDowngrade && !input.confirmDowngrade) {
      const businessCount = await tx.business.count({ where: { userId } });
      const maxBusinesses = getPlanLimits(normalizedTier).maxBusinesses;
      if (maxBusinesses !== -1 && businessCount > maxBusinesses) {
        throw new AppError(409, 'Downgrade over-limit (re-checked inside transaction)', 'DOWNGRADE_OVER_LIMIT', {
          overLimit: { businesses: { current: businessCount, max: maxBusinesses } },
        });
      }
      // Team re-check per-business inside TX — closes TOCTOU where invite
      // is created between preview and confirm.
      const ownedIds = (await tx.business.findMany({ where: { userId }, select: { id: true } })).map((b) => b.id);
      const maxTeam = getPlanLimits(normalizedTier).maxTeamMembers;
      if (maxTeam !== -1) {
        for (const bid of ownedIds) {
          const c = await tx.businessMember.count({ where: { businessId: bid, isActive: true, role: { not: 'owner' } } });
          const p = await tx.invitation.count({ where: { businessId: bid, status: 'pending', expiresAt: { gt: new Date() } } });
          if (c + p > maxTeam) {
            throw new AppError(409, 'Downgrade over-limit (team re-checked inside transaction)', 'DOWNGRADE_OVER_LIMIT', {
              overLimit: { teams: { businessIds: [bid], current: c + p, max: maxTeam } },
            });
          }
        }
      }
    }

    const updated = await tx.user.update({
      where: { id: userId },
      data: {
        subscriptionTier: normalizedTier,
        subscriptionExpiresAt: expiresAt,
        trialEndsAt: newTrialEndsAt,
      },
      select: {
        id: true,
        email: true,
        role: true,
        subscriptionTier: true,
        subscriptionExpiresAt: true,
        trialEndsAt: true,
      },
    });

    await logAudit(
      {
        userId: adminUserId,
        action: 'admin.subscription_manual_override',
        resourceType: 'user',
        resourceId: userId,
        oldData: {
          subscriptionTier: user.subscriptionTier,
          subscriptionExpiresAt: user.subscriptionExpiresAt ? user.subscriptionExpiresAt.toISOString() : null,
          trialEndsAt: user.trialEndsAt ? user.trialEndsAt.toISOString() : null,
        },
        newData: {
          tier: normalizedTier,
          subscriptionTier: normalizedTier,
          subscriptionExpiresAt: expiresAt ? expiresAt.toISOString() : null,
          trialEndsAt: newTrialEndsAt ? newTrialEndsAt.toISOString() : null,
          reason: input.reason,
          durationDays: input.durationDays ?? null,
          resetTrial: !!input.resetTrial,
          confirmDowngrade: !!input.confirmDowngrade,
        },
      },
      tx
    );

    return updated;
  });

  return {
    ...updatedUser,
    subscriptionExpiresAt: updatedUser.subscriptionExpiresAt ? updatedUser.subscriptionExpiresAt.toISOString() : null,
    trialEndsAt: updatedUser.trialEndsAt ? updatedUser.trialEndsAt.toISOString() : null,
  };
}

/**
 * Manually fan out the internal "new sign-up" alert for one user.
 *
 * Used by the "Notify" button on the admin dashboard's Recent Signups list —
 * the same email the signup-notifications cron sends ~5 min after registration,
 * triggered on demand. Test/throwaway addresses are refused (the internal list
 * must never be spammed with QA accounts), and the pending marker is stamped so
 * the cron does not send a duplicate afterwards.
 */
export async function notifyUserSignup(userId: string, adminUserId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      fullName: true,
      phone: true,
      createdAt: true,
      acquisitionSource: true,
    },
  });

  if (!user) {
    throw new AppError(404, 'User not found', 'USER_NOT_FOUND');
  }

  if (isTestAccountEmail(user.email)) {
    return {
      skipped: true,
      reason: 'TEST_ACCOUNT' as const,
      delivered: 0,
      failed: 0,
      recipients: 0,
    };
  }

  const delivery = await dispatchNewSignupNotificationEmails({
    userEmail: user.email,
    fullName: user.fullName,
    phone: user.phone,
    userId: user.id,
    signedUpAt: formatLagosDateTime(user.createdAt),
    acquisitionSource: user.acquisitionSource,
  });

  // Stamp the pending marker so the cron sweep does not re-announce this
  // account. A manual re-send is still allowed — the admin asked for it.
  await prisma.user.update({
    where: { id: user.id },
    data: { signupNotifiedAt: new Date() },
  });

  await logAudit({
    userId: adminUserId,
    action: 'admin.signup_notification_sent',
    resourceType: 'user',
    resourceId: user.id,
    newData: {
      delivered: delivery.delivered,
      failed: delivery.failed,
      skipped: delivery.skipped,
    },
  });

  return {
    skipped: delivery.skipped,
    reason: delivery.skipped ? ('NO_PROVIDER' as const) : null,
    delivered: delivery.delivered,
    failed: delivery.failed,
    recipients: config.signupNotifications.recipients.length,
  };
}



