import { describe, test, expect } from '@jest/globals';
import {
  createSaleSchema,
  updateSaleSchema,
  salesQuerySchema,
  SALES_SOURCES,
} from '../../src/validators/sales.validator';

describe('Sales Sources & Query Validator Suite (Phase 2)', () => {
  const baseSale = {
    amount: 15000,
    transactionDate: '2026-03-25',
  };

  describe('createSaleSchema source validation', () => {
    test('accepts store_voucher as a valid sales source', () => {
      const result = createSaleSchema.safeParse({
        ...baseSale,
        source: 'store_voucher',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.source).toBe('store_voucher');
      }
    });

    test('accepts credit as a valid sales source', () => {
      const result = createSaleSchema.safeParse({
        ...baseSale,
        source: 'credit',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.source).toBe('credit');
      }
    });

    test('accepts all canonical SALES_SOURCES', () => {
      for (const source of SALES_SOURCES) {
        const result = createSaleSchema.safeParse({
          ...baseSale,
          source,
        });
        expect(result.success).toBe(true);
      }
    });

    test('rejects unapproved source', () => {
      const result = createSaleSchema.safeParse({
        ...baseSale,
        source: 'cryptocurrency',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some((i) => i.path.includes('source'))).toBe(true);
      }
    });
  });

  describe('updateSaleSchema source validation', () => {
    test('accepts store_voucher in update payload', () => {
      const result = updateSaleSchema.safeParse({
        source: 'store_voucher',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.source).toBe('store_voucher');
      }
    });

    test('accepts credit in update payload', () => {
      const result = updateSaleSchema.safeParse({
        source: 'credit',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.source).toBe('credit');
      }
    });
  });

  describe('salesQuerySchema query filters', () => {
    test('parses search, minAmount, maxAmount, and store_voucher source', () => {
      const result = salesQuerySchema.safeParse({
        search: 'Jane Doe',
        minAmount: '5000',
        maxAmount: '25000',
        source: 'store_voucher',
        page: '2',
        limit: '15',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.search).toBe('Jane Doe');
        expect(result.data.minAmount).toBe(5000);
        expect(result.data.maxAmount).toBe(25000);
        expect(result.data.source).toBe('store_voucher');
        expect(result.data.page).toBe(2);
        expect(result.data.limit).toBe(15);
      }
    });

    test('rejects negative minAmount', () => {
      const result = salesQuerySchema.safeParse({
        minAmount: '-100',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some((i) => i.path.includes('minAmount'))).toBe(true);
      }
    });
  });

  describe('isAccrualLinked accrual detection (Phase 3)', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { isAccrualLinked } = require('../../src/shared/helpers/accrual');

    test('flags store_voucher sales as accrual-linked', () => {
      expect(isAccrualLinked({ source: 'store_voucher' })).toBe(true);
    });

    test('flags sales with customerId as accrual-linked', () => {
      expect(isAccrualLinked({ source: 'cash', customerId: 'cust-123' })).toBe(true);
    });

    test('does not flag standard unlinked cash/transfer sales', () => {
      expect(isAccrualLinked({ source: 'cash', customerId: null })).toBe(false);
      expect(isAccrualLinked({ source: 'bank_transfer' })).toBe(false);
    });
  });
});
