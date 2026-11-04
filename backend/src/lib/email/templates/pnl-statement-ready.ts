/**
 * End-of-Month Profit & Loss (P&L) Statement Ready Email Template
 *
 * Sent on the user's configured taxReminderDay when their monthly Profit & Loss
 * statement is ready for download (and attached as an official PDF).
 * Matches the WallX ERP purple design system of Welcome Aboard & Tax Payment Confirmed.
 */

export interface PnlStatementReadyEmailData {
  ownerName: string;
  businessName: string;
  monthLabel: string;
  totalSalesFormatted: string;
  totalExpensesFormatted: string;
  grossProfitFormatted: string;
  taxPayableFormatted: string;
  profitMarginFormatted: string;
  downloadLink: string;
}

export function generatePnlStatementReadyHtml(data: PnlStatementReadyEmailData): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Profit &amp; Loss Statement Ready (${data.monthLabel}) - WallX ERP</title>
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
                Profit &amp; Loss Statement Ready
              </p>
            </td>
          </tr>

          <!-- Gross Profit Banner -->
          <tr>
            <td style="padding: 32px 32px 20px; text-align: center; background-color: #faf5ff; border-bottom: 1px solid #e9d5ff;">
              <p style="margin: 0; color: #7c3aed; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">
                Gross Profit (${data.monthLabel})
              </p>
              <h2 style="margin: 8px 0 0; color: #0f172a; font-size: 32px; font-weight: 800; letter-spacing: -0.5px;">
                ${data.grossProfitFormatted}
              </h2>
              <p style="margin: 6px 0 0; color: #6d28d9; font-size: 13px; font-weight: 500;">
                Profit Margin: ${data.profitMarginFormatted} • ${data.businessName}
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
                Your monthly <strong>Profit &amp; Loss (P&amp;L) Statement</strong> for <strong>${data.businessName}</strong> covering <strong>${data.monthLabel}</strong> is ready. You can download it directly using the button below, or open the attached PDF copy.
              </p>

              <!-- P&L Summary Box -->
              <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0; margin-bottom: 24px; overflow: hidden;">
                <tr>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; color: #64748b; font-size: 13px;">Total Revenue (Sales)</td>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; color: #0f172a; font-size: 13px; font-weight: 600; text-align: right;">${data.totalSalesFormatted}</td>
                </tr>
                <tr>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; color: #64748b; font-size: 13px;">Total Operating Expenses</td>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; color: #0f172a; font-size: 13px; font-weight: 600; text-align: right;">${data.totalExpensesFormatted}</td>
                </tr>
                <tr>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; color: #64748b; font-size: 13px;">Gross Profit</td>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; color: #7c3aed; font-size: 13px; font-weight: 700; text-align: right;">${data.grossProfitFormatted}</td>
                </tr>
                <tr>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; color: #64748b; font-size: 13px;">Net Profit Margin</td>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; color: #0f172a; font-size: 13px; font-weight: 600; text-align: right;">${data.profitMarginFormatted}</td>
                </tr>
                <tr>
                  <td style="padding: 12px 16px; color: #64748b; font-size: 13px;">Estimated Tax</td>
                  <td style="padding: 12px 16px; color: #0f172a; font-size: 13px; font-weight: 700; text-align: right;">${data.taxPayableFormatted}</td>
                </tr>
              </table>

              <!-- CTA Button -->
              <table role="presentation" style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="text-align: center; padding: 4px 0 16px;">
                    <a href="${data.downloadLink}"
                       style="display: inline-block; padding: 14px 36px; background-color: #7c3aed; color: #ffffff; text-decoration: none; border-radius: 8px; font-size: 15px; font-weight: 600; box-shadow: 0 4px 14px rgba(124, 58, 237, 0.3);">
                      Download P&amp;L Statement &rarr;
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

export function generatePnlStatementReadyText(data: PnlStatementReadyEmailData): string {
  return `
WALLX ERP - PROFIT & LOSS STATEMENT READY (${data.monthLabel})
==================================================

Hello ${data.ownerName},

Your monthly Profit & Loss Statement for ${data.businessName} covering ${data.monthLabel} is ready.

P&L SUMMARY:
- Total Revenue (Sales): ${data.totalSalesFormatted}
- Total Operating Expenses: ${data.totalExpensesFormatted}
- Gross Profit: ${data.grossProfitFormatted}
- Profit Margin: ${data.profitMarginFormatted}
- Estimated Tax: ${data.taxPayableFormatted}

Download your P&L Statement:
${data.downloadLink}

---
WallX ERP • Nigeria SME Business Management & Tax Compliance
support@wallxerp.com
  `.trim();
}
