import { STATUTORY_TAX_CONSTANTS } from '@/shared/tax-constants';
import { toNumber } from '@/shared/helpers';

/**
 * Categories of business expenses that are deductible for income tax
 * but statutorily bear NO Value Added Tax (VAT).
 * 
 * Source: NTA 2025 ss144-188 & FIRS Input VAT Guidelines
 */
export const NON_VAT_EXPENSE_CATEGORIES = [
  'depreciation',
  'bad_debt',
  'salary',
  'salaries',
  'wages',
  'payroll',
  'penalty',
  'penalties',
  'fine',
  'fines',
  'interest',
  'bank_charges',
  'loan_interest',
] as const;

/**
 * Checks whether an expense category is eligible to claim Input VAT.
 */
export function isVatBearingExpense(category?: string | null): boolean {
  if (!category) return true; // Default standard expense (supplies, goods) bears VAT
  const normalized = category.toLowerCase().trim();
  return !NON_VAT_EXPENSE_CATEGORIES.some((excluded) => normalized.includes(excluded));
}

/**
 * Extract VAT from a VAT-inclusive gross amount
 * Statutory Back-Calculation Formula:
 * VAT = (Gross ÷ (100 + Rate)) × Rate
 * For 7.5%: Gross ÷ 107.5 × 7.5
 */
export function extractVatFromInclusive(gross: number, rate: number = STATUTORY_TAX_CONSTANTS.VAT.RATE): number {
  if (gross <= 0 || rate <= 0) return 0;
  return toNumber((gross / (100 + rate)) * rate);
}

/**
 * Calculate net revenue after excluding Output VAT
 */
export function netRevenueAfterVat(
  sales: number,
  vatExempt: boolean,
  rate: number = STATUTORY_TAX_CONSTANTS.VAT.RATE
): number {
  if (sales <= 0) return 0;
  if (vatExempt) return toNumber(sales);
  const vat = extractVatFromInclusive(sales, rate);
  return toNumber(sales - vat);
}

/**
 * Computes the Assessable Base for Company Income Tax (CIT)
 * Net Revenue (excluding Output VAT) minus Net Expenses (excluding Input VAT)
 */
export function computeCitBase(
  sales: number,
  expenses: number,
  vatExempt: boolean,
  rate: number = STATUTORY_TAX_CONSTANTS.VAT.RATE
): number {
  const netSales = netRevenueAfterVat(sales, vatExempt, rate);
  const netExpenses = vatExempt ? expenses : Math.max(0, expenses - extractVatFromInclusive(expenses, rate));
  return Math.max(0, toNumber(netSales - netExpenses));
}

/**
 * Applies progressive Personal Income Tax (PIT) bands
 * Source: NTA 2025 s58 & Fourth Schedule
 *
 * First ₦800k: 0%
 * ₦800k - ₦3M: 15%
 * ₦3M - ₦12M: 18%
 * ₦12M - ₦25M: 21%
 * ₦25M - ₦50M: 23%
 * Above ₦50M: 25%
 */
export function applyPitBands(chargeableIncome: number): number {
  if (chargeableIncome <= 0) return 0;

  const bands = STATUTORY_TAX_CONSTANTS.PIT.BANDS;
  let tax = 0;
  let previousThreshold = 0;

  for (const band of bands) {
    if (chargeableIncome <= previousThreshold) break;

    const taxableInBand = Math.min(
      chargeableIncome - previousThreshold,
      band.upTo === Infinity ? chargeableIncome : band.upTo - previousThreshold
    );

    tax += (taxableInBand * band.rate) / 100;
    previousThreshold = band.upTo;
  }

  return toNumber(tax);
}

/**
 * Evaluates Withholding Tax (WHT) deduction on a transaction payment.
 * Small companies (turnover < ₦25M) paying vendors with valid TIN
 * are exempt on transactions ≤ ₦2,000,000.
 */
export function evaluateWhtOnPayment(params: {
  amount: number;
  category: string;
  vendorHasTin: boolean;
  isQualifyingSmallCo: boolean;
}): {
  isExempt: boolean;
  standardRate: number;
  exemptionReason?: string;
} {
  const { amount, vendorHasTin, isQualifyingSmallCo } = params;

  // Small company transaction-level exemption
  if (isQualifyingSmallCo && vendorHasTin && amount <= STATUTORY_TAX_CONSTANTS.WHT.SMALL_COMPANY_EXEMPTION.TRANSACTION_FLOOR) {
    return {
      isExempt: true,
      standardRate: 0,
      exemptionReason: 'Small company transaction exemption: amount ≤ ₦2,000,000 and vendor has valid TIN',
    };
  }

  // Standard rate depends on category (goods: 2%, consultancy/services: 5%-10%)
  const categoryLower = (params.category || '').toLowerCase();
  let standardRate = 5;
  if (categoryLower.includes('goods') || categoryLower.includes('supply')) {
    standardRate = 2;
  } else if (categoryLower.includes('consult') || categoryLower.includes('professional') || categoryLower.includes('technical')) {
    standardRate = 10;
  }

  // Unregistered vendor penalty rate (double rate if no TIN per WHT regulations)
  if (!vendorHasTin) {
    standardRate = standardRate * 2;
  }

  return {
    isExempt: false,
    standardRate,
  };
}

/**
 * Compute rent relief deduction for Personal Income Tax (PIT)
 * 20% of annual rent paid, subject to maximum cap of ₦500,000
 */
export function computeRentRelief(annualRent: number): number {
  if (annualRent <= 0) return 0;
  const allowable = (annualRent * STATUTORY_TAX_CONSTANTS.PIT.RENT_RELIEF.PERCENTAGE) / 100;
  return toNumber(Math.min(allowable, STATUTORY_TAX_CONSTANTS.PIT.RENT_RELIEF.CAP));
}
