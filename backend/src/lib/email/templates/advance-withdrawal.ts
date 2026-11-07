/**
 * Settlement Advance Withdrawal Email Template
 *
 * Sent when a merchant requests and executes a 30% settlement advance against
 * unsettled DVA bank-transfer inflows.
 * Adheres to the WallX ERP purple design system.
 */

export interface AdvanceWithdrawalEmailData {
  ownerName: string;
  businessName: string;
  totalDebitFormatted: string;
  requestedFormatted: string;
  feeFormatted: string;
  destinationBankName: string;
  accountNumberMasked: string;
  destinationAccountName: string;
  transferReference: string;
  requestDate: string;
  remainingPendingFormatted?: string;
  historyLink: string;
}

export function generateAdvanceWithdrawalHtml(data: AdvanceWithdrawalEmailData): string {
  const remainingCopy = data.remainingPendingFormatted
    ? `${data.remainingPendingFormatted} settles normally`
    : 'Remaining unsettled inflow settles on normal schedule';

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Settlement Advance Approved - WallX ERP</title>
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
                Settlement Advance Approved
              </p>
            </td>
          </tr>

          <!-- Amount Banner -->
          <tr>
            <td style="padding: 32px 32px 20px; text-align: center; background-color: #faf5ff; border-bottom: 1px solid #e9d5ff;">
              <p style="margin: 0; color: #7c3aed; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">
                Advance Credited to Wallet
              </p>
              <h2 style="margin: 8px 0 0; color: #0f172a; font-size: 32px; font-weight: 800; letter-spacing: -0.5px;">
                ${data.requestedFormatted}
              </h2>
              <p style="margin: 6px 0 0; color: #6d28d9; font-size: 13px; font-weight: 500;">
                Instant Wallet Credit
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
                Your settlement advance request for <strong>${data.businessName}</strong> has been approved. A net advance of <strong>${data.requestedFormatted}</strong> has been credited to your WallX wallet and is available to withdraw.
              </p>

              <!-- Details Box -->
              <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0; margin-bottom: 24px; overflow: hidden;">
                <tr>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; color: #64748b; font-size: 13px;">Net Advance Credited</td>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; color: #0f172a; font-size: 13px; font-weight: 600; text-align: right;">${data.requestedFormatted}</td>
                </tr>
                <tr>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; color: #64748b; font-size: 13px;">Advance Fee (1% capped ₦500)</td>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; color: #0f172a; font-size: 13px; font-weight: 600; text-align: right;">${data.feeFormatted}</td>
                </tr>
                <tr>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; color: #64748b; font-size: 13px;">Total Advance Cost</td>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; color: #0f172a; font-size: 13px; font-weight: 600; text-align: right;">${data.totalDebitFormatted}</td>
                </tr>
                <tr>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; color: #64748b; font-size: 13px;">Credited To</td>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; color: #0f172a; font-size: 13px; font-weight: 600; text-align: right;">WallX Wallet</td>
                </tr>
                <tr>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; color: #64748b; font-size: 13px;">Wallet Owner</td>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; color: #0f172a; font-size: 13px; font-weight: 600; text-align: right;">${data.destinationAccountName}</td>
                </tr>
                <tr>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; color: #64748b; font-size: 13px;">Reference</td>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; color: #0f172a; font-size: 13px; font-weight: 600; text-align: right; font-family: monospace;">${data.transferReference}</td>
                </tr>
                <tr>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; color: #64748b; font-size: 13px;">Remaining Unsettled Inflow</td>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; color: #0f172a; font-size: 13px; font-weight: 600; text-align: right;">${remainingCopy}</td>
                </tr>
                <tr>
                  <td style="padding: 12px 16px; color: #64748b; font-size: 13px;">Requested On</td>
                  <td style="padding: 12px 16px; color: #0f172a; font-size: 13px; font-weight: 600; text-align: right;">${data.requestDate}</td>
                </tr>
              </table>

              <!-- CTA Button -->
              <table role="presentation" style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="text-align: center; padding: 4px 0 24px;">
                    <a href="${data.historyLink}"
                       style="display: inline-block; padding: 14px 36px; background-color: #7c3aed; color: #ffffff; text-decoration: none; border-radius: 8px; font-size: 15px; font-weight: 600; box-shadow: 0 4px 14px rgba(124, 58, 237, 0.3);">
                      View Advance History &rarr;
                    </a>
                  </td>
                </tr>
              </table>

              <div style="background-color: #faf5ff; border: 1px solid #f3e8ff; border-radius: 8px; padding: 16px; margin-bottom: 16px;">
                <p style="margin: 0; color: #4c1d95; font-size: 13px; line-height: 1.5;">
                  <strong>Settlement Note:</strong> Remaining unsettled inflows for this batch will settle normally into your platform wallet on schedule. Taking an advance does not alter sales classification or VAT reporting.
                </p>
              </div>

              <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px;">
                <p style="margin: 0; color: #64748b; font-size: 13px; line-height: 1.5;">
                  <strong>Security Notice:</strong> If you did not authorize this settlement advance, please lock your transaction PIN immediately in Settings &rarr; Security and contact <a href="mailto:support@wallxerp.com" style="color: #7c3aed; font-weight: 600; text-decoration: none;">support@wallxerp.com</a>.
                </p>
              </div>
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

export function generateAdvanceWithdrawalText(data: AdvanceWithdrawalEmailData): string {
  const remainingCopy = data.remainingPendingFormatted
    ? `${data.remainingPendingFormatted} settles normally`
    : 'Remaining unsettled inflow settles on normal schedule';

  return `
WALLX ERP - SETTLEMENT ADVANCE APPROVED
==================================================

Hello ${data.ownerName},

Your settlement advance request for ${data.businessName} has been approved.

ADVANCE SUMMARY:
- Net Advance Credited: ${data.requestedFormatted}
- Advance Fee: ${data.feeFormatted} (1% capped ₦500)
- Total Advance Cost: ${data.totalDebitFormatted}
- Credited To: WallX Wallet
- Wallet Owner: ${data.destinationAccountName}
- Reference: ${data.transferReference}
- Remaining Unsettled Inflow: ${remainingCopy}
- Date: ${data.requestDate}

Track advance history on your dashboard:
${data.historyLink}

Remaining unsettled DVA inflows will settle into your wallet on normal schedule. Taking an advance does not affect your sales reporting or tax classifications.

If you did not authorize this advance, please contact support@wallxerp.com immediately.

---
WallX ERP • Nigeria SME Business Management & Tax Compliance
  `.trim();
}
