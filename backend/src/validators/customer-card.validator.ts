import { z } from 'zod';
import { asNumber, asStringOptional } from './query.utils';

export const listCustomersQuerySchema = z.object({
  search: asStringOptional,
  page: asNumber({ min: 1, int: true }).default(1),
  limit: asNumber({ min: 1, max: 100, int: true }).default(20),
});

export const quickCreateCustomerSchema = z.object({
  name: z.string().trim().min(1, 'Customer name is required').max(200),
  phone: z.string().trim().min(7, 'Valid phone number is required').max(25),
  email: z.string().email('Invalid email address').max(200).optional().or(z.literal('')),
  address: z.string().max(300).trim().optional(),
  notes: z.string().max(500).trim().optional(),
});

export const topUpCardSchema = z.object({
  amount: z.number().positive('Top-up amount must be greater than 0').max(10_000_000),
  bonusPct: z.number().min(0).max(10).optional(),
  notes: z.string().max(500).trim().optional(),
  receiptDate: z.coerce.date().optional(),
});

export const changeCreditSchema = z.object({
  amount: z.number().positive('Change amount must be greater than 0').max(10_000_000),
  receiptNumber: z.string().max(100).trim().optional(),
  linkedSaleId: z.string().uuid().optional(),
  notes: z.string().max(500).trim().optional(),
  receiptDate: z.coerce.date().optional(),
});

export const adjustCardSchema = z.object({
  amount: z.number().refine((val) => val !== 0, 'Adjustment amount cannot be zero'),
  reason: z.string().trim().min(1, 'Adjustment reason is required').max(500),
  receiptDate: z.coerce.date().optional(),
});

export const changeVoucherPinSchema = z.object({
  oldPin: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'PIN must be exactly 6 digits'),
  newPin: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'New PIN must be exactly 6 digits'),
  last4Phone: z
    .string()
    .trim()
    .regex(/^\d{4}$/, 'Last 4 digits of phone must be exactly 4 digits'),
});

export const voucherLookupSchema = z.object({
  pin: z.string().trim().regex(/^\d{6}$/, 'PIN must be exactly 6 digits'),
  last4: z.string().trim().regex(/^\d{4}$/, 'Last 4 digits must be exactly 4 digits'),
});

export const listCardActivityQuerySchema = z.object({
  search: asStringOptional,
  type: z.enum(['top_up', 'change_credit', 'sale_debit', 'adjustment']).optional(),
  customerId: asStringOptional,
  startDate: asStringOptional,
  endDate: asStringOptional,
  page: asNumber({ min: 1, int: true }).default(1),
  limit: asNumber({ min: 1, max: 100, int: true }).default(20),
});

export const businessVoucherBonusSchema = z.object({
  voucherBonusPct: z.number().min(0).max(10),
});

export const customerBonusSchema = z.object({
  voucherBonusPct: z.number().min(0).max(10).nullable(),
});

const emptyToUndef = (v: unknown) => (v === '' ? undefined : v);

export const updateCustomerSchema = z.object({
  name: z.preprocess(emptyToUndef, z.string().trim().min(1, 'Customer name cannot be empty').max(200).optional()),
  phone: z.preprocess(emptyToUndef, z.string().trim().min(7, 'Valid phone number is required').max(25).nullable().optional()),
  email: z.preprocess(emptyToUndef, z.string().trim().email('Invalid email address').max(200).nullable().optional()),
  address: z.preprocess(emptyToUndef, z.string().max(300).trim().nullable().optional()),
  city: z.preprocess(emptyToUndef, z.string().max(100).trim().nullable().optional()),
  state: z.preprocess(emptyToUndef, z.string().max(100).trim().nullable().optional()),
  taxId: z.preprocess(emptyToUndef, z.string().max(50).trim().nullable().optional()),
  notes: z.preprocess(emptyToUndef, z.string().max(500).trim().nullable().optional()),
  isActive: z.boolean().optional(),
  voucherBonusPct: z.number().min(0).max(10).nullable().optional(),
});

export const quickCreateCustomerWithVoucherSchema = z.object({
  name: z.string().trim().min(1, 'Customer name is required').max(200),
  phone: z.string().trim().min(1, 'Phone number is required').max(25),
  email: z.preprocess(emptyToUndef, z.string().trim().email('Invalid email address').max(200).nullable().optional()),
  address: z.preprocess(emptyToUndef, z.string().max(300).trim().nullable().optional()),
  notes: z.preprocess(emptyToUndef, z.string().max(500).trim().nullable().optional()),
  initialTopUpAmount: z.number().min(0, 'Top-up amount cannot be negative').max(10_000_000).optional(),
  bonusPct: z.number().min(0).max(10).optional(),
});

export const requestTopUpSchema = z.object({
  amount: z.number().positive('Top-up amount must be greater than 0').max(10_000_000),
  bonusPct: z.number().min(0).max(10).optional(),
  notes: z.string().max(500).trim().optional(),
  receiptDate: z.coerce.date().optional(),
});

export const requestAdjustmentSchema = z.object({
  amount: z
    .number()
    .refine((val) => val !== 0, 'Adjustment amount cannot be zero')
    .refine((val) => Math.abs(val) <= 10_000_000, 'Adjustment amount cannot exceed ₦10,000,000'),
  reason: z.string().trim().min(10, 'Adjustment reason must be at least 10 characters').max(500),
  receiptDate: z.coerce.date().optional(),
});

export const voucherRequestsQuerySchema = z.object({
  status: z.enum(['pending', 'awaiting_customer', 'verified', 'rejected', 'expired', 'applied']).optional(),
  kind: z.enum(['top_up', 'adjustment']).optional(),
  customerId: asStringOptional,
  search: asStringOptional,
  page: asNumber({ min: 1, int: true }).default(1),
  limit: asNumber({ min: 1, max: 100, int: true }).default(20),
});

export const updateVoucherAdjustmentThresholdSchema = z.object({
  threshold: z.number().min(0, 'Threshold cannot be negative').max(10_000_000, 'Threshold cannot exceed ₦10,000,000'),
});

export const createVoucherRequestSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('top_up'),
    customerId: z.string().uuid('Valid customer ID is required'),
    amount: z.number().positive('Top-up amount must be greater than 0').max(10_000_000),
    bonusPct: z.number().min(0).max(10).optional(),
    notes: z.string().max(500).trim().optional(),
    receiptDate: z.coerce.date().optional(),
  }),
  z.object({
    kind: z.literal('adjustment'),
    customerId: z.string().uuid('Valid customer ID is required'),
    amount: z
      .number()
      .refine((val) => val !== 0, 'Adjustment amount cannot be zero')
      .refine((val) => Math.abs(val) <= 10_000_000, 'Adjustment amount cannot exceed ₦10,000,000'),
    reason: z.string().trim().min(10, 'Adjustment reason must be at least 10 characters').max(500),
    receiptDate: z.coerce.date().optional(),
  }),
]);

export const rejectVoucherRequestSchema = z.object({
  reason: z.string().trim().min(1, 'Rejection reason is required').max(500),
});

export type CreateVoucherRequestInput = z.infer<typeof createVoucherRequestSchema>;
export type RejectVoucherRequestInput = z.infer<typeof rejectVoucherRequestSchema>;

/**
 * Query schema for customer history timeline.
 * Note: `type` is filtered in-memory after merging timeline items across
 * disparate tables (SalesTransaction, Invoice, CustomerCredit, CustomerCardLedger).
 */
export const customerHistoryQuerySchema = z.object({
  page: asNumber({ min: 1, int: true }).default(1),
  limit: asNumber({ min: 1, max: 100, int: true }).default(20),
  type: z.enum(['sale', 'invoice', 'credit', 'credit_payment', 'voucher']).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  search: asStringOptional,
});

export type ListCustomersQuery = z.infer<typeof listCustomersQuerySchema>;
export type QuickCreateCustomerInput = z.infer<typeof quickCreateCustomerSchema>;
export type QuickCreateCustomerWithVoucherInput = z.infer<typeof quickCreateCustomerWithVoucherSchema>;
export type TopUpCardInput = z.infer<typeof topUpCardSchema>;
export type RequestTopUpInput = z.infer<typeof requestTopUpSchema>;
export type ChangeCreditInput = z.infer<typeof changeCreditSchema>;
export type AdjustCardInput = z.infer<typeof adjustCardSchema>;
export type RequestAdjustmentInput = z.infer<typeof requestAdjustmentSchema>;
export type ChangeVoucherPinInput = z.infer<typeof changeVoucherPinSchema>;
export type VoucherLookupInput = z.infer<typeof voucherLookupSchema>;
export type ListCardActivityQuery = z.infer<typeof listCardActivityQuerySchema>;
export type BusinessVoucherBonusInput = z.infer<typeof businessVoucherBonusSchema>;
export type CustomerBonusInput = z.infer<typeof customerBonusSchema>;
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;
export type CustomerHistoryQuery = z.infer<typeof customerHistoryQuerySchema>;
export type VoucherRequestsQuery = z.infer<typeof voucherRequestsQuerySchema>;
export type UpdateVoucherAdjustmentThresholdInput = z.infer<typeof updateVoucherAdjustmentThresholdSchema>;

