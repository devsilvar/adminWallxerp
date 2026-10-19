import { z } from 'zod';
import { asNumber, asStringOptional } from './query.utils';

export const paginationSchema = z.object({
  page: asNumber({ min: 1, int: true }).default(1),
  limit: asNumber({ min: 1, max: 100, int: true }).default(20),
});

const asBooleanOptional = z.preprocess((val) => {
  const raw = Array.isArray(val) ? val[0] : val;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  if (raw === '' || raw === undefined) return undefined;
  return raw;
}, z.boolean().optional());

const asRoleOptional = z.preprocess((val) => {
  const raw = Array.isArray(val) ? val[0] : val;
  if (raw === '' || raw === undefined) return undefined;
  return raw;
}, z.enum(['user', 'admin']).optional());

export const userSearchSchema = paginationSchema.extend({
  search: asStringOptional,
  role: asRoleOptional,
  isActive: asBooleanOptional,
  isVerified: asBooleanOptional,
});

export const toggleStatusSchema = z.object({
  isActive: z.boolean(),
  reason: z.string().max(500).trim().optional(),
});

export const verifyEmailSchema = z.object({
  isVerified: z.boolean(),
});

export const auditLogFilterSchema = paginationSchema.extend({
  userId: z.string().uuid().optional(),
  action: asStringOptional,
});

export const manualSettleWithdrawalSchema = z.object({
  sessionReference: z.string().trim().min(3, 'Transfer reference or session ID is required'),
  notes: asStringOptional,
});

export const updateFeeConfigSchema = z.object({
  withdrawalFeePct: z.number().min(0, 'Fee percentage cannot be negative').max(10, 'Fee percentage cannot exceed 10%'),
  withdrawalFeeCap: z.number().min(0, 'Fee cap cannot be negative').max(100000, 'Fee cap cannot exceed ₦100,000'),
  minWithdrawalAmount: z.number().min(100, 'Minimum floor must be at least ₦100').max(1000000, 'Minimum floor cannot exceed ₦1,000,000'),
});

export const updateTaxConfigSchema = z.object({
  autoFinalizeDay: z.number().int().min(1, 'Day must be between 1 and 28').max(28, 'Day must be between 1 and 28').optional(),
  autoFinalizeEnabled: z.boolean().optional(),
});

export const treasuryAnalyticsFilterSchema = paginationSchema.extend({
  type: z.enum(['all', 'inflow', 'outflow']).optional().default('all'),
  outcome: z.enum(['all', 'profit', 'loss']).optional().default('all'),
  search: asStringOptional,
});

export const adminTransactionsQuerySchema = paginationSchema.extend({
  source: z.enum(['all', 'inflow', 'withdrawal', 'tax']).optional().default('all'),
  from: asStringOptional, // YYYY-MM-DD (UTC day start)
  to: asStringOptional, // YYYY-MM-DD (UTC day end)
  search: asStringOptional, // business name or reference
});

export type AdminTransactionsQueryInput = z.infer<typeof adminTransactionsQuerySchema>;

export const updateAIConfigSchema = z.object({
  provider: z.string().trim().min(1, 'Provider identifier is required'),
  name: z.string().trim().min(1, 'Provider display name is required'),
  baseUrl: z.string().trim().url('A valid base URL is required'),
  apiKey: z.string().trim().optional(),
  model: z.string().trim().min(1, 'Model identifier is required'),
  temperature: z.number().min(0).max(2).optional().default(0.3),
  maxTokens: z.number().int().min(50).max(8192).optional().default(1024),
  isActive: z.boolean().optional().default(true),
});

export const testAIConfigSchema = z.object({
  provider: z.string().trim().optional(),
  baseUrl: z.string().trim().url('A valid base URL is required'),
  apiKey: z.string().trim().optional(),
  model: z.string().trim().min(1, 'Model identifier is required'),
});

export const listUnverifiedInflowsSchema = paginationSchema.extend({
  search: asStringOptional,
});

export const adminReassignSaleSchema = z.object({
  targetBusinessId: z.string().uuid('A valid target business ID is required'),
});

export const adminVerifySaleSchema = z.object({
  classificationName: z.string().trim().min(1, 'Classification name is required'),
  customerName: asStringOptional,
  description: asStringOptional,
  targetBusinessId: z.string().uuid().optional(),
});

export const listSubscriptionsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['pending', 'approved', 'rejected']).optional(),
  search: z.string().trim().optional(),
});

export const approveSubscriptionSchema = z.object({
  durationDays: z.coerce.number().int().positive().optional(),
  adminNotes: z.string().trim().optional(),
});

export const rejectSubscriptionSchema = z.object({
  reason: z.string().trim().min(3, 'Rejection reason must be at least 3 characters'),
});

export const listAdminReviewsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  rating: z.coerce.number().int().min(1).max(5).optional(),
  sentiment: z.enum(['positive', 'neutral', 'negative']).optional(),
  search: z.string().trim().optional(),
});

export const adminOverrideSubscriptionSchema = z.object({
  tier: z.enum(['free', 'starter', 'business', 'scale_up', 'scale']),
  durationDays: z.coerce.number().int().positive().nullable().optional(),
  customExpiresAt: z.coerce.date().optional(),
  resetTrial: z.boolean().optional(),
  confirmDowngrade: z.boolean().optional().default(false),
  reason: z.string().trim().min(3, 'Audit reason is required and must be at least 3 characters').max(500),
});

export type PaginationInput = z.infer<typeof paginationSchema>;
export type UserSearchInput = z.infer<typeof userSearchSchema>;
export type ToggleStatusInput = z.infer<typeof toggleStatusSchema>;
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;
export type AuditLogFilterInput = z.infer<typeof auditLogFilterSchema>;
export type ManualSettleWithdrawalInput = z.infer<typeof manualSettleWithdrawalSchema>;
export type UpdateFeeConfigInput = z.infer<typeof updateFeeConfigSchema>;
export type TreasuryAnalyticsFilterInput = z.infer<typeof treasuryAnalyticsFilterSchema>;
export type UpdateAIConfigInput = z.infer<typeof updateAIConfigSchema>;
export type TestAIConfigInput = z.infer<typeof testAIConfigSchema>;
export type ListUnverifiedInflowsInput = z.infer<typeof listUnverifiedInflowsSchema>;
export type AdminReassignSaleInput = z.infer<typeof adminReassignSaleSchema>;
export type AdminVerifySaleInput = z.infer<typeof adminVerifySaleSchema>;
export type ListSubscriptionsInput = z.infer<typeof listSubscriptionsSchema>;
export type ApproveSubscriptionInput = z.infer<typeof approveSubscriptionSchema>;
export type RejectSubscriptionInput = z.infer<typeof rejectSubscriptionSchema>;
export type ListAdminReviewsInput = z.infer<typeof listAdminReviewsSchema>;
export type AdminOverrideSubscriptionInput = z.infer<typeof adminOverrideSubscriptionSchema>;