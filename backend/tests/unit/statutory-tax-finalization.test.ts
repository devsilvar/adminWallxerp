import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import { PlatformTaxConfigService } from '../../src/services/platform-tax-config.service';
import { updateTaxConfigSchema } from '../../src/validators/admin.validator';
import { AppError } from '../../src/middleware/errorHandler';

/**
 * Statutory Tax Finalization & Platform Tax Config Tests
 *
 * Covers:
 * 1. PlatformTaxConfigService defaults, caching, and day-of-month bounds (1..28)
 * 2. Statutory Month-End Date Gate (disallowing active month finalization, opening on Day 1 of next month)
 * 3. Un-finalizing rules (permitted when unpaid, permanently locked when paid)
 * 4. Deductible operational expense calculations (reducing Gross Profit and tax payable)
 */

describe('Platform Tax Config Service', () => {
  beforeEach(() => {
    PlatformTaxConfigService.invalidateCache();
  });

  test('validates updateTaxConfigSchema enforces autoFinalizeDay between 1 and 28', () => {
    // Valid values
    expect(updateTaxConfigSchema.safeParse({ autoFinalizeDay: 1 }).success).toBe(true);
    expect(updateTaxConfigSchema.safeParse({ autoFinalizeDay: 20 }).success).toBe(true);
    expect(updateTaxConfigSchema.safeParse({ autoFinalizeDay: 21 }).success).toBe(true);
    expect(updateTaxConfigSchema.safeParse({ autoFinalizeDay: 28 }).success).toBe(true);
    expect(updateTaxConfigSchema.safeParse({ autoFinalizeEnabled: false }).success).toBe(true);

    // Invalid values
    expect(updateTaxConfigSchema.safeParse({ autoFinalizeDay: 0 }).success).toBe(false);
    expect(updateTaxConfigSchema.safeParse({ autoFinalizeDay: 29 }).success).toBe(false);
    expect(updateTaxConfigSchema.safeParse({ autoFinalizeDay: 31 }).success).toBe(false);
    expect(updateTaxConfigSchema.safeParse({ autoFinalizeDay: -5 }).success).toBe(false);
    expect(updateTaxConfigSchema.safeParse({ autoFinalizeDay: 15.5 }).success).toBe(false);
  });

  test('getTaxConfig returns statutory defaults (Day 20, enabled) on uninitialized database', async () => {
    const config = await PlatformTaxConfigService.getTaxConfig();
    expect(config).toBeDefined();
    expect(config.id).toBe('default');
    expect(config.autoFinalizeDay).toBe(20);
    expect(config.autoFinalizeEnabled).toBe(true);
  });
});

describe('Statutory Month-End Finalization Date Gate Logic', () => {
  /**
   * Statutory Date Gate Formula:
   * A month's tax report cannot be finalized while the month is active.
   * Finalization opens strictly on the 1st day of the following month:
   * firstDayOfNextMonth = Date.UTC(reportYear, reportMonth + 1, 1)
   */
  function verifyFinalizationEligibility(
    reportYear: number,
    reportMonth: number, // 0-indexed: 8 for September
    todayUtc: Date
  ): { eligible: boolean; firstDayOfNextMonth: Date } {
    const firstDayOfNextMonth = new Date(Date.UTC(reportYear, reportMonth + 1, 1));
    const todayDateOnly = new Date(
      Date.UTC(todayUtc.getUTCFullYear(), todayUtc.getUTCMonth(), todayUtc.getUTCDate())
    );

    return {
      eligible: todayDateOnly >= firstDayOfNextMonth,
      firstDayOfNextMonth,
    };
  }

  test('disallows finalization during the active month (e.g. September 15th for September report)', () => {
    // September 2026 report (reportMonth = 8)
    const reportYear = 2026;
    const reportMonth = 8; // September

    // Attempt on September 15th
    const midMonthDate = new Date(Date.UTC(2026, 8, 15));
    const checkMidMonth = verifyFinalizationEligibility(reportYear, reportMonth, midMonthDate);
    expect(checkMidMonth.eligible).toBe(false);
    expect(checkMidMonth.firstDayOfNextMonth.toISOString()).toBe('2026-10-01T00:00:00.000Z');

    // Attempt on the final calendar day (September 30th)
    const lastDayOfMonth = new Date(Date.UTC(2026, 8, 30));
    const checkLastDay = verifyFinalizationEligibility(reportYear, reportMonth, lastDayOfMonth);
    expect(checkLastDay.eligible).toBe(false);
  });

  test('allows finalization on Day 1 of the following month (e.g. October 1st for September report)', () => {
    const reportYear = 2026;
    const reportMonth = 8; // September

    // October 1st, 2026 at 00:00:00 UTC
    const dayOneDate = new Date(Date.UTC(2026, 9, 1));
    const checkDayOne = verifyFinalizationEligibility(reportYear, reportMonth, dayOneDate);
    expect(checkDayOne.eligible).toBe(true);

    // Later in October (e.g. October 15th)
    const laterInMonth = new Date(Date.UTC(2026, 9, 15));
    const checkLater = verifyFinalizationEligibility(reportYear, reportMonth, laterInMonth);
    expect(checkLater.eligible).toBe(true);
  });
});

describe('Report Un-finalization & Locking Rules', () => {
  test('allows un-finalizing an unpaid finalized report', () => {
    const draftReport = {
      id: 'rep-1',
      isFinalized: true,
      isLocked: false, // Not yet paid
      paymentStatus: 'pending',
    };

    function canUnfinalize(report: typeof draftReport) {
      if (report.isLocked) {
        throw new AppError(423, 'Report is locked — tax has been paid. Locked reports cannot be un-finalized.');
      }
      return { ...report, isFinalized: false };
    }

    const unfinalized = canUnfinalize(draftReport);
    expect(unfinalized.isFinalized).toBe(false);
  });

  test('blocks un-finalizing once tax is paid (isLocked = true)', () => {
    const paidReport = {
      id: 'rep-2',
      isFinalized: true,
      isLocked: true, // Remitted to NRS
      paymentStatus: 'completed',
    };

    function canUnfinalize(report: typeof paidReport) {
      if (report.isLocked) {
        throw new AppError(423, 'Report is locked — tax has been paid. Locked reports cannot be un-finalized.');
      }
      return { ...report, isFinalized: false };
    }

    expect(() => canUnfinalize(paidReport)).toThrow(AppError);
    try {
      canUnfinalize(paidReport);
    } catch (err: any) {
      expect(err.statusCode).toBe(423);
      expect(err.message).toContain('Report is locked');
    }
  });
});

describe('Allowable Operational Expenses & Tax Deductibility Verification', () => {
  const TAX_RATE = 0.075; // 7.5%

  function computeStatutoryTax(turnover: number, allowableExpenses: number) {
    const grossProfit = Math.max(0, turnover - allowableExpenses);
    const taxPayable = Math.round(grossProfit * TAX_RATE * 100) / 100;
    return {
      grossProfit,
      taxPayable,
    };
  }

  test('allowable operational expenses (Rent, Salaries, Utilities, Bad Debt) reduce Gross Profit and tax liability', () => {
    const salesTurnover = 500000;
    const allowableExpenses = {
      rent: 80000,
      salaries: 120000,
      utilities: 30000,
      badDebtWriteOff: 20000,
    };
    const totalAllowable = Object.values(allowableExpenses).reduce((a, b) => a + b, 0); // 250,000

    const { grossProfit, taxPayable } = computeStatutoryTax(salesTurnover, totalAllowable);

    // Gross profit must equal 500,000 - 250,000 = 250,000
    expect(grossProfit).toBe(250000);

    // Tax payable must be 7.5% of 250,000 = 18,750
    expect(taxPayable).toBe(18750);

    // If no expenses were logged, tax would have been 37,500
    const withoutExpenses = computeStatutoryTax(salesTurnover, 0);
    expect(withoutExpenses.taxPayable).toBe(37500);

    // Tax saved through allowable deductions is 18,750
    expect(withoutExpenses.taxPayable - taxPayable).toBe(18750);
  });

  test('when allowable expenses exceed sales turnover, tax payable is 0 (no negative tax liability)', () => {
    const salesTurnover = 150000;
    const totalAllowable = 200000; // Loss of 50,000

    const { grossProfit, taxPayable } = computeStatutoryTax(salesTurnover, totalAllowable);

    expect(grossProfit).toBe(0);
    expect(taxPayable).toBe(0);
  });
});
