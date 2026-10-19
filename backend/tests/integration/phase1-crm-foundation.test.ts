/* eslint-disable */
/**
 * Phase 1 Integration Tests: CRM Foundation, Editable Threshold Plumbing, and Edit Fix
 *
 * Verifies:
 * 1. GET /businesses/:id returns voucherAdjustmentThreshold (50000 default, number) and no voucherRequiresApproval
 * 2. PUT /businesses/:id/settings/voucher-adjustment-threshold {threshold: 20000} as owner -> 200 + audit log + updated GET
 * 3. PUT as manager -> 200 (explicit access allows managers without settings.update financial lock)
 * 4. PUT as sales_staff -> 403
 * 5. Validation boundaries: threshold < 0 or > 10,000,000 -> 400
 * 6. PATCH /businesses/:id/customers/:customerId {taxId: "", address: ""} -> 200 leaves null without 400 error
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

let managerToken = '';
let managerId = '';

let staffToken = '';
let staffId = '';

let customerId = '';

const now = Date.now();
const OWNER_EMAIL = `phase1-owner-${now}@test.com`;
const MANAGER_EMAIL = `phase1-mgr-${now}@test.com`;
const STAFF_EMAIL = `phase1-staff-${now}@test.com`;
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

  // 1. Register Owner & create Business
  const ownerRes = await request(app)
    .post('/api/v1/auth/register')
    .send({ email: OWNER_EMAIL, password: PASSWORD, fullName: 'Phase1 Owner' });
  expect(ownerRes.status).toBe(201);
  ownerToken = ownerRes.body.data.accessToken;
  ownerId = ownerRes.body.data.user.id;

  const bizRes = await request(app)
    .post('/api/v1/businesses')
    .set(auth(ownerToken))
    .send({
      businessName: `Phase1 Test Business ${now}`,
      ownerName: 'Phase1 Owner',
      businessType: 'Retail',
    });
  expect(bizRes.status).toBe(201);
  businessId = bizRes.body.data.id;

  // 2. Register and assign Manager
  const mgrRes = await request(app)
    .post('/api/v1/auth/register')
    .send({ email: MANAGER_EMAIL, password: PASSWORD, fullName: 'Phase1 Manager' });
  expect(mgrRes.status).toBe(201);
  managerToken = mgrRes.body.data.accessToken;
  managerId = mgrRes.body.data.user.id;

  await prisma.businessMember.create({
    data: {
      businessId,
      userId: managerId,
      role: 'manager',
      isActive: true,
    },
  });

  // 3. Register and assign Sales Staff
  const staffRes = await request(app)
    .post('/api/v1/auth/register')
    .send({ email: STAFF_EMAIL, password: PASSWORD, fullName: 'Phase1 Staff' });
  expect(staffRes.status).toBe(201);
  staffToken = staffRes.body.data.accessToken;
  staffId = staffRes.body.data.user.id;

  await prisma.businessMember.create({
    data: {
      businessId,
      userId: staffId,
      role: 'sales_staff',
      isActive: true,
    },
  });

  // 4. Create a test customer with existing taxId and address
  const custRes = await request(app)
    .post(`/api/v1/businesses/${businessId}/customers`)
    .set(auth(ownerToken))
    .send({
      name: 'Initial Customer',
      phone: '08099998888',
      email: 'initial@customer.com',
      address: '123 Initial Street',
      notes: 'Initial notes',
    });
  expect(custRes.status).toBe(201);
  customerId = custRes.body.data.id;
}, 60000);

afterAll(async () => {
  try {
    const testEmails = [OWNER_EMAIL, MANAGER_EMAIL, STAFF_EMAIL];
    const users = await prisma.user.findMany({
      where: { email: { in: testEmails } },
      select: { id: true },
    });
    const userIds = users.map((u) => u.id);

    if (businessId) {
      await prisma.auditLog.deleteMany({ where: { businessId } });
      await prisma.customer.deleteMany({ where: { businessId } });
      await prisma.businessMember.deleteMany({ where: { businessId } });
      await prisma.business.deleteMany({ where: { id: businessId } });
    }

    if (userIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }
    await prisma.$disconnect();
  } catch (e) {
    // ignore cleanup error
  }
});

describe('Phase 1 Foundation: Schema, Config, Threshold & Edit Plumbing', () => {
  it('GET /businesses/:id returns voucherAdjustmentThreshold default 50000 and NO voucherRequiresApproval', async () => {
    const res = await request(app)
      .get(`/api/v1/businesses/${businessId}`)
      .set(auth(ownerToken));

    expect(res.status).toBe(200);
    expect(res.body.data.voucherAdjustmentThreshold).toBe(50000);
    expect(typeof res.body.data.voucherAdjustmentThreshold).toBe('number');
    expect(res.body.data.voucherRequiresApproval).toBeUndefined();
  });

  it('PUT /businesses/:id/settings/voucher-adjustment-threshold as OWNER updates to 20000 and logs audit', async () => {
    const res = await request(app)
      .put(`/api/v1/businesses/${businessId}/settings/voucher-adjustment-threshold`)
      .set(auth(ownerToken))
      .send({ threshold: 20000 });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.voucherAdjustmentThreshold).toBe(20000);

    // Verify GET reflects update immediately
    const getRes = await request(app)
      .get(`/api/v1/businesses/${businessId}`)
      .set(auth(ownerToken));
    expect(getRes.status).toBe(200);
    expect(getRes.body.data.voucherAdjustmentThreshold).toBe(20000);

    // Verify audit log
    const audit = await prisma.auditLog.findFirst({
      where: {
        businessId,
        action: 'business.voucher_adjustment_threshold_updated',
      },
      orderBy: { createdAt: 'desc' },
    });
    expect(audit).toBeTruthy();
    expect((audit!.newData as any)?.voucherAdjustmentThreshold).toBe(20000);
  });

  it('PUT /businesses/:id/settings/voucher-adjustment-threshold as MANAGER succeeds with 200', async () => {
    const res = await request(app)
      .put(`/api/v1/businesses/${businessId}/settings/voucher-adjustment-threshold`)
      .set(auth(managerToken))
      .send({ threshold: 35000 });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.voucherAdjustmentThreshold).toBe(35000);

    const getRes = await request(app)
      .get(`/api/v1/businesses/${businessId}`)
      .set(auth(managerToken));
    expect(getRes.status).toBe(200);
    expect(getRes.body.data.voucherAdjustmentThreshold).toBe(35000);
  });

  it('PUT /businesses/:id/settings/voucher-adjustment-threshold as SALES_STAFF is rejected with 403', async () => {
    const res = await request(app)
      .put(`/api/v1/businesses/${businessId}/settings/voucher-adjustment-threshold`)
      .set(auth(staffToken))
      .send({ threshold: 10000 });

    expect(res.status).toBe(403);
    expect(res.body.error?.code).toBe('PERMISSION_DENIED');
  });

  it('rejects invalid threshold boundaries (< 0 or > 10,000,000) with 400', async () => {
    const negRes = await request(app)
      .put(`/api/v1/businesses/${businessId}/settings/voucher-adjustment-threshold`)
      .set(auth(ownerToken))
      .send({ threshold: -1 });
    expect(negRes.status).toBe(400);

    const overRes = await request(app)
      .put(`/api/v1/businesses/${businessId}/settings/voucher-adjustment-threshold`)
      .set(auth(ownerToken))
      .send({ threshold: 20000000 });
    expect(overRes.status).toBe(400);
  });

  it('PATCH /businesses/:id/customers/:customerId with empty taxId and address succeeds (emptyToUndef fix)', async () => {
    // 1. Sending taxId: "" does not fail with 400, leaves null
    const res = await request(app)
      .patch(`/api/v1/businesses/${businessId}/customers/${customerId}`)
      .set(auth(ownerToken))
      .send({
        name: 'Updated Customer Name',
        taxId: '',
        address: null,
      });

    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('Updated Customer Name');
    expect(res.body.data.taxId).toBeNull();
    expect(res.body.data.address).toBeNull();

    // 2. Sending { taxId: "", address: "" } returns 200 without validation error
    const res2 = await request(app)
      .patch(`/api/v1/businesses/${businessId}/customers/${customerId}`)
      .set(auth(ownerToken))
      .send({
        taxId: '',
        address: '',
      });

    expect(res2.status).toBe(200);
    expect(res2.body.data.taxId).toBeNull();
    expect(res2.body.data.address).toBeNull();
  });
});
