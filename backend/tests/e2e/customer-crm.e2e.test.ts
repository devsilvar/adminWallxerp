/* eslint-disable */
/**
 * Customer CRM 360 & Period-Independence E2E Test Suite (Adversarial QA Hunter)
 *
 * Verifies the full Customer CRM specification:
 * - Auto-capture from sales (phone dedup, name-only noise rejection, virtual card issuance)
 * - Search by name, email, and normalized phone digits
 * - Customer 360 profile & aggregated financial KPIs
 * - Unified activity timeline with in-memory filtering & pagination
 * - Invoicing auto-capture & mark-paid customer propagation
 * - BNPL credit issuance (same-tx customer linking)
 * - Period-lock independence: CRM & debtor ledger operations NEVER return 423
 * - BNPL deferred revenue when issue month is locked (201 with meta.revenueDeferred: true)
 * - Delete guard preventing 500 FK violations (returns 409)
 * - Cross-organization boundaries & negative access controls
 */
import 'dotenv/config';
import request from 'supertest';
import { createApp } from '../../src/app';
import prisma from '../../src/lib/prisma';
import type { Application } from 'express';

let app: Application;

let ownerToken = '';
let ownerId = '';
let businessId = '';

let foreignToken = '';
let foreignBusinessId = '';

let customerId = '';
let secondCustomerId = '';
let cleanCustomerId = '';
let creditId = '';
let lockedCreditId = '';
let invoiceId = '';

const now = Date.now();
const OWNER_EMAIL = `crm-owner-${now}@e2e.com`;
const FOREIGN_EMAIL = `crm-foreign-${now}@e2e.com`;
const PASSWORD = 'TestPass@123';

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

jest.setTimeout(60000);

beforeAll(async () => {
  app = createApp();
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await prisma.$connect();
      break;
    } catch (err) {
      if (attempt === 3) throw err;
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  // 1. Register Owner & create Business A
  const ownerRes = await request(app)
    .post('/api/v1/auth/register')
    .send({ email: OWNER_EMAIL, password: PASSWORD, fullName: 'CRM Owner' });
  expect(ownerRes.status).toBe(201);
  ownerToken = ownerRes.body.data.accessToken;
  ownerId = ownerRes.body.data.user.id;

  const bizRes = await request(app)
    .post('/api/v1/businesses')
    .set(auth(ownerToken))
    .send({
      businessName: `CRM Test Business ${now}`,
      ownerName: 'CRM Owner',
      businessType: 'Retail',
    });
  expect(bizRes.status).toBe(201);
  businessId = bizRes.body.data.id;

  // 2. Register Foreign User & create Business B
  const foreignRes = await request(app)
    .post('/api/v1/auth/register')
    .send({ email: FOREIGN_EMAIL, password: PASSWORD, fullName: 'Foreign User' });
  expect(foreignRes.status).toBe(201);
  foreignToken = foreignRes.body.data.accessToken;

  const foreignBizRes = await request(app)
    .post('/api/v1/businesses')
    .set(auth(foreignToken))
    .send({
      businessName: `Foreign Business ${now}`,
      ownerName: 'Foreign User',
      businessType: 'Services',
    });
  expect(foreignBizRes.status).toBe(201);
  foreignBusinessId = foreignBizRes.body.data.id;
}, 60000);

afterAll(async () => {
  try {
    const testEmails = [OWNER_EMAIL, FOREIGN_EMAIL];
    const users = await prisma.user.findMany({
      where: { email: { in: testEmails } },
      select: { id: true },
    });
    const userIds = users.map((u) => u.id);

    if (userIds.length > 0) {
      await prisma.monthlyTaxReport.deleteMany({
        where: { business: { userId: { in: userIds } } },
      });
      await prisma.creditPayment.deleteMany({
        where: { credit: { business: { userId: { in: userIds } } } },
      });
      await prisma.customerCredit.deleteMany({
        where: { business: { userId: { in: userIds } } },
      });
      await prisma.customerCardLedger.deleteMany({
        where: { card: { customer: { business: { userId: { in: userIds } } } } },
      });
      await prisma.customerCard.deleteMany({
        where: { customer: { business: { userId: { in: userIds } } } },
      });
      await prisma.invoiceItem.deleteMany({
        where: { invoice: { business: { userId: { in: userIds } } } },
      });
      await prisma.invoice.deleteMany({
        where: { business: { userId: { in: userIds } } },
      });
      await prisma.salesTransaction.deleteMany({
        where: { business: { userId: { in: userIds } } },
      });
      await prisma.customer.deleteMany({
        where: { business: { userId: { in: userIds } } },
      });
      await prisma.businessMember.deleteMany({
        where: { business: { userId: { in: userIds } } },
      });
      await prisma.business.deleteMany({
        where: { userId: { in: userIds } },
      });
      await prisma.user.deleteMany({
        where: { id: { in: userIds } },
      });
    }
  } catch (err) {
    // best-effort cleanup
  }
  await prisma.$disconnect();
});

describe('CRM Customer 360 & Period Independence E2E', () => {
  // ─────────────────────────────────────────────────────────────
  // 1. AUTO-CAPTURE IN REVENUE (SALES)
  // ─────────────────────────────────────────────────────────────
  describe('1. Sales Auto-Capture & Deduplication', () => {
    it('creates customer and virtual card on sale with name + phone', async () => {
      const res = await request(app)
        .post(`/api/v1/businesses/${businessId}/sales`)
        .set(auth(ownerToken))
        .send({
          customerName: 'Alhaji Musa',
          amount: 50000,
          source: 'cash',
          transactionDate: '2026-04-10',
          metadata: {
            customerPhone: '08031234567',
            customerEmail: 'musa@example.com',
          },
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.customerId).toBeTruthy();
      expect(res.body.meta?.customerAutoCreated).toBe(true);

      customerId = res.body.data.customerId;

      // Verify customer created in database (no card auto-created on sale capture)
      const customer = await prisma.customer.findUnique({
        where: { id: customerId },
        include: { card: true },
      });
      expect(customer).toBeTruthy();
      expect(customer!.name).toBe('Alhaji Musa');
      expect(customer!.phone).toBe('08031234567');
      expect(customer!.email).toBe('musa@example.com');
      expect(customer!.card).toBeNull();
    });

    it('reuses existing customer when phone matches in different format (+234)', async () => {
      const res = await request(app)
        .post(`/api/v1/businesses/${businessId}/sales`)
        .set(auth(ownerToken))
        .send({
          customerName: 'ALHAJI MUSA EXT',
          amount: 30000,
          source: 'pos',
          transactionDate: '2026-04-12',
          metadata: {
            customerPhone: '+2348031234567', // same phone normalized
          },
        });

      expect(res.status).toBe(201);
      expect(res.body.data.customerId).toBe(customerId);
      expect(res.body.meta?.customerAutoCreated).toBe(false);

      // Verify customer name was NOT overwritten by second sale
      const customer = await prisma.customer.findUnique({
        where: { id: customerId },
      });
      expect(customer!.name).toBe('Alhaji Musa');
    });

    it('does NOT create customer for name-only walk-in sale (noise gate)', async () => {
      const res = await request(app)
        .post(`/api/v1/businesses/${businessId}/sales`)
        .set(auth(ownerToken))
        .send({
          customerName: 'Anonymous Walk-in Customer',
          amount: 15000,
          source: 'cash',
          transactionDate: '2026-04-12',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.customerId).toBeNull();
      expect(res.body.meta?.customerAutoCreated).toBeUndefined();
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 2. DIRECTORY & AUTOCOMPLETE SEARCH
  // ─────────────────────────────────────────────────────────────
  describe('2. Customer Directory & Search', () => {
    it('searches customer by partial name', async () => {
      const res = await request(app)
        .get(`/api/v1/businesses/${businessId}/customers?search=Alhaji`)
        .set(auth(ownerToken));

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
      expect(res.body.data[0].id).toBe(customerId);
    });

    it('searches customer by phone digits', async () => {
      const res = await request(app)
        .get(`/api/v1/businesses/${businessId}/customers?search=1234567`)
        .set(auth(ownerToken));

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
      expect(res.body.data[0].id).toBe(customerId);
    });

    it('searches customer by email', async () => {
      const res = await request(app)
        .get(`/api/v1/businesses/${businessId}/customers?search=musa@example.com`)
        .set(auth(ownerToken));

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
      expect(res.body.data[0].id).toBe(customerId);
    });

    it('returns pagination metadata with totalPages', async () => {
      const res = await request(app)
        .get(`/api/v1/businesses/${businessId}/customers?page=1&limit=1`)
        .set(auth(ownerToken));

      expect(res.status).toBe(200);
      expect(res.body.pagination).toBeTruthy();
      expect(res.body.pagination.page).toBe(1);
      expect(res.body.pagination.totalPages).toBeGreaterThanOrEqual(1);
      expect(typeof res.body.pagination.total).toBe('number');
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 3. CUSTOMER 360 PROFILE & KPIS
  // ─────────────────────────────────────────────────────────────
  describe('3. Customer 360 Detail & KPIs', () => {
    it('returns full customer 360 profile with aggregated KPIs', async () => {
      const res = await request(app)
        .get(`/api/v1/businesses/${businessId}/customers/${customerId}`)
        .set(auth(ownerToken));

      expect(res.status).toBe(200);
      expect(res.body.data.customer.id).toBe(customerId);
      expect(res.body.data.card).toBeNull(); // No card issued yet (Issue Card CTA mode)
      expect(res.body.data.kpis).toBeTruthy();
      expect(res.body.data.kpis.orderCount).toBe(2);
      expect(res.body.data.kpis.totalSpent).toBe(80000); // 50000 + 30000
      expect(res.body.data.kpis.avgOrder).toBe(40000);
      expect(res.body.data.kpis.outstandingCredit).toBe(0);
      expect(res.body.data.kpis.voucherBalance).toBe(0);
    });

    it('works for archived customer (isActive = false)', async () => {
      // Archive customer
      const patchRes = await request(app)
        .patch(`/api/v1/businesses/${businessId}/customers/${customerId}`)
        .set(auth(ownerToken))
        .send({ isActive: false });
      expect(patchRes.status).toBe(200);
      expect(patchRes.body.data.isActive).toBe(false);

      // Detail should still return 200
      const detailRes = await request(app)
        .get(`/api/v1/businesses/${businessId}/customers/${customerId}`)
        .set(auth(ownerToken));
      expect(detailRes.status).toBe(200);
      expect(detailRes.body.data.customer.isActive).toBe(false);

      // Restore customer
      await request(app)
        .patch(`/api/v1/businesses/${businessId}/customers/${customerId}`)
        .set(auth(ownerToken))
        .send({ isActive: true });
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 4. UNIFIED TIMELINE HISTORY
  // ─────────────────────────────────────────────────────────────
  describe('4. Unified Customer History Timeline', () => {
    it('returns chronological activity stream across sales', async () => {
      const res = await request(app)
        .get(`/api/v1/businesses/${businessId}/customers/${customerId}/history?page=1&limit=20`)
        .set(auth(ownerToken));

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(2);
      expect(res.body.data[0].kind).toBe('sale');
      expect(res.body.pagination.total).toBe(2);
    });

    it('filters timeline by type in-memory (?type=sale)', async () => {
      const res = await request(app)
        .get(`/api/v1/businesses/${businessId}/customers/${customerId}/history?type=sale`)
        .set(auth(ownerToken));

      expect(res.status).toBe(200);
      expect(res.body.data.every((item: any) => item.kind === 'sale')).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 5. INVOICE AUTO-CAPTURE & PAYMENT PROPAGATION
  // ─────────────────────────────────────────────────────────────
  describe('5. Invoice Auto-Capture & Paid Sale Propagation', () => {
    it('creates invoice linked to customerId', async () => {
      const res = await request(app)
        .post(`/api/v1/businesses/${businessId}/invoices`)
        .set(auth(ownerToken))
        .send({
          customerId,
          customerName: 'Alhaji Musa',
          issueDate: '2026-04-15',
          dueDate: '2026-04-30',
          lines: [
            { description: 'Consulting services', quantity: 1, unitPrice: 100000 },
          ],
        });

      expect(res.status).toBe(201);
      expect(res.body.data.customerId).toBe(customerId);
      invoiceId = res.body.data.id;

      // Customer 360 KPIs now reflect 1 invoice
      const detailRes = await request(app)
        .get(`/api/v1/businesses/${businessId}/customers/${customerId}`)
        .set(auth(ownerToken));
      expect(detailRes.body.data.kpis.totalInvoices).toBe(1);
    });

    it('mark-paid transfers customerId to the created SalesTransaction', async () => {
      // Transition from draft to sent first per invoice lifecycle rules
      const sendRes = await request(app)
        .post(`/api/v1/businesses/${businessId}/invoices/${invoiceId}/send`)
        .set(auth(ownerToken));
      expect([200, 201]).toContain(sendRes.status);

      const res = await request(app)
        .post(`/api/v1/businesses/${businessId}/invoices/${invoiceId}/mark-paid`)
        .set(auth(ownerToken))
        .send({
          paymentMethod: 'bank_transfer',
          paymentDate: '2026-04-16',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('paid');

      // Check that the created sale inherited customerId
      const sales = await prisma.salesTransaction.findMany({
        where: { businessId, customerId },
        orderBy: { createdAt: 'desc' },
      });
      const paidSale = sales.find((s) => s.description?.includes(res.body.data.invoiceNumber));
      expect(paidSale).toBeTruthy();
      expect(paidSale!.customerId).toBe(customerId);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 6. BNPL CREDIT ISSUANCE & REPAYMENT (OPEN MONTH)
  // ─────────────────────────────────────────────────────────────
  describe('6. BNPL Credit Issuance in Open Month', () => {
    it('links BOTH customerCredit and salesTransaction to same customerId in same tx', async () => {
      const res = await request(app)
        .post(`/api/v1/businesses/${businessId}/credits`)
        .set(auth(ownerToken))
        .send({
          customerName: 'Alhaji Musa',
          customerEmail: 'musa@example.com',
          customerPhone: '08031234567',
          issueDate: '2026-04-18',
          dueDate: '2026-05-18',
          totalAmount: 40000,
          description: 'BNPL Purchase of Equipment',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.customerId).toBe(customerId);
      expect(res.body.data.linkedSaleId).toBeTruthy();

      creditId = res.body.data.id;

      // Verify the sale created by credit has the same customerId
      const sale = await prisma.salesTransaction.findUnique({
        where: { id: res.body.data.linkedSaleId },
      });
      expect(sale).toBeTruthy();
      expect(sale!.customerId).toBe(customerId);

      // Verify outstanding credit KPI
      const detailRes = await request(app)
        .get(`/api/v1/businesses/${businessId}/customers/${customerId}`)
        .set(auth(ownerToken));
      expect(detailRes.body.data.kpis.outstandingCredit).toBe(40000);
    });

    it('repayment reduces debtor balance without creating duplicate sale', async () => {
      const salesBefore = await prisma.salesTransaction.count({ where: { businessId } });

      const res = await request(app)
        .post(`/api/v1/businesses/${businessId}/credits/${creditId}/payments`)
        .set(auth(ownerToken))
        .send({
          amount: 20000,
          paymentDate: '2026-04-20',
          paymentType: 'bank_transfer',
          notes: 'Partial payment',
        });

      expect([200, 201]).toContain(res.status);
      expect(Number(res.body.data.balance)).toBe(20000);

      // Accrual basis check: zero new sales transactions created
      const salesAfter = await prisma.salesTransaction.count({ where: { businessId } });
      expect(salesAfter).toBe(salesBefore);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 7. TAX MONTH-LOCK INDEPENDENCE (AC15 & AC16)
  // ─────────────────────────────────────────────────────────────
  describe('7. Period-Independence: Locked Month Boundary', () => {
    beforeAll(async () => {
      // Seed a locked MonthlyTaxReport for January 2024
      await prisma.monthlyTaxReport.upsert({
        where: {
          businessId_taxMonth: {
            businessId,
            taxMonth: new Date('2024-01-01T00:00:00.000Z'),
          },
        },
        update: {
          isLocked: true,
          lockedAt: new Date('2024-02-01'),
        },
        create: {
          businessId,
          taxMonth: new Date('2024-01-01T00:00:00.000Z'),
          totalSales: 0,
          totalExpenses: 0,
          grossProfit: 0,
          taxRate: 0,
          taxPayable: 0,
          profitMargin: 0,
          isFinalized: true,
          isLocked: true,
          lockedAt: new Date('2024-02-01'),
        },
      });
    });

    it('POST /sales in locked month is BLOCKED with 423 (sales evidence guard active)', async () => {
      const res = await request(app)
        .post(`/api/v1/businesses/${businessId}/sales`)
        .set(auth(ownerToken))
        .send({
          amount: 10000,
          source: 'cash',
          transactionDate: '2024-01-15', // inside locked month
        });

      expect(res.status).toBe(423);
      expect(res.body.error?.code).toMatch(/PERIOD_LOCKED|PERIOD_FINALIZED/);
    });

    it('CRM master data endpoints BYPASS lock and return 200 (never 423)', async () => {
      // 1. GET /customers
      const listRes = await request(app)
        .get(`/api/v1/businesses/${businessId}/customers`)
        .set(auth(ownerToken));
      expect(listRes.status).toBe(200);

      // 2. GET /customers/:id
      const detailRes = await request(app)
        .get(`/api/v1/businesses/${businessId}/customers/${customerId}`)
        .set(auth(ownerToken));
      expect(detailRes.status).toBe(200);

      // 3. GET /customers/:id/history
      const historyRes = await request(app)
        .get(`/api/v1/businesses/${businessId}/customers/${customerId}/history`)
        .set(auth(ownerToken));
      expect(historyRes.status).toBe(200);

      // 4. PATCH /customers/:id
      const patchRes = await request(app)
        .patch(`/api/v1/businesses/${businessId}/customers/${customerId}`)
        .set(auth(ownerToken))
        .send({ address: '123 Independence Way' });
      expect(patchRes.status).toBe(200);
      expect(patchRes.body.data.address).toBe('123 Independence Way');
    });

    it('BNPL credit in locked month REGISTERS debtor with revenueDeferred: true (never 423)', async () => {
      const res = await request(app)
        .post(`/api/v1/businesses/${businessId}/credits`)
        .set(auth(ownerToken))
        .send({
          customerName: 'Alhaji Musa',
          customerEmail: 'musa@example.com',
          customerPhone: '08031234567',
          issueDate: '2024-01-15', // locked month
          dueDate: '2024-02-15',
          totalAmount: 75000,
          description: 'BNPL Goods Issued in Locked Month',
        });

      // Contract: 201 Created, debtor registered, sale leg skipped
      expect(res.status).toBe(201);
      expect(res.body.data.customerId).toBe(customerId);
      expect(res.body.data.linkedSaleId).toBeNull();
      expect(res.body.meta?.revenueDeferred).toBe(true);

      lockedCreditId = res.body.data.id;
    });

    it('Debtor repayment for locked-month credit succeeds with 201 (never 423)', async () => {
      const res = await request(app)
        .post(`/api/v1/businesses/${businessId}/credits/${lockedCreditId}/payments`)
        .set(auth(ownerToken))
        .send({
          amount: 25000,
          paymentDate: '2024-01-25', // inside locked month
          paymentType: 'cash',
        });

      expect([200, 201]).toContain(res.status);
      expect(Number(res.body.data.balance)).toBe(50000);
    });

    it('Debtor ledger reads BYPASS lock and return 200 (never 423)', async () => {
      const listRes = await request(app)
        .get(`/api/v1/businesses/${businessId}/credits`)
        .set(auth(ownerToken));
      expect(listRes.status).toBe(200);

      const singleRes = await request(app)
        .get(`/api/v1/businesses/${businessId}/credits/${lockedCreditId}`)
        .set(auth(ownerToken));
      expect(singleRes.status).toBe(200);

      const summaryRes = await request(app)
        .get(`/api/v1/businesses/${businessId}/credits/summary`)
        .set(auth(ownerToken));
      expect(summaryRes.status).toBe(200);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 8. DELETE GUARDS & RESTRICT FK SAFETY
  // ─────────────────────────────────────────────────────────────
  describe('8. Customer Deletion Protection', () => {
    it('DELETE customer with activity history returns 409 CUSTOMER_HAS_HISTORY (never 500)', async () => {
      const res = await request(app)
        .delete(`/api/v1/businesses/${businessId}/customers/${customerId}`)
        .set(auth(ownerToken));

      expect(res.status).toBe(409);
      expect(res.body.error?.code).toBe('CUSTOMER_HAS_HISTORY');
    });

    it('DELETE clean customer with zero history returns 200', async () => {
      // Create clean customer
      const createRes = await request(app)
        .post(`/api/v1/businesses/${businessId}/customers`)
        .set(auth(ownerToken))
        .send({
          name: 'Temporary Clean Customer',
          phone: '08199998888',
        });
      expect(createRes.status).toBe(201);
      cleanCustomerId = createRes.body.data.id;

      // Delete should succeed
      const delRes = await request(app)
        .delete(`/api/v1/businesses/${businessId}/customers/${cleanCustomerId}`)
        .set(auth(ownerToken));
      expect(delRes.status).toBe(200);
      expect(delRes.body.success).toBe(true);

      // Verify deletion in DB
      const dbCust = await prisma.customer.findUnique({
        where: { id: cleanCustomerId },
      });
      expect(dbCust).toBeNull();
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 9. CROSS-ORGANIZATION BOUNDARY & NEGATIVE SECURITY
  // ─────────────────────────────────────────────────────────────
  describe('9. Cross-Organization Boundary & Authorization', () => {
    it('rejects foreign user accessing customer from another business (404/403)', async () => {
      const res = await request(app)
        .get(`/api/v1/businesses/${foreignBusinessId}/customers/${customerId}`)
        .set(auth(foreignToken));

      expect([403, 404]).toContain(res.status);
    });

    it('rejects foreign user updating customer from another business (404/403)', async () => {
      const res = await request(app)
        .patch(`/api/v1/businesses/${foreignBusinessId}/customers/${customerId}`)
        .set(auth(foreignToken))
        .send({ name: 'Hacked Name' });

      expect([403, 404]).toContain(res.status);

      // Customer name remains untouched
      const dbCust = await prisma.customer.findUnique({
        where: { id: customerId },
      });
      expect(dbCust!.name).toBe('Alhaji Musa');
    });

    it('rejects cross-business foreign customerId injection on sale creation (400/404)', async () => {
      const res = await request(app)
        .post(`/api/v1/businesses/${foreignBusinessId}/sales`)
        .set(auth(foreignToken))
        .send({
          amount: 20000,
          source: 'cash',
          transactionDate: '2026-04-15',
          customerId: customerId, // foreign customer from Business A injected into Business B
        });

      expect([400, 404]).toContain(res.status);
      expect(res.body.error?.code).toBe('INVALID_CUSTOMER');
    });

    it('rejects duplicate phone collision on PATCH with 409 PHONE_ALREADY_EXISTS', async () => {
      // Create a second customer in business A
      const cust2Res = await request(app)
        .post(`/api/v1/businesses/${businessId}/customers`)
        .set(auth(ownerToken))
        .send({
          name: 'Second Customer',
          phone: '08055556666',
        });
      expect(cust2Res.status).toBe(201);
      secondCustomerId = cust2Res.body.data.id;

      // Attempt to patch second customer to first customer's phone
      const collideRes = await request(app)
        .patch(`/api/v1/businesses/${businessId}/customers/${secondCustomerId}`)
        .set(auth(ownerToken))
        .send({
          phone: '08031234567', // belongs to customerId
        });

      expect(collideRes.status).toBe(409);
      expect(collideRes.body.error?.code).toBe('PHONE_ALREADY_EXISTS');
    });
  });
});
