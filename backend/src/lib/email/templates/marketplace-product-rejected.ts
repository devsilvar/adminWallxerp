/**
 * Marketplace Product Rejected Email Template — WallX ERP
 *
 * Dispatched to the merchant when an admin rejects their product listing,
 * including mandatory moderation feedback so the merchant can correct issues and resubmit.
 * Follows the WallX ERP purple design system.
 */

import { escapeHtml } from '@/lib/email/escape';

export interface MarketplaceProductRejectedEmailData {
  recipientName: string;
  businessName: string;
  productName: string;
  category: string;
  priceFormatted: string;
  rejectionReason: string;
  dashboardLink: string;
  reviewDate: string;
}

export function generateMarketplaceProductRejectedHtml(
  data: MarketplaceProductRejectedEmailData
): string {
  const safeRecipient = escapeHtml(data.recipientName);
  const safeBusiness = escapeHtml(data.businessName);
  const safeProduct = escapeHtml(data.productName);
  const safeCategory = escapeHtml(data.category);
  const safePrice = escapeHtml(data.priceFormatted);
  const safeReason = escapeHtml(data.rejectionReason);
  const safeDate = escapeHtml(data.reviewDate);
  const safeDashboardLink = escapeHtml(data.dashboardLink);

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Product Listing Update - WallX Marketplace</title>
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
                Marketplace Moderation
              </p>
            </td>
          </tr>

          <!-- Banner -->
          <tr>
            <td style="padding: 32px 32px 20px; text-align: center; background-color: #fef2f2; border-bottom: 1px solid #fecaca;">
              <p style="margin: 0; color: #dc2626; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">
                Listing Requires Changes
              </p>
              <h2 style="margin: 8px 0 0; color: #0f172a; font-size: 24px; font-weight: 800; letter-spacing: -0.5px;">
                Action Needed: ${safeProduct}
              </h2>
              <p style="margin: 6px 0 0; color: #991b1b; font-size: 13px; font-weight: 500;">
                Review feedback below before resubmitting
              </p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding: 32px;">
              <p style="margin: 0 0 16px; color: #0f172a; font-size: 15px; line-height: 1.5;">
                Hello <strong>${safeRecipient}</strong>,
              </p>

              <p style="margin: 0 0 20px; color: #475569; font-size: 14px; line-height: 1.6;">
                During moderation review of your product for <strong>${safeBusiness}</strong>, our team noted items that need adjustment before this product can be listed publicly on the marketplace.
              </p>

              <!-- Moderation Feedback Callout -->
              <div style="background-color: #fff1f2; border-left: 4px solid #e11d48; padding: 16px; border-radius: 6px; margin-bottom: 24px;">
                <p style="margin: 0 0 6px; color: #9f1239; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">
                  Moderator Feedback
                </p>
                <p style="margin: 0; color: #881337; font-size: 14px; line-height: 1.5;">
                  ${safeReason}
                </p>
              </div>

              <!-- Product Details Box -->
              <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0; margin-bottom: 24px; overflow: hidden;">
                <tr>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; color: #64748b; font-size: 13px;">Product</td>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; color: #0f172a; font-size: 13px; font-weight: 600; text-align: right;">${safeProduct}</td>
                </tr>
                <tr>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; color: #64748b; font-size: 13px;">Category</td>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; color: #0f172a; font-size: 13px; font-weight: 600; text-align: right; text-transform: capitalize;">${safeCategory}</td>
                </tr>
                <tr>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; color: #64748b; font-size: 13px;">Price</td>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; color: #0f172a; font-size: 13px; font-weight: 600; text-align: right;">${safePrice}</td>
                </tr>
                <tr>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; color: #64748b; font-size: 13px;">Review Date</td>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; color: #0f172a; font-size: 13px; font-weight: 600; text-align: right;">${safeDate}</td>
                </tr>
                <tr>
                  <td style="padding: 12px 16px; color: #64748b; font-size: 13px;">Status</td>
                  <td style="padding: 12px 16px; color: #dc2626; font-size: 13px; font-weight: 700; text-align: right;">Changes Requested</td>
                </tr>
              </table>

              <!-- CTA Button -->
              <table role="presentation" style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="text-align: center; padding: 8px 0 16px;">
                    <a href="${safeDashboardLink}"
                       style="display: inline-block; padding: 14px 36px; background-color: #7c3aed; color: #ffffff; text-decoration: none; border-radius: 8px; font-size: 15px; font-weight: 600; box-shadow: 0 4px 14px rgba(124, 58, 237, 0.3);">
                      Edit &amp; Resubmit Listing &rarr;
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
                WallX ERP • Nigeria SME Business Management &amp; Tax Compliance
              </p>
              <p style="margin: 0; color: #94a3b8; font-size: 11px;">
                Need help with marketplace requirements? Email <a href="mailto:support@wallxerp.com" style="color: #7c3aed; text-decoration: none; font-weight: 500;">support@wallxerp.com</a>
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

export function generateMarketplaceProductRejectedText(
  data: MarketplaceProductRejectedEmailData
): string {
  return `
WALLX ERP - MARKETPLACE LISTING UPDATE REQUIRED
==================================================

Hello ${data.recipientName},

Your product listing for ${data.businessName} requires changes before it can be listed publicly on WallX Marketplace.

MODERATOR FEEDBACK:
${data.rejectionReason}

LISTING DETAILS:
- Product: ${data.productName}
- Category: ${data.category}
- Price: ${data.priceFormatted}
- Review Date: ${data.reviewDate}
- Status: Changes Requested

To update and resubmit your listing, visit your inventory dashboard:
${data.dashboardLink}

---
WallX ERP • Nigeria SME Business Management & Tax Compliance
support@wallxerp.com
  `.trim();
}

export function renderMarketplaceProductRejectedEmail(
  data: MarketplaceProductRejectedEmailData
) {
  return {
    subject: `Action Required: Marketplace Listing Review for "${data.productName}"`,
    html: generateMarketplaceProductRejectedHtml(data),
    text: generateMarketplaceProductRejectedText(data),
  };
}
