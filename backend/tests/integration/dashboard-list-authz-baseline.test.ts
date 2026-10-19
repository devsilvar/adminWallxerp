import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { testDb, clearDatabase, createTestUser, createTestBusiness } from '../helpers/test-db';
import { listSales } from '../../src/services/sales.service';
import { listExpenses } from '../../src/services/expense.service';
import { getDashboardBundle } from '../../src/services/tax.service';
import { invalidateOwnershipCache } from '../../src/lib/ownership';

jest.setTimeout(60000);

describe('Dashboard List Authz Baseline Suite', () => {
  let owner: any;
  let staff: any;
  let viewer: any;
  let business: any;

  let ownerSale: any;
  let dvaSale: any;
  let staffSale: any;

  let ownerExpense: any;
  let nullCreatorExpense: any;
  let staffExpense: any;

  beforeAll(async () => {
    await clearDatabase();

    owner = await createTestUser(`dash-owner-${Date.now()}@example.com`);
    staff = await createTestUser(`dash-staff-${Date.now()}@example.com`);
    viewer = await createTestUser(`dash-viewer-${Date.now()}@example.com`);
    business = await createTestBusiness(owner.id, 'Authz Baseline Biz');

    // Add staff as sales_staff and viewer as viewer
    await testDb.businessMember.createMany({
      data: [
        { businessId: business.id, userId: staff.id, role: 'sales_staff', isActive: true },
        { businessId: business.id, userId: viewer.id, role: 'viewer', isActive: true },
      ],
    });

    invalidateOwnershipCache(business.id, owner.id);
    invalidateOwnershipCache(business.id, staff.id);
    invalidateOwnershipCache(business.id, viewer.id);

    const now = new Date();

    // ── Sales ──
    ownerSale = await testDb.salesTransaction.create({
      data: {
        businessId: business.id,
        amount: 50000,
        source: 'pos',
        status: 'confirmed',
        isTaxable: true,
        transactionDate: now,
        createdBy: owner.id,
        description: 'Owner created sale',
      },
    });

    dvaSale = await testDb.salesTransaction.create({
      data: {
        businessId: business.id,
        amount: 25000,
        source: 'bank_transfer',
        status: 'confirmed',
        isTaxable: true,
        dvaOrigin: true,
        transactionDate: now,
        createdBy: null,
        description: 'Auto-captured DVA sale',
      },
    });

    staffSale = await testDb.salesTransaction.create({
      data: {
        businessId: business.id,
        amount: 15000,
        source: 'pos',
        status: 'confirmed',
        isTaxable: true,
        transactionDate: now,
        createdBy: staff.id,
        description: 'Staff created sale',
      },
    });

    // ── Expenses ──
    ownerExpense = await testDb.expense.create({
      data: {
        businessId: business.id,
        amount: 30000,
        category: 'rent',
        isDeductible: true,
        expenseDate: now,
        createdBy: owner.id,
        description: 'Owner expense',
      },
    });

    nullCreatorExpense = await testDb.expense.create({
      data: {
        businessId: business.id,
        amount: 12000,
        category: 'utility',
        isDeductible: true,
        expenseDate: now,
        createdBy: null,
        description: 'Legacy unassigned expense',
      },
    });

    staffExpense = await testDb.expense.create({
      data: {
        businessId: business.id,
        amount: 8000,
        category: 'fuel',
        isDeductible: true,
        expenseDate: now,
        createdBy: staff.id,
        description: 'Staff expense',
      },
    });
  }, 90000);

  afterAll(async () => {
    await clearDatabase();
    await testDb.$disconnect();
  }, 90000);

  test('Owner sees all sales and all expenses in direct list calls', async () => {
    const sales = await listSales(owner.id, business.id, { page: 1, limit: 10 });
    const expenses = await listExpenses(owner.id, business.id, { page: 1, limit: 10 });

    const saleIds = sales.data.map((s: any) => s.id);
    expect(saleIds).toContain(ownerSale.id);
    expect(saleIds).toContain(dvaSale.id);
    expect(saleIds).toContain(staffSale.id);
    expect(sales.data.length).toBe(3);

    const expenseIds = expenses.data.map((e: any) => e.id);
    expect(expenseIds).toContain(ownerExpense.id);
    expect(expenseIds).toContain(nullCreatorExpense.id);
    expect(expenseIds).toContain(staffExpense.id);
    expect(expenses.data.length).toBe(3);
  });

  test('Sales staff default permissions: sales row-scoped, expenses blocked without override', async () => {
    // 1. Sales staff has sales.read by default -> sees own sale + DVA sale
    const sales = await listSales(staff.id, business.id, { page: 1, limit: 10 });
    const saleIds = sales.data.map((s: any) => s.id);
    expect(saleIds).toContain(staffSale.id);
    expect(saleIds).toContain(dvaSale.id);
    expect(saleIds).not.toContain(ownerSale.id);
    expect(sales.data.length).toBe(2);

    // 2. Sales staff does not have expenses.read by default -> 403
    await expect(listExpenses(staff.id, business.id, { page: 1, limit: 10 }))
      .rejects.toThrow('You do not have permission to perform this action (requires expenses.read)');
  });

  test('Sales staff with expenses.read override: row-scopes expenses (own + null-createdBy legacy)', async () => {
    // Grant sales_staff expenses.read override
    await testDb.businessMember.update({
      where: { businessId_userId: { businessId: business.id, userId: staff.id } },
      data: { permissions: { 'expenses.read': true } },
    });
    invalidateOwnershipCache(business.id, staff.id);

    const expenses = await listExpenses(staff.id, business.id, { page: 1, limit: 10 });
    const expenseIds = expenses.data.map((e: any) => e.id);
    expect(expenseIds).toContain(staffExpense.id);
    expect(expenseIds).toContain(nullCreatorExpense.id);
    expect(expenseIds).not.toContain(ownerExpense.id);
    expect(expenses.data.length).toBe(2);
  });

  test('Step 4 verification: getDashboardBundle matches baseline list rows and respects permission omissions', async () => {
    // 1. Owner bundle matches direct listSales and listExpenses rows
    const directOwnerSales = await listSales(owner.id, business.id, { page: 1, limit: 5 });
    const directOwnerExpenses = await listExpenses(owner.id, business.id, { page: 1, limit: 5 });
    const ownerBundle = await getDashboardBundle(owner.id, business.id, 6);

    expect(ownerBundle.recentSales.map((s: any) => s.id)).toEqual(
      directOwnerSales.data.map((s: any) => s.id)
    );
    expect(ownerBundle.recentExpenses.map((e: any) => e.id)).toEqual(
      directOwnerExpenses.data.map((e: any) => e.id)
    );
    expect(ownerBundle.failedSections).toHaveLength(0);

    // 2. Staff bundle (with expenses.read override) matches direct staff rows
    const directStaffSales = await listSales(staff.id, business.id, { page: 1, limit: 5 });
    const directStaffExpenses = await listExpenses(staff.id, business.id, { page: 1, limit: 5 });
    const staffBundle = await getDashboardBundle(staff.id, business.id, 6);

    expect(staffBundle.recentSales.map((s: any) => s.id)).toEqual(
      directStaffSales.data.map((s: any) => s.id)
    );
    expect(staffBundle.recentExpenses.map((e: any) => e.id)).toEqual(
      directStaffExpenses.data.map((e: any) => e.id)
    );
    expect(staffBundle.failedSections).toHaveLength(0);

    // 3. R1 regression test: A member lacking sales.read, expenses.read, tax.read
    // Must produce empty arrays and an EMPTY failedSections list (not treated as error)
    await testDb.businessMember.update({
      where: { businessId_userId: { businessId: business.id, userId: viewer.id } },
      data: { permissions: { 'sales.read': false, 'expenses.read': false, 'tax.read': false } },
    });
    invalidateOwnershipCache(business.id, viewer.id);

    const viewerBundle = await getDashboardBundle(viewer.id, business.id, 6);
    expect(viewerBundle.recentSales).toEqual([]);
    expect(viewerBundle.recentExpenses).toEqual([]);
    expect(viewerBundle.recentReports).toEqual([]);
    expect(viewerBundle.dashboard).not.toBeNull();
    expect(viewerBundle.failedSections).toEqual([]);
  });

  test('Step 5: Store voucher sale is visible to sales_staff in list and detail, but cannot be updated by staff', async () => {
    // 1. Create a store_voucher sale created by owner
    const voucherSale = await testDb.salesTransaction.create({
      data: {
        businessId: business.id,
        amount: 8500,
        source: 'store_voucher',
        status: 'confirmed',
        isTaxable: true,
        transactionDate: new Date(),
        createdBy: owner.id,
        description: 'Voucher sale created by owner',
      },
    });

    // 2. Staff lists sales -> sees the store_voucher sale even though createdBy is owner
    const staffSales = await listSales(staff.id, business.id, { page: 1, limit: 10 });
    const staffSaleIds = staffSales.data.map((s: any) => s.id);
    expect(staffSaleIds).toContain(voucherSale.id);

    // 3. Staff gets detail -> succeeds (viewable)
    const { getSaleById, updateSale } = await import('../../src/services/sales/sales-crud.service');
    const detail = await getSaleById(staff.id, business.id, voucherSale.id);
    expect(detail.id).toBe(voucherSale.id);

    // 4. Staff attempts updateSale on voucherSale -> 403 PERMISSION_DENIED
    await expect(
      updateSale(staff.id, business.id, voucherSale.id, {
        description: 'Staff attempting to tamper with voucher sale',
      })
    ).rejects.toThrow('You can only edit your own sales');
  });
});
