import { z } from 'zod';
import { asNumber } from './query.utils';

const EXPENSE_CATEGORIES = [
  'bad_debt',
  'bank_charges',
  'communication',
  'depreciation',
  'fuel',
  'gift',
  'insurance',
  'interest',
  'inventory',
  'logistics',
  'marketing',
  'office_supplies',
  'other',
  'professional_fees',
  'rent',
  'repairs_maintenance',
  'salary',
  'subscription',
  'tax_permit',
  'travel',
  'utility',
] as const;

export const createExpenseSchema = z.object({
  category: z.enum(EXPENSE_CATEGORIES),
  categoryDetail: z.string().max(200).trim().nullable().optional(),
  description: z.string().min(1, 'Description is required').max(500).trim(),
  amount: z.number().positive('Amount must be greater than 0'),
  quantity: z.number().positive('Quantity must be greater than 0').max(100_000).nullable().optional(),
  expenseDate: z.coerce.date(),
  receiptUrl: z.string().url('Must be a valid URL').max(1000).trim().nullable().optional(),
  isDeductible: z.boolean().optional().default(true),
}).superRefine((data, ctx) => {
  // Enforce non-deductibility for government taxes/permits (CITA §27)
  if (data.category === 'tax_permit' && data.isDeductible === true) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['isDeductible'],
      message: 'Government taxes and permits are not tax-deductible per CITA §27(a). Set isDeductible to false.',
    });
  }
  
  // Require categoryDetail for 'other' category (existing rule)
  if (data.category === 'other' && !data.categoryDetail?.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['categoryDetail'],
      message: 'categoryDetail is required when category is "other"',
    });
  }
});

export const updateExpenseSchema = z.object({
  category: z.enum(EXPENSE_CATEGORIES).optional(),
  categoryDetail: z.string().max(200).trim().nullable().optional(),
  description: z.string().min(1).max(500).trim().optional(),
  amount: z.number().positive('Amount must be greater than 0').optional(),
  quantity: z.number().positive('Quantity must be greater than 0').max(100_000).nullable().optional(),
  expenseDate: z.coerce.date().optional(),
  receiptUrl: z.string().url('Must be a valid URL').max(1000).trim().nullable().optional(),
  isDeductible: z.boolean().optional(),
}).superRefine((data, ctx) => {
  // Enforce non-deductibility for government taxes/permits (CITA §27)
  if (data.category === 'tax_permit' && data.isDeductible === true) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['isDeductible'],
      message: 'Government taxes and permits are not tax-deductible per CITA §27(a).',
    });
  }
});

export const expenseQuerySchema = z.object({
  page: asNumber({ min: 1, int: true }).default(1),
  limit: asNumber({ min: 1, max: 100, int: true }).default(20),
  category: z.enum(EXPENSE_CATEGORIES).optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  month: asNumber({ min: 1, max: 12, int: true }).optional(),
  year: asNumber({ min: 2020, max: 2100, int: true }).optional(),
});

export const expenseSummaryQuerySchema = z.object({
  month: asNumber({ min: 1, max: 12, int: true }),
  year: asNumber({ min: 2020, max: 2100, int: true }),
});

export const expenseDailyQuerySchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be in YYYY-MM-DD format')
    .optional(),
});

export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;
export type UpdateExpenseInput = z.infer<typeof updateExpenseSchema>;
export type ExpenseQueryInput = z.infer<typeof expenseQuerySchema>;
export type ExpenseSummaryQueryInput = z.infer<typeof expenseSummaryQuerySchema>;