import { Response } from 'express';
import { asyncHandler, AppError } from '@/middleware/errorHandler';
import { AuthenticatedRequest } from '@/types';
import {
  approveSchema,
  rejectSchema,
  takedownSchema,
  sendBackSchema,
  listProductsQuerySchema,
  rejectSlotProofSchema,
  refundSlotPurchaseSchema,
  listAdminSlotPurchasesQuerySchema,
} from '@/validators/marketplace.validator';
import * as marketplaceService from '@/services/marketplace/marketplace.service';
import * as marketplaceSlotsService from '@/services/marketplace/marketplace-slots.service';

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

/**
 * POST /admin/marketplace/:id/send-back
 * Send an approved product listing back to pending_approval for merchant revision.
 */
export const sendBackProduct = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user?.userId) {
      throw new AppError(401, 'Authentication required', 'UNAUTHORIZED');
    }

    const productId = extractParam(req.params.id, 'id');
    const { reason } = sendBackSchema.parse(req.body);

    const product = await marketplaceService.sendProductBack(
      req.user.userId,
      productId,
      reason
    );

    res.status(200).json({
      success: true,
      data: product,
      message: 'Product sent back for review',
    });
  }
);

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Phase 11 — Admin Listing Slots Moderation & Refunds
 * ─────────────────────────────────────────────────────────────────────────────
 */

/**
 * GET /admin/marketplace/slots
 * List slot purchase records and pending bank transfer proofs.
 */
export const listSlotPurchases = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user?.userId) {
      throw new AppError(401, 'Authentication required', 'UNAUTHORIZED');
    }

    const query = listAdminSlotPurchasesQuerySchema.parse(req.query);
    const result = await marketplaceSlotsService.listAdminSlotPurchases(query);

    res.status(200).json({
      success: true,
      data: result.data,
      pagination: result.pagination,
    });
  }
);

/**
 * POST /admin/marketplace/slots/:id/approve
 * Approve a pending slot purchase proof and raise merchant allowance.
 */
export const approveSlotProof = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user?.userId) {
      throw new AppError(401, 'Authentication required', 'UNAUTHORIZED');
    }

    const purchaseId = extractParam(req.params.id, 'id');

    const result = await marketplaceSlotsService.approveSlotProof({
      adminUserId: req.user.userId,
      purchaseId,
      metadata: {
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      },
    });

    res.status(200).json({
      success: true,
      data: result.purchase,
      newAllowance: result.newAllowance,
      message: result.message,
    });
  }
);

/**
 * POST /admin/marketplace/slots/:id/reject
 * Reject a pending slot purchase proof with mandatory reason.
 */
export const rejectSlotProof = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user?.userId) {
      throw new AppError(401, 'Authentication required', 'UNAUTHORIZED');
    }

    const purchaseId = extractParam(req.params.id, 'id');
    const { reason } = rejectSlotProofSchema.parse(req.body);

    const result = await marketplaceSlotsService.rejectSlotProof({
      adminUserId: req.user.userId,
      purchaseId,
      reason,
      metadata: {
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      },
    });

    res.status(200).json({
      success: true,
      data: result.purchase,
      message: result.message,
    });
  }
);

/**
 * POST /admin/marketplace/slots/:id/refund
 * Refund an active slot purchase (credits merchant wallet & decrements allowance).
 * Blocked if allowance - slots < liveProducts with 409.
 */
export const refundSlotPurchase = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user?.userId) {
      throw new AppError(401, 'Authentication required', 'UNAUTHORIZED');
    }

    const purchaseId = extractParam(req.params.id, 'id');
    const { reason } = refundSlotPurchaseSchema.parse(req.body || {});

    const result = await marketplaceSlotsService.refundSlotPurchase({
      adminUserId: req.user.userId,
      purchaseId,
      reason,
      metadata: {
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      },
    });

    res.status(200).json({
      success: true,
      data: result.purchase,
      newAllowance: result.newAllowance,
      message: result.message,
    });
  }
);

export const marketplaceAdminController = {
  listQueue,
  approveProduct,
  rejectProduct,
  takedownProduct,
  sendBackProduct,
  listSlotPurchases,
  approveSlotProof,
  rejectSlotProof,
  refundSlotPurchase,
};
