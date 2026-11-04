/**
 * Tax Due Date Reminder Email Template
 *
 * Sent on the business's configured taxReminderDay when monthly tax is approaching due date,
 * unfiled, unfinalized, or awaiting payment.
 * Matches the WallX ERP purple design system of Welcome Aboard & Tax Payment Confirmed.
 */

export interface TaxDueDateEmailData {
  ownerName: string;
  businessName: string;
  taxMonthLabel: string;
  statusHeadline: string;
  estimatedTaxFormatted?: string;
  reminderMessage: string;
  taxDashboardLink: string;
}

export function generateTaxDueDateHtml(data: TaxDueDateEmailData): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Tax Filing Reminder (${data.taxMonthLabel}) - WallX ERP</title>
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
                Monthly Tax Compliance Reminder
              </p>
            </td>
          </tr>

          <!-- Banner -->
          <tr>
            <td style="padding: 32px 32px 20px; text-align: center; background-color: #faf5ff; border-bottom: 1px solid #e9d5ff;">
              <p style="margin: 0; color: #7c3aed; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">
                ${data.statusHeadline}
              </p>
              <h2 style="margin: 8px 0 0; color: #0f172a; font-size: 28px; font-weight: 800; letter-spacing: -0.5px;">
                ${data.estimatedTaxFormatted || data.taxMonthLabel}
              </h2>
              <p style="margin: 6px 0 0; color: #6d28d9; font-size: 13px; font-weight: 500;">
                Period: ${data.taxMonthLabel} • ${data.businessName}
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
                ${data.reminderMessage}
              </p>

              <!-- Checklist Card -->
              <div style="background-color: #faf5ff; border: 1px solid #f3e8ff; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
                <p style="margin: 0 0 10px; color: #581c87; font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">
                  Monthly Filing Steps
                </p>
                <ol style="margin: 0; padding-left: 20px; color: #4c1d95; font-size: 14px; line-height: 1.8;">
                  <li>Verify all monthly sales and deductible operating expenses are logged</li>
                  <li>Click <strong>Calculate Tax</strong> for <strong>${data.taxMonthLabel}</strong></li>
                  <li>Review and <strong>Finalize</strong> your assessment report</li>
                  <li>Complete your statutory tax remittance to lock the period</li>
                </ol>
              </div>

              <!-- CTA Button -->
              <table role="presentation" style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="text-align: center; padding: 4px 0 16px;">
                    <a href="${data.taxDashboardLink}"
                       style="display: inline-block; padding: 14px 36px; background-color: #7c3aed; color: #ffffff; text-decoration: none; border-radius: 8px; font-size: 15px; font-weight: 600; box-shadow: 0 4px 14px rgba(124, 58, 237, 0.3);">
                      Open Tax Reports &rarr;
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

export function generateTaxDueDateText(data: TaxDueDateEmailData): string {
  return `
WALLX ERP - MONTHLY TAX COMPLIANCE REMINDER
==================================================

Hello ${data.ownerName},

${data.reminderMessage}

Business: ${data.businessName}
Period: ${data.taxMonthLabel}
Status: ${data.statusHeadline}
${data.estimatedTaxFormatted ? `Estimated Tax: ${data.estimatedTaxFormatted}\n` : ''}
Open Tax Reports:
${data.taxDashboardLink}

---
WallX ERP • Nigeria SME Business Management & Tax Compliance
support@wallxerp.com
  `.trim();
}
