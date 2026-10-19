/**
 * Password Reset Email Template
 * 
 * Professional, branded, and security-conscious email for password reset requests on WallX ERP.
 * Matches the design language of Welcome Aboard & Tax Payment Confirmed templates.
 */

export interface PasswordResetEmailData {
  resetLink: string;
  expiryMinutes: number;
  userEmail: string;
}

/**
 * Generate HTML email for password reset.
 * Uses inline CSS for maximum email client compatibility.
 */
export function generatePasswordResetHtml(data: PasswordResetEmailData): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset Your Password - WallX ERP</title>
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
                Password Reset Request
              </p>
            </td>
          </tr>

          <!-- Security Highlight Banner -->
          <tr>
            <td style="padding: 28px 32px 20px; text-align: center; background-color: #faf5ff; border-bottom: 1px solid #e9d5ff;">
              <p style="margin: 0; color: #7c3aed; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">
                Security Verification
              </p>
              <h2 style="margin: 8px 0 0; color: #0f172a; font-size: 24px; font-weight: 700; letter-spacing: -0.5px;">
                Reset Your Password
              </h2>
              <p style="margin: 6px 0 0; color: #6d28d9; font-size: 13px; font-weight: 500;">
                Link expires in ${data.expiryMinutes} minutes
              </p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding: 32px;">
              <p style="margin: 0 0 16px; color: #0f172a; font-size: 16px; font-weight: 600; line-height: 1.5;">
                Hi there,
              </p>
              
              <p style="margin: 0 0 24px; color: #334155; font-size: 15px; line-height: 1.6;">
                We received a request to reset the password for your <strong>WallX ERP</strong> account associated with <strong>${data.userEmail}</strong>. Click the button below to securely set a new password:
              </p>

              <!-- CTA Button -->
              <table role="presentation" style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="text-align: center; padding: 10px 0 30px;">
                    <a href="${data.resetLink}" 
                       style="display: inline-block; padding: 14px 36px; background-color: #7c3aed; color: #ffffff; text-decoration: none; border-radius: 8px; font-size: 15px; font-weight: 600; box-shadow: 0 4px 14px rgba(124, 58, 237, 0.3);">
                      Reset My Password &rarr;
                    </a>
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
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; color: #64748b; font-size: 13px;">Security Window</td>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; color: #0f172a; font-size: 13px; font-weight: 600; text-align: right;">${data.expiryMinutes} minutes</td>
                </tr>
                <tr>
                  <td style="padding: 12px 16px; color: #64748b; font-size: 13px;">Single-Use Policy</td>
                  <td style="padding: 12px 16px; color: #0f172a; font-size: 13px; font-weight: 600; text-align: right;">One-time token</td>
                </tr>
              </table>

              <!-- Security Notice -->
              <div style="background-color: #faf5ff; border: 1px solid #f3e8ff; border-left: 4px solid #7c3aed; border-radius: 6px; padding: 16px 20px; margin-bottom: 24px;">
                <p style="margin: 0 0 6px; color: #581c87; font-size: 13px; font-weight: 700;">
                  Didn't request this change?
                </p>
                <p style="margin: 0; color: #4c1d95; font-size: 13px; line-height: 1.5;">
                  If you didn't request a password reset, you can safely ignore this email. Your account password will remain unchanged. Never forward or share this link with anyone.
                </p>
              </div>

              <!-- Fallback Link -->
              <p style="margin: 0 0 8px; color: #64748b; font-size: 12px; line-height: 1.5;">
                If the button above does not work, copy and paste this secure link directly into your browser:
              </p>
              <p style="margin: 0 0 20px; font-size: 12px; word-break: break-all;">
                <a href="${data.resetLink}" style="color: #7c3aed; text-decoration: underline;">
                  ${data.resetLink}
                </a>
              </p>

              <p style="margin: 0; color: #64748b; font-size: 14px; line-height: 1.6;">
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
                Automated security message. Need assistance? Contact <a href="mailto:support@wallxerp.com" style="color: #7c3aed; text-decoration: none; font-weight: 500;">support@wallxerp.com</a>
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

/**
 * Generate plain-text fallback email for password reset.
 */
export function generatePasswordResetText(data: PasswordResetEmailData): string {
  return `
WALLX ERP - PASSWORD RESET REQUEST
==================================================

Hi there,

We received a request to reset the password for your WallX ERP account associated with ${data.userEmail}.

To reset your password, visit this link:
${data.resetLink}

IMPORTANT SECURITY INFORMATION:
- This link will expire in ${data.expiryMinutes} minutes
- This link can only be used once
- If you don't reset your password within ${data.expiryMinutes} minutes, you'll need to request a new link

DIDN'T REQUEST THIS?
If you didn't request a password reset, you can safely ignore this email. Your password will remain unchanged.

For security reasons, never forward this email or share the reset link with anyone.

Best regards,
The WallX ERP Team
support@wallxerp.com
  `.trim();
}

