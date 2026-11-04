/**
 * Marketplace Product Approved Email Template — WallX ERP
 *
 * Dispatched to the merchant when an admin approves their product listing.
 * Follows the WallX ERP purple design system.
 */

import { escapeHtml } from '@/lib/email/escape';

export interface MarketplaceProductApprovedEmailData {
  recipientName: string;
  businessName: string;
  productName: string;
  category: string;
  priceFormatted: string;
  productSlug: string;
  productUrl: string;
  dashboardLink: string;
  approvalDate: string;
}

export function generateMarketplaceProductApprovedHtml(
  data: MarketplaceProductApprovedEmailData
): string {
  const safeRecipient = escapeHtml(data.recipientName);
  const safeBusiness = escapeHtml(data.businessName);
  const safeProduct = escapeHtml(data.productName);
  const safeCategory = escapeHtml(data.category);
  const safePrice = escapeHtml(data.priceFormatted);
  const safeDate = escapeHtml(data.approvalDate);
  const safeProductUrl = escapeHtml(data.productUrl);
  const safeDashboardLink = escapeHtml(data.dashboardLink);

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Product Approved - WallX Marketplace</title>
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
                Marketplace Syndication
              </p>
            </td>
          </tr>

          <!-- Banner -->
          <tr>
            <td style="padding: 32px 32px 20px; text-align: center; background-color: #faf5ff; border-bottom: 1px solid #e9d5ff;">
              <p style="margin: 0; color: #7c3aed; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">
                Listing Approved &amp; Live
              </p>
              <h2 style="margin: 8px 0 0; color: #0f172a; font-size: 26px; font-weight: 800; letter-spacing: -0.5px;">
                ${safeProduct}
              </h2>
              <p style="margin: 6px 0 0; color: #6d28d9; font-size: 14px; font-weight: 600;">
                ${safePrice}
              </p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding: 32px;">
              <p style="margin: 0 0 16px; color: #0f172a; font-size: 15px; line-height: 1.5;">
                Hello <strong>${safeRecipient}</strong>,
              </p>

              <p style="margin: 0 0 24px; color: #475569; font-size: 14px; line-height: 1.6;">
                Great news! Your product listing for <strong>${safeBusiness}</strong> has passed our moderation review and is now live on the public <strong>WallX Marketplace</strong> catalog.
              </p>

              <!-- Product Details Box -->
              <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0; margin-bottom: 24px; overflow: hidden;">
                <tr>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; color: #64748b; font-size: 13px;">Product Name</td>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; color: #0f172a; font-size: 13px; font-weight: 600; text-align: right;">${safeProduct}</td>
                </tr>
                <tr>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; color: #64748b; font-size: 13px;">Category</td>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; color: #0f172a; font-size: 13px; font-weight: 600; text-align: right; text-transform: capitalize;">${safeCategory}</td>
                </tr>
                <tr>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; color: #64748b; font-size: 13px;">Listed Price</td>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; color: #0f172a; font-size: 13px; font-weight: 600; text-align: right;">${safePrice}</td>
                </tr>
                <tr>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; color: #64748b; font-size: 13px;">Approved Date</td>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; color: #0f172a; font-size: 13px; font-weight: 600; text-align: right;">${safeDate}</td>
                </tr>
                <tr>
                  <td style="padding: 12px 16px; color: #64748b; font-size: 13px;">Status</td>
                  <td style="padding: 12px 16px; color: #16a34a; font-size: 13px; font-weight: 700; text-align: right;">Live on Marketplace</td>
                </tr>
              </table>

              <!-- Action Buttons -->
              <table role="presentation" style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="text-align: center; padding: 8px 0 16px;">
                    <a href="${safeProductUrl}"
                       style="display: inline-block; padding: 14px 32px; background-color: #7c3aed; color: #ffffff; text-decoration: none; border-radius: 8px; font-size: 15px; font-weight: 600; box-shadow: 0 4px 14px rgba(124, 58, 237, 0.3); margin-right: 8px;">
                      View on Marketplace &rarr;
                    </a>
                  </td>
                </tr>
                <tr>
                  <td style="text-align: center; padding: 0 0 8px;">
                    <a href="${safeDashboardLink}"
                       style="color: #64748b; font-size: 13px; text-decoration: underline;">
                      Manage in Inventory Dashboard
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
                Questions about your listing? Contact <a href="mailto:support@wallxerp.com" style="color: #7c3aed; text-decoration: none; font-weight: 500;">support@wallxerp.com</a>
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

export function generateMarketplaceProductApprovedText(
  data: MarketplaceProductApprovedEmailData
): string {
  return `
WALLX ERP - PRODUCT APPROVED & LIVE
==================================================

Hello ${data.recipientName},

Great news! Your product listing for ${data.businessName} has passed moderation review and is now live on the public WallX Marketplace catalog.

LISTING SUMMARY:
- Product: ${data.productName}
- Category: ${data.category}
- Price: ${data.priceFormatted}
- Approval Date: ${data.approvalDate}
- Status: Live on Marketplace

View your product:
${data.productUrl}

Manage inventory in your dashboard:
${data.dashboardLink}

---
WallX ERP • Nigeria SME Business Management & Tax Compliance
support@wallxerp.com
  `.trim();
}

export function renderMarketplaceProductApprovedEmail(
  data: MarketplaceProductApprovedEmailData
) {
  return {
    subject: `🎉 Approved: Your product "${data.productName}" is now live on WallX Marketplace!`,
    html: generateMarketplaceProductApprovedHtml(data),
    text: generateMarketplaceProductApprovedText(data),
  };
}
