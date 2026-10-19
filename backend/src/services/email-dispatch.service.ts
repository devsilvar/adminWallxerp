/**
 * Centralized Post-Commit Email Dispatch Service — WallX ERP
 *
 * All functions in this module are designed to be invoked fire-and-forget (`void dispatchXyz(...)`)
 * AFTER database transactions have committed, or from asynchronous domain event listeners / cron jobs.
 *
 * Invariants:
 * 1. Never throws — every function has a top-level try/catch boundary that logs warnings via Winston.
 * 2. Never executes inside a `prisma.$transaction` callback.
 * 3. Uses the WallX ERP purple brand templates exclusively.
 */

import prisma from '@/lib/prisma';
import config from '@/config';
import logger from '@/lib/logger';
import { logAudit } from '@/lib/audit';
import { sendEmail } from '@/lib/email';
import { formatNaira, formatTaxMonth, formatDateISO } from '@/lib/format';
import { toNumber } from '@/shared/helpers';
import { buildInvoicePdf } from '@/services/invoice.pdf';
import { ensureInvoiceShareToken } from '@/services/invoice/invoice-delivery.service';
import { getPnlStatementData } from '@/services/documents/statement.service';
import {
  generateWithdrawalRequestedHtml,
  generateWithdrawalRequestedText,
} from '@/lib/email/templates/withdrawal-requested';
import {
  generateWithdrawalCompletedHtml,
  generateWithdrawalCompletedText,
} from '@/lib/email/templates/withdrawal-completed';
import {
  generateWithdrawalFailedHtml,
  generateWithdrawalFailedText,
} from '@/lib/email/templates/withdrawal-failed';
import {
  generatePaymentFailedHtml,
  generatePaymentFailedText,
} from '@/lib/email/templates/payment-failed';
import {
  generateAccountDeactivatedHtml,
  generateAccountDeactivatedText,
} from '@/lib/email/templates/account-deactivated';
import {
  generateCreditAlertHtml,
  generateCreditAlertText,
} from '@/lib/email/templates/credit-alert';
import {
  generateLoginAlertHtml,
  generateLoginAlertText,
} from '@/lib/email/templates/login-alert';
import {
  generatePasswordChangedHtml,
  generatePasswordChangedText,
} from '@/lib/email/templates/password-changed';
import {
  generatePinAlertHtml,
  generatePinAlertText,
} from '@/lib/email/templates/pin-alert';
import {
  generateInvoiceLifecycleHtml,
  generateInvoiceLifecycleText,
} from '@/lib/email/templates/invoice-lifecycle';
import {
  generateTaxDueDateHtml,
  generateTaxDueDateText,
} from '@/lib/email/templates/tax-due-date';
import {
  generatePnlStatementReadyHtml,
  generatePnlStatementReadyText,
} from '@/lib/email/templates/pnl-statement-ready';
import {
  generateTeamInvitationHtml,
  generateTeamInvitationText,
} from '@/lib/email/templates/team-invitation';
import {
  generateDebtorNotificationHtml,
  generateDebtorNotificationText,
  DebtorNotificationEmailData,
} from '@/lib/email/templates/debtor-notification';
import {
  generateVoucherNotificationHtml,
  generateVoucherNotificationText,
  VoucherNotificationEmailData,
} from '@/lib/email/templates/voucher-notification';
import {
  generateVoucherDeductionHtml,
  generateVoucherDeductionText,
  VoucherDeductionEmailData,
} from '@/lib/email/templates/voucher-deduction';
import {
  generateVoucherVerificationHtml,
  generateVoucherVerificationText,
} from '@/lib/email/templates/voucher-verification';
import {
  generateVoucherAdjustmentNotificationHtml,
  generateVoucherAdjustmentNotificationText,
} from '@/lib/email/templates/voucher-adjustment-notification';
import {
  generateBroadcastHtml,
  generateBroadcastText,
} from '@/lib/email/templates/broadcast';

// ─── Helpers ────────────────────────────────────────────────

function getFrontendBaseUrl(): string {
  return (config.cors.frontendUrl.split(',')[0]?.trim() || 'http://localhost:5173').replace(
    /\/$/,
    '',
  );
}

export function maskAccountNumber(accountNum?: string | null): string {
  if (!accountNum) return '••••';
  const clean = accountNum.trim();
  if (clean.length <= 4) return `•••• ${clean}`;
  return `•••• ${clean.slice(-4)}`;
}

export function formatHumanDate(d: Date = new Date()): string {
  return d.toLocaleDateString('en-NG', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function formatHumanDateTime(d: Date = new Date()): string {
  return d.toLocaleString('en-NG', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Africa/Lagos',
  });
}

export function parseDeviceFromUserAgent(ua?: string | null): string {
  if (!ua) return 'Web Browser';
  const browser = ua.includes('Edg/')
    ? 'Edge'
    : ua.includes('Chrome/')
    ? 'Chrome'
    : ua.includes('Firefox/')
    ? 'Firefox'
    : ua.includes('Safari/') && !ua.includes('Chrome/')
    ? 'Safari'
    : 'Web Browser';

  const os =
    ua.includes('iPhone') || ua.includes('iPad')
      ? 'iOS'
      : ua.includes('Android')
      ? 'Android'
      : ua.includes('Windows')
      ? 'Windows'
      : ua.includes('Mac OS X')
      ? 'macOS'
      : ua.includes('Linux')
      ? 'Linux'
      : 'Device';

  return `${browser} on ${os}`;
}

// ─── 1. Withdrawal Requested ────────────────────────────────

export async function dispatchWithdrawalRequestedEmail(payoutId: string): Promise<void> {
  try {
    const payout = await prisma.settlementPayout.findUnique({
      where: { id: payoutId },
      include: {
        business: {
          include: {
            user: { select: { email: true } },
          },
        },
      },
    });

    const recipientEmail = payout?.business?.user?.email;
    if (!payout || !recipientEmail) return;

    const netFormatted = formatNaira(payout.netAmount);
    const data = {
      ownerName: payout.business.ownerName || 'Business Owner',
      businessName: payout.business.businessName,
      amountFormatted: formatNaira(payout.amount),
      feeFormatted: formatNaira(payout.fee),
      netAmountFormatted: netFormatted,
      destinationBankName: payout.destinationBankName,
      accountNumberMasked: maskAccountNumber(payout.destinationAccountNum),
      destinationAccountName: payout.destinationAccountName,
      transferReference: payout.transferReference,
      requestDate: formatHumanDateTime(payout.initiatedAt),
      isAutoPayout: payout.status === 'processing' || payout.status === 'completed',
      dashboardLink: `${getFrontendBaseUrl()}/account?tab=withdrawals`,
    };

    await sendEmail({
      to: recipientEmail,
      subject: `Withdrawal Requested: ${netFormatted} — WallX ERP`,
      html: generateWithdrawalRequestedHtml(data),
      text: generateWithdrawalRequestedText(data),
    });
  } catch (err) {
    logger.warn('Failed to dispatch withdrawal requested email (non-critical)', {
      payoutId,
      err: err instanceof Error ? err.message : String(err),
    });
  }
}

// ─── 2. Withdrawal Completed ────────────────────────────────

export async function dispatchWithdrawalCompletedEmail(payoutId: string): Promise<void> {
  try {
    const payout = await prisma.settlementPayout.findUnique({
      where: { id: payoutId },
      include: {
        business: {
          include: {
            user: { select: { email: true } },
          },
        },
      },
    });

    const recipientEmail = payout?.business?.user?.email;
    if (!payout || !recipientEmail) return;

    const netFormatted = formatNaira(payout.netAmount);
    const data = {
      ownerName: payout.business.ownerName || 'Business Owner',
      businessName: payout.business.businessName,
      amountFormatted: formatNaira(payout.amount),
      feeFormatted: formatNaira(payout.fee),
      netAmountFormatted: netFormatted,
      destinationBankName: payout.destinationBankName,
      accountNumberMasked: maskAccountNumber(payout.destinationAccountNum),
      destinationAccountName: payout.destinationAccountName,
      transferReference: payout.transferReference,
      completedDate: formatHumanDateTime(payout.completedAt ?? new Date()),
      dashboardLink: `${getFrontendBaseUrl()}/account?tab=withdrawals`,
    };

    await sendEmail({
      to: recipientEmail,
      subject: `Withdrawal Completed: ${netFormatted} Sent to Bank — WallX ERP`,
      html: generateWithdrawalCompletedHtml(data),
      text: generateWithdrawalCompletedText(data),
    });
  } catch (err) {
    logger.warn('Failed to dispatch withdrawal completed email (non-critical)', {
      payoutId,
      err: err instanceof Error ? err.message : String(err),
    });
  }
}

// ─── 3. Withdrawal Failed / Rejected ────────────────────────

export async function dispatchWithdrawalFailedEmail(
  payoutId: string,
  reason?: string,
  isRejection = false,
): Promise<void> {
  try {
    const payout = await prisma.settlementPayout.findUnique({
      where: { id: payoutId },
      include: {
        business: {
          include: {
            user: { select: { email: true } },
          },
        },
      },
    });

    const recipientEmail = payout?.business?.user?.email;
    if (!payout || !recipientEmail) return;

    const amountFormatted = formatNaira(payout.amount);
    const displayReason =
      reason ||
      payout.failureReason ||
      (isRejection
        ? 'Declined during administrative settlement review'
        : 'Bank transfer could not be completed by gateway');

    const data = {
      ownerName: payout.business.ownerName || 'Business Owner',
      businessName: payout.business.businessName,
      amountFormatted,
      destinationBankName: payout.destinationBankName,
      accountNumberMasked: maskAccountNumber(payout.destinationAccountNum),
      transferReference: payout.transferReference,
      failureReason: displayReason,
      isRejection,
      failedDate: formatHumanDateTime(),
      payoutSettingsLink: `${getFrontendBaseUrl()}/account?tab=withdrawals`,
    };

    const subjectPrefix = isRejection ? 'Withdrawal Declined' : 'Withdrawal Unsuccessful';
    await sendEmail({
      to: recipientEmail,
      subject: `${subjectPrefix}: ${amountFormatted} Restored to Wallet — WallX ERP`,
      html: generateWithdrawalFailedHtml(data),
      text: generateWithdrawalFailedText(data),
    });
  } catch (err) {
    logger.warn('Failed to dispatch withdrawal failed email (non-critical)', {
      payoutId,
      err: err instanceof Error ? err.message : String(err),
    });
  }
}

// ─── 4. Wallet Credit Alert (DVA Inflow) ────────────────────

export async function dispatchWalletCreditAlertEmail(payload: {
  accountNumber: string;
  amount: number;
  reference: string;
  payerName?: string;
}): Promise<void> {
  try {
    // Locate the business or user owning this virtual account number
    let business = await prisma.business.findFirst({
      where: { virtualAccountNumber: payload.accountNumber },
      include: { user: { select: { email: true } } },
    });

    if (!business) {
      const user = await prisma.user.findFirst({
        where: { virtualAccountNumber: payload.accountNumber },
        include: { businesses: { take: 1 } },
      });
      if (user && user.businesses[0]) {
        business = {
          ...user.businesses[0],
          user: { email: user.email },
        } as any;
      }
    }

    const recipientEmail = business?.user?.email;
    if (!business || !recipientEmail) return;

    const amountFormatted = formatNaira(payload.amount);
    const payerName = payload.payerName?.trim() || 'Bank Transfer Customer';
    const bankLabel = business.virtualAccountBank
      ? `${payload.accountNumber} (${business.virtualAccountBank})`
      : payload.accountNumber;

    const data = {
      ownerName: business.ownerName || 'Business Owner',
      businessName: business.businessName,
      amountFormatted,
      payerName,
      accountNumber: bankLabel,
      reference: payload.reference,
      transactionDate: formatHumanDateTime(),
      alertType: 'dva_inflow' as const,
      dashboardLink: `${getFrontendBaseUrl()}/sales`,
    };

    await sendEmail({
      to: recipientEmail,
      subject: `Credit Alert: ${amountFormatted} Received from ${payerName} — WallX ERP`,
      html: generateCreditAlertHtml(data),
      text: generateCreditAlertText(data),
    });
  } catch (err) {
    logger.warn('Failed to dispatch wallet credit alert email (non-critical)', {
      reference: payload.reference,
      err: err instanceof Error ? err.message : String(err),
    });
  }
}

// ─── 5. Tax Payment Failed ──────────────────────────────────

export async function dispatchPaymentFailedEmail(
  paymentId: string,
  failureReason?: string,
): Promise<void> {
  try {
    const payment = await prisma.taxPayment.findUnique({
      where: { id: paymentId },
      include: {
        taxReport: true,
        business: {
          include: {
            user: { select: { email: true } },
          },
        },
      },
    });

    const recipientEmail = payment?.business?.user?.email;
    if (!payment || !recipientEmail) return;

    const taxMonthLabel = formatTaxMonth(payment.taxReport.taxMonth);
    const amountFormatted = formatNaira(payment.amountPaid);

    const data = {
      ownerName: payment.business.ownerName || 'Business Owner',
      businessName: payment.business.businessName,
      amountFormatted,
      taxMonthLabel,
      transactionReference: payment.transactionReference,
      failureReason: failureReason || 'Payment was declined by the payment processor',
      attemptDate: formatHumanDateTime(),
      retryPaymentLink: `${getFrontendBaseUrl()}/tax?highlight=${payment.taxReportId}`,
    };

    await sendEmail({
      to: recipientEmail,
      subject: `Tax Payment Declined (${taxMonthLabel}) — WallX ERP`,
      html: generatePaymentFailedHtml(data),
      text: generatePaymentFailedText(data),
    });
  } catch (err) {
    logger.warn('Failed to dispatch tax payment failed email (non-critical)', {
      paymentId,
      err: err instanceof Error ? err.message : String(err),
    });
  }
}

// ─── 6. Account Deactivated ─────────────────────────────────

export async function dispatchAccountDeactivatedEmail(
  userId: string,
  reason?: string,
): Promise<void> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        businesses: {
          select: { ownerName: true, businessName: true },
          take: 1,
        },
      },
    });

    if (!user || !user.email) return;

    const userName =
      user.businesses[0]?.ownerName || user.email.split('@')[0] || 'Account Holder';

    const data = {
      userName,
      userEmail: user.email,
      deactivationDate: formatHumanDateTime(),
      reason,
      supportEmail: 'support@wallxerp.com',
    };

    await sendEmail({
      to: user.email,
      subject: 'Important: Your WallX ERP Account Has Been Deactivated',
      html: generateAccountDeactivatedHtml(data),
      text: generateAccountDeactivatedText(data),
    });
  } catch (err) {
    logger.warn('Failed to dispatch account deactivated email (non-critical)', {
      userId,
      err: err instanceof Error ? err.message : String(err),
    });
  }
}

// ─── 7. Login Security Alert ────────────────────────────────

export async function dispatchLoginAlertEmail(
  userId: string,
  ipAddress?: string,
  userAgent?: string,
): Promise<void> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        businesses: {
          select: { ownerName: true },
          take: 1,
        },
      },
    });

    if (!user || !user.email) return;

    const userName = user.businesses[0]?.ownerName || user.email.split('@')[0] || 'There';
    const data = {
      userName,
      userEmail: user.email,
      loginTime: formatHumanDateTime(),
      ipAddress: ipAddress || 'Unknown IP',
      deviceInfo: parseDeviceFromUserAgent(userAgent),
      securitySettingsLink: `${getFrontendBaseUrl()}/settings?tab=security`,
    };

    await sendEmail({
      to: user.email,
      subject: 'New Sign-In to Your WallX ERP Account',
      html: generateLoginAlertHtml(data),
      text: generateLoginAlertText(data),
    });
  } catch (err) {
    logger.warn('Failed to dispatch login alert email (non-critical)', {
      userId,
      err: err instanceof Error ? err.message : String(err),
    });
  }
}

// ─── 8. Password Changed / Reset Confirmation ───────────────

export async function dispatchPasswordChangedEmail(
  userId: string,
  method: 'changed' | 'reset',
): Promise<void> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        businesses: {
          select: { ownerName: true },
          take: 1,
        },
      },
    });

    if (!user || !user.email) return;

    const userName = user.businesses[0]?.ownerName || user.email.split('@')[0] || 'There';
    const data = {
      userName,
      userEmail: user.email,
      changeDate: formatHumanDateTime(),
      method,
      securitySettingsLink: `${getFrontendBaseUrl()}/settings?tab=security`,
    };

    await sendEmail({
      to: user.email,
      subject: 'Your WallX ERP Password Was Updated',
      html: generatePasswordChangedHtml(data),
      text: generatePasswordChangedText(data),
    });
  } catch (err) {
    logger.warn('Failed to dispatch password changed email (non-critical)', {
      userId,
      method,
      err: err instanceof Error ? err.message : String(err),
    });
  }
}

// ─── 9. Transaction PIN Alert ───────────────────────────────

export async function dispatchPinAlertEmail(
  userId: string,
  action: 'created' | 'changed' | 'reset' | 'locked',
  ipAddress?: string,
): Promise<void> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        businesses: {
          select: { ownerName: true },
          take: 1,
        },
      },
    });

    if (!user || !user.email) return;

    const userName = user.businesses[0]?.ownerName || user.email.split('@')[0] || 'There';
    const data = {
      userName,
      userEmail: user.email,
      action,
      actionDate: formatHumanDateTime(),
      ipAddress,
      securitySettingsLink: `${getFrontendBaseUrl()}/settings?tab=security`,
    };

    const subjectMap: Record<typeof action, string> = {
      created: 'Transaction PIN Activated — WallX ERP',
      changed: 'Transaction PIN Updated — WallX ERP',
      reset: 'Transaction PIN Reset — WallX ERP',
      locked: 'Security Alert: Transaction PIN Locked — WallX ERP',
    };

    await sendEmail({
      to: user.email,
      subject: subjectMap[action],
      html: generatePinAlertHtml(data),
      text: generatePinAlertText(data),
    });
  } catch (err) {
    logger.warn('Failed to dispatch PIN alert email (non-critical)', {
      userId,
      action,
      err: err instanceof Error ? err.message : String(err),
    });
  }
}

// ─── 10. Invoice Lifecycle (Issued, Paid, Overdue) ──────────

async function loadInvoiceContext(invoiceId: string) {
  return prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: {
      lines: { orderBy: { sortOrder: 'asc' } },
      business: {
        include: {
          user: { select: { email: true } },
        },
      },
    },
  });
}

export async function dispatchInvoiceIssuedEmail(invoiceId: string): Promise<void> {
  try {
    const invoice = await loadInvoiceContext(invoiceId);
    if (!invoice) return;

    const biz = invoice.business;
    const ownerEmail = biz?.user?.email;
    const totalFormatted = formatNaira(invoice.total);
    const issueDateFormatted = formatHumanDate(invoice.issueDate);
    const dueDateFormatted = formatHumanDate(invoice.dueDate);
    const baseUrl = getFrontendBaseUrl();

    // 1. Send confirmation email to Business Owner
    if (ownerEmail) {
      const ownerData = {
        recipientName: biz.ownerName || 'Business Owner',
        recipientRole: 'owner' as const,
        businessName: biz.businessName,
        invoiceNumber: invoice.invoiceNumber,
        customerName: invoice.customerName,
        totalFormatted,
        issueDateFormatted,
        dueDateFormatted,
        event: 'issued' as const,
        actionLink: `${baseUrl}/invoices/${invoice.id}`,
      };

      await sendEmail({
        to: ownerEmail,
        subject: `Invoice Issued: ${invoice.invoiceNumber} (${totalFormatted}) — WallX ERP`,
        html: generateInvoiceLifecycleHtml(ownerData),
        text: generateInvoiceLifecycleText(ownerData),
      });
    }

    // 2. If customer has an email, send customer copy with PDF attached
    if (invoice.customerEmail && invoice.customerEmail.includes('@')) {
      const shareToken = await ensureInvoiceShareToken(invoice.businessId, invoice.id);
      const pdfBuffer = await buildInvoicePdf(
        {
          businessName: biz.businessName,
          merchantId: biz.merchantId,
          ownerName: biz.ownerName,
          taxId: biz.taxId,
          address: biz.address,
          city: biz.city,
          state: biz.state,
          logoUrl: biz.logoUrl,
        },
        invoice,
      );

      const publicPdfLink = `${baseUrl}/api/v1/public/invoices/${shareToken}/pdf`;
      const customerData = {
        recipientName: invoice.customerName,
        recipientRole: 'customer' as const,
        businessName: biz.businessName,
        invoiceNumber: invoice.invoiceNumber,
        customerName: invoice.customerName,
        totalFormatted,
        issueDateFormatted,
        dueDateFormatted,
        bankName: biz.virtualAccountBank,
        accountNumber: biz.virtualAccountNumber,
        event: 'issued' as const,
        actionLink: publicPdfLink,
      };

      await sendEmail({
        to: invoice.customerEmail,
        subject: `Invoice ${invoice.invoiceNumber} from ${biz.businessName} (${totalFormatted})`,
        html: generateInvoiceLifecycleHtml(customerData),
        text: generateInvoiceLifecycleText(customerData),
        attachments: [
          {
            filename: `${invoice.invoiceNumber}.pdf`,
            content: pdfBuffer,
            contentType: 'application/pdf',
          },
        ],
      });
    }
  } catch (err) {
    logger.warn('Failed to dispatch invoice issued email (non-critical)', {
      invoiceId,
      err: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function dispatchInvoicePaidEmail(invoiceId: string): Promise<void> {
  try {
    const invoice = await loadInvoiceContext(invoiceId);
    if (!invoice) return;

    const biz = invoice.business;
    const ownerEmail = biz?.user?.email;
    const totalFormatted = formatNaira(invoice.total);
    const issueDateFormatted = formatHumanDate(invoice.issueDate);
    const dueDateFormatted = formatHumanDate(invoice.dueDate);
    const paidDateFormatted = formatHumanDate(invoice.paidAt ?? new Date());
    const paymentMethodLabel = invoice.paymentMethod
      ? invoice.paymentMethod.replace(/_/g, ' ').toUpperCase()
      : 'Confirmed';
    const baseUrl = getFrontendBaseUrl();

    if (ownerEmail) {
      const ownerData = {
        recipientName: biz.ownerName || 'Business Owner',
        recipientRole: 'owner' as const,
        businessName: biz.businessName,
        invoiceNumber: invoice.invoiceNumber,
        customerName: invoice.customerName,
        totalFormatted,
        issueDateFormatted,
        dueDateFormatted,
        paidDateFormatted,
        paymentMethodLabel,
        event: 'paid' as const,
        actionLink: `${baseUrl}/invoices/${invoice.id}`,
      };

      await sendEmail({
        to: ownerEmail,
        subject: `Invoice Paid: ${invoice.invoiceNumber} (${totalFormatted}) — WallX ERP`,
        html: generateInvoiceLifecycleHtml(ownerData),
        text: generateInvoiceLifecycleText(ownerData),
      });
    }

    if (invoice.customerEmail && invoice.customerEmail.includes('@')) {
      const shareToken = await ensureInvoiceShareToken(invoice.businessId, invoice.id);
      const pdfBuffer = await buildInvoicePdf(
        {
          businessName: biz.businessName,
          merchantId: biz.merchantId,
          ownerName: biz.ownerName,
          taxId: biz.taxId,
          address: biz.address,
          city: biz.city,
          state: biz.state,
          logoUrl: biz.logoUrl,
        },
        invoice,
      );

      const publicPdfLink = `${baseUrl}/api/v1/public/invoices/${shareToken}/pdf`;
      const customerData = {
        recipientName: invoice.customerName,
        recipientRole: 'customer' as const,
        businessName: biz.businessName,
        invoiceNumber: invoice.invoiceNumber,
        customerName: invoice.customerName,
        totalFormatted,
        issueDateFormatted,
        dueDateFormatted,
        paidDateFormatted,
        paymentMethodLabel,
        event: 'paid' as const,
        actionLink: publicPdfLink,
      };

      await sendEmail({
        to: invoice.customerEmail,
        subject: `Payment Receipt: Invoice ${invoice.invoiceNumber} — ${biz.businessName}`,
        html: generateInvoiceLifecycleHtml(customerData),
        text: generateInvoiceLifecycleText(customerData),
        attachments: [
          {
            filename: `${invoice.invoiceNumber}-PAID.pdf`,
            content: pdfBuffer,
            contentType: 'application/pdf',
          },
        ],
      });
    }
  } catch (err) {
    logger.warn('Failed to dispatch invoice paid email (non-critical)', {
      invoiceId,
      err: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function dispatchInvoiceOverdueEmail(invoiceId: string): Promise<void> {
  try {
    const invoice = await loadInvoiceContext(invoiceId);
    if (!invoice) return;

    const biz = invoice.business;
    const ownerEmail = biz?.user?.email;
    const totalFormatted = formatNaira(invoice.total);
    const issueDateFormatted = formatHumanDate(invoice.issueDate);
    const dueDateFormatted = formatHumanDate(invoice.dueDate);
    const baseUrl = getFrontendBaseUrl();

    if (ownerEmail) {
      const ownerData = {
        recipientName: biz.ownerName || 'Business Owner',
        recipientRole: 'owner' as const,
        businessName: biz.businessName,
        invoiceNumber: invoice.invoiceNumber,
        customerName: invoice.customerName,
        totalFormatted,
        issueDateFormatted,
        dueDateFormatted,
        event: 'overdue' as const,
        actionLink: `${baseUrl}/invoices/${invoice.id}`,
      };

      await sendEmail({
        to: ownerEmail,
        subject: `Overdue Invoice Alert: ${invoice.invoiceNumber} (${totalFormatted}) — WallX ERP`,
        html: generateInvoiceLifecycleHtml(ownerData),
        text: generateInvoiceLifecycleText(ownerData),
      });
    }

    if (invoice.customerEmail && invoice.customerEmail.includes('@')) {
      const shareToken = await ensureInvoiceShareToken(invoice.businessId, invoice.id);
      const publicPdfLink = `${baseUrl}/api/v1/public/invoices/${shareToken}/pdf`;
      const customerData = {
        recipientName: invoice.customerName,
        recipientRole: 'customer' as const,
        businessName: biz.businessName,
        invoiceNumber: invoice.invoiceNumber,
        customerName: invoice.customerName,
        totalFormatted,
        issueDateFormatted,
        dueDateFormatted,
        bankName: biz.virtualAccountBank,
        accountNumber: biz.virtualAccountNumber,
        event: 'overdue' as const,
        actionLink: publicPdfLink,
      };

      await sendEmail({
        to: invoice.customerEmail,
        subject: `Overdue Notice: Invoice ${invoice.invoiceNumber} (${totalFormatted}) — ${biz.businessName}`,
        html: generateInvoiceLifecycleHtml(customerData),
        text: generateInvoiceLifecycleText(customerData),
      });
    }
  } catch (err) {
    logger.warn('Failed to dispatch invoice overdue email (non-critical)', {
      invoiceId,
      err: err instanceof Error ? err.message : String(err),
    });
  }
}

// ─── 11. Debtor Due Date Alert (to Business Owner) ──────────

export async function dispatchDebtorDueOwnerEmail(creditId: string): Promise<void> {
  try {
    const credit = await prisma.customerCredit.findUnique({
      where: { id: creditId },
      include: {
        business: {
          include: {
            user: { select: { email: true } },
          },
        },
      },
    });

    const ownerEmail = credit?.business?.user?.email;
    if (!credit || !ownerEmail) return;

    const amountFormatted = formatNaira(credit.balance);
    const dueDateFormatted = formatDateISO(credit.dueDate);
    const bankLabel = credit.business.virtualAccountNumber
      ? `${credit.business.virtualAccountNumber} (${credit.business.virtualAccountBank || 'Wema Bank'})`
      : 'Not Configured';

    const data = {
      ownerName: credit.business.ownerName || 'Business Owner',
      businessName: credit.business.businessName,
      amountFormatted,
      payerName: credit.customerName,
      accountNumber: bankLabel,
      reference: `DEBT-${credit.id.slice(0, 8).toUpperCase()}`,
      transactionDate: dueDateFormatted,
      dueDateFormatted,
      alertType: 'debtor_due_owner' as const,
      dashboardLink: `${getFrontendBaseUrl()}/debtors`,
    };

    await sendEmail({
      to: ownerEmail,
      subject: `Debtor Due Date Alert: ${amountFormatted} owed by ${credit.customerName} — WallX ERP`,
      html: generateCreditAlertHtml(data),
      text: generateCreditAlertText(data),
    });
  } catch (err) {
    logger.warn('Failed to dispatch debtor due owner email (non-critical)', {
      creditId,
      err: err instanceof Error ? err.message : String(err),
    });
  }
}

// ─── 11b. Debtor Credit Notification (to Debtor/Customer) ─────

export async function dispatchCreditCreatedEmail(
  creditId: string,
  userId?: string,
): Promise<void> {
  try {
    const credit = await prisma.customerCredit.findUnique({
      where: { id: creditId },
      include: {
        business: {
          include: {
            user: { select: { email: true, phone: true } },
          },
        },
      },
    });

    if (!credit || !credit.customerEmail || !credit.customerEmail.includes('@')) return;

    const amountFormatted = formatNaira(credit.totalAmount);
    const issueDateFormatted = formatDateISO(credit.issueDate);
    const dueDateFormatted = formatDateISO(credit.dueDate);

    const data: DebtorNotificationEmailData = {
      debtorName: credit.customerName,
      businessName: credit.business.businessName,
      businessPhone: credit.business.user?.phone,
      amountFormatted,
      issueDateFormatted,
      dueDateFormatted,
      description: credit.description || 'Credit Purchase',
      creditNumber: `CR-${credit.id.slice(0, 8).toUpperCase()}`,
      bankName: credit.business.virtualAccountBank,
      accountNumber: credit.business.virtualAccountNumber,
      accountName: credit.business.businessName,
    };

    const result = await sendEmail({
      to: credit.customerEmail,
      subject: `Credit Purchase Confirmed — ${credit.business.businessName} (${amountFormatted})`,
      html: generateDebtorNotificationHtml(data),
      text: generateDebtorNotificationText(data),
    });

    logger.info('Debtor credit notification dispatched', {
      creditId,
      customerEmail: credit.customerEmail,
      delivered: result.delivered,
    });

    await logAudit({
      userId: userId || credit.business.userId,
      businessId: credit.businessId,
      action: 'credit.debtor_notified',
      resourceType: 'customer_credit',
      resourceId: credit.id,
      newData: {
        to: credit.customerEmail,
        delivered: result.delivered,
        amount: credit.totalAmount,
      },
    });
  } catch (err) {
    logger.warn('Failed to dispatch debtor credit notification email (non-critical)', {
      creditId,
      err: err instanceof Error ? err.message : String(err),
    });
  }
}

// ─── 12. Tax Due Date Reminder ──────────────────────────────

export async function dispatchTaxDueDateEmail(
  businessId: string,
  month: number,
  year: number,
  reminderType: string,
): Promise<void> {
  try {
    const monthStart = new Date(Date.UTC(year, month - 1, 1));
    const [business, report] = await Promise.all([
      prisma.business.findUnique({
        where: { id: businessId },
        include: { user: { select: { email: true } } },
      }),
      prisma.monthlyTaxReport.findUnique({
        where: { businessId_taxMonth: { businessId, taxMonth: monthStart } },
      }),
    ]);

    const ownerEmail = business?.user?.email;
    if (!business || !ownerEmail) return;

    const taxMonthLabel = formatTaxMonth(monthStart);
    const estimatedTaxFormatted =
      report && toNumber(report.taxPayable) > 0 ? formatNaira(report.taxPayable) : undefined;

    const headlineMap: Record<string, { headline: string; msg: string }> = {
      unfiled_tax: {
        headline: 'Monthly Tax Assessment Not Yet Calculated',
        msg: `Your monthly tax report for <strong>${taxMonthLabel}</strong> has not been calculated yet for <strong>${business.businessName}</strong>. Please calculate and review your tax report on WallX ERP.`,
      },
      unfinalized_report: {
        headline: 'Draft Tax Report Awaiting Finalization',
        msg: `Your tax report for <strong>${taxMonthLabel}</strong> is still in draft status for <strong>${business.businessName}</strong>. Please finalize it so you can proceed with remittance.`,
      },
      unpaid_tax: {
        headline: 'Finalized Tax Report Awaiting Remittance',
        msg: `Your finalized tax assessment for <strong>${taxMonthLabel}</strong>${estimatedTaxFormatted ? ` (${estimatedTaxFormatted})` : ''} is awaiting payment for <strong>${business.businessName}</strong>.`,
      },
      tax_deadline: {
        headline: 'Monthly Tax Filing Due Date Approaching',
        msg: `Your configured monthly tax filing reminder date for <strong>${taxMonthLabel}</strong> has arrived for <strong>${business.businessName}</strong>. Please ensure your sales and expenses are up to date and complete your filing.`,
      },
    };

    const meta = headlineMap[reminderType] || headlineMap.tax_deadline;

    const data = {
      ownerName: business.ownerName || 'Business Owner',
      businessName: business.businessName,
      taxMonthLabel,
      statusHeadline: meta.headline,
      estimatedTaxFormatted,
      reminderMessage: meta.msg,
      taxDashboardLink: `${getFrontendBaseUrl()}/tax`,
    };

    await sendEmail({
      to: ownerEmail,
      subject: `Tax Filing Reminder (${taxMonthLabel}) — ${business.businessName} • WallX ERP`,
      html: generateTaxDueDateHtml(data),
      text: generateTaxDueDateText(data),
    });
  } catch (err) {
    logger.warn('Failed to dispatch tax due date email (non-critical)', {
      businessId,
      month,
      year,
      err: err instanceof Error ? err.message : String(err),
    });
  }
}

// ─── 13. End-of-Month Profit & Loss Statement Ready ─────────

export async function dispatchPnlStatementReadyEmail(
  businessId: string,
  month: number,
  year: number,
): Promise<void> {
  try {
    const business = await prisma.business.findUnique({
      where: { id: businessId },
      include: { user: { select: { email: true } } },
    });

    const ownerEmail = business?.user?.email;
    if (!business || !ownerEmail) return;

    const pnl = await getPnlStatementData(businessId, month, year);

    const data = {
      ownerName: business.ownerName || 'Business Owner',
      businessName: business.businessName,
      monthLabel: pnl.periodLabel,
      totalSalesFormatted: formatNaira(pnl.revenue.totalSales),
      totalExpensesFormatted: formatNaira(pnl.expenses.totalExpenses),
      grossProfitFormatted: formatNaira(pnl.summary.grossProfit),
      taxPayableFormatted: formatNaira(pnl.summary.taxPayable),
      profitMarginFormatted: `${pnl.summary.profitMargin.toFixed(1)}%`,
      downloadLink: `${getFrontendBaseUrl()}/tax?pnlMonth=${month}&pnlYear=${year}`,
    };

    await sendEmail({
      to: ownerEmail,
      subject: `Profit & Loss Statement Ready (${pnl.periodLabel}) — ${business.businessName} • WallX ERP`,
      html: generatePnlStatementReadyHtml(data),
      text: generatePnlStatementReadyText(data),
      attachments: [
        {
          filename: pnl.filename,
          content: pnl.buffer,
          contentType: 'application/pdf',
        },
      ],
    });
  } catch (err) {
    logger.warn('Failed to dispatch P&L statement ready email (non-critical)', {
      businessId,
      month,
      year,
      err: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Dispatch an account verification email to a newly registered or resending user.
 *
 * Invariant: Never throws — returns a boolean indicating whether the email was
 * delivered via an external provider (true) or fallback logged for dev (false).
 */
export async function dispatchVerificationEmail(
  userId: string,
  email: string,
  verificationLink: string
): Promise<boolean> {
  try {
    const { generateVerifyEmailHtml, generateVerifyEmailText } = await import(
      '@/lib/email/templates/verify-email'
    );

    const result = await sendEmail({
      to: email,
      subject: 'Verify Your Email Address — WallX ERP',
      html: generateVerifyEmailHtml({
        verificationLink,
        userEmail: email,
        expiryHours: 24,
      }),
      text: generateVerifyEmailText({
        verificationLink,
        userEmail: email,
        expiryHours: 24,
      }),
    });

    logger.info('Verification email dispatched', {
      userId,
      email,
      delivered: result.delivered,
      providerId: result.id,
    });

    return result.delivered;
  } catch (err) {
    logger.error('Failed to dispatch verification email', {
      userId,
      email,
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

/**
 * Dispatch team invitation email.
 *
 * Fire-and-forget — callers should not await this. Errors are logged,
 * never thrown, to avoid rolling back a successful invitation creation.
 */
export async function dispatchTeamInvitationEmail(
  inviteeEmail: string,
  businessName: string,
  inviterName: string,
  role: string,
  inviteToken: string,
  existingAccount?: boolean
): Promise<void> {
  try {
    const inviteLink = `${getFrontendBaseUrl()}/invite?token=${inviteToken}`;
    const expiresInDays = 7;

    const html = generateTeamInvitationHtml({
      inviteeEmail,
      businessName,
      inviterName,
      role,
      inviteLink,
      expiresInDays,
      existingAccount,
    });

    const text = generateTeamInvitationText({
      inviteeEmail,
      businessName,
      inviterName,
      role,
      inviteLink,
      expiresInDays,
      existingAccount,
    });

    await sendEmail({
      to: inviteeEmail,
      subject: `You're invited to join ${businessName} on WallX ERP`,
      html,
      text,
    });

    logger.info('Team invitation email dispatched', {
      inviteeEmail,
      businessName,
      role,
    });
  } catch (error) {
    logger.error('Failed to dispatch team invitation email', {
      error: error instanceof Error ? error.message : String(error),
      inviteeEmail,
      businessName,
    });
  }
}

export async function dispatchSubscriptionApprovedEmail(params: {
  toEmail: string;
  customerName: string;
  planName: string;
  expiresAt: Date | string;
  amount: number | string;
}) {
  try {
    const formattedExpiry = new Date(params.expiresAt).toLocaleDateString('en-NG', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e5e7eb; border-radius: 8px;">
        <h2 style="color: #6b21a8; margin-top: 0;">Subscription Activated! 🎉</h2>
        <p style="color: #374151; font-size: 15px;">Hello ${params.customerName},</p>
        <p style="color: #374151; font-size: 15px;">Your payment for the <strong>${params.planName}</strong> plan has been confirmed and your subscription is now active.</p>
        
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 14px;">
          <tr style="border-bottom: 1px solid #f3f4f6;">
            <td style="padding: 10px 0; font-weight: bold; color: #4b5563;">Active Plan:</td>
            <td style="padding: 10px 0; color: #6b21a8; font-weight: bold;">${params.planName}</td>
          </tr>
          <tr style="border-bottom: 1px solid #f3f4f6;">
            <td style="padding: 10px 0; font-weight: bold; color: #4b5563;">Valid Until:</td>
            <td style="padding: 10px 0; color: #111827;">${formattedExpiry}</td>
          </tr>
          <tr style="border-bottom: 1px solid #f3f4f6;">
            <td style="padding: 10px 0; font-weight: bold; color: #4b5563;">Payment Amount:</td>
            <td style="padding: 10px 0; color: #111827;">₦${Number(params.amount).toLocaleString()}</td>
          </tr>
        </table>

        <div style="margin-top: 24px;">
          <a href="${config.cors.frontendUrl || 'https://app.wallx.co'}/dashboard"
             style="display: inline-block; background-color: #6b21a8; color: white; padding: 12px 24px; border-radius: 9999px; text-decoration: none; font-weight: bold; font-size: 14px;">
            Go to Your Dashboard →
          </a>
        </div>

        <p style="color: #6b7280; font-size: 13px; margin-top: 30px;">Thank you for growing your business with WallXERP.</p>
      </div>
    `;

    await sendEmail({
      to: params.toEmail,
      subject: `Subscription Activated - WallXERP ${params.planName}`,
      html,
    });

    logger.info('Subscription approved email dispatched', {
      to: params.toEmail,
      plan: params.planName,
    });
  } catch (error) {
    logger.error('Failed to dispatch subscription approved email', {
      error: error instanceof Error ? error.message : String(error),
      to: params.toEmail,
    });
  }
}

export async function dispatchSubscriptionRejectedEmail(params: {
  toEmail: string;
  customerName: string;
  planName: string;
  reason: string;
}) {
  try {
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e5e7eb; border-radius: 8px;">
        <h2 style="color: #b91c1c; margin-top: 0;">Subscription Verification Update</h2>
        <p style="color: #374151; font-size: 15px;">Hello ${params.customerName},</p>
        <p style="color: #374151; font-size: 15px;">Our billing team reviewed your payment submission for the <strong>${params.planName}</strong> plan, but could not confirm the transfer.</p>
        
        <div style="background-color: #fef2f2; border: 1px solid #fecaca; padding: 16px; border-radius: 6px; margin: 20px 0;">
          <h4 style="margin: 0 0 6px 0; color: #991b1b;">Reason Provided:</h4>
          <p style="margin: 0; color: #7f1d1d; font-size: 14px;">${params.reason}</p>
        </div>

        <p style="color: #374151; font-size: 14px;">If you have already transferred funds, please re-upload a clear transfer receipt or reach out to our priority billing support directly on WhatsApp:</p>

        <div style="margin: 20px 0;">
          <a href="https://wa.me/2348147490832?text=Hello%20WallXERP%20Support,%20my%20subscription%20submission%20was%20rejected.%20Email:%20${encodeURIComponent(
            params.toEmail,
          )}" 
             style="display: inline-block; background-color: #059669; color: white; padding: 10px 20px; border-radius: 9999px; text-decoration: none; font-weight: bold; font-size: 14px;">
            Chat with Priority Support on WhatsApp
          </a>
        </div>

        <p style="color: #6b7280; font-size: 13px; margin-top: 24px;">WallXERP Billing Operations</p>
      </div>
    `;

    await sendEmail({
      to: params.toEmail,
      subject: `Action Required: Subscription Payment Verification - WallXERP`,
      html,
    });

    logger.info('Subscription rejected email dispatched', {
      to: params.toEmail,
      reason: params.reason,
    });
  } catch (error) {
    logger.error('Failed to dispatch subscription rejected email', {
      error: error instanceof Error ? error.message : String(error),
      to: params.toEmail,
    });
  }
}

export async function dispatchSubscriptionExpiredEmail(
  user: { email: string; fullName?: string | null },
  type: 'trial' | 'subscription'
): Promise<void> {
  try {
    const isTrial = type === 'trial';
    const title = isTrial ? 'Your Free Trial Has Ended' : 'Your WallXERP Subscription Has Expired';
    const subtitle = isTrial
      ? 'Your 30-day free trial on WallXERP has concluded. To keep recording sales, issuing invoices, and tracking taxes seamlessly, please choose a plan that fits your business.'
      : 'Your active subscription period has expired. You are currently in read-only mode — renew your subscription to resume recording sales, expenses, and automated tax calculations.';

    const upgradeUrl = `${getFrontendBaseUrl()}/subscription`;

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e5e7eb; border-radius: 8px;">
        <h2 style="color: #6b21a8; margin-top: 0;">${title} ⏳</h2>
        <p style="color: #374151; font-size: 15px;">Hello ${user.fullName || 'Business Owner'},</p>
        <p style="color: #374151; font-size: 15px; line-height: 1.5;">${subtitle}</p>

        <div style="background-color: #f9fafb; padding: 16px; border-radius: 6px; margin: 20px 0; border: 1px solid #e5e7eb;">
          <p style="margin: 0; color: #4b5563; font-size: 14px;"><strong>Note:</strong> Your existing financial data, invoices, and tax filings remain completely safe and accessible in read-only mode during our 2-day grace window.</p>
        </div>

        <div style="margin: 28px 0;">
          <a href="${upgradeUrl}"
             style="display: inline-block; background-color: #6b21a8; color: white; padding: 12px 28px; border-radius: 9999px; text-decoration: none; font-weight: bold; font-size: 14px;">
            Choose a Plan & Upgrade Now →
          </a>
        </div>

        <p style="color: #6b7280; font-size: 13px; margin-top: 24px;">Need help choosing? Reach out to support at support@wallx.co or via WhatsApp.</p>
      </div>
    `;

    await sendEmail({
      to: user.email,
      subject: `${title} - Action Required`,
      html,
    });

    logger.info('Subscription expired email dispatched', {
      to: user.email,
      type,
    });
  } catch (error) {
    logger.error('Failed to dispatch subscription expired email', {
      error: error instanceof Error ? error.message : String(error),
      to: user.email,
    });
  }
}

export async function dispatchTrialEndingReminderEmail(
  user: { email: string; fullName?: string | null },
  daysRemaining: number
): Promise<void> {
  try {
    const upgradeUrl = `${getFrontendBaseUrl()}/subscription`;

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e5e7eb; border-radius: 8px;">
        <h2 style="color: #6b21a8; margin-top: 0;">Your WallXERP Free Trial Ends in ${daysRemaining} Day${daysRemaining === 1 ? '' : 's'} ⏱️</h2>
        <p style="color: #374151; font-size: 15px;">Hello ${user.fullName || 'Business Owner'},</p>
        <p style="color: #374151; font-size: 15px; line-height: 1.5;">This is a friendly reminder that your WallXERP free trial will expire soon. To ensure uninterrupted access to automated tax filing, invoicing, and sales tracking, select your preferred plan today.</p>

        <div style="margin: 28px 0;">
          <a href="${upgradeUrl}"
             style="display: inline-block; background-color: #6b21a8; color: white; padding: 12px 28px; border-radius: 9999px; text-decoration: none; font-weight: bold; font-size: 14px;">
            View Plans & Upgrade →
          </a>
        </div>

        <p style="color: #6b7280; font-size: 13px; margin-top: 24px;">Thank you for partnering with WallXERP.</p>
      </div>
    `;

    await sendEmail({
      to: user.email,
      subject: `Your WallXERP Free Trial Ends in ${daysRemaining} Day${daysRemaining === 1 ? '' : 's'}`,
      html,
    });

    logger.info('Trial ending reminder email dispatched', {
      to: user.email,
      daysRemaining,
    });
  } catch (error) {
    logger.error('Failed to dispatch trial ending reminder email', {
      error: error instanceof Error ? error.message : String(error),
      to: user.email,
    });
  }
}

export interface DispatchVoucherNotificationInput {
  businessId: string;
  customerId: string;
  cardCode?: string; // deprecated — retired, kept optional for backward compat; never sent in email
  balance: number;
  actionType?: 'created' | 'top_up' | 'change_credit';
  amount?: number;
  bonusAmount?: number | null;
  bonusPct?: number | null;
  notes?: string | null;
  toEmail?: string | null;
  customerName?: string | null;
  pinCode?: string; // 6-digit plaintext PIN (only when issuing/changing PIN)
}

/**
 * Fire-and-forget email notification sent to customers when a store voucher card
 * is created, topped up, or change is credited in CRM.
 */
export async function dispatchVoucherNotificationEmail(
  input: DispatchVoucherNotificationInput
): Promise<void> {
  try {
    let toEmail = input.toEmail?.trim();
    let customerName = input.customerName?.trim();
    let customerPhone: string | null = null;

    // If customer details were not pre-passed, query Customer
    if (!toEmail || !customerName) {
      const customer = await prisma.customer.findUnique({
        where: { id: input.customerId },
        select: { email: true, name: true, phone: true },
      });
      if (!customer?.email) {
        // Customer has no email address on file; nothing to dispatch
        return;
      }
      toEmail = customer.email;
      customerName = customer.name;
      customerPhone = customer.phone;
    }

    if (!toEmail) return;

    const business = await prisma.business.findUnique({
      where: { id: input.businessId },
      select: {
        businessName: true,
        user: { select: { phone: true } },
      },
    });

    const businessName = business?.businessName || 'Your Store';
    const businessPhone = business?.user?.phone || null;
    const balanceFormatted = formatNaira(input.balance);
    const amountFormatted = input.amount !== undefined ? formatNaira(input.amount) : undefined;
    const bonusAmountFormatted = input.bonusAmount !== undefined && input.bonusAmount !== null && input.bonusAmount > 0 ? formatNaira(input.bonusAmount) : null;

    const templateData: VoucherNotificationEmailData = {
      customerName: customerName || 'Valued Customer',
      businessName,
      balanceFormatted,
      actionType: input.actionType ?? 'created',
      amountFormatted,
      bonusAmountFormatted,
      bonusPct: input.bonusPct ?? null,
      customerPhone,
      businessPhone,
      notes: input.notes,
      pinCode: input.pinCode, // Forward PIN to template (only present when issuing/changing)
    };

    const html = generateVoucherNotificationHtml(templateData);
    const text = generateVoucherNotificationText(templateData);

    const subject =
      input.actionType === 'top_up'
        ? `Store Voucher Topped Up: ${businessName}`
        : input.actionType === 'change_credit'
          ? `Change Saved to Your Voucher: ${businessName}`
          : `Your Voucher is Ready: ${businessName}`;

    await sendEmail({
      to: toEmail,
      subject,
      html,
      text,
    });

    logger.info('Voucher notification email dispatched successfully', {
      customerId: input.customerId,
      businessId: input.businessId,
      customerName: customerName || 'Valued Customer',
      to: toEmail,
      actionType: input.actionType ?? 'created',
    });
  } catch (error) {
    logger.error('Failed to dispatch voucher notification email', {
      error: error instanceof Error ? error.message : String(error),
      customerId: input.customerId,
      businessId: input.businessId,
    });
  }
}

// ─── 11c. Voucher Deduction Receipt (to Customer) ─────────────

export interface DispatchVoucherDeductionInput {
  businessId: string;
  customerId: string;
  amountDebited: number;
  receiptNumber?: string | null;
  saleId?: string;
  transactionDate?: Date;
}

/**
 * Fire-and-forget transaction receipt email dispatched immediately after a voucher
 * balance is debited for a purchase. Includes security alert for unauthorized transactions.
 *
 * Never throws — logs warnings if customer email is missing or send fails.
 */
export async function dispatchVoucherDeductionEmail(
  input: DispatchVoucherDeductionInput
): Promise<void> {
  try {
    const customer = await prisma.customer.findUnique({
      where: { id: input.customerId },
      select: { email: true, name: true },
    });

    if (!customer?.email || !customer.email.includes('@')) {
      logger.warn('Voucher deduction alert skipped: no email', {
        customerId: input.customerId,
      });
      return;
    }

    const card = await prisma.customerCard.findUnique({
      where: { customerId: input.customerId },
      select: { balance: true },
    });

    if (!card) {
      logger.warn('Voucher deduction alert skipped: no card found', {
        customerId: input.customerId,
      });
      return;
    }

    const business = await prisma.business.findUnique({
      where: { id: input.businessId },
      select: {
        businessName: true,
        city: true,
        user: { select: { phone: true } },
      },
    });

    const businessName = business?.businessName || 'Your Store';
    const storeLocation = business?.city || null;
    const businessPhone = business?.user?.phone || null;

    const amountDebitedFormatted = formatNaira(input.amountDebited);
    const newBalanceFormatted = formatNaira(card.balance);
    const transactionDateFormatted = formatDateISO(input.transactionDate || new Date());

    const templateData: VoucherDeductionEmailData = {
      customerName: customer.name,
      businessName,
      amountDebitedFormatted,
      newBalanceFormatted,
      receiptNumber: input.receiptNumber,
      storeLocation,
      transactionDateFormatted,
      businessPhone,
    };

    const html = generateVoucherDeductionHtml(templateData);
    const text = generateVoucherDeductionText(templateData);

    await sendEmail({
      to: customer.email,
      subject: `Receipt: –${amountDebitedFormatted} from your voucher — ${businessName}`,
      html,
      text,
    });

    logger.info('Voucher deduction receipt dispatched successfully', {
      customerId: input.customerId,
      businessId: input.businessId,
      amountDebited: input.amountDebited,
      to: customer.email,
      saleId: input.saleId,
    });
  } catch (error) {
    logger.warn('Failed to dispatch voucher deduction email (non-critical)', {
      error: error instanceof Error ? error.message : String(error),
      customerId: input.customerId,
      businessId: input.businessId,
    });
  }
}

/**
 * Dispatches an individual broadcast or direct message notification email.
 * Safe wrapper around sendEmail with WallX branding.
 */
export async function dispatchBroadcastEmail(to: string, title: string, body: string): Promise<void> {
  try {
    const ctaUrl = `${getFrontendBaseUrl()}/messages`;
    await sendEmail({
      to,
      subject: `[WallX] ${title}`,
      html: generateBroadcastHtml({ title, body, ctaUrl }),
      text: generateBroadcastText({ title, body, ctaUrl }),
    });
  } catch (error) {
    logger.warn('Failed to dispatch broadcast email (non-critical)', {
      to,
      title,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export interface DispatchVoucherVerificationInput {
  businessId: string;
  customerId: string;
  requestId: string;
  amount: number;
  bonusAmount?: number | null;
  bonusPct?: number | null;
  verifyUrl: string;
  toEmail?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
}

export async function dispatchVoucherVerificationEmail(
  input: DispatchVoucherVerificationInput
): Promise<{ delivered: boolean; waUrl?: string }> {
  try {
    let toEmail = input.toEmail?.trim();
    let customerName = input.customerName?.trim();
    let customerPhone = input.customerPhone?.trim();

    if (!toEmail || !customerName) {
      const customer = await prisma.customer.findUnique({
        where: { id: input.customerId },
        select: { email: true, name: true, phone: true },
      });
      if (customer) {
        toEmail = customer.email || undefined;
        customerName = customer.name || undefined;
        customerPhone = customer.phone || undefined;
      }
    }

    const business = await prisma.business.findUnique({
      where: { id: input.businessId },
      select: { businessName: true, user: { select: { phone: true } } },
    });

    const businessName = business?.businessName || 'Your Store';
    const amountFormatted = formatNaira(input.amount);
    const bonusFormatted = input.bonusAmount ? formatNaira(input.bonusAmount) : null;
    const totalFormatted = formatNaira(input.amount + (input.bonusAmount || 0));

    // Construct WhatsApp share link for staff fallback
    const waText = encodeURIComponent(
      `Hello ${customerName || 'Valued Customer'},\n\nA voucher credit of ${amountFormatted} at ${businessName} has been authorized.\nPlease confirm this was requested by visiting: ${input.verifyUrl}`
    );
    const waUrl = customerPhone
      ? `https://wa.me/${customerPhone.replace(/\D/g, '')}?text=${waText}`
      : `https://wa.me/?text=${waText}`;

    if (!toEmail) {
      logger.info('No email for voucher verification; generated WhatsApp fallback link', {
        requestId: input.requestId,
        waUrl,
      });
      return { delivered: false, waUrl };
    }

    const subject = `Action Required: Confirm your voucher credit of ${amountFormatted} at ${businessName}`;
    const emailData = {
      customerName: customerName || 'Valued Customer',
      businessName,
      amountFormatted,
      bonusAmountFormatted: bonusFormatted,
      bonusPct: input.bonusPct,
      totalFormatted,
      verifyUrl: input.verifyUrl,
      customerPhone,
      businessPhone: business?.user?.phone || null,
    };
    const html = generateVoucherVerificationHtml(emailData);
    const text = generateVoucherVerificationText(emailData);

    await sendEmail({
      to: toEmail,
      subject,
      html,
      text,
    });

    return { delivered: true, waUrl };
  } catch (error) {
    logger.warn('Failed to dispatch voucher verification email (non-critical)', {
      error: error instanceof Error ? error.message : String(error),
      requestId: input.requestId,
      customerId: input.customerId,
    });
    return { delivered: false };
  }
}

export interface DispatchVoucherAdjustmentNotificationInput {
  businessId: string;
  customerId: string;
  amount: number;
  reason: string;
  toEmail?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
}

export async function dispatchVoucherAdjustmentNotificationEmail(
  input: DispatchVoucherAdjustmentNotificationInput
): Promise<void> {
  try {
    let toEmail = input.toEmail?.trim();
    let customerName = input.customerName?.trim();

    if (!toEmail || !customerName) {
      const customer = await prisma.customer.findUnique({
        where: { id: input.customerId },
        select: { email: true, name: true, phone: true },
      });
      if (!customer?.email) return;
      toEmail = customer.email;
      customerName = customer.name;
    }

    const business = await prisma.business.findUnique({
      where: { id: input.businessId },
      select: { businessName: true, user: { select: { phone: true } } },
    });

    const businessName = business?.businessName || 'Your Store';
    const businessPhone = business?.user?.phone || undefined;
    const formattedAmount = formatNaira(Math.abs(input.amount));

    const subject = `Voucher Balance Adjustment: ${businessName}`;
    const adjData = {
      customerName: customerName || 'Valued Customer',
      businessName,
      amount: input.amount,
      amountFormatted: formattedAmount,
      reason: input.reason,
      customerPhone: input.customerPhone,
      businessPhone,
    };
    const html = generateVoucherAdjustmentNotificationHtml(adjData);
    const text = generateVoucherAdjustmentNotificationText(adjData);

    await sendEmail({
      to: toEmail,
      subject,
      html,
      text,
    });
  } catch (error) {
    logger.warn('Failed to dispatch voucher adjustment notification email', {
      error: error instanceof Error ? error.message : String(error),
      customerId: input.customerId,
      businessId: input.businessId,
    });
  }
}





