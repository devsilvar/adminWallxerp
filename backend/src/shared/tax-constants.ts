/**
 * Statutory Tax Constants for Nigerian Tax System
 * 
 * Sources:
 * - Nigeria Tax Act (NTA) 2025
 * - Nigeria Tax Administration Act (NTAA) 2025
 * - Federal Inland Revenue Service (FIRS) Guidelines 2026
 * - State Internal Revenue Service (SIRS) Guidelines 2026
 * 
 * Last Verified: 2026-10-14 (v1.1 Corrected per final gazetted NTA 2025 s56(6)/s202)
 */

export const STATUTORY_TAX_CONSTANTS = {
  // ═══════════════════════════════════════════════════════════
  // VALUE ADDED TAX (VAT) — NTA 2025 ss144-188, NTAA 2025 s22
  // ═══════════════════════════════════════════════════════════
  VAT: {
    RATE: 7.5,                         // 7.5% standard rate
    EXEMPT_TURNOVER_LIMIT: 25_000_000, // ₦25M threshold (no asset test for VAT)
  },

  // ═══════════════════════════════════════════════════════════
  // CORPORATE INCOME TAX (CIT) — NTA 2025 s56
  // ═══════════════════════════════════════════════════════════
  CIT: {
    SMALL_COMPANY: {
      RATE: 0,                         // 0% for qualifying small companies
      TURNOVER_LIMIT: 100_000_000,     // ₦100M final gazetted NTA 2025 s56(6)/s202
      ASSET_LIMIT: 250_000_000,        // ₦250M fixed assets
    },
    LARGE_COMPANY: {
      RATE: 30,                        // 30% standard corporate rate
      DEVELOPMENT_LEVY_RATE: 4,        // 4% on assessable profits
    },
    EXCLUDED_INDUSTRIES: [
      'PROFESSIONAL_SERVICES',         // Law, accounting, consulting, medical, engineering
      'REGULATED_FINANCIAL',           // Fintech, lending, investment firms
    ],
  },

  // ═══════════════════════════════════════════════════════════
  // PERSONAL INCOME TAX (PIT) — NTA 2025 s58, Fourth Schedule
  // ═══════════════════════════════════════════════════════════
  PIT: {
    FREE_THRESHOLD: 800_000,           // First ₦800k tax-free
    BANDS: [
      { upTo: 800_000, rate: 0 },      // 0% on first ₦800k
      { upTo: 3_000_000, rate: 15 },   // 15% on ₦800k - ₦3M
      { upTo: 12_000_000, rate: 18 },  // 18% on ₦3M - ₦12M
      { upTo: 25_000_000, rate: 21 },  // 21% on ₦12M - ₦25M
      { upTo: 50_000_000, rate: 23 },  // 23% on ₦25M - ₦50M
      { upTo: Infinity, rate: 25 },    // 25% above ₦50M
    ],
    RENT_RELIEF: {
      PERCENTAGE: 20,                  // 20% of rent
      CAP: 500_000,                    // Max ₦500k/year
    },
  },

  // ═══════════════════════════════════════════════════════════
  // EMPLOYEE TAX (PAYE) — NTA 2025 s81
  // ═══════════════════════════════════════════════════════════
  PAYE: {
    THRESHOLD: 800_000,                // ₦800k/year (₦66,667/month)
  },

  // ═══════════════════════════════════════════════════════════
  // WITHHOLDING TAX (WHT) — WHT Regulations 2025
  // ═══════════════════════════════════════════════════════════
  WHT: {
    SMALL_COMPANY_EXEMPTION: {
      TURNOVER_LIMIT: 25_000_000,      // ₦25M
      TRANSACTION_FLOOR: 2_000_000,    // ₦2M per transaction floor
    },
  },

  // ═══════════════════════════════════════════════════════════
  // CAPITAL GAINS TAX (CGT) — NTA 2025 ss4, 33-58
  // ═══════════════════════════════════════════════════════════
  CGT: {
    COMPANY_RATE: 30,                  // 30% for companies
    INDIVIDUAL_RATE: 'PROGRESSIVE_PIT',// Uses PIT bands (0-25%)
  },

  // ═══════════════════════════════════════════════════════════
  // SPECIAL INCENTIVES
  // ═══════════════════════════════════════════════════════════
  INCENTIVES: {
    AGRICULTURE_HOLIDAY_YEARS: 5,      // 5-year exemption (agriculture only)
    EXPORT_EXEMPTION: true,            // 100% export businesses
    FTZ_COMPLETE_EXEMPTION: true,      // Free Trade Zones
  },

  // ═══════════════════════════════════════════════════════════
  // FILING DEADLINES
  // ═══════════════════════════════════════════════════════════
  DEADLINES: {
    PIT_ANNUAL: { month: 3, day: 31 }, // 31 March annually
    CIT_MONTHS_AFTER_FY_END: 6,        // 6 months after FY-end (June 30 for calendar year)
    VAT_MONTHLY_DAY: 21,               // 21st of following month
    PAYE_MONTHLY_DAY: 10,              // 10th of following month
    WHT_MONTHLY_DAY: 21,               // 21st of following month
  },

  // ═══════════════════════════════════════════════════════════
  // PENALTIES
  // ═══════════════════════════════════════════════════════════
  PENALTIES: {
    LATE_FILING_FIRST_MONTH: 100_000,  // ₦100k first month
    LATE_FILING_SUBSEQUENT: 50_000,    // ₦50k per month after
    NIL_RETURNS_REQUIRED: true,        // Must file even at ₦0
  },

  // ═══════════════════════════════════════════════════════════
  // PRESUMPTIVE TAX — NTA s29 + Presumptive Tax Regulations 2026
  // ═══════════════════════════════════════════════════════════
  PRESUMPTIVE: {
    NANO_EXEMPT_TURNOVER: 12_000_000,  // ≤₦12M fully exempt
    RATE_ABOVE_EXEMPT: 1,              // ~1% on turnover above ₦12M (flag only)
    SCOPE: 'INFORMAL_SECTOR_INADEQUATE_RECORDS' as const,
  },

  PROFESSIONAL_SERVICES_EXCLUSION: 'REVIEW_REQUIRED' as const,
} as const;

export type LegalStructureOption = 'UNREGISTERED' | 'BUSINESS_NAME' | 'LLC';
export type AnnualTurnoverOption = 'UNDER_25M' | 'M25M_TO_50M' | 'M50M_TO_100M' | 'ABOVE_100M' | 'UNKNOWN';
export type FixedAssetsOption = 'UNDER_250M' | 'ABOVE_250M';
export type BusinessTypeOption = 'STANDARD' | 'PROFESSIONAL' | 'TECH_SOFTWARE' | 'AGRICULTURE' | 'REGULATED_FINANCIAL' | 'OTHER';

export interface QuizAnswers {
  // Q1: Legal Structure
  legalStructure: LegalStructureOption;
  // Q2: Annual Turnover
  annualTurnover: AnnualTurnoverOption;
  // Q3: Fixed Assets Value
  fixedAssetsValue: FixedAssetsOption;
  // Q4: Business Type
  businessType: BusinessTypeOption;
  businessTypeOther?: string;
  // Q5: Employees earning above ₦800,000/year (₦66,667/month)
  hasEmployeesAbove800k: boolean;
  // Q6: Multiple state presence
  isMultiState: boolean;
  // Q7: Digital assets trading
  hasDigitalAssets: boolean;
  // Q8: 100% export-oriented
  isExportOriented: boolean;
  // Q9: Corporate clients deducting WHT
  hasCorporateClientsWithWHT: boolean;
  // Q10: Free trade zone
  isInFreeTradeZone: boolean;
}

export interface TaxProfileConfiguration {
  // VAT Configuration
  vatExempt: boolean;
  mustChargeVat: boolean;

  // Income Tax Configuration
  isCorporate: boolean;
  incomeTaxType: 'PIT' | 'CIT';
  citRate: 0 | 30;
  devLevyRate: 0 | 4;

  // Employee Tax (PAYE)
  mustDeductPAYE: boolean;
  mustSplitPAYEByState: boolean;

  // Withholding Tax
  mustDeductWHT: boolean;
  whtTransactionExemptionLimit: number | null;
  enableWHTCreditTracking: boolean;

  // Capital Gains Tax
  cgtTreatment: 'EXEMPT_SMALL_COMPANY_0_PCT' | 'COMPANY_30_PCT' | 'INDIVIDUAL_PROGRESSIVE_PIT';

  // Special Incentives
  hasAgricultureHoliday: boolean;
  hasExportExemption: boolean;
  isFtzExempt: boolean;

  // Filing Requirements
  primaryTaxAuthority: 'NRS_FEDERAL' | 'SIRS_STATE';
  filingDeadline: Date;
  requiresNilReturns: boolean;

  // Manual Review Flags
  needsManualReview: boolean;
  reviewReasons: string[];
}
