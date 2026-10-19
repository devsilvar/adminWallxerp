import { z } from 'zod';
import { asNumber, asNumberOptional, asStringOptional } from './query.utils';

export const saleLineItemSchema = z.object({
  name: z.string().trim().min(1, 'Item name is required').max(200),
  quantity: z.number().positive('Quantity must be greater than 0').max(100_000),
  unitPrice: z.number().nonnegative('Unit price must be non-negative').max(1e13),
});

export const SALES_SOURCES = [
  'bank_transfer',
  'paycode',
  'pos',
  'online_store',
  'manual',
  'cash',
  'invoice',
  'credit',
  'store_voucher',
] as const;

export const salesSourceSchema = z.enum(SALES_SOURCES);

export const createSaleSchema = z
  .object({
    amount: z.number().positive('Amount must be greater than 0').optional(),
    items: z.array(saleLineItemSchema).max(50).optional(),
    source: salesSourceSchema,
    // 'confirmed' is the canonical settled status; 'completed' remains accepted
    // for backward compatibility with legacy clients/rows.
    status: z.enum(['confirmed', 'completed', 'pending', 'reversed', 'disputed']).optional(),
    referenceId: z.string().max(200).trim().optional(),
    description: z.string().max(500).trim().optional(),
    customerName: z.string().max(200).trim().optional(),
    customerId: z.string().uuid().optional(),
    transactionDate: z.coerce.date(),
    metadata: z.any().optional(),
    needsVerification: z.boolean().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.items !== undefined) {
      if (data.items.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Items array must contain at least 1 item when provided',
          path: ['items'],
        });
      }
    } else {
      if (data.amount === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Amount is required when items are not provided',
          path: ['amount'],
        });
      }
    }

    // Validate voucher payment requires PIN and last-4 phone in metadata
    if (data.source === 'store_voucher' && data.metadata) {
      if (!data.metadata.voucherCustomerId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'voucherCustomerId is required in metadata for store voucher payments',
          path: ['metadata', 'voucherCustomerId'],
        });
      }

      const voucherPin = data.metadata.voucherPin?.toString().trim();
      const voucherLast4 = data.metadata.voucherLast4?.toString().trim();

      if (!voucherPin || !/^\d{6}$/.test(voucherPin)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'voucherPin must be exactly 6 digits in metadata for store voucher payments',
          path: ['metadata', 'voucherPin'],
        });
      }

      if (!voucherLast4 || !/^\d{4}$/.test(voucherLast4)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'voucherLast4 must be exactly 4 digits in metadata for store voucher payments',
          path: ['metadata', 'voucherLast4'],
        });
      }
    }
  });

export const updateSaleSchema = z
  .object({
    amount: z.number().positive('Amount must be greater than 0').optional(),
    items: z.array(saleLineItemSchema).max(50).optional(),
    source: salesSourceSchema.optional(),
    status: z.enum(['confirmed', 'completed', 'pending', 'reversed', 'disputed']).optional(),
    referenceId: z.string().max(200).trim().optional(),
    description: z.string().max(500).trim().optional(),
    customerName: z.string().max(200).trim().optional(),
    customerId: z.string().uuid().optional(),
    transactionDate: z.coerce.date().optional(),
    metadata: z.any().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.items !== undefined && data.items.length === 0 && data.amount === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Amount is required when clearing items',
        path: ['amount'],
      });
    }
  });

export const salesQuerySchema = z.object({
  page: asNumber({ min: 1, int: true }).default(1),
  limit: asNumber({ min: 1, max: 100, int: true }).default(20),
  source: salesSourceSchema.optional(),
  status: z.enum(['confirmed', 'completed', 'pending', 'reversed', 'disputed']).optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  month: asNumber({ min: 1, max: 12, int: true }).optional(),
  year: asNumber({ min: 2020, max: 2100, int: true }).optional(),
  search: asStringOptional,
  customerId: z.string().uuid().optional(),
  minAmount: asNumberOptional({ min: 0 }),
  maxAmount: asNumberOptional({ min: 0 }),
});

export const salesSummaryQuerySchema = z.object({
  month: asNumber({ min: 1, max: 12, int: true }),
  year: asNumber({ min: 2020, max: 2100, int: true }),
});

export const salesDailyQuerySchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be in YYYY-MM-DD format')
    .optional(),
});

export const salesOverviewQuerySchema = z.object({
  period: z.enum(['7d', '30d', '3m', '6m', '12m', 'ytd', 'all', 'custom']).default('12m'),
  from: asStringOptional,
  to: asStringOptional,
  granularity: z.enum(['day', 'month', 'auto']).default('auto'),
});


export type SaleLineItemInput = z.infer<typeof saleLineItemSchema>;
export type CreateSaleInput = z.infer<typeof createSaleSchema>;
export type UpdateSaleInput = z.infer<typeof updateSaleSchema>;
export type SalesQueryInput = z.infer<typeof salesQuerySchema>;
export type SalesSummaryQueryInput = z.infer<typeof salesSummaryQuerySchema>;
export type SalesOverviewQueryInput = z.infer<typeof salesOverviewQuerySchema>;