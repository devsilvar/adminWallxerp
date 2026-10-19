/**
 * Withdrawal Requested Email Template
 *
 * Sent when a merchant initiates a wallet payout to their settlement bank account.
 * Matches the WallX ERP purple design system of Welcome Aboard & Tax Payment Confirmed.
 */

export interface WithdrawalRequestedEmailData {
  ownerName: string;
  businessName: string;
  amountFormatted: string;
  feeFormatted: string;
  netAmountFormatted: string;
  destinationBankName: string;
  accountNumberMasked: string;
  destinationAccountName: string;
  transferReference: string;
  requestDate: string;
  isAutoPayout: boolean;
  dashboardLink: string;
}

export function generateWithdrawalRequestedHtml(data: WithdrawalRequestedEmailData): string {
  const statusLabel = data.isAutoPayout
    ? 'Processing Instant Bank Transfer'
    : 'Queued for Settlement Review';

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Withdrawal Requested - WallX ERP</title>
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
                Withdrawal Requested
              </p>
            </td>
          </tr>

          <!-- Amount Banner -->
          <tr>
            <td style="padding: 32px 32px 20px; text-align: center; background-color: #faf5ff; border-bottom: 1px solid #e9d5ff;">
              <p style="margin: 0; color: #7c3aed; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">
                Net Payout Amount
              </p>
              <h2 style="margin: 8px 0 0; color: #0f172a; font-size: 32px; font-weight: 800; letter-spacing: -0.5px;">
                ${data.netAmountFormatted}
              </h2>
              <p style="margin: 6px 0 0; color: #6d28d9; font-size: 13px; font-weight: 500;">
                ${statusLabel}
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
                We have received a withdrawal request from the wallet of <strong>${data.businessName}</strong>. Your funds have been securely reserved while the transfer to your settlement bank account is processed.
              </p>

              <!-- Details Box -->
              <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0; margin-bottom: 24px; overflow: hidden;">
                <tr>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; color: #64748b; font-size: 13px;">Gross Withdrawal</td>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; color: #0f172a; font-size: 13px; font-weight: 600; text-align: right;">${data.amountFormatted}</td>
                </tr>
                <tr>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; color: #64748b; font-size: 13px;">Transfer Fee</td>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; color: #0f172a; font-size: 13px; font-weight: 600; text-align: right;">${data.feeFormatted}</td>
                </tr>
                <tr>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; color: #64748b; font-size: 13px;">Destination Bank</td>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; color: #0f172a; font-size: 13px; font-weight: 600; text-align: right;">${data.destinationBankName} (${data.accountNumberMasked})</td>
                </tr>
                <tr>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; color: #64748b; font-size: 13px;">Account Name</td>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; color: #0f172a; font-size: 13px; font-weight: 600; text-align: right;">${data.destinationAccountName}</td>
                </tr>
                <tr>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; color: #64748b; font-size: 13px;">Reference</td>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; color: #0f172a; font-size: 13px; font-weight: 600; text-align: right; font-family: monospace;">${data.transferReference}</td>
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
                    <a href="${data.dashboardLink}"
                       style="display: inline-block; padding: 14px 36px; background-color: #7c3aed; color: #ffffff; text-decoration: none; border-radius: 8px; font-size: 15px; font-weight: 600; box-shadow: 0 4px 14px rgba(124, 58, 237, 0.3);">
                      View Withdrawal Status &rarr;
                    </a>
                  </td>
                </tr>
              </table>

              <div style="background-color: #faf5ff; border: 1px solid #f3e8ff; border-radius: 8px; padding: 16px;">
                <p style="margin: 0; color: #4c1d95; font-size: 13px; line-height: 1.5;">
                  <strong>Security Notice:</strong> If you did not authorize this withdrawal request, please lock your transaction PIN immediately in Settings &rarr; Security and contact <a href="mailto:support@wallxerp.com" style="color: #7c3aed; font-weight: 600; text-decoration: none;">support@wallxerp.com</a>.
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

export function generateWithdrawalRequestedText(data: WithdrawalRequestedEmailData): string {
  return `
WALLX ERP - WITHDRAWAL REQUESTED
==================================================

Hello ${data.ownerName},

We have received a withdrawal request from the wallet of ${data.businessName}.

WITHDRAWAL SUMMARY:
- Net Payout: ${data.netAmountFormatted}
- Gross Amount: ${data.amountFormatted}
- Transfer Fee: ${data.feeFormatted}
- Destination Bank: ${data.destinationBankName} (${data.accountNumberMasked})
- Account Name: ${data.destinationAccountName}
- Reference: ${data.transferReference}
- Date: ${data.requestDate}

Track status on your dashboard:
${data.dashboardLink}

If you did not authorize this withdrawal, please contact support@wallxerp.com immediately.

---
WallX ERP • Nigeria SME Business Management & Tax Compliance
  `.trim();
}
