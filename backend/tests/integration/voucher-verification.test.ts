import crypto from 'crypto';
import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import { createApp } from '../../src/app';
import type { Application } from 'express';
import { testDb, clearDatabase, createTestUser, createTestBusiness } from '../helpers/test-db';
import { runVoucherExpirySweep } from '../../src/jobs/voucher-cron';
import { toNumber } from '../../src/shared/helpers';

jest.setTimeout(180000);

describe('Voucher Verification Public Flow & Cron Integration', () => {
  let app: Application;
  let owner: any;
  let business: any;
  let customer: any;
  let card: any;

  beforeAll(async () => {
    app = createApp();

    const timestamp = Date.now();
    owner = await createTestUser(`verify-owner-${timestamp}@example.com`);
    business = await createTestBusiness(owner.id, 'Voucher Verification Supermart');

    // Create a customer with a virtual card
    customer = await testDb.customer.create({
      data: {
        businessId: business.id,
        name: 'Olumide Bakare',
        phone: '+2348021122334',
        email: 'olumide.bakare@example.com',
      },
    });

    card = await testDb.customerCard.create({
      data: {
        businessId: business.id,
        customerId: customer.id,
        cardCode: 'VCH-VERIFY-101',
        balance: 5000,
        pinHash: '$2b$10$abcdefghijklmnopqrstuvwxyz1234567890',
        pinAttempts: 0,
      },
    });
  });

  afterAll(async () => {
    await clearDatabase();
  });

  // Helper to generate a voucher request in awaiting_customer status with known raw token
  const createAwaitingRequest = async (opts?: {
    amount?: number;
    bonusPct?: number;
    bonusAmount?: number;
    expiresAt?: Date;
    status?: any;
  }) => {
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const amount = opts?.amount ?? 10000;
    const bonusPct = opts?.bonusPct ?? 5;
    const bonusAmount = opts?.bonusAmount ?? 500;
    const expiresAt = opts?.expiresAt ?? new Date(Date.now() + 24 * 3600 * 1000);
    const status = opts?.status ?? 'awaiting_customer';

    const reqRecord = await testDb.voucherLedgerRequest.create({
      data: {
        businessId: business.id,
        customerId: customer.id,
        cardId: card.id,
        kind: 'top_up',
        amount,
        bonusPct,
        bonusAmount,
        status,
        source: 'crm',
        createdBy: owner.id,
        authorizedBy: owner.id,
        authorizedAt: new Date(),
        verificationTokenHash: status === 'verified' ? null : tokenHash,
        verificationExpiresAt: expiresAt,
        customerName: customer.name,
        customerPhone: customer.phone,
        customerEmail: customer.email,
        notes: 'Verification test deposit',
      },
    });

    return { reqRecord, rawToken };
  };

  describe('GET /api/v1/public/voucher-verify/:id — Preview Endpoint', () => {
    test('should return 200 with customer and voucher preview details when token is valid', async () => {
      const { reqRecord, rawToken } = await createAwaitingRequest();

      const res = await request(app)
        .get(`/api/v1/public/voucher-verify/${reqRecord.id}`)
        .query({ token: rawToken });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toMatchObject({
        id: reqRecord.id,
        businessId: business.id,
        businessName: business.businessName,
        customerName: customer.name,
        customerPhone: customer.phone,
        amount: 10000,
        bonusAmount: 500,
        bonusPct: 5,
        totalCredit: 10500,
      });
      expect(res.body.data.cardCode).toBe(card.cardCode);
    });

    test('should reject request without token with 400', async () => {
      const { reqRecord } = await createAwaitingRequest();

      const res = await request(app).get(`/api/v1/public/voucher-verify/${reqRecord.id}`);

      expect(res.status).toBe(400);
      expect(res.body.error?.message || res.body.message).toMatch(/token is required/i);
    });

    test('should reject request with invalid/tampered token with 401', async () => {
      const { reqRecord } = await createAwaitingRequest();

      const res = await request(app)
        .get(`/api/v1/public/voucher-verify/${reqRecord.id}`)
        .query({ token: 'wrong-tampered-token-12345' });

      expect(res.status).toBe(401);
      expect(res.body.error?.message || res.body.message).toMatch(/invalid.*token/i);
    });

    test('should return 410 when request has expired', async () => {
      const expiredDate = new Date(Date.now() - 3600 * 1000); // 1 hour ago
      const { reqRecord, rawToken } = await createAwaitingRequest({
        expiresAt: expiredDate,
      });

      const res = await request(app)
        .get(`/api/v1/public/voucher-verify/${reqRecord.id}`)
        .query({ token: rawToken });

      expect(res.status).toBe(410);
      expect(res.body.error?.message || res.body.message).toMatch(/expired/i);
    });

    test('should return 409 when request is already verified', async () => {
      const { reqRecord, rawToken } = await createAwaitingRequest();

      // Manually mark as verified
      await testDb.voucherLedgerRequest.update({
        where: { id: reqRecord.id },
        data: { status: 'verified' },
      });

      const res = await request(app)
        .get(`/api/v1/public/voucher-verify/${reqRecord.id}`)
        .query({ token: rawToken });

      expect(res.status).toBe(409);
      expect(res.body.error?.message || res.body.message).toMatch(/already.*verified/i);
    });

    test('should return 404 when request id does not exist', async () => {
      const res = await request(app)
        .get('/api/v1/public/voucher-verify/non-existent-request-uuid')
        .query({ token: 'some-token' });

      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/v1/public/voucher-verify/:id — Confirm Endpoint', () => {
    test('should successfully confirm voucher credit, update card balance, create ledger entry, and transition status to verified', async () => {
      const { reqRecord, rawToken } = await createAwaitingRequest({
        amount: 20000,
        bonusAmount: 1000,
        bonusPct: 5,
      });

      const initialCard = await testDb.customerCard.findUnique({ where: { id: card.id } });
      const initialBalance = toNumber(initialCard!.balance);

      const res = await request(app)
        .post(`/api/v1/public/voucher-verify/${reqRecord.id}`)
        .send({ token: rawToken });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.already_verified).toBe(false);
      expect(res.body.totalCredit).toBe(21000);
      expect(res.body.balance).toBe(initialBalance + 21000);

      // Verify DB state: Card balance updated
      const updatedCard = await testDb.customerCard.findUnique({ where: { id: card.id } });
      expect(toNumber(updatedCard!.balance)).toBe(initialBalance + 21000);

      // Verify DB state: Ledger entry created
      const ledger = await testDb.customerCardLedger.findFirst({
        where: { cardId: card.id },
        orderBy: { createdAt: 'desc' },
      });
      expect(ledger).toBeTruthy();
      expect(ledger!.type).toBe('top_up');
      expect(toNumber(ledger!.amount)).toBe(21000);
      expect(toNumber(ledger!.balanceBefore)).toBe(initialBalance);
      expect(toNumber(ledger!.balanceAfter)).toBe(initialBalance + 21000);

      // Verify DB state: Voucher request marked verified
      const updatedReq = await testDb.voucherLedgerRequest.findUnique({
        where: { id: reqRecord.id },
      });
      expect(updatedReq!.status).toBe('verified');
      expect(updatedReq!.ledgerId).toBe(ledger!.id);
      expect(updatedReq!.verifiedAt).toBeTruthy();
      expect(updatedReq!.verificationTokenHash).toBeNull();
    });

    test('should provide replay protection and return 200 with already_verified: true when called again', async () => {
      const { reqRecord, rawToken } = await createAwaitingRequest({
        amount: 5000,
        bonusAmount: 0,
        bonusPct: 0,
      });

      // First confirmation
      const res1 = await request(app)
        .post(`/api/v1/public/voucher-verify/${reqRecord.id}`)
        .send({ token: rawToken });
      expect(res1.status).toBe(200);
      expect(res1.body.already_verified).toBe(false);

      const balanceAfterFirst = res1.body.balance;

      // Second confirmation (replay attack or duplicate click)
      const res2 = await request(app)
        .post(`/api/v1/public/voucher-verify/${reqRecord.id}`)
        .send({ token: rawToken });

      expect(res2.status).toBe(200);
      expect(res2.body.success).toBe(true);
      expect(res2.body.already_verified).toBe(true);

      // Ensure balance was NOT double-credited
      const freshCard = await testDb.customerCard.findUnique({ where: { id: card.id } });
      expect(toNumber(freshCard!.balance)).toBe(balanceAfterFirst);
    });

    test('should reject confirmation with invalid token with 401', async () => {
      const { reqRecord } = await createAwaitingRequest();

      const res = await request(app)
        .post(`/api/v1/public/voucher-verify/${reqRecord.id}`)
        .send({ token: 'bogus-token' });

      expect(res.status).toBe(401);
      expect(res.body.error?.message || res.body.message).toMatch(/invalid.*token/i);
    });

    test('should reject confirmation on expired request with 410', async () => {
      const expiredDate = new Date(Date.now() - 3600 * 1000);
      const { reqRecord, rawToken } = await createAwaitingRequest({
        expiresAt: expiredDate,
      });

      const res = await request(app)
        .post(`/api/v1/public/voucher-verify/${reqRecord.id}`)
        .send({ token: rawToken });

      expect(res.status).toBe(410);
      expect(res.body.error?.message || res.body.message).toMatch(/expired/i);
    });

    test('should reject confirmation on rejected request with 400', async () => {
      const { reqRecord, rawToken } = await createAwaitingRequest({
        status: 'rejected',
      });

      const res = await request(app)
        .post(`/api/v1/public/voucher-verify/${reqRecord.id}`)
        .send({ token: rawToken });

      expect(res.status).toBe(400);
      expect(res.body.error?.message || res.body.message).toMatch(/rejected/i);
    });
  });

  describe('Voucher Expiry Cron Sweep', () => {
    test('should sweep expired awaiting_customer requests and transition status to expired', async () => {
      // 1. Create request with expired date
      const expiredPast = new Date(Date.now() - 7200 * 1000); // 2 hours ago
      const { reqRecord: expiredReq } = await createAwaitingRequest({
        expiresAt: expiredPast,
      });

      // 2. Create request with active future expiry date
      const activeFuture = new Date(Date.now() + 36000 * 1000); // 10 hours from now
      const { reqRecord: activeReq } = await createAwaitingRequest({
        expiresAt: activeFuture,
      });

      // Execute sweep directly with bypassLock
      const sweepResult = await runVoucherExpirySweep({ bypassLock: true });
      expect(sweepResult.expiredCount).toBeGreaterThanOrEqual(1);

      // Verify that expiredReq status changed to expired
      const updatedExpired = await testDb.voucherLedgerRequest.findUnique({
        where: { id: expiredReq.id },
      });
      expect(updatedExpired!.status).toBe('expired');
      expect(updatedExpired!.verificationTokenHash).toBeNull();

      // Verify that activeReq remains awaiting_customer
      const updatedActive = await testDb.voucherLedgerRequest.findUnique({
        where: { id: activeReq.id },
      });
      expect(updatedActive!.status).toBe('awaiting_customer');
      expect(updatedActive!.verificationTokenHash).not.toBeNull();
    });
  });
});
