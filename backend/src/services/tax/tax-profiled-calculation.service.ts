import { STATUTORY_TAX_CONSTANTS } from '@/shared/tax-constants';
import type { TaxProfileConfiguration } from '@/shared/tax-constants';
import { toNumber } from '@/shared/helpers';
import {
  extractVatFromInclusive,
  computeCitBase,
  applyPitBands,
} from '@/shared/helpers/tax';

export interface ProfiledTaxResult {
  taxPayable: number;
  taxRate: number;
  grossProfit: number;
  breakdown: {
    vatPayable: number;
    citPayable: number;
    devLevyPayable: number;
    pitPayable: number;
    totalPayable: number;
  };
  advisory: {
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
 * Calculate statutory tax according to the business's completed profile configuration.
 * Resolves monthly remittance (VAT payable) while maintaining advisory provisions
 * for annual corporate or personal income taxes.
 */
export function calculateProfiledTax(
  businessId: string,
  month: number,
  year: number,
  sales: number,
  expenses: number,
  profile: { computedConfig: TaxProfileConfiguration }
): ProfiledTaxResult {
  const config = profile.computedConfig;
  const grossProfit = Math.max(0, toNumber(sales - expenses));

  // ═══════════════════════════════════════════════════════════
  // SCENARIO 1: Free Trade Zone (100% Tax Exemption)
  // ═══════════════════════════════════════════════════════════
  if (config.isFtzExempt) {
    return {
      taxPayable: 0,
      taxRate: 0,
      grossProfit,
      breakdown: {
        vatPayable: 0,
        citPayable: 0,
        devLevyPayable: 0,
        pitPayable: 0,
        totalPayable: 0,
      },
      advisory: {
        note: 'Complete tax exemption: Business licensed in a Free Trade Zone (FTZ).',
      },
    };
  }

  // ═══════════════════════════════════════════════════════════
  // SCENARIO 2: VAT-Exempt Small Company (Turnover < ₦25M, 0% CIT)
  // ═══════════════════════════════════════════════════════════
  if (config.vatExempt && config.citRate === 0 && config.isCorporate) {
    return {
      taxPayable: 0,
      taxRate: 0,
      grossProfit,
      breakdown: {
        vatPayable: 0,
        citPayable: 0,
        devLevyPayable: 0,
        pitPayable: 0,
        totalPayable: 0,
      },
      advisory: {
        note: 'Statutory Small Company: 0% CIT (turnover ≤ ₦100M, assets ≤ ₦250M) and VAT-Exempt (< ₦25M). Monthly remittance: ₦0.',
      },
    };
  }

  // ═══════════════════════════════════════════════════════════
  // SCENARIO 3: VAT-Charging Small Company (Turnover ₦25M - ₦100M, 0% CIT)
  // ═══════════════════════════════════════════════════════════
  if (!config.vatExempt && config.citRate === 0 && config.isCorporate) {
    const outputVat = extractVatFromInclusive(sales, STATUTORY_TAX_CONSTANTS.VAT.RATE);
    const inputVat = extractVatFromInclusive(expenses, STATUTORY_TAX_CONSTANTS.VAT.RATE);
    const netVat = Math.max(0, toNumber(outputVat - inputVat));

    return {
      taxPayable: netVat,
      taxRate: STATUTORY_TAX_CONSTANTS.VAT.RATE,
      grossProfit,
      breakdown: {
        vatPayable: netVat,
        citPayable: 0,
        devLevyPayable: 0,
        pitPayable: 0,
        totalPayable: netVat,
      },
      advisory: {
        note: 'Small Company: Monthly remittance is Net VAT only. Corporate Income Tax: 0% statutory rate.',
        outputVat,
        inputVat,
      },
    };
  }

  // ═══════════════════════════════════════════════════════════
  // SCENARIO 4: Large Company or Excluded Professional (30% CIT + 4% Dev Levy)
  // ═══════════════════════════════════════════════════════════
  if (config.citRate === 30 && config.isCorporate) {
    const outputVat = config.vatExempt ? 0 : extractVatFromInclusive(sales, STATUTORY_TAX_CONSTANTS.VAT.RATE);
    const inputVat = config.vatExempt ? 0 : extractVatFromInclusive(expenses, STATUTORY_TAX_CONSTANTS.VAT.RATE);
    const netVat = Math.max(0, toNumber(outputVat - inputVat));

    const citBase = computeCitBase(sales, expenses, config.vatExempt);
    const cit = toNumber((citBase * STATUTORY_TAX_CONSTANTS.CIT.LARGE_COMPANY.RATE) / 100);
    const devLevy = toNumber((citBase * STATUTORY_TAX_CONSTANTS.CIT.LARGE_COMPANY.DEVELOPMENT_LEVY_RATE) / 100);

    return {
      taxPayable: netVat,
      taxRate: STATUTORY_TAX_CONSTANTS.VAT.RATE,
      grossProfit,
      breakdown: {
        vatPayable: netVat,
        citPayable: 0, // Settled annually
        devLevyPayable: 0,
        pitPayable: 0,
        totalPayable: netVat,
      },
      advisory: {
        note: 'Monthly remittance is Net VAT. CIT (30%) and Development Levy (4%) accrue for annual filing.',
        outputVat,
        inputVat,
        citBase,
        annualCitEstimate: cit,
        annualDevLevyEstimate: devLevy,
        annualTaxProvision: toNumber(cit + devLevy),
      },
    };
  }

  // ═══════════════════════════════════════════════════════════
  // SCENARIO 5: Personal Income Tax (PIT) — Sole Proprietorship / Business Name
  // ═══════════════════════════════════════════════════════════
  if (config.incomeTaxType === 'PIT') {
    const outputVat = config.vatExempt ? 0 : extractVatFromInclusive(sales, STATUTORY_TAX_CONSTANTS.VAT.RATE);
    const inputVat = config.vatExempt ? 0 : extractVatFromInclusive(expenses, STATUTORY_TAX_CONSTANTS.VAT.RATE);
    const netVat = Math.max(0, toNumber(outputVat - inputVat));

    const pitEstimate = applyPitBands(grossProfit);

    return {
      taxPayable: netVat,
      taxRate: config.vatExempt ? 0 : STATUTORY_TAX_CONSTANTS.VAT.RATE,
      grossProfit,
      breakdown: {
        vatPayable: netVat,
        citPayable: 0,
        devLevyPayable: 0,
        pitPayable: 0, // Settled annually with State IRS by March 31
        totalPayable: netVat,
      },
      advisory: {
        note: 'Personal Income Tax (PIT): File Form A with State IRS by 31 March. Progressive bands 0%-25%.',
        outputVat: config.vatExempt ? 0 : outputVat,
        inputVat: config.vatExempt ? 0 : inputVat,
        annualPitEstimate: pitEstimate,
        annualTaxProvision: pitEstimate,
      },
    };
  }

  // Fallback safe default (7.5% standard)
  const defaultPayable = grossProfit > 0 ? toNumber((grossProfit * 7.5) / 100) : 0;
  return {
    taxPayable: defaultPayable,
    taxRate: 7.5,
    grossProfit,
    breakdown: {
      vatPayable: 0,
      citPayable: 0,
      devLevyPayable: 0,
      pitPayable: 0,
      totalPayable: defaultPayable,
    },
    advisory: {
      note: 'Standard tax assessment (7.5% default rate).',
    },
  };
}
