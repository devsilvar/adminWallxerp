import { describe, it, expect } from '@jest/globals';
import { calculateProfiledTax } from '@/services/tax/tax-profiled-calculation.service';
import { STATUTORY_TAX_CONSTANTS } from '@/shared/tax-constants';
import type { TaxProfileConfiguration } from '@/shared/tax-constants';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeProfile(overrides: Partial<TaxProfileConfiguration>): { computedConfig: TaxProfileConfiguration } {
  const base: TaxProfileConfiguration = {
    vatExempt: false,
    isCorporate: true,
    citRate: 0,
    isFtzExempt: false,
    incomeTaxType: 'CIT',
    mustChargeVat: true,
  };
  return { computedConfig: { ...base, ...overrides } };
}

const SALES = 1_070_000;    // ₦1,070,000 VAT-inclusive → output VAT = 70,000 @ 7.5/107.5
const EXPENSES = 537_500;   // ₦537,500 VAT-inclusive → input VAT = 37,500 @ 7.5/107.5

// ─────────────────────────────────────────────────────────────────────────────
// Suite 1 — Scenario 3 (Small Company, 0% CIT, not VAT-exempt)
// ─────────────────────────────────────────────────────────────────────────────
describe('calculateProfiledTax – Scenario 3 (Small Co, 0% CIT, VAT-charging)', () => {
  it('uses total expenses when no expensesByCategory provided (legacy path)', () => {
    const result = calculateProfiledTax('biz_1', 1, 2026, SALES, EXPENSES, makeProfile({ citRate: 0 }));
    expect(result.taxRate).toBe(STATUTORY_TAX_CONSTANTS.VAT.RATE);
    // inputVat = 537500 / 107.5 * 7.5 ≈ 37500
    const expectedInputVat = (EXPENSES / 107.5) * 7.5;
    expect(result.advisory.inputVat).toBeCloseTo(expectedInputVat, 0);
  });

  it('excludes salary-only expenses from input VAT (salary bears NO VAT)', () => {
    // All expenses are salary — no input VAT credit
    const result = calculateProfiledTax(
      'biz_1', 1, 2026, SALES, EXPENSES,
      makeProfile({ citRate: 0 }),
      { salary: EXPENSES }
    );
    expect(result.advisory.inputVat).toBe(0);
    // Net VAT should equal full output VAT
    const outputVat = (SALES / 107.5) * 7.5;
    expect(result.taxPayable).toBeCloseTo(outputVat, 0);
  });

  it('correctly isolates VAT-bearing vs non-VAT-bearing mixed expenses', () => {
    // ₦200k salary (no VAT) + ₦337,500 supplies (VAT-bearing)
    const result = calculateProfiledTax(
      'biz_1', 1, 2026, SALES, EXPENSES,
      makeProfile({ citRate: 0 }),
      { salary: 200_000, supplies: 337_500 }
    );
    const expectedInputVat = (337_500 / 107.5) * 7.5;
    expect(result.advisory.inputVat).toBeCloseTo(expectedInputVat, 0);
  });

  it('falls back to full expenses when expensesByCategory is empty object', () => {
    const withNoBreakdown = calculateProfiledTax('biz_1', 1, 2026, SALES, EXPENSES, makeProfile({ citRate: 0 }));
    const withEmptyObj = calculateProfiledTax('biz_1', 1, 2026, SALES, EXPENSES, makeProfile({ citRate: 0 }), {});
    expect(withEmptyObj.advisory.inputVat).toBeCloseTo(withNoBreakdown.advisory.inputVat!, 2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite 2 — Scenario 4 (Large Company, 30% CIT)
// ─────────────────────────────────────────────────────────────────────────────
describe('calculateProfiledTax – Scenario 4 (Large Co, 30% CIT)', () => {
  const largeProfile = makeProfile({ citRate: 30, isCorporate: true });

  it('salary-only expense breakdown → zero input VAT', () => {
    const result = calculateProfiledTax(
      'biz_2', 2, 2026, SALES, EXPENSES,
      largeProfile,
      { salaries: EXPENSES }   // "salaries" is in NON_VAT_EXPENSE_CATEGORIES
    );
    expect(result.advisory.inputVat).toBe(0);
    const outputVat = (SALES / 107.5) * 7.5;
    expect(result.taxPayable).toBeCloseTo(outputVat, 0);
  });

  it('advisory still includes annualCitEstimate and annualDevLevyEstimate', () => {
    const result = calculateProfiledTax('biz_2', 2, 2026, SALES, EXPENSES, largeProfile);
    expect(result.advisory.annualCitEstimate).toBeGreaterThanOrEqual(0);
    expect(result.advisory.annualDevLevyEstimate).toBeGreaterThanOrEqual(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite 3 — Scenario 5 (PIT — Sole Proprietor)
// ─────────────────────────────────────────────────────────────────────────────
describe('calculateProfiledTax – Scenario 5 (PIT, sole proprietor)', () => {
  const pitProfile = makeProfile({ incomeTaxType: 'PIT', isCorporate: false, citRate: 0 });

  it('salary-only breakdown → zero input VAT', () => {
    const result = calculateProfiledTax(
      'biz_3', 3, 2026, SALES, EXPENSES,
      pitProfile,
      { payroll: EXPENSES }  // "payroll" is in NON_VAT_EXPENSE_CATEGORIES
    );
    expect(result.advisory.inputVat).toBe(0);
  });

  it('advisory includes annualPitEstimate', () => {
    const result = calculateProfiledTax('biz_3', 3, 2026, SALES, EXPENSES, pitProfile);
    expect(result.advisory.annualPitEstimate).toBeGreaterThanOrEqual(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite 4 — Fallback / needsManualReview
// ─────────────────────────────────────────────────────────────────────────────
describe('calculateProfiledTax – fallback / incomplete profile', () => {
  it('returns needsManualReview=true for an unrecognised config (no hardcoded 7.5%)', () => {
    // A config that matches no scenario: not FTZ, not vatExempt+0%CIT, not 0%CIT, not 30%CIT corporate, not PIT
    const weirdProfile = makeProfile({
      vatExempt: false,
      isCorporate: false,
      citRate: 15,           // non-standard
      incomeTaxType: 'CIT', // not PIT — falls through all scenarios
      isFtzExempt: false,
    });
    const result = calculateProfiledTax('biz_x', 1, 2026, 1_000_000, 500_000, weirdProfile);
    expect(result.needsManualReview).toBe(true);
    expect(result.reviewReason).toBeTruthy();
    expect(result.taxPayable).toBe(0);
    // Must NOT be 7.5% — key invariant
    expect(result.taxRate).toBe(0);
  });

  it('empty config ({}) → needsManualReview, not 7.5%', () => {
    // Minimal profile — all flags at falsy/zero — matches no scenario
    const emptyProfile = {
      computedConfig: {
        vatExempt: false,
        isCorporate: false,
        citRate: 0,
        isFtzExempt: false,
        incomeTaxType: 'CIT',
        mustChargeVat: false,
      } as TaxProfileConfiguration,
    };
    // isCorporate=false AND citRate=0 AND incomeTaxType=CIT → not PIT → falls to fallback
    const result = calculateProfiledTax('biz_x', 1, 2026, 500_000, 200_000, emptyProfile);
    expect(result.needsManualReview).toBe(true);
    expect(result.taxPayable).toBe(0);
    expect(result.taxRate).not.toBe(7.5);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite 5 — Original scenarios unchanged (regression guard)
// ─────────────────────────────────────────────────────────────────────────────
describe('calculateProfiledTax – regression: original scenarios not broken', () => {
  it('Scenario 1: FTZ returns zero tax', () => {
    const result = calculateProfiledTax('biz_ftz', 1, 2026, 5_000_000, 2_000_000, makeProfile({ isFtzExempt: true }));
    expect(result.taxPayable).toBe(0);
    expect(result.advisory.note).toContain('Free Trade Zone');
  });

  it('Scenario 2: VAT-exempt small corporate returns zero tax', () => {
    const result = calculateProfiledTax(
      'biz_small', 1, 2026, 5_000_000, 2_000_000,
      makeProfile({ vatExempt: true, citRate: 0, isCorporate: true })
    );
    expect(result.taxPayable).toBe(0);
    expect(result.advisory.note).toContain('Small Company');
  });
});
