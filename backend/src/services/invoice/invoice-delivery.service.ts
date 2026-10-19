import crypto from 'crypto';
import prisma, { TxClient } from '@/lib/prisma';
import logger from '@/lib/logger';
import config from '@/config';
import { AppError } from '@/middleware/errorHandler';
import { logAudit } from '@/lib/audit';
import { buildInvoicePdf } from '@/services/invoice.pdf';
import { verifyBusinessAccess } from '@/lib/ownership';
import { toNumber } from '@/shared/helpers';
import { maybeFireOverdueReminderOnSend } from './invoice-crud.service';
import { dispatchInvoiceIssuedEmail } from '@/services/email-dispatch.service';
import { sendEmail } from '@/lib/email';
import {
  generateInvoiceLifecycleHtml,
  generateInvoiceLifecycleText,
} from '@/lib/email/templates/invoice-lifecycle';

// ─── PDF Generation ─────────────────────────────────────────

export async function generateInvoicePdf(
  userId: string,
  businessId: string,
  invoiceId: string,
): Promise<{ buffer: Buffer; filename: string }> {
  const { business } = await verifyBusinessAccess(userId, businessId, 'invoices.read');

  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: { lines: { orderBy: { sortOrder: 'asc' } } },
  });

  if (!invoice || invoice.businessId !== businessId) {
    throw new AppError(404, 'Invoice not found', 'INVOICE_NOT_FOUND');
  }

  const buffer = await buildInvoicePdf(
    {
      businessName: business.businessName,
      merchantId: business.merchantId,
      ownerName: business.ownerName,
      taxId: business.taxId,
      address: business.address,
      city: business.city,
      state: business.state,
      logoUrl: business.logoUrl,
    },
    invoice,
  );

  const filename = `${invoice.invoiceNumber}.pdf`;

  logAudit({
    userId,
    businessId,
    action: 'invoice.pdf_downloaded',
    resourceType: 'invoice',
    resourceId: invoiceId,
    newData: { invoiceNumber: invoice.invoiceNumber, status: invoice.status },
  });

  logger.info('Invoice PDF generated', {
    invoiceId,
    invoiceNumber: invoice.invoiceNumber,
    bytes: buffer.length,
    businessId,
    userId,
  });

  return { buffer, filename };
}

// ─── Public share token + public PDF ────────────────────────

function generateShareToken(): string {
  return crypto.randomBytes(16).toString('hex');
}

export async function ensureInvoiceShareToken(
  businessId: string,
  invoiceId: string,
  tx?: TxClient,
): Promise<string> {
  const db = tx ?? prisma;
  const existing = await db.invoice.findUnique({
    where: { id: invoiceId },
    select: { shareToken: true, businessId: true },
  });
  if (!existing || existing.businessId !== businessId) {
    throw new AppError(404, 'Invoice not found', 'INVOICE_NOT_FOUND');
  }
  if (existing.shareToken) return existing.shareToken;

  const token = generateShareToken();
  try {
    await db.invoice.update({
      where: { id: invoiceId },
      data: { shareToken: token },
    });
    return token;
  } catch (err: any) {
    if (err?.code === 'P2002') {
      const reread = await db.invoice.findUnique({
        where: { id: invoiceId },
        select: { shareToken: true },
      });
      if (reread?.shareToken) return reread.shareToken;
    }
    throw err;
  }
}

export async function getPublicInvoicePdfByToken(
  shareToken: string,
): Promise<{ buffer: Buffer; filename: string }> {
  const trimmed = shareToken.trim();
  if (!trimmed || !/^[0-9a-f]{32}$/i.test(trimmed)) {
    throw new AppError(400, 'Invalid share token format', 'INVALID_SHARE_TOKEN');
  }

  const invoice = await prisma.invoice.findUnique({
    where: { shareToken: trimmed },
    include: {
      lines: { orderBy: { sortOrder: 'asc' } },
      business: {
        select: {
          businessName: true,
          merchantId: true,
          ownerName: true,
          taxId: true,
          address: true,
          city: true,
          state: true,
          logoUrl: true,
        },
      },
    },
  });

  if (!invoice) {
    throw new AppError(404, 'Invoice link is invalid or has expired.', 'INVOICE_LINK_INVALID');
  }

  if (invoice.status === 'cancelled') {
    throw new AppError(410, 'This invoice was cancelled by the sender.', 'INVOICE_CANCELLED');
  }

  const buffer = await buildInvoicePdf(
    {
      businessName: invoice.business.businessName,
      merchantId: invoice.business.merchantId,
      ownerName: invoice.business.ownerName,
      taxId: invoice.business.taxId,
      address: invoice.business.address,
      city: invoice.business.city,
      state: invoice.business.state,
      logoUrl: invoice.business.logoUrl,
    },
    invoice,
  );

  logger.info('Public invoice PDF served', {
    invoiceId: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    businessId: invoice.businessId,
    bytes: buffer.length,
  });

  return { buffer, filename: `${invoice.invoiceNumber}.pdf` };
}

// ─── Electronic delivery (WhatsApp) ──────────────────────────

function formatNairaMinor(n: number): string {
  return `₦${n.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDateHuman(d: Date): string {
  return d.toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' });
}

function normalizePhoneForWa(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const hasPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/[^\d]/g, '');
  if (digits.length < 7) return null;

  if (hasPlus) return digits;
  if (digits.startsWith('0') && digits.length === 11) return `234${digits.slice(1)}`;
  if (digits.startsWith('234')) return digits;
  if (digits.length === 10) return `234${digits}`;
  return digits;
}

function getFrontendBaseUrl(): string {
  return (config.cors.frontendUrl.split(',')[0]?.trim() || 'http://localhost:5173').replace(
    /\/$/,
    '',
  );
}

function buildPublicInvoiceLink(shareToken: string): string {
  const base = (
    config.publicUrls.apiBase ||
    process.env.PUBLIC_API_URL ||
    process.env.FRONTEND_URL ||
    'http://localhost:5173'
  ).replace(/\/$/, '');
  return `${base}/api/v1/public/invoices/${shareToken}/pdf`;
}

export async function sendInvoiceByWhatsApp(
  userId: string,
  businessId: string,
  invoiceId: string,
): Promise<{
  invoice: any;
  waUrl: string;
  message: string;
  pdfUrl: string;
  pdfBuffer: Buffer;
  filename: string;
  to: string;
}> {
  const { business } = await verifyBusinessAccess(userId, businessId, 'invoices.send');

  const existing = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: { lines: { orderBy: { sortOrder: 'asc' } } },
  });
  if (!existing || existing.businessId !== businessId) {
    throw new AppError(404, 'Invoice not found', 'INVOICE_NOT_FOUND');
  }
  if (existing.status === 'cancelled') {
    throw new AppError(409, 'Cannot send a cancelled invoice.', 'INVOICE_CANCELLED');
  }
  if (!existing.customerPhone) {
    throw new AppError(
      400,
      'This invoice has no customer phone. Add one by editing the invoice.',
      'INVOICE_NO_PHONE',
    );
  }

  const normalized = normalizePhoneForWa(existing.customerPhone);
  if (!normalized) {
    throw new AppError(
      400,
      'Customer phone number appears invalid. Edit the invoice and enter a valid phone number.',
      'INVOICE_INVALID_PHONE',
    );
  }

  const shareToken = await ensureInvoiceShareToken(businessId, invoiceId);

  const pdfBuffer = await buildInvoicePdf(
    {
      businessName: business.businessName,
      merchantId: business.merchantId,
      ownerName: business.ownerName,
      taxId: business.taxId,
      address: business.address,
      city: business.city,
      state: business.state,
      logoUrl: business.logoUrl,
    },
    existing,
  );

  const total = toNumber(existing.total);
  const pdfUrl = buildPublicInvoiceLink(shareToken);
  const isPaid = existing.status === 'paid';
  const filename = `${existing.invoiceNumber}.pdf`;

  const message = isPaid
    ? [
        `Hi ${existing.customerName},`,
        ``,
        `Receipt for invoice ${existing.invoiceNumber} from ${business.businessName}.`,
        `Amount paid: ${formatNairaMinor(total)}`,
        existing.paidAt ? `Paid on: ${formatDateHuman(existing.paidAt)}` : '',
        ``,
        `— Sent via WallX ERP`,
      ]
        .filter(Boolean)
        .join('\n')
    : [
        `Hi ${existing.customerName},`,
        ``,
        `Invoice ${existing.invoiceNumber} from ${business.businessName}.`,
        `Amount due: ${formatNairaMinor(total)}`,
        `Due date: ${formatDateHuman(existing.dueDate)}`,
        existing.paymentTerms ? `\nPayment terms:\n${existing.paymentTerms}` : '',
        ``,
        `— Sent via WallX ERP`,
      ]
        .filter(Boolean)
        .join('\n');

  const waUrl = `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`;

  const updated = await prisma.$transaction(async (tx) => {
    const wasDraft = existing.status === 'draft';
    const data: Record<string, any> = {};
    if (wasDraft) {
      data.status = 'sent';
      data.sentAt = new Date();
    }

    const updatedInvoice = Object.keys(data).length
      ? await tx.invoice.update({
          where: { id: invoiceId },
          data,
          include: { lines: { orderBy: { sortOrder: 'asc' } }, linkedSale: true },
        })
      : await tx.invoice.findUnique({
          where: { id: invoiceId },
          include: { lines: { orderBy: { sortOrder: 'asc' } }, linkedSale: true },
        });

    await logAudit(
      {
        userId,
        businessId,
        action: 'invoice.whatsapped',
        resourceType: 'invoice',
        resourceId: invoiceId,
        oldData: { status: existing.status },
        newData: {
          to: normalized,
          statusAfter: wasDraft ? 'sent' : existing.status,
          paid: isPaid,
        },
      },
      tx,
    );

    return updatedInvoice;
  });

  logger.info('Invoice PDF generated for WhatsApp', {
    invoiceId,
    invoiceNumber: existing.invoiceNumber,
    to: normalized,
    businessId,
    userId,
    paid: isPaid,
    pdfBytes: pdfBuffer.length,
  });

  if (updated) {
    maybeFireOverdueReminderOnSend(updated);
    if (existing.status === 'draft') {
      void dispatchInvoiceIssuedEmail(updated.id);
    }
  }

  return { invoice: updated, waUrl, message, pdfUrl, pdfBuffer, filename, to: normalized };
}

// ─── Electronic delivery (Email) ─────────────────────────────

export async function sendInvoiceByEmail(
  userId: string,
  businessId: string,
  invoiceId: string,
): Promise<{
  invoice: any;
  delivered: boolean;
  to: string;
}> {
  const { business } = await verifyBusinessAccess(userId, businessId, 'invoices.send');

  const existing = await prisma.invoice.findUnique({
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

  if (!existing || existing.businessId !== businessId) {
    throw new AppError(404, 'Invoice not found', 'INVOICE_NOT_FOUND');
  }

  if (existing.status === 'cancelled') {
    throw new AppError(409, 'Cannot send a cancelled invoice.', 'INVOICE_CANCELLED');
  }

  if (existing.status === 'paid') {
    throw new AppError(409, 'Cannot email an invoice that is already marked as paid.', 'INVOICE_ALREADY_PAID');
  }

  if (!existing.customerEmail || !existing.customerEmail.includes('@')) {
    throw new AppError(
      400,
      'Customer email is required to send invoice electronically. Edit the invoice to provide a valid customer email.',
      'INVOICE_NO_EMAIL',
    );
  }

  const customerEmail = existing.customerEmail.trim();
  const shareToken = await ensureInvoiceShareToken(businessId, invoiceId);

  const pdfBuffer = await buildInvoicePdf(
    {
      businessName: business.businessName,
      merchantId: business.merchantId,
      ownerName: business.ownerName,
      taxId: business.taxId,
      address: business.address,
      city: business.city,
      state: business.state,
      logoUrl: business.logoUrl,
    },
    existing,
  );

  const total = toNumber(existing.total);
  const totalFormatted = formatNairaMinor(total);
  const issueDateFormatted = formatDateHuman(existing.issueDate);
  const dueDateFormatted = formatDateHuman(existing.dueDate);
  const publicPdfLink = buildPublicInvoiceLink(shareToken);

  // 1. Dispatch customer email with PDF attached
  const customerEmailData = {
    recipientName: existing.customerName,
    recipientRole: 'customer' as const,
    businessName: business.businessName,
    invoiceNumber: existing.invoiceNumber,
    customerName: existing.customerName,
    totalFormatted,
    issueDateFormatted,
    dueDateFormatted,
    bankName: business.virtualAccountBank,
    accountNumber: business.virtualAccountNumber,
    event: 'issued' as const,
    actionLink: publicPdfLink,
  };

  const sendResult = await sendEmail({
    to: customerEmail,
    subject: `Invoice ${existing.invoiceNumber} from ${business.businessName} (${totalFormatted})`,
    html: generateInvoiceLifecycleHtml(customerEmailData),
    text: generateInvoiceLifecycleText(customerEmailData),
    attachments: [
      {
        filename: `${existing.invoiceNumber}.pdf`,
        content: pdfBuffer,
        contentType: 'application/pdf',
      },
    ],
  });

  // 2. Dispatch confirmation copy to business owner (best effort)
  const ownerEmail = existing.business?.user?.email;
  if (ownerEmail && ownerEmail.toLowerCase() !== customerEmail.toLowerCase()) {
    try {
      const baseUrl = getFrontendBaseUrl();
      const ownerEmailData = {
        recipientName: business.ownerName || 'Business Owner',
        recipientRole: 'owner' as const,
        businessName: business.businessName,
        invoiceNumber: existing.invoiceNumber,
        customerName: existing.customerName,
        totalFormatted,
        issueDateFormatted,
        dueDateFormatted,
        event: 'issued' as const,
        actionLink: `${baseUrl}/invoices/${existing.id}`,
      };
      await sendEmail({
        to: ownerEmail,
        subject: `Invoice Sent: ${existing.invoiceNumber} to ${existing.customerName} (${totalFormatted}) — WallX ERP`,
        html: generateInvoiceLifecycleHtml(ownerEmailData),
        text: generateInvoiceLifecycleText(ownerEmailData),
      });
    } catch (ownerErr) {
      logger.warn('Failed to send invoice copy to business owner (non-critical)', { err: ownerErr });
    }
  }

  // 3. Atomically transition draft -> sent (idempotent if already sent or overdue)
  const updated = await prisma.$transaction(async (tx) => {
    const wasDraft = existing.status === 'draft';
    const data: Record<string, any> = {};
    if (wasDraft) {
      data.status = 'sent';
      data.sentAt = new Date();
    }

    const updatedInvoice = Object.keys(data).length
      ? await tx.invoice.update({
          where: { id: invoiceId },
          data,
          include: { lines: { orderBy: { sortOrder: 'asc' } }, linkedSale: true },
        })
      : await tx.invoice.findUnique({
          where: { id: invoiceId },
          include: { lines: { orderBy: { sortOrder: 'asc' } }, linkedSale: true },
        });

    await logAudit(
      {
        userId,
        businessId,
        action: 'invoice.emailed',
        resourceType: 'invoice',
        resourceId: invoiceId,
        oldData: { status: existing.status },
        newData: {
          to: customerEmail,
          statusAfter: wasDraft ? 'sent' : existing.status,
          delivered: sendResult.delivered,
        },
      },
      tx,
    );

    return updatedInvoice;
  });

  logger.info('Invoice dispatched via email', {
    invoiceId,
    invoiceNumber: existing.invoiceNumber,
    to: customerEmail,
    businessId,
    userId,
    delivered: sendResult.delivered,
    pdfBytes: pdfBuffer.length,
  });

  if (updated && existing.status === 'draft') {
    maybeFireOverdueReminderOnSend(updated);
  }

  return {
    invoice: updated,
    delivered: sendResult.delivered,
    to: customerEmail,
  };
}
