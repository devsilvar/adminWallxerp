/**
 * Debtor Credit Purchase Notification Email Template — WallX ERP
 *
 * Dispatched to customers when an SME records a new credit sale on their account.
 * Follows the WallX ERP brand design system (Inter, purple gradient, high readability).
 */

import { escapeHtml } from '../escape';

export interface DebtorNotificationEmailData {
  debtorName: string;
  businessName: string;
  businessPhone?: string | null;
  amountFormatted: string;
  issueDateFormatted: string;
  dueDateFormatted: string;
  description: string;
  creditNumber: string;
  bankName?: string | null;
  accountNumber?: string | null;
  accountName?: string | null;
}

export function generateDebtorNotificationHtml(data: DebtorNotificationEmailData): string {
  const hasBankDetails = Boolean(data.accountNumber && data.bankName);

  const debtorName = escapeHtml(data.debtorName);
  const businessName = escapeHtml(data.businessName);
  const businessPhone = data.businessPhone ? escapeHtml(data.businessPhone) : null;
  const description = escapeHtml(data.description);
  const creditNumber = escapeHtml(data.creditNumber);
  const bankName = data.bankName ? escapeHtml(data.bankName) : null;
  const accountNumber = data.accountNumber ? escapeHtml(data.accountNumber) : null;
  const accountName = data.accountName ? escapeHtml(data.accountName) : null;
  const amountFormatted = escapeHtml(data.amountFormatted);
  const issueDateFormatted = escapeHtml(data.issueDateFormatted);
  const dueDateFormatted = escapeHtml(data.dueDateFormatted);

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Credit Purchase Confirmation - ${businessName}</title>
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
                Credit Purchase Confirmed
              </p>
            </td>
          </tr>

          <!-- Amount Banner -->
          <tr>
            <td style="padding: 32px 32px 20px; text-align: center; background-color: #faf5ff; border-bottom: 1px solid #e9d5ff;">
              <p style="margin: 0; color: #7c3aed; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">
                Credit Obligation Recorded
              </p>
              <h2 style="margin: 8px 0 0; color: #0f172a; font-size: 32px; font-weight: 800; letter-spacing: -0.5px;">
                ${amountFormatted}
              </h2>
              <p style="margin: 6px 0 0; color: #6d28d9; font-size: 13px; font-weight: 500;">
                Payment Due: ${dueDateFormatted}
              </p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding: 32px;">
              <p style="margin: 0 0 16px; color: #0f172a; font-size: 15px; line-height: 1.5;">
                Dear <strong>${debtorName}</strong>,
              </p>
              
              <p style="margin: 0 0 20px; color: #475569; font-size: 14px; line-height: 1.6;">
                This confirms that <strong>${businessName}</strong> has recorded a credit purchase on your account. The transaction summary is detailed below:
              </p>

              <!-- Transaction Summary Card -->
              <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0; margin-bottom: 24px; overflow: hidden;">
                <tr>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; color: #64748b; font-size: 13px;">Reference</td>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; color: #0f172a; font-size: 13px; font-weight: 600; text-align: right; font-family: monospace;">${creditNumber}</td>
                </tr>
                <tr>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; color: #64748b; font-size: 13px;">Description</td>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; color: #0f172a; font-size: 13px; font-weight: 500; text-align: right;">${description}</td>
                </tr>
                <tr>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; color: #64748b; font-size: 13px;">Issue Date</td>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; color: #0f172a; font-size: 13px; text-align: right;">${issueDateFormatted}</td>
                </tr>
                <tr>
                  <td style="padding: 12px 16px; color: #64748b; font-size: 13px;">Due Date</td>
                  <td style="padding: 12px 16px; color: #7c3aed; font-size: 13px; font-weight: 700; text-align: right;">${dueDateFormatted}</td>
                </tr>
              </table>

              ${
                hasBankDetails
                  ? `
              <!-- Bank Settlement Details -->
              <p style="margin: 0 0 10px; color: #0f172a; font-size: 13px; font-weight: 600;">
                Direct Settlement Bank Details:
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

              <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 6px; padding: 14px 18px; margin-bottom: 24px;">
                <p style="margin: 0; color: #166534; font-size: 13px; line-height: 1.5;">
                  Please ensure full settlement is completed on or before <strong>${dueDateFormatted}</strong>.
                  ${businessPhone ? `Contact <strong>${businessPhone}</strong> for questions or confirmation.` : ''}
                </p>
              </div>

              <p style="margin: 0; color: #64748b; font-size: 14px; line-height: 1.6;">
                Thank you for your business.<br>
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

export function generateDebtorNotificationText(data: DebtorNotificationEmailData): string {
  const bankBlock = data.accountNumber && data.bankName
    ? `
SETTLEMENT BANK DETAILS:
- Bank: ${data.bankName}
- Account Number: ${data.accountNumber}
- Account Name: ${data.accountName || data.businessName}
`
    : '';

  return `
CREDIT PURCHASE CONFIRMED - ${data.businessName.toUpperCase()}
==================================================

Dear ${data.debtorName},

This confirms that ${data.businessName} has recorded a credit purchase on your account.

Reference: ${data.creditNumber}
Description: ${data.description}
Issue Date: ${data.issueDateFormatted}
Amount Due: ${data.amountFormatted}
Payment Due Date: ${data.dueDateFormatted}
${bankBlock}
Please ensure payment is settled on or before ${data.dueDateFormatted}.

Thank you,
${data.businessName}

---
Powered by WallX ERP
  `.trim();
}
