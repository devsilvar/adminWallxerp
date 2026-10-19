import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { testDb, clearDatabase, createTestUser, createTestBusiness } from '../helpers/test-db';
import { getDashboard } from '../../src/services/tax/tax-analytics.service';
import { toNumber } from '../../src/shared/helpers';

jest.setTimeout(60000);

describe('Dashboard Numbers Integration Suite', () => {
  let user: any;
  let emptyBiz: any;
  let liveBiz: any;
  let reportsBiz: any;

  beforeAll(async () => {
    await clearDatabase();

    user = await createTestUser(`dash-nums-${Date.now()}@example.com`);
    emptyBiz = await createTestBusiness(user.id, 'Empty Dashboard Biz');
    liveBiz = await createTestBusiness(user.id, 'Live Preview Biz');
    reportsBiz = await createTestBusiness(user.id, 'Report Spread Biz');

    const now = new Date();
    const currentMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const currentMidMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 15));

    // ── Fixtures for liveBiz ──
    // 1. Settled taxable sale in current month (included)
    await testDb.salesTransaction.create({
      data: {
        businessId: liveBiz.id,
        amount: 100000,
        source: 'pos',
        status: 'confirmed',
        isTaxable: true,
        transactionDate: currentMidMonth,
        description: 'Settled taxable sale',
      },
    });

    // 2. Non-taxable sale in current month (excluded)
    await testDb.salesTransaction.create({
      data: {
        businessId: liveBiz.id,
        amount: 20000,
        source: 'pos',
        status: 'confirmed',
        isTaxable: false,
        transactionDate: currentMidMonth,
        description: 'Non-taxable sale',
      },
    });

    // 3. Pending sale in current month (excluded)
    await testDb.salesTransaction.create({
      data: {
        businessId: liveBiz.id,
        amount: 30000,
        source: 'pos',
        status: 'pending',
        isTaxable: true,
        transactionDate: currentMidMonth,
        description: 'Pending sale',
      },
    });

    // 4. Deductible expense in current month (included)
    await testDb.expense.create({
      data: {
        businessId: liveBiz.id,
        amount: 40000,
        category: 'rent',
        isDeductible: true,
        expenseDate: currentMidMonth,
        description: 'Deductible office rent',
      },
    });

    // 5. Non-deductible expense in current month (excluded)
    await testDb.expense.create({
      data: {
        businessId: liveBiz.id,
        amount: 10000,
        category: 'other',
        isDeductible: false,
        expenseDate: currentMidMonth,
        description: 'Non-deductible expense',
      },
    });

    // ── Fixtures for reportsBiz ──
    const m1 = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    const m2 = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 2, 1));

    // Prior month 2 (2 months ago): finalized & paid (locked)
    await testDb.monthlyTaxReport.create({
      data: {
        businessId: reportsBiz.id,
        taxMonth: m2,
        totalSales: 200000,
        totalExpenses: 80000,
        grossProfit: 120000,
        taxPayable: 9000,
        taxRate: 7.5,
        profitMargin: 60,
        paymentStatus: 'completed',
        isFinalized: true,
        isLocked: true,
        lockedAt: m2,
        isNilReturn: false,
      },
    });

    // Prior month 1 (1 month ago): finalized & pending (unpaid)
    await testDb.monthlyTaxReport.create({
      data: {
        businessId: reportsBiz.id,
        taxMonth: m1,
        totalSales: 150000,
        totalExpenses: 50000,
        grossProfit: 100000,
        taxPayable: 7500,
        taxRate: 7.5,
        profitMargin: 66.67,
        paymentStatus: 'pending',
        isFinalized: true,
        isLocked: false,
        lockedAt: null,
        isNilReturn: false,
      },
    });

    // Current month report: draft, pending
    await testDb.monthlyTaxReport.create({
      data: {
        businessId: reportsBiz.id,
        taxMonth: currentMonthStart,
        totalSales: 80000,
        totalExpenses: 20000,
        grossProfit: 60000,
        taxPayable: 4500,
        taxRate: 7.5,
        profitMargin: 75,
        paymentStatus: 'pending',
        isFinalized: false,
        isLocked: false,
        lockedAt: null,
        isNilReturn: false,
      },
    });
  }, 90000);

  afterAll(async () => {
    await clearDatabase();
    await testDb.$disconnect();
  }, 90000);

  test('1. Zero-row business returns null currentMonth and zeroed metrics', async () => {
    const dash = await getDashboard(user.id, emptyBiz.id, 6);

    expect(dash.currentMonth).toBeNull();
    expect(dash.lifetime.totalSales).toBe(0);
    expect(dash.lifetime.totalExpenses).toBe(0);
    expect(dash.lifetime.totalTaxPayable).toBe(0);
    expect(dash.lifetime.reportsCount).toBe(0);
    expect(dash.unpaidCount).toBe(0);
    expect(dash.trends).toHaveLength(0);
  });

  test('2. Live preview branch generates live preview with F4 regression fields intact', async () => {
    const dash = await getDashboard(user.id, liveBiz.id, 6);

    expect(dash.currentMonth).not.toBeNull();
    const curr = dash.currentMonth!;

    // F4 regression guard: id, lockedAt, isNilReturn defined
    expect(curr.id).toBe('live-preview');
    expect(curr.lockedAt).toBeNull();
    expect(curr.isNilReturn).toBe(false);

    // Sum verification: non-taxable sale and non-deductible expense excluded
    expect(toNumber(curr.totalSales)).toBe(100000);
    expect(toNumber(curr.totalExpenses)).toBe(40000);
    expect(toNumber(curr.grossProfit)).toBe(60000);
    expect(toNumber(curr.taxPayable)).toBe(4500); // 7.5% of 60,000

    expect(dash.lifetime.totalSales).toBe(100000);
    expect(dash.lifetime.totalExpenses).toBe(40000);
    expect(dash.lifetime.totalTaxPayable).toBe(0); // No stored reports
    expect(dash.lifetime.reportsCount).toBe(0);
    expect(dash.unpaidCount).toBe(0);
    expect(dash.trends).toHaveLength(0);
  });

  test('3. Stored reports branch preserves F4 regression fields, sums lifetime, and computes unpaidCount', async () => {
    const dash = await getDashboard(user.id, reportsBiz.id, 6);

    expect(dash.currentMonth).not.toBeNull();
    const curr = dash.currentMonth!;

    // F4 regression guard: id, lockedAt, isNilReturn defined on spread branch too
    expect(curr.id).toBeDefined();
    expect(curr.id).not.toBe('live-preview');
    expect(curr.lockedAt).toBeNull();
    expect(curr.isNilReturn).toBe(false);

    // Lifetime report counts and tax payable sum (9000 + 7500 + 4500 = 21000)
    expect(dash.lifetime.reportsCount).toBe(3);
    expect(dash.lifetime.totalTaxPayable).toBe(21000);

    // Unpaid finalized reports count = 1 (month m1 is finalized and pending)
    expect(dash.unpaidCount).toBe(1);

    // Trends verification: 3 reports in asc chronological order
    expect(dash.trends).toHaveLength(3);
    const m2Time = dash.trends[0].taxMonth.getTime();
    const m1Time = dash.trends[1].taxMonth.getTime();
    const currTime = dash.trends[2].taxMonth.getTime();
    expect(m2Time).toBeLessThan(m1Time);
    expect(m1Time).toBeLessThan(currTime);
  });
});
