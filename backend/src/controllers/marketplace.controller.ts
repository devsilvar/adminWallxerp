import { Response } from 'express';
import { asyncHandler, AppError } from '@/middleware/errorHandler';
import { AuthenticatedRequest } from '@/types';
import {
  createProductSchema,
  updateProductSchema,
  submitProductSchema,
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
 * POST /businesses/:businessId/marketplace
 * Create a new marketplace product (draft) within the 3-item active cap.
 */
export const createProduct = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user?.userId) {
      throw new AppError(401, 'Authentication required', 'UNAUTHORIZED');
    }

    const businessId = extractParam(req.params.businessId, 'businessId');
    const input = createProductSchema.parse(req.body);

    const product = await marketplaceService.createProduct(
      req.user.userId,
      businessId,
      input
    );

    res.status(201).json({
      success: true,
      data: product,
      message: 'Product created successfully',
    });
  }
);

/**
 * PATCH /businesses/:businessId/marketplace/:id
 * Update an existing product. Modifications to core fields on approved products
 * will demote them back to pending_approval (bait-and-switch protection).
 */
export const updateProduct = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user?.userId) {
      throw new AppError(401, 'Authentication required', 'UNAUTHORIZED');
    }

    const businessId = extractParam(req.params.businessId, 'businessId');
    const productId = extractParam(req.params.id, 'id');
    const input = updateProductSchema.parse(req.body);

    const product = await marketplaceService.updateProduct(
      req.user.userId,
      businessId,
      productId,
      input
    );

    res.status(200).json({
      success: true,
      data: product,
      message: 'Product updated successfully',
    });
  }
);

/**
 * POST /businesses/:businessId/marketplace/:id/submit
 * Submit a draft or rejected product for moderation approval.
 */
export const submitForApproval = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user?.userId) {
      throw new AppError(401, 'Authentication required', 'UNAUTHORIZED');
    }

    const businessId = extractParam(req.params.businessId, 'businessId');
    const productId = extractParam(req.params.id, 'id');
    submitProductSchema.parse(req.body || {});

    const product = await marketplaceService.submitForApproval(
      req.user.userId,
      businessId,
      productId
    );

    res.status(200).json({
      success: true,
      data: product,
      message: 'Product submitted for approval',
    });
  }
);

/**
 * POST /businesses/:businessId/marketplace/:id/archive
 * Archive a product, removing it from active listings and freeing a slot.
 */
export const archiveProduct = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user?.userId) {
      throw new AppError(401, 'Authentication required', 'UNAUTHORIZED');
    }

    const businessId = extractParam(req.params.businessId, 'businessId');
    const productId = extractParam(req.params.id, 'id');

    const product = await marketplaceService.archiveProduct(
      req.user.userId,
      businessId,
      productId
    );

    res.status(200).json({
      success: true,
      data: product,
      message: 'Product archived successfully',
    });
  }
);

/**
 * GET /businesses/:businessId/marketplace
 * List all products belonging to a business (including drafts/rejected/archived).
 */
export const listProducts = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user?.userId) {
      throw new AppError(401, 'Authentication required', 'UNAUTHORIZED');
    }

    const businessId = extractParam(req.params.businessId, 'businessId');
    const query = listProductsQuerySchema.parse(req.query);

    const result = await marketplaceService.listForBusiness(
      req.user.userId,
      businessId,
      query
    );

    res.status(200).json({
      success: true,
      data: result,
    });
  }
);

/**
 * GET /businesses/:businessId/marketplace/:id
 * Get a specific product detail for merchant administration.
 */
export const getProduct = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user?.userId) {
      throw new AppError(401, 'Authentication required', 'UNAUTHORIZED');
    }

    const businessId = extractParam(req.params.businessId, 'businessId');
    const productId = extractParam(req.params.id, 'id');

    const product = await marketplaceService.getProduct(
      req.user.userId,
      businessId,
      productId
    );

    res.status(200).json({
      success: true,
      data: product,
    });
  }
);


/**
 * POST /businesses/:businessId/marketplace/images
 * Upload a product image (JPEG, PNG, WebP up to 5MB) to Cloudinary.
 */
export const uploadProductImage = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user?.userId) {
      throw new AppError(401, 'Authentication required', 'UNAUTHORIZED');
    }

    const businessId = extractParam(req.params.businessId, 'businessId');
    const file = (req as any).file || (req as any).files?.file?.[0] || (req as any).files?.image?.[0];

    if (!file) {
      throw new AppError(400, 'No image file uploaded', 'NO_FILE_UPLOADED');
    }

    const result = await marketplaceService.uploadImage(
      req.user.userId,
      businessId,
      file
    );

    res.status(200).json({
      success: true,
      data: result,
      message: 'Product image uploaded successfully',
    });
  }
);

/**
 * DELETE /businesses/:businessId/marketplace/images
 * Delete an uploaded product image from Cloudinary by publicId.
 */
export const deleteProductImage = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user?.userId) {
      throw new AppError(401, 'Authentication required', 'UNAUTHORIZED');
    }

    const businessId = extractParam(req.params.businessId, 'businessId');
    const { publicId } = req.body || {};
    if (!publicId || typeof publicId !== 'string') {
      throw new AppError(400, 'publicId is required', 'INVALID_PARAM');
    }

    await marketplaceService.deleteImage(req.user.userId, businessId, publicId);

    res.status(200).json({
      success: true,
      message: 'Product image removed successfully',
    });
  }
);

export const marketplaceController = {
  createProduct,
  updateProduct,
  submitForApproval,
  archiveProduct,
  listProducts,
  getProduct,
  uploadProductImage,
  deleteProductImage,
};
