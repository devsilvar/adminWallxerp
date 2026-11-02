import { evaluateTaxConfig, STATUTORY_TAX_CONSTANTS, QuizAnswers } from '@/shared/tax-quiz-engine';

describe('Tax Quiz Engine — Unit Tests (Phase 1)', () => {
  const baseAnswers: QuizAnswers = {
    legalStructure: 'LLC',
    annualTurnover: 'UNDER_25M',
    fixedAssetsValue: 'UNDER_250M',
    businessType: 'STANDARD',
    hasEmployeesAbove800k: false,
    isMultiState: false,
    hasDigitalAssets: false,
    isExportOriented: false,
    hasCorporateClientsWithWHT: false,
    isInFreeTradeZone: false,
  };

  describe('Priority 1: Free Trade Zone Exemption', () => {
    it('grants complete tax exemption for FTZ businesses regardless of turnover or assets', () => {
      const config = evaluateTaxConfig({
        ...baseAnswers,
        isInFreeTradeZone: true,
        annualTurnover: 'ABOVE_100M',
        fixedAssetsValue: 'ABOVE_250M',
        hasEmployeesAbove800k: true,
      });

      expect(config.isFtzExempt).toBe(true);
      expect(config.vatExempt).toBe(true);
      expect(config.citRate).toBe(0);
      expect(config.devLevyRate).toBe(0);
      expect(config.requiresNilReturns).toBe(false);
      expect(config.reviewReasons).toContain(
        'Complete tax exemption: Business operates in a licensed Free Trade Zone (FTZ)'
      );
    });
  });

  describe('Priority 2: Legal Structure & Tax Authority', () => {
    it('classifies LLC as Corporate subject to NRS Federal CIT with June 30 deadline', () => {
      const config = evaluateTaxConfig({
        ...baseAnswers,
        legalStructure: 'LLC',
      });

      expect(config.isCorporate).toBe(true);
      expect(config.incomeTaxType).toBe('CIT');
      expect(config.primaryTaxAuthority).toBe('NRS_FEDERAL');
      expect(config.filingDeadline.getUTCMonth()).toBe(5); // June (0-indexed)
      expect(config.filingDeadline.getUTCDate()).toBe(30);
    });

    it('classifies Business Name / Sole Proprietor as PIT subject to State IRS with March 31 deadline', () => {
      const config = evaluateTaxConfig({
        ...baseAnswers,
        legalStructure: 'BUSINESS_NAME',
      });

      expect(config.isCorporate).toBe(false);
      expect(config.incomeTaxType).toBe('PIT');
      expect(config.primaryTaxAuthority).toBe('SIRS_STATE');
      expect(config.filingDeadline.getUTCMonth()).toBe(2); // March (0-indexed)
      expect(config.filingDeadline.getUTCDate()).toBe(31);
    });

    it('classifies Unregistered Freelancer as PIT subject to State IRS with March 31 deadline', () => {
      const config = evaluateTaxConfig({
        ...baseAnswers,
        legalStructure: 'UNREGISTERED',
      });

      expect(config.isCorporate).toBe(false);
      expect(config.incomeTaxType).toBe('PIT');
      expect(config.primaryTaxAuthority).toBe('SIRS_STATE');
    });
  });

  describe('Priority 3: VAT Exemption Threshold (₦25,000,000)', () => {
    it('exempts business with turnover under ₦25M from charging VAT', () => {
      const config = evaluateTaxConfig({
        ...baseAnswers,
        annualTurnover: 'UNDER_25M',
      });

      expect(config.vatExempt).toBe(true);
      expect(config.mustChargeVat).toBe(false);
    });

    it('requires 7.5% VAT when turnover is between ₦25M and ₦50M', () => {
      const config = evaluateTaxConfig({
        ...baseAnswers,
        annualTurnover: 'M25M_TO_50M',
      });

      expect(config.vatExempt).toBe(false);
      expect(config.mustChargeVat).toBe(true);
    });

    it('requires 7.5% VAT when turnover is between ₦50M and ₦100M', () => {
      const config = evaluateTaxConfig({
        ...baseAnswers,
        annualTurnover: 'M50M_TO_100M',
      });

      expect(config.vatExempt).toBe(false);
      expect(config.mustChargeVat).toBe(true);
    });

    it('requires 7.5% VAT when turnover is above ₦100M', () => {
      const config = evaluateTaxConfig({
        ...baseAnswers,
        annualTurnover: 'ABOVE_100M',
      });

      expect(config.vatExempt).toBe(false);
      expect(config.mustChargeVat).toBe(true);
    });
  });

  describe('Priority 4: Small Company 0% CIT (₦100M Turnover + ₦250M Assets)', () => {
    it('applies 0% CIT and 0% Dev Levy when turnover is under ₦25M and assets ≤₦250M', () => {
      const config = evaluateTaxConfig({
        ...baseAnswers,
        legalStructure: 'LLC',
        annualTurnover: 'UNDER_25M',
        fixedAssetsValue: 'UNDER_250M',
        businessType: 'STANDARD',
      });

      expect(config.citRate).toBe(0);
      expect(config.devLevyRate).toBe(0);
    });

    it('applies 0% CIT when turnover is ₦25M-₦50M and assets ≤₦250M', () => {
      const config = evaluateTaxConfig({
        ...baseAnswers,
        legalStructure: 'LLC',
        annualTurnover: 'M25M_TO_50M',
        fixedAssetsValue: 'UNDER_250M',
        businessType: 'STANDARD',
      });

      expect(config.citRate).toBe(0);
      expect(config.devLevyRate).toBe(0);
    });

    it('applies 0% CIT when turnover is ₦50M-₦100M (statutory limit) and assets ≤₦250M', () => {
      const config = evaluateTaxConfig({
        ...baseAnswers,
        legalStructure: 'LLC',
        annualTurnover: 'M50M_TO_100M',
        fixedAssetsValue: 'UNDER_250M',
        businessType: 'STANDARD',
      });

      expect(config.citRate).toBe(0);
      expect(config.devLevyRate).toBe(0);
    });

    it('applies 30% CIT + 4% Dev Levy when turnover exceeds ₦100M', () => {
      const config = evaluateTaxConfig({
        ...baseAnswers,
        legalStructure: 'LLC',
        annualTurnover: 'ABOVE_100M',
        fixedAssetsValue: 'UNDER_250M',
      });

      expect(config.citRate).toBe(30);
      expect(config.devLevyRate).toBe(4);
    });

    it('applies 30% CIT + 4% Dev Levy when fixed assets exceed ₦250M even with low turnover', () => {
      const config = evaluateTaxConfig({
        ...baseAnswers,
        legalStructure: 'LLC',
        annualTurnover: 'UNDER_25M',
        fixedAssetsValue: 'ABOVE_250M',
      });

      expect(config.citRate).toBe(30);
      expect(config.devLevyRate).toBe(4);
    });

    it('excludes professional services from 0% CIT and flags for review', () => {
      const config = evaluateTaxConfig({
        ...baseAnswers,
        legalStructure: 'LLC',
        annualTurnover: 'UNDER_25M',
        fixedAssetsValue: 'UNDER_250M',
        businessType: 'PROFESSIONAL',
      });

      expect(config.citRate).toBe(30);
      expect(config.devLevyRate).toBe(4);
      expect(config.needsManualReview).toBe(true);
    });

    it('excludes regulated financial businesses from 0% CIT', () => {
      const config = evaluateTaxConfig({
        ...baseAnswers,
        legalStructure: 'LLC',
        annualTurnover: 'UNDER_25M',
        fixedAssetsValue: 'UNDER_250M',
        businessType: 'REGULATED_FINANCIAL',
      });

      expect(config.citRate).toBe(30);
      expect(config.devLevyRate).toBe(4);
    });

    it('flags tech/software businesses for review queue verification', () => {
      const config = evaluateTaxConfig({
        ...baseAnswers,
        legalStructure: 'LLC',
        businessType: 'TECH_SOFTWARE',
      });

      expect(config.needsManualReview).toBe(true);
      expect(config.citRate).toBe(0); // Eligible under standard small company rule unless excluded on review
    });
  });

  describe('Priority 5: Agriculture Holiday', () => {
    it('applies 5-year 0% CIT holiday for agricultural businesses', () => {
      const config = evaluateTaxConfig({
        ...baseAnswers,
        legalStructure: 'LLC',
        businessType: 'AGRICULTURE',
        annualTurnover: 'ABOVE_100M', // Even if large turnover
      });

      expect(config.hasAgricultureHoliday).toBe(true);
      expect(config.citRate).toBe(0);
      expect(config.devLevyRate).toBe(0);
    });
  });

  describe('Priority 6: Export Exemption', () => {
    it('flags export exemption when 100% export oriented', () => {
      const config = evaluateTaxConfig({
        ...baseAnswers,
        isExportOriented: true,
      });

      expect(config.hasExportExemption).toBe(true);
    });
  });

  describe('Priority 7: Employee Tax (PAYE)', () => {
    it('triggers PAYE when staff earn above ₦800,000/year', () => {
      const config = evaluateTaxConfig({
        ...baseAnswers,
        hasEmployeesAbove800k: true,
        isMultiState: false,
      });

      expect(config.mustDeductPAYE).toBe(true);
      expect(config.mustSplitPAYEByState).toBe(false);
    });

    it('triggers multi-state split when operating in multiple states', () => {
      const config = evaluateTaxConfig({
        ...baseAnswers,
        hasEmployeesAbove800k: true,
        isMultiState: true,
      });

      expect(config.mustDeductPAYE).toBe(true);
      expect(config.mustSplitPAYEByState).toBe(true);
    });

    it('does not require PAYE when all staff earn below threshold or no staff', () => {
      const config = evaluateTaxConfig({
        ...baseAnswers,
        hasEmployeesAbove800k: false,
      });

      expect(config.mustDeductPAYE).toBe(false);
    });
  });

  describe('Priority 8: Withholding Tax (WHT) & Credit Tracking', () => {
    it('enables WHT credit tracking when corporate clients deduct WHT', () => {
      const config = evaluateTaxConfig({
        ...baseAnswers,
        hasCorporateClientsWithWHT: true,
      });

      expect(config.enableWHTCreditTracking).toBe(true);
    });

    it('applies ₦2M transaction exemption floor for small company with ₦25M-₦50M turnover', () => {
      const config = evaluateTaxConfig({
        ...baseAnswers,
        annualTurnover: 'M25M_TO_50M',
        fixedAssetsValue: 'UNDER_250M',
      });

      expect(config.mustDeductWHT).toBe(true);
      expect(config.whtTransactionExemptionLimit).toBe(STATUTORY_TAX_CONSTANTS.WHT.SMALL_COMPANY_EXEMPTION.TRANSACTION_FLOOR);
    });

    it('does not require business under ₦25M to deduct WHT', () => {
      const config = evaluateTaxConfig({
        ...baseAnswers,
        annualTurnover: 'UNDER_25M',
      });

      expect(config.mustDeductWHT).toBe(false);
    });
  });

  describe('Priority 9: Digital Assets Capital Gains Tax', () => {
    it('applies small company 0% CGT for eligible small companies', () => {
      const config = evaluateTaxConfig({
        ...baseAnswers,
        legalStructure: 'LLC',
        annualTurnover: 'UNDER_25M',
        hasDigitalAssets: true,
      });

      expect(config.cgtTreatment).toBe('EXEMPT_SMALL_COMPANY_0_PCT');
    });

    it('applies 30% CGT for large corporate entities', () => {
      const config = evaluateTaxConfig({
        ...baseAnswers,
        legalStructure: 'LLC',
        annualTurnover: 'ABOVE_100M',
        hasDigitalAssets: true,
      });

      expect(config.cgtTreatment).toBe('COMPANY_30_PCT');
    });

    it('applies individual progressive PIT rates for unincorporated businesses', () => {
      const config = evaluateTaxConfig({
        ...baseAnswers,
        legalStructure: 'BUSINESS_NAME',
        hasDigitalAssets: true,
      });

      expect(config.cgtTreatment).toBe('INDIVIDUAL_PROGRESSIVE_PIT');
    });
  });

  describe('Priority 10: Manual Review Triggers', () => {
    it('flags profile for manual review when turnover is UNKNOWN', () => {
      const config = evaluateTaxConfig({
        ...baseAnswers,
        annualTurnover: 'UNKNOWN',
      });

      expect(config.needsManualReview).toBe(true);
      expect(config.reviewReasons.some((r) => r.includes('turnover unknown'))).toBe(true);
    });

    it('flags profile for manual review when businessType is OTHER with description', () => {
      const config = evaluateTaxConfig({
        ...baseAnswers,
        businessType: 'OTHER',
        businessTypeOther: 'Cryptocurrency Arbitrage Mining',
      });

      expect(config.needsManualReview).toBe(true);
      expect(config.reviewReasons.some((r) => r.includes('Cryptocurrency Arbitrage Mining'))).toBe(true);
    });
  });
});
