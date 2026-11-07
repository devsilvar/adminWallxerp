/**
 * Slot Purchase Receipt Email Template
 *
 * Professional, branded confirmation email dispatched when additional marketplace listing slots
 * are purchased via the merchant's WallX wallet.
 */

export interface SlotPurchaseReceiptEmailData {
  ownerName: string;
  businessName: string;
  slots: number;
  unitPriceFormatted: string;
  amountFormatted: string;
  paymentReference: string;
  paymentDate: string;
  newAllowance: number;
}

export function generateSlotPurchaseReceiptHtml(data: SlotPurchaseReceiptEmailData): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Marketplace Slots Purchase Receipt - WallX</title>
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
                WallX Marketplace
              </h1>
              <p style="margin: 6px 0 0; color: #38bdf8; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">
                Listing Slots Confirmed
              </p>
            </td>
          </tr>

          <!-- Amount Banner -->
          <tr>
            <td style="padding: 32px 32px 20px; text-align: center; background-color: #f0fdf4; border-bottom: 1px solid #bbf7d0;">
              <p style="margin: 0; color: #16a34a; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">
                Payment Debited from Wallet
              </p>
              <h2 style="margin: 8px 0 0; color: #0f172a; font-size: 32px; font-weight: 800; letter-spacing: -0.5px;">
                ${data.amountFormatted}
              </h2>
              <p style="margin: 6px 0 0; color: #15803d; font-size: 13px; font-weight: 500;">
                +${data.slots} Listing Slot${data.slots === 1 ? '' : 's'} Unlocked (New Capacity: ${data.newAllowance})
              </p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding: 32px;">
              <p style="margin: 0 0 16px; font-size: 15px; line-height: 24px;">
                Hello <strong>${data.ownerName}</strong>,
              </p>
              <p style="margin: 0 0 24px; font-size: 15px; line-height: 24px; color: #475569;">
                Your wallet payment for <strong>${data.businessName}</strong> has been successfully processed. Your marketplace capacity has been upgraded and you can now publish new products immediately.
              </p>

              <!-- Transaction Summary Card -->
              <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0; margin-bottom: 28px;">
                <tr>
                  <td style="padding: 12px 16px; font-size: 13px; color: #64748b; border-bottom: 1px solid #e2e8f0;">Transaction Reference</td>
                  <td style="padding: 12px 16px; font-size: 13px; color: #0f172a; font-weight: 600; text-align: right; border-bottom: 1px solid #e2e8f0; font-family: monospace;">${data.paymentReference}</td>
                </tr>
                <tr>
                  <td style="padding: 12px 16px; font-size: 13px; color: #64748b; border-bottom: 1px solid #e2e8f0;">Slots Added</td>
                  <td style="padding: 12px 16px; font-size: 13px; color: #0f172a; font-weight: 600; text-align: right; border-bottom: 1px solid #e2e8f0;">${data.slots}</td>
                </tr>
                <tr>
                  <td style="padding: 12px 16px; font-size: 13px; color: #64748b; border-bottom: 1px solid #e2e8f0;">Unit Price</td>
                  <td style="padding: 12px 16px; font-size: 13px; color: #0f172a; font-weight: 600; text-align: right; border-bottom: 1px solid #e2e8f0;">${data.unitPriceFormatted}</td>
                </tr>
                <tr>
                  <td style="padding: 12px 16px; font-size: 13px; color: #64748b; border-bottom: 1px solid #e2e8f0;">Total Debited</td>
                  <td style="padding: 12px 16px; font-size: 13px; color: #0f172a; font-weight: 700; text-align: right; border-bottom: 1px solid #e2e8f0;">${data.amountFormatted}</td>
                </tr>
                <tr>
                  <td style="padding: 12px 16px; font-size: 13px; color: #64748b;">New Total Slot Capacity</td>
                  <td style="padding: 12px 16px; font-size: 13px; color: #16a34a; font-weight: 700; text-align: right;">${data.newAllowance} listings</td>
                </tr>
              </table>

              <p style="margin: 0; font-size: 13px; line-height: 20px; color: #94a3b8; text-align: center;">
                Need help or have questions about listing your inventory? Reply directly to this email or visit your merchant dashboard.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 20px 32px; background-color: #f8fafc; border-top: 1px solid #e2e8f0; text-align: center;">
              <p style="margin: 0; font-size: 12px; color: #94a3b8;">
                &copy; ${new Date().getFullYear()} WallX ERP. All rights reserved.
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

export function generateSlotPurchaseReceiptText(data: SlotPurchaseReceiptEmailData): string {
  return `
WALLX MARKETPLACE - LISTING SLOTS PURCHASE RECEIPT
--------------------------------------------------

Hello ${data.ownerName},

Your wallet payment for ${data.businessName} has been processed successfully.
Your marketplace capacity has been upgraded.

Transaction Details:
- Reference: ${data.paymentReference}
- Slots Added: ${data.slots}
- Unit Price: ${data.unitPriceFormatted}
- Total Debited: ${data.amountFormatted}
- New Listing Capacity: ${data.newAllowance} listings
- Date: ${data.paymentDate}

You can now publish new products directly from your merchant dashboard.
  `.trim();
}
