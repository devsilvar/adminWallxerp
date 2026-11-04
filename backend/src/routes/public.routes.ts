/**
 * Public, unauthenticated routes.
 *
 * Mounted at /api/v1/public — sibling to authenticated /api/v1/* routes.
 * Anything here is reachable by a recipient who only has a share token; it
 * MUST NOT leak data beyond what the SME has explicitly chosen to share.
 */

import { Router } from 'express';
import * as invoiceController from '@/controllers/invoice.controller';
import { publicVoucherController } from '@/controllers/public-voucher.controller';
import * as publicMarketplaceController from '@/controllers/public-marketplace.controller';
import { SUBSCRIPTION_PLANS } from '@/config/subscription-plans';
import { verificationRateLimiter, publicMarketplaceRateLimiter } from '@/middleware/security';

const router = Router();

// Customer-facing invoice PDF. The token in the URL substitutes for auth.
router.get('/invoices/:token/pdf', invoiceController.downloadPublicPdf);

// Public pricing tiers, limits, and feature capabilities for frontend sync
router.get('/subscription-plans', (_req, res) => {
  res.status(200).json({
    success: true,
    data: SUBSCRIPTION_PLANS,
  });
});

// Customer magic-link voucher verification endpoints
router.get(
  '/voucher-verify/:id',
  verificationRateLimiter,
  publicVoucherController.getVoucherVerifyPreview
);

router.post(
  '/voucher-verify/:id',
  verificationRateLimiter,
  publicVoucherController.confirmVoucherVerify
);

// Public marketplace catalog feed and product detail
router.get(
  '/marketplace/products',
  publicMarketplaceRateLimiter,
  publicMarketplaceController.listFeed
);

router.get(
  '/marketplace/products/:slug',
  publicMarketplaceRateLimiter,
  publicMarketplaceController.getBySlug
);

export default router;
