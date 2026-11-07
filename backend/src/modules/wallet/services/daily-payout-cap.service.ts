import prisma from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { AppError } from '@/middleware/errorHandler';
import { PlatformConfigService } from '@/services/platform-config.service';
import { startOfLagosDay } from '@/shared/helpers/business-day';
import { toNumber } from '@/shared/helpers';

export interface DailyPayoutAllowance {
  dailyLimit: number;
  alreadyPaidOut: number;
  remaining: number;
}

/**
 * Computes total gross payout amount (including any fees) initiated or completed
 * by a user across all their owned businesses during the current Lagos calendar day.
 *
 * Settlement advances are EXCLUDED (`isAdvance: false`). An advance is an internal
 * settlement -> wallet transfer, not a cash outflow: no money leaves the platform.
 * Counting it here would consume the merchant's daily allowance twice — once for
 * the advance and again when they withdraw the credited funds.
 *
 * Statuses counted:
 * - 'completed': funds transferred
 * - 'pending' / 'processing': funds committed / reserved
 * - 'failed': excluded (funds not delivered, or locked awaiting admin reconciliation)
 */
export async function getDailyPayoutTotal(
  userId: string,
  tx?: Prisma.TransactionClient,
  asOf: Date = new Date()
): Promise<number> {
  const db = tx ?? prisma;

  // 1. Find all businesses owned by user
  const userBusinesses = await db.business.findMany({
    where: { userId },
    select: { id: true },
  });

  const businessIds = userBusinesses.map((b) => b.id);
  if (businessIds.length === 0) {
    return 0;
  }

  // 2. Compute Lagos day boundaries
  const startOfDay = startOfLagosDay(asOf);
  const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);

  // 3. Aggregate all qualifying payouts created within this Lagos day
  const aggregate = await db.settlementPayout.aggregate({
    where: {
      businessId: { in: businessIds },
      status: { in: ['pending', 'processing', 'completed'] },
      isAdvance: false,
      createdAt: {
        gte: startOfDay,
        lt: endOfDay,
      },
    },
    _sum: {
      amount: true,
    },
  });

  return toNumber(aggregate._sum.amount ?? 0);
}

/**
 * Returns the active daily payout cap, amount already paid out today, and remaining allowance.
 * A limit of 0 represents unlimited withdrawals (no cap).
 */
export async function getDailyPayoutAllowance(
  userId: string,
  tx?: Prisma.TransactionClient,
  asOf: Date = new Date()
): Promise<DailyPayoutAllowance> {
  const feeConfig = await PlatformConfigService.getFeeConfig();
  const dailyLimit = feeConfig.maxDailyPayout;
  const alreadyPaidOut = await getDailyPayoutTotal(userId, tx, asOf);

  if (dailyLimit <= 0) {
    return {
      dailyLimit: 0,
      alreadyPaidOut,
      remaining: Infinity,
    };
  }

  const remaining = Math.max(0, Math.round((dailyLimit - alreadyPaidOut) * 100) / 100);

  return {
    dailyLimit,
    alreadyPaidOut,
    remaining,
  };
}

/**
 * Asserts that a proposed withdrawal amount complies with the user's daily payout cap.
 * Throws AppError(400, 'DAILY_PAYOUT_LIMIT_EXCEEDED') if exceeded.
 */
export async function assertWithinDailyPayoutCap(params: {
  userId: string;
  amount: number;
  tx?: Prisma.TransactionClient;
  asOf?: Date;
}): Promise<DailyPayoutAllowance> {
  const allowance = await getDailyPayoutAllowance(params.userId, params.tx, params.asOf);

  if (allowance.dailyLimit > 0) {
    const projectedTotal = Math.round((allowance.alreadyPaidOut + params.amount) * 100) / 100;

    if (projectedTotal > allowance.dailyLimit) {
      const dailyLimitFormatted = allowance.dailyLimit.toLocaleString('en-NG');
      const alreadyPaidOutFormatted = allowance.alreadyPaidOut.toLocaleString('en-NG');
      const remainingFormatted = allowance.remaining.toLocaleString('en-NG');

      throw new AppError(
        400,
        `Daily payout limit of ₦${dailyLimitFormatted} exceeded. You have already withdrawn ₦${alreadyPaidOutFormatted} today across your businesses. Remaining allowance: ₦${remainingFormatted}.`,
        'DAILY_PAYOUT_LIMIT_EXCEEDED',
        {
          dailyLimit: allowance.dailyLimit,
          alreadyPaidOut: allowance.alreadyPaidOut,
          remaining: allowance.remaining,
          requestedAmount: params.amount,
        }
      );
    }
  }

  return allowance;
}
