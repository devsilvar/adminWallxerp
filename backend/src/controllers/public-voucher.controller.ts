import { Request, Response, NextFunction } from 'express';
import { voucherVerificationService } from '@/services/voucher-verification.service';
import { AppError } from '@/middleware/errorHandler';

/**
 * Public controller for customer magic-link voucher verification
 */
export async function getVoucherVerifyPreview(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const rawId = req.params.id;
    const id = Array.isArray(rawId) ? rawId[0] : String(rawId);
    const token = typeof req.query.token === 'string' ? req.query.token.trim() : '';

    if (!token) {
      throw new AppError(400, 'Verification token is required', 'TOKEN_REQUIRED');
    }

    const preview = await voucherVerificationService.getPreview(id, token);
    res.json({
      success: true,
      data: preview,
    });
  } catch (err) {
    next(err);
  }
}

export async function confirmVoucherVerify(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const rawId = req.params.id;
    const id = Array.isArray(rawId) ? rawId[0] : String(rawId);
    const rawToken = req.body?.token ?? req.query?.token;
    const token = typeof rawToken === 'string' ? rawToken.trim() : '';

    if (!token) {
      throw new AppError(400, 'Verification token is required', 'TOKEN_REQUIRED');
    }

    const result = await voucherVerificationService.confirm(id, token);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export const publicVoucherController = {
  getVoucherVerifyPreview,
  confirmVoucherVerify,
};
