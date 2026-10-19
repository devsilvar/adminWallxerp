/**
 * Invoice Lifecycle Email Template (Issued, Paid, Overdue)
 *
 * Supports notifications to both the business owner and the customer for:
 * - 'issued': New invoice issued / sent
 * - 'paid': Invoice payment confirmed
 * - 'overdue': Invoice past due date reminder
 * Matches the WallX ERP purple design system of Welcome Aboard & Tax Payment Confirmed.
 */

import { escapeHtml } from '../escape';

export interface InvoiceLifecycleEmailData {
  recipientName: string;
  recipientRole: 'owner' | 'customer';
  businessName: string;
  invoiceNumber: string;
  customerName: string;
  totalFormatted: string;
  issueDateFormatted: string;
  dueDateFormatted: string;
  paidDateFormatted?: string;
  paymentMethodLabel?: string;
  bankName?: string | null;
  accountNumber?: string | null;
  event: 'issued' | 'paid' | 'overdue';
  actionLink: string;
}

export function generateInvoiceLifecycleHtml(data: InvoiceLifecycleEmailData): string {
  const isOwner = data.recipientRole === 'owner';
  const recipientName = escapeHtml(data.recipientName);
  const businessName = escapeHtml(data.businessName);
  const customerName = escapeHtml(data.customerName);
  const invoiceNumber = escapeHtml(data.invoiceNumber);
  const totalFormatted = escapeHtml(data.totalFormatted);
  const issueDateFormatted = escapeHtml(data.issueDateFormatted);
  const dueDateFormatted = escapeHtml(data.dueDateFormatted);
  const paidDateFormatted = data.paidDateFormatted ? escapeHtml(data.paidDateFormatted) : undefined;
  const paymentMethodLabel = data.paymentMethodLabel ? escapeHtml(data.paymentMethodLabel) : undefined;
  const bankName = data.bankName ? escapeHtml(data.bankName) : null;
  const accountNumber = data.accountNumber ? escapeHtml(data.accountNumber) : null;
  const actionLink = escapeHtml(data.actionLink);

  const eyebrow =
    data.event === 'issued'
      ? 'New Invoice Issued'
      : data.event === 'paid'
      ? 'Invoice Paid & Settled'
      : 'Invoice Overdue Notice';

  const bannerLabel =
    data.event === 'paid'
      ? 'Total Invoice Amount Paid'
      : data.event === 'overdue'
      ? 'Overdue Invoice Balance'
      : 'Invoice Total Due';

  const bodyLead =
    data.event === 'issued'
      ? isOwner
        ? `Invoice <strong>${invoiceNumber}</strong> for <strong>${customerName}</strong> has been issued by <strong>${businessName}</strong>.`
        : `<strong>${businessName}</strong> has issued invoice <strong>${invoiceNumber}</strong> to you. A PDF copy of the invoice is attached for your records.`
      : data.event === 'paid'
      ? isOwner
        ? `Invoice <strong>${invoiceNumber}</strong> from <strong>${customerName}</strong> has been marked as paid and recorded in your sales ledger.`
        : `Thank you! Your payment for invoice <strong>${invoiceNumber}</strong> to <strong>${businessName}</strong> has been confirmed.`
      : isOwner
      ? `Invoice <strong>${invoiceNumber}</strong> issued to <strong>${customerName}</strong> is now past its due date of <strong>${dueDateFormatted}</strong>.`
      : `This is a friendly reminder that invoice <strong>${invoiceNumber}</strong> from <strong>${businessName}</strong> was due on <strong>${dueDateFormatted}</strong>.`;

  const ctaLabel =
    isOwner
      ? 'View Invoice in WallX ERP \u2192'
      : data.event === 'paid'
      ? 'Download Paid Invoice PDF \u2192'
      : 'View & Download Invoice PDF \u2192';

  const bankBlock =
    !isOwner && data.event !== 'paid' && bankName && accountNumber
      ? `
              <div style="background-color: #faf5ff; border: 1px solid #f3e8ff; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
                <p style="margin: 0 0 6px; color: #581c87; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">
                  Bank Transfer Payment Details
                </p>
                <p style="margin: 0; color: #4c1d95; font-size: 14px; line-height: 1.6;">
                  <strong>Bank:</strong> ${bankName}<br>
                  <strong>Account Number:</strong> <span style="font-family: monospace; font-weight: 700;">${accountNumber}</span><br>
                  <strong>Account Name:</strong> ${businessName}
                </p>
              </div>`
      : '';

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${eyebrow} (${invoiceNumber}) - WallX ERP</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f8fafc; color: #334155;">
  <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #f8fafc;">
    <tr>
      <td style="padding: 40px 20px;">
        <table role="presentation" style="max-width: 580px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(15, 23, 42, 0.08); border: 1px solid #e2e8f0;">

          <!-- Header -->
          <tr>
            <td style="padding: 32px 32px 24px; text-align: center; background-color: #0f172a;">
              <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 700; letter-spacing: -0.5px;">
                WallX ERP
              </h1>
              <p style="margin: 6px 0 0; color: #c084fc; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">
                ${eyebrow}
              </p>
            </td>
          </tr>

          <!-- Amount Banner -->
          <tr>
            <td style="padding: 32px 32px 20px; text-align: center; background-color: #faf5ff; border-bottom: 1px solid #e9d5ff;">
              <p style="margin: 0; color: #7c3aed; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">
                ${bannerLabel}
              </p>
              <h2 style="margin: 8px 0 0; color: #0f172a; font-size: 32px; font-weight: 800; letter-spacing: -0.5px;">
                ${totalFormatted}
              </h2>
              <p style="margin: 6px 0 0; color: #6d28d9; font-size: 13px; font-weight: 500;">
                Invoice ${invoiceNumber} • ${businessName}
              </p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding: 32px;">
              <p style="margin: 0 0 16px; color: #0f172a; font-size: 15px; line-height: 1.5;">
                Hello <strong>${recipientName}</strong>,
              </p>

              <p style="margin: 0 0 24px; color: #475569; font-size: 14px; line-height: 1.6;">
                ${bodyLead}
              </p>

              <!-- Details Box -->
              <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0; margin-bottom: 24px; overflow: hidden;">
                <tr>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; color: #64748b; font-size: 13px;">Invoice Number</td>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; color: #0f172a; font-size: 13px; font-weight: 600; text-align: right; font-family: monospace;">${invoiceNumber}</td>
                </tr>
                <tr>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; color: #64748b; font-size: 13px;">Billed To</td>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; color: #0f172a; font-size: 13px; font-weight: 600; text-align: right;">${customerName}</td>
                </tr>
                <tr>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; color: #64748b; font-size: 13px;">Issue Date</td>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; color: #0f172a; font-size: 13px; font-weight: 600; text-align: right;">${issueDateFormatted}</td>
                </tr>
                <tr>
                  <td style="padding: 12px 16px; ${data.event === 'paid' ? 'border-bottom: 1px solid #e2e8f0;' : ''} color: #64748b; font-size: 13px;">Due Date</td>
                  <td style="padding: 12px 16px; ${data.event === 'paid' ? 'border-bottom: 1px solid #e2e8f0;' : ''} color: #0f172a; font-size: 13px; font-weight: 600; text-align: right;">${dueDateFormatted}</td>
                </tr>
                ${
                  data.event === 'paid'
                    ? `<tr>
                  <td style="padding: 12px 16px; color: #64748b; font-size: 13px;">Paid Date</td>
                  <td style="padding: 12px 16px; color: #0f172a; font-size: 13px; font-weight: 600; text-align: right;">${paidDateFormatted || dueDateFormatted}${paymentMethodLabel ? ` (${paymentMethodLabel})` : ''}</td>
                </tr>`
                    : ''
                }
              </table>

              ${bankBlock}

              <!-- CTA Button -->
              <table role="presentation" style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="text-align: center; padding: 4px 0 16px;">
                    <a href="${actionLink}"
                       style="display: inline-block; padding: 14px 36px; background-color: #7c3aed; color: #ffffff; text-decoration: none; border-radius: 8px; font-size: 15px; font-weight: 600; box-shadow: 0 4px 14px rgba(124, 58, 237, 0.3);">
                      ${ctaLabel}
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 24px 32px; background-color: #f8fafc; border-top: 1px solid #e2e8f0; text-align: center;">
              <p style="margin: 0 0 6px; color: #64748b; font-size: 12px;">
                WallX ERP • Nigeria SME Business Management & Tax Compliance
              </p>
              <p style="margin: 0; color: #94a3b8; font-size: 11px;">
                Need assistance? Contact <a href="mailto:support@wallxerp.com" style="color: #7c3aed; text-decoration: none; font-weight: 500;">support@wallxerp.com</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

export function generateInvoiceLifecycleText(data: InvoiceLifecycleEmailData): string {
  const title =
    data.event === 'issued'
      ? 'NEW INVOICE ISSUED'
      : data.event === 'paid'
      ? 'INVOICE PAID & SETTLED'
      : 'INVOICE OVERDUE NOTICE';

  return `
WALLX ERP - ${title}
==================================================

Hello ${data.recipientName},

Invoice: ${data.invoiceNumber}
Business: ${data.businessName}
Customer: ${data.customerName}
Amount: ${data.totalFormatted}
Issue Date: ${data.issueDateFormatted}
Due Date: ${data.dueDateFormatted}
${data.event === 'paid' && data.paidDateFormatted ? `Paid Date: ${data.paidDateFormatted}\n` : ''}
View Invoice:
${data.actionLink}

---
WallX ERP • Nigeria SME Business Management & Tax Compliance
support@wallxerp.com
  `.trim();
}
