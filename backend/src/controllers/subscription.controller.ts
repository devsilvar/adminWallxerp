import { Response } from 'express';
import { asyncHandler, AppError } from '@/middleware/errorHandler';
import { AuthenticatedRequest } from '@/types';
import * as subscriptionService from '@/services/subscription.service';
import * as authService from '@/services/auth/auth.service';

export const startTrial = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.userId;
  const result = await subscriptionService.startFreeTrial(userId);
  const user = await authService.getMe(userId);
  res.status(200).json({ success: true, data: { trialEndsAt: result.trialEndsAt, user }, message: 'Free trial activated' });
});

export const submitProof = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { name, email, phone, businessName, plan, amount, notes } = req.body || {};

  const file = req.file;
  if (!file) {
    throw new AppError(
      400,
      'Please upload a receipt screenshot or document as proof of payment',
      'PROOF_REQUIRED',
    );
  }

  const result = await subscriptionService.processPaymentProof({
    userId: req.user?.userId,
    businessId: (req.headers['x-business-id'] as string) || undefined,
    name: name ? String(name).trim() : undefined,
    email: email ? String(email).trim() : undefined,
    phone: phone ? String(phone).trim() : undefined,
    businessName: businessName ? String(businessName).trim() : undefined,
    plan: plan ? String(plan).trim() : 'Subscription Plan',
    amount: amount ? String(amount).trim() : '0',
    notes: notes ? String(notes).trim() : undefined,
    file: {
      originalname: file.originalname,
      buffer: file.buffer,
      mimetype: file.mimetype,
      size: file.size,
    },
  });

  res.status(200).json({
    success: true,
    data: {
      submissionId: result?.submissionId,
    },
    message:
      result?.message ||
      'Proof of payment submitted successfully. A confirmation email has been sent and our billing team will activate your subscription shortly.',
  });
});
