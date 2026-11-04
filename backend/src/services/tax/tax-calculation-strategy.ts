import prisma from '@/lib/prisma';
import logger from '@/lib/logger';
import { toNumber } from '@/shared/helpers';
import { calculateProfiledTax, ProfiledTaxResult } from './tax-profiled-calculation.service';
import { isTaxProfileComplete } from './tax-policy.service';
import type { TaxProfileConfiguration } from '@/shared/tax-constants';

export interface TaxCalculationResult {
  taxPayable: number;
  taxRate: number;
  grossProfit: number;
  /**
   * PROFILED: a statutory scenario applied.
   * REVIEW_REQUIRED: the business has no completed tax profile, so no rate was
   * applied. `taxPayable` is 0 and must not be treated as "nothing is owed".
   */
  strategyUsed: 'PROFILED' | 'REVIEW_REQUIRED';
  /** True when the profile is missing or incomplete; callers must not auto-remit. */
  needsManualReview?: boolean;
  /** Human-readable reason for the manual review flag. */
  reviewReason?: string;
  breakdown?: {
    vatPayable: number;
    citPayable: number;
    devLevyPayable: number;
    pitPayable: number;
    totalPayable: number;
  };
  advisory?: {
    note: string;
    outputVat?: number;
    inputVat?: number;
    citBase?: number;
    annualCitEstimate?: number;
    annualDevLevyEstimate?: number;
    annualPitEstimate?: number;
    annualTaxProvision?: number;
  };
}

/**
 * Deductible expense totals for the month, grouped by category.
 * Needed because Input VAT may only be claimed on VAT-bearing categories —
 * salaries, depreciation, interest and penalties bear no VAT.
 */
async function loadExpensesByCategory(
  businessId: string,
  month: number,
  year: number
): Promise<Record<string, number>> {
  // UTC bounds — same reason as calculateTax: expenseDate is @db.Date.
  const monthStart = new Date(Date.UTC(year, month - 1, 1));
  const monthEnd = new Date(Date.UTC(year, month, 0));

  const grouped = await prisma.expense.groupBy({
    by: ['category'],
    where: {
      businessId,
      isDeductible: true,
      expenseDate: { gte: monthStart, lte: monthEnd },
    },
    _sum: { amount: true },
  });

  const byCategory: Record<string, number> = {};
  for (const row of grouped) {
    byCategory[String(row.category)] = toNumber(row._sum?.amount ?? 0);
  }
  return byCategory;
}

/**
 * The single statutory calculation entry point.
 *
 * There is no flat-rate fallback: a business without a completed tax profile
 * gets a REVIEW_REQUIRED result with zero payable rather than a 7.5%-of-gross-
 * profit estimate that nobody validated against its actual classification.
 */
export async function calculateTaxWithStrategy(params: {
  businessId: string;
  month: number;
  year: number;
  totalSales: number;
  totalExpenses: number;
  grossProfit: number;
  /** @deprecated Ignored — statutory rates come from the profile. Logged if supplied. */
  taxRateOverride?: number;
  profile?: { completedAt: Date | null; computedConfig: any } | null;
  /** Optional pre-computed breakdown; avoids a query when the caller already has it. */
  expensesByCategory?: Record<string, number>;
}): Promise<TaxCalculationResult> {
  const { businessId, month, year, totalSales, totalExpenses, grossProfit, taxRateOverride } = params;

  let profile = params.profile;
  if (profile === undefined) {
    profile = await prisma.businessTaxProfile.findUnique({
      where: { businessId },
      select: { completedAt: true, computedConfig: true },
    });
  }

  if (taxRateOverride !== undefined) {
    logger.warn('taxRateOverride ignored: statutory rate is determined by the business tax profile', {
      businessId,
      month,
      year,
      taxRateOverride,
    });
  }

  if (!isTaxProfileComplete(profile)) {
    logger.warn('Tax calculation requires review: business has no completed tax profile', {
      businessId,
      month,
      year,
    });

    const result: ProfiledTaxResult = {
      taxPayable: 0,
      taxRate: 0,
      grossProfit,
      needsManualReview: true,
      reviewReason:
        'No completed tax profile: statutory rates cannot be determined. Complete the Tax Profile Quiz before this month can be remitted.',
      breakdown: {
        vatPayable: 0,
        citPayable: 0,
        devLevyPayable: 0,
        pitPayable: 0,
        totalPayable: 0,
      },
      advisory: {
        note: 'Flagged for manual review. No statutory scenario applies until the tax profile quiz is completed.',
      },
    };

    return { ...result, strategyUsed: 'REVIEW_REQUIRED' };
  }

  const expensesByCategory =
    params.expensesByCategory ?? (await loadExpensesByCategory(businessId, month, year));

  logger.info('Tax calculation strategy: PROFILED', { businessId, month, year });

  const profiled = calculateProfiledTax(
    businessId,
    month,
    year,
    totalSales,
    totalExpenses,
    profile as { computedConfig: TaxProfileConfiguration },
    expensesByCategory
  );

  return {
    ...profiled,
    strategyUsed: 'PROFILED',
  };
}
