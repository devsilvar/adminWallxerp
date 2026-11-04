import { describe, test, expect, jest, beforeEach } from '@jest/globals';

const mockEmitToAdmins = jest.fn();
jest.mock('../../src/services/admin/realtime-admin.helper', () => ({
  emitToAdmins: mockEmitToAdmins,
}));

import {
  withdrawBalance,
  adminApproveWithdrawal,
  adminRejectWithdrawal,
  adminManualSettleWithdrawal,
  adminRequeryWithdrawal,
} from '@/modules/wallet/services/payout.service';
import * as settlementService from '@/services/settlement/payout-preview.service';
import * as withdrawalActorModule from '@/shared/helpers/withdrawal-actor';
import * as pinService from '@/services/pin.service';
import * as paymentModule from '@/lib/payment';
import * as auditModule from '@/lib/audit';
import { WalletService } from '@/services/wallet.service';
import { eventBus } from '@/core/events/event-bus';
import prisma from '@/lib/prisma';
import { PlatformConfigService } from '@/services/platform-config.service';
import * as reminderGenModule from '@/services/reminder/reminder-generation.service';
import { processWebhook } from '@/services/payment/payment-webhook.service';
import { executePayoutReconciliationSweep } from '@/jobs/payout-reconciliation.cron';

describe('Admin Withdrawals Realtime SSE Unit Suite (Step 3)', () => {
  const mockUserId = 'usr-payout-sse-001';
  const mockBusinessId = 'biz-payout-sse-001';

  beforeEach(() => {
    jest.resetAllMocks();
    eventBus.removeAllListeners();
    mockEmitToAdmins.mockResolvedValue(undefined);
    jest.spyOn(auditModule, 'logAudit').mockReturnValue(undefined as any);
    jest.spyOn(reminderGenModule, 'createReminderOnce').mockResolvedValue({ created: true, reminder: {} as any });
    jest.spyOn(PlatformConfigService, 'getFeeConfig').mockResolvedValue({
      withdrawalFeePct: 0.5,
      withdrawalFeeCap: 100,
      minWithdrawalAmount: 100,
      updatedAt: new Date(),
      updatedBy: 'system',
    });
    jest.spyOn(prisma.paystackWebhookEvent, 'findFirst').mockResolvedValue(null as any);
    jest.spyOn(prisma.paystackWebhookEvent, 'create').mockResolvedValue({ id: 'wh-evt-1' } as any);
    jest.spyOn(prisma.paystackWebhookEvent, 'update').mockResolvedValue({ id: 'wh-evt-1' } as any);
  });

  describe('withdrawBalance (SME creation -> emitToAdmins withdrawal_created)', () => {
    test('emits withdrawal_created to admins on manual withdrawal request', async () => {
      jest.spyOn(withdrawalActorModule, 'getWithdrawalActor').mockResolvedValue({
        id: mockBusinessId,
        userId: mockUserId,
        businessName: 'Apex Merchants',
        settlementAccountNumber: '0123456789',
        settlementBankCode: '058',
        settlementBankName: 'GTBank',
        settlementAccountName: 'Apex Store',
        user: {
          id: mockUserId,
          transactionPin: '$2b$12$hashed...',
          pinLockedUntil: null,
          pinAttempts: 0,
          autoPayoutEnabled: false,
        },
      } as any);

      jest.spyOn(settlementService, 'getPayoutPreview').mockResolvedValue({
        availableForWithdrawal: 50000,
        settlementAccount: {
          isConnected: true,
          accountNumber: '0123456789',
          bankCode: '058',
          bankName: 'GTBank',
          accountName: 'Apex Store',
        },
      } as any);

      jest.spyOn(pinService, 'verifyPin').mockResolvedValue(undefined as any);
      jest.spyOn(WalletService, 'reserveFunds').mockResolvedValue(undefined as any);
      jest.spyOn(WalletService, 'checkLivePaystackBalance').mockResolvedValue({
        canPayout: true,
        deficit: 0,
        balance: 500000,
      });
      jest.spyOn(paymentModule, 'getPaymentProvider').mockReturnValue({
        createTransferRecipient: jest.fn<any>().mockResolvedValue({ recipientCode: 'RCP-123' }),
        initiateTransfer: jest.fn<any>().mockResolvedValue({
          status: 'pending',
          transferCode: 'TRF-123',
        }),
      } as any);
      jest.spyOn(prisma.settlementPayout, 'update').mockResolvedValue({
        id: 'payout-sse-new',
        businessId: mockBusinessId,
        amount: 20000,
        fee: 100,
        netAmount: 19900,
        transferReference: 'PO-TEST-12345',
        status: 'pending',
        destinationBankCode: '058',
        destinationBankName: 'GTBank',
        destinationAccountNum: '0123456789',
        destinationAccountName: 'Apex Store',
        initiatedAt: new Date(),
        completedAt: null,
      } as any);

      const mockTx: any = {
        $queryRaw: jest.fn<any>().mockResolvedValue([{ locked: true }]),
        business: {
          findMany: jest.fn<any>().mockResolvedValue([{ id: mockBusinessId }]),
        },
        settlementPayout: {
          findFirst: jest.fn<any>().mockResolvedValue(null),
          create: jest.fn<any>().mockResolvedValue({
            id: 'payout-sse-new',
            businessId: mockBusinessId,
            amount: 20000,
            fee: 100,
            netAmount: 19900,
            transferReference: 'PO-TEST-12345',
            status: 'pending',
            destinationBankCode: '058',
            destinationBankName: 'GTBank',
            destinationAccountNum: '0123456789',
            destinationAccountName: 'Apex Store',
            initiatedAt: new Date(),
            completedAt: null,
          }),
        },
      };

      jest.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) => {
        return cb(mockTx);
      });

      const result = await withdrawBalance(mockUserId, mockBusinessId, {
        amount: 20000,
        pin: '1234',
      });

      expect(result.id).toBe('payout-sse-new');
      expect(mockEmitToAdmins).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'withdrawal_created',
          withdrawalId: 'payout-sse-new',
          businessId: mockBusinessId,
          businessName: 'Apex Merchants',
          amount: 20000,
        })
      );
    });
  });

  describe('adminApproveWithdrawal (Admin approval -> emitToAdmins withdrawal_status_changed)', () => {
    test('emits processing on claim and completed on successful transfer', async () => {
      const mockPayout = {
        id: 'payout-appr-1',
        businessId: mockBusinessId,
        amount: 30000,
        fee: 100,
        netAmount: 29900,
        transferReference: 'PO-TEST-APPR-1',
        status: 'pending',
        destinationBankCode: '058',
        destinationBankName: 'GTBank',
        destinationAccountNum: '0123456789',
        destinationAccountName: 'Apex Merchants',
        business: {
          userId: mockUserId,
          businessName: 'Apex Merchants',
          user: { id: mockUserId, email: 'apex@test.com' },
        },
      };

      jest.spyOn(prisma.settlementPayout, 'findUnique').mockResolvedValue(mockPayout as any);
      jest.spyOn(settlementService, 'getPayoutPreview').mockResolvedValue({
        availableForWithdrawal: 100000,
      } as any);

      const mockTx: any = {
        $queryRaw: jest.fn<any>().mockResolvedValue([{ locked: true }]),
        settlementPayout: {
          updateMany: jest.fn<any>().mockResolvedValue({ count: 1 }),
        },
      };

      jest.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) => {
        return cb(mockTx);
      });

      jest.spyOn(WalletService, 'checkLivePaystackBalance').mockResolvedValue({
        canPayout: true,
        deficit: 0,
        balance: 500000,
      });

      jest.spyOn(paymentModule, 'getPaymentProvider').mockReturnValue({
        createTransferRecipient: jest.fn<any>().mockResolvedValue({ recipientCode: 'RCP-123' }),
        initiateTransfer: jest.fn<any>().mockResolvedValue({
          status: 'success',
          transferCode: 'TRF-123',
        }),
      } as any);

      jest.spyOn(prisma.settlementPayout, 'update').mockResolvedValue({
        ...mockPayout,
        status: 'completed',
      } as any);

      jest.spyOn(WalletService, 'settlePayoutDebit').mockResolvedValue(undefined as any);

      await adminApproveWithdrawal('admin-001', 'payout-appr-1');

      // First emission: processing
      expect(mockEmitToAdmins).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'withdrawal_status_changed',
          withdrawalId: 'payout-appr-1',
          businessId: mockBusinessId,
          businessName: 'Apex Merchants',
          status: 'processing',
          amount: 30000,
        })
      );

      // Second emission: completed
      expect(mockEmitToAdmins).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'withdrawal_status_changed',
          withdrawalId: 'payout-appr-1',
          businessId: mockBusinessId,
          businessName: 'Apex Merchants',
          status: 'completed',
          amount: 30000,
        })
      );
    });
  });

  describe('adminRejectWithdrawal (Admin rejection -> emitToAdmins withdrawal_status_changed)', () => {
    test('emits failed status with rejection reason to admins', async () => {
      const mockPayout = {
        id: 'payout-rej-1',
        businessId: mockBusinessId,
        amount: 15000,
        fee: 50,
        status: 'pending',
        transferReference: 'PO-REJ-001',
        business: { userId: mockUserId, businessName: 'Apex Merchants' },
      };

      jest.spyOn(prisma.settlementPayout, 'findUnique').mockResolvedValue(mockPayout as any);
      jest.spyOn(prisma.settlementPayout, 'updateMany').mockResolvedValue({ count: 1 } as any);
      jest.spyOn(WalletService, 'releaseLockedFunds').mockResolvedValue(undefined as any);

      await adminRejectWithdrawal('admin-001', 'payout-rej-1', 'Suspected fraudulent account');

      expect(mockEmitToAdmins).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'withdrawal_status_changed',
          withdrawalId: 'payout-rej-1',
          businessId: mockBusinessId,
          businessName: 'Apex Merchants',
          status: 'failed',
          amount: 15000,
          failureReason: 'Rejected by admin: Suspected fraudulent account',
        })
      );
    });
  });

  describe('adminManualSettleWithdrawal (Admin manual settlement -> emitToAdmins)', () => {
    test('emits completed status to admins on manual bank settlement', async () => {
      const mockPayout = {
        id: 'payout-man-1',
        businessId: mockBusinessId,
        amount: 45000,
        fee: 0,
        netAmount: 45000,
        status: 'pending',
        transferReference: 'PO-MAN-001',
        narration: 'Supplier settlement',
        business: {
          userId: mockUserId,
          businessName: 'Apex Merchants',
          user: { id: mockUserId, email: 'apex@test.com' },
        },
      };

      jest.spyOn(prisma.settlementPayout, 'findUnique').mockResolvedValue(mockPayout as any);
      const mockTx: any = {
        $queryRaw: jest.fn<any>().mockResolvedValue([{ locked: true }]),
        settlementPayout: {
          update: jest.fn<any>().mockResolvedValue({
            ...mockPayout,
            status: 'completed',
          }),
        },
      };
      jest.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) => {
        return cb(mockTx);
      });
      jest.spyOn(WalletService, 'settlePayoutDebit').mockResolvedValue(undefined as any);

      await adminManualSettleWithdrawal('admin-001', 'payout-man-1', {
        sessionReference: 'MAN-SESS-999',
        notes: 'Paid via Zenith corporate app',
      });

      expect(mockEmitToAdmins).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'withdrawal_status_changed',
          withdrawalId: 'payout-man-1',
          businessId: mockBusinessId,
          businessName: 'Apex Merchants',
          status: 'completed',
          amount: 45000,
        })
      );
    });
  });

  describe('adminRequeryWithdrawal (Requery from Paystack -> emitToAdmins)', () => {
    test('emits completed status when requery confirms success', async () => {
      const mockPayout = {
        id: 'payout-req-1',
        businessId: mockBusinessId,
        amount: 25000,
        transferReference: 'PO-REQ-001',
        paystackTransferCode: 'TRF-REQ-001',
        status: 'processing',
        destinationBankName: 'Access Bank',
        business: { userId: mockUserId, businessName: 'Apex Merchants' },
      };

      jest.spyOn(prisma.settlementPayout, 'findUnique').mockResolvedValue(mockPayout as any);
      jest.spyOn(paymentModule, 'getPaymentProvider').mockReturnValue({
        verifyTransfer: jest.fn<any>().mockResolvedValue({ status: 'success' }),
      } as any);

      jest.spyOn(prisma.settlementPayout, 'updateMany').mockResolvedValue({ count: 1 } as any);
      jest.spyOn(prisma.walletTransaction, 'findFirst').mockResolvedValue({ id: 'wt-already-1' } as any);

      await adminRequeryWithdrawal('admin-001', 'payout-req-1');

      expect(mockEmitToAdmins).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'withdrawal_status_changed',
          withdrawalId: 'payout-req-1',
          businessId: mockBusinessId,
          businessName: 'Apex Merchants',
          status: 'completed',
          amount: 25000,
        })
      );
    });
  });

  describe('payment-webhook.service (Paystack transfer webhooks -> emitToAdmins)', () => {
    test('emits completed on transfer.success webhook', async () => {
      const mockPayout = {
        id: 'payout-wh-1',
        businessId: mockBusinessId,
        amount: 18000,
        transferReference: 'PO-WH-001',
        destinationBankName: 'FirstBank',
        status: 'processing',
        business: { userId: mockUserId, businessName: 'Apex Merchants' },
      };

      jest.spyOn(prisma.settlementPayout, 'findFirst').mockResolvedValue(mockPayout as any);
      jest.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) => {
        const mockTx: any = {
          settlementPayout: {
            updateMany: jest.fn<any>().mockResolvedValue({ count: 1 }),
          },
        };
        return cb(mockTx);
      });
      jest.spyOn(WalletService, 'settlePayoutDebit').mockResolvedValue(undefined as any);

      // We call processWebhook with transfer.success payload
      const payload = {
        event: 'transfer.success',
        data: {
          reference: 'PO-WH-001',
          transfer_code: 'TRF-WH-001',
        },
      };

      // Mock signature verification
      const crypto = require('crypto');
      const secret = process.env.PAYSTACK_SECRET_KEY || 'test_secret';
      const body = JSON.stringify(payload);
      const sig = crypto.createHmac('sha512', secret).update(body).digest('hex');

      await processWebhook(sig, body);

      expect(mockEmitToAdmins).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'withdrawal_status_changed',
          withdrawalId: 'payout-wh-1',
          businessId: mockBusinessId,
          businessName: 'Apex Merchants',
          status: 'completed',
          amount: 18000,
        })
      );
    });

    test('emits failed on transfer.failed webhook', async () => {
      const mockPayout = {
        id: 'payout-wh-2',
        businessId: mockBusinessId,
        amount: 12000,
        transferReference: 'PO-WH-002',
        status: 'processing',
        business: { userId: mockUserId, businessName: 'Apex Merchants' },
      };

      jest.spyOn(prisma.settlementPayout, 'findFirst').mockResolvedValue(mockPayout as any);
      jest.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) => {
        const mockTx: any = {
          settlementPayout: {
            updateMany: jest.fn<any>().mockResolvedValue({ count: 1 }),
          },
        };
        return cb(mockTx);
      });
      jest.spyOn(WalletService, 'releaseLockedFunds').mockResolvedValue(undefined as any);

      const payload = {
        event: 'transfer.failed',
        data: {
          reference: 'PO-WH-002',
          transfer_code: 'TRF-WH-002',
          reason: 'Destination bank account suspended',
        },
      };

      const crypto = require('crypto');
      const secret = process.env.PAYSTACK_SECRET_KEY || 'test_secret';
      const body = JSON.stringify(payload);
      const sig = crypto.createHmac('sha512', secret).update(body).digest('hex');

      await processWebhook(sig, body);

      expect(mockEmitToAdmins).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'withdrawal_status_changed',
          withdrawalId: 'payout-wh-2',
          businessId: mockBusinessId,
          businessName: 'Apex Merchants',
          status: 'failed',
          amount: 12000,
          failureReason: 'Destination bank account suspended',
        })
      );
    });
  });

  describe('payout-reconciliation.cron (Sweeper -> emitToAdmins)', () => {
    test('emits completed when reconciliation sweeper verifies success', async () => {
      const mockPayout = {
        id: 'payout-cron-1',
        businessId: mockBusinessId,
        amount: 50000,
        netAmount: 50000,
        transferReference: 'PO-CRON-001',
        destinationBankName: 'Zenith Bank',
        status: 'processing',
        business: {
          id: mockBusinessId,
          userId: mockUserId,
          businessName: 'Apex Merchants',
        },
      };

      jest.spyOn(prisma.settlementPayout, 'findMany').mockResolvedValue([mockPayout] as any);
      jest.spyOn(prisma.settlementPayout, 'findUnique').mockResolvedValue({ status: 'processing' } as any);
      jest.spyOn(prisma.walletTransaction, 'findUnique').mockResolvedValue(null);
      jest.spyOn(prisma.settlementPayout, 'update').mockResolvedValue(mockPayout as any);
      jest.spyOn(WalletService, 'settlePayoutDebit').mockResolvedValue(undefined as any);

      jest.spyOn(paymentModule, 'getPaymentProvider').mockReturnValue({
        verifyTransfer: jest.fn<any>().mockResolvedValue({ status: 'success' }),
      } as any);

      await executePayoutReconciliationSweep();

      expect(mockEmitToAdmins).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'withdrawal_status_changed',
          withdrawalId: 'payout-cron-1',
          businessId: mockBusinessId,
          businessName: 'Apex Merchants',
          status: 'completed',
          amount: 50000,
        })
      );
    });
  });
});
