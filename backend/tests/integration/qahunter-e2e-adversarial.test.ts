import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { testDb, clearDatabase, createTestUser, createTestBusiness } from '../helpers/test-db';
import { applyReassignment } from '../../src/services/sales/sales-verification.service';
import { finalizeReport } from '../../src/services/tax/tax-report.service';
import { createSale } from '../../src/services/sales/sales-crud.service';
import { processDVATransferWebhook } from '../../src/services/dva/dva-webhook.service';
import { processWebhook } from '../../src/services/payment/payment-webhook.service';
import { adminRejectWithdrawal } from '../../src/modules/wallet/services/admin-payout.service';
import { WalletService } from '../../src/services/wallet/wallet.service';
import { verifyBusinessAccess } from '../../src/lib/ownership';
import { AppError } from '../../src/middleware/errorHandler';
import crypto from 'crypto';
import config from '../../src/config';

jest.setTimeout(60000);

describe('QA Hunter: Adversarial & Non-Happy Path Verification Suite', () => {
  let userMerchantA: any;
  let userMerchantB: any;
  let businessA1: any;
  let businessA2: any;
  let businessB1: any;
  let adminUser: any;

  beforeAll(async () => {
    await clearDatabase();

    userMerchantA = await createTestUser(`qa-adv-userA-${Date.now()}@e2e.com`);
    userMerchantB = await createTestUser(`qa-adv-userB-${Date.now()}@e2e.com`);
    adminUser = await createTestUser(`qa-adv-admin-${Date.now()}@e2e.com`, 'admin');

    businessA1 = await createTestBusiness(userMerchantA.id, 'QA Adversarial Store A1');
    businessA2 = await createTestBusiness(userMerchantA.id, 'QA Adversarial Store A2');
    businessB1 = await createTestBusiness(userMerchantB.id, 'QA Adversarial Store B1');

    // Create wallet for userMerchantA
    await testDb.walletBalance.create({
      data: {
        userId: userMerchantA.id,
        balance: 100000,
        lockedBalance: 0,
      },
    });

    // Set businessA1 as primary
    await testDb.user.update({
      where: { id: userMerchantA.id },
      data: { primaryBusinessId: businessA1.id },
    });
  }, 45000);

  afterAll(async () => {
    await clearDatabase();
    await testDb.$disconnect();
  }, 45000);

  // ═══════════════════════════════════════════════════════════════════
  // 1. ADVERSARIAL REASSIGNMENT & BOUNDARY MATRIX
  // ═══════════════════════════════════════════════════════════════════

  describe('1. Adversarial Inflow Reassignment & Boundary Testing', () => {
    test('cross-merchant reassignment is strictly blocked with 403 FORBIDDEN', async () => {
      const sale = await testDb.salesTransaction.create({
        data: {
          businessId: businessA1.id,
          amount: 50000,
          source: 'bank_transfer',
          status: 'confirmed',
          transactionDate: new Date('2026-05-10'),
          description: 'Merchant A1 Sale',
        },
      });

      await expect(
        applyReassignment({
          saleId: sale.id,
          sourceBusinessId: businessA1.id,
          targetBusinessId: businessB1.id, // belongs to userMerchantB!
          actor: { kind: 'user', userId: userMerchantA.id },
        })
      ).rejects.toThrow(AppError);

      try {
        await applyReassignment({
          saleId: sale.id,
          sourceBusinessId: businessA1.id,
          targetBusinessId: businessB1.id,
          actor: { kind: 'user', userId: userMerchantA.id },
        });
      } catch (err: any) {
        expect(err.statusCode).toBe(403);
        expect(err.code).toBe('FORBIDDEN');
      }
    });

    test('reassigning to the exact same business is rejected with 400 INVALID_TARGET_BUSINESS', async () => {
      const sale = await testDb.salesTransaction.create({
        data: {
          businessId: businessA1.id,
          amount: 25000,
          source: 'bank_transfer',
          status: 'confirmed',
          transactionDate: new Date('2026-05-12'),
          description: 'Self reassign test',
        },
      });

      await expect(
        applyReassignment({
          saleId: sale.id,
          sourceBusinessId: businessA1.id,
          targetBusinessId: businessA1.id,
          actor: { kind: 'user', userId: userMerchantA.id },
        })
      ).rejects.toThrow(AppError);

      try {
        await applyReassignment({
          saleId: sale.id,
          sourceBusinessId: businessA1.id,
          targetBusinessId: businessA1.id,
          actor: { kind: 'user', userId: userMerchantA.id },
        });
      } catch (err: any) {
        expect(err.statusCode).toBe(400);
        expect(err.code).toBe('INVALID_TARGET_BUSINESS');
      }
    });

    test('reassigning when target business has duplicate reference is rejected with 409 DUPLICATE_SALES_REFERENCE', async () => {
      const collisionRef = `REF-COLLIDE-${Date.now()}`;

      // Pre-existing transaction on target business A2 with this reference
      await testDb.salesTransaction.create({
        data: {
          businessId: businessA2.id,
          amount: 15000,
          source: 'bank_transfer',
          status: 'confirmed',
          referenceId: collisionRef,
          transactionDate: new Date('2026-05-15'),
          description: 'Existing on A2',
        },
      });

      // Transaction on source business A1 with the same reference
      const saleOnA1 = await testDb.salesTransaction.create({
        data: {
          businessId: businessA1.id,
          amount: 15000,
          source: 'bank_transfer',
          status: 'confirmed',
          referenceId: collisionRef,
          transactionDate: new Date('2026-05-15'),
          description: 'Sale to reassign from A1',
        },
      });

      await expect(
        applyReassignment({
          saleId: saleOnA1.id,
          sourceBusinessId: businessA1.id,
          targetBusinessId: businessA2.id,
          actor: { kind: 'admin', adminUserId: adminUser.id },
        })
      ).rejects.toThrow(AppError);

      try {
        await applyReassignment({
          saleId: saleOnA1.id,
          sourceBusinessId: businessA1.id,
          targetBusinessId: businessA2.id,
          actor: { kind: 'admin', adminUserId: adminUser.id },
        });
      } catch (err: any) {
        expect(err.statusCode).toBe(409);
        expect(err.code).toBe('DUPLICATE_SALES_REFERENCE');
      }
    });

    test('reassigning a transaction whose month is finalized on target business is blocked with 423', async () => {
      // Finalize period January 2026 on target business A2
      await testDb.monthlyTaxReport.create({
        data: {
          businessId: businessA2.id,
          taxMonth: new Date(Date.UTC(2026, 0, 1)),
          totalSales: 200000,
          totalExpenses: 50000,
          grossProfit: 150000,
          taxPayable: 11250,
          isFinalized: true,
          isLocked: true,
          lockedAt: new Date(),
        },
      });

      // Create sale in January 2026 on source business A1
      const janSale = await testDb.salesTransaction.create({
        data: {
          businessId: businessA1.id,
          amount: 40000,
          source: 'bank_transfer',
          status: 'confirmed',
          transactionDate: new Date('2026-01-15'),
          description: 'Jan 2026 sale on A1',
        },
      });

      await expect(
        applyReassignment({
          saleId: janSale.id,
          sourceBusinessId: businessA1.id,
          targetBusinessId: businessA2.id,
          actor: { kind: 'admin', adminUserId: adminUser.id },
        })
      ).rejects.toThrow(AppError);

      try {
        await applyReassignment({
          saleId: janSale.id,
          sourceBusinessId: businessA1.id,
          targetBusinessId: businessA2.id,
          actor: { kind: 'admin', adminUserId: adminUser.id },
        });
      } catch (err: any) {
        expect([400, 423]).toContain(err.statusCode);
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // 2. STATUTORY TAX FINALIZATION GATE
  // ═══════════════════════════════════════════════════════════════════

  describe('2. Statutory Tax Finalization Gate & Period Lock Defense', () => {
    test('finalizing an active ongoing month before the 1st of next month throws PERIOD_STILL_ACTIVE', async () => {
      const now = new Date();
      const activeMonthStart = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1));

      const activeReport = await testDb.monthlyTaxReport.create({
        data: {
          businessId: businessA1.id,
          taxMonth: activeMonthStart,
          totalSales: 150000,
          totalExpenses: 50000,
          grossProfit: 100000,
          taxPayable: 7500,
          isFinalized: false,
          isLocked: false,
        },
      });

      await expect(
        finalizeReport(userMerchantA.id, businessA1.id, activeReport.id)
      ).rejects.toThrow(AppError);

      try {
        await finalizeReport(userMerchantA.id, businessA1.id, activeReport.id);
      } catch (err: any) {
        expect(err.statusCode).toBe(400);
        expect(err.code).toBe('PERIOD_STILL_ACTIVE');
      }
    });

    test('finalizing a concluded prior month succeeds and locks the period against future sales', async () => {
      // Concluded month: February 2026
      const febDate = new Date(Date.UTC(2026, 1, 1));
      const concludedReport = await testDb.monthlyTaxReport.create({
        data: {
          businessId: businessA1.id,
          taxMonth: febDate,
          totalSales: 80000,
          totalExpenses: 20000,
          grossProfit: 60000,
          taxPayable: 4500,
          isFinalized: false,
          isLocked: false,
        },
      });

      // Finalize the concluded month
      const finalized = await finalizeReport(userMerchantA.id, businessA1.id, concludedReport.id);
      expect(finalized.isFinalized).toBe(true);
      expect(finalized.isLocked).toBe(false);

      // Attempting to insert a sale into that finalized month must be rejected with 423
      await expect(
        createSale(userMerchantA.id, businessA1.id, {
          amount: 10000,
          source: 'manual',
          transactionDate: new Date('2026-02-15'),
          description: 'Adversarial retroactive sale',
        })
      ).rejects.toThrow(AppError);

      try {
        await createSale(userMerchantA.id, businessA1.id, {
          amount: 10000,
          source: 'manual',
          transactionDate: new Date('2026-02-15'),
          description: 'Adversarial retroactive sale',
        });
      } catch (err: any) {
        expect(err.statusCode).toBe(423);
        expect(['PERIOD_LOCKED', 'PERIOD_FINALIZED']).toContain(err.code);
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // 3. SETTLEMENT, WALLET & ADVERSARIAL REJECTIONS
  // ═══════════════════════════════════════════════════════════════════

  describe('3. Payout State Machine & Double-Debit Vulnerability Defense', () => {
    test('admin rejection on already failed/completed payout throws 409 ALREADY_PROCESSED', async () => {
      const payout = await testDb.settlementPayout.create({
        data: {
          businessId: businessA1.id,
          amount: 20000,
          fee: 50,
          netAmount: 19950,
          status: 'failed',
          destinationBankCode: '058',
          destinationBankName: 'GTBank',
          destinationAccountNum: '0123456789',
          destinationAccountName: 'Test Merchant',
          transferReference: `PO-FAIL-${Date.now()}`,
          failureReason: 'Pre-existing failure',
        },
      });

      await expect(
        adminRejectWithdrawal(adminUser.id, payout.id, 'Attempting duplicate reject')
      ).rejects.toThrow(AppError);

      try {
        await adminRejectWithdrawal(adminUser.id, payout.id, 'Attempting duplicate reject');
      } catch (err: any) {
        expect(err.statusCode).toBe(409);
        expect(err.code).toBe('ALREADY_PROCESSED');
      }
    });

    test('reserveFunds throws INSUFFICIENT_FUNDS when requested amount exceeds available balance', async () => {
      await expect(
        WalletService.reserveFunds({
          userId: userMerchantA.id,
          amount: 99999999, // 100M NGN requested on 100k wallet
          fee: 100,
        })
      ).rejects.toThrow(AppError);

      try {
        await WalletService.reserveFunds({
          userId: userMerchantA.id,
          amount: 99999999,
          fee: 100,
        });
      } catch (err: any) {
        expect(err.statusCode).toBe(400);
        expect(err.code).toBe('INSUFFICIENT_FUNDS');
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // 4. TEAM ROLES & RBAC ADVERSARIAL ACCESS
  // ═══════════════════════════════════════════════════════════════════

  describe('4. Team Roles & RBAC Privilege Escalation Defense', () => {
    let viewerUser: any;

    beforeAll(async () => {
      viewerUser = await createTestUser(`qa-adv-viewer-${Date.now()}@e2e.com`);
      await testDb.businessMember.create({
        data: {
          businessId: businessA1.id,
          userId: viewerUser.id,
          role: 'viewer',
          isActive: true,
        },
      });
    });

    test('viewer role is strictly blocked from creating sales with 403 PERMISSION_DENIED', async () => {
      await expect(
        verifyBusinessAccess(viewerUser.id, businessA1.id, 'sales.create')
      ).rejects.toThrow(AppError);

      try {
        await verifyBusinessAccess(viewerUser.id, businessA1.id, 'sales.create');
      } catch (err: any) {
        expect(err.statusCode).toBe(403);
        expect(err.code).toBe('PERMISSION_DENIED');
      }
    });

    test('viewer role is strictly blocked from finalizing tax reports with 403 PERMISSION_DENIED', async () => {
      await expect(
        verifyBusinessAccess(viewerUser.id, businessA1.id, 'tax.finalize')
      ).rejects.toThrow(AppError);

      try {
        await verifyBusinessAccess(viewerUser.id, businessA1.id, 'tax.finalize');
      } catch (err: any) {
        expect(err.statusCode).toBe(403);
        expect(err.code).toBe('PERMISSION_DENIED');
      }
    });

    test('viewer role is strictly blocked from managing debtors with 403 PERMISSION_DENIED', async () => {
      await expect(
        verifyBusinessAccess(viewerUser.id, businessA1.id, 'debtors.manage')
      ).rejects.toThrow(AppError);

      try {
        await verifyBusinessAccess(viewerUser.id, businessA1.id, 'debtors.manage');
      } catch (err: any) {
        expect(err.statusCode).toBe(403);
        expect(err.code).toBe('PERMISSION_DENIED');
      }
    });
  });
});
