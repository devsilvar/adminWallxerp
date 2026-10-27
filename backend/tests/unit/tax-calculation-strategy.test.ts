import { describe, it, expect, beforeEach, jest } from '@jest/globals';

// Mock dependencies
jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: {
    businessTaxProfile: {
      findUnique: jest.fn(),
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
import { config } from '@/config';
import { calculateTaxWithStrategy } from '@/services/tax/tax-calculation-strategy';
import type { TaxProfileConfiguration } from '@/shared/tax-constants';

describe('Tax Calculation Strategy Dispatcher', () => {
  const businessId = 'biz_strategy_test';
  const month = 10;
  const year = 2026;

  beforeEach(() => {
    jest.clearAllMocks();
    config.tax.useProfiledCalculation = false;
    config.tax.defaultRate = 7.5;
  });

  describe('Legacy Parity (Feature flag OFF or no completed profile)', () => {
    it('should calculate bit-exact legacy formula when flag is OFF', async () => {
      config.tax.useProfiledCalculation = false;

      const result = await calculateTaxWithStrategy({
        businessId,
        month,
        year,
        totalSales: 1500000,
        totalExpenses: 500000,
        grossProfit: 1000000,
      });

      expect(result.strategyUsed).toBe('LEGACY');
      expect(result.taxRate).toBe(7.5);
      expect(result.grossProfit).toBe(1000000);
      expect(result.taxPayable).toBe(75000); // 1,000,000 * 7.5% = 75,000
      expect(result.breakdown?.totalPayable).toBe(75000);
    });

    it('should respect taxRateOverride in legacy mode', async () => {
      config.tax.useProfiledCalculation = false;

      const result = await calculateTaxWithStrategy({
        businessId,
        month,
        year,
        totalSales: 2000000,
        totalExpenses: 1000000,
        grossProfit: 1000000,
        taxRateOverride: 10,
      });

      expect(result.strategyUsed).toBe('LEGACY');
      expect(result.taxRate).toBe(10);
      expect(result.taxPayable).toBe(100000);
    });

    it('should return 0 tax payable when gross profit is zero or negative', async () => {
      config.tax.useProfiledCalculation = false;

      const result = await calculateTaxWithStrategy({
        businessId,
        month,
        year,
        totalSales: 500000,
        totalExpenses: 800000,
        grossProfit: 0,
      });

      expect(result.taxPayable).toBe(0);
      expect(result.strategyUsed).toBe('LEGACY');
    });

    it('should fall back to legacy when flag is ON but profile is null in DB', async () => {
      config.tax.useProfiledCalculation = true;
      (prisma.businessTaxProfile.findUnique as any).mockResolvedValue(null);

      const result = await calculateTaxWithStrategy({
        businessId,
        month,
        year,
        totalSales: 2000000,
        totalExpenses: 1000000,
        grossProfit: 1000000,
      });

      expect(result.strategyUsed).toBe('LEGACY');
      expect(result.taxPayable).toBe(75000);
    });

    it('should fall back to legacy when profile exists but completedAt is null', async () => {
      config.tax.useProfiledCalculation = true;
      (prisma.businessTaxProfile.findUnique as any).mockResolvedValue({
        completedAt: null,
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

      expect(result.strategyUsed).toBe('LEGACY');
      expect(result.taxPayable).toBe(60000); // 800,000 * 7.5%
    });
  });

  describe('Profiled Calculation (Feature flag ON and completed profile)', () => {
    beforeEach(() => {
      config.tax.useProfiledCalculation = true;
    });

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
  });
});
