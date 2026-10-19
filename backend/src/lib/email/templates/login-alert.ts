/**
 * Login Security Alert Email Template
 *
 * Sent asynchronously when a user signs in to their WallX ERP account.
 * Matches the WallX ERP purple design system of Welcome Aboard & Tax Payment Confirmed.
 */

export interface LoginAlertEmailData {
  userName: string;
  userEmail: string;
  loginTime: string;
  ipAddress: string;
  deviceInfo: string;
  securitySettingsLink: string;
}

export function generateLoginAlertHtml(data: LoginAlertEmailData): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>New Sign-In Detected - WallX ERP</title>
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
                Security Sign-In Alert
              </p>
            </td>
          </tr>

          <!-- Banner -->
          <tr>
            <td style="padding: 28px 32px 20px; text-align: center; background-color: #faf5ff; border-bottom: 1px solid #e9d5ff;">
              <p style="margin: 0; color: #7c3aed; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">
                Account Access Notification
              </p>
              <h2 style="margin: 8px 0 0; color: #0f172a; font-size: 24px; font-weight: 800; letter-spacing: -0.5px;">
                New Login to Your Account
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
                We noticed a new sign-in to your <strong>WallX ERP</strong> account. If this was you, no action is needed.
              </p>

              <!-- Details Box -->
              <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0; margin-bottom: 24px; overflow: hidden;">
                <tr>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; color: #64748b; font-size: 13px;">Account</td>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; color: #0f172a; font-size: 13px; font-weight: 600; text-align: right;">${data.userEmail}</td>
                </tr>
                <tr>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; color: #64748b; font-size: 13px;">Date &amp; Time</td>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; color: #0f172a; font-size: 13px; font-weight: 600; text-align: right;">${data.loginTime}</td>
                </tr>
                <tr>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; color: #64748b; font-size: 13px;">IP Address</td>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; color: #0f172a; font-size: 13px; font-weight: 600; text-align: right; font-family: monospace;">${data.ipAddress}</td>
                </tr>
                <tr>
                  <td style="padding: 12px 16px; color: #64748b; font-size: 13px;">Device / Browser</td>
                  <td style="padding: 12px 16px; color: #0f172a; font-size: 13px; font-weight: 600; text-align: right;">${data.deviceInfo}</td>
                </tr>
              </table>

              <div style="background-color: #faf5ff; border: 1px solid #f3e8ff; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
                <p style="margin: 0; color: #4c1d95; font-size: 13px; line-height: 1.5;">
                  <strong>Wasn't you?</strong> Please change your password and transaction PIN immediately using the button below, or contact <a href="mailto:support@wallxerp.com" style="color: #7c3aed; font-weight: 600; text-decoration: none;">support@wallxerp.com</a>.
                </p>
              </div>

              <!-- CTA Button -->
              <table role="presentation" style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="text-align: center; padding: 4px 0 8px;">
                    <a href="${data.securitySettingsLink}"
                       style="display: inline-block; padding: 14px 36px; background-color: #7c3aed; color: #ffffff; text-decoration: none; border-radius: 8px; font-size: 15px; font-weight: 600; box-shadow: 0 4px 14px rgba(124, 58, 237, 0.3);">
                      Review Account Security &rarr;
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

export function generateLoginAlertText(data: LoginAlertEmailData): string {
  return `
WALLX ERP - SECURITY SIGN-IN ALERT
==================================================

Hello ${data.userName},

We noticed a new sign-in to your WallX ERP account (${data.userEmail}).

SIGN-IN DETAILS:
- Account: ${data.userEmail}
- Date & Time: ${data.loginTime}
- IP Address: ${data.ipAddress}
- Device / Browser: ${data.deviceInfo}

If this was you, no action is needed. If you do not recognize this activity, please secure your account immediately:
${data.securitySettingsLink}

---
WallX ERP • Nigeria SME Business Management & Tax Compliance
support@wallxerp.com
  `.trim();
}
