/* eslint-disable */
/**
 * Team Permissions Integration E2E Tests — Phase 2
 *
 * Tests the role-based access control and row-level scoping across domain services:
 * - sales_staff: sales create/read allowed (own scoping), expense create blocked (403), sales delete blocked (403)
 * - accountant: expense create allowed, sales create blocked (403), tax calculate allowed, tax finalize blocked (403)
 * - viewer: read allowed, all mutations blocked (403)
 * - manager: operational mutations allowed, financial owner-only blocked (tax.pay, business.delete)
 *
 * @author WallX Engineering Team
 */
import 'dotenv/config';
import request from 'supertest';
import { createApp } from '../../src/app';
import prisma from '../../src/lib/prisma';
import { invalidateOwnershipCache } from '../../src/lib/ownership';
import type { Application } from 'express';

let app: Application;

let ownerToken = '';
let ownerId = '';
let businessId = '';

let staffToken = '';
let staffId = '';

let accountantToken = '';
let accountantId = '';

let viewerToken = '';
let viewerId = '';

let managerToken = '';
let managerId = '';

let ownerSaleId = '';
let staffSaleId = '';

const now = Date.now();
const OWNER_EMAIL = `perm-owner-${now}@e2e.com`;
const STAFF_EMAIL = `perm-staff-${now}@e2e.com`;
const ACCT_EMAIL = `perm-acct-${now}@e2e.com`;
const VIEWER_EMAIL = `perm-viewer-${now}@e2e.com`;
const MANAGER_EMAIL = `perm-mgr-${now}@e2e.com`;
const PASSWORD = 'TestPass@123';

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

jest.setTimeout(45000);

beforeAll(async () => {
  app = createApp();
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      await prisma.$connect();
      break;
    } catch (err) {
      if (attempt === 5) throw err;
      await new Promise((r) => setTimeout(r, 3000));
    }
  }

  // 1. Register owner
  const resOwner = await request(app)
    .post('/api/v1/auth/register')
    .send({ email: OWNER_EMAIL, password: PASSWORD });
  ownerToken = resOwner.body.data.accessToken;
  ownerId = resOwner.body.data.user.id;

  // 2. Create business
  const resBiz = await request(app)
    .post('/api/v1/businesses')
    .set(auth(ownerToken))
    .send({
      businessName: 'Permission Test Business',
      ownerName: 'Permission Owner',
      businessType: 'Services',
    });
  businessId = resBiz.body.data.id;

  // 3. Register team users
  const [resStaff, resAcct, resViewer, resMgr] = await Promise.all([
    request(app).post('/api/v1/auth/register').send({ email: STAFF_EMAIL, password: PASSWORD }),
    request(app).post('/api/v1/auth/register').send({ email: ACCT_EMAIL, password: PASSWORD }),
    request(app).post('/api/v1/auth/register').send({ email: VIEWER_EMAIL, password: PASSWORD }),
    request(app).post('/api/v1/auth/register').send({ email: MANAGER_EMAIL, password: PASSWORD }),
  ]);

  staffToken = resStaff.body.data.accessToken;
  staffId = resStaff.body.data.user.id;

  accountantToken = resAcct.body.data.accessToken;
  accountantId = resAcct.body.data.user.id;

  viewerToken = resViewer.body.data.accessToken;
  viewerId = resViewer.body.data.user.id;

  managerToken = resMgr.body.data.accessToken;
  managerId = resMgr.body.data.user.id;

  // 4. Add members directly to BusinessMember table with their respective roles
  await prisma.businessMember.createMany({
    data: [
      { businessId, userId: staffId, role: 'sales_staff', isActive: true },
      { businessId, userId: accountantId, role: 'accountant', isActive: true },
      { businessId, userId: viewerId, role: 'viewer', isActive: true },
      { businessId, userId: managerId, role: 'manager', isActive: true },
    ],
  });

  // 5. Create an owner sale
  const resOwnerSale = await request(app)
    .post(`/api/v1/businesses/${businessId}/sales`)
    .set(auth(ownerToken))
    .send({
      amount: 50000,
      description: 'Owner Sale Item',
      transactionDate: new Date().toISOString(),
      source: 'manual',
    });
  ownerSaleId = resOwnerSale.body.data.id;
}, 60000);

afterAll(async () => {
  try {
    if (businessId) {
      await prisma.salesTransaction.deleteMany({ where: { businessId } });
      await prisma.expense.deleteMany({ where: { businessId } });
      await prisma.businessMember.deleteMany({ where: { businessId } });
      await prisma.business.deleteMany({ where: { id: businessId } });
    }
    const testEmails = [OWNER_EMAIL, STAFF_EMAIL, ACCT_EMAIL, VIEWER_EMAIL, MANAGER_EMAIL];
    await prisma.user.deleteMany({ where: { email: { in: testEmails } } });
  } catch (err) {
    // cleanup best-effort
  }
  await prisma.$disconnect();
});

describe('Phase 2: Service Permissions Enforcement E2E', () => {
  // ═════════════════════════════════════════
  // SALES STAFF PERMISSIONS
  // ═════════════════════════════════════════
  describe('sales_staff role', () => {
    it('sales_staff can create a sale → 201', async () => {
      const res = await request(app)
        .post(`/api/v1/businesses/${businessId}/sales`)
        .set(auth(staffToken))
        .send({
          amount: 25000,
          description: 'Staff Sale Item',
          transactionDate: new Date().toISOString(),
          source: 'manual',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      staffSaleId = res.body.data.id;
    });

    it('sales_staff is BLOCKED from creating expenses → 403 PERMISSION_DENIED', async () => {
      const res = await request(app)
        .post(`/api/v1/businesses/${businessId}/expenses`)
        .set(auth(staffToken))
        .send({
          amount: 10000,
          category: 'utility',
          description: 'Office Electricity',
          expenseDate: new Date().toISOString(),
        });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('PERMISSION_DENIED');
    });

    it('sales_staff is BLOCKED from deleting sales → 403 PERMISSION_DENIED', async () => {
      const res = await request(app)
        .delete(`/api/v1/businesses/${businessId}/sales/${staffSaleId}`)
        .set(auth(staffToken));

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('PERMISSION_DENIED');
    });

    it('sales_staff listSales applies row-level scoping (only own sales + bank_transfer)', async () => {
      const res = await request(app)
        .get(`/api/v1/businesses/${businessId}/sales`)
        .set(auth(staffToken));

      expect(res.status).toBe(200);
      const sales = res.body.data;
      // Should include staffSaleId
      const foundStaffSale = sales.find((s: any) => s.id === staffSaleId);
      expect(foundStaffSale).toBeDefined();

      // Should NOT include ownerSaleId (manual sale created by owner)
      const foundOwnerSale = sales.find((s: any) => s.id === ownerSaleId);
      expect(foundOwnerSale).toBeUndefined();
    });

    it('sales_staff cannot view other user manual sale directly → 403', async () => {
      const res = await request(app)
        .get(`/api/v1/businesses/${businessId}/sales/${ownerSaleId}`)
        .set(auth(staffToken));

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('PERMISSION_DENIED');
    });

    it('sales_staff with expenses.read override sees only own rows + null-createdBy legacy rows', async () => {
      // 1. Create an owner expense
      const resOwnerExp = await request(app)
        .post(`/api/v1/businesses/${businessId}/expenses`)
        .set(auth(ownerToken))
        .send({
          amount: 80000,
          category: 'rent',
          description: 'Owner Rent Expense',
          expenseDate: new Date().toISOString(),
        });
      expect(resOwnerExp.status).toBe(201);
      const ownerExpId = resOwnerExp.body.data.id;

      // 2. Create a legacy expense directly in DB with createdBy: null
      const legacyExp = await prisma.expense.create({
        data: {
          businessId,
          amount: 12000,
          category: 'utility',
          description: 'Legacy Utility Bill',
          expenseDate: new Date(),
          isDeductible: true,
          createdBy: null,
        },
      });

      // 3. Grant sales_staff expenses.read override
      await prisma.businessMember.update({
        where: { businessId_userId: { businessId, userId: staffId } },
        data: { permissions: { 'expenses.read': true } },
      });
      invalidateOwnershipCache(businessId, staffId);

      // 4. Create a staff expense directly in DB with createdBy: staffId
      const staffExp = await prisma.expense.create({
        data: {
          businessId,
          amount: 5000,
          category: 'logistics',
          description: 'Staff Dispatch Fee',
          expenseDate: new Date(),
          isDeductible: true,
          createdBy: staffId,
        },
      });

      // 5. Staff calls GET /api/v1/businesses/:id/expenses
      const resList = await request(app)
        .get(`/api/v1/businesses/${businessId}/expenses`)
        .set(auth(staffToken));

      expect(resList.status).toBe(200);
      const ids = resList.body.data.map((e: any) => e.id);
      expect(ids).toContain(staffExp.id);
      expect(ids).toContain(legacyExp.id); // null policy verified
      expect(ids).not.toContain(ownerExpId); // owner expense excluded from staff

      // 6. Staff requesting owner expense directly by ID gets 403
      const resDirect = await request(app)
        .get(`/api/v1/businesses/${businessId}/expenses/${ownerExpId}`)
        .set(auth(staffToken));
      expect(resDirect.status).toBe(403);
    });
  });

  // ═════════════════════════════════════════
  // ACCOUNTANT PERMISSIONS
  // ═════════════════════════════════════════
  describe('accountant role', () => {
    let accountantExpenseId = '';

    it('accountant can create an expense → 201', async () => {
      const res = await request(app)
        .post(`/api/v1/businesses/${businessId}/expenses`)
        .set(auth(accountantToken))
        .send({
          amount: 15000,
          category: 'rent',
          description: 'Monthly Office Rent',
          expenseDate: new Date().toISOString(),
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      accountantExpenseId = res.body.data.id;
    });

    it('accountant is BLOCKED from creating sales → 403 PERMISSION_DENIED', async () => {
      const res = await request(app)
        .post(`/api/v1/businesses/${businessId}/sales`)
        .set(auth(accountantToken))
        .send({
          amount: 12000,
          description: 'Accountant Unauthorized Sale',
          transactionDate: new Date().toISOString(),
          source: 'manual',
        });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('PERMISSION_DENIED');
    });

    let calculatedReportId = '';

    it('accountant can calculate tax → 200', async () => {
      const now = new Date();
      const month = now.getMonth() + 1;
      const year = now.getFullYear();

      const res = await request(app)
        .post(`/api/v1/businesses/${businessId}/tax/calculate`)
        .set(auth(accountantToken))
        .send({ month, year });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      calculatedReportId = res.body.data.id || '00000000-0000-0000-0000-000000000000';
    });

    it('accountant is BLOCKED from finalizing tax reports → 403 PERMISSION_DENIED', async () => {
      const res = await request(app)
        .post(`/api/v1/businesses/${businessId}/tax/reports/${calculatedReportId}/finalize`)
        .set(auth(accountantToken))
        .send({});

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('PERMISSION_DENIED');
    });
  });

  // ═════════════════════════════════════════
  // VIEWER PERMISSIONS
  // ═════════════════════════════════════════
  describe('viewer role', () => {
    it('viewer can read business details → 200', async () => {
      const res = await request(app)
        .get(`/api/v1/businesses/${businessId}`)
        .set(auth(viewerToken));

      expect(res.status).toBe(200);
      expect(res.body.data.myRole).toBe('viewer');
    });

    it('viewer is BLOCKED from creating sales → 403 PERMISSION_DENIED', async () => {
      const res = await request(app)
        .post(`/api/v1/businesses/${businessId}/sales`)
        .set(auth(viewerToken))
        .send({
          amount: 5000,
          description: 'Viewer Sale Attempt',
          transactionDate: new Date().toISOString(),
          source: 'manual',
        });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('PERMISSION_DENIED');
    });

    it('viewer is BLOCKED from creating invoices → 403 PERMISSION_DENIED', async () => {
      const res = await request(app)
        .post(`/api/v1/businesses/${businessId}/invoices`)
        .set(auth(viewerToken))
        .send({
          customerName: 'ACME Corp',
          issueDate: new Date().toISOString().split('T')[0],
          dueDate: new Date(Date.now() + 86400000 * 7).toISOString().split('T')[0],
          lines: [{ description: 'Consulting', quantity: 1, unitPrice: 50000 }],
        });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('PERMISSION_DENIED');
    });

    it('viewer is BLOCKED from creating expenses → 403 PERMISSION_DENIED', async () => {
      const res = await request(app)
        .post(`/api/v1/businesses/${businessId}/expenses`)
        .set(auth(viewerToken))
        .send({
          amount: 5000,
          category: 'fuel',
          description: 'Generator Fuel',
          expenseDate: new Date().toISOString(),
        });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('PERMISSION_DENIED');
    });
  });

  // ═════════════════════════════════════════
  // MANAGER & FINANCIAL OWNER-ONLY GUARDS
  // ═════════════════════════════════════════
  describe('manager role & financial owner-only guards', () => {
    it('manager can create a sale → 201', async () => {
      const res = await request(app)
        .post(`/api/v1/businesses/${businessId}/sales`)
        .set(auth(managerToken))
        .send({
          amount: 40000,
          description: 'Manager Sale',
          transactionDate: new Date().toISOString(),
          source: 'manual',
        });

      expect(res.status).toBe(201);
    });

    it('manager is BLOCKED from deleting the business → 403 PERMISSION_DENIED', async () => {
      const res = await request(app)
        .delete(`/api/v1/businesses/${businessId}`)
        .set(auth(managerToken));

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('PERMISSION_DENIED');
    });

    it('manager is BLOCKED from initiating tax payment (FINANCIAL_OWNER_ONLY) → 403 FORBIDDEN', async () => {
      const res = await request(app)
        .post(`/api/v1/businesses/${businessId}/tax/pay`)
        .set(auth(managerToken))
        .send({
          taxReportId: '00000000-0000-0000-0000-000000000000',
          paymentMethod: 'card',
        });

      expect(res.status).toBe(403);
      // verifyBusinessOwnership returns FORBIDDEN for non-owner
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('manager is BLOCKED from updating business settings → 403 PERMISSION_DENIED', async () => {
      const res = await request(app)
        .put(`/api/v1/businesses/${businessId}`)
        .set(auth(managerToken))
        .send({
          businessName: 'Unauthorized Name Change',
        });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('PERMISSION_DENIED');
    });
  });
});
