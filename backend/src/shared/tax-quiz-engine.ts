import { STATUTORY_TAX_CONSTANTS } from './tax-constants';
import type { QuizAnswers, TaxProfileConfiguration } from './tax-constants';

export * from './tax-constants';

/**
 * Evaluates quiz answers and generates tax profile configuration
 * 
 * PURE DETERMINISTIC FUNCTION with zero side effects:
 * - No database calls
 * - No external network calls
 * - 100% testable
 * 
 * @param answers - User's 10-question quiz responses
 * @returns Computed tax profile configuration
 */
export function evaluateTaxConfig(answers: QuizAnswers): TaxProfileConfiguration {
  const currentYear = new Date().getFullYear();
  const config: TaxProfileConfiguration = {
    // Defaults (overridden by rules)
    vatExempt: false,
    mustChargeVat: false,
    isCorporate: false,
    incomeTaxType: 'PIT',
    citRate: 0,
    devLevyRate: 0,
    mustDeductPAYE: false,
    mustSplitPAYEByState: false,
    mustDeductWHT: false,
    whtTransactionExemptionLimit: null,
    enableWHTCreditTracking: false,
    cgtTreatment: 'INDIVIDUAL_PROGRESSIVE_PIT',
    hasAgricultureHoliday: false,
    hasExportExemption: false,
    isFtzExempt: false,
    primaryTaxAuthority: 'SIRS_STATE',
    filingDeadline: new Date(Date.UTC(currentYear, 2, 31)), // March 31
    requiresNilReturns: true,
    needsManualReview: false,
    reviewReasons: [],
  };

  // ═══════════════════════════════════════════════════════════
  // PRIORITY 1: Free Trade Zone (Overrides Everything)
  // ═══════════════════════════════════════════════════════════
  if (answers.isInFreeTradeZone) {
    config.isFtzExempt = true;
    config.vatExempt = true;
    config.citRate = 0;
    config.devLevyRate = 0;
    config.requiresNilReturns = false;
    config.reviewReasons.push('Complete tax exemption: Business operates in a licensed Free Trade Zone (FTZ)');
    return config;
  }

  // ═══════════════════════════════════════════════════════════
  // PRIORITY 2: Legal Structure (Corporate vs Personal)
  // ═══════════════════════════════════════════════════════════
  if (answers.legalStructure === 'LLC') {
    config.isCorporate = true;
    config.incomeTaxType = 'CIT';
    config.primaryTaxAuthority = 'NRS_FEDERAL';
    // CIT filing deadline: 6 months after fiscal year end (default Dec 31 -> June 30)
    config.filingDeadline = new Date(Date.UTC(currentYear, 5, 30));
  } else {
    config.isCorporate = false;
    config.incomeTaxType = 'PIT';
    config.primaryTaxAuthority = 'SIRS_STATE';
    config.filingDeadline = new Date(Date.UTC(currentYear, 2, 31)); // March 31
  }

  // ═══════════════════════════════════════════════════════════
  // PRIORITY 3: VAT Exemption (₦25M Threshold) — NTA 2025 ss144-188
  // ═══════════════════════════════════════════════════════════
  if (answers.annualTurnover === 'UNDER_25M') {
    config.vatExempt = true;
    config.mustChargeVat = false;
    config.reviewReasons.push(
      `VAT Exempt: Annual turnover under ₦${(STATUTORY_TAX_CONSTANTS.VAT.EXEMPT_TURNOVER_LIMIT / 1_000_000).toFixed(0)}M threshold`
    );
  } else if (answers.annualTurnover !== 'UNKNOWN') {
    config.vatExempt = false;
    config.mustChargeVat = true;
    config.reviewReasons.push(
      `Must charge 7.5% VAT: Annual turnover meets or exceeds ₦${(STATUTORY_TAX_CONSTANTS.VAT.EXEMPT_TURNOVER_LIMIT / 1_000_000).toFixed(0)}M threshold`
    );
  }

  // ═══════════════════════════════════════════════════════════
  // PRIORITY 4: Small Company 0% CIT (₦100M Turnover + ₦250M Assets) — NTA 2025 s56(6)
  // ═══════════════════════════════════════════════════════════
  if (config.isCorporate) {
    const turnoverQualifies = ['UNDER_25M', 'M25M_TO_50M', 'M50M_TO_100M'].includes(answers.annualTurnover);
    const assetsQualify = answers.fixedAssetsValue === 'UNDER_250M';
    const notProfessional = answers.businessType !== 'PROFESSIONAL';
    const notRegulatedFinancial = answers.businessType !== 'REGULATED_FINANCIAL';

    if (turnoverQualifies && assetsQualify && notProfessional && notRegulatedFinancial) {
      config.citRate = 0;
      config.devLevyRate = 0;
      config.reviewReasons.push(
        `Small Company 0% CIT: Turnover ≤₦${(STATUTORY_TAX_CONSTANTS.CIT.SMALL_COMPANY.TURNOVER_LIMIT / 1_000_000).toFixed(0)}M ` +
        `AND fixed assets ≤₦${(STATUTORY_TAX_CONSTANTS.CIT.SMALL_COMPANY.ASSET_LIMIT / 1_000_000).toFixed(0)}M ` +
        `AND not professional services`
      );
    } else {
      config.citRate = 30;
      config.devLevyRate = 4;

      const reasons: string[] = [];
      if (!turnoverQualifies) reasons.push(`turnover exceeds ₦100M`);
      if (!assetsQualify) reasons.push(`fixed assets exceed ₦250M`);
      if (!notProfessional) reasons.push(`professional services excluded from 0% CIT`);
      if (!notRegulatedFinancial) reasons.push(`regulated financial business excluded`);

      config.reviewReasons.push(
        `Standard Corporate Tax: 30% CIT + 4% Development Levy (${reasons.join(', ')})`
      );
    }

    if (answers.businessType === 'PROFESSIONAL' || answers.businessType === 'TECH_SOFTWARE') {
      config.needsManualReview = true;
      config.reviewReasons.push(
        `[REVIEW REQUIRED] ${answers.businessType === 'PROFESSIONAL' ? 'Professional services' : 'Tech/software studio'} ` +
        `should verify statutory classification against s56 exclusion list.`
      );
    }
  }

  // ═══════════════════════════════════════════════════════════
  // PRIORITY 5: Agriculture Holiday (5 Years)
  // ═══════════════════════════════════════════════════════════
  if (answers.businessType === 'AGRICULTURE' && config.isCorporate) {
    config.hasAgricultureHoliday = true;
    config.citRate = 0;
    config.devLevyRate = 0;
    config.reviewReasons.push(
      `Agriculture Tax Holiday: 5-year 100% CIT exemption on primary farming profits (NTA 2025)`
    );
  }

  // ═══════════════════════════════════════════════════════════
  // PRIORITY 6: Export Exemption
  // ═══════════════════════════════════════════════════════════
  if (answers.isExportOriented) {
    config.hasExportExemption = true;
    config.reviewReasons.push(
      `Export Exemption: 100% export businesses may qualify for zero-rated VAT and profit tax exemption (subject to official foreign currency repatriation proof)`
    );
  }

  // ═══════════════════════════════════════════════════════════
  // PRIORITY 7: Employee Tax (PAYE) — NTA 2025 s81
  // ═══════════════════════════════════════════════════════════
  if (answers.hasEmployeesAbove800k) {
    config.mustDeductPAYE = true;
    config.reviewReasons.push(
      `PAYE Required: Must deduct and remit employee tax by 10th of each month for staff earning above ₦800k/year (₦66,667/month)`
    );

    if (answers.isMultiState) {
      config.mustSplitPAYEByState = true;
      config.reviewReasons.push(
        `Multi-State PAYE: Must split payroll remittance by employee residence state`
      );
    }
  }

  // ═══════════════════════════════════════════════════════════
  // PRIORITY 8: Withholding Tax (Transaction-Level Rule)
  // ═══════════════════════════════════════════════════════════
  if (answers.annualTurnover !== 'UNDER_25M' && answers.annualTurnover !== 'UNKNOWN') {
    config.mustDeductWHT = true;

    if (['M25M_TO_50M'].includes(answers.annualTurnover) && config.citRate === 0) {
      config.whtTransactionExemptionLimit = STATUTORY_TAX_CONSTANTS.WHT.SMALL_COMPANY_EXEMPTION.TRANSACTION_FLOOR;
      config.reviewReasons.push(
        `WHT Required: Must deduct withholding tax on qualifying payments. Small Company Exemption: Transactions ≤₦2M per vendor (with valid TIN) are exempt.`
      );
    } else {
      config.whtTransactionExemptionLimit = null;
      config.reviewReasons.push(
        `WHT Required: Must deduct withholding tax on qualifying payments and remit by 21st of following month`
      );
    }
  }

  if (answers.hasCorporateClientsWithWHT) {
    config.enableWHTCreditTracking = true;
    config.reviewReasons.push(
      `WHT Credit Tracking: Collect withholding credit notes from corporate clients to offset against your annual income tax liability`
    );
  }

  // ═══════════════════════════════════════════════════════════
  // PRIORITY 9: Capital Gains Tax (Digital Assets)
  // ═══════════════════════════════════════════════════════════
  if (answers.hasDigitalAssets) {
    if (config.isCorporate) {
      config.cgtTreatment = config.citRate === 0 ? 'EXEMPT_SMALL_COMPANY_0_PCT' : 'COMPANY_30_PCT';
    } else {
      config.cgtTreatment = 'INDIVIDUAL_PROGRESSIVE_PIT';
    }

    config.reviewReasons.push(
      `Digital Asset Gains: Taxed at ${
        config.cgtTreatment === 'EXEMPT_SMALL_COMPANY_0_PCT'
          ? '0% (small company exemption)'
          : config.cgtTreatment === 'COMPANY_30_PCT'
          ? '30% (corporate CGT)'
          : '0%-25% (individual progressive PIT rates)'
      }. Note: 1% WHT on transaction proceeds is withholding only, not final tax.`
    );
  }

  // ═══════════════════════════════════════════════════════════
  // PRIORITY 10: Manual Review Triggers
  // ═══════════════════════════════════════════════════════════
  if (answers.annualTurnover === 'UNKNOWN') {
    config.needsManualReview = true;
    config.reviewReasons.push(
      `[ACTION REQUIRED] Annual turnover unknown. Update profile after first year to confirm VAT and CIT thresholds.`
    );
  }

  if (answers.businessType === 'OTHER' && answers.businessTypeOther) {
    config.needsManualReview = true;
    config.reviewReasons.push(
      `[REVIEW REQUIRED] Custom business type: "${answers.businessTypeOther}". Manual classification recommended.`
    );
  }

  return config;
}

export const QUIZ_LABELS = {
  legalStructure: {
    UNREGISTERED: 'Unregistered (Freelancer, Personal hustle)',
    BUSINESS_NAME: 'Registered Business Name (Sole Proprietorship/Partnership)',
    LLC: 'Limited Liability Company (LTD/LLC)',
  },
  annualTurnover: {
    UNDER_25M: 'Under ₦25 Million',
    M25M_TO_50M: '₦25 Million to ₦50 Million',
    M50M_TO_100M: '₦50 Million to ₦100 Million',
    ABOVE_100M: 'Above ₦100 Million',
    UNKNOWN: "I don't know yet (New business)",
  },
  fixedAssetsValue: {
    UNDER_250M: '₦250 Million or less',
    ABOVE_250M: 'More than ₦250 Million',
  },
  businessType: {
    STANDARD: 'Retail, Trading, E-commerce, Manufacturing, or Hospitality',
    PROFESSIONAL: 'Professional Services (Law, Accounting, Consulting, Medical, Engineering)',
    TECH_SOFTWARE: 'Tech/Software Studio or Digital Agency',
    AGRICULTURE: 'Primary Agriculture, Farming, or Agro-Processing',
    REGULATED_FINANCIAL: 'Financial Services (Fintech, Lending, Investment)',
    OTHER: 'Other (describe)',
  },
};
