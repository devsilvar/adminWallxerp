/**
 * Voucher Adjustment Notification Email Template — WallX ERP
 *
 * Dispatched to customers when a store voucher balance is manually adjusted (credited or debited)
 * by a store owner/manager.
 */

import { escapeHtml } from '../escape';

export interface VoucherAdjustmentNotificationEmailData {
  customerName: string;
  businessName: string;
  amount: number;
  amountFormatted: string;
  balanceFormatted?: string | null;
  reason: string;
  customerPhone?: string | null;
  businessPhone?: string | null;
}

export function generateVoucherAdjustmentNotificationHtml(
  data: VoucherAdjustmentNotificationEmailData
): string {
  const customerName = escapeHtml(data.customerName || 'Valued Customer');
  const businessName = escapeHtml(data.businessName || 'Store');
  const isCredit = data.amount > 0;
  const actionWord = isCredit ? 'credited' : 'debited';
  const actionBadge = isCredit ? 'Balance Credited' : 'Balance Debited';
  const badgeColor = isCredit ? '#16a34a' : '#dc2626';
  const badgeBg = isCredit ? '#dcfce7' : '#fee2e2';
  const amountFormatted = escapeHtml(data.amountFormatted);
  const reason = escapeHtml(data.reason);
  const businessPhone = data.businessPhone ? escapeHtml(data.businessPhone) : null;

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Voucher Balance Adjustment - ${businessName}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f8fafc; color: #334155;">
  <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #f8fafc;">
    <tr>
      <td style="padding: 40px 20px;">
        <table role="presentation" style="max-width: 580px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(15, 23, 42, 0.08); border: 1px solid #e2e8f0;">
          <tr>
            <td style="padding: 28px 32px 20px; text-align: center; background-color: #0f172a;">
              <h1 style="margin: 0; color: #ffffff; font-size: 20px; font-weight: 700; letter-spacing: -0.5px;">${businessName}</h1>
              <p style="margin: 6px 0 0; color: #c084fc; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.8px;">Store Voucher Update</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 32px 32px 24px; text-align: center; background-color: #f8fafc; border-bottom: 1px solid #e2e8f0;">
              <div style="display: inline-block; background-color: ${badgeBg}; color: ${badgeColor}; padding: 6px 14px; border-radius: 20px; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 12px;">
                ${actionBadge}
              </div>
              <h2 style="margin: 0; color: #0f172a; font-size: 32px; font-weight: 800; letter-spacing: -0.5px;">
                ${isCredit ? '+' : '–'}${amountFormatted}
              </h2>
              ${data.balanceFormatted ? `<p style="margin: 8px 0 0; color: #64748b; font-size: 13px;">New Card Balance: <strong style="color: #0f172a;">${escapeHtml(data.balanceFormatted)}</strong></p>` : ''}
            </td>
          </tr>
          <tr>
            <td style="padding: 32px;">
              <p style="margin: 0 0 16px; color: #0f172a; font-size: 15px; line-height: 1.5;">Hello <strong>${customerName}</strong>,</p>
              <p style="margin: 0 0 20px; color: #475569; font-size: 14px; line-height: 1.6;">
                Your virtual store voucher at <strong>${businessName}</strong> was ${actionWord} by <strong>${amountFormatted}</strong>.
              </p>
              <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
                <div style="color: #64748b; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 4px;">Reason for Adjustment</div>
                <div style="color: #0f172a; font-size: 14px; font-weight: 500;">${reason}</div>
              </div>
              <p style="margin: 0; color: #64748b; font-size: 13px; line-height: 1.5;">
                If you believe this adjustment was made in error or have questions about your balance, please reach out to <a href="mailto:support@wallxerp.com" style="color: #7c3aed; text-decoration: none; font-weight: 600;">support@wallxerp.com</a>.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding: 20px 32px; background-color: #f8fafc; border-top: 1px solid #e2e8f0; text-align: center;">
              <p style="margin: 0 0 4px; color: #64748b; font-size: 12px;">Sent on behalf of <strong>${businessName}</strong> by WallX ERP.</p>
              <p style="margin: 0; color: #94a3b8; font-size: 11px;">This is an automated notification. Please do not reply directly to this email.</p>
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

export function generateVoucherAdjustmentNotificationText(
  data: VoucherAdjustmentNotificationEmailData
): string {
  const isCredit = data.amount > 0;
  const actionWord = isCredit ? 'credited' : 'debited';
  return `
VOUCHER BALANCE ADJUSTMENT — ${data.businessName.toUpperCase()}

Hello ${data.customerName || 'Valued Customer'},

Your store voucher at ${data.businessName} was ${actionWord} by ${data.amountFormatted}.
${data.balanceFormatted ? `New Balance: ${data.balanceFormatted}\n` : ''}
Reason: ${data.reason}

If you believe this was made in error or have questions about your balance, please contact support@wallxerp.com.

PayMyTax by WallX ERP
  `.trim();
}
