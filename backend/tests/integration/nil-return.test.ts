import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApp } from '../../src/app';
import { config } from '../../src/config';
import { testDb, clearDatabase, createTestUser, createTestBusiness } from '../helpers/test-db';
import * as taxService from '../../src/services/tax.service';
import type { Application } from 'express';

jest.setTimeout(60000);

describe('QA-06: Statutory Nil Return Support Suite', () => {
  let app: Application;
  let user: any;
  let business: any;
  let token: string;

  beforeAll(async () => {
    app = createApp();
    await clearDatabase();

    user = await createTestUser(`qa-nil-return-${Date.now()}@example.com`);
    business = await createTestBusiness(user.id, 'Nil Return Traders Ltd');

    token = jwt.sign(
      { userId: user.id, email: user.email, role: 'user' },
      config.jwt.accessSecret,
      { expiresIn: '1h' }
    );
  }, 90000);

  afterAll(async () => {
    await clearDatabase();
    await testDb.$disconnect();
  }, 90000);

  test('concluded month with zero sales finalizes as statutory Nil Return with taxPayable 0 and isNilReturn true', async () => {
    const historicalYear = 2025;
    const historicalMonth = 3; // March 2025 (fully concluded)

    // Log an expense in March 2025, but NO sales
    await testDb.expense.create({
      data: {
        businessId: business.id,
        amount: 25000,
        category: 'rent',
        expenseDate: new Date(Date.UTC(historicalYear, historicalMonth - 1, 15)),
        isDeductible: true,
        description: 'Office rent during non-trading month',
      },
    });

    // 1. Calculate tax report for concluded month via API
    const calcRes = await request(app)
      .post(`/api/v1/businesses/${business.id}/tax/calculate`)
      .set('Authorization', `Bearer ${token}`)
      .send({ month: historicalMonth, year: historicalYear });

    expect([200, 201]).toContain(calcRes.status);
    const report = calcRes.body.data;
    expect(Number(report.totalSales)).toBe(0);
    expect(Number(report.totalExpenses)).toBe(25000);
    expect(report.isFinalized).toBe(false);

    // 2. Finalize the report via API
    const res = await request(app)
      .post(`/api/v1/businesses/${business.id}/tax/reports/${report.id}/finalize`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.isFinalized).toBe(true);
    expect(res.body.data.isNilReturn).toBe(true);
    expect(Number(res.body.data.taxPayable)).toBe(0);
    expect(Number(res.body.data.grossProfit)).toBe(0);

    // 3. Download Nil Return PDF statement / slip
    const slipRes = await request(app)
      .get(`/api/v1/businesses/${business.id}/tax/reports/${report.id}/slip`)
      .set('Authorization', `Bearer ${token}`);

    expect(slipRes.status).toBe(200);
    expect(slipRes.headers['content-type']).toBe('application/pdf');
    expect(slipRes.headers['content-disposition']).toContain('nil-tax-return-');

    // 4. Unfinalize and confirm isNilReturn resets to false
    const unfinRes = await request(app)
      .post(`/api/v1/businesses/${business.id}/tax/reports/${report.id}/unfinalize`)
      .set('Authorization', `Bearer ${token}`);

    expect(unfinRes.status).toBe(200);
    expect(unfinRes.body.data.isFinalized).toBe(false);
    expect(unfinRes.body.data.isNilReturn).toBe(false);
  });

  test('concluded month with sales > 0 finalizes as regular tax report with isNilReturn false', async () => {
    const historicalYear = 2025;
    const historicalMonth = 4; // April 2025 (fully concluded)

    // Log a sale in April 2025
    await testDb.salesTransaction.create({
      data: {
        businessId: business.id,
        amount: 100000,
        source: 'manual',
        status: 'confirmed',
        isTaxable: true,
        transactionDate: new Date(Date.UTC(historicalYear, historicalMonth - 1, 10)),
        createdBy: user.id,
        description: 'April trading sale',
      },
    });

    const calcRes = await request(app)
      .post(`/api/v1/businesses/${business.id}/tax/calculate`)
      .set('Authorization', `Bearer ${token}`)
      .send({ month: historicalMonth, year: historicalYear });

    expect([200, 201]).toContain(calcRes.status);
    const report = calcRes.body.data;
    expect(Number(report.totalSales)).toBe(100000);

    const res = await request(app)
      .post(`/api/v1/businesses/${business.id}/tax/reports/${report.id}/finalize`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.isFinalized).toBe(true);
    expect(res.body.data.isNilReturn).toBe(false);
    expect(Number(res.body.data.taxPayable)).toBe(7500); // 7.5% of 100,000

    const slipRes = await request(app)
      .get(`/api/v1/businesses/${business.id}/tax/reports/${report.id}/slip`)
      .set('Authorization', `Bearer ${token}`);

    expect(slipRes.status).toBe(200);
    expect(slipRes.headers['content-disposition']).toContain('tax-slip-');
  });
});
