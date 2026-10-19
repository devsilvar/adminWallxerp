import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { testDb, createTestUser, createTestBusiness } from '../helpers/test-db';
import * as expenseService from '../../src/services/expense/expense.service';
import {
  createExpenseSchema,
  updateExpenseSchema,
} from '../../src/validators/expense.validator';

describe('Expense Category Expansion & Deductibility Enforcement (CITA Compliance)', () => {
  let userId: string;
  let businessId: string;
  const createdExpenseIds: string[] = [];

  beforeAll(async () => {
    const user = await createTestUser(`expense-cat-${Date.now()}@test.com`);
    userId = user.id;

    const business = await createTestBusiness(userId, 'Expense Category Test SME');
    businessId = business.id;
  }, 60000);

  afterAll(async () => {
    try {
      if (createdExpenseIds.length > 0) {
        await testDb.expense.deleteMany({
          where: { id: { in: createdExpenseIds } },
        });
      }
      await testDb.businessMember.deleteMany({
        where: { businessId },
      });
      await testDb.business.deleteMany({
        where: { id: businessId },
      });
      await testDb.user.deleteMany({
        where: { id: userId },
      });
    } catch {
      // Ignore cleanup errors
    } finally {
      await testDb.$disconnect();
    }
  }, 60000);

  describe('Zod Validator Rules (CITA §27 & Taxonomy)', () => {
    test('createExpenseSchema REJECTS tax_permit when isDeductible is true', () => {
      const parsed = createExpenseSchema.safeParse({
        category: 'tax_permit',
        description: 'CAC annual returns fee',
        amount: 25000,
        expenseDate: '2026-10-01',
        isDeductible: true,
      });

      expect(parsed.success).toBe(false);
      if (!parsed.success) {
        const msg = parsed.error.issues[0]?.message;
        expect(msg).toContain('CITA §27(a)');
      }
    });

    test('createExpenseSchema ACCEPTS tax_permit when isDeductible is false', () => {
      const parsed = createExpenseSchema.safeParse({
        category: 'tax_permit',
        description: 'Lagos State business permit renewal',
        amount: 25000,
        expenseDate: '2026-10-01',
        isDeductible: false,
      });

      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.category).toBe('tax_permit');
        expect(parsed.data.isDeductible).toBe(false);
      }
    });

    test('createExpenseSchema REQUIRES categoryDetail when category is "other"', () => {
      const invalid = createExpenseSchema.safeParse({
        category: 'other',
        description: 'Miscellaneous item',
        amount: 5000,
        expenseDate: '2026-10-01',
      });
      expect(invalid.success).toBe(false);
      if (!invalid.success) {
        expect(invalid.error.issues.some((i) => i.path.includes('categoryDetail'))).toBe(true);
      }

      const valid = createExpenseSchema.safeParse({
        category: 'other',
        categoryDetail: 'Office flowers and refreshments',
        description: 'Miscellaneous item',
        amount: 5000,
        expenseDate: '2026-10-01',
        isDeductible: false,
      });
      expect(valid.success).toBe(true);
    });

    test('createExpenseSchema ACCEPTS categoryDetail: null and receiptUrl: null for non-other categories', () => {
      const parsed = createExpenseSchema.safeParse({
        category: 'rent',
        categoryDetail: null,
        description: 'Office rent payment',
        amount: 250000,
        expenseDate: '2026-10-01',
        receiptUrl: null,
        isDeductible: true,
      });

      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.category).toBe('rent');
        expect(parsed.data.categoryDetail).toBeNull();
        expect(parsed.data.receiptUrl).toBeNull();
      }
    });

    test('updateExpenseSchema REJECTS updating tax_permit to isDeductible=true', () => {
      const parsed = updateExpenseSchema.safeParse({
        category: 'tax_permit',
        isDeductible: true,
      });

      expect(parsed.success).toBe(false);
      if (!parsed.success) {
        const msg = parsed.error.issues[0]?.message;
        expect(msg).toContain('CITA §27(a)');
      }
    });

    test('All new categories pass schema validation', () => {
      const newCategories = [
        'bank_charges',
        'communication',
        'depreciation',
        'gift',
        'insurance',
        'interest',
        'office_supplies',
        'professional_fees',
        'repairs_maintenance',
        'subscription',
        'travel',
      ];

      for (const cat of newCategories) {
        const parsed = createExpenseSchema.safeParse({
          category: cat,
          description: `Test ${cat} expenditure`,
          amount: 15000,
          expenseDate: '2026-10-01',
        });
        expect(parsed.success).toBe(true);
      }
    });
  });

  describe('Service Layer Deductibility Enforcement & Persistence', () => {
    test('createExpense persists tax_permit with isDeductible=false', async () => {
      const exp = await expenseService.createExpense(userId, businessId, {
        category: 'tax_permit',
        description: 'Local Government trade license fee',
        amount: 30000,
        expenseDate: new Date('2026-10-02'),
        isDeductible: false,
      });

      createdExpenseIds.push(exp.id);
      expect(exp.category).toBe('tax_permit');
      expect(exp.isDeductible).toBe(false);

      const dbRow = await testDb.expense.findUnique({ where: { id: exp.id } });
      expect(dbRow?.isDeductible).toBe(false);
    });

    test('createExpense sets always-deductible categories to isDeductible=true', async () => {
      const alwaysDeductibleList: Array<'subscription' | 'insurance' | 'professional_fees' | 'bank_charges'> = [
        'subscription',
        'insurance',
        'professional_fees',
        'bank_charges',
      ];

      for (const cat of alwaysDeductibleList) {
        const exp = await expenseService.createExpense(userId, businessId, {
          category: cat,
          description: `Expenditure for ${cat}`,
          amount: 20000,
          expenseDate: new Date('2026-10-03'),
        });
        createdExpenseIds.push(exp.id);

        expect(exp.category).toBe(cat);
        expect(exp.isDeductible).toBe(true);
      }
    });

    test('createExpense respects user choice on conditional categories (e.g. gift non-deductible)', async () => {
      const nonDeductibleGift = await expenseService.createExpense(userId, businessId, {
        category: 'gift',
        description: 'Lavish personal gift to VIP partner exceeding CITA threshold',
        amount: 600000,
        expenseDate: new Date('2026-10-04'),
        isDeductible: false,
      });
      createdExpenseIds.push(nonDeductibleGift.id);
      expect(nonDeductibleGift.category).toBe('gift');
      expect(nonDeductibleGift.isDeductible).toBe(false);

      const deductibleGift = await expenseService.createExpense(userId, businessId, {
        category: 'gift',
        description: 'Branded promotional notebooks for general public',
        amount: 25000,
        expenseDate: new Date('2026-10-04'),
        isDeductible: true,
      });
      createdExpenseIds.push(deductibleGift.id);
      expect(deductibleGift.category).toBe('gift');
      expect(deductibleGift.isDeductible).toBe(true);
    });

    test('updateExpense switching to tax_permit forces isDeductible=false', async () => {
      const exp = await expenseService.createExpense(userId, businessId, {
        category: 'subscription',
        description: 'Misclassified software fee',
        amount: 15000,
        expenseDate: new Date('2026-10-05'),
        isDeductible: true,
      });
      createdExpenseIds.push(exp.id);

      const updated = await expenseService.updateExpense(userId, businessId, exp.id, {
        category: 'tax_permit',
        description: 'Reclassified to FIRS administrative fee',
      });

      expect(updated.category).toBe('tax_permit');
      expect(updated.isDeductible).toBe(false);

      const dbRow = await testDb.expense.findUnique({ where: { id: exp.id } });
      expect(dbRow?.isDeductible).toBe(false);
    });
  });

  describe('Monthly & Daily Summary Aggregations with New Categories', () => {
    test('getMonthlySummary correctly computes category breakdown and totals', async () => {
      const summary = await expenseService.getMonthlySummary(userId, businessId, 10, 2026);

      expect(summary.month).toBe(10);
      expect(summary.year).toBe(2026);
      expect(summary.categoryBreakdown.length).toBeGreaterThanOrEqual(3);

      const categoriesPresent = summary.categoryBreakdown.map((cb) => cb.category);
      expect(categoriesPresent).toContain('tax_permit');
      expect(categoriesPresent).toContain('subscription');
      expect(categoriesPresent).toContain('gift');
    });

    test('getDailySummary reflects transactions and categories', async () => {
      const daily = await expenseService.getDailySummary(userId, businessId, '2026-10-04');

      expect(daily.date).toBe('2026-10-04');
      expect(daily.transactions.length).toBe(2); // The 2 gift transactions created on 2026-10-04
      expect(daily.categoryBreakdown.some((cb) => cb.category === 'gift')).toBe(true);
    });
  });
});
