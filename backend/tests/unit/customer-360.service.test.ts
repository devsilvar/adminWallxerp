import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import * as customerService from '../../src/services/customer.service';
import * as customerCardService from '../../src/services/customer-card.service';
import prisma from '../../src/lib/prisma';
import * as ownershipModule from '../../src/lib/ownership';
import * as auditModule from '../../src/lib/audit';
import { AppError } from '../../src/middleware/errorHandler';

describe('Customer 360 Core Service Unit Tests', () => {
  const userId = 'user-test-123';
  const businessId = 'biz-test-456';
  const customerId = 'cust-test-789';

  let verifyAccessSpy: any;
  let logAuditSpy: any;

  beforeEach(() => {
    jest.clearAllMocks();
    verifyAccessSpy = jest
      .spyOn(ownershipModule, 'verifyBusinessAccess')
      .mockResolvedValue({} as any);
    logAuditSpy = jest
      .spyOn(auditModule, 'logAudit')
      .mockResolvedValue(undefined as any);
  });

  describe('getCustomerDetail', () => {
    test('throws 404 if customer does not exist or belongs to another business', async () => {
      jest.spyOn(prisma.customer, 'findUnique').mockResolvedValue(null);

      await expect(
        customerService.getCustomerDetail(userId, businessId, customerId)
      ).rejects.toThrow(AppError);

      expect(verifyAccessSpy).toHaveBeenCalledWith(userId, businessId, 'customers.read');
    });

    test('returns customer 360 detail and computes lifetime KPIs correctly', async () => {
      const mockCustomer: any = {
        id: customerId,
        businessId,
        name: 'Ada Lovelace',
        email: 'ada@example.com',
        phone: '08012345678',
        address: '10 Innovation Way',
        city: 'Yaba',
        state: 'Lagos',
        taxId: 'TIN-112233',
        notes: 'VIP Client',
        isActive: true,
        voucherBonusPct: null,
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-02-01'),
        card: {
          id: 'card-1',
          cardCode: 'CRD-1234',
          balance: 25000,
          isActive: true,
          createdAt: new Date('2026-01-01'),
        },
      };

      jest.spyOn(prisma.customer, 'findUnique').mockResolvedValue(mockCustomer);
      jest.spyOn(prisma.salesTransaction, 'aggregate').mockResolvedValue({
        _sum: { amount: 150000 as any },
        _count: 3,
        _max: { transactionDate: new Date('2026-03-01') },
        _min: { transactionDate: new Date('2026-01-05') },
      } as any);

      jest.spyOn(prisma.customerCredit, 'aggregate').mockResolvedValue({
        _sum: { balance: 40000 as any },
      } as any);

      jest.spyOn(prisma.customerCredit, 'count').mockResolvedValue(2);
      jest.spyOn(prisma.invoice, 'count').mockResolvedValue(4);
      jest.spyOn(prisma.creditPayment, 'count').mockResolvedValue(1);

      const result = await customerService.getCustomerDetail(userId, businessId, customerId);

      expect(result.customer.name).toBe('Ada Lovelace');
      expect(result.card?.cardCode).toBe('CRD-1234');
      expect(result.card?.balance).toBe(25000);
      expect(result.kpis.orderCount).toBe(3);
      expect(result.kpis.totalSpent).toBe(150000);
      expect(result.kpis.avgOrder).toBe(50000);
      expect(result.kpis.outstandingCredit).toBe(40000);
      expect(result.kpis.voucherBalance).toBe(25000);
      expect(result.kpis.totalInvoices).toBe(4);
      expect(result.kpis.totalCredits).toBe(2);
      expect(result.kpis.totalCreditPayments).toBe(1);
    });

    test('works for archived customer without throwing', async () => {
      const mockArchivedCustomer: any = {
        id: customerId,
        businessId,
        name: 'Archived Customer',
        email: null,
        phone: '08099991111',
        address: null,
        city: null,
        state: null,
        taxId: null,
        notes: null,
        isActive: false,
        voucherBonusPct: null,
        createdAt: new Date('2025-01-01'),
        updatedAt: new Date('2025-06-01'),
        card: null,
      };

      jest.spyOn(prisma.customer, 'findUnique').mockResolvedValue(mockArchivedCustomer);
      jest.spyOn(prisma.salesTransaction, 'aggregate').mockResolvedValue({
        _sum: { amount: null },
        _count: 0,
        _max: { transactionDate: null },
        _min: { transactionDate: null },
      } as any);
      jest.spyOn(prisma.customerCredit, 'aggregate').mockResolvedValue({
        _sum: { balance: null },
      } as any);
      jest.spyOn(prisma.customerCredit, 'count').mockResolvedValue(0);
      jest.spyOn(prisma.invoice, 'count').mockResolvedValue(0);
      jest.spyOn(prisma.creditPayment, 'count').mockResolvedValue(0);

      const result = await customerService.getCustomerDetail(userId, businessId, customerId);
      expect(result.customer.isActive).toBe(false);
      expect(result.kpis.orderCount).toBe(0);
      expect(result.kpis.totalSpent).toBe(0);
      expect(result.kpis.avgOrder).toBe(0);
      expect(result.card).toBeNull();
    });
  });

  describe('getCustomerHistory', () => {
    test('merges, sorts date descending, and paginates history across sources', async () => {
      jest.spyOn(prisma.customer, 'findUnique').mockResolvedValue({
        id: customerId,
        businessId,
      } as any);

      jest.spyOn(prisma.salesTransaction, 'findMany').mockResolvedValue([
        {
          id: 'sale-1',
          transactionDate: new Date('2026-03-10'),
          amount: 25000 as any,
          status: 'confirmed',
          description: 'POS Sale',
          source: 'pos',
          referenceId: 'REF-001',
          isTaxable: true,
        } as any,
      ]);
      jest.spyOn(prisma.salesTransaction, 'count').mockResolvedValue(1);

      jest.spyOn(prisma.invoice, 'findMany').mockResolvedValue([
        {
          id: 'inv-1',
          invoiceNumber: 'INV-2026-001',
          issueDate: new Date('2026-03-12'),
          total: 80000 as any,
          status: 'sent',
          notes: 'Net 30',
          dueDate: new Date('2026-04-12'),
          vatRate: 7.5 as any,
        } as any,
      ]);
      jest.spyOn(prisma.invoice, 'count').mockResolvedValue(1);

      jest.spyOn(prisma.customerCredit, 'findMany').mockResolvedValue([
        {
          id: 'cred-1',
          issueDate: new Date('2026-03-05'),
          totalAmount: 50000 as any,
          status: 'partially_paid',
          description: 'BNPL Purchase',
          notes: 'Two installments',
          balance: 20000 as any,
          amountPaid: 30000 as any,
          dueDate: new Date('2026-04-05'),
          linkedSaleId: 'sale-cred-1',
          payments: [
            {
              id: 'pay-1',
              paymentDate: new Date('2026-03-15'),
              amount: 30000 as any,
              paymentType: 'bank_transfer',
              notes: 'Part 1',
              isFullPayment: false,
            },
          ],
        } as any,
      ]);
      jest.spyOn(prisma.customerCredit, 'count').mockResolvedValue(1);

      jest.spyOn(prisma.customerCard, 'findUnique').mockResolvedValue(null);

      const result = await customerService.getCustomerHistory(userId, businessId, customerId, {
        page: 1,
        limit: 10,
      });

      expect(result.data.length).toBe(4);
      // Chronological descending: pay-1 (Mar 15), inv-1 (Mar 12), sale-1 (Mar 10), cred-1 (Mar 5)
      expect(result.data[0].kind).toBe('credit_payment');
      expect(result.data[0].amount).toBe(30000);
      expect(result.data[1].kind).toBe('invoice');
      expect(result.data[1].amount).toBe(80000);
      expect(result.data[2].kind).toBe('sale');
      expect(result.data[2].amount).toBe(25000);
      expect(result.data[3].kind).toBe('credit');
      expect(result.data[3].amount).toBe(50000);
    });

    test('applies in-memory kind filter when type parameter is provided', async () => {
      jest.spyOn(prisma.customer, 'findUnique').mockResolvedValue({
        id: customerId,
        businessId,
      } as any);

      jest.spyOn(prisma.salesTransaction, 'findMany').mockResolvedValue([
        {
          id: 'sale-1',
          transactionDate: new Date('2026-03-10'),
          amount: 25000 as any,
          status: 'confirmed',
          description: 'POS Sale',
          source: 'pos',
          referenceId: 'REF-001',
          isTaxable: true,
        } as any,
      ]);
      jest.spyOn(prisma.salesTransaction, 'count').mockResolvedValue(1);

      jest.spyOn(prisma.invoice, 'findMany').mockResolvedValue([
        {
          id: 'inv-1',
          invoiceNumber: 'INV-2026-001',
          issueDate: new Date('2026-03-12'),
          total: 80000 as any,
          status: 'sent',
          notes: 'Net 30',
          dueDate: new Date('2026-04-12'),
          vatRate: 7.5 as any,
        } as any,
      ]);
      jest.spyOn(prisma.invoice, 'count').mockResolvedValue(1);

      jest.spyOn(prisma.customerCredit, 'findMany').mockResolvedValue([]);
      jest.spyOn(prisma.customerCredit, 'count').mockResolvedValue(0);
      jest.spyOn(prisma.customerCard, 'findUnique').mockResolvedValue(null);

      const result = await customerService.getCustomerHistory(userId, businessId, customerId, {
        page: 1,
        limit: 10,
        type: 'invoice',
      });

      expect(result.data.length).toBe(1);
      expect(result.data[0].kind).toBe('invoice');
      expect(result.pagination.total).toBe(1);
    });
  });

  describe('updateCustomer', () => {
    test('throws 409 PHONE_ALREADY_EXISTS if phone matches another active customer in the same business', async () => {
      jest.spyOn(prisma.customer, 'findUnique').mockResolvedValue({
        id: customerId,
        businessId,
        name: 'Original Name',
        phone: '08011112222',
      } as any);

      jest.spyOn(prisma.customer, 'findMany').mockResolvedValue([
        {
          id: 'other-cust-id',
          businessId,
          phone: '+2348033334444',
          isActive: true,
        } as any,
      ]);

      await expect(
        customerService.updateCustomer(userId, businessId, customerId, {
          phone: '08033334444',
        })
      ).rejects.toThrow(AppError);

      try {
        await customerService.updateCustomer(userId, businessId, customerId, {
          phone: '08033334444',
        });
      } catch (err: any) {
        expect(err.statusCode).toBe(409);
        expect(err.code).toBe('PHONE_ALREADY_EXISTS');
      }
    });

    test('updates customer fields successfully and logs audit', async () => {
      const existing = {
        id: customerId,
        businessId,
        name: 'Old Name',
        phone: '08011112222',
        email: 'old@example.com',
        isActive: true,
      };
      jest.spyOn(prisma.customer, 'findUnique').mockResolvedValue(existing as any);
      jest.spyOn(prisma.customer, 'findMany').mockResolvedValue([]);

      const updated = {
        ...existing,
        name: 'New Name',
        city: 'Ikeja',
        voucherBonusPct: 3.5 as any,
      };
      jest.spyOn(prisma.customer, 'update').mockResolvedValue(updated as any);

      const result = await customerService.updateCustomer(userId, businessId, customerId, {
        name: 'New Name',
        city: 'Ikeja',
        voucherBonusPct: 3.5,
      });

      expect(result.name).toBe('New Name');
      expect(result.voucherBonusPct).toBe(3.5);
      expect(logAuditSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          userId,
          businessId,
          action: 'customer.updated',
          resourceType: 'customer',
          resourceId: customerId,
        })
      );
    });
  });

  describe('deleteCustomer', () => {
    test('throws 409 CUSTOMER_HAS_HISTORY if customer has any sales, invoices, credits, or card', async () => {
      jest.spyOn(prisma.customer, 'findUnique').mockResolvedValue({
        id: customerId,
        businessId,
      } as any);

      jest.spyOn(prisma.salesTransaction, 'count').mockResolvedValue(1);
      jest.spyOn(prisma.invoice, 'count').mockResolvedValue(0);
      jest.spyOn(prisma.customerCredit, 'count').mockResolvedValue(0);
      jest.spyOn(prisma.customerCard, 'count').mockResolvedValue(0);

      try {
        await customerService.deleteCustomer(userId, businessId, customerId);
        expect(true).toBe(false); // Should not reach
      } catch (err: any) {
        expect(err.statusCode).toBe(409);
        expect(err.code).toBe('CUSTOMER_HAS_HISTORY');
      }
    });

    test('deletes customer if zero history and logs audit', async () => {
      jest.spyOn(prisma.customer, 'findUnique').mockResolvedValue({
        id: customerId,
        businessId,
        name: 'Zero History Customer',
        phone: '08000000000',
        email: 'zero@example.com',
      } as any);

      jest.spyOn(prisma.salesTransaction, 'count').mockResolvedValue(0);
      jest.spyOn(prisma.invoice, 'count').mockResolvedValue(0);
      jest.spyOn(prisma.customerCredit, 'count').mockResolvedValue(0);
      jest.spyOn(prisma.customerCard, 'count').mockResolvedValue(0);
      jest.spyOn(prisma.customer, 'delete').mockResolvedValue({} as any);

      const result = await customerService.deleteCustomer(userId, businessId, customerId);
      expect(result.success).toBe(true);
      expect(prisma.customer.delete).toHaveBeenCalledWith({
        where: { id: customerId },
      });
      expect(logAuditSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          userId,
          businessId,
          action: 'customer.deleted',
          resourceId: customerId,
        })
      );
    });
  });

  describe('searchCustomers email enhancement in customer-card.service', () => {
    test('includes email in where.OR search conditions', async () => {
      const findManySpy = jest.spyOn(prisma.customer, 'findMany').mockResolvedValue([]);
      jest.spyOn(prisma.customer, 'count').mockResolvedValue(0);

      await customerCardService.searchCustomers(userId, businessId, {
        search: 'buyer@wallx.ng',
        page: 1,
        limit: 20,
      });

      expect(findManySpy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            businessId,
            isActive: true,
            OR: expect.arrayContaining([
              { email: { contains: 'buyer@wallx.ng', mode: 'insensitive' } },
            ]),
          }),
        })
      );
    });
  });
});
