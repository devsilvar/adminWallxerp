import { z } from 'zod';

export const createFeedbackSchema = z.object({
  rating: z.number().int().min(1, 'Rating must be at least 1 star').max(5, 'Rating cannot exceed 5 stars'),
  sentiment: z.enum(['positive', 'neutral', 'negative']).optional(),
  tags: z.array(z.string().trim().max(100)).default([]),
  comment: z.string().trim().max(2000, 'Comment cannot exceed 2000 characters').optional().nullable(),
  userName: z.string().trim().max(255).optional().nullable(),
  userEmail: z.string().trim().email('Invalid email address').optional().nullable(),
});

export type CreateFeedbackInput = z.infer<typeof createFeedbackSchema>;
