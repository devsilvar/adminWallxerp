import { describe, test, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { createCreditSchema, updateCreditSchema } from '@/validators/credit.validator';
import * as creditService from '@/services/credit.service';
import prisma from '@/lib/prisma';
import * as ownershipLib from '@/lib/ownership';
import * as emailLib from '@/lib/email';
import * as auditLib from '@/lib/audit';
import { AppError } from '@/middleware/errorHandler';

describe('Debtor Email Hardening Unit Tests', () => {
  describe('1. Credit Validator Unit Tests', () => {
    const baseValidCredit = {
      customerName: 'Alhaji Musa',
      customerEmail: 'musa@example.com',
      description: '30 Bags of Rice',
      totalAmount: 150000,
      issueDate: new Date('2026-10-01'),
      dueDate: new Date('2026-10-15'),
    };

    test('accepts valid customerEmail on create', () => {
      const parsed = createCreditSchema.parse({
        ...baseValidCredit,
        customerEmail: ' Alhaji.Musa@Example.COM ',
      });
      expect(parsed.customerEmail).toBe('Alhaji.Musa@Example.COM');
    });

    test('rejects empty string customerEmail on create', () => {
      expect(() => {
        createCreditSchema.parse({
          ...baseValidCredit,
          customerEmail: '',
        });
      }).toThrow('Customer email is required');
    });

    test('rejects missing customerEmail on create', () => {
      const { customerEmail, ...missingEmail } = baseValidCredit;
      expect(() => {
        createCreditSchema.parse(missingEmail);
      }).toThrow();
    });

    test('rejects invalid email format on create', () => {
      expect(() => {
        createCreditSchema.parse({
          ...baseValidCredit,
          customerEmail: 'not-an-email',
        });
      }).toThrow('Enter a valid email address');
    });

    test('rejects customerEmail longer than 200 characters on create', () => {
      const longEmail = 'a'.repeat(195) + '@example.com';
      expect(() => {
        createCreditSchema.parse({
          ...baseValidCredit,
          customerEmail: longEmail,
        });
      }).toThrow();
    });

    test('permits optional or empty customerEmail on update (legacy patch)', () => {
      const parsedEmpty = updateCreditSchema.parse({
        customerEmail: '',
      });
      expect(parsedEmpty.customerEmail).toBe('');

      const parsedOmitted = updateCreditSchema.parse({
        customerName: 'Updated Name',
      });
      expect(parsedOmitted.customerEmail).toBeUndefined();
    });

    test('rejects invalid email on update when non-empty', () => {
      expect(() => {
        updateCreditSchema.parse({
          customerEmail: 'invalid-email-string',
        });
      }).toThrow();
    });

    test('accepts valid email on update', () => {
      const parsed = updateCreditSchema.parse({
        customerEmail: 'new.debtor@example.com',
      });
      expect(parsed.customerEmail).toBe('new.debtor@example.com');
    });
  });

  describe('2. sendDebtorInfoEmail Service Unit Tests', () => {
    const mockUserId = 'usr-123';
    const mockBusinessId = 'biz-456';
    const mockCreditId = 'cred-789';

    beforeEach(() => {
      jest.clearAllMocks();
      jest.spyOn(ownershipLib, 'verifyBusinessAccess').mockResolvedValue(undefined as any);
      jest.spyOn(auditLib, 'logAudit').mockResolvedValue(undefined as any);
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    test('successfully sends debtor reminder email with balance and DVA details, bumps cooldown, and logs audit', async () => {
      const mockCredit = {
        id: mockCreditId,
        businessId: mockBusinessId,
        customerName: 'Chief Emeka',
        customerEmail: 'emeka@example.com',
        balance: 75000,
        totalAmount: 100000,
        amountPaid: 25000,
        dueDate: new Date('2026-10-25'),
        status: 'partially_paid',
        business: {
          businessName: 'Okafor Provisions Ltd',
          virtualAccountNumber: '9988776655',
          virtualAccountBank: 'Wema Bank',
          user: {
            email: 'owner@example.com',
            phone: '08012345678',
            virtualAccountNumber: null,
            virtualAccountBank: null,
          },
        },
      };

      jest.spyOn(prisma.customerCredit, 'findUnique').mockResolvedValue(mockCredit as any);
      jest.spyOn(prisma.customerCredit, 'update').mockResolvedValue({} as any);
      const sendEmailSpy = jest.spyOn(emailLib, 'sendEmail').mockResolvedValue({ delivered: true } as any);

      const result = await creditService.sendDebtorInfoEmail(mockUserId, mockBusinessId, mockCreditId);

      expect(result).toEqual({ delivered: true, to: 'emeka@example.com' });
      expect(sendEmailSpy).toHaveBeenCalledTimes(1);
      const emailArgs = sendEmailSpy.mock.calls[0][0];
      expect(emailArgs.to).toBe('emeka@example.com');
      expect(emailArgs.subject).toContain('Okafor Provisions Ltd');
      expect(emailArgs.subject).toContain('75,000');
      expect(emailArgs.html).toContain('Chief Emeka');
      expect(emailArgs.html).toContain('9988776655');
      expect(emailArgs.html).toContain('Wema Bank');

      expect(prisma.customerCredit.update).toHaveBeenCalledWith({
        where: { id: mockCreditId },
        data: { lastReminderSentAt: expect.any(Date) },
      });

      expect(auditLib.logAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: mockUserId,
          businessId: mockBusinessId,
          action: 'credit.debtor_emailed',
          resourceId: mockCreditId,
          newData: expect.objectContaining({
            to: 'emeka@example.com',
            delivered: true,
            amount: 75000,
            status: 'partially_paid',
          }),
        }),
      );
    });

    test('gracefully sends email without bank table when business and user have no DVA configured', async () => {
      const mockCredit = {
        id: mockCreditId,
        businessId: mockBusinessId,
        customerName: 'Madam Kemi',
        customerEmail: 'kemi@example.com',
        balance: 40000,
        totalAmount: 40000,
        dueDate: new Date('2026-10-20'),
        status: 'unpaid',
        business: {
          businessName: 'Kemi Supermarket',
          virtualAccountNumber: null,
          virtualAccountBank: null,
          user: {
            email: 'owner@example.com',
            phone: '08099998888',
            virtualAccountNumber: null,
            virtualAccountBank: null,
          },
        },
      };

      jest.spyOn(prisma.customerCredit, 'findUnique').mockResolvedValue(mockCredit as any);
      jest.spyOn(prisma.customerCredit, 'update').mockResolvedValue({} as any);
      const sendEmailSpy = jest.spyOn(emailLib, 'sendEmail').mockResolvedValue({ delivered: false } as any);

      const result = await creditService.sendDebtorInfoEmail(mockUserId, mockBusinessId, mockCreditId);

      expect(result).toEqual({ delivered: false, to: 'kemi@example.com' });
      expect(sendEmailSpy).toHaveBeenCalledTimes(1);
      const emailArgs = sendEmailSpy.mock.calls[0][0];
      // When bank details are absent, template omits settlement bank table
      expect(emailArgs.html).not.toContain('Settlement Bank Transfer Details');
    });

    test('refuses closed credit when status is paid', async () => {
      const mockCredit = {
        id: mockCreditId,
        businessId: mockBusinessId,
        status: 'paid',
        balance: 0,
        customerEmail: 'paid@example.com',
        business: { businessName: 'Test' },
      };
      jest.spyOn(prisma.customerCredit, 'findUnique').mockResolvedValue(mockCredit as any);

      await expect(
        creditService.sendDebtorInfoEmail(mockUserId, mockBusinessId, mockCreditId),
      ).rejects.toThrow(AppError);
    });

    test('refuses closed credit when status is written_off', async () => {
      const mockCredit = {
        id: mockCreditId,
        businessId: mockBusinessId,
        status: 'written_off',
        balance: 50000,
        customerEmail: 'baddebt@example.com',
        business: { businessName: 'Test' },
      };
      jest.spyOn(prisma.customerCredit, 'findUnique').mockResolvedValue(mockCredit as any);

      await expect(
        creditService.sendDebtorInfoEmail(mockUserId, mockBusinessId, mockCreditId),
      ).rejects.toThrow(AppError);
    });

    test('refuses send when balance is 0 even if status not yet updated', async () => {
      const mockCredit = {
        id: mockCreditId,
        businessId: mockBusinessId,
        status: 'unpaid',
        balance: 0,
        customerEmail: 'zero@example.com',
        business: { businessName: 'Test' },
      };
      jest.spyOn(prisma.customerCredit, 'findUnique').mockResolvedValue(mockCredit as any);

      await expect(
        creditService.sendDebtorInfoEmail(mockUserId, mockBusinessId, mockCreditId),
      ).rejects.toThrow('Debt is already settled');
    });

    test('refuses send when credit has no customerEmail recorded', async () => {
      const mockCredit = {
        id: mockCreditId,
        businessId: mockBusinessId,
        status: 'unpaid',
        balance: 50000,
        customerEmail: null,
        business: { businessName: 'Test' },
      };
      jest.spyOn(prisma.customerCredit, 'findUnique').mockResolvedValue(mockCredit as any);

      await expect(
        creditService.sendDebtorInfoEmail(mockUserId, mockBusinessId, mockCreditId),
      ).rejects.toThrow('Customer email is required to send debt information');
    });

    test('refuses send when credit does not exist or business mismatch (IDOR protection)', async () => {
      jest.spyOn(prisma.customerCredit, 'findUnique').mockResolvedValue(null);

      await expect(
        creditService.sendDebtorInfoEmail(mockUserId, mockBusinessId, 'non-existent-id'),
      ).rejects.toThrow('Credit not found');

      jest.spyOn(prisma.customerCredit, 'findUnique').mockResolvedValue({
        id: mockCreditId,
        businessId: 'other-biz',
      } as any);

      await expect(
        creditService.sendDebtorInfoEmail(mockUserId, mockBusinessId, mockCreditId),
      ).rejects.toThrow('Credit not found');
    });
  });
});
