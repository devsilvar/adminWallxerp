import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApp } from '../../src/app';
import { config } from '../../src/config';
import { testDb, clearDatabase, createTestUser, createTestBusiness } from '../helpers/test-db';
import * as taxService from '../../src/services/tax.service';
import type { Application } from 'express';

jest.setTimeout(60000);

describe('Senior Architecture QA: Month-End Tax Finalization Gate & Lifecycle', () => {
  let app: Application;
  let user: any;
  let business: any;
  let token: string;

  beforeAll(async () => {
    app = createApp();
    await clearDatabase();

    user = await createTestUser('qa-tax-gate@example.com');
    business = await createTestBusiness(user.id, 'QA Tax Gate Enterprises Ltd');

    token = jwt.sign(
      { userId: user.id, email: user.email, role: 'user' },
      config.jwt.accessSecret,
      { expiresIn: '1h' }
    );
  }, 40000);

  afterAll(async () => {
    await clearDatabase();
    await testDb.$disconnect();
  }, 40000);

  // ═══════════════════════════════════════════════════════════════
  // 1. ACTIVE MONTH PREMATURE FINALIZATION REJECTION
  // ═══════════════════════════════════════════════════════════════

  test('TC-01: Reject premature finalization of active ongoing month (HTTP 400 PERIOD_STILL_ACTIVE)', async () => {
    const now = new Date();
    const currentMonth = now.getUTCMonth() + 1;
    const currentYear = now.getUTCFullYear();

    // 1. Create a sale in the current ongoing month
    await testDb.salesTransaction.create({
      data: {
        businessId: business.id,
        amount: 80000,
        source: 'manual',
        status: 'confirmed',
        isTaxable: true,
        transactionDate: now,
        createdBy: user.id,
        description: 'Mid-month sale',
      },
    });

    // 2. Calculate tax for the current month
    const calcResult = await taxService.calculateTax(user.id, business.id, currentMonth, currentYear);
    expect(Number(calcResult.totalSales)).toBe(80000);
    expect(calcResult.isFinalized).toBe(false);

    // 3. Attempt to finalize the current active month prematurely without override
    // MUST FAIL with 400 PERIOD_STILL_ACTIVE (unless today happens to be the last calendar day)
    const lastDayOfMonth = new Date(Date.UTC(currentYear, currentMonth, 0)).getUTCDate();
    const isLastDay = now.getUTCDate() === lastDayOfMonth;

    if (!isLastDay) {
      await expect(
        taxService.finalizeReport(user.id, business.id, calcResult.id)
      ).rejects.toMatchObject({
        statusCode: 400,
        code: 'PERIOD_STILL_ACTIVE',
      });

      // Verify the report remains unfinalized in DB
      const freshReport = await testDb.monthlyTaxReport.findUnique({ where: { id: calcResult.id } });
      expect(freshReport?.isFinalized).toBe(false);
    }
  });

  // ═══════════════════════════════════════════════════════════════
  // 2. OPERATIONAL EARLY CLOSURE OVERRIDE
  // ═══════════════════════════════════════════════════════════════

  test('TC-02: Allow early closure override with explicit forceEarlyClosure acknowledgement', async () => {
    const now = new Date();
    const currentMonth = now.getUTCMonth() + 1;
    const currentYear = now.getUTCFullYear();

    const report = await testDb.monthlyTaxReport.findUnique({
      where: {
        businessId_taxMonth: {
          businessId: business.id,
          taxMonth: new Date(Date.UTC(currentYear, currentMonth - 1, 1)),
        },
      },
    });
    expect(report).not.toBeNull();

    // Finalize with early closure flag
    const finalized = await taxService.finalizeReport(user.id, business.id, report!.id, {
      forceEarlyClosure: true,
    });

    expect(finalized.isFinalized).toBe(true);

    // Un-finalize so subsequent test cases can reuse or clean up
    await taxService.unfinalizeReport(user.id, business.id, report!.id);
  });

  // ═══════════════════════════════════════════════════════════════
  // 3. ATOMIC RECALCULATION PREVENTS STALE NUMBERS
  // ═══════════════════════════════════════════════════════════════

  test('TC-03: Atomic fresh recalculation updates report with sales logged after initial calculation', async () => {
    // Target a past closed month: 2 months ago
    const pastDate = new Date();
    pastDate.setUTCMonth(pastDate.getUTCMonth() - 2);
    const pastMonth = pastDate.getUTCMonth() + 1;
    const pastYear = pastDate.getUTCFullYear();

    const midMonthDate = new Date(Date.UTC(pastYear, pastMonth - 1, 10));
    const lateMonthDate = new Date(Date.UTC(pastYear, pastMonth - 1, 25));

    // 1. Log initial sale of ₦100,000 on Day 10
    await testDb.salesTransaction.create({
      data: {
        businessId: business.id,
        amount: 100000,
        source: 'manual',
        status: 'confirmed',
        isTaxable: true,
        transactionDate: midMonthDate,
        createdBy: user.id,
        description: 'Day 10 sale',
      },
    });

    // 2. Initial tax calculation at Day 10 (Total Sales: ₦100,000, Tax: ₦7,500)
    const initialReport = await taxService.calculateTax(user.id, business.id, pastMonth, pastYear);
    expect(Number(initialReport.totalSales)).toBe(100000);
    expect(Number(initialReport.taxPayable)).toBe(7500);

    // 3. User makes another sale of ₦50,000 on Day 25
    await testDb.salesTransaction.create({
      data: {
        businessId: business.id,
        amount: 50000,
        source: 'manual',
        status: 'confirmed',
        isTaxable: true,
        transactionDate: lateMonthDate,
        createdBy: user.id,
        description: 'Day 25 sale',
      },
    });

    // 4. Finalize the past month report (WITHOUT manually calling calculateTax again)
    // The atomic recalculation in finalizeReport MUST refresh numbers to ₦150,000 / ₦11,250!
    const finalized = await taxService.finalizeReport(user.id, business.id, initialReport.id);

    expect(Number(finalized.totalSales)).toBe(150000);
    expect(Number(finalized.taxPayable)).toBe(11250); // 7.5% of ₦150,000
    expect(finalized.isFinalized).toBe(true);

    // Verify DB reflects fresh numbers
    const dbReport = await testDb.monthlyTaxReport.findUnique({ where: { id: initialReport.id } });
    expect(Number(dbReport?.totalSales)).toBe(150000);
    expect(Number(dbReport?.taxPayable)).toBe(11250);
  });

  // ═══════════════════════════════════════════════════════════════
  // 4. AUTOMATED DAY 1 PERIOD CLOSING SWEEP
  // ═══════════════════════════════════════════════════════════════

  test('TC-04: autoFinalizeConcludedMonth automatically seals concluded month with live totals', async () => {
    // Target 3 months ago
    const pastDate = new Date();
    pastDate.setUTCMonth(pastDate.getUTCMonth() - 3);
    const targetMonth = pastDate.getUTCMonth() + 1;
    const targetYear = pastDate.getUTCFullYear();
    const txnDate = new Date(Date.UTC(targetYear, targetMonth - 1, 15));

    // Log sales
    await testDb.salesTransaction.create({
      data: {
        businessId: business.id,
        amount: 200000,
        source: 'manual',
        status: 'confirmed',
        isTaxable: true,
        transactionDate: txnDate,
        createdBy: user.id,
        description: 'Auto-finalize test sale',
      },
    });

    // Run auto-finalize
    const autoResult = await taxService.autoFinalizeConcludedMonth(business.id, targetMonth, targetYear);

    expect(autoResult).not.toBeNull();
    expect(autoResult?.isFinalized).toBe(true);
    expect(Number(autoResult?.totalSales)).toBe(200000);
    expect(Number(autoResult?.taxPayable)).toBe(15000); // 7.5% of ₦200,000
  });

  // ═══════════════════════════════════════════════════════════════
  // 5. HTTP API END-TO-END SUPERTEST
  // ═══════════════════════════════════════════════════════════════

  test('TC-05: HTTP POST /finalize respects month gate and early closure payload', async () => {
    const now = new Date();
    const currentMonth = now.getUTCMonth() + 1;
    const currentYear = now.getUTCFullYear();
    const lastDayOfMonth = new Date(Date.UTC(currentYear, currentMonth, 0)).getUTCDate();
    const isLastDay = now.getUTCDate() === lastDayOfMonth;

    const report = await testDb.monthlyTaxReport.findUnique({
      where: {
        businessId_taxMonth: {
          businessId: business.id,
          taxMonth: new Date(Date.UTC(currentYear, currentMonth - 1, 1)),
        },
      },
    });
    expect(report).not.toBeNull();

    if (!isLastDay) {
      // 1. Without flag → 400 PERIOD_STILL_ACTIVE
      const failRes = await request(app)
        .post(`/api/v1/businesses/${business.id}/tax/reports/${report!.id}/finalize`)
        .set('Authorization', `Bearer ${token}`)
        .send({});

      expect(failRes.status).toBe(400);
      expect(failRes.body.error.code).toBe('PERIOD_STILL_ACTIVE');

      // 2. With forceEarlyClosure: true → 200 OK
      const successRes = await request(app)
        .post(`/api/v1/businesses/${business.id}/tax/reports/${report!.id}/finalize`)
        .set('Authorization', `Bearer ${token}`)
        .send({ forceEarlyClosure: true });

      expect(successRes.status).toBe(200);
      expect(successRes.body.success).toBe(true);
      expect(successRes.body.data.isFinalized).toBe(true);
    }
  });
});
