import { Response } from 'express';
import { asyncHandler } from '@/middleware/errorHandler';
import { AuthenticatedRequest } from '@/types';
import { createFeedbackSchema } from '@/validators/feedback.validator';
import * as feedbackService from '@/services/feedback.service';

export const submitFeedback = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const input = createFeedbackSchema.parse(req.body);
    const businessId = (req.headers['x-business-id'] as string) || undefined;
    const userId = req.user?.userId;

    const feedback = await feedbackService.submitFeedback(input, userId, businessId);

    res.status(201).json({
      success: true,
      data: feedback,
      message: 'Thank you for your valuable feedback!',
    });
  },
);

export const getPromptEligibility = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user?.userId;
    const force = req.query.force === 'true' || req.query.test === 'true';
    const targetDay = req.query.targetDay as string | undefined;

    const result = await feedbackService.checkPromptEligibility(userId, {
      force,
      targetDay,
    });

    res.status(200).json({
      success: true,
      data: result,
    });
  }
);

