/**
 * Admin Password Verification Code Email Template
 *
 * Professional, branded, and security-conscious email containing a one-time
 * code for admin password changes.
 * Matches the design language of password-reset.ts.
 */

export interface AdminPasswordCodeEmailData {
  code: string;
  expiryMinutes: number;
  userEmail: string;
  requestIp?: string;
  requestUserAgent?: string;
  requestedAt: string;
}

/**
 * Generate HTML email for admin password change verification code.
 *
 * SECURITY INVARIANT: The code MUST NOT appear within the first 200 characters
 * of the generated HTML output to avoid leaking into truncated development logs.
 */
export function generateAdminPasswordCodeHtml(data: AdminPasswordCodeEmailData): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Admin Password Change Verification Code - WallX ERP</title>
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
                Admin Portal Security
              </p>
            </td>
          </tr>

          <!-- Security Highlight Banner -->
          <tr>
            <td style="padding: 28px 32px 20px; text-align: center; background-color: #faf5ff; border-bottom: 1px solid #e9d5ff;">
              <p style="margin: 0; color: #7c3aed; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">
                Verification Required
              </p>
              <h2 style="margin: 8px 0 0; color: #0f172a; font-size: 24px; font-weight: 700; letter-spacing: -0.5px;">
                Admin Password Change
              </h2>
              <p style="margin: 6px 0 0; color: #6d28d9; font-size: 13px; font-weight: 500;">
                Code expires in ${data.expiryMinutes} minutes
              </p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding: 32px;">
              <p style="margin: 0 0 16px; color: #0f172a; font-size: 16px; font-weight: 600; line-height: 1.5;">
                Hello Administrator,
              </p>
              
              <p style="margin: 0 0 24px; color: #334155; font-size: 15px; line-height: 1.6;">
                A request has been initiated to change the password for your WallX admin account (<strong>${data.userEmail}</strong>). Enter the verification code below in the admin portal to proceed:
              </p>

              <!-- One-Time Code Box -->
              <table role="presentation" style="width: 100%; border-collapse: collapse; margin-bottom: 28px;">
                <tr>
                  <td style="text-align: center; padding: 20px; background-color: #f1f5f9; border-radius: 8px; border: 2px dashed #cbd5e1;">
                    <span style="font-family: 'Courier New', Courier, monospace; font-size: 34px; font-weight: 700; letter-spacing: 8px; color: #7c3aed; display: inline-block;">
                      ${data.code}
                    </span>
                    <p style="margin: 8px 0 0; color: #64748b; font-size: 12px; font-weight: 500;">
                      Expires in ${data.expiryMinutes} minutes • Single use only
                    </p>
                  </td>
                </tr>
              </table>

              <!-- Request Details Box -->
              <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0; margin-bottom: 24px; overflow: hidden;">
                <tr>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; color: #64748b; font-size: 13px;">Target Account</td>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; color: #0f172a; font-size: 13px; font-weight: 600; text-align: right;">${data.userEmail}</td>
                </tr>
                <tr>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; color: #64748b; font-size: 13px;">Requested At</td>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; color: #0f172a; font-size: 13px; font-weight: 600; text-align: right;">${data.requestedAt}</td>
                </tr>
                ${data.requestIp ? `
                <tr>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; color: #64748b; font-size: 13px;">Request IP</td>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; color: #0f172a; font-size: 13px; font-weight: 600; text-align: right;">${data.requestIp}</td>
                </tr>
                ` : ''}
                <tr>
                  <td style="padding: 12px 16px; color: #64748b; font-size: 13px;">Attempt Limit</td>
                  <td style="padding: 12px 16px; color: #0f172a; font-size: 13px; font-weight: 600; text-align: right;">5 attempts max</td>
                </tr>
              </table>

              <!-- Security Notice -->
              <div style="background-color: #fef2f2; border: 1px solid #fee2e2; border-left: 4px solid #ef4444; border-radius: 6px; padding: 16px 20px; margin-bottom: 24px;">
                <p style="margin: 0 0 6px; color: #991b1b; font-size: 13px; font-weight: 700;">
                  Security Alert
                </p>
                <p style="margin: 0; color: #b91c1c; font-size: 13px; line-height: 1.5;">
                  If you did not request this, someone has access to an admin session. Report it to platform engineering immediately.
                </p>
              </div>

              <p style="margin: 0; color: #64748b; font-size: 14px; line-height: 1.6;">
                Best regards,<br>
                <strong style="color: #0f172a;">WallX Platform Engineering</strong>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 24px 32px; background-color: #f8fafc; border-top: 1px solid #e2e8f0; text-align: center;">
              <p style="margin: 0 0 6px; color: #64748b; font-size: 12px;">
                WallX ERP • Operations & Security Infrastructure
              </p>
              <p style="margin: 0; color: #94a3b8; font-size: 11px;">
                This is an automated operational security dispatch.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`.trim();
}

/**
 * Generate plain-text fallback email for admin password code.
 */
export function generateAdminPasswordCodeText(data: AdminPasswordCodeEmailData): string {
  return `
WALLX ADMIN PORTAL - PASSWORD CHANGE VERIFICATION
==================================================

Hello Administrator,

A request has been initiated to change the password for your WallX admin account (${data.userEmail}).

Your one-time verification code is:
>>> ${data.code} <<<

SECURITY DETAILS:
- Code expires in: ${data.expiryMinutes} minutes
- Requested at: ${data.requestedAt}
${data.requestIp ? `- Request IP: ${data.requestIp}\n` : ''}- Attempt limit: 5 attempts max
- Single-use only

SECURITY ALERT:
If you did not request this, someone has access to an admin session. Report it to platform engineering immediately.

Best regards,
WallX Platform Engineering
  `.trim();
}
