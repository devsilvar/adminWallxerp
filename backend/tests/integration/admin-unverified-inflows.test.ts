import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApp } from '../../src/app';
import { config } from '../../src/config';
import { testDb, clearDatabase, createTestUser, createTestBusiness } from '../helpers/test-db';
import type { Application } from 'express';

jest.setTimeout(60000);

describe('Admin Unverified Inflows & Reassignment API', () => {
  let app: Application;
  let adminUser: any;
  let merchantUser: any;
  let foreignUser: any;
  let businessA: any;
  let businessB: any;
  let foreignBusiness: any;
  let adminToken: string;
  let merchantToken: string;

  beforeAll(async () => {
    app = createApp();
    await clearDatabase();

    // Ensure Product Sale classification exists
    await testDb.transactionClassification.upsert({
      where: { name: 'Product Sale' },
      update: { isActive: true, isRevenue: true, taxTreatment: 'taxable' },
      create: {
        name: 'Product Sale',
        category: 'revenue',
        taxTreatment: 'taxable',
        isRevenue: true,
        isActive: true,
        description: 'Standard product sales revenue',
      },
    });

    // Create Admin User
    adminUser = await testDb.user.create({
      data: {
        email: `test-admin-${Date.now()}@example.com`,
        passwordHash: '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5GyJSawHByQBW',
        role: 'admin',
        isVerified: true,
        isActive: true,
      },
    });

    // Create Merchant User with two businesses
    merchantUser = await createTestUser(`test-merchant-${Date.now()}@example.com`);
    businessA = await createTestBusiness(merchantUser.id, 'Alpha Retail Store');
    businessB = await createTestBusiness(merchantUser.id, 'Alpha Wholesale Ltd');

    await testDb.walletBalance.create({
      data: {
        userId: merchantUser.id,
        balance: 100000,
        lockedBalance: 0,
      },
    });

    // Create Foreign Merchant User with one business
    foreignUser = await createTestUser(`test-foreign-${Date.now()}@example.com`);
    foreignBusiness = await createTestBusiness(foreignUser.id, 'Foreign Enterprises');

    adminToken = jwt.sign(
      { userId: adminUser.id, email: adminUser.email, role: 'admin' },
      config.jwt.accessSecret,
      { expiresIn: '1h' }
    );

    merchantToken = jwt.sign(
      { userId: merchantUser.id, email: merchantUser.email, role: 'user' },
      config.jwt.accessSecret,
      { expiresIn: '1h' }
    );
  }, 30000);

  afterAll(async () => {
    await clearDatabase();
    await testDb.$disconnect();
  }, 30000);

  test('GET /api/v1/admin/sales/unverified - rejects non-admin users with 403', async () => {
    const res = await request(app)
      .get('/api/v1/admin/sales/unverified')
      .set('Authorization', `Bearer ${merchantToken}`);

    expect(res.status).toBe(403);
  });

  test('GET /api/v1/admin/sales/unverified - lists unverified sales with sibling businesses for admin', async () => {
    // Create an unverified sale on businessA
    const sale = await testDb.salesTransaction.create({
      data: {
        businessId: businessA.id,
        amount: 45000,
        source: 'bank_transfer',
        status: 'pending',
        needsVerification: true,
        referenceId: `REF-TEST-${Date.now()}`,
        transactionDate: new Date(),
        customerHint: 'Direct Transfer',
      },
    });

    const res = await request(app)
      .get('/api/v1/admin/sales/unverified')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);

    const found = res.body.data.find((s: any) => s.id === sale.id);
    expect(found).toBeDefined();
    expect(found.business.id).toBe(businessA.id);
    expect(found.business.businessName).toBe('Alpha Retail Store');
    expect(Array.isArray(found.siblingBusinesses)).toBe(true);

    // businessB must be listed as sibling business
    const siblingB = found.siblingBusinesses.find((b: any) => b.id === businessB.id);
    expect(siblingB).toBeDefined();
    expect(siblingB.businessName).toBe('Alpha Wholesale Ltd');

    // foreignBusiness must NOT be listed in siblings
    const foreign = found.siblingBusinesses.find((b: any) => b.id === foreignBusiness.id);
    expect(foreign).toBeUndefined();
  });

  test('PATCH /api/v1/admin/sales/:saleId/reassign - atomic reallocation & wallet synchronization', async () => {
    const ref = `REF-REASSIGN-${Date.now()}`;
    const sale = await testDb.salesTransaction.create({
      data: {
        businessId: businessA.id,
        amount: 80000,
        source: 'bank_transfer',
        status: 'confirmed',
        needsVerification: false,
        referenceId: ref,
        transactionDate: new Date(),
      },
    });

    const wallet = await testDb.walletBalance.findUnique({ where: { userId: merchantUser.id } });
    const walletTx = await testDb.walletTransaction.create({
      data: {
        walletId: wallet!.id,
        businessId: businessA.id,
        userId: merchantUser.id,
        amount: 80000,
        netAmount: 80000,
        balanceAfter: 80000,
        type: 'credit',
        source: 'dva_inflow',
        reference: `WAL-${ref}`,
        linkedSaleId: sale.id,
      },
    });

    // 1. Same business returns 400
    const sameRes = await request(app)
      .patch(`/api/v1/admin/sales/${sale.id}/reassign`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ targetBusinessId: businessA.id });

    expect(sameRes.status).toBe(400);

    // 2. Foreign business returns 403 (sibling constraint)
    const foreignRes = await request(app)
      .patch(`/api/v1/admin/sales/${sale.id}/reassign`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ targetBusinessId: foreignBusiness.id });

    expect(foreignRes.status).toBe(403);

    // 3. Successful reallocation to sibling businessB
    const successRes = await request(app)
      .patch(`/api/v1/admin/sales/${sale.id}/reassign`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ targetBusinessId: businessB.id });

    expect(successRes.status).toBe(200);
    expect(successRes.body.success).toBe(true);

    // Verify sale businessId updated
    const updatedSale = await testDb.salesTransaction.findUnique({ where: { id: sale.id } });
    expect(updatedSale?.businessId).toBe(businessB.id);

    // Verify linked walletTransaction businessId atomically updated (DVA-ALLOC-01)
    const updatedWalletTx = await testDb.walletTransaction.findUnique({ where: { id: walletTx.id } });
    expect(updatedWalletTx?.businessId).toBe(businessB.id);

    // Verify audit log attribution to adminUser
    const audit = await testDb.auditLog.findFirst({
      where: {
        action: 'sale.reassigned',
        resourceId: sale.id,
      },
      orderBy: { createdAt: 'desc' },
    });
    expect(audit).toBeDefined();
    expect(audit?.userId).toBe(adminUser.id);
  });

  test('PATCH /api/v1/admin/sales/:saleId/reassign - cascades invoice reassignment to target business', async () => {
    // When an invoice-linked sale is reassigned, the linked invoice must atomically
    // move to the target business as well, keeping both entities synchronized.
    const stamp = Date.now();
    const sale = await testDb.salesTransaction.create({
      data: {
        businessId: businessA.id,
        amount: 60000,
        source: 'cash', // invoice settled in cash is stamped 'cash', not 'invoice'
        status: 'confirmed',
        needsVerification: false,
        referenceId: `REF-ACCRUAL-${stamp}`,
        transactionDate: new Date(),
      },
    });

    await testDb.invoice.create({
      data: {
        businessId: businessA.id,
        invoiceNumber: `INV-ACCRUAL-${stamp}`,
        status: 'paid',
        issueDate: new Date(),
        dueDate: new Date(),
        customerName: 'Accrual Customer',
        subtotal: 60000,
        vatAmount: 0,
        total: 60000,
        linkedSaleId: sale.id,
        paymentMethod: 'cash',
      },
    });

    const res = await request(app)
      .patch(`/api/v1/admin/sales/${sale.id}/reassign`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ targetBusinessId: businessB.id });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // Both sale and invoice must now belong to target businessB
    const updatedSale = await testDb.salesTransaction.findUnique({ where: { id: sale.id } });
    expect(updatedSale?.businessId).toBe(businessB.id);

    const updatedInvoice = await testDb.invoice.findFirst({ where: { linkedSaleId: sale.id } });
    expect(updatedInvoice?.businessId).toBe(businessB.id);
  });

  test('PATCH /api/v1/admin/sales/:saleId/reassign - refuses a customer-credit sale', async () => {
    const stamp = Date.now();
    const sale = await testDb.salesTransaction.create({
      data: {
        businessId: businessA.id,
        amount: 45000,
        source: 'credit',
        status: 'confirmed',
        needsVerification: false,
        referenceId: `REF-CREDIT-${stamp}`,
        transactionDate: new Date(),
      },
    });

    const customer = await testDb.customer.create({
      data: {
        businessId: businessA.id,
        name: `Credit Debtor ${stamp}`,
      },
    });

    await testDb.customerCredit.create({
      data: {
        businessId: businessA.id,
        customerId: customer.id,
        customerName: `Credit Debtor ${stamp}`,
        description: 'Goods sold on credit',
        totalAmount: 45000,
        balance: 45000,
        issueDate: new Date(),
        dueDate: new Date(),
        linkedSaleId: sale.id,
      },
    });

    const res = await request(app)
      .patch(`/api/v1/admin/sales/${sale.id}/reassign`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ targetBusinessId: businessB.id });

    expect(res.status).toBe(409);
    expect(res.body?.error?.code).toBe('ACCRUAL_SALE_IMMUTABLE');

    const unchanged = await testDb.salesTransaction.findUnique({ where: { id: sale.id } });
    expect(unchanged?.businessId).toBe(businessA.id);
  });

  test('POST /api/v1/admin/sales/unverified/:saleId/verify - cascades invoice reassignment to target business', async () => {
    const stamp = Date.now();
    const sale = await testDb.salesTransaction.create({
      data: {
        businessId: businessA.id,
        amount: 35000,
        source: 'invoice',
        status: 'pending',
        needsVerification: true,
        referenceId: `REF-VERIFY-ACCRUAL-${stamp}`,
        transactionDate: new Date(),
      },
    });

    await testDb.invoice.create({
      data: {
        businessId: businessA.id,
        invoiceNumber: `INV-VERIFY-${stamp}`,
        status: 'paid',
        issueDate: new Date(),
        dueDate: new Date(),
        customerName: 'Verify Accrual Customer',
        subtotal: 35000,
        vatAmount: 0,
        total: 35000,
        linkedSaleId: sale.id,
        paymentMethod: 'card',
      },
    });

    const res = await request(app)
      .post(`/api/v1/admin/sales/unverified/${sale.id}/verify`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        classificationName: 'Product Sale',
        customerName: 'Verify Accrual Customer',
        targetBusinessId: businessB.id,
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const updatedSale = await testDb.salesTransaction.findUnique({ where: { id: sale.id } });
    expect(updatedSale?.businessId).toBe(businessB.id);
    expect(updatedSale?.needsVerification).toBe(false);

    const updatedInvoice = await testDb.invoice.findFirst({ where: { linkedSaleId: sale.id } });
    expect(updatedInvoice?.businessId).toBe(businessB.id);
  });

  test('POST /api/v1/admin/sales/unverified/:saleId/verify - admin classification & verification', async () => {
    const sale = await testDb.salesTransaction.create({
      data: {
        businessId: businessA.id,
        amount: 25000,
        source: 'bank_transfer',
        status: 'pending',
        needsVerification: true,
        referenceId: `REF-VERIFY-${Date.now()}`,
        transactionDate: new Date(),
        customerHint: 'Alhaji Danladi',
      },
    });

    const res = await request(app)
      .post(`/api/v1/admin/sales/unverified/${sale.id}/verify`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        classificationName: 'Product Sale',
        customerName: 'Alhaji Danladi',
        description: 'Auto-verified counter sale',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const verifiedSale = await testDb.salesTransaction.findUnique({ where: { id: sale.id } });
    expect(verifiedSale?.needsVerification).toBe(false);
    expect(verifiedSale?.status).toBe('confirmed');
    expect(verifiedSale?.finalClassification).toBe('Product Sale');
    expect(verifiedSale?.verifiedBy).toBe(adminUser.id);
    expect(verifiedSale?.customerName).toBe('Alhaji Danladi');

    // Verify audit log attribution
    const audit = await testDb.auditLog.findFirst({
      where: {
        action: 'sale.verified',
        resourceId: sale.id,
      },
      orderBy: { createdAt: 'desc' },
    });
    expect(audit).toBeDefined();
    expect(audit?.userId).toBe(adminUser.id);
  });
});
