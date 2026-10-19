/**
 * Email Verification Template
 *
 * Professional, branded, and security-conscious email template for new account
 * verification on WallX ERP (WallXERP).
 */

export interface VerifyEmailData {
  verificationLink: string;
  userEmail: string;
  expiryHours: number;
}

/**
 * Generate HTML email for account verification.
 * Uses inline CSS for universal email client compatibility.
 */
export function generateVerifyEmailHtml(data: VerifyEmailData): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Verify Your Email — WallX ERP</title>
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
              <p style="margin: 6px 0 0; color: #34d399; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">
                Account Verification
              </p>
            </td>
          </tr>

          <!-- Security Highlight Banner -->
          <tr>
            <td style="padding: 28px 32px 20px; text-align: center; background-color: #f0fdf4; border-bottom: 1px solid #bbf7d0;">
              <p style="margin: 0; color: #059669; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">
                One Step Away
              </p>
              <h2 style="margin: 8px 0 0; color: #0f172a; font-size: 24px; font-weight: 700; letter-spacing: -0.5px;">
                Verify Your Email Address
              </h2>
              <p style="margin: 6px 0 0; color: #047857; font-size: 13px; font-weight: 500;">
                Link expires in ${data.expiryHours} hours
              </p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding: 32px;">
              <p style="margin: 0 0 16px; color: #0f172a; font-size: 16px; font-weight: 600; line-height: 1.5;">
                Welcome to WallX ERP,
              </p>
              
              <p style="margin: 0 0 24px; color: #334155; font-size: 15px; line-height: 1.6;">
                Thank you for creating an account with <strong>${data.userEmail}</strong>. To activate your workspace, access automated sales tracking, and set up your NRS tax compliance engine, please confirm your email address by clicking the button below:
              </p>

              <!-- CTA Button -->
              <table role="presentation" style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="text-align: center; padding: 10px 0 30px;">
                    <a href="${data.verificationLink}" 
                       style="display: inline-block; padding: 14px 36px; background-color: #059669; color: #ffffff; text-decoration: none; border-radius: 8px; font-size: 15px; font-weight: 600; box-shadow: 0 4px 14px rgba(5, 150, 105, 0.35);">
                      Verify My Email Address &rarr;
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
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; color: #64748b; font-size: 13px;">Validity Period</td>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; color: #0f172a; font-size: 13px; font-weight: 600; text-align: right;">${data.expiryHours} hours</td>
                </tr>
                <tr>
                  <td style="padding: 12px 16px; color: #64748b; font-size: 13px;">Security Policy</td>
                  <td style="padding: 12px 16px; color: #0f172a; font-size: 13px; font-weight: 600; text-align: right;">Single-use token</td>
                </tr>
              </table>

              <!-- Security Notice -->
              <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-left: 4px solid #059669; border-radius: 6px; padding: 16px 20px; margin-bottom: 24px;">
                <p style="margin: 0 0 6px; color: #0f172a; font-size: 13px; font-weight: 600;">
                  Security Note
                </p>
                <p style="margin: 0; color: #64748b; font-size: 13px; line-height: 1.5;">
                  If you didn't create an account with WallX ERP, please safely ignore this email. No account will be activated without clicking this verification link.
                </p>
              </div>

              <!-- Direct Link Fallback -->
              <div style="border-top: 1px solid #e2e8f0; padding-top: 20px;">
                <p style="margin: 0 0 8px; color: #64748b; font-size: 12px;">
                  Button not working? Copy and paste this URL into your browser:
                </p>
                <p style="margin: 0; word-break: break-all; font-family: monospace; font-size: 12px; color: #059669; background-color: #f1f5f9; padding: 8px 12px; border-radius: 4px; border: 1px solid #e2e8f0;">
                  ${data.verificationLink}
                </p>
              </div>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 24px 32px; background-color: #f8fafc; border-top: 1px solid #e2e8f0; text-align: center;">
              <p style="margin: 0 0 6px; color: #64748b; font-size: 12px;">
                WallX ERP &bull; Nigeria SME Business Management &amp; NRS Tax Compliance
              </p>
              <p style="margin: 0; color: #94a3b8; font-size: 11px;">
                This is an automated security email. Need help? Contact <a href="mailto:support@wallxerp.com" style="color: #059669; text-decoration: none; font-weight: 500;">support@wallxerp.com</a>
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
 * Generate plain text email alternative for text-only clients.
 */
export function generateVerifyEmailText(data: VerifyEmailData): string {
  return `
VERIFY YOUR EMAIL — WALLX ERP
========================================

Welcome to WallX ERP,

Thank you for creating an account with ${data.userEmail}. To activate your workspace and set up your NRS tax compliance engine, please verify your email address by visiting the following link:

${data.verificationLink}

This link is valid for ${data.expiryHours} hours and can only be used once.

Target Account: ${data.userEmail}
Validity Window: ${data.expiryHours} hours

If you did not sign up for WallX ERP, you can safely ignore this email.

---
WallX ERP • Nigeria SME Business Management & NRS Tax Compliance
Need help? Contact support@wallxerp.com
  `.trim();
}
