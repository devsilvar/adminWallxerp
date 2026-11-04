import { Request, Response } from 'express';
import { asyncHandler, AppError } from '@/middleware/errorHandler';
import { listProductsQuerySchema } from '@/validators/marketplace.validator';
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

export const publicMarketplaceController = {
  listFeed,
  getBySlug,
};
