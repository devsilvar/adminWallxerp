import { Response } from 'express';
import { asyncHandler } from '@/middleware/errorHandler';
import { AuthenticatedRequest } from '@/types';
import { saveTaxProfileSchema } from '@/validators/tax-profile.validator';
import * as taxProfileService from '@/services/tax/tax-profile.service';

export const getTaxProfile = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.userId;
  const businessId = req.params.businessId;

  const profile = await taxProfileService.getTaxProfile(userId, businessId);

  res.status(200).json({
    success: true,
    data: profile,
  });
});

export const saveTaxProfile = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.userId;
  const businessId = req.params.businessId;
  const { answers } = saveTaxProfileSchema.parse(req.body);

  const { profile, config } = await taxProfileService.saveTaxProfile(
    userId,
    businessId,
    answers
  );

  res.status(200).json({
    success: true,
    data: {
      profile,
      config,
    },
    message: 'Tax profile saved successfully',
  });
});

export const deleteTaxProfile = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.userId;
  const businessId = req.params.businessId;

  await taxProfileService.deleteTaxProfile(userId, businessId);

  res.status(200).json({
    success: true,
    message: 'Tax profile deleted successfully',
  });
});

export const downloadObligationReportPdf = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.userId;
  const businessId = req.params.businessId;

  const pdfBuffer = await taxProfileService.getObligationReportPdf(userId, businessId);

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="tax-obligation-report-${businessId}.pdf"`);
  res.send(pdfBuffer);
});

export const getTaxPolicy = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.userId;
  const businessId = req.params.businessId;

  const policy = await taxProfileService.getTaxPolicy(userId, businessId);

  res.status(200).json({
    success: true,
    data: policy,
  });
});
