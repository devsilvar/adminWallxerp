/**
 * Voucher Verification Magic Link Email Template — WallX ERP
 *
 * Dispatched to customers when a store voucher credit / top-up requires customer confirmation.
 * Follows the purple brand theme with an ATM card visual, gold chip, amber security warning,
 * and clear call-to-action button.
 */

import { escapeHtml } from '../escape';

export interface VoucherVerificationEmailData {
  customerName: string;
  businessName: string;
  amountFormatted: string;
  bonusAmountFormatted?: string | null;
  bonusPct?: number | null;
  totalFormatted: string;
  verifyUrl: string;
  expiresInHours?: number;
  customerPhone?: string | null;
  businessPhone?: string | null;
}

export function generateVoucherVerificationHtml(data: VoucherVerificationEmailData): string {
  const customerName = escapeHtml(data.customerName || 'Valued Customer');
  const businessName = escapeHtml(data.businessName || 'Store');
  const amountFormatted = escapeHtml(data.amountFormatted);
  const totalFormatted = escapeHtml(data.totalFormatted);
  const verifyUrl = escapeHtml(data.verifyUrl);
  const customerPhone = data.customerPhone ? escapeHtml(data.customerPhone) : null;
  const expiresInHours = data.expiresInHours ?? 24;

  const bonusBadge =
    data.bonusAmountFormatted && data.bonusPct
      ? `<div style="margin-top: 10px; display: inline-block; background-color: rgba(255, 255, 255, 0.2); border-radius: 6px; padding: 4px 10px; font-size: 12px; font-weight: 600; color: #ffffff;">
           🎁 Includes ${escapeHtml(data.bonusAmountFormatted)} (${data.bonusPct}% Store Reward)
         </div>`
      : '';

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Confirm Your Store Voucher Credit - ${businessName}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f8fafc; color: #334155;">
  <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #f8fafc;">
    <tr>
      <td style="padding: 40px 20px;">
        <table role="presentation" style="max-width: 580px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(15, 23, 42, 0.08); border: 1px solid #e2e8f0;">
          <!-- Brand Header -->
          <tr>
            <td style="padding: 28px 32px 20px; text-align: center; background-color: #0f172a;">
              <h1 style="margin: 0; color: #ffffff; font-size: 20px; font-weight: 700; letter-spacing: -0.5px;">${businessName}</h1>
              <p style="margin: 6px 0 0; color: #c084fc; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.8px;">Store Voucher Verification</p>
            </td>
          </tr>

          <!-- Virtual ATM Card Visual -->
          <tr>
            <td style="padding: 32px 28px 24px; text-align: center; background-color: #faf5ff; border-bottom: 1px solid #e9d5ff;">
              <div style="max-width: 380px; margin: 0 auto; background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 50%, #9333ea 100%); border-radius: 16px; padding: 24px; color: #ffffff; text-align: left; box-shadow: 0 10px 25px -5px rgba(124, 58, 237, 0.4); position: relative;">
                <!-- Gold Chip & Logo -->
                <table role="presentation" style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
                  <tr>
                    <td>
                      <svg width="42" height="30" viewBox="0 0 42 30" fill="none" xmlns="http://www.w3.org/2000/svg" style="display: block;">
                        <rect width="42" height="30" rx="4" fill="#E2B13C"/>
                        <rect x="2" y="2" width="38" height="26" rx="3" fill="#F5CF63"/>
                        <path d="M0 11H12M0 19H12M30 11H42M30 19H42M12 6V24M30 6V24" stroke="#9A7010" stroke-width="1.2"/>
                        <circle cx="21" cy="15" r="4.5" fill="#E2B13C" stroke="#9A7010" stroke-width="1.2"/>
                      </svg>
                    </td>
                    <td style="text-align: right;">
                      <span style="font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: rgba(255, 255, 255, 0.85);">Virtual Voucher</span>
                    </td>
                  </tr>
                </table>

                <!-- Amount -->
                <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: rgba(255, 255, 255, 0.8);">Pending Credit Amount</div>
                <div style="font-size: 28px; font-weight: 800; letter-spacing: -0.5px; margin-top: 4px; color: #ffffff;">${totalFormatted}</div>
                ${bonusBadge}

                <!-- Customer Name -->
                <div style="margin-top: 24px; font-size: 13px; font-weight: 700; letter-spacing: 0.5px; color: #ffffff; text-transform: uppercase;">
                  ${customerName}
                </div>
              </div>
            </td>
          </tr>

          <!-- Main Body -->
          <tr>
            <td style="padding: 32px 32px 20px;">
              <p style="margin: 0 0 16px; color: #0f172a; font-size: 15px; line-height: 1.5;">Hello <strong>${customerName}</strong>,</p>
              <p style="margin: 0 0 20px; color: #475569; font-size: 14px; line-height: 1.6;">
                A voucher credit of <strong>${totalFormatted}</strong> at <strong>${businessName}</strong> has been authorized for your account.
              </p>

              <!-- Amber Security Alert Box -->
              <div style="border-left: 4px solid #f59e0b; background-color: #fffbeb; border-radius: 0 8px 8px 0; padding: 16px; margin-bottom: 24px;">
                <div style="color: #92400e; font-size: 13px; font-weight: 700; margin-bottom: 4px;">⚠️ Security Verification</div>
                <p style="margin: 0; color: #b45309; font-size: 13px; line-height: 1.5;">
                  Did you make a payment, purchase, or deposit in-store? To protect your funds against unauthorized transactions, click below to confirm and activate your voucher balance.
                </p>
              </div>

              <!-- CTA Button -->
              <div style="text-align: center; margin: 28px 0;">
                <a href="${verifyUrl}" style="display: inline-block; background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%); color: #ffffff; text-decoration: none; padding: 14px 36px; font-weight: 700; font-size: 15px; border-radius: 10px; box-shadow: 0 4px 14px rgba(124, 58, 237, 0.35);">
                  Confirm & Claim Voucher
                </a>
              </div>

              <p style="margin: 0; font-size: 12px; color: #64748b; text-align: center; line-height: 1.4;">
                ⏳ This verification magic link will expire in <strong>${expiresInHours} hours</strong>.
              </p>

              <!-- Details Summary Table -->
              <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0; margin-top: 24px; overflow: hidden;">
                <tr>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; color: #64748b; font-size: 13px;">Store</td>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; color: #0f172a; font-size: 13px; font-weight: 600; text-align: right;">${businessName}</td>
                </tr>
                <tr>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; color: #64748b; font-size: 13px;">Top-Up Amount</td>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; color: #0f172a; font-size: 13px; font-weight: 600; text-align: right;">${amountFormatted}</td>
                </tr>
                ${data.bonusAmountFormatted && data.bonusPct ? `
                <tr>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; color: #64748b; font-size: 13px;">Store Reward Bonus</td>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; color: #16a34a; font-size: 13px; font-weight: 700; text-align: right;">+${escapeHtml(data.bonusAmountFormatted)} (${data.bonusPct}%)</td>
                </tr>` : ''}
                <tr>
                  <td style="padding: 12px 16px; color: #64748b; font-size: 13px; font-weight: 700;">Total Credit</td>
                  <td style="padding: 12px 16px; color: #7c3aed; font-size: 14px; font-weight: 800; text-align: right;">${totalFormatted}</td>
                </tr>
              </table>

              <p style="margin: 20px 0 0; color: #64748b; font-size: 12px; line-height: 1.5; text-align: center;">Need help? Contact <a href="mailto:support@wallxerp.com" style="color: #7c3aed; text-decoration: none; font-weight: 600;">support@wallxerp.com</a>.</p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 20px 32px; background-color: #f8fafc; border-top: 1px solid #e2e8f0; text-align: center;">
              <p style="margin: 0 0 4px; color: #64748b; font-size: 12px;">Sent on behalf of <strong>${businessName}</strong> by WallX ERP.</p>
              <p style="margin: 0; color: #94a3b8; font-size: 11px;">If you did not initiate this request, you may safely disregard this email.</p>
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

export function generateVoucherVerificationText(data: VoucherVerificationEmailData): string {
  const expiresInHours = data.expiresInHours ?? 24;
  return `
STORE VOUCHER VERIFICATION — ${data.businessName.toUpperCase()}

Hello ${data.customerName || 'Valued Customer'},

A voucher credit of ${data.totalFormatted} at ${data.businessName} has been authorized for your account.

Did you request this credit?
To activate your voucher balance, please confirm using the secure link below:

${data.verifyUrl}

This verification link will expire in ${expiresInHours} hours.

Total Credit: ${data.totalFormatted}
Top-up: ${data.amountFormatted}
${data.bonusAmountFormatted ? `Reward Bonus: +${data.bonusAmountFormatted} (${data.bonusPct}%)\n` : ''}
Sent on behalf of ${data.businessName} by WallX ERP.
  `.trim();
}
