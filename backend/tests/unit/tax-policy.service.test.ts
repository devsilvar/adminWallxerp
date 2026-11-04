import { describe, it, expect, beforeEach, jest } from '@jest/globals';

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
import logger from '@/lib/logger';
import config from '@/config';
import { resolveTaxPolicy } from '@/services/tax/tax-policy.service';
import { evaluateTaxConfig } from '@/shared/tax-quiz-engine';

describe('Tax Policy Resolver — Unit Tests', () => {
  const businessId = 'biz_test_resolver_123';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('resolves scenario 1: UNDER_25M LLC as VAT exempt and 0% CIT', async () => {
    const configData = evaluateTaxConfig({
      legalStructure: 'LLC',
      annualTurnover: 'UNDER_25M',
      fixedAssetsValue: 'UNDER_250M',
      businessType: 'STANDARD',
      hasEmployeesAbove800k: false,
      hasExemptSupplies: false,
      isExportOriented: false,
      hasPioneerStatus: false,
      isAgriculturalBusiness: false,
      isInFreeTradeZone: false,
    });

    (prisma.businessTaxProfile.findUnique as any).mockResolvedValue({
      businessId,
      completedAt: new Date(),
      computedConfig: configData,
    });

    const policy = await resolveTaxPolicy(businessId);

    expect(policy.source).toBe('PROFILE');
    expect(policy.vat.chargeable).toBe(false);
    expect(policy.vat.rate).toBe(0);
    expect(policy.vat.reason).toMatch(/VAT Exempt/i);
    expect(policy.incomeTax).toEqual({
      type: 'CIT',
      rate: 0,
      devLevyRate: 0,
    });
  });

  it('resolves scenario 2: M50M_TO_100M LLC as VAT chargeable and 0% small-company CIT', async () => {
    const configData = evaluateTaxConfig({
      legalStructure: 'LLC',
      annualTurnover: 'M50M_TO_100M',
      fixedAssetsValue: 'UNDER_250M',
      businessType: 'STANDARD',
      hasEmployeesAbove800k: false,
      hasExemptSupplies: false,
      isExportOriented: false,
      hasPioneerStatus: false,
      isAgriculturalBusiness: false,
      isInFreeTradeZone: false,
    });

    (prisma.businessTaxProfile.findUnique as any).mockResolvedValue({
      businessId,
      completedAt: new Date(),
      computedConfig: configData,
    });

    const policy = await resolveTaxPolicy(businessId);

    expect(policy.source).toBe('PROFILE');
    expect(policy.vat.chargeable).toBe(true);
    expect(policy.vat.rate).toBe(config.tax.defaultRate);
    expect(policy.incomeTax).toEqual({
      type: 'CIT',
      rate: 0,
      devLevyRate: 0,
    });
  });

  it('resolves scenario 3: ABOVE_100M LLC as VAT chargeable and 30% CIT + 4% Development Levy', async () => {
    const configData = evaluateTaxConfig({
      legalStructure: 'LLC',
      annualTurnover: 'ABOVE_100M',
      fixedAssetsValue: 'UNDER_250M',
      businessType: 'STANDARD',
      hasEmployeesAbove800k: false,
      hasExemptSupplies: false,
      isExportOriented: false,
      hasPioneerStatus: false,
      isAgriculturalBusiness: false,
      isInFreeTradeZone: false,
    });

    (prisma.businessTaxProfile.findUnique as any).mockResolvedValue({
      businessId,
      completedAt: new Date(),
      computedConfig: configData,
    });

    const policy = await resolveTaxPolicy(businessId);

    expect(policy.source).toBe('PROFILE');
    expect(policy.vat.chargeable).toBe(true);
    expect(policy.vat.rate).toBe(config.tax.defaultRate);
    expect(policy.incomeTax).toEqual({
      type: 'CIT',
      rate: 30,
      devLevyRate: 4,
    });
  });

  it('resolves scenario 4: Sole Proprietor (UNDER_25M) as PIT and VAT exempt', async () => {
    const configData = evaluateTaxConfig({
      legalStructure: 'SOLE_PROPRIETORSHIP',
      annualTurnover: 'UNDER_25M',
      fixedAssetsValue: 'UNDER_250M',
      businessType: 'STANDARD',
      hasEmployeesAbove800k: false,
      hasExemptSupplies: false,
      isExportOriented: false,
      hasPioneerStatus: false,
      isAgriculturalBusiness: false,
      isInFreeTradeZone: false,
    });

    (prisma.businessTaxProfile.findUnique as any).mockResolvedValue({
      businessId,
      completedAt: new Date(),
      computedConfig: configData,
    });

    const policy = await resolveTaxPolicy(businessId);

    expect(policy.source).toBe('PROFILE');
    expect(policy.vat.chargeable).toBe(false);
    expect(policy.vat.rate).toBe(0);
    expect(policy.incomeTax).toEqual({
      type: 'PIT',
      rate: 0,
      devLevyRate: 0,
    });
  });

  it('resolves scenario 5: Business with no profile returns DEFAULT policy reproducing current behavior', async () => {
    (prisma.businessTaxProfile.findUnique as any).mockResolvedValue(null);

    const policy = await resolveTaxPolicy(businessId);

    expect(policy.source).toBe('DEFAULT');
    expect(policy.vat.chargeable).toBe(true);
    expect(policy.vat.rate).toBe(config.tax.defaultRate);
    expect(policy.vat.reason).toBeNull();
    expect(policy.incomeTax).toEqual({
      type: 'CIT',
      rate: config.tax.defaultRate,
      devLevyRate: 0,
    });
  });

  it('resolves profile with null completedAt as DEFAULT policy', async () => {
    (prisma.businessTaxProfile.findUnique as any).mockResolvedValue({
      businessId,
      completedAt: null,
      computedConfig: { vatExempt: true },
    });

    const policy = await resolveTaxPolicy(businessId);

    expect(policy.source).toBe('DEFAULT');
    expect(policy.vat.chargeable).toBe(true);
    expect(policy.vat.rate).toBe(config.tax.defaultRate);
  });

  it('resolves profile with empty computedConfig as DEFAULT policy', async () => {
    (prisma.businessTaxProfile.findUnique as any).mockResolvedValue({
      businessId,
      completedAt: new Date(),
      computedConfig: {},
    });

    const policy = await resolveTaxPolicy(businessId);

    expect(policy.source).toBe('DEFAULT');
    expect(policy.vat.chargeable).toBe(true);
    expect(policy.vat.rate).toBe(config.tax.defaultRate);
  });

  it('normalises legacy inconsistent rows (vatExempt: false, mustChargeVat: false) as not chargeable and logs warning', async () => {
    (prisma.businessTaxProfile.findUnique as any).mockResolvedValue({
      businessId,
      completedAt: new Date(),
      computedConfig: {
        vatExempt: false,
        mustChargeVat: false,
        incomeTaxType: 'CIT',
        citRate: 0,
        devLevyRate: 0,
      },
    });

    const policy = await resolveTaxPolicy(businessId);

    expect(policy.source).toBe('PROFILE');
    expect(policy.vat.chargeable).toBe(false);
    expect(policy.vat.rate).toBe(0);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Legacy inconsistent tax profile detected'),
      { businessId }
    );
  });

  // ────────────────────────────────────────────────────────────────────────────
  // TAX-20: Advisory labels for taxes with no in-app workflow
  // ────────────────────────────────────────────────────────────────────────────
  describe('TAX-20: advisories field in resolved policy', () => {
    it('DEFAULT policy always returns empty advisories array', async () => {
      (prisma.businessTaxProfile.findUnique as any).mockResolvedValue(null);

      const policy = await resolveTaxPolicy(businessId);

      expect(policy.advisories).toEqual([]);
    });

    it('PAYE advisory included when mustDeductPAYE is true', async () => {
      (prisma.businessTaxProfile.findUnique as any).mockResolvedValue({
        businessId,
        completedAt: new Date(),
        computedConfig: {
          vatExempt: false,
          mustChargeVat: true,
          incomeTaxType: 'CIT',
          citRate: 0,
          devLevyRate: 0,
          mustDeductPAYE: true,
          mustDeductWHT: false,
        },
      });

      const policy = await resolveTaxPolicy(businessId);

      expect(policy.advisories).toHaveLength(1);
      expect(policy.advisories[0]).toMatch(/PAYE Advisory/);
      expect(policy.advisories[0]).toMatch(/10th of each month/);
    });

    it('WHT advisory included when mustDeductWHT is true', async () => {
      (prisma.businessTaxProfile.findUnique as any).mockResolvedValue({
        businessId,
        completedAt: new Date(),
        computedConfig: {
          vatExempt: false,
          mustChargeVat: true,
          incomeTaxType: 'CIT',
          citRate: 0,
          devLevyRate: 0,
          mustDeductPAYE: false,
          mustDeductWHT: true,
          whtTransactionExemptionLimit: 2_000_000,
        },
      });

      const policy = await resolveTaxPolicy(businessId);

      expect(policy.advisories).toHaveLength(1);
      expect(policy.advisories[0]).toMatch(/WHT Advisory/);
      expect(policy.advisories[0]).toMatch(/21st of the following month/);
      expect(policy.advisories[0]).toMatch(/2,000,000/); // exemption limit mentioned
    });

    it('WHT advisory without exemption limit when whtTransactionExemptionLimit is null', async () => {
      (prisma.businessTaxProfile.findUnique as any).mockResolvedValue({
        businessId,
        completedAt: new Date(),
        computedConfig: {
          vatExempt: false,
          mustChargeVat: true,
          incomeTaxType: 'CIT',
          citRate: 30,
          devLevyRate: 4,
          mustDeductPAYE: false,
          mustDeductWHT: true,
          whtTransactionExemptionLimit: null,
        },
      });

      const policy = await resolveTaxPolicy(businessId);

      const whtAdvisory = policy.advisories.find((a) => a.includes('WHT Advisory'));
      expect(whtAdvisory).toBeDefined();
      expect(whtAdvisory).not.toMatch(/per vendor are exempt/);
    });

    it('CIT annual filing advisory included when CIT rate > 0', async () => {
      (prisma.businessTaxProfile.findUnique as any).mockResolvedValue({
        businessId,
        completedAt: new Date(),
        computedConfig: {
          vatExempt: false,
          mustChargeVat: true,
          incomeTaxType: 'CIT',
          citRate: 30,
          devLevyRate: 4,
          mustDeductPAYE: false,
          mustDeductWHT: false,
        },
      });

      const policy = await resolveTaxPolicy(businessId);

      const citAdvisory = policy.advisories.find((a) => a.includes('CIT Annual Filing'));
      expect(citAdvisory).toBeDefined();
      expect(citAdvisory).toMatch(/30% Corporate Income Tax/);
      expect(citAdvisory).toMatch(/Capital Gains Tax/);
    });

    it('no CIT advisory when CIT rate is 0 (small company exempt)', async () => {
      (prisma.businessTaxProfile.findUnique as any).mockResolvedValue({
        businessId,
        completedAt: new Date(),
        computedConfig: {
          vatExempt: true,
          mustChargeVat: false,
          incomeTaxType: 'CIT',
          citRate: 0,
          devLevyRate: 0,
          mustDeductPAYE: false,
          mustDeductWHT: false,
        },
      });

      const policy = await resolveTaxPolicy(businessId);

      const citAdvisory = policy.advisories.find((a) => a.includes('CIT Annual Filing'));
      expect(citAdvisory).toBeUndefined();
    });

    it('all three advisories present when business requires PAYE, WHT, and large CIT', async () => {
      (prisma.businessTaxProfile.findUnique as any).mockResolvedValue({
        businessId,
        completedAt: new Date(),
        computedConfig: {
          vatExempt: false,
          mustChargeVat: true,
          incomeTaxType: 'CIT',
          citRate: 30,
          devLevyRate: 4,
          mustDeductPAYE: true,
          mustDeductWHT: true,
          whtTransactionExemptionLimit: null,
        },
      });

      const policy = await resolveTaxPolicy(businessId);

      expect(policy.advisories).toHaveLength(3);
      expect(policy.advisories.some((a) => a.includes('PAYE Advisory'))).toBe(true);
      expect(policy.advisories.some((a) => a.includes('WHT Advisory'))).toBe(true);
      expect(policy.advisories.some((a) => a.includes('CIT Annual Filing'))).toBe(true);
    });

    it('PIT business with no PAYE/WHT obligations returns empty advisories', async () => {
      (prisma.businessTaxProfile.findUnique as any).mockResolvedValue({
        businessId,
        completedAt: new Date(),
        computedConfig: {
          vatExempt: true,
          mustChargeVat: false,
          incomeTaxType: 'PIT',
          citRate: 0,
          devLevyRate: 0,
          mustDeductPAYE: false,
          mustDeductWHT: false,
        },
      });

      const policy = await resolveTaxPolicy(businessId);

      expect(policy.advisories).toEqual([]);
    });
  });
});
