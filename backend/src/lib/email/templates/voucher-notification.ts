/**
 * Customer Virtual Store Card & Voucher Notification Email Template — WallX ERP
 *
 * Dispatched to customers when a new virtual store card / change voucher is created
 * or credited in CRM. Voucher CODE has been retired — lookup is by customer
 * name + PIN + last 4 phone. Email therefore sends ONLY: customer name
 * (identification), 6-digit PIN (when issued/changed), balance, and store info.
 */

import { escapeHtml } from '../escape';

export interface VoucherNotificationEmailData {
  customerName: string;
  businessName: string;
  cardCode?: string; // deprecated — retired from flow, kept optional for backward compat only; never rendered
  balanceFormatted: string;
  actionType?: 'created' | 'top_up' | 'change_credit';
  amountFormatted?: string;
  bonusAmountFormatted?: string | null;
  bonusPct?: number | null;
  customerPhone?: string | null;
  businessPhone?: string | null;
  notes?: string | null;
  pinCode?: string; // 6-digit plaintext PIN (only when issuing/changing PIN)
}

export function generateVoucherNotificationHtml(data: VoucherNotificationEmailData): string {
  const customerName = escapeHtml(data.customerName);
  const businessName = escapeHtml(data.businessName);
  const balanceFormatted = escapeHtml(data.balanceFormatted);
  const customerPhone = data.customerPhone ? escapeHtml(data.customerPhone) : null;
  const businessPhone = data.businessPhone ? escapeHtml(data.businessPhone) : null;
  const notes = data.notes ? escapeHtml(data.notes) : null;
  const actionType = data.actionType ?? 'created';

  let titleText = 'Your Store Voucher is Ready';
  let badgeText = 'Voucher Ready';
  let bannerSubtext = 'Your voucher is active';

  if (actionType === 'top_up') {
    titleText = 'Voucher Top-Up Confirmed';
    badgeText = 'Balance Added';
    bannerSubtext = data.amountFormatted ? `+${data.amountFormatted} Credited` : 'Card Credited';
  } else if (actionType === 'change_credit') {
    titleText = 'Change Saved to Your Voucher';
    badgeText = 'Change Saved';
    bannerSubtext = data.amountFormatted ? `+${data.amountFormatted} Change Saved` : 'Change Credited';
  }

  const pinBlock = data.pinCode
    ? `<div style="margin: 8px auto 0; display: inline-block; background-color: #ffffff; border: 2px solid #9333ea; border-radius: 12px; padding: 16px 28px; box-shadow: 0 4px 12px rgba(147, 51, 234, 0.15);"><div style="color: #7c3aed; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 6px;">Your 6-Digit PIN — keep it private</div><div style="font-family: 'Courier New', Courier, monospace; font-size: 30px; font-weight: 800; color: #581c87; letter-spacing: 10px; text-align: center;">${escapeHtml(data.pinCode)}</div><div style="color: #6b21a8; font-size: 11px; margin-top: 8px;">You will enter this PIN + last 4 of your phone at the till.</div></div>`
    : `<p style="margin: 10px 0 0; color: #0f172a; font-size: 14px; font-weight: 600;">Current Balance: <span style="font-size: 18px; font-weight: 800; color: #16a34a;">${balanceFormatted}</span></p>`;

  const pinBalanceLine = data.pinCode
    ? `<p style="margin: 12px 0 0; color: #16a34a; font-size: 14px; font-weight: 700;">Available Balance: ${balanceFormatted}</p>`
    : '';

  const pinInstruction = data.pinCode
    ? `<li style="margin-bottom: 6px;"><strong>Confirm with PIN:</strong> Enter your 6-digit PIN and the last 4 digits of your phone number. Keep your PIN private.</li>`
    : `<li style="margin-bottom: 6px;">Confirm with your 6-digit PIN and last 4 digits of your phone — the till will verify instantly.</li>`;

  const bonusBanner = data.bonusAmountFormatted && data.bonusPct
    ? `<div style="margin: 14px auto 0; display: inline-block; background: linear-gradient(135deg, #ecfdf5 0%, #f0fdf4 100%); border: 1px solid #a7f3d0; border-radius: 10px; padding: 12px 18px;"><div style="color: #059669; font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px;">🎁 Bonus Added</div><div style="color: #065f46; font-size: 14px; font-weight: 700; margin-top: 4px;">+${escapeHtml(data.bonusAmountFormatted)} extra (${data.bonusPct}% bonus)</div><div style="color: #047857; font-size: 11px; margin-top: 2px;">You received more than you paid — thank you for keeping your balance with ${businessName}!</div></div>`
    : '';

  const bodyIntro =
    actionType === 'created'
      ? `Your store voucher at <strong>${businessName}</strong> is ready. You can shop and save change without needing a code — just give your name at checkout.`
      : actionType === 'top_up'
        ? `Your voucher at <strong>${businessName}</strong> has been topped up successfully.`
        : `Your change has been saved to your voucher at <strong>${businessName}</strong>.`;

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${titleText} - ${businessName}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f8fafc; color: #334155;">
  <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #f8fafc;">
    <tr>
      <td style="padding: 40px 20px;">
        <table role="presentation" style="max-width: 580px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(15, 23, 42, 0.08); border: 1px solid #e2e8f0;">
          <tr>
            <td style="padding: 32px 32px 24px; text-align: center; background-color: #0f172a;">
              <h1 style="margin: 0; color: #ffffff; font-size: 22px; font-weight: 700; letter-spacing: -0.5px;">${businessName}</h1>
              <p style="margin: 6px 0 0; color: #c084fc; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">${badgeText}</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 32px 24px 28px; text-align: center; background-color: #faf5ff; border-bottom: 1px solid #e9d5ff;">
              <p style="margin: 0 0 10px; color: #7c3aed; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px;">${bannerSubtext}</p>
              <div style="display: inline-block; background-color: #ffffff; border: 1px solid #e9d5ff; border-radius: 12px; padding: 16px 24px; margin: 6px 0 14px; box-shadow: 0 2px 6px rgba(147, 51, 234, 0.08);">
                <div style="color: #64748b; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 6px;">Voucher Holder</div>
                <div style="color: #0f172a; font-size: 20px; font-weight: 800; letter-spacing: -0.3px;">${customerName}</div>
                ${customerPhone ? `<div style="color: #64748b; font-size: 12px; margin-top: 4px;">${customerPhone}</div>` : ''}
              </div>
              ${pinBlock}
              ${pinBalanceLine}
              ${bonusBanner}
            </td>
          </tr>
          <tr>
            <td style="padding: 32px;">
              <p style="margin: 0 0 16px; color: #0f172a; font-size: 15px; line-height: 1.5;">Hello <strong>${customerName}</strong>,</p>
              <p style="margin: 0 0 20px; color: #475569; font-size: 14px; line-height: 1.6;">${bodyIntro}</p>
              ${data.bonusAmountFormatted && data.bonusPct ? `<div style="background-color: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 8px; padding: 14px 16px; margin-bottom: 20px;"><p style="margin: 0; color: #065f46; font-size: 13px; font-weight: 600;">🎁 You received ${escapeHtml(data.bonusAmountFormatted)} extra (${data.bonusPct}% bonus) — thank you for keeping your balance with ${businessName}!</p></div>` : ''}
              <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0; margin-bottom: 24px; overflow: hidden;">
                <tr><td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; color: #64748b; font-size: 13px;">Store Name</td><td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; color: #0f172a; font-size: 13px; font-weight: 600; text-align: right;">${businessName}</td></tr>
                <tr><td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; color: #64748b; font-size: 13px;">Customer Name</td><td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; color: #0f172a; font-size: 13px; font-weight: 600; text-align: right;">${customerName}</td></tr>
                <tr><td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; color: #64748b; font-size: 13px;">Available Balance</td><td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; color: #16a34a; font-size: 14px; font-weight: 700; text-align: right;">${balanceFormatted}</td></tr>
                ${data.bonusAmountFormatted && data.bonusPct ? `<tr><td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; color: #64748b; font-size: 13px;">Bonus Added</td><td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; color: #059669; font-size: 13px; font-weight: 700; text-align: right;">+${escapeHtml(data.bonusAmountFormatted)} (${data.bonusPct}%)</td></tr>` : ''}
                ${customerPhone ? `<tr><td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; color: #64748b; font-size: 13px;">Linked Phone</td><td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; color: #0f172a; font-size: 13px; font-weight: 500; text-align: right;">${customerPhone}</td></tr>` : ''}
                ${notes ? `<tr><td style="padding: 12px 16px; color: #64748b; font-size: 13px;">Notes</td><td style="padding: 12px 16px; color: #0f172a; font-size: 13px; font-weight: 500; text-align: right;">${notes}</td></tr>` : ''}
              </table>
              <div style="background-color: #f1f5f9; border-left: 4px solid #7c3aed; border-radius: 0 8px 8px 0; padding: 16px; margin-bottom: 24px;">
                <h3 style="margin: 0 0 8px; color: #0f172a; font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">How to Use Your Voucher</h3>
                <ol style="margin: 0; padding-left: 20px; color: #475569; font-size: 13px; line-height: 1.6;">
                  <li style="margin-bottom: 6px;">At checkout, tell the cashier your name: <strong>${customerName}</strong> — no code needed.</li>
                  ${pinInstruction}
                  <li>Ask the cashier to save any cash change to your voucher.</li>
                </ol>
              </div>
              ${businessPhone ? `<p style="margin: 0; color: #64748b; font-size: 13px; line-height: 1.5;">Questions about your balance? Contact ${businessName} directly at <strong>${businessPhone}</strong>.</p>` : ''}
            </td>
          </tr>
          <tr>
            <td style="padding: 24px 32px; background-color: #f8fafc; border-top: 1px solid #e2e8f0; text-align: center;">
              <p style="margin: 0 0 6px; color: #64748b; font-size: 12px;">Sent on behalf of <strong>${businessName}</strong> by WallX ERP.</p>
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

export function generateVoucherNotificationText(data: VoucherNotificationEmailData): string {
  const actionHeader =
    data.actionType === 'top_up'
      ? 'STORE VOUCHER TOPPED UP'
      : data.actionType === 'change_credit'
        ? 'CHANGE CREDITED TO STORE VOUCHER'
        : 'STORE VOUCHER CREATED';

  const intro =
    data.actionType === 'created'
      ? `Your store voucher at ${data.businessName} is ready. Shop with your name — no code needed.`
      : data.actionType === 'top_up'
        ? `Your voucher at ${data.businessName} has been topped up.`
        : `Your change has been saved to your voucher at ${data.businessName}.`;

  return `
${actionHeader} - ${data.businessName.toUpperCase()}
==================================================

Hello ${data.customerName},

${intro}

VOUCHER DETAILS:
--------------------------------------------------
- Store: ${data.businessName}
- Customer: ${data.customerName}
${data.pinCode ? `- Your 6-Digit PIN: ${data.pinCode}  (keep it private — you will enter this + last 4 of phone at the till)\n` : ''}- Available Balance: ${data.balanceFormatted}
${data.bonusAmountFormatted && data.bonusPct ? `- Bonus Added: +${data.bonusAmountFormatted} (${data.bonusPct}% extra) — thank you for keeping your balance with us!\n` : ''}
${data.customerPhone ? `- Linked Phone: ${data.customerPhone}\n` : ''}${data.notes ? `- Notes: ${data.notes}\n` : ''}
HOW TO USE:
Give your name ("${data.customerName}") at checkout at ${data.businessName}.
${data.pinCode ? `Confirm with your PIN (${data.pinCode}) and last 4 digits of your phone.\n` : 'Confirm with your 6-digit PIN and last 4 of your phone.\n'}Ask the cashier to save any cash change to your voucher.

Thank you,
${data.businessName}

---
Powered by WallX ERP
  `.trim();
}
