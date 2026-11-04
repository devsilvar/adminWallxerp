import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import * as salesService from '../../src/services/sales/sales-crud.service';
import * as invoiceService from '../../src/services/invoice/invoice-crud.service';
import * as creditService from '../../src/services/credit.service';
import * as customerResolver from '../../src/services/customer-resolver.service';
import prisma from '../../src/lib/prisma';
import * as ownershipModule from '../../src/lib/ownership';
import * as auditModule from '../../src/lib/audit';
import * as monthLockModule from '../../src/shared/helpers/month-lock';
import { AppError } from '../../src/middleware/errorHandler';

describe('Customer Revenue Capture & Debtors Lock-Isolation Unit Tests', () => {
  const userId = 'usr-test-111';
  const businessId = 'biz-test-222';

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(ownershipModule, 'verifyBusinessAccess').mockResolvedValue({} as any);
    jest.spyOn(auditModule, 'logAudit').mockResolvedValue(undefined as any);
    jest.spyOn(monthLockModule, 'assertMonthNotLocked').mockResolvedValue(undefined);
  });

  describe('Sales Revenue Auto-Capture (sales-crud.service)', () => {
    test('auto-captures customer when phone provided in metadata and no customerId given', async () => {
      const mockCreatedCustomer = {
        id: 'cust-auto-1',
        businessId,
        name: 'John Doe',
        phone: '08012345678',
        email: null,
      };

      const resolverSpy = jest
        .spyOn(customerResolver, 'findOrCreateCustomerByIdentity')
        .mockResolvedValue({
          customer: mockCreatedCustomer as any,
          autoCreated: true,
        });

      const mockSale = {
        id: 'sale-1',
        businessId,
        amount: 5000,
        source: 'cash',
        status: 'confirmed',
        customerId: 'cust-auto-1',
        customerName: 'John Doe',
        transactionDate: new Date('2026-05-10'),
        metadata: { customerPhone: '08012345678' },
      };

      jest.spyOn(prisma, '$transaction').mockImplementation(async (callback: any) => {
        const mockTx: any = {
          customer: {
            findFirst: jest.fn(),
          },
          salesTransaction: {
            create: jest.fn().mockResolvedValue(mockSale),
          },
        };
        return callback(mockTx);
      });

      const result = await salesService.createSale(userId, businessId, {
        amount: 5000,
        source: 'cash',
        customerName: 'John Doe',
        transactionDate: new Date('2026-05-10'),
        metadata: { customerPhone: '08012345678' },
      });

      expect(resolverSpy).toHaveBeenCalledWith(
        businessId,
        {
          name: 'John Doe',
          phone: '08012345678',
          email: undefined,
        },
        expect.anything()
      );
      expect((result as any).customerId).toBe('cust-auto-1');
      expect((result as any).meta).toEqual({
        customerId: 'cust-auto-1',
        customerAutoCreated: true,
      });
    });

    test('does not auto-capture if only customerName is given (name-only gate)', async () => {
      const resolverSpy = jest.spyOn(customerResolver, 'findOrCreateCustomerByIdentity');

      const mockSale = {
        id: 'sale-2',
        businessId,
        amount: 3000,
        source: 'cash',
        status: 'confirmed',
        customerId: null,
        customerName: 'Anonymous Buyer',
        transactionDate: new Date('2026-05-10'),
        metadata: {},
      };

      jest.spyOn(prisma, '$transaction').mockImplementation(async (callback: any) => {
        const mockTx: any = {
          salesTransaction: {
            create: jest.fn().mockResolvedValue(mockSale),
          },
        };
        return callback(mockTx);
      });

      const result = await salesService.createSale(userId, businessId, {
        amount: 3000,
        source: 'cash',
        customerName: 'Anonymous Buyer',
        transactionDate: new Date('2026-05-10'),
        metadata: {},
      });

      expect(resolverSpy).not.toHaveBeenCalled();
      expect((result as any).customerId).toBeNull();
      expect((result as any).meta).toEqual({
        customerId: null,
        customerAutoCreated: undefined,
      });
    });

    test('throws 400 INVALID_CUSTOMER if explicit customerId belongs to another business', async () => {
      const foreignCustomerId = 'cust-foreign-999';

      jest.spyOn(prisma, '$transaction').mockImplementation(async (callback: any) => {
        const mockTx: any = {
          customer: {
            findFirst: jest.fn().mockResolvedValue(null),
          },
        };
        return callback(mockTx);
      });

      await expect(
        salesService.createSale(userId, businessId, {
          amount: 2500,
          source: 'cash',
          customerId: foreignCustomerId,
          transactionDate: new Date('2026-05-10'),
        })
      ).rejects.toThrow(AppError);
    });

    test('listSales filters by customerId when provided in query', async () => {
      const targetCustomerId = 'cust-target-123';
      const findManySpy = jest.spyOn(prisma.salesTransaction, 'findMany').mockResolvedValue([]);
      jest.spyOn(prisma.salesTransaction, 'count').mockResolvedValue(0);

      await salesService.listSales(userId, businessId, {
        page: 1,
        limit: 20,
        customerId: targetCustomerId,
      });

      expect(findManySpy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            businessId,
            customerId: targetCustomerId,
          }),
        })
      );
    });
  });

  describe('Invoice Customer Wiring (invoice-crud.service)', () => {
    test('createInvoice auto-resolves customer from phone or email', async () => {
      const mockCreatedCustomer = {
        id: 'cust-inv-1',
        businessId,
        name: 'Jane Smith',
        phone: '08099887766',
        email: 'jane@example.com',
      };

      jest
        .spyOn(customerResolver, 'findOrCreateCustomerByIdentity')
        .mockResolvedValue({
          customer: mockCreatedCustomer as any,
          autoCreated: true,
        });

      const mockInvoice = {
        id: 'inv-1',
        businessId,
        customerId: 'cust-inv-1',
        invoiceNumber: 'INV-2026-0001',
        customerName: 'Jane Smith',
        customerPhone: '08099887766',
        customerEmail: 'jane@example.com',
        lines: [],
      };

      jest.spyOn(prisma, '$transaction').mockImplementation(async (callback: any) => {
        const mockTx: any = {
          customer: { findFirst: jest.fn() },
          businessTaxProfile: { findUnique: jest.fn().mockResolvedValue(null) },
          invoice: {
            findFirst: jest.fn().mockResolvedValue(null),
            create: jest.fn().mockResolvedValue(mockInvoice),
          },
        };
        return callback(mockTx);
      });

      const invoice = await invoiceService.createInvoice(userId, businessId, {
        customerName: 'Jane Smith',
        customerPhone: '08099887766',
        customerEmail: 'jane@example.com',
        issueDate: new Date('2026-06-01'),
        dueDate: new Date('2026-06-15'),
        lines: [{ description: 'Consulting', quantity: 1, unitPrice: 50000 }],
      });

      expect((invoice as any).customerId).toBe('cust-inv-1');
    });

    test('createInvoice throws 400 INVALID_CUSTOMER if explicit customerId is foreign', async () => {
      jest.spyOn(prisma, '$transaction').mockImplementation(async (callback: any) => {
        const mockTx: any = {
          customer: { findFirst: jest.fn().mockResolvedValue(null) },
          businessTaxProfile: { findUnique: jest.fn().mockResolvedValue(null) },
          invoice: { findFirst: jest.fn().mockResolvedValue(null) },
        };
        return callback(mockTx);
      });

      await expect(
        invoiceService.createInvoice(userId, businessId, {
          customerId: 'cust-foreign-888',
          customerName: 'Foreign Buyer',
          issueDate: new Date('2026-06-01'),
          dueDate: new Date('2026-06-15'),
          lines: [{ description: 'Goods', quantity: 1, unitPrice: 10000 }],
        })
      ).rejects.toThrow(AppError);
    });

    test('markInvoicePaid attaches invoice customerId to created SalesTransaction', async () => {
      jest.spyOn(monthLockModule, 'resolveTransactionDateForLockedMonth').mockResolvedValue({
        effectiveDate: new Date('2026-05-05'),
        wasAdjusted: false,
      });

      const mockInvoice = {
        id: 'inv-paid-1',
        businessId,
        customerId: 'cust-linked-777',
        invoiceNumber: 'INV-2026-0002',
        customerName: 'Acme Corp',
        status: 'sent',
        issueDate: new Date('2026-05-01'),
        total: 75000,
        subtotal: 70000,
        vatAmount: 5000,
        discount: 0,
      };

      const mockSale = {
        id: 'sale-from-inv-1',
        businessId,
        customerId: 'cust-linked-777',
        amount: 75000,
      };

      let capturedSaleCreateData: any;

      jest.spyOn(prisma, '$transaction').mockImplementation(async (callback: any) => {
        const mockTx: any = {
          invoice: {
            findUnique: jest.fn().mockResolvedValue(mockInvoice),
            update: jest.fn().mockResolvedValue({ ...mockInvoice, status: 'paid', linkedSaleId: mockSale.id }),
          },
          salesTransaction: {
            create: jest.fn().mockImplementation((args: any) => {
              capturedSaleCreateData = args.data;
              return Promise.resolve(mockSale);
            }),
          },
        };
        return callback(mockTx);
      });

      await invoiceService.markInvoicePaid(userId, businessId, 'inv-paid-1', {
        paymentMethod: 'bank_transfer',
        paymentDate: new Date('2026-05-05'),
      });

      expect(capturedSaleCreateData.customerId).toBe('cust-linked-777');
    });

    test('reconcileDvaTransferToInvoice patches customerId onto reconciled SalesTransaction', async () => {
      const mockInvoice = {
        id: 'inv-dva-1',
        businessId,
        customerId: 'cust-dva-555',
        invoiceNumber: 'INV-2026-0003',
        customerName: 'Delta Services',
        status: 'sent',
        total: 100000,
        linkedSaleId: null,
      };

      const mockSale = {
        id: 'sale-dva-1',
        businessId,
        amount: 100000,
        source: 'bank_transfer',
        needsVerification: true,
        transactionDate: new Date('2026-05-15'),
        customerId: null,
        metadata: {},
      };

      let capturedSaleUpdateData: any;

      jest.spyOn(prisma, '$transaction').mockImplementation(async (callback: any) => {
        const mockTx: any = {
          salesTransaction: {
            findUnique: jest.fn().mockResolvedValue(mockSale),
            update: jest.fn().mockImplementation((args: any) => {
              capturedSaleUpdateData = args.data;
              return Promise.resolve({ ...mockSale, ...args.data });
            }),
          },
          invoice: {
            findUnique: jest.fn().mockResolvedValue(mockInvoice),
            findFirst: jest.fn().mockResolvedValue(null),
            update: jest.fn().mockResolvedValue({ ...mockInvoice, status: 'paid' }),
          },
          creditPayment: {
            findFirst: jest.fn().mockResolvedValue(null),
          },
          transactionClassification: {
            findFirst: jest.fn().mockResolvedValue({ id: 'cls-1', name: 'Product Sale' }),
          },
        };
        return callback(mockTx);
      });

      await invoiceService.reconcileDvaTransferToInvoice(userId, businessId, 'sale-dva-1', 'inv-dva-1');

      expect(capturedSaleUpdateData.customerId).toBe('cust-dva-555');
    });
  });

  describe('Debtors / BNPL Lock-Isolation & Customer Linking (credit.service)', () => {
    test('open month: resolves customer, links BOTH sale and credit to same customerId', async () => {
      jest.spyOn(monthLockModule, 'isMonthLockedOrFinalized').mockResolvedValue({
        isLocked: false,
        isFinalized: false,
        lockedOrFinalized: false,
      });

      const mockCustomer = {
        id: 'cust-credit-1',
        businessId,
        name: 'Chioma Okeke',
        email: 'chioma@example.com',
        phone: '08022334455',
      };

      jest
        .spyOn(customerResolver, 'findOrCreateCustomerByIdentity')
        .mockResolvedValue({
          customer: mockCustomer as any,
          autoCreated: true,
        });

      let capturedSaleData: any;
      let capturedCreditData: any;

      jest.spyOn(prisma, '$transaction').mockImplementation(async (callback: any) => {
        const mockTx: any = {
          customer: { findFirst: jest.fn() },
          transactionClassification: {
            findFirst: jest.fn().mockResolvedValue({ id: 'cls-credit', name: 'Credit Sale' }),
          },
          salesTransaction: {
            create: jest.fn().mockImplementation((args: any) => {
              capturedSaleData = args.data;
              return Promise.resolve({ id: 'sale-credit-1', ...args.data });
            }),
          },
          customerCredit: {
            create: jest.fn().mockImplementation((args: any) => {
              capturedCreditData = args.data;
              return Promise.resolve({ id: 'cred-1', ...args.data });
            }),
          },
        };
        return callback(mockTx);
      });

      const result = await creditService.createCredit(userId, businessId, {
        customerName: 'Chioma Okeke',
        customerEmail: 'chioma@example.com',
        customerPhone: '08022334455',
        totalAmount: 40000,
        issueDate: new Date('2026-06-01'),
        dueDate: new Date('2026-06-30'),
      });

      expect(capturedSaleData.customerId).toBe('cust-credit-1');
      expect(capturedCreditData.customerId).toBe('cust-credit-1');
      expect(capturedCreditData.linkedSaleId).toBe('sale-credit-1');
      expect((result as any).meta?.revenueDeferred).toBeUndefined();
    });

    test('locked month: creates CustomerCredit with linkedSaleId: null and meta.revenueDeferred: true (never 423)', async () => {
      jest.spyOn(monthLockModule, 'isMonthLockedOrFinalized').mockResolvedValue({
        isLocked: true,
        isFinalized: false,
        lockedOrFinalized: true,
      });

      const mockCustomer = {
        id: 'cust-credit-2',
        businessId,
        name: 'Emeka Obi',
        email: 'emeka@example.com',
        phone: '08033445566',
      };

      jest
        .spyOn(customerResolver, 'findOrCreateCustomerByIdentity')
        .mockResolvedValue({
          customer: mockCustomer as any,
          autoCreated: false,
        });

      const salesCreateSpy = jest.fn();
      let capturedCreditData: any;

      jest.spyOn(prisma, '$transaction').mockImplementation(async (callback: any) => {
        const mockTx: any = {
          customer: { findFirst: jest.fn() },
          salesTransaction: {
            create: salesCreateSpy,
          },
          customerCredit: {
            create: jest.fn().mockImplementation((args: any) => {
              capturedCreditData = args.data;
              return Promise.resolve({ id: 'cred-locked-1', ...args.data });
            }),
          },
        };
        return callback(mockTx);
      });

      const result = await creditService.createCredit(userId, businessId, {
        customerName: 'Emeka Obi',
        customerEmail: 'emeka@example.com',
        customerPhone: '08033445566',
        totalAmount: 25000,
        issueDate: new Date('2026-01-15'),
        dueDate: new Date('2026-02-15'),
      });

      // SalesTransaction leg must NOT be created
      expect(salesCreateSpy).not.toHaveBeenCalled();

      // CustomerCredit debtor must STILL be registered
      expect(capturedCreditData.customerId).toBe('cust-credit-2');
      expect(capturedCreditData.linkedSaleId).toBeNull();
      expect(capturedCreditData.notes).toContain('[Revenue deferred — issue month locked]');

      // Result includes meta with revenueDeferred
      expect((result as any).meta).toEqual({
        revenueDeferred: true,
        reason: 'PERIOD_LOCKED',
      });
    });

    test('finalized month: creates CustomerCredit with meta.reason: PERIOD_FINALIZED and linkedSaleId: null', async () => {
      jest.spyOn(monthLockModule, 'isMonthLockedOrFinalized').mockResolvedValue({
        isLocked: false,
        isFinalized: true,
        lockedOrFinalized: true,
      });

      const mockCustomer = {
        id: 'cust-credit-3',
        businessId,
        name: 'Fatima Bello',
        email: 'fatima@example.com',
      };

      jest
        .spyOn(customerResolver, 'findOrCreateCustomerByIdentity')
        .mockResolvedValue({
          customer: mockCustomer as any,
          autoCreated: false,
        });

      let capturedCreditData: any;

      jest.spyOn(prisma, '$transaction').mockImplementation(async (callback: any) => {
        const mockTx: any = {
          customer: { findFirst: jest.fn() },
          salesTransaction: { create: jest.fn() },
          customerCredit: {
            create: jest.fn().mockImplementation((args: any) => {
              capturedCreditData = args.data;
              return Promise.resolve({ id: 'cred-finalized-1', ...args.data });
            }),
          },
        };
        return callback(mockTx);
      });

      const result = await creditService.createCredit(userId, businessId, {
        customerName: 'Fatima Bello',
        customerEmail: 'fatima@example.com',
        totalAmount: 18000,
        issueDate: new Date('2026-02-10'),
        dueDate: new Date('2026-03-10'),
      });

      expect(capturedCreditData.linkedSaleId).toBeNull();
      expect((result as any).meta).toEqual({
        revenueDeferred: true,
        reason: 'PERIOD_FINALIZED',
      });
    });

    test('throws 400 INVALID_CUSTOMER if explicit customerId belongs to another business', async () => {
      jest.spyOn(prisma, '$transaction').mockImplementation(async (callback: any) => {
        const mockTx: any = {
          customer: { findFirst: jest.fn().mockResolvedValue(null) },
        };
        return callback(mockTx);
      });

      await expect(
        creditService.createCredit(userId, businessId, {
          customerId: 'cust-foreign-777',
          customerName: 'Foreign Debtor',
          customerEmail: 'foreign@example.com',
          totalAmount: 15000,
          issueDate: new Date('2026-06-01'),
          dueDate: new Date('2026-06-30'),
        })
      ).rejects.toThrow(AppError);
    });
  });
});
