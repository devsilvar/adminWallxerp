import prisma from '@/lib/prisma';
import { writeOffCredit } from '@/services/credit.service';
import { updateExpense, deleteExpense } from '@/services/expense/expense.service';
import { generateReminders, sweepCreditReminders } from '@/services/reminder/reminder-generation.service';
import { AppError } from '@/middleware/errorHandler';

jest.mock('@/lib/audit', () => ({
  logAudit: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/lib/email', () => ({
  sendEmail: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/services/email-dispatch.service', () => {
  const actual = jest.requireActual('@/services/email-dispatch.service');
  return {
    ...actual,
    dispatchDebtorDueOwnerEmail: jest.fn().mockResolvedValue(undefined),
    dispatchTaxDueDateEmail: jest.fn().mockResolvedValue(undefined),
    dispatchPnlStatementReadyEmail: jest.fn().mockResolvedValue(undefined),
  };
});

jest.mock('@/lib/ownership', () => ({
  verifyBusinessOwnership: jest.fn().mockResolvedValue({
    id: 'biz-test-1',
    userId: 'user-test-1',
    taxReminderDay: 25,
  }),
  verifyBusinessAccess: jest.fn().mockResolvedValue({
    business: {
      id: 'biz-test-1',
      userId: 'user-test-1',
      taxReminderDay: 25,
    },
    role: 'owner',
    permissions: {},
    isOwner: true,
  }),
}));

const mockAssertMonthNotLocked = jest.fn().mockResolvedValue(undefined);
jest.mock('@/shared/helpers', () => {
  const actual = jest.requireActual('@/shared/helpers');
  return {
    ...actual,
    assertMonthNotLocked: (...args: any[]) => mockAssertMonthNotLocked(...args),
  };
});

describe('Senior QA Suite: Write-Off Auto-Deduction & Period Integrity (CITA §25)', () => {
  const userId = 'user-test-1';
  const businessId = 'biz-test-1';
  const creditId = 'credit-test-1';

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Phase 1 & 3: writeOffCredit Auto-Deduction Mechanics', () => {
    it('creates deductible bad_debt expense and updates credit status to written_off', async () => {
      const mockCredit = {
        id: creditId,
        businessId,
        customerName: 'Adebayo Garba',
        totalAmount: 100000,
        amountPaid: 35000,
        balance: 65000,
        status: 'partially_paid',
        notes: null,
      };

      const mockExpense = {
        id: 'expense-auto-1',
        businessId,
        category: 'bad_debt',
        description: 'Bad debt write-off: Adebayo Garba — ₦65,000 uncollected (CITA §25)',
        amount: 65000,
        quantity: 1,
        unitPrice: 65000,
        isDeductible: true,
        linkedCreditId: creditId,
      };

      const mockTx = {
        customerCredit: {
          findUnique: jest.fn().mockResolvedValue(mockCredit),
          update: jest.fn().mockResolvedValue({ ...mockCredit, status: 'written_off' }),
        },
        expense: {
          create: jest.fn().mockResolvedValue(mockExpense),
        },
      };

      jest.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) => cb(mockTx));

      const res = await writeOffCredit(userId, businessId, creditId, {
        reason: 'Customer untraceable after 90 days',
      });

      expect(res.status).toBe('written_off');
      expect(res.badDebtExpense).toEqual({ id: 'expense-auto-1', amount: 65000 });

      // Verifies the auto-created expense uses the remaining balance (65,000), NOT totalAmount (100,000)
      expect(mockTx.expense.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          businessId,
          category: 'bad_debt',
          amount: 65000,
          unitPrice: 65000,
          quantity: 1,
          isDeductible: true,
          linkedCreditId: creditId,
        }),
      });
    });

    it('rejects write-off if credit is already settled or written off', async () => {
      const mockCredit = {
        id: creditId,
        businessId,
        balance: 0,
        status: 'written_off',
      };

      const mockTx = {
        customerCredit: {
          findUnique: jest.fn().mockResolvedValue(mockCredit),
        },
      };

      jest.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) => cb(mockTx));

      await expect(
        writeOffCredit(userId, businessId, creditId, { reason: 'Duplicate write off' })
      ).rejects.toThrow('Credit is already settled or written off');
    });

    it('rejects write-off and aborts transaction if target tax period is locked/finalized', async () => {
      const mockCredit = {
        id: creditId,
        businessId,
        balance: 50000,
        status: 'unpaid',
      };

      const mockTx = {
        customerCredit: {
          findUnique: jest.fn().mockResolvedValue(mockCredit),
          update: jest.fn(),
        },
        expense: {
          create: jest.fn(),
        },
      };

      mockAssertMonthNotLocked.mockRejectedValueOnce(
        new AppError(423, 'Period locked - tax has been finalized', 'PERIOD_LOCKED')
      );

      jest.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) => cb(mockTx));

      await expect(
        writeOffCredit(userId, businessId, creditId, { reason: 'Write off in locked period' })
      ).rejects.toThrow('Period locked - tax has been finalized');

      // Neither the credit status nor the expense should be created
      expect(mockTx.customerCredit.update).not.toHaveBeenCalled();
      expect(mockTx.expense.create).not.toHaveBeenCalled();
    });
  });

  describe('Phase 2 & 4: Expense Immutability & Protection Guards', () => {
    it('blocks update on auto-created bad-debt expense with 403 SYSTEM_EXPENSE_PROTECTED', async () => {
      jest.spyOn(prisma.expense, 'findUnique').mockResolvedValue({
        id: 'expense-auto-1',
        businessId,
        amount: 65000,
        linkedCreditId: creditId,
        expenseDate: new Date(),
      } as any);

      await expect(
        updateExpense(userId, businessId, 'expense-auto-1', { amount: 50000 })
      ).rejects.toThrow('This expense was auto-created from a bad debt write-off and cannot be edited.');
    });

    it('blocks deletion on auto-created bad-debt expense with 403 SYSTEM_EXPENSE_PROTECTED', async () => {
      jest.spyOn(prisma.expense, 'findUnique').mockResolvedValue({
        id: 'expense-auto-1',
        businessId,
        amount: 65000,
        linkedCreditId: creditId,
        expenseDate: new Date(),
      } as any);

      await expect(
        deleteExpense(userId, businessId, 'expense-auto-1')
      ).rejects.toThrow('This expense was auto-created from a bad debt write-off and cannot be deleted.');
    });

    it('allows normal expenses (without linkedCreditId) to be updated and deleted without guard interference', async () => {
      const normalExpense = {
        id: 'expense-normal-1',
        businessId,
        amount: 25000,
        category: 'rent',
        linkedCreditId: null,
        expenseDate: new Date(),
      };

      jest.spyOn(prisma.expense, 'findUnique').mockResolvedValue(normalExpense as any);
      jest.spyOn(prisma.expense, 'update').mockResolvedValue({ ...normalExpense, amount: 30000 } as any);
      jest.spyOn(prisma.expense, 'delete').mockResolvedValue(normalExpense as any);

      const updated = await updateExpense(userId, businessId, 'expense-normal-1', { amount: 30000 });
      expect(updated.amount).toBe(30000);

      const deleted = await deleteExpense(userId, businessId, 'expense-normal-1');
      expect(deleted).toEqual({ message: 'Expense deleted successfully' });
    });
  });

  describe('Phase 5: Manual Reminder Generation & Credit Overdue Sweep Integration', () => {
    it('executes sweepCreditReminders directly and generates debtor overdue notifications', async () => {
      const overdueCredit = {
        id: 'credit-overdue-1',
        businessId,
        customerName: 'Obinna Okafor',
        customerEmail: 'obinna@example.com',
        customerPhone: '08012345678',
        totalAmount: 50000,
        balance: 50000,
        dueDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
        reminderDate: null,
        status: 'unpaid',
        lastReminderSentAt: null,
        business: {
          businessName: 'Acme Enterprise',
          virtualAccountBank: 'Wema Bank',
          virtualAccountNumber: '9912345678',
        },
      };

      jest.spyOn(prisma.customerCredit, 'findMany').mockResolvedValue([overdueCredit as any]);
      jest.spyOn(prisma.customerCredit, 'updateMany').mockResolvedValue({ count: 1 });
      jest.spyOn(prisma.customerCredit, 'update').mockResolvedValue({} as any);
      jest.spyOn(prisma.reminder, 'findFirst').mockResolvedValue(null);
      jest.spyOn(prisma.reminder, 'create').mockResolvedValue({ id: 'rem-debtor-1' } as any);

      const sweepResult = await sweepCreditReminders(businessId);

      expect(sweepResult.remindersCreated).toBe(1);
      expect(sweepResult.statusFlipped).toBe(1);
      expect(sweepResult.emailsSent).toBe(1);
      expect(prisma.customerCredit.updateMany).toHaveBeenCalledWith({
        where: { id: overdueCredit.id, status: { in: ['unpaid', 'partially_paid'] } },
        data: { status: 'overdue' },
      });
    });

    it('generateReminders runs credit sweep and returns aggregated debtor metrics', async () => {
      // Mock existing monthly tax report
      jest.spyOn(prisma.monthlyTaxReport, 'findUnique').mockResolvedValue({
        id: 'report-1',
        isLocked: false,
        paymentStatus: 'pending',
      } as any);

      jest.spyOn(prisma.reminder, 'findFirst').mockResolvedValue(null);
      jest.spyOn(prisma.reminder, 'create').mockResolvedValue({ id: 'rem-1' } as any);

      // Mock overdue credit list
      const overdueCredit = {
        id: 'credit-overdue-2',
        businessId,
        customerName: 'Chidi Nwosu',
        customerEmail: 'chidi@example.com',
        customerPhone: '08098765432',
        totalAmount: 40000,
        balance: 40000,
        dueDate: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
        reminderDate: null,
        status: 'unpaid',
        lastReminderSentAt: null,
        business: {
          businessName: 'Acme Enterprise',
          virtualAccountBank: 'Wema Bank',
          virtualAccountNumber: '9912345678',
        },
      };

      jest.spyOn(prisma.customerCredit, 'findMany').mockResolvedValue([overdueCredit as any]);
      jest.spyOn(prisma.customerCredit, 'updateMany').mockResolvedValue({ count: 1 });
      jest.spyOn(prisma.customerCredit, 'update').mockResolvedValue({} as any);

      // Mock invoices query for sweepOverdueInvoicesForBusiness
      jest.spyOn(prisma.invoice, 'findMany').mockResolvedValue([]);

      const result = await generateReminders(userId, businessId, 3, 2026);

      expect(result).toHaveProperty('creditRemindersCreated');
      expect(result).toHaveProperty('creditStatusFlipped');
      expect(result).toHaveProperty('creditEmailsSent');
      expect(result.creditRemindersCreated).toBe(1);
      expect(result.creditStatusFlipped).toBe(1);
      expect(result.creditEmailsSent).toBe(1);
    });
  });
});
