import prisma from '@/lib/prisma';
import * as ownership from '@/lib/ownership';
import * as audit from '@/lib/audit';
import config from '@/config';
import { createInvoice, updateInvoice } from '@/services/invoice/invoice-crud.service';
import { AppError } from '@/middleware/errorHandler';

describe('Phase 5 — Invoice Server-Side Tax Policy Enforcement (TAX-05 / TAX-06)', () => {
  const userId = 'user-1';
  const businessId = 'biz-exempt-1';

  beforeEach(() => {
    jest.restoreAllMocks();

    // Mock $transaction to immediately execute callback with prisma
    jest.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) => cb(prisma));

    // Mock ownership & audit
    jest.spyOn(ownership, 'verifyBusinessAccess').mockResolvedValue({
      business: { id: businessId, userId } as any,
      role: 'owner',
      permissions: { 'invoices.create': true } as any,
      isOwner: true,
    });
    jest.spyOn(audit, 'logAudit').mockResolvedValue(undefined as any);
  });

  describe('createInvoice policy enforcement', () => {
    const baseInput = {
      customerName: 'Ayo Test',
      issueDate: new Date('2026-03-01'),
      dueDate: new Date('2026-03-15'),
      lines: [
        {
          description: 'Consulting',
          quantity: 1,
          unitPrice: 100000,
        },
      ],
    };

    it('exempt profile + no rate sent => creates invoice with vatRate 0 and 0 vatAmount', async () => {
      // Setup exempt profile (<25M)
      jest.spyOn(prisma.businessTaxProfile, 'findUnique').mockResolvedValue({
        completedAt: new Date(),
        computedConfig: {
          turnoverBand: 'UNDER_25M',
          entityType: 'LIMITED_COMPANY',
          vatExempt: true,
          mustChargeVat: false,
          vatRegistrationStatus: 'EXEMPT',
          incomeTaxType: 'CIT',
          citRate: 0,
          devLevyRate: 0,
          reviewReasons: ['Turnover under ₦25M is exempt from VAT under NTA 2025 s.198'],
        },
      } as any);

      jest.spyOn(prisma.invoice, 'findFirst').mockResolvedValue(null);
      const createSpy = jest.spyOn(prisma.invoice, 'create').mockImplementation(async (args: any) => {
        return {
          id: 'inv-1',
          ...args.data,
          lines: args.data.lines?.create || [],
        };
      });

      const res = await createInvoice(userId, businessId, {
        ...baseInput,
        vatRate: undefined, // No rate specified
      });

      expect(createSpy).toHaveBeenCalledTimes(1);
      const data = createSpy.mock.calls[0][0].data;
      expect(data.vatRate).toBe(0);
      expect(data.subtotal).toBe(100000);
      expect(data.vatAmount).toBe(0);
      expect(data.total).toBe(100000);
      expect(res.vatRate).toBe(0);
    });

    it('exempt profile + non-zero rate sent (7.5) => throws 422 VAT_EXEMPT_BUSINESS with profile reason', async () => {
      jest.spyOn(prisma.businessTaxProfile, 'findUnique').mockResolvedValue({
        completedAt: new Date(),
        computedConfig: {
          turnoverBand: 'UNDER_25M',
          vatExempt: true,
          mustChargeVat: false,
          vatRegistrationStatus: 'EXEMPT',
          reviewReasons: ['Small company turnover under ₦25M is statutory exempt'],
        },
      } as any);

      await expect(
        createInvoice(userId, businessId, {
          ...baseInput,
          vatRate: 7.5, // Explicitly sending 7.5 when exempt
        }),
      ).rejects.toThrow(
        expect.objectContaining({
          statusCode: 422,
          code: 'VAT_EXEMPT_BUSINESS',
          message: expect.stringContaining('Small company turnover under ₦25M is statutory exempt'),
        }),
      );
    });

    it('default profile (unprofiled) + no rate sent => creates invoice with config default rate (7.5)', async () => {
      // No profile found => source: 'DEFAULT'
      jest.spyOn(prisma.businessTaxProfile, 'findUnique').mockResolvedValue(null);
      jest.spyOn(prisma.invoice, 'findFirst').mockResolvedValue(null);

      const createSpy = jest.spyOn(prisma.invoice, 'create').mockImplementation(async (args: any) => {
        return {
          id: 'inv-default-1',
          ...args.data,
          lines: args.data.lines?.create || [],
        };
      });

      const res = await createInvoice(userId, businessId, {
        ...baseInput,
        vatRate: undefined,
      });

      expect(createSpy).toHaveBeenCalledTimes(1);
      const data = createSpy.mock.calls[0][0].data;
      expect(data.vatRate).toBe(config.tax.defaultRate); // 7.5
      expect(data.subtotal).toBe(100000);
      expect(data.vatAmount).toBe(7500);
      expect(data.total).toBe(107500);
      expect(res.vatRate).toBe(config.tax.defaultRate);
    });

    it('chargeable profile + custom rate sent (5.0) => respects custom rate', async () => {
      jest.spyOn(prisma.businessTaxProfile, 'findUnique').mockResolvedValue({
        completedAt: new Date(),
        computedConfig: {
          turnoverBand: 'ABOVE_100M',
          vatExempt: false,
          mustChargeVat: true,
          vatRegistrationStatus: 'REGISTERED',
          reviewReasons: [],
        },
      } as any);

      jest.spyOn(prisma.invoice, 'findFirst').mockResolvedValue(null);
      const createSpy = jest.spyOn(prisma.invoice, 'create').mockImplementation(async (args: any) => {
        return {
          id: 'inv-custom-1',
          ...args.data,
          lines: args.data.lines?.create || [],
        };
      });

      const res = await createInvoice(userId, businessId, {
        ...baseInput,
        vatRate: 5.0,
      });

      const data = createSpy.mock.calls[0][0].data;
      expect(data.vatRate).toBe(5.0);
      expect(data.subtotal).toBe(100000);
      expect(data.vatAmount).toBe(5000);
      expect(data.total).toBe(105000);
    });
  });

  describe('updateInvoice policy enforcement', () => {
    const existingDraft = {
      id: 'inv-draft-1',
      businessId,
      status: 'draft',
      vatRate: 7.5,
      discount: 0,
      subtotal: 100000,
      vatAmount: 7500,
      total: 107500,
      lines: [
        {
          id: 'line-1',
          description: 'Consulting',
          quantity: 1,
          unitPrice: 100000,
        },
      ],
    };

    it('exempt profile + changing the rate to a different non-zero value (10) => throws 422 VAT_EXEMPT_BUSINESS', async () => {
      jest.spyOn(prisma.invoice, 'findUnique').mockResolvedValue(existingDraft as any);
      jest.spyOn(prisma.businessTaxProfile, 'findUnique').mockResolvedValue({
        completedAt: new Date(),
        computedConfig: {
          turnoverBand: 'UNDER_25M',
          vatExempt: true,
          mustChargeVat: false,
          reviewReasons: ['Turnover under ₦25M'],
        },
      } as any);

      await expect(
        updateInvoice(userId, businessId, 'inv-draft-1', {
          vatRate: 10,
        }),
      ).rejects.toThrow(
        expect.objectContaining({
          statusCode: 422,
          code: 'VAT_EXEMPT_BUSINESS',
        }),
      );
    });

    it('exempt profile + re-sending the stored rate (7.5) => edit succeeds and the stored rate is not rewritten', async () => {
      jest.spyOn(prisma.invoice, 'findUnique').mockResolvedValue(existingDraft as any);
      jest.spyOn(prisma.businessTaxProfile, 'findUnique').mockResolvedValue({
        completedAt: new Date(),
        computedConfig: {
          turnoverBand: 'UNDER_25M',
          vatExempt: true,
          mustChargeVat: false,
          reviewReasons: ['Turnover under ₦25M'],
        },
      } as any);

      const updateSpy = jest.spyOn(prisma.invoice, 'update').mockImplementation(async (args: any) => {
        return { ...existingDraft, ...args.data };
      });

      await updateInvoice(userId, businessId, 'inv-draft-1', {
        customerName: 'Renamed Customer',
        vatRate: 7.5,
      });

      expect(updateSpy).toHaveBeenCalledTimes(1);
      const data = updateSpy.mock.calls[0][0].data;
      expect(data.customerName).toBe('Renamed Customer');
      // Unchanged rate must not be rewritten — the invoice keeps its 7.5 untouched
      expect(data.vatRate).toBeUndefined();
    });

    it('exempt profile + only the stored rate sent => performs no write at all', async () => {
      jest.spyOn(prisma.invoice, 'findUnique').mockResolvedValue(existingDraft as any);
      jest.spyOn(prisma.businessTaxProfile, 'findUnique').mockResolvedValue({
        completedAt: new Date(),
        computedConfig: {
          turnoverBand: 'UNDER_25M',
          vatExempt: true,
          mustChargeVat: false,
          reviewReasons: ['Turnover under ₦25M'],
        },
      } as any);
      jest.spyOn(prisma.invoice, 'findUniqueOrThrow').mockResolvedValue(existingDraft as any);
      const updateSpy = jest.spyOn(prisma.invoice, 'update');

      await updateInvoice(userId, businessId, 'inv-draft-1', { vatRate: 7.5 });

      expect(updateSpy).not.toHaveBeenCalled();
    });

    it('exempt profile + updating lines without providing vatRate => retains stored vatRate (forward-only, no zeroing)', async () => {
      jest.spyOn(prisma.invoice, 'findUnique').mockResolvedValue(existingDraft as any);
      jest.spyOn(prisma.businessTaxProfile, 'findUnique').mockResolvedValue({
        completedAt: new Date(),
        computedConfig: {
          turnoverBand: 'UNDER_25M',
          vatExempt: true,
          mustChargeVat: false,
          reviewReasons: ['Turnover under ₦25M'],
        },
      } as any);
      jest.spyOn(prisma.invoiceLine, 'deleteMany').mockResolvedValue({ count: 1 });
      jest.spyOn(prisma.invoiceLine, 'createMany').mockResolvedValue({ count: 1 });

      const updateSpy = jest.spyOn(prisma.invoice, 'update').mockImplementation(async (args: any) => {
        return {
          ...existingDraft,
          ...args.data,
        };
      });

      // Update lines only (quantity 2 -> 200,000 subtotal)
      const res = await updateInvoice(userId, businessId, 'inv-draft-1', {
        lines: [
          {
            description: 'Consulting extended',
            quantity: 2,
            unitPrice: 100000,
          },
        ],
      });

      expect(updateSpy).toHaveBeenCalledTimes(1);
      const data = updateSpy.mock.calls[0][0].data;
      // Stored rate (7.5) is preserved because vatRate was not changed
      expect(data.vatRate).toBe(7.5);
      expect(data.subtotal).toBe(200000);
      expect(data.vatAmount).toBe(15000);
      expect(data.total).toBe(215000);
    });

    it('exempt profile + updating invoice with vatRate 0 => succeeds with 0 VAT', async () => {
      jest.spyOn(prisma.invoice, 'findUnique').mockResolvedValue(existingDraft as any);
      jest.spyOn(prisma.businessTaxProfile, 'findUnique').mockResolvedValue({
        completedAt: new Date(),
        computedConfig: {
          turnoverBand: 'UNDER_25M',
          vatExempt: true,
          mustChargeVat: false,
          reviewReasons: ['Turnover under ₦25M'],
        },
      } as any);

      const updateSpy = jest.spyOn(prisma.invoice, 'update').mockImplementation(async (args: any) => {
        return {
          ...existingDraft,
          ...args.data,
        };
      });

      const res = await updateInvoice(userId, businessId, 'inv-draft-1', {
        vatRate: 0,
      });

      expect(updateSpy).toHaveBeenCalledTimes(1);
      const data = updateSpy.mock.calls[0][0].data;
      expect(data.vatRate).toBe(0);
      expect(data.subtotal).toBe(100000);
      expect(data.vatAmount).toBe(0);
      expect(data.total).toBe(100000);
    });
  });
});
