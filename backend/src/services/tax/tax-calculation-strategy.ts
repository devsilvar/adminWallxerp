import prisma from '@/lib/prisma';
import logger from '@/lib/logger';
import { config } from '@/config';
import { toNumber } from '@/shared/helpers';
import { calculateProfiledTax, ProfiledTaxResult } from './tax-profiled-calculation.service';
import type { TaxProfileConfiguration } from '@/shared/tax-constants';

export interface TaxCalculationResult {
  taxPayable: number;
  taxRate: number;
  grossProfit: number;
  strategyUsed: 'PROFILED' | 'LEGACY';
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
 * Strategy Dispatcher:
 * - If TAX_USE_PROFILED_CALCULATION is ON and business completed tax quiz -> Profiled calculation
 * - Otherwise -> 100% bit-exact legacy calculation (grossProfit * defaultRate)
 */
export async function calculateTaxWithStrategy(params: {
  businessId: string;
  month: number;
  year: number;
  totalSales: number;
  totalExpenses: number;
  grossProfit: number;
  taxRateOverride?: number;
  profile?: { completedAt: Date | null; computedConfig: any } | null;
}): Promise<TaxCalculationResult> {
  const { businessId, month, year, totalSales, totalExpenses, grossProfit, taxRateOverride } = params;

  // Retrieve profile if not supplied by caller
  let profile = params.profile;
  if (profile === undefined) {
    profile = await prisma.businessTaxProfile.findUnique({
      where: { businessId },
      select: { completedAt: true, computedConfig: true },
    });
  }

  const useProfiled = Boolean(config.tax.useProfiledCalculation && profile?.completedAt);

  if (useProfiled && profile) {
    logger.info('Tax calculation strategy: PROFILED', { businessId, month, year });
    const profiled = calculateProfiledTax(
      businessId,
      month,
      year,
      totalSales,
      totalExpenses,
      profile as { computedConfig: TaxProfileConfiguration }
    );

    return {
      ...profiled,
      strategyUsed: 'PROFILED',
    };
  }

  // Bit-exact legacy calculation
  const effectiveRate = taxRateOverride ?? config.tax.defaultRate;
  const legacyPayable = grossProfit > 0 ? toNumber((grossProfit * effectiveRate) / 100) : 0;

  return {
    taxPayable: legacyPayable,
    taxRate: effectiveRate,
    grossProfit,
    strategyUsed: 'LEGACY',
    breakdown: {
      vatPayable: 0,
      citPayable: 0,
      devLevyPayable: 0,
      pitPayable: 0,
      totalPayable: legacyPayable,
    },
    advisory: {
      note: 'Legacy calculation formula (flat rate on gross profit).',
    },
  };
}
