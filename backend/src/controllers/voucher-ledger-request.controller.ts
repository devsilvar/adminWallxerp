import { Response } from 'express';
import { asyncHandler, AppError } from '@/middleware/errorHandler';
import { AuthenticatedRequest } from '@/types';
import { voucherLedgerRequestService } from '@/services/voucher-ledger-request.service';
import {
  requestTopUpSchema,
  requestAdjustmentSchema,
  voucherRequestsQuerySchema,
  createVoucherRequestSchema,
  rejectVoucherRequestSchema,
} from '@/validators/customer-card.validator';
import { z } from 'zod';

export const create = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const data = createVoucherRequestSchema.parse(req.body);

    if (data.kind === 'top_up') {
      const result = await voucherLedgerRequestService.createTopUpRequest(
        req.user!.userId,
        req.params.businessId,
        data.customerId,
        {
          amount: data.amount,
          bonusPct: data.bonusPct,
          notes: data.notes,
          receiptDate: data.receiptDate,
        }
      );
      res.status(201).json({
        success: true,
        data: result,
        status: result.status,
        message: 'Top-up request created',
      });
      return;
    }

    if (data.kind === 'adjustment') {
      const result = await voucherLedgerRequestService.createAdjustmentRequest(
        req.user!.userId,
        req.params.businessId,
        data.customerId,
        {
          amount: data.amount,
          reason: data.reason,
          receiptDate: data.receiptDate,
        }
      );
      res.status(201).json({
        success: true,
        data: result,
        status: result.status,
        message: 'Adjustment request created',
      });
      return;
    }

    throw new AppError(400, 'Invalid request kind', 'INVALID_KIND');
  }
);

export const createTopUp = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const { customerId } = z.object({ customerId: z.string().uuid() }).parse(req.body);
    const data = requestTopUpSchema.parse(req.body);
    const result = await voucherLedgerRequestService.createTopUpRequest(
      req.user!.userId,
      req.params.businessId,
      customerId,
      data
    );
    res.status(201).json({
      success: true,
      data: result,
      status: result.status,
      message: 'Top-up request created',
    });
  }
);

export const createAdjustment = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const { customerId } = z.object({ customerId: z.string().uuid() }).parse(req.body);
    const data = requestAdjustmentSchema.parse(req.body);
    const result = await voucherLedgerRequestService.createAdjustmentRequest(
      req.user!.userId,
      req.params.businessId,
      customerId,
      data
    );
    res.status(201).json({
      success: true,
      data: result,
      status: result.status,
      message: 'Adjustment request created',
    });
  }
);

export const list = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const query = voucherRequestsQuerySchema.parse(req.query);
    const result = await voucherLedgerRequestService.listRequests(
      req.user!.userId,
      req.params.businessId,
      query
    );
    res.status(200).json({
      success: true,
      ...result,
    });
  }
);

export const getById = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const result = await voucherLedgerRequestService.getRequest(
      req.user!.userId,
      req.params.businessId,
      req.params.id
    );
    res.status(200).json({
      success: true,
      data: result,
    });
  }
);

export const authorize = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const result = await voucherLedgerRequestService.authorizeRequest(
      req.user!.userId,
      req.params.businessId,
      req.params.id,
      req.body
    );
    res.status(200).json({
      success: true,
      ...result,
    });
  }
);

export const reject = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const data = rejectVoucherRequestSchema.parse(req.body);
    const result = await voucherLedgerRequestService.rejectRequest(
      req.user!.userId,
      req.params.businessId,
      req.params.id,
      data
    );
    res.status(200).json({
      success: true,
      data: result,
      message: 'Voucher request rejected',
    });
  }
);

export const resend = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const result = await voucherLedgerRequestService.resendVerification(
      req.user!.userId,
      req.params.businessId,
      req.params.id
    );
    res.status(200).json({
      success: true,
      ...result,
    });
  }
);
