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

export type ListCustomersQuery = z.infer<typeof listCustomersQuerySchema>;
export type QuickCreateCustomerInput = z.infer<typeof quickCreateCustomerSchema>;
export type TopUpCardInput = z.infer<typeof topUpCardSchema>;
export type ChangeCreditInput = z.infer<typeof changeCreditSchema>;
export type AdjustCardInput = z.infer<typeof adjustCardSchema>;
export type ChangeVoucherPinInput = z.infer<typeof changeVoucherPinSchema>;
export type VoucherLookupInput = z.infer<typeof voucherLookupSchema>;
export type ListCardActivityQuery = z.infer<typeof listCardActivityQuerySchema>;
export type BusinessVoucherBonusInput = z.infer<typeof businessVoucherBonusSchema>;
export type CustomerBonusInput = z.infer<typeof customerBonusSchema>;
