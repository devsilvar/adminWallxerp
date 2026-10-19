import prisma from '@/lib/prisma';
import { applyReassignment } from '@/services/sales/sales-verification.service';
import { isCreditLinked, isInvoiceLinked, isAccrualLinked } from '@/shared/helpers/accrual';
import { getUnifiedLedger } from '@/services/wallet/ledger.service';
import { AppError } from '@/middleware/errorHandler';

jest.mock('@/lib/audit', () => ({
  logAudit: jest.fn().mockResolvedValue(undefined),
}));

const mockAssertMonthNotLocked = jest.fn().mockResolvedValue(undefined);
jest.mock('@/shared/helpers', () => {
  const actual = jest.requireActual('@/shared/helpers');
  return {
    ...actual,
    assertMonthNotLocked: (...args: any[]) => mockAssertMonthNotLocked(...args),
  };
});

describe('Invoice & Sale Reassignment with Accrual Safeguards', () => {
  const sourceBusinessId = 'biz-findme-001';
  const targetBusinessId = 'biz-examlab-002';
  const merchantUserId = 'user-owner-123';
  const otherMerchantUserId = 'user-intruder-999';

  const sourceBizMock = {
    id: sourceBusinessId,
    userId: merchantUserId,
    businessName: 'Findme Store',
  };

  const targetBizMock = {
    id: targetBusinessId,
    userId: merchantUserId,
    businessName: 'ExamLab Ltd',
  };

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('1. Accrual Classification Helpers (accrual.ts)', () => {
    it('isCreditLinked returns true ONLY for credit-origin, credit-payment, or credit source', () => {
      expect(isCreditLinked({ source: 'credit' })).toBe(true);
      expect(isCreditLinked({ source: 'manual', creditOrigin: { id: 'cred-1' } })).toBe(true);
      expect(isCreditLinked({ source: 'manual', creditPayment: { id: 'pmt-1' } })).toBe(true);
      expect(
        isCreditLinked({
          source: 'manual',
          invoice: { id: 'inv-1', invoiceNumber: 'INV-2026-001' },
        })
      ).toBe(false);
      expect(isCreditLinked({ source: 'bank_transfer' })).toBe(false);
    });

    it('isInvoiceLinked returns true for sales linked to an invoice or with source invoice', () => {
      expect(
        isInvoiceLinked({
          source: 'manual',
          invoice: { id: 'inv-1', invoiceNumber: 'INV-2026-001' },
        })
      ).toBe(true);
      expect(isInvoiceLinked({ source: 'invoice' })).toBe(true);
      expect(isInvoiceLinked({ source: 'credit' })).toBe(false);
      expect(isInvoiceLinked({ source: 'manual' })).toBe(false);
    });

    it('isAccrualLinked returns true for both credit and invoice transactions', () => {
      expect(isAccrualLinked({ source: 'credit' })).toBe(true);
      expect(
        isAccrualLinked({
          source: 'manual',
          invoice: { id: 'inv-1', invoiceNumber: 'INV-2026-001' },
        })
      ).toBe(true);
      expect(isAccrualLinked({ source: 'manual' })).toBe(false);
    });
  });

  describe('2. Credit Sale Protection (ACCRUAL_SALE_IMMUTABLE)', () => {
    it('blocks moving a sale originated from customer credit with 409 ACCRUAL_SALE_IMMUTABLE', async () => {
      const creditSale = {
        id: 'sale-credit-001',
        businessId: sourceBusinessId,
        source: 'credit',
        amount: 50000,
        transactionDate: new Date('2026-03-15'),
        creditOrigin: { id: 'cred-001' },
        creditPayment: null,
        invoice: null,
      };

      jest.spyOn(prisma.salesTransaction, 'findUnique').mockResolvedValue(creditSale as any);

      await expect(
        applyReassignment({
          saleId: 'sale-credit-001',
          sourceBusinessId,
          targetBusinessId,
          actor: { kind: 'user', userId: merchantUserId },
        })
      ).rejects.toThrow(AppError);

      await expect(
        applyReassignment({
          saleId: 'sale-credit-001',
          sourceBusinessId,
          targetBusinessId,
          actor: { kind: 'user', userId: merchantUserId },
        })
      ).rejects.toMatchObject({
        statusCode: 409,
        code: 'ACCRUAL_SALE_IMMUTABLE',
      });
    });

    it('blocks moving a sale linked to credit payment repayment', async () => {
      const creditPaymentSale = {
        id: 'sale-credpmt-002',
        businessId: sourceBusinessId,
        source: 'manual',
        amount: 20000,
        transactionDate: new Date('2026-03-20'),
        creditOrigin: null,
        creditPayment: { id: 'pmt-002' },
        invoice: null,
      };

      jest.spyOn(prisma.salesTransaction, 'findUnique').mockResolvedValue(creditPaymentSale as any);

      await expect(
        applyReassignment({
          saleId: 'sale-credpmt-002',
          sourceBusinessId,
          targetBusinessId,
          actor: { kind: 'user', userId: merchantUserId },
        })
      ).rejects.toMatchObject({
        statusCode: 409,
        code: 'ACCRUAL_SALE_IMMUTABLE',
      });
    });
  });

  describe('3. Cascading Invoice Reassignment', () => {
    it('successfully reassigns an invoice-linked sale and moves invoice to target business (no number collision)', async () => {
      const saleId = 'sale-inv-001';
      const invoiceId = 'inv-001';

      const invoiceSale = {
        id: saleId,
        businessId: sourceBusinessId,
        source: 'manual',
        referenceId: 'INV-2026-001',
        amount: 430,
        transactionDate: new Date('2026-04-10'),
        description: 'Invoice INV-2026-001 — John Doe',
        creditOrigin: null,
        creditPayment: null,
        invoice: {
          id: invoiceId,
          invoiceNumber: 'INV-2026-001',
          businessId: sourceBusinessId,
          customerName: 'John Doe',
          issueDate: new Date('2026-04-10'),
          customerId: 'cust-source-01',
        },
      };

      jest.spyOn(prisma.salesTransaction, 'findUnique').mockResolvedValue(invoiceSale as any);
      jest.spyOn(prisma.business, 'findUnique').mockImplementation(async ({ where }: any) => {
        if (where.id === sourceBusinessId) return sourceBizMock as any;
        if (where.id === targetBusinessId) return targetBizMock as any;
        return null;
      });
      jest.spyOn(prisma.salesTransaction, 'findFirst').mockResolvedValue(null);

      const mockTx = {
        salesTransaction: {
          update: jest.fn().mockResolvedValue({ ...invoiceSale, businessId: targetBusinessId }),
        },
        walletTransaction: {
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
        invoice: {
          findFirst: jest.fn().mockResolvedValue(invoiceSale.invoice),
          findUnique: jest.fn().mockResolvedValue(null), // No collision in target
          update: jest.fn().mockResolvedValue({
            ...invoiceSale.invoice,
            businessId: targetBusinessId,
            customerId: null,
          }),
        },
      };

      jest.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) => cb(mockTx));

      const result = await applyReassignment({
        saleId,
        sourceBusinessId,
        targetBusinessId,
        actor: { kind: 'user', userId: merchantUserId },
      });

      expect(result).toBeDefined();
      expect(mockTx.salesTransaction.update).toHaveBeenCalledWith({
        where: { id: saleId },
        data: { businessId: targetBusinessId },
      });
      expect(mockTx.walletTransaction.updateMany).toHaveBeenCalledWith({
        where: { linkedSaleId: saleId },
        data: { businessId: targetBusinessId },
      });
      expect(mockTx.invoice.update).toHaveBeenCalledWith({
        where: { id: invoiceId },
        data: {
          businessId: targetBusinessId,
          invoiceNumber: 'INV-2026-001',
          customerId: null,
        },
      });
    });

    it('re-sequences invoice number when invoice number collides in target business', async () => {
      const saleId = 'sale-inv-collide-002';
      const invoiceId = 'inv-002';

      const invoiceSale = {
        id: saleId,
        businessId: sourceBusinessId,
        source: 'manual',
        referenceId: 'INV-2026-001',
        amount: 1500,
        transactionDate: new Date('2026-04-12'),
        description: 'Invoice INV-2026-001 — Jane Smith',
        creditOrigin: null,
        creditPayment: null,
        invoice: {
          id: invoiceId,
          invoiceNumber: 'INV-2026-001',
          businessId: sourceBusinessId,
          customerName: 'Jane Smith',
          issueDate: new Date('2026-04-12'),
          customerId: 'cust-source-02',
        },
      };

      jest.spyOn(prisma.salesTransaction, 'findUnique').mockResolvedValue(invoiceSale as any);
      jest.spyOn(prisma.business, 'findUnique').mockImplementation(async ({ where }: any) => {
        if (where.id === sourceBusinessId) return sourceBizMock as any;
        if (where.id === targetBusinessId) return targetBizMock as any;
        return null;
      });
      jest.spyOn(prisma.salesTransaction, 'findFirst').mockResolvedValue(null);

      const mockTx = {
        salesTransaction: {
          update: jest.fn().mockResolvedValue({ ...invoiceSale, businessId: targetBusinessId }),
        },
        walletTransaction: {
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
        invoice: {
          findFirst: jest.fn().mockResolvedValue(invoiceSale.invoice),
          // Target business ALREADY has an invoice with INV-2026-001:
          findUnique: jest.fn().mockResolvedValue({
            id: 'inv-target-already-exists',
            businessId: targetBusinessId,
            invoiceNumber: 'INV-2026-001',
          }),
          // Existing invoices in target for 2026: 001 and 004
          findMany: jest.fn().mockResolvedValue([
            { invoiceNumber: 'INV-2026-001' },
            { invoiceNumber: 'INV-2026-004' },
          ]),
          update: jest.fn().mockResolvedValue({
            ...invoiceSale.invoice,
            businessId: targetBusinessId,
            invoiceNumber: 'INV-2026-005',
            customerId: null,
          }),
        },
      };

      jest.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) => cb(mockTx));

      await applyReassignment({
        saleId,
        sourceBusinessId,
        targetBusinessId,
        actor: { kind: 'user', userId: merchantUserId },
      });

      // Invoice must be updated with re-sequenced number INV-2026-005
      expect(mockTx.invoice.update).toHaveBeenCalledWith({
        where: { id: invoiceId },
        data: {
          businessId: targetBusinessId,
          invoiceNumber: 'INV-2026-005',
          customerId: null,
        },
      });

      // Linked sale must be synchronized with referenceId: 'INV-2026-005'
      expect(mockTx.salesTransaction.update).toHaveBeenCalledWith({
        where: { id: saleId },
        data: {
          referenceId: 'INV-2026-005',
          description: 'Invoice INV-2026-005 — Jane Smith',
        },
      });
    });

    it('blocks reassignment across different merchants with 403 FORBIDDEN', async () => {
      const saleId = 'sale-cross-merchant';
      const crossMerchantBizMock = {
        id: targetBusinessId,
        userId: otherMerchantUserId,
        businessName: 'Someone Else Business',
      };

      jest.spyOn(prisma.salesTransaction, 'findUnique').mockResolvedValue({
        id: saleId,
        businessId: sourceBusinessId,
        source: 'manual',
        transactionDate: new Date('2026-04-10'),
      } as any);

      jest.spyOn(prisma.business, 'findUnique').mockImplementation(async ({ where }: any) => {
        if (where.id === sourceBusinessId) return sourceBizMock as any;
        if (where.id === targetBusinessId) return crossMerchantBizMock as any;
        return null;
      });

      await expect(
        applyReassignment({
          saleId,
          sourceBusinessId,
          targetBusinessId,
          actor: { kind: 'user', userId: merchantUserId },
        })
      ).rejects.toMatchObject({
        statusCode: 403,
        code: 'FORBIDDEN',
      });
    });
  });

  describe('4. Unified Ledger Classification for Invoice Sales', () => {
    it('classifies a sale with linked invoice as invoice_payment even when source is manual', async () => {
      jest.spyOn(prisma.business, 'findUnique').mockResolvedValue(sourceBizMock as any);
      jest.spyOn(prisma.businessMember, 'findFirst').mockResolvedValue(null);

      const mockSales = [
        {
          id: 'sale-inv-paid-1',
          businessId: sourceBusinessId,
          amount: 430,
          source: 'manual',
          status: 'confirmed',
          isTaxable: true,
          transactionDate: new Date('2026-04-10'),
          description: 'Invoice INV-2026-001 — John Doe',
          customerName: 'John Doe',
          invoice: { id: 'inv-1', invoiceNumber: 'INV-2026-001' },
          creditOrigin: null,
          creditPayment: null,
        },
        {
          id: 'sale-cash-2',
          businessId: sourceBusinessId,
          amount: 5000,
          source: 'manual',
          status: 'confirmed',
          isTaxable: true,
          transactionDate: new Date('2026-04-11'),
          description: 'Direct Cash Sale',
          invoice: null,
          creditOrigin: null,
          creditPayment: null,
        },
      ];

      jest.spyOn(prisma.salesTransaction, 'aggregate').mockResolvedValue({ _sum: { amount: 0 } } as any);
      jest.spyOn(prisma.salesTransaction, 'findMany').mockResolvedValue(mockSales as any);
      jest.spyOn(prisma.taxPayment, 'findMany').mockResolvedValue([]);
      jest.spyOn(prisma.settlementPayout, 'findMany').mockResolvedValue([]);

      const result = await getUnifiedLedger(merchantUserId, sourceBusinessId, {
        page: 1,
        limit: 50,
        from: '2026-04-01',
        to: '2026-04-30',
      });

      const invEntry = result.data.find((r) => r.id === 'sale-inv-paid-1');
      const cashEntry = result.data.find((r) => r.id === 'sale-cash-2');

      expect(invEntry).toBeDefined();
      expect(invEntry?.sourceType).toBe('invoice_payment');

      expect(cashEntry).toBeDefined();
      expect(cashEntry?.sourceType).toBe('manual_sale');
    });
  });
});

