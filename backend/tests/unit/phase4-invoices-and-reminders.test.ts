import prisma from '@/lib/prisma';
import * as emailDispatch from '@/services/email-dispatch.service';
import * as emailLib from '@/lib/email';
import {
  ensurePnlStatementReminder,
  generateRemindersForAllBusinesses,
  sweepOverdueInvoicesForBusiness,
  sweepCreditReminders,
  sweepMonthEndConcludedReminders,
  isLastDayOfMonth,
} from '@/services/reminder/reminder-generation.service';

describe('Phase 4 — Invoices, P&L Statement Reminder & Daily Cron Sweep Email Hooks', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('ensurePnlStatementReminder', () => {
    it('creates pnl_statement_ready reminder and dispatches P&L email when created is true', async () => {
      jest.spyOn(prisma.reminder, 'findFirst').mockResolvedValue(null);
      jest.spyOn(prisma.reminder, 'create').mockResolvedValue({
        id: 'rem-pnl-1',
        businessId: 'biz-1',
        reminderType: 'pnl_statement_ready',
        scheduledDate: new Date(Date.UTC(2026, 2, 1)),
        message: 'Your Profit & Loss Statement for March 2026 is ready to download from Tax Reports.',
        isSent: false,
        sentAt: null,
        referenceType: null,
        referenceId: null,
        createdAt: new Date(),
      } as any);

      const pnlEmailSpy = jest
        .spyOn(emailDispatch, 'dispatchPnlStatementReadyEmail')
        .mockResolvedValue(undefined);

      const res = await ensurePnlStatementReminder({ id: 'biz-1', taxReminderDay: 21 }, 3, 2026);

      expect(res.created).toBe(true);
      expect(pnlEmailSpy).toHaveBeenCalledWith('biz-1', 3, 2026);
    });

    it('does NOT dispatch duplicate P&L email when reminder already exists for that month', async () => {
      jest.spyOn(prisma.reminder, 'findFirst').mockResolvedValue({
        id: 'rem-pnl-1',
        businessId: 'biz-1',
        reminderType: 'pnl_statement_ready',
      } as any);

      const pnlEmailSpy = jest
        .spyOn(emailDispatch, 'dispatchPnlStatementReadyEmail')
        .mockResolvedValue(undefined);

      const res = await ensurePnlStatementReminder({ id: 'biz-1', taxReminderDay: 21 }, 3, 2026);

      expect(res.created).toBe(false);
      expect(pnlEmailSpy).not.toHaveBeenCalled();
    });
  });

  describe('generateRemindersForAllBusinesses', () => {
    it('dispatches tax due date email and P&L statement ready email on business taxReminderDay', async () => {
      const now = new Date();
      const today = now.getDate();
      const currentMonth = now.getMonth() + 1;
      const currentYear = now.getFullYear();

      jest.spyOn(prisma.business, 'findMany').mockResolvedValue([
        {
          id: 'biz-cron-1',
          userId: 'user-cron-1',
          businessName: 'WallX Traders Ltd',
          taxReminderDay: today,
        },
      ] as any);

      jest.spyOn(prisma.monthlyTaxReport, 'findUnique').mockResolvedValue({
        isFinalized: true,
        isLocked: false,
        paymentStatus: 'pending',
      } as any);

      jest.spyOn(prisma.reminder, 'findFirst').mockResolvedValue(null);
      jest.spyOn(prisma.reminder, 'create').mockImplementation(async (args: any) => ({
        id: `rem-${args.data.reminderType}`,
        ...args.data,
      }));

      const taxEmailSpy = jest
        .spyOn(emailDispatch, 'dispatchTaxDueDateEmail')
        .mockResolvedValue(undefined);
      const pnlEmailSpy = jest
        .spyOn(emailDispatch, 'dispatchPnlStatementReadyEmail')
        .mockResolvedValue(undefined);

      const result = await generateRemindersForAllBusinesses();

      expect(result.processed).toBe(1);
      expect(result.created).toBe(1);
      expect(result.deadlinesCreated).toBe(1);
      expect(result.pnlCreated).toBe(1);

      expect(taxEmailSpy).toHaveBeenCalledWith(
        'biz-cron-1',
        currentMonth,
        currentYear,
        'unpaid_tax'
      );
      expect(taxEmailSpy).toHaveBeenCalledWith(
        'biz-cron-1',
        currentMonth,
        currentYear,
        'tax_deadline'
      );
      expect(pnlEmailSpy).toHaveBeenCalledWith('biz-cron-1', currentMonth, currentYear);
    });
  });

  describe('sweepOverdueInvoicesForBusiness', () => {
    it('dispatches overdue invoice email when overdue reminder is newly created', async () => {
      jest.spyOn(prisma.invoice, 'findMany').mockResolvedValue([
        {
          id: 'inv-overdue-1',
          businessId: 'biz-1',
          invoiceNumber: 'INV-2026-009',
          customerName: 'Apex Logistics',
          total: 250000,
          dueDate: new Date(Date.now() - 86400000 * 3),
        },
      ] as any);

      jest.spyOn(prisma.reminder, 'findFirst').mockResolvedValue(null);
      jest.spyOn(prisma.reminder, 'create').mockResolvedValue({
        id: 'rem-inv-1',
      } as any);
      jest.spyOn(prisma.invoice, 'updateMany').mockResolvedValue({ count: 1 });

      const overdueEmailSpy = jest
        .spyOn(emailDispatch, 'dispatchInvoiceOverdueEmail')
        .mockResolvedValue(undefined);

      const res = await sweepOverdueInvoicesForBusiness('biz-1');

      expect(res).toEqual({ remindersCreated: 1, statusFlipped: 1 });
      expect(overdueEmailSpy).toHaveBeenCalledWith('inv-overdue-1');
    });
  });

  describe('sweepCreditReminders', () => {
    it('dispatches debtor due owner email when credit_overdue reminder is newly created', async () => {
      jest.spyOn(prisma.customerCredit, 'findMany').mockResolvedValue([
        {
          id: 'credit-due-1',
          businessId: 'biz-1',
          customerName: 'Chief Obi',
          customerEmail: 'obi@client.ng',
          customerPhone: '08030000000',
          totalAmount: 150000,
          balance: 100000,
          dueDate: new Date(Date.now() - 86400000),
          reminderDate: null,
          status: 'unpaid',
          lastReminderSentAt: null,
          business: {
            businessName: 'WallX Traders Ltd',
            virtualAccountNumber: '9988776655',
            virtualAccountBank: 'Wema Bank',
          },
        },
      ] as any);

      jest.spyOn(prisma.customerCredit, 'updateMany').mockResolvedValue({ count: 1 });
      jest.spyOn(prisma.customerCredit, 'update').mockResolvedValue({} as any);
      jest.spyOn(prisma.reminder, 'findFirst').mockResolvedValue(null);
      jest.spyOn(prisma.reminder, 'create').mockResolvedValue({ id: 'rem-credit-1' } as any);
      jest.spyOn(emailLib, 'sendEmail').mockResolvedValue({ id: 'msg-1', delivered: true });

      const ownerEmailSpy = jest
        .spyOn(emailDispatch, 'dispatchDebtorDueOwnerEmail')
        .mockResolvedValue(undefined);

      const res = await sweepCreditReminders('biz-1');

      expect(res).toEqual({ remindersCreated: 1, statusFlipped: 1, emailsSent: 1 });
      expect(ownerEmailSpy).toHaveBeenCalledWith('credit-due-1');
    });
  });

  describe('isLastDayOfMonth', () => {
    it('returns true on the last calendar day of 31-day, 30-day, and February months', () => {
      expect(isLastDayOfMonth(new Date(2026, 0, 31))).toBe(true); // Jan 31
      expect(isLastDayOfMonth(new Date(2026, 1, 28))).toBe(true); // Feb 28 (non-leap)
      expect(isLastDayOfMonth(new Date(2026, 3, 30))).toBe(true); // Apr 30
    });

    it('returns false on non-final days of the month', () => {
      expect(isLastDayOfMonth(new Date(2026, 0, 15))).toBe(false);
      expect(isLastDayOfMonth(new Date(2026, 1, 27))).toBe(false);
      expect(isLastDayOfMonth(new Date(2026, 3, 29))).toBe(false);
    });
  });

  describe('sweepMonthEndConcludedReminders', () => {
    it('skips sweep when today is NOT the last day of the month', async () => {
      const midMonthDate = new Date(2026, 2, 15); // March 15
      jest.useFakeTimers();
      jest.setSystemTime(midMonthDate);

      const findManySpy = jest.spyOn(prisma.business, 'findMany');

      const res = await sweepMonthEndConcludedReminders();

      expect(res).toEqual({ processed: 0, created: 0 });
      expect(findManySpy).not.toHaveBeenCalled();

      jest.useRealTimers();
    });

    it('creates unfinalized_report reminder and dispatches email on the last day of the month for active reports', async () => {
      const lastDayDate = new Date(2026, 2, 31, 0, 30, 0); // March 31
      jest.useFakeTimers();
      jest.setSystemTime(lastDayDate);

      jest.spyOn(prisma.business, 'findMany').mockResolvedValue([
        { id: 'biz-month-end-1', businessName: 'WallX Lagos' },
      ] as any);

      jest.spyOn(prisma.monthlyTaxReport, 'findUnique').mockResolvedValue({
        isFinalized: false,
        isLocked: false,
      } as any);

      jest.spyOn(prisma.reminder, 'findFirst').mockResolvedValue(null);
      const reminderCreateSpy = jest.spyOn(prisma.reminder, 'create').mockResolvedValue({
        id: 'rem-last-day-1',
        reminderType: 'unfinalized_report',
      } as any);

      const emailSpy = jest
        .spyOn(emailDispatch, 'dispatchTaxDueDateEmail')
        .mockResolvedValue(undefined);

      const res = await sweepMonthEndConcludedReminders();

      expect(res.processed).toBe(1);
      expect(res.created).toBe(1);
      expect(reminderCreateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            businessId: 'biz-month-end-1',
            reminderType: 'unfinalized_report',
          }),
        })
      );
      expect(emailSpy).toHaveBeenCalledWith('biz-month-end-1', 3, 2026, 'unfinalized_report');

      jest.useRealTimers();
    });

    it('does NOT create reminder on last day if report is already finalized', async () => {
      const lastDayDate = new Date(2026, 2, 31, 0, 30, 0); // March 31
      jest.useFakeTimers();
      jest.setSystemTime(lastDayDate);

      jest.spyOn(prisma.business, 'findMany').mockResolvedValue([
        { id: 'biz-finalized-1', businessName: 'WallX Lagos' },
      ] as any);

      jest.spyOn(prisma.monthlyTaxReport, 'findUnique').mockResolvedValue({
        isFinalized: true,
        isLocked: false,
      } as any);

      const reminderCreateSpy = jest.spyOn(prisma.reminder, 'create');
      const emailSpy = jest.spyOn(emailDispatch, 'dispatchTaxDueDateEmail');

      const res = await sweepMonthEndConcludedReminders();

      expect(res.processed).toBe(1);
      expect(res.created).toBe(0);
      expect(reminderCreateSpy).not.toHaveBeenCalled();
      expect(emailSpy).not.toHaveBeenCalled();

      jest.useRealTimers();
    });
  });
});
