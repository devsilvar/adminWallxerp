import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import {
  normalizePhone,
  findOrCreateCustomerByIdentity,
} from '../../src/services/customer-resolver.service';
import {
  createSaleSchema,
  updateSaleSchema,
  salesQuerySchema,
} from '../../src/validators/sales.validator';
import {
  createInvoiceSchema,
  updateInvoiceSchema,
} from '../../src/validators/invoice.validator';
import {
  updateCustomerSchema,
  customerHistoryQuerySchema,
} from '../../src/validators/customer-card.validator';
import * as auditModule from '../../src/lib/audit';

describe('Customer Resolver Service & Validator Extensions', () => {
  describe('normalizePhone', () => {
    test('normalizes standard 11-digit local Nigerian phone numbers', () => {
      expect(normalizePhone('08031234567')).toBe('08031234567');
    });

    test('normalizes international phone format with plus sign', () => {
      expect(normalizePhone('+2348031234567')).toBe('2348031234567');
    });

    test('strips dashes and punctuation from formatted numbers', () => {
      expect(normalizePhone('803-123-4567')).toBe('8031234567');
    });

    test('strips spaces from formatted numbers', () => {
      expect(normalizePhone('+234 803 123 4567')).toBe('2348031234567');
    });

    test('returns null for empty strings, whitespace, null, and undefined', () => {
      expect(normalizePhone('')).toBeNull();
      expect(normalizePhone('   ')).toBeNull();
      expect(normalizePhone(null)).toBeNull();
      expect(normalizePhone(undefined)).toBeNull();
    });

    test('returns null for phone numbers with fewer than 7 digits', () => {
      expect(normalizePhone('123456')).toBeNull();
      expect(normalizePhone('abc-123')).toBeNull();
    });

    test('preserves valid phone numbers with 7 or more digits', () => {
      expect(normalizePhone('1234567')).toBe('1234567');
    });
  });

  describe('findOrCreateCustomerByIdentity', () => {
    const businessId = 'biz-test-123';
    let mockTx: any;
    let logAuditSpy: any;

    beforeEach(() => {
      mockTx = {
        customer: {
          findMany: jest.fn(),
          findFirst: jest.fn(),
          create: jest.fn(),
          update: jest.fn(),
        },
      };
      logAuditSpy = jest.spyOn(auditModule, 'logAudit').mockResolvedValue(undefined as any);
    });

    test('gates name-only identity and returns null without hitting DB', async () => {
      const result = await findOrCreateCustomerByIdentity(
        businessId,
        { name: 'John Doe', phone: '', email: null },
        mockTx
      );

      expect(result).toBeNull();
      expect(mockTx.customer.findMany).not.toHaveBeenCalled();
      expect(mockTx.customer.findFirst).not.toHaveBeenCalled();
      expect(mockTx.customer.create).not.toHaveBeenCalled();
    });

    test('matches existing customer by phone using last-10 exact comparison', async () => {
      const existingCustomer = {
        id: 'cust-1',
        businessId,
        name: 'Amina Bello',
        phone: '+2348031234567',
        email: 'amina@example.com',
        address: '12 Marina Road',
        isActive: true,
      };

      mockTx.customer.findMany.mockResolvedValue([existingCustomer]);

      const result = await findOrCreateCustomerByIdentity(
        businessId,
        { name: 'Amina', phone: '08031234567' },
        mockTx
      );

      expect(result).toEqual({
        customer: existingCustomer,
        autoCreated: false,
      });
      expect(mockTx.customer.findMany).toHaveBeenCalledWith({
        where: {
          businessId,
          isActive: true,
          phone: { contains: '4567' },
        },
      });
      expect(mockTx.customer.create).not.toHaveBeenCalled();
    });

    test('enriches null fields on existing customer without overwriting existing non-null data', async () => {
      const existingCustomer = {
        id: 'cust-2',
        businessId,
        name: 'Tunde Bakare',
        phone: '08022223333',
        email: null,
        address: null,
        isActive: true,
      };

      mockTx.customer.findMany.mockResolvedValue([existingCustomer]);
      const updatedCustomer = {
        ...existingCustomer,
        email: 'tunde@example.com',
        address: '5 Broad St, Lagos',
      };
      mockTx.customer.update.mockResolvedValue(updatedCustomer);

      const result = await findOrCreateCustomerByIdentity(
        businessId,
        {
          name: 'Different Name Should Not Overwrite',
          phone: '08022223333',
          email: 'tunde@example.com',
          address: '5 Broad St, Lagos',
        },
        mockTx
      );

      expect(mockTx.customer.update).toHaveBeenCalledWith({
        where: { id: 'cust-2' },
        data: {
          email: 'tunde@example.com',
          address: '5 Broad St, Lagos',
        },
      });
      expect(result).toEqual({
        customer: updatedCustomer,
        autoCreated: false,
      });
    });

    test('falls back to email matching when phone is absent', async () => {
      const existingCustomer = {
        id: 'cust-3',
        businessId,
        name: 'Chioma Okonkwo',
        phone: null,
        email: 'chioma@example.com',
        address: null,
        isActive: true,
      };

      mockTx.customer.findFirst.mockResolvedValue(existingCustomer);

      const result = await findOrCreateCustomerByIdentity(
        businessId,
        { email: 'CHIOMA@example.com' },
        mockTx
      );

      expect(mockTx.customer.findFirst).toHaveBeenCalledWith({
        where: {
          businessId,
          isActive: true,
          email: { equals: 'chioma@example.com', mode: 'insensitive' },
        },
      });
      expect(result).toEqual({
        customer: existingCustomer,
        autoCreated: false,
      });
    });

    test('auto-creates new Customer and logs audit when no match is found', async () => {
      mockTx.customer.findMany.mockResolvedValue([]);
      mockTx.customer.findFirst.mockResolvedValue(null);

      const createdCustomer = {
        id: 'cust-new-1',
        businessId,
        name: 'Emeka Chukwu',
        phone: '08099998888',
        email: 'emeka@example.com',
        address: '24 Awolowo Way',
        isActive: true,
      };
      mockTx.customer.create.mockResolvedValue(createdCustomer);

      const result = await findOrCreateCustomerByIdentity(
        businessId,
        {
          name: 'Emeka Chukwu',
          phone: '08099998888',
          email: 'emeka@example.com',
          address: '24 Awolowo Way',
        },
        mockTx
      );

      expect(mockTx.customer.create).toHaveBeenCalledWith({
        data: {
          businessId,
          name: 'Emeka Chukwu',
          phone: '08099998888',
          email: 'emeka@example.com',
          address: '24 Awolowo Way',
          isActive: true,
        },
      });
      expect(logAuditSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          businessId,
          action: 'customer.auto_created',
          resourceType: 'customer',
          resourceId: 'cust-new-1',
        }),
        mockTx
      );
      expect(result).toEqual({
        customer: createdCustomer,
        autoCreated: true,
      });
    });

    test('defaults to Walk-in Customer if name is omitted on auto-create', async () => {
      mockTx.customer.findMany.mockResolvedValue([]);
      mockTx.customer.findFirst.mockResolvedValue(null);

      const createdCustomer = {
        id: 'cust-new-2',
        businessId,
        name: 'Walk-in Customer',
        phone: '08055554444',
        email: null,
        address: null,
        isActive: true,
      };
      mockTx.customer.create.mockResolvedValue(createdCustomer);

      const result = await findOrCreateCustomerByIdentity(
        businessId,
        { phone: '08055554444' },
        mockTx
      );

      expect(mockTx.customer.create).toHaveBeenCalledWith({
        data: {
          businessId,
          name: 'Walk-in Customer',
          phone: '08055554444',
          email: null,
          address: null,
          isActive: true,
        },
      });
      expect(result?.customer.name).toBe('Walk-in Customer');
      expect(result?.autoCreated).toBe(true);
    });
  });

  describe('Validator Extensions', () => {
    const validUuid = '123e4567-e89b-12d3-a456-426614174000';

    test('createSaleSchema accepts customerId as UUID', () => {
      const parsed = createSaleSchema.parse({
        source: 'cash',
        amount: 5000,
        transactionDate: '2026-10-17',
        customerId: validUuid,
      });
      expect(parsed.customerId).toBe(validUuid);
    });

    test('updateSaleSchema accepts customerId as UUID', () => {
      const parsed = updateSaleSchema.parse({
        customerId: validUuid,
      });
      expect(parsed.customerId).toBe(validUuid);
    });

    test('salesQuerySchema accepts customerId as UUID filter', () => {
      const parsed = salesQuerySchema.parse({
        customerId: validUuid,
      });
      expect(parsed.customerId).toBe(validUuid);
    });

    test('createInvoiceSchema accepts customerId as UUID', () => {
      const parsed = createInvoiceSchema.parse({
        customerName: 'Invoice Client Ltd',
        customerId: validUuid,
        issueDate: '2026-10-17',
        dueDate: '2026-10-25',
        lines: [
          { description: 'Consulting', quantity: 1, unitPrice: 100000 },
        ],
      });
      expect(parsed.customerId).toBe(validUuid);
    });

    test('updateInvoiceSchema accepts customerId as UUID', () => {
      const parsed = updateInvoiceSchema.parse({
        customerId: validUuid,
      });
      expect(parsed.customerId).toBe(validUuid);
    });

    test('updateCustomerSchema validates partial fields correctly', () => {
      const parsed = updateCustomerSchema.parse({
        name: 'Updated Name',
        phone: '08012345678',
        city: 'Ikeja',
        state: 'Lagos',
        taxId: 'TIN-987654',
        isActive: false,
        voucherBonusPct: 2.5,
      });

      expect(parsed.name).toBe('Updated Name');
      expect(parsed.phone).toBe('08012345678');
      expect(parsed.city).toBe('Ikeja');
      expect(parsed.state).toBe('Lagos');
      expect(parsed.taxId).toBe('TIN-987654');
      expect(parsed.isActive).toBe(false);
      expect(parsed.voucherBonusPct).toBe(2.5);
    });

    test('customerHistoryQuerySchema applies defaults and validates timeline types', () => {
      const defaultParsed = customerHistoryQuerySchema.parse({});
      expect(defaultParsed.page).toBe(1);
      expect(defaultParsed.limit).toBe(20);
      expect(defaultParsed.type).toBeUndefined();

      const customParsed = customerHistoryQuerySchema.parse({
        page: '2',
        limit: '50',
        type: 'credit_payment',
        from: '2026-01-01',
        to: '2026-10-17',
        search: 'inv-001',
      });
      expect(customParsed.page).toBe(2);
      expect(customParsed.limit).toBe(50);
      expect(customParsed.type).toBe('credit_payment');
      expect(customParsed.from).toEqual(new Date('2026-01-01'));
      expect(customParsed.search).toBe('inv-001');
    });
  });
});
