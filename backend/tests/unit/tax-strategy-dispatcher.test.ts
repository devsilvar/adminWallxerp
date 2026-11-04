/**
 * Strategy Dispatcher contract tests.
 *
 * The flat-rate ("LEGACY") path is retired: the profiled engine is the only
 * calculation path. These tests pin that contract:
 *
 * 1. taxRateOverride is never applied — it is logged and ignored.
 * 2. No completed tax profile → REVIEW_REQUIRED, ₦0, never a flat-rate estimate.
 * 3. Exempt profiles remit ₦0.
 * 4. advisory travels in the result and is never persisted.
 * 5. The profile is auto-fetched when not supplied by the caller.
 */
import { describe, it, expect, beforeEach, jest } from '@jest/globals';

// ─── Mock prisma ─────────────────────────────────────────────
jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: {
    businessTaxProfile: {
      findUnique: jest.fn(),
    },
    expense: {
      groupBy: jest.fn(),
    },
  },
}));

jest.mock('@/lib/logger', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

import prisma from '@/lib/prisma';
import logger from '@/lib/logger';
import { calculateTaxWithStrategy } from '@/services/tax/tax-calculation-strategy';
import type { TaxProfileConfiguration } from '@/shared/tax-constants';

// ─── Shared fixtures ─────────────────────────────────────────
const BIZ_ID = 'biz_phase9_test';
const MONTH = 10;
const YEAR = 2026;
const SALES = 1_500_000;
const EXPENSES = 500_000;
const GROSS = 1_000_000;

function makeCompletedProfile(overrides: Partial<TaxProfileConfiguration> = {}) {
  const base: TaxProfileConfiguration = {
    isFtzExempt: false,
    vatExempt: true,
    citRate: 0,
    incomeTaxType: 'CIT',
    isCorporate: true,
    mustChargeVat: false,
  };
  return {
    completedAt: new Date('2026-09-01T00:00:00Z'),
    computedConfig: { ...base, ...overrides },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  (prisma.expense.groupBy as any).mockResolvedValue([]);
});

// ─────────────────────────────────────────────────────────────
// Suite 1: taxRateOverride behaviour
// ─────────────────────────────────────────────────────────────
describe('calculateTaxWithStrategy – taxRateOverride behaviour', () => {
  it('logs and ignores taxRateOverride, applying the statutory result instead', async () => {
    // VAT-exempt small corporate (Scenario 2) → taxPayable = 0
    const result = await calculateTaxWithStrategy({
      businessId: BIZ_ID,
      month: MONTH,
      year: YEAR,
      totalSales: SALES,
      totalExpenses: EXPENSES,
      grossProfit: GROSS,
      taxRateOverride: 15,
      profile: makeCompletedProfile({ vatExempt: true, citRate: 0, isCorporate: true }),
    });

    expect(result.strategyUsed).toBe('PROFILED');
    expect(result.taxPayable).toBe(0);
    expect(result.taxRate).toBe(0);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('taxRateOverride'),
      expect.objectContaining({ taxRateOverride: 15 })
    );
  });

  it('does not warn when no override is supplied', async () => {
    await calculateTaxWithStrategy({
      businessId: BIZ_ID,
      month: MONTH,
      year: YEAR,
      totalSales: SALES,
      totalExpenses: EXPENSES,
      grossProfit: GROSS,
      profile: makeCompletedProfile(),
    });

    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('never falls back to a flat-rate amount when the profile is missing', async () => {
    (prisma.businessTaxProfile.findUnique as any).mockResolvedValue(null);

    const result = await calculateTaxWithStrategy({
      businessId: BIZ_ID,
      month: MONTH,
      year: YEAR,
      totalSales: SALES,
      totalExpenses: EXPENSES,
      grossProfit: GROSS,
      taxRateOverride: 10,
    });

    expect(result.strategyUsed).toBe('REVIEW_REQUIRED');
    expect(result.taxPayable).toBe(0);
    expect(result.taxPayable).not.toBe(100_000); // 1,000,000 × 10% (retired override)
    expect(result.taxPayable).not.toBe(75_000); // 1,000,000 × 7.5% (retired legacy)
  });
});

// ─────────────────────────────────────────────────────────────
// Suite 2: Exempt profile → taxPayable = 0
// ─────────────────────────────────────────────────────────────
describe('calculateTaxWithStrategy – exempt profile yields zero taxPayable', () => {
  it('FTZ exempt business: taxPayable = 0 (not a flat-rate amount)', async () => {
    const result = await calculateTaxWithStrategy({
      businessId: BIZ_ID,
      month: MONTH,
      year: YEAR,
      totalSales: SALES,
      totalExpenses: EXPENSES,
      grossProfit: GROSS,
      profile: makeCompletedProfile({ isFtzExempt: true }),
    });

    expect(result.taxPayable).toBe(0);
    expect(result.taxRate).toBe(0);
    expect(result.strategyUsed).toBe('PROFILED');
    expect(result.taxPayable).not.toBe(75_000);
  });

  it('VAT-exempt small co: taxPayable = 0', async () => {
    const result = await calculateTaxWithStrategy({
      businessId: BIZ_ID,
      month: MONTH,
      year: YEAR,
      totalSales: SALES,
      totalExpenses: EXPENSES,
      grossProfit: GROSS,
      profile: makeCompletedProfile({ vatExempt: true, citRate: 0, isCorporate: true }),
    });

    expect(result.taxPayable).toBe(0);
    expect(result.taxRate).toBe(0);
    expect(result.strategyUsed).toBe('PROFILED');
  });
});

// ─────────────────────────────────────────────────────────────
// Suite 3: advisory in result (never a DB column)
// ─────────────────────────────────────────────────────────────
describe('calculateTaxWithStrategy – advisory field in result', () => {
  it('PROFILED path returns advisory.note in result (not persisted)', async () => {
    const result = await calculateTaxWithStrategy({
      businessId: BIZ_ID,
      month: MONTH,
      year: YEAR,
      totalSales: SALES,
      totalExpenses: EXPENSES,
      grossProfit: GROSS,
      profile: makeCompletedProfile({ vatExempt: true, citRate: 0, isCorporate: true }),
    });

    expect(result.advisory).toBeDefined();
    expect(result.advisory!.note).toBeTruthy();
    expect(result.strategyUsed).toBe('PROFILED');
  });

  it('REVIEW_REQUIRED path also explains itself', async () => {
    (prisma.businessTaxProfile.findUnique as any).mockResolvedValue(null);

    const result = await calculateTaxWithStrategy({
      businessId: BIZ_ID,
      month: MONTH,
      year: YEAR,
      totalSales: SALES,
      totalExpenses: EXPENSES,
      grossProfit: GROSS,
    });

    expect(result.advisory?.note).toBeTruthy();
    expect(result.needsManualReview).toBe(true);
    expect(result.reviewReason).toBeTruthy();
  });
});

// ─────────────────────────────────────────────────────────────
// Suite 4: Profile fetched from DB when profile param not supplied
// ─────────────────────────────────────────────────────────────
describe('calculateTaxWithStrategy – profile auto-fetch from DB', () => {
  it('fetches the profile and uses PROFILED strategy when it is complete', async () => {
    (prisma.businessTaxProfile.findUnique as any).mockResolvedValue(
      makeCompletedProfile({ isFtzExempt: true })
    );

    const result = await calculateTaxWithStrategy({
      businessId: BIZ_ID,
      month: MONTH,
      year: YEAR,
      totalSales: SALES,
      totalExpenses: EXPENSES,
      grossProfit: GROSS,
      // profile NOT supplied — should fetch from DB
    });

    expect(prisma.businessTaxProfile.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { businessId: BIZ_ID } })
    );
    expect(result.strategyUsed).toBe('PROFILED');
    expect(result.taxPayable).toBe(0);
  });

  it('flags for review when the DB profile is null', async () => {
    (prisma.businessTaxProfile.findUnique as any).mockResolvedValue(null);

    const result = await calculateTaxWithStrategy({
      businessId: BIZ_ID,
      month: MONTH,
      year: YEAR,
      totalSales: SALES,
      totalExpenses: EXPENSES,
      grossProfit: GROSS,
    });

    expect(result.strategyUsed).toBe('REVIEW_REQUIRED');
    expect(result.taxPayable).toBe(0);
    expect(result.needsManualReview).toBe(true);
  });
});
