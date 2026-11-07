import { Request, Response } from 'express';
import { asyncHandler, AppError } from '@/middleware/errorHandler';
import { listProductsQuerySchema, recordEventSchema } from '@/validators/marketplace.validator';
import * as marketplaceService from '@/services/marketplace/marketplace.service';

/**
 * Standard edge-cache header for public marketplace endpoints.
 * Instructs CDN edge caches to hold the response for up to 5 minutes (s-maxage=300)
 * with a 10-minute stale-while-revalidate grace period for instant response times.
 */
const MARKETPLACE_CACHE_CONTROL =
  'public, max-age=0, s-maxage=300, stale-while-revalidate=600';

/**
 * Extracts a single string route parameter safely, handling Express 5 string[] types.
 */
function extractParam(param: string | string[] | undefined, name: string): string {
  const val = Array.isArray(param) ? param[0] : param;
  if (!val || typeof val !== 'string' || !val.trim()) {
    throw new AppError(400, `${name} is required`, 'INVALID_PARAM');
  }
  return val.trim();
}

/**
 * GET /marketplace/products
 * Public syndicated marketplace catalog feed of approved listings.
 */
export const listFeed = asyncHandler(async (req: Request, res: Response) => {
  const query = listProductsQuerySchema.parse(req.query);
  const result = await marketplaceService.listPublicFeed(query);

  res.setHeader('Cache-Control', MARKETPLACE_CACHE_CONTROL);
  res.status(200).json({
    success: true,
    ...result,
  });
});

/**
 * GET /marketplace/products/:slug
 * Public product detail page by unique slug, including related items from the merchant.
 */
export const getBySlug = asyncHandler(async (req: Request, res: Response) => {
  const slug = extractParam(req.params.slug, 'slug');
  const result = await marketplaceService.getPublicProduct(slug);

  res.setHeader('Cache-Control', MARKETPLACE_CACHE_CONTROL);
  res.status(200).json({
    success: true,
    data: result.product,
    relatedProducts: result.relatedProducts,
  });
});

/**
 * POST /marketplace/products/:productId/events
 * Anonymous beacon to record a listing interaction event (view, click, etc.).
 * Responds 204 on success/invalid payload/unexpected failures so beacons never break UX.
 * Phase 4 spec: missing/unapproved product => 404 (do not create events for drafts).
 */
export const recordEvent = asyncHandler(async (req: Request, res: Response) => {
  const productId = extractParam(req.params.productId, 'productId');
  const body = recordEventSchema.safeParse(req.body);

  if (!body.success) {
    res.status(204).end();
    return;
  }

  const forwardedFor = req.headers['x-forwarded-for'];
  const ipRaw = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor;
  const ip = (ipRaw ? String(ipRaw).split(',')[0].trim() : '') || req.ip || 'unknown';

  const userAgent = String(req.headers['user-agent'] ?? 'unknown');

  try {
    await marketplaceService.recordListingEvent({
      productId,
      eventType: body.data.type,
      ip,
      userAgent,
      source: body.data.source,
    });
  } catch {
    // Swallow all errors — beacon is fire-and-forget and must never fail the caller.
  }

  res.status(204).end();
});

/**
 * GET /marketplace/sellers/:identifier
 * Public seller storefront page showing merchant profile and approved listings.
 */
export const getSellerStorefront = asyncHandler(async (req: Request, res: Response) => {
  const identifier = extractParam(req.params.identifier, 'identifier');
  const result = await marketplaceService.getSellerStorefront(identifier);

  res.setHeader('Cache-Control', MARKETPLACE_CACHE_CONTROL);
  res.status(200).json({
    success: true,
    data: result,
  });
});

/**
 * GET /marketplace/products/:productId/whatsapp-redirect
 * Phase 7: opens WhatsApp without exposing contact numbers in public list payloads.
 * Records the click server-side, then redirects to wa.me. Rate-limited like other public endpoints.
 */
export const redirectWhatsApp = asyncHandler(async (req: Request, res: Response) => {
  const productId = extractParam(req.params.productId, 'productId');
  const source = typeof req.query.source === 'string' ? req.query.source.slice(0, 50) : undefined;

  const forwardedFor = req.headers['x-forwarded-for'];
  const ipRaw = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor;
  const ip = (ipRaw ? String(ipRaw).split(',')[0].trim() : '') || req.ip || 'unknown';
  const userAgent = String(req.headers['user-agent'] ?? 'unknown');

  const whatsappUrl = await marketplaceService.getPublicWhatsAppRedirectUrl({
    productId,
    ip,
    userAgent,
    source,
  });

  res.setHeader('Cache-Control', 'no-store');
  res.redirect(302, whatsappUrl);
});

export const publicMarketplaceController = {
  listFeed,
  getBySlug,
  recordEvent,
  getSellerStorefront,
  redirectWhatsApp,
};
