import { describe, it, expect, beforeEach, jest } from '@jest/globals';

// Mock dependencies
jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: {
    businessTaxProfile: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
      delete: jest.fn(),
      update: jest.fn(),
    },
    monthlyTaxReport: {
      findMany: jest.fn(),
      update: jest.fn(),
    },
    salesTransaction: {
      aggregate: jest.fn(),
    },
    business: {
      findUnique: jest.fn(),
    },
  },
}));

jest.mock('@/lib/ownership', () => ({
  verifyBusinessAccess: jest.fn(),
}));

jest.mock('@/lib/audit', () => ({
  logAudit: jest.fn(),
}));

jest.mock('@/lib/logger', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// Mock calculateTaxWithStrategy — returns predictable values
jest.mock('@/services/tax/tax-calculation-strategy', () => ({
  calculateTaxWithStrategy: jest.fn(),
}));

import prisma from '@/lib/prisma';
import { verifyBusinessAccess } from '@/lib/ownership';
import { logAudit } from '@/lib/audit';
import logger from '@/lib/logger';
import { calculateTaxWithStrategy } from '@/services/tax/tax-calculation-strategy';
import { AppError } from '@/middleware/errorHandler';
import * as taxProfileService from '@/services/tax/tax-profile.service';
import type { QuizAnswers } from '@/shared/tax-constants';

describe('Tax Profile Service — Unit Tests', () => {
  const userId = 'usr_test_123';
  const businessId = 'biz_test_456';

  const validAnswers: QuizAnswers = {
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

  beforeEach(() => {
    jest.clearAllMocks();
    (verifyBusinessAccess as any).mockResolvedValue({
      business: {
        id: businessId,
        businessName: 'Acme Traders LTD',
        ownerName: 'John Doe',
        taxId: '12345678-0001',
      },
    });

    // Default: no existing tax reports; no sales
    (prisma.monthlyTaxReport.findMany as any).mockResolvedValue([]);
    (prisma.salesTransaction.aggregate as any).mockResolvedValue({ _sum: { amount: null } });
    (prisma.businessTaxProfile.update as any).mockResolvedValue({});
  });

  describe('saveTaxProfile', () => {
    it('verifies tax.calculate permission, evaluates config, and upserts profile', async () => {
      const mockCreatedProfile = {
        id: 'prof_test_789',
        businessId,
        quizAnswers: validAnswers,
        computedConfig: {},
        completedAt: new Date(),
        needsManualReview: false,
        reviewReasons: [],
      };

      (prisma.businessTaxProfile.upsert as any).mockResolvedValue(mockCreatedProfile);
      (prisma.businessTaxProfile.findUnique as any).mockResolvedValue({
        completedAt: mockCreatedProfile.completedAt,
        computedConfig: {},
      });

      const result = await taxProfileService.saveTaxProfile(userId, businessId, validAnswers);

      expect(verifyBusinessAccess).toHaveBeenCalledWith(userId, businessId, 'tax.calculate');
      expect(prisma.businessTaxProfile.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { businessId },
        })
      );
      expect(logAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          userId,
          businessId,
          action: 'tax_profile.updated',
        })
      );
      expect(result.config.vatExempt).toBe(true);
      expect(result.config.citRate).toBe(0);
    });

    it('records the replaced config as oldData in the audit trail', async () => {
      const previousAnswers: QuizAnswers = { ...validAnswers, annualTurnover: 'ABOVE_100M' };
      const previousConfig = { citRate: 30, vatExempt: false };

      (prisma.businessTaxProfile.findUnique as any).mockResolvedValue({
        quizAnswers: previousAnswers,
        computedConfig: previousConfig,
      });
      (prisma.businessTaxProfile.upsert as any).mockResolvedValue({
        id: 'prof_test_790',
        businessId,
        quizAnswers: validAnswers,
        computedConfig: {},
        completedAt: new Date(),
        needsManualReview: false,
        reviewReasons: [],
      });

      await taxProfileService.saveTaxProfile(userId, businessId, validAnswers);

      expect(logAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'tax_profile.updated',
          oldData: { answers: previousAnswers, config: previousConfig },
        })
      );
    });
  });

  describe('getTaxProfile', () => {
    it('verifies tax.read permission and returns existing profile', async () => {
      const mockProfile = {
        id: 'prof_test_789',
        businessId,
        quizAnswers: validAnswers,
        computedConfig: {},
        completedAt: new Date(),
        lastReviewedAt: null,
        needsManualReview: false,
        reviewReasons: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (prisma.businessTaxProfile.findUnique as any).mockResolvedValue(mockProfile);

      const profile = await taxProfileService.getTaxProfile(userId, businessId);

      expect(verifyBusinessAccess).toHaveBeenCalledWith(userId, businessId, 'tax.read');
      expect(profile).toEqual(mockProfile);
    });

    it('returns null if business has not taken the quiz', async () => {
      (prisma.businessTaxProfile.findUnique as any).mockResolvedValue(null);

      const profile = await taxProfileService.getTaxProfile(userId, businessId);

      expect(profile).toBeNull();
    });
  });

  describe('getTaxPolicy', () => {
    it('verifies tax.read permission and returns the resolved policy', async () => {
      (prisma.businessTaxProfile.findUnique as any).mockResolvedValue(null);

      const policy = await taxProfileService.getTaxPolicy(userId, businessId);

      expect(verifyBusinessAccess).toHaveBeenCalledWith(userId, businessId, 'tax.read');
      expect(policy.source).toBe('DEFAULT');
      expect(policy.vat.chargeable).toBe(true);
    });

    it('propagates the 403 when the user lacks tax.read', async () => {
      (verifyBusinessAccess as any).mockRejectedValue(
        new AppError(403, 'You do not have permission to perform this action', 'PERMISSION_DENIED')
      );

      await expect(taxProfileService.getTaxPolicy(userId, businessId)).rejects.toMatchObject({
        statusCode: 403,
        code: 'PERMISSION_DENIED',
      });
      expect(prisma.businessTaxProfile.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('deleteTaxProfile', () => {
    it('deletes existing profile and writes audit log', async () => {
      const mockExisting = { id: 'prof_test_789', businessId };
      (prisma.businessTaxProfile.findUnique as any).mockResolvedValue(mockExisting);
      (prisma.businessTaxProfile.delete as any).mockResolvedValue(mockExisting);

      const deleted = await taxProfileService.deleteTaxProfile(userId, businessId);

      expect(verifyBusinessAccess).toHaveBeenCalledWith(userId, businessId, 'tax.calculate');
      expect(prisma.businessTaxProfile.delete).toHaveBeenCalledWith({ where: { businessId } });
      expect(logAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          userId,
          businessId,
          action: 'tax_profile.deleted',
        })
      );
      expect(deleted).toEqual(mockExisting);
    });

    it('throws 404 AppError if profile to delete does not exist', async () => {
      (prisma.businessTaxProfile.findUnique as any).mockResolvedValue(null);

      await expect(taxProfileService.deleteTaxProfile(userId, businessId)).rejects.toThrow(
        'Tax profile not found for this business'
      );
    });
  });

  describe('getObligationReportPdf', () => {
    it('generates a valid PDF buffer for completed profile', async () => {
      const mockProfile = {
        id: 'prof_test_789',
        businessId,
        quizAnswers: validAnswers,
        computedConfig: {
          vatExempt: true,
          mustChargeVat: false,
          isCorporate: true,
          incomeTaxType: 'CIT',
          citRate: 0,
          devLevyRate: 0,
          primaryTaxAuthority: 'NRS_FEDERAL',
          mustDeductPAYE: false,
          mustSplitPAYEByState: false,
          mustDeductWHT: false,
          whtTransactionExemptionLimit: null,
          enableWHTCreditTracking: false,
          cgtTreatment: 'EXEMPT_SMALL_COMPANY_0_PCT',
          hasAgricultureHoliday: false,
          hasExportExemption: false,
          isFtzExempt: false,
          filingDeadline: new Date(),
          requiresNilReturns: true,
          needsManualReview: false,
          reviewReasons: [],
        },
        completedAt: new Date(),
      };

      (prisma.businessTaxProfile.findUnique as any).mockResolvedValue(mockProfile);

      const pdfBuffer = await taxProfileService.getObligationReportPdf(userId, businessId);

      expect(Buffer.isBuffer(pdfBuffer)).toBe(true);
      expect(pdfBuffer.length).toBeGreaterThan(100);
      // Verify PDF header magic bytes "%PDF-"
      expect(pdfBuffer.subarray(0, 4).toString()).toBe('%PDF');
    });

    it('throws 404 AppError if requesting PDF before taking quiz', async () => {
      (prisma.businessTaxProfile.findUnique as any).mockResolvedValue(null);

      await expect(taxProfileService.getObligationReportPdf(userId, businessId)).rejects.toThrow(
        'Tax profile not found'
      );
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TAX-18: Recalculate unlocked reports after profile save
  // ──────────────────────────────────────────────────────────────────────────
  describe('TAX-18: recalculateUnlockedReports (via saveTaxProfile)', () => {
    const savedProfile = {
      id: 'prof_18_abc',
      businessId,
      completedAt: new Date(),
      needsManualReview: false,
      reviewReasons: [],
    };
    const freshProfile = { completedAt: savedProfile.completedAt, computedConfig: {} };

    beforeEach(() => {
      (prisma.businessTaxProfile.upsert as any).mockResolvedValue(savedProfile);
      (prisma.businessTaxProfile.findUnique as any).mockResolvedValue(freshProfile);
      (prisma.salesTransaction.aggregate as any).mockResolvedValue({ _sum: { amount: null } });
    });

    it('recalculates unlocked reports when tax payable has changed', async () => {
      const report = {
        id: 'report_001',
        taxMonth: new Date(Date.UTC(new Date().getFullYear(), 0, 1)), // Jan this year
        totalSales: 1_000_000,
        totalExpenses: 400_000,
        grossProfit: 600_000,
        taxPayable: 45_000,    // old: 7.5% of 600k
        taxRate: 7.5,
        isLocked: false,
      };

      (prisma.monthlyTaxReport.findMany as any).mockResolvedValue([report]);
      (calculateTaxWithStrategy as any).mockResolvedValue({
        taxPayable: 0,   // now exempt
        taxRate: 0,
        grossProfit: 600_000,
        strategyUsed: 'PROFILED',
      });
      (prisma.monthlyTaxReport.update as any).mockResolvedValue({});

      await taxProfileService.saveTaxProfile(userId, businessId, validAnswers);

      expect(prisma.monthlyTaxReport.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'report_001' },
          data: { taxPayable: 0, taxRate: 0 },
        })
      );
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('[TAX-18] Unlocked report recalculated after profile save'),
        expect.objectContaining({ oldPayable: 45_000, newPayable: 0 })
      );
    });

    it('skips update when tax payable has not materially changed', async () => {
      const report = {
        id: 'report_002',
        taxMonth: new Date(Date.UTC(new Date().getFullYear(), 0, 1)),
        totalSales: 1_000_000,
        totalExpenses: 400_000,
        grossProfit: 600_000,
        taxPayable: 45_000,
        taxRate: 7.5,
        isLocked: false,
      };

      (prisma.monthlyTaxReport.findMany as any).mockResolvedValue([report]);
      (calculateTaxWithStrategy as any).mockResolvedValue({
        taxPayable: 45_000, // identical — no change
        taxRate: 7.5,
        grossProfit: 600_000,
        strategyUsed: 'LEGACY',
      });

      await taxProfileService.saveTaxProfile(userId, businessId, validAnswers);

      expect(prisma.monthlyTaxReport.update).not.toHaveBeenCalled();
    });

    it('skips locked reports and logs audit entry without updating', async () => {
      const lockedReport = {
        id: 'report_locked',
        taxMonth: new Date(Date.UTC(new Date().getFullYear(), 0, 1)),
        totalSales: 500_000,
        totalExpenses: 200_000,
        grossProfit: 300_000,
        taxPayable: 22_500,
        taxRate: 7.5,
        isLocked: true,
      };

      (prisma.monthlyTaxReport.findMany as any).mockResolvedValue([lockedReport]);

      await taxProfileService.saveTaxProfile(userId, businessId, validAnswers);

      // Must NOT update locked report
      expect(prisma.monthlyTaxReport.update).not.toHaveBeenCalled();
      // Must log the skip for audit
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('[TAX-18] Skipping locked report (audit only)'),
        expect.objectContaining({ reportId: 'report_locked' })
      );
    });

    it('handles zero reports gracefully (no crash)', async () => {
      (prisma.monthlyTaxReport.findMany as any).mockResolvedValue([]);

      await expect(
        taxProfileService.saveTaxProfile(userId, businessId, validAnswers)
      ).resolves.not.toThrow();

      expect(prisma.monthlyTaxReport.update).not.toHaveBeenCalled();
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TAX-19: Trailing-12-Month Turnover vs Declared Band
  // ──────────────────────────────────────────────────────────────────────────
  describe('TAX-19: checkT12mTurnoverParity (via saveTaxProfile)', () => {
    const savedProfile = {
      id: 'prof_19_abc',
      businessId,
      completedAt: new Date(),
      needsManualReview: false,
      reviewReasons: [],
    };

    beforeEach(() => {
      (prisma.businessTaxProfile.upsert as any).mockResolvedValue(savedProfile);
      (prisma.businessTaxProfile.findUnique as any).mockResolvedValue({
        completedAt: savedProfile.completedAt,
        computedConfig: {},
      });
      (prisma.monthlyTaxReport.findMany as any).mockResolvedValue([]);
    });

    it('sets needsManualReview when T12M exceeds ₦25M for UNDER_25M band', async () => {
      // Business declared UNDER_25M but actually earned ₦30M
      (prisma.salesTransaction.aggregate as any).mockResolvedValue({
        _sum: { amount: 30_000_000 },
      });

      await taxProfileService.saveTaxProfile(userId, businessId, {
        ...validAnswers,
        annualTurnover: 'UNDER_25M',
      });

      expect(prisma.businessTaxProfile.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { businessId },
          data: expect.objectContaining({
            needsManualReview: true,
            reviewReasons: expect.objectContaining({ push: expect.stringContaining('TAX-19') }),
          }),
        })
      );
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('[TAX-19] T12M turnover crosses declared band threshold'),
        expect.objectContaining({ declaredBand: 'UNDER_25M', t12mTotal: 30_000_000 })
      );
    });

    it('does NOT set needsManualReview when T12M is within the declared band', async () => {
      // Business declared UNDER_25M and actually earned ₦10M — within band
      (prisma.salesTransaction.aggregate as any).mockResolvedValue({
        _sum: { amount: 10_000_000 },
      });

      await taxProfileService.saveTaxProfile(userId, businessId, {
        ...validAnswers,
        annualTurnover: 'UNDER_25M',
      });

      // update should NOT have been called for the T12M check
      // (it may be called zero times or only if recalculation triggers it — none here)
      const updateCalls = (prisma.businessTaxProfile.update as any).mock.calls;
      const t19Calls = updateCalls.filter((call: any[]) =>
        JSON.stringify(call[0]).includes('needsManualReview')
      );
      expect(t19Calls).toHaveLength(0);

      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('[TAX-19] T12M turnover within declared band'),
        expect.any(Object)
      );
    });

    it('skips T12M check for ABOVE_100M (no upper bound)', async () => {
      // The aggregate mock should never be called in a meaningful way for ABOVE_100M
      const aboveAnswers: QuizAnswers = {
        ...validAnswers,
        legalStructure: 'LLC',
        annualTurnover: 'ABOVE_100M',
        fixedAssetsValue: 'UNDER_250M',
        businessType: 'STANDARD',
      };
      (prisma.salesTransaction.aggregate as any).mockResolvedValue({ _sum: { amount: 200_000_000 } });

      await taxProfileService.saveTaxProfile(userId, businessId, aboveAnswers);

      // No manual review should be set via TAX-19
      const updateCalls = (prisma.businessTaxProfile.update as any).mock.calls;
      const t19Calls = updateCalls.filter((call: any[]) =>
        JSON.stringify(call[0]).includes('needsManualReview')
      );
      expect(t19Calls).toHaveLength(0);
    });

    it('skips T12M check for UNKNOWN band', async () => {
      const unknownAnswers: QuizAnswers = {
        ...validAnswers,
        annualTurnover: 'UNKNOWN',
      };

      await taxProfileService.saveTaxProfile(userId, businessId, unknownAnswers);

      const updateCalls = (prisma.businessTaxProfile.update as any).mock.calls;
      const t19Calls = updateCalls.filter((call: any[]) =>
        JSON.stringify(call[0]).includes('needsManualReview')
      );
      expect(t19Calls).toHaveLength(0);
    });

    it('computedConfig is NOT changed when review is triggered', async () => {
      // TAX-19 only sets needsManualReview — never touches computedConfig
      (prisma.salesTransaction.aggregate as any).mockResolvedValue({
        _sum: { amount: 60_000_000 }, // crosses ₦50M for M25M_TO_50M band
      });

      const answers: QuizAnswers = { ...validAnswers, annualTurnover: 'M25M_TO_50M', legalStructure: 'LLC' };
      await taxProfileService.saveTaxProfile(userId, businessId, answers);

      const updateCalls = (prisma.businessTaxProfile.update as any).mock.calls;
      const t19Calls = updateCalls.filter((call: any[]) =>
        JSON.stringify(call[0]).includes('needsManualReview')
      );

      if (t19Calls.length > 0) {
        const updateData = t19Calls[0][0].data;
        expect(updateData).not.toHaveProperty('computedConfig');
        expect(updateData).not.toHaveProperty('quizAnswers');
      }
    });
  });
});
