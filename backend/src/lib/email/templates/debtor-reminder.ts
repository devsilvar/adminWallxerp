/**
 * Debtor Payment Reminder Email Template
 *
 * Dispatched to customers who have an outstanding debt/credit balance approaching or past due.
 * Matches the design language of Welcome Aboard & Tax Payment Confirmed templates.
 */

import { escapeHtml } from '../escape';

export interface DebtorReminderEmailData {
  customerName: string;
  businessName: string;
  amountFormatted: string;
  dueDateFormatted: string;
  bankName?: string | null;
  accountNumber?: string | null;
  accountName?: string | null;
}

export function generateDebtorReminderHtml(data: DebtorReminderEmailData): string {
  const hasBankDetails = Boolean(data.accountNumber && data.bankName);

  const customerName = escapeHtml(data.customerName);
  const businessName = escapeHtml(data.businessName);
  const amountFormatted = escapeHtml(data.amountFormatted);
  const dueDateFormatted = escapeHtml(data.dueDateFormatted);
  const bankName = data.bankName ? escapeHtml(data.bankName) : null;
  const accountNumber = data.accountNumber ? escapeHtml(data.accountNumber) : null;
  const accountName = data.accountName ? escapeHtml(data.accountName) : null;

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Payment Reminder - ${businessName}</title>
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
                ${businessName}
              </h1>
              <p style="margin: 6px 0 0; color: #c084fc; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">
                Payment Reminder
              </p>
            </td>
          </tr>

          <!-- Amount Due Banner -->
          <tr>
            <td style="padding: 32px 32px 20px; text-align: center; background-color: #faf5ff; border-bottom: 1px solid #e9d5ff;">
              <p style="margin: 0; color: #7c3aed; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">
                Outstanding Balance Due
              </p>
              <h2 style="margin: 8px 0 0; color: #0f172a; font-size: 32px; font-weight: 800; letter-spacing: -0.5px;">
                ${amountFormatted}
              </h2>
              <p style="margin: 6px 0 0; color: #6d28d9; font-size: 13px; font-weight: 500;">
                Due Date: ${dueDateFormatted}
              </p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding: 32px;">
              <p style="margin: 0 0 16px; color: #0f172a; font-size: 15px; line-height: 1.5;">
                Dear <strong>${customerName}</strong>,
              </p>
              
              <p style="margin: 0 0 24px; color: #475569; font-size: 14px; line-height: 1.6;">
                This is a friendly reminder from <strong>${businessName}</strong> regarding your outstanding obligation of <strong>${amountFormatted}</strong>, which was due on <strong>${dueDateFormatted}</strong>.
              </p>

              ${
                hasBankDetails
                  ? `
              <!-- Bank Settlement Details Box -->
              <p style="margin: 0 0 10px; color: #0f172a; font-size: 13px; font-weight: 600;">
                Settlement Bank Transfer Details:
              </p>
              <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0; margin-bottom: 24px; overflow: hidden;">
                <tr>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; color: #64748b; font-size: 13px;">Bank</td>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; color: #0f172a; font-size: 13px; font-weight: 600; text-align: right;">${bankName}</td>
                </tr>
                <tr>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; color: #64748b; font-size: 13px;">Account Number</td>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; color: #7c3aed; font-size: 14px; font-weight: 700; text-align: right; font-family: monospace;">${accountNumber}</td>
                </tr>
                ${
                  accountName
                    ? `
                <tr>
                  <td style="padding: 12px 16px; color: #64748b; font-size: 13px;">Account Name</td>
                  <td style="padding: 12px 16px; color: #0f172a; font-size: 13px; font-weight: 600; text-align: right;">${accountName}</td>
                </tr>
                `
                    : ''
                }
              </table>
              `
                  : ''
              }

              <div style="background-color: #faf5ff; border: 1px solid #f3e8ff; border-radius: 6px; padding: 14px 18px; margin-bottom: 24px;">
                <p style="margin: 0; color: #581c87; font-size: 13px; line-height: 1.5;">
                  If you have already settled this payment, please disregard this notice or reply with your payment receipt so your account can be reconciled.
                </p>
              </div>

              <p style="margin: 0; color: #64748b; font-size: 14px; line-height: 1.6;">
                Thank you for your prompt attention.<br>
                <strong style="color: #0f172a;">${businessName}</strong>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 24px 32px; background-color: #f8fafc; border-top: 1px solid #e2e8f0; text-align: center;">
              <p style="margin: 0 0 6px; color: #64748b; font-size: 12px;">
                Powered by WallX ERP • Automated Business Invoicing & Settlement
              </p>
              <p style="margin: 0; color: #94a3b8; font-size: 11px;">
                Direct settlement inquiries to <strong style="color: #64748b;">${businessName}</strong>
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

export function generateDebtorReminderText(data: DebtorReminderEmailData): string {
  const bankBlock = data.accountNumber && data.bankName
    ? `
BANK TRANSFER DETAILS:
- Bank: ${data.bankName}
- Account Number: ${data.accountNumber}
- Account Name: ${data.accountName || data.businessName}
`
    : '';

  return `
PAYMENT REMINDER - ${data.businessName.toUpperCase()}
==================================================

Dear ${data.customerName},

This is a reminder regarding your outstanding balance of ${data.amountFormatted} with ${data.businessName}, which was due on ${data.dueDateFormatted}.
${bankBlock}
If you have already made this payment, please disregard this notice.

Thank you,
${data.businessName}

---
Powered by WallX ERP
  `.trim();
}
