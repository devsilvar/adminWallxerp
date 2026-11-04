import { describe, it, expect, beforeEach, jest } from '@jest/globals';

// Mock dependencies
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

describe('Tax Calculation Strategy Dispatcher', () => {
  const businessId = 'biz_strategy_test';
  const month = 10;
  const year = 2026;

  beforeEach(() => {
    jest.clearAllMocks();
    // No category breakdown by default → Input VAT falls back to total expenses.
    (prisma.expense.groupBy as any).mockResolvedValue([]);
  });

  describe('No completed tax profile → REVIEW_REQUIRED, never a flat-rate estimate', () => {
    it('returns zero payable and a manual-review flag when the business has no profile', async () => {
      (prisma.businessTaxProfile.findUnique as any).mockResolvedValue(null);

      const result = await calculateTaxWithStrategy({
        businessId,
        month,
        year,
        totalSales: 1500000,
        totalExpenses: 500000,
        grossProfit: 1000000,
      });

      expect(result.strategyUsed).toBe('REVIEW_REQUIRED');
      expect(result.needsManualReview).toBe(true);
      expect(result.taxPayable).toBe(0);
      expect(result.taxRate).toBe(0);
      expect(result.reviewReason).toContain('Tax Profile Quiz');
      // The retired legacy formula must not resurface
      expect(result.taxPayable).not.toBe(75000);
    });

    it('treats a profile with no completedAt as incomplete', async () => {
      (prisma.businessTaxProfile.findUnique as any).mockResolvedValue({
        completedAt: null,
        computedConfig: { vatExempt: true },
      });

      const result = await calculateTaxWithStrategy({
        businessId,
        month,
        year,
        totalSales: 1000000,
        totalExpenses: 200000,
        grossProfit: 800000,
      });

      expect(result.strategyUsed).toBe('REVIEW_REQUIRED');
      expect(result.taxPayable).toBe(0);
      expect(result.taxPayable).not.toBe(60000); // 800,000 × 7.5%
    });

    it('treats an empty computedConfig as incomplete', async () => {
      (prisma.businessTaxProfile.findUnique as any).mockResolvedValue({
        completedAt: new Date(),
        computedConfig: {},
      });

      const result = await calculateTaxWithStrategy({
        businessId,
        month,
        year,
        totalSales: 1000000,
        totalExpenses: 200000,
        grossProfit: 800000,
      });

      expect(result.strategyUsed).toBe('REVIEW_REQUIRED');
      expect(result.taxPayable).toBe(0);
    });

    it('ignores taxRateOverride instead of applying it', async () => {
      (prisma.businessTaxProfile.findUnique as any).mockResolvedValue(null);

      const result = await calculateTaxWithStrategy({
        businessId,
        month,
        year,
        totalSales: 2000000,
        totalExpenses: 1000000,
        grossProfit: 1000000,
        taxRateOverride: 10,
      });

      expect(result.strategyUsed).toBe('REVIEW_REQUIRED');
      expect(result.taxPayable).toBe(0);
      expect(result.taxRate).toBe(0);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('taxRateOverride'),
        expect.objectContaining({ taxRateOverride: 10 })
      );
    });
  });

  describe('Profiled Calculation (completed profile)', () => {
    it('Scenario 1: FTZ Exempt business -> ₦0 tax payable, 0% rate', async () => {
      const ftzConfig: TaxProfileConfiguration = {
        isFtzExempt: true,
        vatExempt: true,
        citRate: 0,
        incomeTaxType: 'CIT',
        isCorporate: true,
        requiresWhtDeduction: false,
        requiresPayrollTax: false,
        annualTurnoverBand: 'UNDER_25M',
        obligations: [],
      };

      const result = await calculateTaxWithStrategy({
        businessId,
        month,
        year,
        totalSales: 5000000,
        totalExpenses: 2000000,
        grossProfit: 3000000,
        profile: {
          completedAt: new Date(),
          computedConfig: ftzConfig,
        },
      });

      expect(result.strategyUsed).toBe('PROFILED');
      expect(result.taxPayable).toBe(0);
      expect(result.taxRate).toBe(0);
      expect(result.advisory?.note).toContain('Free Trade Zone');
    });

    it('Scenario 2: Small Company VAT-Exempt (< ₦25M turnover, 0% CIT) -> ₦0 monthly remittance', async () => {
      const smallCoConfig: TaxProfileConfiguration = {
        isFtzExempt: false,
        vatExempt: true,
        citRate: 0,
        incomeTaxType: 'CIT',
        isCorporate: true,
        requiresWhtDeduction: false,
        requiresPayrollTax: false,
        annualTurnoverBand: 'UNDER_25M',
        obligations: [],
      };

      const result = await calculateTaxWithStrategy({
        businessId,
        month,
        year,
        totalSales: 1500000,
        totalExpenses: 500000,
        grossProfit: 1000000,
        profile: {
          completedAt: new Date(),
          computedConfig: smallCoConfig,
        },
      });

      expect(result.strategyUsed).toBe('PROFILED');
      expect(result.taxPayable).toBe(0);
      expect(result.taxRate).toBe(0);
      expect(result.advisory?.note).toContain('Small Company: 0% CIT');
    });

    it('Scenario 3: Small Company charging VAT (₦25M-₦100M turnover, 0% CIT) -> Net VAT monthly', async () => {
      const vatSmallCoConfig: TaxProfileConfiguration = {
        isFtzExempt: false,
        vatExempt: false,
        citRate: 0,
        incomeTaxType: 'CIT',
        isCorporate: true,
        requiresWhtDeduction: false,
        requiresPayrollTax: true,
        annualTurnoverBand: 'FROM_25M_TO_100M',
        obligations: [],
      };

      // Sales & expenses are VAT-inclusive gross amounts.
      // Output VAT = 1,075,000 / 107.5 * 7.5 = 75,000
      // Input VAT  =   215,000 / 107.5 * 7.5 = 15,000
      // Net VAT    = 75,000 - 15,000 = 60,000
      const result = await calculateTaxWithStrategy({
        businessId,
        month,
        year,
        totalSales: 1075000,
        totalExpenses: 215000,
        grossProfit: 860000,
        profile: {
          completedAt: new Date(),
          computedConfig: vatSmallCoConfig,
        },
      });

      expect(result.strategyUsed).toBe('PROFILED');
      expect(result.taxPayable).toBe(60000);
      expect(result.taxRate).toBe(7.5);
      expect(result.breakdown?.vatPayable).toBe(60000);
      expect(result.advisory?.outputVat).toBe(75000);
      expect(result.advisory?.inputVat).toBe(15000);
    });

    it('Scenario 4: Large Company (> ₦100M turnover, 30% CIT + 4% Dev Levy) -> Net VAT + Annual CIT provisions', async () => {
      const largeCoConfig: TaxProfileConfiguration = {
        isFtzExempt: false,
        vatExempt: false,
        citRate: 30,
        incomeTaxType: 'CIT',
        isCorporate: true,
        requiresWhtDeduction: true,
        requiresPayrollTax: true,
        annualTurnoverBand: 'ABOVE_100M',
        obligations: [],
      };

      const result = await calculateTaxWithStrategy({
        businessId,
        month,
        year,
        totalSales: 10000000,
        totalExpenses: 4000000,
        grossProfit: 6000000,
        profile: {
          completedAt: new Date(),
          computedConfig: largeCoConfig,
        },
      });

      expect(result.strategyUsed).toBe('PROFILED');
      expect(result.breakdown?.vatPayable).toBeGreaterThan(0);
      expect(result.advisory?.annualCitEstimate).toBeGreaterThan(0);
      expect(result.advisory?.annualDevLevyEstimate).toBeGreaterThan(0);
      expect(result.advisory?.annualTaxProvision).toBe(
        (result.advisory?.annualCitEstimate ?? 0) + (result.advisory?.annualDevLevyEstimate ?? 0)
      );
    });

    it('Scenario 5: Sole Proprietorship (PIT) -> Monthly VAT + Progressive PIT bands advisory', async () => {
      const pitConfig: TaxProfileConfiguration = {
        isFtzExempt: false,
        vatExempt: true,
        citRate: 0,
        incomeTaxType: 'PIT',
        isCorporate: false,
        requiresWhtDeduction: false,
        requiresPayrollTax: false,
        annualTurnoverBand: 'UNDER_25M',
        obligations: [],
      };

      const result = await calculateTaxWithStrategy({
        businessId,
        month,
        year,
        totalSales: 2000000,
        totalExpenses: 500000,
        grossProfit: 1500000,
        profile: {
          completedAt: new Date(),
          computedConfig: pitConfig,
        },
      });

      expect(result.strategyUsed).toBe('PROFILED');
      // VAT exempt enterprise -> ₦0 monthly remittance
      expect(result.taxPayable).toBe(0);
      expect(result.advisory?.note).toContain('Personal Income Tax (PIT)');
      // Gross profit ₦1.5M: 800k @ 0% + 700k @ 15% = 105,000
      expect(result.advisory?.annualPitEstimate).toBe(105000);
    });

    it('claims Input VAT only on VAT-bearing categories, never on salaries (TAX-09)', async () => {
      const vatSmallCoConfig: TaxProfileConfiguration = {
        isFtzExempt: false,
        vatExempt: false,
        citRate: 0,
        incomeTaxType: 'CIT',
        isCorporate: true,
        requiresWhtDeduction: false,
        requiresPayrollTax: true,
        annualTurnoverBand: 'FROM_25M_TO_100M',
        obligations: [],
      };

      // ₦215,000 deductible, of which ₦100,000 is salaries (no VAT).
      (prisma.expense.groupBy as any).mockResolvedValue([
        { category: 'salary', _sum: { amount: 100000 } },
        { category: 'inventory', _sum: { amount: 115000 } },
      ]);

      const result = await calculateTaxWithStrategy({
        businessId,
        month,
        year,
        totalSales: 1075000,
        totalExpenses: 215000,
        grossProfit: 860000,
        profile: {
          completedAt: new Date(),
          computedConfig: vatSmallCoConfig,
        },
      });

      // Output VAT 75,000 − Input VAT on 115,000 only (8,023.26) = 66,976.74
      expect(result.advisory?.outputVat).toBe(75000);
      expect(result.advisory?.inputVat).toBeCloseTo(8023.26, 2);
      expect(result.taxPayable).toBeCloseTo(66976.74, 2);
    });
  });
});
