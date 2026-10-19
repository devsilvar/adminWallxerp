/**
 * Credit Alert Email Template
 *
 * Sent when an incoming bank transfer (DVA) credits the merchant's wallet or
 * when a customer credit/debtor obligation reaches its due date for the business owner.
 * Matches the WallX ERP purple design system of Welcome Aboard & Tax Payment Confirmed.
 */

export interface CreditAlertEmailData {
  ownerName: string;
  businessName: string;
  amountFormatted: string;
  payerName: string;
  accountNumber: string;
  reference: string;
  transactionDate: string;
  alertType: 'dva_inflow' | 'debtor_due_owner';
  dueDateFormatted?: string;
  dashboardLink: string;
}

export function generateCreditAlertHtml(data: CreditAlertEmailData): string {
  const isInflow = data.alertType === 'dva_inflow';
  const eyebrow = isInflow ? 'Wallet Credit Alert' : 'Debtor Due Date Alert';
  const bannerLabel = isInflow ? 'Incoming Bank Transfer Received' : 'Customer Credit Payment Due';
  const subCaption = isInflow
    ? `From: ${data.payerName}`
    : `Debtor: ${data.payerName} • Due: ${data.dueDateFormatted || data.transactionDate}`;
  const bodyCopy = isInflow
    ? `A bank transfer of <strong>${data.amountFormatted}</strong> has been received into the Dedicated Virtual Account of <strong>${data.businessName}</strong> and credited to your wallet.`
    : `A customer credit obligation of <strong>${data.amountFormatted}</strong> owed by <strong>${data.payerName}</strong> to <strong>${data.businessName}</strong> has reached its due date.`;
  const ctaLabel = isInflow ? 'View Sales & Wallet \u2192' : 'Open Debtors Book \u2192';

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${eyebrow} - WallX ERP</title>
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
                ${data.amountFormatted}
              </h2>
              <p style="margin: 6px 0 0; color: #6d28d9; font-size: 13px; font-weight: 500;">
                ${subCaption}
              </p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding: 32px;">
              <p style="margin: 0 0 16px; color: #0f172a; font-size: 15px; line-height: 1.5;">
                Hello <strong>${data.ownerName}</strong>,
              </p>

              <p style="margin: 0 0 24px; color: #475569; font-size: 14px; line-height: 1.6;">
                ${bodyCopy}
              </p>

              <!-- Details Box -->
              <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0; margin-bottom: 24px; overflow: hidden;">
                <tr>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; color: #64748b; font-size: 13px;">Amount</td>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; color: #0f172a; font-size: 13px; font-weight: 600; text-align: right;">${data.amountFormatted}</td>
                </tr>
                <tr>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; color: #64748b; font-size: 13px;">${isInflow ? 'Sender / Payer' : 'Customer / Debtor'}</td>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; color: #0f172a; font-size: 13px; font-weight: 600; text-align: right;">${data.payerName}</td>
                </tr>
                <tr>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; color: #64748b; font-size: 13px;">${isInflow ? 'Virtual Account' : 'Collection Account'}</td>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; color: #0f172a; font-size: 13px; font-weight: 600; text-align: right; font-family: monospace;">${data.accountNumber}</td>
                </tr>
                <tr>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; color: #64748b; font-size: 13px;">Reference</td>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; color: #0f172a; font-size: 13px; font-weight: 600; text-align: right; font-family: monospace;">${data.reference}</td>
                </tr>
                <tr>
                  <td style="padding: 12px 16px; color: #64748b; font-size: 13px;">${isInflow ? 'Date Received' : 'Due Date'}</td>
                  <td style="padding: 12px 16px; color: #0f172a; font-size: 13px; font-weight: 600; text-align: right;">${data.dueDateFormatted || data.transactionDate}</td>
                </tr>
              </table>

              <!-- CTA Button -->
              <table role="presentation" style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="text-align: center; padding: 4px 0 16px;">
                    <a href="${data.dashboardLink}"
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

export function generateCreditAlertText(data: CreditAlertEmailData): string {
  const isInflow = data.alertType === 'dva_inflow';
  const title = isInflow ? 'WALLET CREDIT ALERT' : 'DEBTOR DUE DATE ALERT';
  return `
WALLX ERP - ${title}
==================================================

Hello ${data.ownerName},

${
  isInflow
    ? `A bank transfer of ${data.amountFormatted} has been received into the Dedicated Virtual Account of ${data.businessName}.`
    : `A customer credit obligation of ${data.amountFormatted} owed by ${data.payerName} to ${data.businessName} has reached its due date.`
}

DETAILS:
- Amount: ${data.amountFormatted}
- ${isInflow ? 'Payer' : 'Debtor'}: ${data.payerName}
- Account: ${data.accountNumber}
- Reference: ${data.reference}
- Date: ${data.dueDateFormatted || data.transactionDate}

View on your dashboard:
${data.dashboardLink}

---
WallX ERP • Nigeria SME Business Management & Tax Compliance
support@wallxerp.com
  `.trim();
}
