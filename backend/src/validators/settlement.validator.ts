import { z } from 'zod';

export const resolveSettlementSchema = z.object({
  accountNumber: z
    .string()
    .trim()
    .regex(/^\d{10}$/, 'Account number must be exactly 10 digits'),
  bankCode: z.string().trim().min(1, 'Bank code is required'),
});

export const connectSettlementSchema = z.object({
  accountNumber: z
    .string()
    .trim()
    .regex(/^\d{10}$/, 'Account number must be exactly 10 digits'),
  bankCode: z.string().trim().min(1, 'Bank code is required'),
  bankName: z.string().trim().min(1, 'Bank name is required'),
  pin: z
    .string()
    .regex(/^\d{4}$/, 'Transaction PIN must be exactly 4 digits')
    .optional(),
  stepUpToken: z.string().min(1, 'Step-up authorization token is required').optional(),
});

export const withdrawBalanceSchema = z
  .object({
    amount: z
      .number()
      .positive('Withdrawal amount must be greater than zero')
      .min(1000, 'Minimum withdrawal amount is ₦1,000.00'),
    pin: z
      .string()
      .regex(/^\d{4}$/, 'Transaction PIN must be exactly 4 digits')
      .optional(),
    stepUpToken: z.string().min(1, 'Step-up authorization token is required').optional(),
    narration: z.string().trim().max(100, 'Narration cannot exceed 100 characters').optional(),
  })
  .refine((data) => Boolean(data.pin || data.stepUpToken), {
    message: 'Either transaction PIN or step-up authorization token is required',
    path: ['pin'],
  });

export const advanceRequestSchema = z
  .object({
    amount: z
      .number()
      .positive('Advance amount must be greater than zero'),
    pin: z
      .string()
      .regex(/^\d{4}$/, 'Transaction PIN must be exactly 4 digits')
      .optional(),
    stepUpToken: z.string().min(1, 'Step-up authorization token is required').optional(),
    acceptCharge: z.boolean().refine((v) => v === true, {
      message: 'You must accept the advance fee',
    }),
    narration: z.string().trim().max(100, 'Narration cannot exceed 100 characters').optional(),
  })
  .refine((data) => Boolean(data.pin || data.stepUpToken), {
    message: 'Either transaction PIN or step-up authorization token is required',
    path: ['pin'],
  });

export const payoutHistoryQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(20),
  status: z.enum(['pending', 'processing', 'completed', 'failed']).optional(),
  search: z.string().trim().optional(),
});

export const toggleAutoPayoutSchema = z
  .object({
    enabled: z.boolean(),
    pin: z
      .string()
      .regex(/^\d{4}$/, 'Transaction PIN must be exactly 4 digits')
      .optional(),
    stepUpToken: z.string().min(1, 'Step-up authorization token is required').optional(),
  })
  .refine((data) => Boolean(data.pin || data.stepUpToken), {
    message: 'Either transaction PIN or step-up authorization token is required',
    path: ['pin'],
  });

export const rejectWithdrawalSchema = z.object({
  reason: z.string().trim().min(3, 'Rejection reason must be at least 3 characters').max(500, 'Rejection reason cannot exceed 500 characters'),
});

export type ResolveSettlementInput = z.infer<typeof resolveSettlementSchema>;
export type ConnectSettlementInput = z.infer<typeof connectSettlementSchema>;
export type WithdrawBalanceInput = z.infer<typeof withdrawBalanceSchema>;
export type AdvanceRequestInput = z.infer<typeof advanceRequestSchema>;
export type ToggleAutoPayoutInput = z.infer<typeof toggleAutoPayoutSchema>;
export type PayoutHistoryQueryInput = z.infer<typeof payoutHistoryQuerySchema>;
export type RejectWithdrawalInput = z.infer<typeof rejectWithdrawalSchema>;
