import { describe, test, expect, jest, beforeEach } from '@jest/globals';

const mockEmitToAdmins = jest.fn();
jest.mock('../../src/services/admin/realtime-admin.helper', () => ({
  emitToAdmins: mockEmitToAdmins,
}));

const mockCreateReminderOnce = jest.fn();
jest.mock('../../src/services/reminder.service', () => ({
  createReminderOnce: (...args: any[]) => mockCreateReminderOnce(...args),
}));

import { processDVATransferWebhook } from '@/services/dva/dva-webhook.service';
import { adminVerifySale } from '@/services/admin/admin-unverified-inflows.service';
import { applyVerification } from '@/services/sales/sales-verification.service';
import prisma from '@/lib/prisma';
import * as auditModule from '@/lib/audit';
import { WalletService } from '@/services/wallet.service';
import { eventBus } from '@/core/events/event-bus';

describe('Admin Unverified Inflows Realtime SSE Unit Suite (Step 4)', () => {
  const mockAdminId = 'usr-admin-sse-001';
  const mockMerchantId = 'usr-merch-sse-001';
  const mockBusinessId = 'biz-merch-sse-001';
  const mockSaleId = 'sale-unverified-sse-123';

  beforeEach(() => {
    jest.resetAllMocks();
    eventBus.removeAllListeners();
    mockEmitToAdmins.mockResolvedValue(undefined);
    mockCreateReminderOnce.mockResolvedValue({ created: true, reminder: {} });
    jest.spyOn(auditModule, 'logAudit').mockReturnValue(undefined as any);
    jest.spyOn(prisma.monthlyTaxReport, 'findUnique').mockResolvedValue(null as any);
  });

  describe('processDVATransferWebhook (DVA Inflow -> emitToAdmins unverified_inflow_created)', () => {
    test('emits unverified_inflow_created to admins when DVA transfer creates an unverified sale', async () => {
      const mockBusiness = {
        id: mockBusinessId,
        userId: mockMerchantId,
        businessName: 'Beta Electronics Ltd',
        autoSplitEnabled: false,
        paystackSubaccountCode: null,
        taxSplitPercentage: null,
      };

      jest.spyOn(prisma.business, 'findMany').mockResolvedValue([mockBusiness] as any);
      jest.spyOn(prisma.salesTransaction, 'findFirst').mockResolvedValue(null as any);
      jest.spyOn(prisma.walletTransaction, 'findUnique').mockResolvedValue(null as any);

      const mockCreatedSale = {
        id: mockSaleId,
        businessId: mockBusinessId,
        amount: 25000,
        source: 'bank_transfer',
        dvaOrigin: true,
        status: 'pending',
        referenceId: 'DVA-REF-12345',
        needsVerification: true,
      };

      const mockWalletTx = {
        transaction: { id: 'wtx-sse-001' },
      };

      jest.spyOn(prisma, '$transaction').mockImplementation(async (callback: any) => {
        const tx = {
          salesTransaction: {
            create: jest.fn<any>().mockResolvedValue(mockCreatedSale),
          },
        };
        jest.spyOn(WalletService, 'creditWallet').mockResolvedValue(mockWalletTx as any);
        return callback(tx);
      });

      const webhookPayload = {
        event: 'charge.success',
        data: {
          channel: 'dedicated_nuban',
          reference: 'DVA-REF-12345',
          amount: 2500000, // 25,000 NGN in kobo
          paid_at: new Date().toISOString(),
          customer: {
            first_name: 'John',
            last_name: 'Doe',
            name: 'John Doe',
          },
          dedicated_account: {
            account_number: '9988776655',
          },
        },
      };

      const result = await processDVATransferWebhook(webhookPayload);
      expect(result).toBe(true);

      expect(mockEmitToAdmins).toHaveBeenCalledTimes(1);
      expect(mockEmitToAdmins).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'unverified_inflow_created',
          saleId: mockSaleId,
          businessId: mockBusinessId,
          businessName: 'Beta Electronics Ltd',
          amount: 25000,
          referenceId: 'DVA-REF-12345',
        })
      );
    });

    test('ignores non-dedicated_nuban transfers without emitting to admins', async () => {
      const nonDvaPayload = {
        event: 'charge.success',
        data: {
          channel: 'card',
          reference: 'CARD-REF-999',
          amount: 100000,
        },
      };

      const result = await processDVATransferWebhook(nonDvaPayload);
      expect(result).toBe(false);
      expect(mockEmitToAdmins).not.toHaveBeenCalled();
    });

    test('skips storefront order transfers (ORD-...) without auto-capture or admin emission', async () => {
      const storefrontPayload = {
        event: 'charge.success',
        data: {
          channel: 'dedicated_nuban',
          reference: 'ORD-98765-STORE',
          amount: 500000,
        },
      };

      const result = await processDVATransferWebhook(storefrontPayload);
      expect(result).toBe(false);
      expect(mockEmitToAdmins).not.toHaveBeenCalled();
    });

    test('idempotency: already recorded DVA transfer returns true without emitting duplicate event', async () => {
      const mockBusiness = {
        id: mockBusinessId,
        userId: mockMerchantId,
        businessName: 'Beta Electronics Ltd',
      };

      jest.spyOn(prisma.business, 'findMany').mockResolvedValue([mockBusiness] as any);
      jest.spyOn(prisma.salesTransaction, 'findFirst').mockResolvedValue({
        id: 'existing-sale-1',
        businessId: mockBusinessId,
      } as any);
      jest.spyOn(prisma.walletTransaction, 'findUnique').mockResolvedValue({
        id: 'existing-wtx-1',
      } as any);

      const duplicatePayload = {
        event: 'charge.success',
        data: {
          channel: 'dedicated_nuban',
          reference: 'DVA-DUP-999',
          amount: 1000000,
          dedicated_account: { account_number: '9988776655' },
        },
      };

      const result = await processDVATransferWebhook(duplicatePayload);
      expect(result).toBe(true);
      expect(mockEmitToAdmins).not.toHaveBeenCalled();
    });

    test('adversarial: SSE emitToAdmins network rejection does not break DVA transaction processing', async () => {
      mockEmitToAdmins.mockRejectedValue(new Error('SSE transport timeout'));

      const mockBusiness = {
        id: mockBusinessId,
        userId: mockMerchantId,
        businessName: 'Beta Electronics Ltd',
        autoSplitEnabled: false,
        paystackSubaccountCode: null,
        taxSplitPercentage: null,
      };

      jest.spyOn(prisma.business, 'findMany').mockResolvedValue([mockBusiness] as any);
      jest.spyOn(prisma.salesTransaction, 'findFirst').mockResolvedValue(null as any);
      jest.spyOn(prisma.walletTransaction, 'findUnique').mockResolvedValue(null as any);

      const mockCreatedSale = {
        id: mockSaleId,
        businessId: mockBusinessId,
        amount: 15000,
        source: 'bank_transfer',
        dvaOrigin: true,
        status: 'pending',
        referenceId: 'DVA-ADV-001',
        needsVerification: true,
      };

      jest.spyOn(prisma, '$transaction').mockImplementation(async (callback: any) => {
        const tx = {
          salesTransaction: {
            create: jest.fn<any>().mockResolvedValue(mockCreatedSale),
          },
        };
        jest.spyOn(WalletService, 'creditWallet').mockResolvedValue({ transaction: { id: 'wtx-adv' } } as any);
        return callback(tx);
      });

      const payload = {
        event: 'charge.success',
        data: {
          channel: 'dedicated_nuban',
          reference: 'DVA-ADV-001',
          amount: 1500000,
          paid_at: new Date().toISOString(),
          customer: { first_name: 'Adversarial', last_name: 'Tester' },
          dedicated_account: { account_number: '9988776655' },
        },
      };

      // Even though emitToAdmins rejects, processDVATransferWebhook should return true
      const result = await processDVATransferWebhook(payload);
      expect(result).toBe(true);
      expect(mockEmitToAdmins).toHaveBeenCalled();
    });
  });

  describe('adminVerifySale (Admin verification -> emitToAdmins unverified_inflow_verified)', () => {
    test('emits unverified_inflow_verified to admins when admin verifies and classifies sale', async () => {
      const mockSale = {
        id: mockSaleId,
        businessId: mockBusinessId,
        source: 'bank_transfer',
        amount: 25000,
        needsVerification: true,
        creditOrigin: null,
        creditPayment: null,
        invoice: null,
        customerId: null,
      };

      const mockClassification = {
        id: 'cls-prod-sale-001',
        name: 'Product Sale',
        taxTreatment: 'taxable',
        isRevenue: true,
        category: 'revenue',
      };

      const mockUpdatedSale = {
        ...mockSale,
        needsVerification: false,
        status: 'confirmed',
        finalClassification: 'Product Sale',
        classificationId: 'cls-prod-sale-001',
        isTaxable: true,
      };

      jest.spyOn(prisma.salesTransaction, 'findUnique').mockResolvedValue(mockSale as any);
      jest.spyOn(prisma.transactionClassification, 'findFirst').mockResolvedValue(mockClassification as any);
      jest.spyOn(prisma, '$transaction').mockImplementation(async (callback: any) => {
        const tx = {
          salesTransaction: {
            update: jest.fn<any>().mockResolvedValue(mockUpdatedSale),
          },
        };
        return callback(tx);
      });

      const res = await adminVerifySale(mockAdminId, mockSaleId, {
        classificationName: 'Product Sale',
        customerName: 'Verified Customer',
        description: 'Payment for stock item',
      });

      expect(res.id).toBe(mockSaleId);
      expect(mockEmitToAdmins).toHaveBeenCalledTimes(1);
      expect(mockEmitToAdmins).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'unverified_inflow_verified',
          saleId: mockSaleId,
          businessId: mockBusinessId,
        })
      );
    });

    test('adversarial: SSE emitToAdmins rejection does not abort adminVerifySale completion', async () => {
      mockEmitToAdmins.mockRejectedValue(new Error('Connection terminated'));

      const mockSale = {
        id: mockSaleId,
        businessId: mockBusinessId,
        source: 'bank_transfer',
        amount: 10000,
        needsVerification: true,
        creditOrigin: null,
        creditPayment: null,
        invoice: null,
        customerId: null,
      };

      const mockClassification = {
        id: 'cls-prod-sale-001',
        name: 'Product Sale',
        taxTreatment: 'taxable',
        isRevenue: true,
        category: 'revenue',
      };

      const mockUpdatedSale = {
        ...mockSale,
        needsVerification: false,
        status: 'confirmed',
        finalClassification: 'Product Sale',
        classificationId: 'cls-prod-sale-001',
        isTaxable: true,
      };

      jest.spyOn(prisma.salesTransaction, 'findUnique').mockResolvedValue(mockSale as any);
      jest.spyOn(prisma.transactionClassification, 'findFirst').mockResolvedValue(mockClassification as any);
      jest.spyOn(prisma, '$transaction').mockImplementation(async (callback: any) => {
        const tx = {
          salesTransaction: {
            update: jest.fn<any>().mockResolvedValue(mockUpdatedSale),
          },
        };
        return callback(tx);
      });

      const res = await adminVerifySale(mockAdminId, mockSaleId, {
        classificationName: 'Product Sale',
      });

      expect(res.id).toBe(mockSaleId);
      expect(mockEmitToAdmins).toHaveBeenCalled();
    });
  });

  describe('applyVerification (Merchant verification -> emitToAdmins unverified_inflow_verified)', () => {
    test('emits unverified_inflow_verified to admins when merchant (user actor) classifies sale', async () => {
      const mockSale = {
        id: mockSaleId,
        businessId: mockBusinessId,
        source: 'bank_transfer',
        amount: 25000,
        needsVerification: true,
        creditOrigin: null,
        creditPayment: null,
        invoice: null,
        customerId: null,
      };

      const mockClassification = {
        id: 'cls-prod-001',
        name: 'Product Sale',
        taxTreatment: 'taxable',
        isRevenue: true,
        category: 'revenue',
      };

      const mockUpdatedSale = {
        ...mockSale,
        needsVerification: false,
        status: 'confirmed',
        finalClassification: 'Product Sale',
        classificationId: 'cls-prod-001',
        isTaxable: true,
      };

      jest.spyOn(prisma.salesTransaction, 'findUnique').mockResolvedValue(mockSale as any);
      jest.spyOn(prisma.transactionClassification, 'findFirst').mockResolvedValue(mockClassification as any);
      jest.spyOn(prisma, '$transaction').mockImplementation(async (callback: any) => {
        const tx = {
          salesTransaction: {
            update: jest.fn<any>().mockResolvedValue(mockUpdatedSale),
          },
        };
        return callback(tx);
      });

      const res = await applyVerification({
        saleId: mockSaleId,
        classificationName: 'Product Sale',
        actor: { kind: 'user', userId: mockMerchantId },
      });

      expect(res.id).toBe(mockSaleId);
      expect(mockEmitToAdmins).toHaveBeenCalledTimes(1);
      expect(mockEmitToAdmins).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'unverified_inflow_verified',
          saleId: mockSaleId,
          businessId: mockBusinessId,
        })
      );
    });

    test('does NOT emit directly inside applyVerification when actor is admin (adminVerifySale handles it)', async () => {
      const mockSale = {
        id: mockSaleId,
        businessId: mockBusinessId,
        source: 'bank_transfer',
        amount: 25000,
        needsVerification: true,
        creditOrigin: null,
        creditPayment: null,
        invoice: null,
        customerId: null,
      };

      const mockClassification = {
        id: 'cls-prod-001',
        name: 'Product Sale',
        taxTreatment: 'taxable',
        isRevenue: true,
        category: 'revenue',
      };

      const mockUpdatedSale = {
        ...mockSale,
        needsVerification: false,
        status: 'confirmed',
      };

      jest.spyOn(prisma.salesTransaction, 'findUnique').mockResolvedValue(mockSale as any);
      jest.spyOn(prisma.transactionClassification, 'findFirst').mockResolvedValue(mockClassification as any);
      jest.spyOn(prisma, '$transaction').mockImplementation(async (callback: any) => {
        const tx = {
          salesTransaction: {
            update: jest.fn<any>().mockResolvedValue(mockUpdatedSale),
          },
        };
        return callback(tx);
      });

      // Call applyVerification directly with admin actor
      await applyVerification({
        saleId: mockSaleId,
        classificationName: 'Product Sale',
        actor: { kind: 'admin', adminUserId: mockAdminId },
      });

      // Verification from sales-verification.service.ts suppresses emission for admin actor
      expect(mockEmitToAdmins).not.toHaveBeenCalled();
    });
  });
});
