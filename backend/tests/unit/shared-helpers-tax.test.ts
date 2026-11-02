import { describe, it, expect } from '@jest/globals';
import {
  isVatBearingExpense,
  extractVatFromInclusive,
  netRevenueAfterVat,
  computeCitBase,
  applyPitBands,
  evaluateWhtOnPayment,
  computeRentRelief,
  NON_VAT_EXPENSE_CATEGORIES,
} from '@/shared/helpers/tax';
import { STATUTORY_TAX_CONSTANTS } from '@/shared/tax-constants';

describe('Shared Tax Helpers (backend/src/shared/helpers/tax.ts)', () => {
  describe('NON_VAT_EXPENSE_CATEGORIES and isVatBearingExpense', () => {
    it('should identify non-VAT bearing expense categories correctly', () => {
      expect(NON_VAT_EXPENSE_CATEGORIES).toContain('depreciation');
      expect(NON_VAT_EXPENSE_CATEGORIES).toContain('bad_debt');
      expect(NON_VAT_EXPENSE_CATEGORIES).toContain('salary');
      expect(NON_VAT_EXPENSE_CATEGORIES).toContain('interest');
      expect(NON_VAT_EXPENSE_CATEGORIES).toContain('penalty');

      expect(isVatBearingExpense('salary')).toBe(false);
      expect(isVatBearingExpense('Staff Salaries')).toBe(false);
      expect(isVatBearingExpense('depreciation')).toBe(false);
      expect(isVatBearingExpense('Bank Loan Interest Charges')).toBe(false);
      expect(isVatBearingExpense('Late Payment Fines')).toBe(false);
      expect(isVatBearingExpense('bad_debt')).toBe(false);
    });

    it('should identify standard VAT-bearing expenses', () => {
      expect(isVatBearingExpense('Office Supplies')).toBe(true);
      expect(isVatBearingExpense('Inventory Purchase')).toBe(true);
      expect(isVatBearingExpense('Legal Services')).toBe(true);
      expect(isVatBearingExpense('Equipment Rental')).toBe(true);
      expect(isVatBearingExpense(null)).toBe(true);
      expect(isVatBearingExpense(undefined)).toBe(true);
    });
  });

  describe('extractVatFromInclusive', () => {
    it('should accurately back-calculate 7.5% VAT from gross inclusive amounts', () => {
      // ₦107,500 gross inclusive at 7.5% -> ₦7,500 VAT
      expect(extractVatFromInclusive(107500)).toBe(7500);

      // ₦215,000 gross inclusive at 7.5% -> ₦15,000 VAT
      expect(extractVatFromInclusive(215000)).toBe(15000);
    });

    it('should return 0 for zero or negative gross amounts', () => {
      expect(extractVatFromInclusive(0)).toBe(0);
      expect(extractVatFromInclusive(-1000)).toBe(0);
    });

    it('should support custom VAT rates', () => {
      // ₦1,100 gross at 10% rate -> ₦100 VAT
      expect(extractVatFromInclusive(1100, 10)).toBe(100);
      expect(extractVatFromInclusive(1000, 0)).toBe(0);
      expect(extractVatFromInclusive(1000, -5)).toBe(0);
    });
  });

  describe('netRevenueAfterVat', () => {
    it('should return net revenue by subtracting extracted VAT when not exempt', () => {
      expect(netRevenueAfterVat(107500, false)).toBe(100000);
    });

    it('should preserve full sales amount when VAT exempt', () => {
      expect(netRevenueAfterVat(107500, true)).toBe(107500);
    });

    it('should return 0 for 0 or negative sales', () => {
      expect(netRevenueAfterVat(0, false)).toBe(0);
      expect(netRevenueAfterVat(-500, false)).toBe(0);
    });
  });

  describe('computeCitBase', () => {
    it('should compute assessable CIT base from net revenue and net deductible expenses', () => {
      // Gross sales ₦215k (net ₦200k), expenses ₦107.5k (net ₦100k)
      const base = computeCitBase(215000, 107500, false);
      expect(base).toBe(100000);
    });

    it('should compute assessable CIT base without VAT adjustment when business is VAT exempt', () => {
      const base = computeCitBase(200000, 100000, true);
      expect(base).toBe(100000);
    });

    it('should floor assessable CIT base at 0 when expenses exceed sales (tax loss)', () => {
      const base = computeCitBase(50000, 150000, false);
      expect(base).toBe(0);
    });
  });

  describe('applyPitBands (NTA 2025 s58 Progressive Bands)', () => {
    it('should return 0 for 0 or negative chargeable income', () => {
      expect(applyPitBands(0)).toBe(0);
      expect(applyPitBands(-10000)).toBe(0);
    });

    it('should assess 0% for income within the first ₦800,000 band', () => {
      expect(applyPitBands(500000)).toBe(0);
      expect(applyPitBands(800000)).toBe(0);
    });

    it('should assess 15% on income in the second band (₦800k - ₦3M)', () => {
      // ₦1,800,000: First ₦800k @ 0% = ₦0; Remaining ₦1M @ 15% = ₦150,000
      expect(applyPitBands(1800000)).toBe(150000);

      // ₦3,000,000: First ₦800k @ 0% = ₦0; ₦2.2M @ 15% = ₦330,000
      expect(applyPitBands(3000000)).toBe(330000);
    });

    it('should assess progressive rates across higher income bands', () => {
      // ₦5,000,000:
      // Band 1 (0 to 800k) @ 0% = ₦0
      // Band 2 (800k to 3M = 2.2M) @ 15% = ₦330,000
      // Band 3 (3M to 5M = 2M) @ 18% = ₦360,000
      // Total = ₦690,000
      expect(applyPitBands(5000000)).toBe(690000);
    });

    it('should correctly assess top band (> ₦50M at 25%)', () => {
      // ₦60,000,000:
      // 0 to 800k: 0
      // 800k to 3M (2.2M) @ 15%: 330,000
      // 3M to 12M (9M) @ 18%: 1,620,000
      // 12M to 25M (13M) @ 21%: 2,730,000
      // 25M to 50M (25M) @ 23%: 5,750,000
      // 50M to 60M (10M) @ 25%: 2,500,000
      // Total = 12,930,000
      expect(applyPitBands(60000000)).toBe(12930000);
    });
  });

  describe('evaluateWhtOnPayment', () => {
    it('should grant small company exemption for transactions ≤ ₦2,000,000 with valid TIN', () => {
      const result = evaluateWhtOnPayment({
        amount: 1500000,
        category: 'Consultancy Services',
        vendorHasTin: true,
        isQualifyingSmallCo: true,
      });

      expect(result.isExempt).toBe(true);
      expect(result.standardRate).toBe(0);
      expect(result.exemptionReason).toContain('≤ ₦2,000,000');
    });

    it('should not exempt small company transactions above ₦2,000,000', () => {
      const result = evaluateWhtOnPayment({
        amount: 2500000,
        category: 'Goods Supply',
        vendorHasTin: true,
        isQualifyingSmallCo: true,
      });

      expect(result.isExempt).toBe(false);
      expect(result.standardRate).toBe(2);
    });

    it('should apply standard 10% rate for consultancy to corporate/large businesses', () => {
      const result = evaluateWhtOnPayment({
        amount: 1000000,
        category: 'Professional Legal Consultation',
        vendorHasTin: true,
        isQualifyingSmallCo: false,
      });

      expect(result.isExempt).toBe(false);
      expect(result.standardRate).toBe(10);
    });

    it('should apply double penalty rate for vendors without TIN', () => {
      const result = evaluateWhtOnPayment({
        amount: 500000,
        category: 'Goods Supplies',
        vendorHasTin: false,
        isQualifyingSmallCo: false,
      });

      expect(result.isExempt).toBe(false);
      expect(result.standardRate).toBe(4); // 2% * 2 = 4%
    });
  });

  describe('computeRentRelief', () => {
    it('should calculate 20% of annual rent paid when below cap', () => {
      // ₦1,000,000 rent: 20% = ₦200,000
      expect(computeRentRelief(1000000)).toBe(200000);
    });

    it('should cap rent relief at ₦500,000 maximum', () => {
      // ₦3,500,000 rent: 20% = ₦700,000 -> capped at ₦500,000
      expect(computeRentRelief(3500000)).toBe(500000);
    });

    it('should return 0 for zero or negative rent', () => {
      expect(computeRentRelief(0)).toBe(0);
      expect(computeRentRelief(-50000)).toBe(0);
    });
  });
});
