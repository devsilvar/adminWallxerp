import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

// Mock logger to verify Winston output
jest.mock('@/lib/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

import logger from '@/lib/logger';
import config from '@/config';
import { sendEmail } from '@/lib/email';
import {
  generateMarketplaceProductApprovedHtml,
  generateMarketplaceProductApprovedText,
  renderMarketplaceProductApprovedEmail,
} from '@/lib/email/templates/marketplace-product-approved';
import {
  generateMarketplaceProductRejectedHtml,
  generateMarketplaceProductRejectedText,
  renderMarketplaceProductRejectedEmail,
} from '@/lib/email/templates/marketplace-product-rejected';
import {
  dispatchProductApprovedEmail,
  dispatchProductRejectedEmail,
} from '@/services/email-dispatch.service';
import prisma from '@/lib/prisma';

describe('Phase 6: Marketplace Email Templates & Dispatch Tests', () => {
  let originalApiKey: string;

  beforeEach(() => {
    jest.clearAllMocks();
    originalApiKey = config.email.apiKey;
    // Set to empty string for hermetic unit testing of dev-fallback behavior
    (config.email as any).apiKey = '';
  });

  afterEach(() => {
    (config.email as any).apiKey = originalApiKey;
  });

  describe('1. Approved Email Template', () => {
    const sampleApprovedData = {
      recipientName: 'Chidi Anagonye',
      businessName: 'Chidi Premium Goods',
      productName: 'Executive Leather Briefcase',
      category: 'bags',
      priceFormatted: '₦45,000.00',
      productSlug: 'executive-leather-briefcase-a1b2',
      productUrl: 'https://app.paymytax.ng/marketplace/products/executive-leather-briefcase-a1b2',
      dashboardLink: 'https://app.paymytax.ng/inventory',
      approvalDate: '29 October 2026, 18:30',
    };

    it('renders complete HTML with purple theme, product details and CTA links', () => {
      const html = generateMarketplaceProductApprovedHtml(sampleApprovedData);

      expect(html).toContain('WallX ERP');
      expect(html).toContain('Listing Approved &amp; Live');
      expect(html).toContain('Executive Leather Briefcase');
      expect(html).toContain('Chidi Premium Goods');
      expect(html).toContain('₦45,000.00');
      expect(html).toContain('Live on Marketplace');
      expect(html).toContain(sampleApprovedData.productUrl);
      expect(html).toContain(sampleApprovedData.dashboardLink);
    });

    it('renders plain text version with core summary', () => {
      const text = generateMarketplaceProductApprovedText(sampleApprovedData);

      expect(text).toContain('WALLX ERP - PRODUCT APPROVED & LIVE');
      expect(text).toContain('Hello Chidi Anagonye');
      expect(text).toContain(sampleApprovedData.productUrl);
      expect(text).toContain(sampleApprovedData.dashboardLink);
    });

    it('properly escapes dynamic HTML characters to prevent XSS / injection', () => {
      const unsafeData = {
        ...sampleApprovedData,
        recipientName: 'Alice <script>alert(1)</script>',
        productName: 'Silk & "Gold" Tie',
        businessName: 'K & B Enterprises',
      };

      const html = generateMarketplaceProductApprovedHtml(unsafeData);

      expect(html).not.toContain('<script>');
      expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
      expect(html).toContain('Silk &amp; &quot;Gold&quot; Tie');
      expect(html).toContain('K &amp; B Enterprises');
    });

    it('renderMarketplaceProductApprovedEmail returns subject and both bodies', () => {
      const result = renderMarketplaceProductApprovedEmail(sampleApprovedData);

      expect(result.subject).toContain('🎉 Approved: Your product "Executive Leather Briefcase"');
      expect(result.html).toContain('Executive Leather Briefcase');
      expect(result.text).toContain('Executive Leather Briefcase');
    });
  });

  describe('2. Rejected Email Template', () => {
    const sampleRejectedData = {
      recipientName: 'Ngozi Eze',
      businessName: 'Ngozi Fashion House',
      productName: 'Designer Ankara Gown',
      category: 'fashion',
      priceFormatted: '₦28,000.00',
      rejectionReason: 'Product photos are blurred and resolution is under 600x600. Please upload clear studio shots.',
      dashboardLink: 'https://app.paymytax.ng/inventory',
      reviewDate: '29 October 2026, 18:45',
    };

    it('renders complete HTML with moderator feedback callout and action button', () => {
      const html = generateMarketplaceProductRejectedHtml(sampleRejectedData);

      expect(html).toContain('WallX ERP');
      expect(html).toContain('Listing Requires Changes');
      expect(html).toContain('Action Needed: Designer Ankara Gown');
      expect(html).toContain('Moderator Feedback');
      expect(html).toContain(sampleRejectedData.rejectionReason);
      expect(html).toContain('Edit &amp; Resubmit Listing');
      expect(html).toContain(sampleRejectedData.dashboardLink);
    });

    it('renders plain text version with feedback and dashboard link', () => {
      const text = generateMarketplaceProductRejectedText(sampleRejectedData);

      expect(text).toContain('WALLX ERP - MARKETPLACE LISTING UPDATE REQUIRED');
      expect(text).toContain(sampleRejectedData.rejectionReason);
      expect(text).toContain(sampleRejectedData.dashboardLink);
    });

    it('escapes unsafe characters in rejection reason and merchant input', () => {
      const unsafeData = {
        ...sampleRejectedData,
        productName: 'Dress <100% Cotton>',
        rejectionReason: 'Reason with "quotes" & <tags>',
      };

      const html = generateMarketplaceProductRejectedHtml(unsafeData);

      expect(html).not.toContain('<100% Cotton>');
      expect(html).toContain('&lt;100% Cotton&gt;');
      expect(html).toContain('Reason with &quot;quotes&quot; &amp; &lt;tags&gt;');
    });

    it('renderMarketplaceProductRejectedEmail returns subject and both bodies', () => {
      const result = renderMarketplaceProductRejectedEmail(sampleRejectedData);

      expect(result.subject).toContain('Action Required: Marketplace Listing Review for "Designer Ankara Gown"');
      expect(result.html).toContain('Moderator Feedback');
      expect(result.text).toContain(sampleRejectedData.rejectionReason);
    });
  });

  describe('3. Resend Dev Fallback Verification (Plan Step 6.4)', () => {
    it('returns meta.delivered = false and logs via Winston when RESEND_API_KEY is not configured', async () => {
      const result = await sendEmail({
        to: 'merchant-test@e2e.com',
        subject: 'Dev Fallback Test',
        html: '<p>Test body</p>',
      });

      expect(result.delivered).toBe(false);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('EMAIL (dev fallback'),
        expect.objectContaining({
          to: 'merchant-test@e2e.com',
          subject: 'Dev Fallback Test',
        })
      );
    });
  });

  describe('4. Email Dispatch Service Integration', () => {
    it('dispatchProductApprovedEmail safely handles non-existent product without throwing', async () => {
      const prismaSpy = jest.spyOn(prisma.marketplaceProduct, 'findUnique').mockResolvedValue(null as any);

      await expect(
        dispatchProductApprovedEmail('non-existent-product-id')
      ).resolves.not.toThrow();

      prismaSpy.mockRestore();
    });

    it('dispatchProductRejectedEmail safely handles non-existent product without throwing', async () => {
      const prismaSpy = jest.spyOn(prisma.marketplaceProduct, 'findUnique').mockResolvedValue(null as any);

      await expect(
        dispatchProductRejectedEmail('non-existent-product-id', 'Test reason')
      ).resolves.not.toThrow();

      prismaSpy.mockRestore();
    });

    it('dispatchProductApprovedEmail fetches product and calls sendEmail in dev mode', async () => {
      const mockProductWithUser: any = {
        id: 'prod_valid_1',
        name: 'Smart Wristwatch',
        category: 'electronics',
        price: '75000',
        slug: 'smart-wristwatch-123',
        approvedAt: new Date(),
        business: {
          businessName: 'Gadget World',
          user: {
            email: 'gadgets@example.com',
            fullName: 'Emeka Okafor',
          },
        },
      };

      const prismaSpy = jest.spyOn(prisma.marketplaceProduct, 'findUnique').mockResolvedValue(mockProductWithUser);

      await dispatchProductApprovedEmail('prod_valid_1');

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('EMAIL (dev fallback'),
        expect.objectContaining({
          to: 'gadgets@example.com',
          subject: expect.stringContaining('Smart Wristwatch'),
        })
      );

      prismaSpy.mockRestore();
    });

    it('dispatchProductRejectedEmail fetches product and calls sendEmail with rejection feedback', async () => {
      const mockProductWithUser: any = {
        id: 'prod_valid_2',
        name: 'Wireless Earbuds',
        category: 'electronics',
        price: '25000',
        slug: 'wireless-earbuds-456',
        business: {
          businessName: 'Audio Haven',
          user: {
            email: 'audio@example.com',
            fullName: 'Fatima Bello',
          },
        },
      };

      const prismaSpy = jest.spyOn(prisma.marketplaceProduct, 'findUnique').mockResolvedValue(mockProductWithUser);

      await dispatchProductRejectedEmail('prod_valid_2', 'Missing warranty information in attributes.');

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('EMAIL (dev fallback'),
        expect.objectContaining({
          to: 'audio@example.com',
          subject: expect.stringContaining('Wireless Earbuds'),
        })
      );

      prismaSpy.mockRestore();
    });
  });
});
