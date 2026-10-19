import prisma from '@/lib/prisma';
import logger from '@/lib/logger';
import { logAudit } from '@/lib/audit';
import { formatNaira, formatDateISO } from '@/lib/format';
import { verifyBusinessAccess } from '@/lib/ownership';
import { sendEmail } from '@/lib/email';
import { generateDebtorReminderHtml, generateDebtorReminderText } from '@/lib/email/templates/debtor-reminder';
import {
  dispatchTaxDueDateEmail,
  dispatchPnlStatementReadyEmail,
  dispatchInvoiceOverdueEmail,
  dispatchDebtorDueOwnerEmail,
} from '@/services/email-dispatch.service';

// ─── Reminder Types ─────────────────────────────────────────
//
// tax_deadline        — monthly tax filing/payment is approaching
// unfiled_tax         — month ended and no tax report was calculated
// unfinalized_report  — report calculated but not finalized
// unpaid_tax          — report finalized but not paid
// margin_warning      — fired during tax calc when expenses look anomalous
// invoice_overdue     — sent invoice past its due date
// payment_successful  — tax payment confirmed (webhook or manual verify)
// dva_received        — DVA auto-captured a sale
// payout_change_permitted — admin granted one-time payout account change permission
// pnl_statement_ready — end-of-month Profit & Loss statement ready on taxReminderDay

export type ReminderType =
  | 'tax_deadline'
  | 'unfiled_tax'
  | 'unfinalized_report'
  | 'unpaid_tax'
  | 'margin_warning'
  | 'invoice_overdue'
  | 'payment_successful'
  | 'payment_refunded'
  | 'dva_received'
  | 'dva_validation_failed'
  | 'transaction_needs_verification'
  | 'payout_change_permitted'
  | 'payout_requested'
  | 'payout_approved'
  | 'payout_rejected'
  | 'payout_completed'
  | 'payout_failed'
  | 'credit_overdue'
  | 'pnl_statement_ready';

export type ReminderReferenceType = 'invoice' | 'payment' | 'sales_transaction' | 'business' | 'settlement_payout' | 'customer_credit';

export const REPORT_REMINDER_MESSAGES: Record<
  'tax_deadline' | 'unfiled_tax' | 'unfinalized_report' | 'unpaid_tax',
  (month: string) => string
> = {
  tax_deadline: (month) =>
    `Tax calculation reminder: ${month} is concluding soon. Please ensure all sales and expenses are recorded and complete so your tax report is ready to finalize at the end of the month.`,
  unfiled_tax: (month) =>
    `You haven't calculated your tax report for ${month} yet. Record your sales and expenses, then calculate your tax.`,
  unfinalized_report: (month) =>
    `Month-end review: ${month} is concluding. Review your sales and expenses so your tax report is ready to finalize. If not manually finalized on the last day, the system will auto-finalize it on the 1st.`,
  unpaid_tax: (month) =>
    `Your tax report for ${month} is finalized but unpaid. Complete your tax payment before the 21st to stay compliant with NRS.`,
};

function formatMonth(month: number, year: number): string {
  // UTC to match the rest of the service. Display formatters below pin the
  // timezone explicitly so the label reads correctly regardless of host TZ.
  const date = new Date(Date.UTC(year, month - 1, 1));
  return date.toLocaleDateString('en-NG', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

// ─── Determine which report-state reminder is needed ────────
//
// Shared by generateReminders (single business, on-demand) and
// generateRemindersForAllBusinesses (cron, all businesses).

export type ReportReminderType = 'unfiled_tax' | 'unfinalized_report' | 'unpaid_tax';

export function determineReportReminderType(
  report: { isFinalized: boolean; isLocked: boolean; paymentStatus: string } | null
): ReportReminderType | null {
  if (!report) return 'unfiled_tax';
  if (!report.isFinalized) return 'unfinalized_report';
  if (report.paymentStatus === 'pending' && !report.isLocked) return 'unpaid_tax';
  return null;
}

// ─── createReminderOnce — centralized creator with dedup ────
//
// Two dedup keys depending on whether a referenceId is supplied:
//   • With ref:    (businessId, reminderType, referenceType, referenceId)
//                  → one reminder per real-world entity (e.g. one per invoice)
//   • Without ref: (businessId, reminderType, scheduledDate)
//                  → one reminder per month (existing behaviour)
//
// `updateMessageOnDup` opt-in lets margin_warning refresh its numbers on
// recalculation without spawning duplicate rows.

export interface CreateReminderOnceParams {
  businessId: string;
  reminderType: ReminderType;
  scheduledDate: Date;
  message: string;
  referenceType?: ReminderReferenceType;
  referenceId?: string;
  updateMessageOnDup?: boolean;
}

export interface CreateReminderOnceResult {
  created: boolean;
  reminder: Awaited<ReturnType<typeof prisma.reminder.create>>;
}

export async function createReminderOnce(
  p: CreateReminderOnceParams
): Promise<CreateReminderOnceResult> {
  const where = p.referenceId
    ? {
        businessId: p.businessId,
        reminderType: p.reminderType,
        referenceType: p.referenceType ?? null,
        referenceId: p.referenceId,
      }
    : {
        businessId: p.businessId,
        reminderType: p.reminderType,
        scheduledDate: p.scheduledDate,
      };

  const existing = await prisma.reminder.findFirst({ where });

  if (existing) {
    if (p.updateMessageOnDup && existing.message !== p.message) {
      const updated = await prisma.reminder.update({
        where: { id: existing.id },
        data: { message: p.message },
      });
      return { created: false, reminder: updated };
    }
    return { created: false, reminder: existing };
  }

  const reminder = await prisma.reminder.create({
    data: {
      businessId: p.businessId,
      reminderType: p.reminderType,
      scheduledDate: p.scheduledDate,
      message: p.message,
      referenceType: p.referenceType ?? null,
      referenceId: p.referenceId ?? null,
    },
  });

  return { created: true, reminder };
}

// ─── Generate Reminders for a Business (manual / on-demand) ─
//
// Same scope as the nightly cron, scoped to one business:
//   1. Tax-state reminder for the requested month (unfiled / unfinalized / unpaid)
//   2. Tax-deadline reminder if today >= business.taxReminderDay
//   3. Overdue-invoice sweep for every sent invoice past dueDate
//
// Returns counts so the UI can show a meaningful summary.

export async function generateReminders(
  userId: string,
  businessId: string,
  month: number,
  year: number
) {
  const { business } = await verifyBusinessAccess(userId, businessId, 'reminders.read');

  // UTC — must match the UTC bounds used by calculateTax so the unique-key
  // lookup on (businessId, taxMonth) hits the right row, and so the reminder's
  // scheduledDate (also @db.Date) stores the calendar month the user meant.
  const monthStart = new Date(Date.UTC(year, month - 1, 1));
  const monthLabel = formatMonth(month, year);

  // 1. Tax-state reminder for the requested month
  const report = await prisma.monthlyTaxReport.findUnique({
    where: { businessId_taxMonth: { businessId, taxMonth: monthStart } },
    select: {
      isFinalized: true,
      isLocked: true,
      paymentStatus: true,
      taxPayable: true,
    },
  });

  const reminderType = determineReportReminderType(report);

  let taxReminderCreated = false;
  let taxReminderType: ReportReminderType | null = null;

  if (reminderType) {
    const res = await createReminderOnce({
      businessId,
      reminderType,
      scheduledDate: monthStart,
      message: REPORT_REMINDER_MESSAGES[reminderType](monthLabel),
    });

    if (res.created) {
      taxReminderCreated = true;
      taxReminderType = reminderType;
      logAudit({
        userId,
        businessId,
        action: 'reminder.created',
        resourceType: 'reminder',
        resourceId: res.reminder.id,
        newData: { reminderType, month, year },
      });
      logger.info('Reminder created', {
        reminderId: res.reminder.id,
        businessId,
        reminderType,
        month,
        year,
      });
      void dispatchTaxDueDateEmail(businessId, month, year, reminderType);
    }
  }

  // 2. Tax-deadline reminder (independent of report state)
  let deadlineCreated = false;
  const deadline = await checkDeadlineReminderForBusiness(business);
  if (deadline?.created) {
    deadlineCreated = true;
  }

  // 3. P&L Statement Ready reminder (when period is past or today >= taxReminderDay)
  let pnlCreated = false;
  const now = new Date();
  const isPastMonth =
    year < now.getFullYear() || (year === now.getFullYear() && month < now.getMonth() + 1);
  if (isPastMonth || now.getDate() >= business.taxReminderDay) {
    const pnlRes = await ensurePnlStatementReminder(business, month, year);
    if (pnlRes.created) {
      pnlCreated = true;
    }
  }

  // 4. Overdue-invoice sweep for this business
  const invoiceSweep = await sweepOverdueInvoicesForBusiness(businessId);

  // 5. Overdue-credit sweep for this business
  const creditSweep = await sweepCreditReminders(businessId);

  const totalCreated =
    (taxReminderCreated ? 1 : 0) +
    (deadlineCreated ? 1 : 0) +
    (pnlCreated ? 1 : 0) +
    invoiceSweep.remindersCreated +
    creditSweep.remindersCreated;

  return {
    created: totalCreated > 0,
    taxReminderType,
    taxReminderCreated,
    deadlineCreated,
    pnlCreated,
    invoiceRemindersCreated: invoiceSweep.remindersCreated,
    invoicesFlippedToOverdue: invoiceSweep.statusFlipped,
    creditRemindersCreated: creditSweep.remindersCreated,
    creditStatusFlipped: creditSweep.statusFlipped,
    creditEmailsSent: creditSweep.emailsSent,
    totalCreated,
    message:
      totalCreated === 0
        ? 'You are all caught up — no new reminders.'
        : `Created ${totalCreated} reminder${totalCreated === 1 ? '' : 's'}.`,
  };
}

// ─── Generate P&L Statement Ready Reminder for a Business ────
//
// Creates a "pnl_statement_ready" reminder once per (businessId, monthStart)
// and dispatches the P&L Statement Ready email with PDF attachment.

export async function ensurePnlStatementReminder(
  business: { id: string; taxReminderDay: number },
  month: number,
  year: number
): Promise<CreateReminderOnceResult> {
  const monthStart = new Date(Date.UTC(year, month - 1, 1));
  const monthLabel = formatMonth(month, year);

  const result = await createReminderOnce({
    businessId: business.id,
    reminderType: 'pnl_statement_ready',
    scheduledDate: monthStart,
    message: `Your Profit & Loss Statement for ${monthLabel} is ready to download from Tax Reports.`,
  });

  if (result.created) {
    logger.info('P&L statement ready reminder created', {
      reminderId: result.reminder.id,
      businessId: business.id,
      month,
      year,
    });
    void dispatchPnlStatementReadyEmail(business.id, month, year);
  }

  return result;
}

// ─── Generate Deadline Reminder for a single business ───────
//
// Creates a "tax_deadline" reminder when today >= taxReminderDay
// and the current month's tax isn't already settled.

export async function checkDeadlineReminder(
  userId: string,
  businessId: string
) {
  const { business } = await verifyBusinessAccess(userId, businessId, 'reminders.read');
  const result = await checkDeadlineReminderForBusiness(business);
  return result?.reminder ?? null;
}

// Internal variant that skips ownership check — for cron use.
// Returns { created, reminder } | null when no reminder is needed.
export async function checkDeadlineReminderForBusiness(business: {
  id: string;
  taxReminderDay: number;
}): Promise<CreateReminderOnceResult | null> {
  const now = new Date();
  const today = now.getDate();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  if (today < business.taxReminderDay) {
    return null;
  }

  // UTC-bounded so the unique-key lookup on (businessId, taxMonth) — which
  // calculateTax writes in UTC — actually hits. `currentMonth/Year` are still
  // local-tz because the "is today >= reminderDay?" check above is naturally a
  // local-calendar question; the host runs in Lagos TZ (Render env: `TZ=Africa/Lagos`)
  // so local == Lagos and the two agree. If we ever ship to a non-Lagos host,
  // recompute today/currentMonth/currentYear in the Lagos zone explicitly.
  const monthStart = new Date(Date.UTC(currentYear, currentMonth - 1, 1));

  const report = await prisma.monthlyTaxReport.findUnique({
    where: { businessId_taxMonth: { businessId: business.id, taxMonth: monthStart } },
    select: { isLocked: true, paymentStatus: true },
  });

  if (report?.isLocked || report?.paymentStatus === 'completed') {
    return null;
  }

  const monthLabel = formatMonth(currentMonth, currentYear);

  const result = await createReminderOnce({
    businessId: business.id,
    reminderType: 'tax_deadline',
    scheduledDate: monthStart,
    message: REPORT_REMINDER_MESSAGES.tax_deadline(monthLabel),
  });

  if (result.created) {
    logger.info('Deadline reminder auto-created', {
      reminderId: result.reminder.id,
      businessId: business.id,
    });
    void dispatchTaxDueDateEmail(business.id, currentMonth, currentYear, 'tax_deadline');
  }

  return result;
}

// ─── Batch: Generate Reminders for ALL Businesses (cron) ────
//
// Daily sweep: for every business whose taxReminderDay is today,
// create the right report-state reminder (unfiled / unfinalized / unpaid),
// a tax_deadline reminder if appropriate, AND a pnl_statement_ready reminder. Idempotent.

export async function generateRemindersForAllBusinesses() {
  const now = new Date();
  const today = now.getDate();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();
  // UTC bounds for the same reason as checkDeadlineReminderForBusiness — must
  // align with calculateTax's UTC taxMonth so the unique-key lookup hits.
  const monthStart = new Date(Date.UTC(currentYear, currentMonth - 1, 1));
  const monthLabel = formatMonth(currentMonth, currentYear);

  const businesses = await prisma.business.findMany({
    where: { taxReminderDay: today },
    select: {
      id: true,
      userId: true,
      businessName: true,
      taxReminderDay: true,
    },
  });

  if (businesses.length === 0) {
    logger.info('No businesses have reminder day today', { today });
    return { processed: 0, created: 0, deadlinesCreated: 0, pnlCreated: 0 };
  }

  let created = 0;
  let deadlinesCreated = 0;
  let pnlCreated = 0;

  for (const business of businesses) {
    // Report-state reminder
    const report = await prisma.monthlyTaxReport.findUnique({
      where: { businessId_taxMonth: { businessId: business.id, taxMonth: monthStart } },
      select: { isFinalized: true, isLocked: true, paymentStatus: true },
    });

    const reminderType = determineReportReminderType(report);

    if (reminderType) {
      const res = await createReminderOnce({
        businessId: business.id,
        reminderType,
        scheduledDate: monthStart,
        message: REPORT_REMINDER_MESSAGES[reminderType](monthLabel),
      });
      if (res.created) {
        created++;
        logger.info('Batch reminder created', { businessId: business.id, reminderType });
        void dispatchTaxDueDateEmail(business.id, currentMonth, currentYear, reminderType);
      }
    }

    // Tax deadline reminder (independent of report state — fires whether or
    // not the report exists, as long as the month isn't already paid/locked).
    const deadline = await checkDeadlineReminderForBusiness(business);
    if (deadline?.created) {
      deadlinesCreated++;
    }

    // End-of-Month Profit & Loss Statement Ready reminder + email
    const pnl = await ensurePnlStatementReminder(business, currentMonth, currentYear);
    if (pnl.created) {
      pnlCreated++;
    }
  }

  logger.info('Batch reminder generation complete', {
    processed: businesses.length,
    created,
    deadlinesCreated,
    pnlCreated,
  });

  return { processed: businesses.length, created, deadlinesCreated, pnlCreated };
}

// ─── Automated Month-End Closing Sweep (Day 1 of Month) ──────
//
// On the 1st of every month at 00:30 Lagos time, automatically closes and finalizes
// the previous concluded calendar month for all businesses that did not manually
// finalize on the last day. Re-aggregates live sales & expenses to ensure full-month
// compliance, sets isFinalized = true, and creates an in-app reminder.

export async function autoFinalizeConcludedMonthForAllBusinesses(): Promise<{
  processed: number;
  finalized: number;
}> {
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  // Concluded previous calendar month
  const targetMonth = currentMonth === 1 ? 12 : currentMonth - 1;
  const targetYear = currentMonth === 1 ? currentYear - 1 : currentYear;
  const monthLabel = formatMonth(targetMonth, targetYear);
  const monthStart = new Date(Date.UTC(targetYear, targetMonth - 1, 1));

  const businesses = await prisma.business.findMany({
    select: { id: true, businessName: true },
  });

  let finalized = 0;
  const { autoFinalizeConcludedMonth } = await import('@/services/tax.service');

  for (const business of businesses) {
    try {
      const result = await autoFinalizeConcludedMonth(business.id, targetMonth, targetYear);
      if (result && result.isFinalized) {
        finalized++;
        // Create an in-app reminder informing the user that the report was auto-finalized
        await createReminderOnce({
          businessId: business.id,
          reminderType: 'unpaid_tax',
          scheduledDate: monthStart,
          message: `Your tax report for ${monthLabel} was automatically finalized by the system (Tax Payable: ${formatNaira(Number(result.taxPayable))}). Remit payment before the NRS deadline on the 21st.`,
        });

        // ITEM-07: Dispatch automated email alert to business owner when auto-finalization triggers
        void dispatchTaxDueDateEmail(business.id, targetMonth, targetYear, 'unpaid_tax');
      }
    } catch (err) {
      logger.error('Failed to auto-finalize month for business', {
        businessId: business.id,
        month: targetMonth,
        year: targetYear,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  logger.info('Auto-finalization sweep complete', {
    targetMonth,
    targetYear,
    totalBusinesses: businesses.length,
    finalized,
  });

  return { processed: businesses.length, finalized };
}

// ─── Month-End Concluded Reminder Sweep ──────────────────────
//
// Sweeps active businesses on Day 1 of the new month (or final calendar day)
// to notify that trading has concluded and the tax report is ready to finalize.

export function isLastDayOfMonth(date: Date): boolean {
  const tomorrow = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
  return tomorrow.getDate() === 1;
}

export async function sweepMonthEndConcludedReminders(options?: {
  force?: boolean;
  targetMonth?: number;
  targetYear?: number;
}): Promise<{
  processed: number;
  created: number;
}> {
  const now = new Date();
  const isDayOne = now.getDate() === 1;
  const isLastDay = isLastDayOfMonth(now);

  if (!options?.force && !isDayOne && !isLastDay) {
    return { processed: 0, created: 0 };
  }

  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  // On Day 1, the sweep targets the calendar month that concluded yesterday
  const targetMonth =
    options?.targetMonth ?? (isDayOne ? (currentMonth === 1 ? 12 : currentMonth - 1) : currentMonth);
  const targetYear =
    options?.targetYear ?? (isDayOne ? (currentMonth === 1 ? currentYear - 1 : currentYear) : currentYear);

  const monthStart = new Date(Date.UTC(targetYear, targetMonth - 1, 1));
  const monthLabel = formatMonth(targetMonth, targetYear);

  const businesses = await prisma.business.findMany({
    select: { id: true, businessName: true },
  });

  let created = 0;
  for (const business of businesses) {
    try {
      const report = await prisma.monthlyTaxReport.findUnique({
        where: { businessId_taxMonth: { businessId: business.id, taxMonth: monthStart } },
        select: { isFinalized: true, isLocked: true },
      });

      // Remind if the report is not yet finalized, or hasn't been created yet
      if (!report?.isFinalized && !report?.isLocked) {
        const res = await createReminderOnce({
          businessId: business.id,
          reminderType: 'unfinalized_report',
          scheduledDate: monthStart,
          message: `Trading for ${monthLabel} has concluded. Your tax report is now ready to finalize. Please review your transactions, run recalculation, and finalize your report.`,
        });

        if (res.created) {
          created++;
          void dispatchTaxDueDateEmail(business.id, targetMonth, targetYear, 'unfinalized_report');
        }
      }
    } catch (err) {
      logger.error('Failed to create month-end concluded reminder for business', {
        businessId: business.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  logger.info('Month-end concluded reminder sweep complete', {
    targetMonth,
    targetYear,
    totalBusinesses: businesses.length,
    created,
  });

  return { processed: businesses.length, created };
}

// ─── Margin Warning Helper ───────────────────────────────────
//
// Called from tax.service.ts during calculation. Refreshes the message
// when numbers change on recalculation rather than spamming new rows.

export async function createMarginWarning(
  businessId: string,
  message: string,
  month: number,
  year: number
) {
  // UTC — matches calculateTax's UTC monthStart so dedup on
  // (businessId, type, scheduledDate) lines up with the reminder this
  // function refreshed last calculation.
  const monthStart = new Date(Date.UTC(year, month - 1, 1));

  const { created, reminder } = await createReminderOnce({
    businessId,
    reminderType: 'margin_warning',
    scheduledDate: monthStart,
    message,
    updateMessageOnDup: true,
  });

  if (created) {
    logger.info('Margin warning created', { reminderId: reminder.id, businessId, month, year });
  }

  return reminder;
}

// ─── Sweep Overdue Invoices ─────────────────────────────────
//
// For every Invoice with status='sent' AND dueDate < startOfToday:
//   1. Create one `invoice_overdue` reminder (deduped by referenceId)
//   2. Flip Invoice.status: 'sent' → 'overdue'
//
// Both moves are idempotent:
//   • createReminderOnce dedupes on (businessId, type, referenceType, referenceId)
//   • updateMany filters on status='sent' so already-flipped rows are no-ops
//
// Per-invoice try/catch — one bad row never aborts the sweep.
//
// `businessId` is optional: omitted = walk every business (used by the
// nightly cron); supplied = scoped to one business (used by the manual
// "Generate Reminders" button on /reminders).

export interface InvoiceSweepResult {
  remindersCreated: number;
  statusFlipped: number;
}

export async function sweepOverdueInvoicesForBusiness(
  businessId?: string
): Promise<InvoiceSweepResult> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const invoices = await prisma.invoice.findMany({
    where: {
      ...(businessId ? { businessId } : {}),
      status: 'sent',
      dueDate: { lt: today },
    },
    select: {
      id: true,
      businessId: true,
      invoiceNumber: true,
      customerName: true,
      total: true,
      dueDate: true,
    },
  });

  let remindersCreated = 0;
  let statusFlipped = 0;

  for (const inv of invoices) {
    try {
      const reminderRes = await createReminderOnce({
        businessId: inv.businessId,
        reminderType: 'invoice_overdue',
        scheduledDate: today,
        message: `Invoice ${inv.invoiceNumber} to ${inv.customerName} for ${formatNaira(
          inv.total as unknown as number
        )} is overdue (was due ${formatDateISO(inv.dueDate)}).`,
        referenceType: 'invoice',
        referenceId: inv.id,
      });

      const updateRes = await prisma.invoice.updateMany({
        where: { id: inv.id, status: 'sent' },
        data: { status: 'overdue' },
      });

      if (reminderRes.created) {
        remindersCreated++;
        void dispatchInvoiceOverdueEmail(inv.id);
      }
      if (updateRes.count > 0) statusFlipped++;
    } catch (err) {
      logger.warn('Overdue invoice sweep: invoice failed', {
        invoiceId: inv.id,
        businessId: inv.businessId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { remindersCreated, statusFlipped };
}

export interface CreditSweepResult {
  remindersCreated: number;
  statusFlipped: number;
  emailsSent: number;
}

/**
 * Sweeps all active credits to detect overdue debt and trigger due-date reminders.
 * Scoped optionally by businessId (e.g. for testing / targeted sweep).
 * Auto debtor due email (see sendDebtorInfoEmail for manual resend)
 */
export async function sweepCreditReminders(
  businessId?: string
): Promise<CreditSweepResult> {
  // Compute today in Africa/Lagos (UTC+1, no DST)
  const lagosDateStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Lagos',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

  // Lagos start of today timestamp (for lastReminderSentAt cooldown)
  const lagosStartOfToday = new Date(`${lagosDateStr}T00:00:00+01:00`);

  // UTC midnight date for @db.Date column comparisons
  const [year, month, day] = lagosDateStr.split('-').map(Number);
  const todayDateOnly = new Date(Date.UTC(year, month - 1, day));

  const credits = await prisma.customerCredit.findMany({
    where: {
      ...(businessId ? { businessId } : {}),
      status: { in: ['unpaid', 'partially_paid', 'overdue'] },
      OR: [
        { dueDate: { lte: todayDateOnly } },
        { reminderDate: { lte: todayDateOnly } },
      ],
    },
    select: {
      id: true,
      businessId: true,
      customerName: true,
      customerEmail: true,
      customerPhone: true,
      totalAmount: true,
      balance: true,
      dueDate: true,
      reminderDate: true,
      status: true,
      lastReminderSentAt: true,
      business: {
        select: {
          businessName: true,
          virtualAccountNumber: true,
          virtualAccountBank: true,
        },
      },
    },
  });

  let remindersCreated = 0;
  let statusFlipped = 0;
  let emailsSent = 0;

  for (const credit of credits) {
    try {
      // 1. Flip to overdue if past due date and not already marked overdue
      if (credit.dueDate < todayDateOnly && credit.status !== 'overdue') {
        const updateRes = await prisma.customerCredit.updateMany({
          where: { id: credit.id, status: { in: ['unpaid', 'partially_paid'] } },
          data: { status: 'overdue' },
        });
        if (updateRes.count > 0) statusFlipped++;
      }

      // 2. Create in-app reminder (idempotent via createReminderOnce)
      const reminderRes = await createReminderOnce({
        businessId: credit.businessId,
        reminderType: 'credit_overdue',
        scheduledDate: todayDateOnly,
        message: `${credit.customerName} owes ${formatNaira(Number(credit.balance))} (due ${formatDateISO(credit.dueDate)}).`,
        referenceType: 'customer_credit',
        referenceId: credit.id,
      });
      if (reminderRes.created) {
        remindersCreated++;
        void dispatchDebtorDueOwnerEmail(credit.id);
      }

      // 3. Email debtor with calendar-day cooldown (once per credit per day in Africa/Lagos)
      const shouldEmail =
        credit.customerEmail &&
        (!credit.lastReminderSentAt || credit.lastReminderSentAt < lagosStartOfToday);

      if (shouldEmail) {
        const amountFormatted = formatNaira(Number(credit.balance));
        const dueDateFormatted = formatDateISO(credit.dueDate);

        await sendEmail({
          to: credit.customerEmail!,
          subject: `Payment Reminder: ${amountFormatted} due — ${credit.business.businessName}`,
          html: generateDebtorReminderHtml({
            customerName: credit.customerName,
            businessName: credit.business.businessName,
            amountFormatted,
            dueDateFormatted,
            bankName: credit.business.virtualAccountBank,
            accountNumber: credit.business.virtualAccountNumber,
            accountName: credit.business.businessName,
          }),
          text: generateDebtorReminderText({
            customerName: credit.customerName,
            businessName: credit.business.businessName,
            amountFormatted,
            dueDateFormatted,
            bankName: credit.business.virtualAccountBank,
            accountNumber: credit.business.virtualAccountNumber,
            accountName: credit.business.businessName,
          }),
        });

        await prisma.customerCredit.update({
          where: { id: credit.id },
          data: { lastReminderSentAt: new Date() },
        });
        emailsSent++;
      }
    } catch (err) {
      logger.warn('Credit reminder sweep: credit failed', {
        creditId: credit.id,
        businessId: credit.businessId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { remindersCreated, statusFlipped, emailsSent };
}

