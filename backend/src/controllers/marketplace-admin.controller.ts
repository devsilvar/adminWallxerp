import { Response } from 'express';
import { asyncHandler, AppError } from '@/middleware/errorHandler';
import { AuthenticatedRequest } from '@/types';
import {
  approveSchema,
  rejectSchema,
  takedownSchema,
  listProductsQuerySchema,
} from '@/validators/marketplace.validator';
import * as marketplaceService from '@/services/marketplace/marketplace.service';

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
 * GET /admin/marketplace
 * List products pending moderation review in oldest-first FIFO order.
 */
export const listQueue = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user?.userId) {
      throw new AppError(401, 'Authentication required', 'UNAUTHORIZED');
    }

    const query = listProductsQuerySchema.parse(req.query);
    const result = await marketplaceService.listModerationQueue(query);

    res.status(200).json({
      success: true,
      ...result,
    });
  }
);

/**
 * POST /admin/marketplace/:id/approve
 * Approve a pending product listing, transitioning it to `approved` and notifying the merchant.
 */
export const approveProduct = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user?.userId) {
      throw new AppError(401, 'Authentication required', 'UNAUTHORIZED');
    }

    const productId = extractParam(req.params.id, 'id');
    approveSchema.parse(req.body || {});

    const product = await marketplaceService.approveProduct(
      req.user.userId,
      productId
    );

    res.status(200).json({
      success: true,
      data: product,
      message: 'Product approved successfully',
    });
  }
);

/**
 * POST /admin/marketplace/:id/reject
 * Reject a pending product listing with mandatory feedback reason (3-500 chars).
 */
export const rejectProduct = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user?.userId) {
      throw new AppError(401, 'Authentication required', 'UNAUTHORIZED');
    }

    const productId = extractParam(req.params.id, 'id');
    const { reason } = rejectSchema.parse(req.body);

    const product = await marketplaceService.rejectProduct(
      req.user.userId,
      productId,
      reason
    );

    res.status(200).json({
      success: true,
      data: product,
      message: 'Product rejected successfully',
    });
  }
);

/**
 * POST /admin/marketplace/:id/takedown
 * Administratively take down a live or problematic product listing.
 */
export const takedownProduct = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user?.userId) {
      throw new AppError(401, 'Authentication required', 'UNAUTHORIZED');
    }

    const productId = extractParam(req.params.id, 'id');
    const { reason } = takedownSchema.parse(req.body);

    const product = await marketplaceService.takedownProduct(
      req.user.userId,
      productId,
      reason
    );

    res.status(200).json({
      success: true,
      data: product,
      message: 'Product taken down successfully',
    });
  }
);

export const marketplaceAdminController = {
  listQueue,
  approveProduct,
  rejectProduct,
  takedownProduct,
};
