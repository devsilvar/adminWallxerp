import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import { createApp } from '../../src/app';
import type { Application } from 'express';
import { testDb, clearDatabase, createTestUser, createTestBusiness } from '../helpers/test-db';
import { invalidateOwnershipCache } from '../../src/lib/ownership';
import jwt from 'jsonwebtoken';
import config from '../../src/config';

jest.setTimeout(120000);

describe('Sales-Inline Quick Create Customer With Voucher Integration', () => {
  let app: Application;
  let owner: any;
  let ownerToken: string;
  let staff: any;
  let staffToken: string;
  let business: any;

  beforeAll(async () => {
    app = createApp();

    owner = await createTestUser(`inline-owner-${Date.now()}@example.com`);
    staff = await createTestUser(`inline-staff-${Date.now()}@example.com`);

    business = await createTestBusiness(owner.id, 'Inline Voucher Supermarket');

    // Add sales_staff to business
    await testDb.businessMember.create({
      data: {
        businessId: business.id,
        userId: staff.id,
        role: 'sales_staff',
        isActive: true,
      },
    });

    invalidateOwnershipCache(business.id, owner.id);
    invalidateOwnershipCache(business.id, staff.id);

    ownerToken = jwt.sign(
      { userId: owner.id, email: owner.email, role: 'user' },
      config.jwt.accessSecret,
      { expiresIn: '1h' }
    );

    staffToken = jwt.sign(
      { userId: staff.id, email: staff.email, role: 'user' },
      config.jwt.accessSecret,
      { expiresIn: '1h' }
    );
  }, 90000);

  afterAll(async () => {
    await clearDatabase();
    await testDb.$disconnect();
  }, 90000);

  test('1. Validation: phone="123" returns 400 with INVALID_PHONE_LENGTH', async () => {
    const res = await request(app)
      .post(`/api/v1/businesses/${business.id}/customers/quick-create-with-voucher`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({
        name: 'Short Phone User',
        phone: '123',
      });

    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe('INVALID_PHONE_LENGTH');
  });

  test('2. Validation: initialTopUpAmount=11_000_000 returns 400', async () => {
    const res = await request(app)
      .post(`/api/v1/businesses/${business.id}/customers/quick-create-with-voucher`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({
        name: 'Excessive TopUp User',
        phone: '08031112233',
        initialTopUpAmount: 11_000_000,
      });

    expect(res.status).toBe(400);
  });

  test('3. Creating with Fund=0 creates Customer+Card with balance 0 and NO VoucherLedgerRequest', async () => {
    const res = await request(app)
      .post(`/api/v1/businesses/${business.id}/customers/quick-create-with-voucher`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({
        name: 'Zero Fund Customer',
        phone: '08039998877',
        initialTopUpAmount: 0,
      });

    expect(res.status).toBe(201);
    expect(res.body.data.customer).toBeDefined();
    expect(res.body.data.card).toBeDefined();
    expect(Number(res.body.data.card.balance)).toBe(0);
    expect(res.body.data.voucherRequest).toBeNull();

    // Verify in database: NO voucher request was inserted
    const requestInDb = await testDb.voucherLedgerRequest.findFirst({
      where: {
        businessId: business.id,
        customerId: res.body.data.customer.id,
      },
    });
    expect(requestInDb).toBeNull();
  });

  test('4. Creating with Fund=2000 as sales_staff creates customer, card, and pending VoucherLedgerRequest', async () => {
    const res = await request(app)
      .post(`/api/v1/businesses/${business.id}/customers/quick-create-with-voucher`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({
        name: 'Tunde A.',
        phone: '08035554433',
        email: 'tunde@example.com',
        initialTopUpAmount: 2000,
      });

    expect(res.status).toBe(201);
    const { customer, card, voucherRequest } = res.body.data;
    expect(customer.name).toBe('Tunde A.');
    expect(Number(card.balance)).toBe(0); // Card balance remains 0 until authorization + verification
    expect(voucherRequest).toBeDefined();
    expect(voucherRequest.status).toBe('pending');
    expect(voucherRequest.kind).toBe('top_up');
    expect(Number(voucherRequest.amount)).toBe(2000);
    expect(voucherRequest.source).toBe('sales_inline');
    expect(voucherRequest.createdBy).toBe(staff.id);

    // Verify in DB
    const requestInDb = await testDb.voucherLedgerRequest.findUnique({
      where: { id: voucherRequest.id },
    });
    expect(requestInDb).not.toBeNull();
    expect(requestInDb?.status).toBe('pending');
  });

  test('5. Creating sale with source=bank_transfer links to the newly created customer', async () => {
    // 1. Quick-create customer with voucher
    const createRes = await request(app)
      .post(`/api/v1/businesses/${business.id}/customers/quick-create-with-voucher`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({
        name: 'Bank Transfer Customer',
        phone: '08023334455',
        initialTopUpAmount: 5000,
      });

    expect(createRes.status).toBe(201);
    const newCustomerId = createRes.body.data.customer.id;

    // 2. Post a sale with bank_transfer linked to this customer
    const saleRes = await request(app)
      .post(`/api/v1/businesses/${business.id}/sales`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({
        amount: 15000,
        source: 'bank_transfer',
        description: 'Payment via bank transfer for supplies',
        customerId: newCustomerId,
        transactionDate: new Date().toISOString(),
      });

    expect(saleRes.status).toBe(201);
    expect(saleRes.body.data.customerId).toBe(newCustomerId);

    // 3. Verify GET /customers/:id exists and has the customer
    const getCustRes = await request(app)
      .get(`/api/v1/businesses/${business.id}/customers/${newCustomerId}`)
      .set('Authorization', `Bearer ${staffToken}`);

    expect(getCustRes.status).toBe(200);
    expect(getCustRes.body.data.customer.id).toBe(newCustomerId);
    expect(getCustRes.body.data.customer.name).toBe('Bank Transfer Customer');

    // 4. Verify GET /sales?customerId=... shows the sale
    const getSalesRes = await request(app)
      .get(`/api/v1/businesses/${business.id}/sales?customerId=${newCustomerId}`)
      .set('Authorization', `Bearer ${staffToken}`);

    expect(getSalesRes.status).toBe(200);
    expect(getSalesRes.body.data.length).toBeGreaterThanOrEqual(1);
    expect(getSalesRes.body.data[0].id).toBe(saleRes.body.data.id);
  });

  test('6. Phone collision reuses existing customer (no duplicate row) and creates funded VoucherLedgerRequest', async () => {
    // Register initial customer
    const firstRes = await request(app)
      .post(`/api/v1/businesses/${business.id}/customers/quick-create-with-voucher`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({
        name: 'Original Name',
        phone: '08091112233',
        initialTopUpAmount: 0,
      });

    expect(firstRes.status).toBe(201);
    const existingId = firstRes.body.data.customer.id;

    // Call again with +234 equivalent of the same phone number
    const secondRes = await request(app)
      .post(`/api/v1/businesses/${business.id}/customers/quick-create-with-voucher`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({
        name: 'Original Name',
        phone: '+2348091112233',
        initialTopUpAmount: 3500,
      });

    expect(secondRes.status).toBe(201);
    expect(secondRes.body.data.customer.id).toBe(existingId); // Reused same customer
    expect(secondRes.body.data.voucherRequest).toBeDefined();
    expect(Number(secondRes.body.data.voucherRequest.amount)).toBe(3500);

    // Verify DB count: only 1 customer exists with that phone
    const customerCount = await testDb.customer.count({
      where: {
        businessId: business.id,
        phone: { contains: '8091112233' },
      },
    });
    expect(customerCount).toBe(1);
  });

  test('7. source=store_voucher still requires PIN/last4 authentication (inline-create does not bypass)', async () => {
    const saleRes = await request(app)
      .post(`/api/v1/businesses/${business.id}/sales`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({
        amount: 2500,
        source: 'store_voucher',
        description: 'Attempt voucher spend without metadata',
        transactionDate: new Date().toISOString(),
      });

    // Attempting store_voucher spend without voucherPin/voucherLast4 fails validation
    expect(saleRes.status).toBe(400);
  });
});
