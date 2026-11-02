import { describe, it, expect, beforeEach, jest } from '@jest/globals';

// Mock dependencies
jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: {
    businessTaxProfile: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
      delete: jest.fn(),
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

import prisma from '@/lib/prisma';
import { verifyBusinessAccess } from '@/lib/ownership';
import { logAudit } from '@/lib/audit';
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
  });

  describe('saveTaxProfile', () => {
    it('verifies settings.update permission, evaluates config, and upserts profile', async () => {
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

      const result = await taxProfileService.saveTaxProfile(userId, businessId, validAnswers);

      expect(verifyBusinessAccess).toHaveBeenCalledWith(userId, businessId, 'settings.update');
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

  describe('deleteTaxProfile', () => {
    it('deletes existing profile and writes audit log', async () => {
      const mockExisting = { id: 'prof_test_789', businessId };
      (prisma.businessTaxProfile.findUnique as any).mockResolvedValue(mockExisting);
      (prisma.businessTaxProfile.delete as any).mockResolvedValue(mockExisting);

      const deleted = await taxProfileService.deleteTaxProfile(userId, businessId);

      expect(verifyBusinessAccess).toHaveBeenCalledWith(userId, businessId, 'settings.update');
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
});
