import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import { createApp } from '../../src/app';
import type { Application } from 'express';
import { testDb, clearDatabase, createTestUser, createTestBusiness } from '../helpers/test-db';
import { invalidateOwnershipCache } from '../../src/lib/ownership';
import jwt from 'jsonwebtoken';
import config from '../../src/config';

jest.setTimeout(180000);

describe('Voucher Ledger Request & Authorization Queue Integration', () => {
  let app: Application;
  let owner: any;
  let ownerToken: string;
  let manager: any;
  let managerToken: string;
  let staff: any;
  let staffToken: string;
  let business: any;
  let customer: any;
  let card: any;

  beforeAll(async () => {
    app = createApp();

    const timestamp = Date.now();
    owner = await createTestUser(`vr-owner-${timestamp}@example.com`);
    manager = await createTestUser(`vr-manager-${timestamp}@example.com`);
    staff = await createTestUser(`vr-staff-${timestamp}@example.com`);

    business = await createTestBusiness(owner.id, 'Voucher Queue Mart');

    // Add manager & staff to business members
    await testDb.businessMember.createMany({
      data: [
        {
          businessId: business.id,
          userId: manager.id,
          role: 'manager',
          isActive: true,
        },
        {
          businessId: business.id,
          userId: staff.id,
          role: 'sales_staff',
          isActive: true,
        },
      ],
    });

    invalidateOwnershipCache(business.id, owner.id);
    invalidateOwnershipCache(business.id, manager.id);
    invalidateOwnershipCache(business.id, staff.id);

    ownerToken = jwt.sign(
      { userId: owner.id, email: owner.email, role: 'user' },
      config.jwt.accessSecret,
      { expiresIn: '1h' }
    );

    managerToken = jwt.sign(
      { userId: manager.id, email: manager.email, role: 'user' },
      config.jwt.accessSecret,
      { expiresIn: '1h' }
    );

    staffToken = jwt.sign(
      { userId: staff.id, email: staff.email, role: 'user' },
      config.jwt.accessSecret,
      { expiresIn: '1h' }
    );

    // Create a customer with initial funded card
    customer = await testDb.customer.create({
      data: {
        businessId: business.id,
        name: 'Chioma Adebayo',
        phone: '+2348039988776',
        email: 'chioma.adebayo@example.com',
      },
    });

    card = await testDb.customerCard.create({
      data: {
        businessId: business.id,
        customerId: customer.id,
        cardCode: `WXC-${timestamp}`,
        balance: 200000, // 200k balance for deduction tests
        pinHash: '$2b$10$dummyHashForTestOnlyXXXXXXXXXXXXXXX',
        pinAttempts: 0,
      },
    });
  }, 90000);

  afterAll(async () => {
    await clearDatabase();
    await testDb.$disconnect();
  }, 90000);

  test('1. sales_staff creates top_up request: status is pending and balance is unchanged', async () => {
    const res = await request(app)
      .post(`/api/v1/businesses/${business.id}/voucher-requests`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({
        kind: 'top_up',
        customerId: customer.id,
        amount: 5000,
        notes: 'Deposit via bank transfer',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('pending');
    expect(res.body.data.amount).toBe(5000);
    expect(res.body.data.customerName).toBe('Chioma Adebayo');

    // Verify card balance remains untouched
    const freshCard = await testDb.customerCard.findUnique({ where: { id: card.id } });
    expect(Number(freshCard?.balance)).toBe(200000);
  });

  test('2. owner authorizes positive top_up request: moves to awaiting_customer and generates verify link', async () => {
    // Staff creates request
    const createRes = await request(app)
      .post(`/api/v1/businesses/${business.id}/voucher-requests`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({
        kind: 'top_up',
        customerId: customer.id,
        amount: 10000,
      });

    const requestId = createRes.body.data.id;

    // Owner authorizes
    const authRes = await request(app)
      .post(`/api/v1/businesses/${business.id}/voucher-requests/${requestId}/authorize`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({});

    expect(authRes.status).toBe(200);
    expect(authRes.body.success).toBe(true);
    expect(authRes.body.status).toBe('awaiting_customer');
    expect(authRes.body.verifyUrl).toContain(`/verify-voucher/${requestId}?token=`);

    // Verify DB state
    const dbReq = await testDb.voucherLedgerRequest.findUnique({ where: { id: requestId } });
    expect(dbReq?.status).toBe('awaiting_customer');
    expect(dbReq?.authorizedBy).toBe(owner.id);
    expect(dbReq?.verificationTokenHash).not.toBeNull();
  });

  test('3. sales_staff cannot authorize voucher requests (403)', async () => {
    const createRes = await request(app)
      .post(`/api/v1/businesses/${business.id}/voucher-requests`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({
        kind: 'top_up',
        customerId: customer.id,
        amount: 2000,
      });

    const requestId = createRes.body.data.id;

    const authRes = await request(app)
      .post(`/api/v1/businesses/${business.id}/voucher-requests/${requestId}/authorize`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({});

    expect(authRes.status).toBe(403);
  });

  test('4. Positive adjustment requires customer verification link', async () => {
    const createRes = await request(app)
      .post(`/api/v1/businesses/${business.id}/voucher-requests`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({
        kind: 'adjustment',
        customerId: customer.id,
        amount: 3000,
        reason: 'Refund for overcharge on receipt #4102',
      });

    expect(createRes.status).toBe(201);
    const requestId = createRes.body.data.id;

    const authRes = await request(app)
      .post(`/api/v1/businesses/${business.id}/voucher-requests/${requestId}/authorize`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({});

    expect(authRes.status).toBe(200);
    expect(authRes.body.status).toBe('awaiting_customer');
    expect(authRes.body.verifyUrl).toBeDefined();
  });

  test('5. Negative adjustment <= threshold (50k): manager can approve directly (applied immediately)', async () => {
    const cardBefore = await testDb.customerCard.findUnique({ where: { id: card.id } });
    const balanceBefore = Number(cardBefore?.balance);

    const createRes = await request(app)
      .post(`/api/v1/businesses/${business.id}/voucher-requests`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({
        kind: 'adjustment',
        customerId: customer.id,
        amount: -2000,
        reason: 'Correction of cashier entry error',
      });

    expect(createRes.status).toBe(201);
    const requestId = createRes.body.data.id;

    // Manager approves (2000 <= 50,000 threshold)
    const authRes = await request(app)
      .post(`/api/v1/businesses/${business.id}/voucher-requests/${requestId}/authorize`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({});

    expect(authRes.status).toBe(200);
    expect(authRes.body.status).toBe('applied');
    expect(authRes.body.balance).toBe(balanceBefore - 2000);

    // Verify card balance and ledger
    const cardAfter = await testDb.customerCard.findUnique({ where: { id: card.id } });
    expect(Number(cardAfter?.balance)).toBe(balanceBefore - 2000);

    const dbReq = await testDb.voucherLedgerRequest.findUnique({ where: { id: requestId } });
    expect(dbReq?.status).toBe('applied');
    expect(dbReq?.ledgerId).not.toBeNull();
  });

  test('6. Negative adjustment > threshold (50k): manager gets 403 ADJUSTMENT_REQUIRES_OWNER, owner gets 200', async () => {
    const createRes = await request(app)
      .post(`/api/v1/businesses/${business.id}/voucher-requests`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({
        kind: 'adjustment',
        customerId: customer.id,
        amount: -50001,
        reason: 'Correction for large transaction misentry',
      });

    expect(createRes.status).toBe(201);
    const requestId = createRes.body.data.id;

    // Manager tries to approve 50,001 -> 403
    const managerRes = await request(app)
      .post(`/api/v1/businesses/${business.id}/voucher-requests/${requestId}/authorize`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({});

    expect(managerRes.status).toBe(403);
    expect(managerRes.body.error?.code).toBe('ADJUSTMENT_REQUIRES_OWNER');

    // Owner approves same request -> 200
    const ownerRes = await request(app)
      .post(`/api/v1/businesses/${business.id}/voucher-requests/${requestId}/authorize`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({});

    expect(ownerRes.status).toBe(200);
    expect(ownerRes.body.status).toBe('applied');
  });

  test('7. Threshold edit: manager can update threshold and it dynamically gates approvals', async () => {
    // 1. Manager updates threshold to 20,000
    const updateRes = await request(app)
      .put(`/api/v1/businesses/${business.id}/settings/voucher-adjustment-threshold`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ threshold: 20000 });

    expect(updateRes.status).toBe(200);

    // 2. Fetch business to verify threshold
    const getBizRes = await request(app)
      .get(`/api/v1/businesses/${business.id}`)
      .set('Authorization', `Bearer ${managerToken}`);

    expect(Number(getBizRes.body.data.voucherAdjustmentThreshold)).toBe(20000);

    // 3. Staff requests -20001
    const createRes = await request(app)
      .post(`/api/v1/businesses/${business.id}/voucher-requests`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({
        kind: 'adjustment',
        customerId: customer.id,
        amount: -20001,
        reason: 'Deduction exceeding new 20k threshold',
      });

    const reqId = createRes.body.data.id;

    // 4. Manager approve of -20001 -> 403 (was <= 50k, now > 20k)
    const mRes = await request(app)
      .post(`/api/v1/businesses/${business.id}/voucher-requests/${reqId}/authorize`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({});

    expect(mRes.status).toBe(403);
    expect(mRes.body.error?.code).toBe('ADJUSTMENT_REQUIRES_OWNER');

    // 5. Owner can approve -> 200
    const oRes = await request(app)
      .post(`/api/v1/businesses/${business.id}/voucher-requests/${reqId}/authorize`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({});

    expect(oRes.status).toBe(200);

    // 6. Manager raises threshold to 100,000
    await request(app)
      .put(`/api/v1/businesses/${business.id}/settings/voucher-adjustment-threshold`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ threshold: 100000 });

    // 7. Staff requests -80000
    const createRes2 = await request(app)
      .post(`/api/v1/businesses/${business.id}/voucher-requests`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({
        kind: 'adjustment',
        customerId: customer.id,
        amount: -80000,
        reason: 'Large allowable deduction within 100k',
      });

    // 8. Manager can now approve -80000 -> 200
    const mRes2 = await request(app)
      .post(`/api/v1/businesses/${business.id}/voucher-requests/${createRes2.body.data.id}/authorize`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({});

    expect(mRes2.status).toBe(200);

    // 9. sales_staff calling threshold endpoint -> 403
    const staffThreshRes = await request(app)
      .put(`/api/v1/businesses/${business.id}/settings/voucher-adjustment-threshold`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ threshold: 10000 });

    expect(staffThreshRes.status).toBe(403);

    // 10. Validation bounds: threshold < 0 or > 10M -> 400
    const negRes = await request(app)
      .put(`/api/v1/businesses/${business.id}/settings/voucher-adjustment-threshold`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ threshold: -1 });

    expect(negRes.status).toBe(400);

    const maxRes = await request(app)
      .put(`/api/v1/businesses/${business.id}/settings/voucher-adjustment-threshold`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ threshold: 20000000 });

    expect(maxRes.status).toBe(400);
  });

  test('8. sales_staff top-up via compat shim returns 202 {request, status: "pending"}', async () => {
    const res = await request(app)
      .post(`/api/v1/businesses/${business.id}/customers/${customer.id}/card/top-up`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({
        amount: 2500,
        notes: 'Compat shim check',
      });

    expect(res.status).toBe(202);
    expect(res.body.success).toBe(true);
    expect(res.body.status).toBe('pending');
    expect(res.body.request).toBeDefined();
    expect(res.body.request.amount).toBe(2500);
  });

  test('9. Listing and filters: GET /voucher-requests works with query params', async () => {
    const res = await request(app)
      .get(`/api/v1/businesses/${business.id}/voucher-requests?limit=10&page=1`)
      .set('Authorization', `Bearer ${managerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.pagination).toBeDefined();
    expect(res.body.data.length).toBeGreaterThan(0);
  });

  test('10. Reject request: manager can reject a pending request with reason', async () => {
    const createRes = await request(app)
      .post(`/api/v1/businesses/${business.id}/voucher-requests`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({
        kind: 'top_up',
        customerId: customer.id,
        amount: 1500,
        notes: 'Mistaken deposit request',
      });

    const reqId = createRes.body.data.id;

    const rejectRes = await request(app)
      .post(`/api/v1/businesses/${business.id}/voucher-requests/${reqId}/reject`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ reason: 'Duplicate entry created by mistake' });

    expect(rejectRes.status).toBe(200);
    expect(rejectRes.body.data.status).toBe('rejected');
    expect(rejectRes.body.data.rejectReason).toBe('Duplicate entry created by mistake');
  });

  test('11. Resend verification link for request in awaiting_customer status', async () => {
    // Create and authorize a request
    const createRes = await request(app)
      .post(`/api/v1/businesses/${business.id}/voucher-requests`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({
        kind: 'top_up',
        customerId: customer.id,
        amount: 4000,
      });

    const reqId = createRes.body.data.id;

    await request(app)
      .post(`/api/v1/businesses/${business.id}/voucher-requests/${reqId}/authorize`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({});

    // Resend
    const resendRes = await request(app)
      .post(`/api/v1/businesses/${business.id}/voucher-requests/${reqId}/resend`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({});

    expect(resendRes.status).toBe(200);
    expect(resendRes.body.success).toBe(true);
    expect(resendRes.body.verifyUrl).toContain(`/verify-voucher/${reqId}?token=`);
  });
});
