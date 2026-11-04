/**
 * Welcome Email Template
 *
 * Sent once, right after a user completes registration on WallX ERP.
 */

export interface WelcomeEmailData {
  userEmail: string;
  dashboardLink: string;
}

export function generateWelcomeHtml(data: WelcomeEmailData): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to WallX ERP</title>
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
                Welcome Aboard
              </p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding: 40px 32px;">
              <p style="margin: 0 0 20px; color: #0f172a; font-size: 16px; font-weight: 600; line-height: 1.5;">
                Hi there,
              </p>

              <p style="margin: 0 0 20px; color: #334155; font-size: 15px; line-height: 1.6;">
                Your <strong>WallX ERP</strong> account (<strong>${data.userEmail}</strong>) is ready. You now have full access to intelligent invoicing, automated bank transfer reconciliation, sales and expense tracking, and real-time NRS tax compliance.
              </p>

              <!-- CTA Button -->
              <table role="presentation" style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="text-align: center; padding: 12px 0 28px;">
                    <a href="${data.dashboardLink}"
                       style="display: inline-block; padding: 14px 36px; background-color: #7c3aed; color: #ffffff; text-decoration: none; border-radius: 8px; font-size: 15px; font-weight: 600; box-shadow: 0 4px 14px rgba(124, 58, 237, 0.3);">
                      Go to Dashboard &rarr;
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Quick Start Card -->
              <div style="background-color: #faf5ff; border: 1px solid #f3e8ff; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
                <p style="margin: 0 0 10px; color: #581c87; font-size: 14px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">
                  Quick Start Checklist
                </p>
                <ul style="margin: 0; padding-left: 20px; color: #4c1d95; font-size: 14px; line-height: 1.8;">
                  <li>Complete your business profile with your CAC and Tax ID (TIN)</li>
                  <li>Activate your Dedicated Virtual Account (DVA) for auto-captured payments</li>
                  <li>Issue professional invoices or record your sales and expenses</li>
                  <li>Let WallX ERP automate your monthly tax compliance and filing</li>
                </ul>
              </div>

              <p style="margin: 0 0 10px; color: #64748b; font-size: 14px; line-height: 1.6;">
                Best regards,<br>
                <strong style="color: #0f172a;">The WallX ERP Team</strong>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 24px 32px; background-color: #f8fafc; border-top: 1px solid #e2e8f0; text-align: center;">
              <p style="margin: 0 0 6px; color: #64748b; font-size: 12px;">
                WallX ERP • Nigeria SME Business Management & Tax Compliance
              </p>
              <p style="margin: 0; color: #94a3b8; font-size: 11px;">
                This is an automated message. Need help? Contact <a href="mailto:support@wallxerp.com" style="color: #7c3aed; text-decoration: none; font-weight: 500;">support@wallxerp.com</a>
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

export function generateWelcomeText(data: WelcomeEmailData): string {
  return `
Welcome to WallX ERP
==================================================

Hi there,

Your WallX ERP account (${data.userEmail}) is ready. You now have full access to intelligent invoicing, automated bank transfer reconciliation, sales and expense tracking, and real-time NRS tax compliance.

Go to your dashboard:
${data.dashboardLink}

QUICK START CHECKLIST:
- Complete your business profile with your CAC and Tax ID (TIN)
- Activate your Dedicated Virtual Account (DVA) for auto-captured payments
- Issue professional invoices or record your sales and expenses
- Let WallX ERP automate your monthly tax compliance and filing

Best regards,
The WallX ERP Team

---
WallX ERP • Nigeria SME Business Management & Tax Compliance
Need help? Contact support@wallxerp.com
  `.trim();
}

