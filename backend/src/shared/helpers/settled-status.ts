import { TransactionStatus } from '@prisma/client';

/**
 * Canonical settled sale status literals.
 *
 * Includes both 'confirmed' (canonical status for verified DVA transfers and standard sales)
 * and 'completed' (legacy status used in earlier schemas and specific checkout payments).
 */
export const SETTLED_SALE_STATUSES: TransactionStatus[] = ['confirmed', 'completed'];

/**
 * Canonical live sale status literals (excludes reversed and disputed sales).
 * Represents transactions that have arrived and not been cancelled or charged back.
 */
export const LIVE_SALE_STATUSES: TransactionStatus[] = ['pending', 'confirmed', 'completed'];

/**
 * Canonical WHERE predicate for taxable settled sales transactions.
 * Used across tax calculations and revenue analytics.
 */
export const TAXABLE_SALES_WHERE = {
  status: { in: SETTLED_SALE_STATUSES },
  isTaxable: true,
};
