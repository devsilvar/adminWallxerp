/**
 * Account Deactivated Email Template
 *
 * Sent when an administrator deactivates a user account on WallX ERP.
 * Matches the WallX ERP purple design system of Welcome Aboard & Tax Payment Confirmed.
 */

export interface AccountDeactivatedEmailData {
  userName: string;
  userEmail: string;
  deactivationDate: string;
  reason?: string;
  supportEmail: string;
}

export function generateAccountDeactivatedHtml(data: AccountDeactivatedEmailData): string {
  const displayReason =
    data.reason?.trim() || 'Administrative compliance or account security review';

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Account Deactivated - WallX ERP</title>
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
                Account Status Notice
              </p>
            </td>
          </tr>

          <!-- Status Banner -->
          <tr>
            <td style="padding: 28px 32px 20px; text-align: center; background-color: #faf5ff; border-bottom: 1px solid #e9d5ff;">
              <p style="margin: 0; color: #7c3aed; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">
                Access Temporarily Suspended
              </p>
              <h2 style="margin: 8px 0 0; color: #0f172a; font-size: 24px; font-weight: 800; letter-spacing: -0.5px;">
                Account Deactivated
              </h2>
              <p style="margin: 6px 0 0; color: #6d28d9; font-size: 13px; font-weight: 500;">
                ${data.userEmail}
              </p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding: 32px;">
              <p style="margin: 0 0 16px; color: #0f172a; font-size: 15px; line-height: 1.5;">
                Hello <strong>${data.userName}</strong>,
              </p>

              <p style="margin: 0 0 24px; color: #475569; font-size: 14px; line-height: 1.6;">
                Your <strong>WallX ERP</strong> account (<strong>${data.userEmail}</strong>) has been deactivated by an administrator. While your account is inactive, sign-in and automated settlement operations are paused. Your historical financial records and tax reports remain safely preserved.
              </p>

              <!-- Details Box -->
              <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0; margin-bottom: 24px; overflow: hidden;">
                <tr>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; color: #64748b; font-size: 13px;">Account</td>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; color: #0f172a; font-size: 13px; font-weight: 600; text-align: right;">${data.userEmail}</td>
                </tr>
                <tr>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; color: #64748b; font-size: 13px;">Effective Date</td>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; color: #0f172a; font-size: 13px; font-weight: 600; text-align: right;">${data.deactivationDate}</td>
                </tr>
                <tr>
                  <td style="padding: 12px 16px; color: #64748b; font-size: 13px;">Reason</td>
                  <td style="padding: 12px 16px; color: #0f172a; font-size: 13px; font-weight: 600; text-align: right;">${displayReason}</td>
                </tr>
              </table>

              <!-- CTA Button -->
              <table role="presentation" style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="text-align: center; padding: 4px 0 16px;">
                    <a href="mailto:${data.supportEmail}?subject=Account%20Reactivation%20Request%20(${encodeURIComponent(data.userEmail)})"
                       style="display: inline-block; padding: 14px 36px; background-color: #7c3aed; color: #ffffff; text-decoration: none; border-radius: 8px; font-size: 15px; font-weight: 600; box-shadow: 0 4px 14px rgba(124, 58, 237, 0.3);">
                      Contact Compliance Support &rarr;
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
                Need assistance? Contact <a href="mailto:${data.supportEmail}" style="color: #7c3aed; text-decoration: none; font-weight: 500;">${data.supportEmail}</a>
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

export function generateAccountDeactivatedText(data: AccountDeactivatedEmailData): string {
  const displayReason =
    data.reason?.trim() || 'Administrative compliance or account security review';
  return `
WALLX ERP - ACCOUNT DEACTIVATED
==================================================

Hello ${data.userName},

Your WallX ERP account (${data.userEmail}) has been deactivated by an administrator.

DETAILS:
- Account: ${data.userEmail}
- Effective Date: ${data.deactivationDate}
- Reason: ${displayReason}

If you believe this was done in error or would like to request reactivation, please contact our support team at ${data.supportEmail}.

---
WallX ERP • Nigeria SME Business Management & Tax Compliance
  `.trim();
}
