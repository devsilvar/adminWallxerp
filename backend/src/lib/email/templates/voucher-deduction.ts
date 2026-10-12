/**
 * Voucher Deduction Receipt Email Template — WallX ERP
 *
 * Dispatched to customers immediately after a voucher balance is debited for a purchase.
 * Voucher CODE has been retired — identification is by customer name + PIN.
 */

import { escapeHtml } from '../escape';

export interface VoucherDeductionEmailData {
  customerName: string;
  businessName: string;
  cardCode?: string; // deprecated — retired, kept optional for backward compat only; never rendered
  amountDebitedFormatted: string;
  newBalanceFormatted: string;
  receiptNumber?: string | null;
  storeLocation?: string | null;
  transactionDateFormatted: string;
  businessPhone?: string | null;
}

export function generateVoucherDeductionHtml(data: VoucherDeductionEmailData): string {
  const customerName = escapeHtml(data.customerName);
  const businessName = escapeHtml(data.businessName);
  const amountDebitedFormatted = escapeHtml(data.amountDebitedFormatted);
  const newBalanceFormatted = escapeHtml(data.newBalanceFormatted);
  const receiptNumber = data.receiptNumber ? escapeHtml(data.receiptNumber) : null;
  const storeLocation = data.storeLocation ? escapeHtml(data.storeLocation) : null;
  const transactionDateFormatted = escapeHtml(data.transactionDateFormatted);
  const businessPhone = data.businessPhone ? escapeHtml(data.businessPhone) : null;

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Voucher Payment Receipt - ${businessName}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f8fafc; color: #334155;">
  <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #f8fafc;">
    <tr>
      <td style="padding: 40px 20px;">
        <table role="presentation" style="max-width: 580px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(15, 23, 42, 0.08); border: 1px solid #e2e8f0;">
          <tr>
            <td style="padding: 32px 32px 24px; text-align: center; background-color: #0f172a;">
              <h1 style="margin: 0; color: #ffffff; font-size: 22px; font-weight: 700; letter-spacing: -0.5px;">${businessName}</h1>
              <p style="margin: 6px 0 0; color: #c084fc; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Voucher Payment Receipt</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 32px 32px 20px; text-align: center; background-color: #fef2f2; border-bottom: 1px solid #fecaca;">
              <p style="margin: 0; color: #dc2626; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Amount Deducted</p>
              <h2 style="margin: 8px 0 0; color: #dc2626; font-size: 36px; font-weight: 800; letter-spacing: -0.5px;">–${amountDebitedFormatted}</h2>
              <p style="margin: 6px 0 0; color: #b91c1c; font-size: 13px; font-weight: 500;">Remaining Balance: <strong style="color: #0f172a;">${newBalanceFormatted}</strong></p>
            </td>
          </tr>
          <tr>
            <td style="padding: 32px;">
              <p style="margin: 0 0 16px; color: #0f172a; font-size: 15px; line-height: 1.5;">Hello <strong>${customerName}</strong>,</p>
              <p style="margin: 0 0 24px; color: #475569; font-size: 14px; line-height: 1.6;">This confirms that your voucher at <strong>${businessName}</strong> was used for a purchase. Here are your transaction details:</p>
              <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0; margin-bottom: 24px; overflow: hidden;">
                ${storeLocation ? `<tr><td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; color: #64748b; font-size: 13px;">Store Location</td><td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; color: #0f172a; font-size: 13px; font-weight: 600; text-align: right;">${storeLocation}</td></tr>` : ''}
                <tr><td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; color: #64748b; font-size: 13px;">Customer Name</td><td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; color: #0f172a; font-size: 14px; font-weight: 700; text-align: right;">${customerName}</td></tr>
                <tr><td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; color: #64748b; font-size: 13px;">Amount Paid</td><td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; color: #dc2626; font-size: 16px; font-weight: 700; text-align: right;">${amountDebitedFormatted}</td></tr>
                <tr><td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; color: #64748b; font-size: 13px;">New Balance</td><td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; color: #16a34a; font-size: 14px; font-weight: 700; text-align: right;">${newBalanceFormatted}</td></tr>
                <tr><td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; color: #64748b; font-size: 13px;">Transaction Date</td><td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; color: #0f172a; font-size: 13px; text-align: right;">${transactionDateFormatted}</td></tr>
                ${receiptNumber ? `<tr><td style="padding: 12px 16px; color: #64748b; font-size: 13px;">Receipt Number</td><td style="padding: 12px 16px; color: #0f172a; font-size: 13px; font-weight: 600; text-align: right; font-family: monospace;">${receiptNumber}</td></tr>` : ''}
              </table>
              <div style="background-color: #fef3c7; border: 1px solid #fbbf24; border-radius: 6px; padding: 14px 18px; margin-bottom: 24px;">
                <p style="margin: 0; color: #92400e; font-size: 13px; line-height: 1.5;"><strong>Security Notice:</strong> If you did not make this purchase, please contact ${businessName} immediately${businessPhone ? ` at <strong>${businessPhone}</strong>` : ''}.</p>
              </div>
              <p style="margin: 0; color: #64748b; font-size: 14px; line-height: 1.6;">Thank you for shopping at <strong style="color: #0f172a;">${businessName}</strong>.</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 24px 32px; background-color: #f8fafc; border-top: 1px solid #e2e8f0; text-align: center;">
              <p style="margin: 0 0 6px; color: #64748b; font-size: 12px;">Automated transaction receipt from WallX ERP on behalf of <strong>${businessName}</strong></p>
              <p style="margin: 0; color: #94a3b8; font-size: 11px;">Keep this email for your records. Do not reply to this automated message.</p>
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

export function generateVoucherDeductionText(data: VoucherDeductionEmailData): string {
  return `
VOUCHER PAYMENT RECEIPT - ${data.businessName.toUpperCase()}
==================================================

Hello ${data.customerName},

This confirms your voucher was used for a purchase at ${data.businessName}.

TRANSACTION DETAILS:
--------------------------------------------------
${data.storeLocation ? `- Store Location: ${data.storeLocation}\n` : ''}- Customer: ${data.customerName}
- Amount Paid: ${data.amountDebitedFormatted}
- New Balance: ${data.newBalanceFormatted}
- Transaction Date: ${data.transactionDateFormatted}
${data.receiptNumber ? `- Receipt Number: ${data.receiptNumber}\n` : ''}
SECURITY NOTICE:
If you did not make this purchase, please contact ${data.businessName} immediately${data.businessPhone ? ` at ${data.businessPhone}` : ''}.

Thank you,
${data.businessName}

---
Powered by WallX ERP • Automated Receipt
  `.trim();
}
