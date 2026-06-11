import { Response } from 'express';
import { asyncHandler } from '@/middleware/errorHandler';
import { AuthenticatedRequest } from '@/types';
import * as dvaService from '@/services/dva.service';
import { validateCustomerSchema } from '@/validators/dva.validator';

export const setupVirtualAccount = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const result = await dvaService.setupVirtualAccount(
    req.user!.userId,
    req.params.businessId 
  );

  res.status(200).json({
    success: true,
    data: result,
    message: result.status === 'active'
      ? 'Virtual account created successfully'
      : 'Virtual account setup initiated',
  });
});

export const validateCustomer = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  // Zod throws on parse fail — the global error handler maps ZodError to a
  // 400 with field-level details. Replaces the previous ad-hoc BVN-only
  // check and now enforces the bank-account shape Paystack requires.
  const input = validateCustomerSchema.parse(req.body);

  const result = await dvaService.validateCustomer(
    req.user!.userId,
    req.params.businessId,
    input,
  );

  res.status(200).json({
    success: true,
    data: result,
    message: 'BVN validation submitted. This may take a few moments to process.',
  });
});

export const getVirtualAccount = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const result = await dvaService.getVirtualAccount(
    req.user!.userId,
    req.params.businessId
  );

  res.status(200).json({
    success: true,
    data: result,
  });
});



export const requery = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const result = await dvaService.requeryDVA(
    req.user!.userId,
    req.params.businessId
  );

  res.status(200).json({
    success: true,
    data: result,
    message: result.message,
  });
});
