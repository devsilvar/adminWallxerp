import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApp } from '../../src/app';
import { config } from '../../src/config';
import { testDb, clearDatabase, createTestUser, createTestBusiness } from '../helpers/test-db';
import * as creditService from '../../src/services/credit.service';
import * as invoiceService from '../../src/services/invoice.service';
import type { Application } from 'express';

jest.setTimeout(60000);

describe('Senior QA Audit: Debtor DVA Reconciliation & Line-Item Editing', () => {
  let app: Application;
  let userA: any;
  let userB: any;
  let businessA: any;
  let businessB: any;
  let tokenA: string;
  let tokenB: string;

  beforeAll(async () => {
    app = createApp();
    await clearDatabase();

    // Ensure default classifications exist
    await testDb.transactionClassification.upsert({
      where: { name: 'Credit Sale' },
      update: { isActive: true, isRevenue: true, taxTreatment: 'taxable' },
      create: {
        name: 'Credit Sale',
        category: 'revenue',
        taxTreatment: 'taxable',
        isRevenue: true,
        isActive: true,
        description: 'Goods or services sold on credit',
      },
    });

    await testDb.transactionClassification.upsert({
      where: { name: 'Credit / Debt Settlement' },
      update: { isActive: true, isRevenue: true, taxTreatment: 'taxable' },
      create: {
        name: 'Credit / Debt Settlement',
        category: 'revenue',
        taxTreatment: 'taxable',
        isRevenue: true,
        isActive: true,
        description: 'Settlement of outstanding customer debts',
      },
    });

    userA = await createTestUser('qa-debtor-audit-a@example.com');
    userB = await createTestUser('qa-debtor-audit-b@example.com');

    businessA = await createTestBusiness(userA.id, 'QA Alpha Debtors Ltd');
    businessB = await createTestBusiness(userB.id, 'QA Beta Debtors Ltd');

    tokenA = jwt.sign(
      { userId: userA.id, email: userA.email, role: 'user' },
      config.jwt.accessSecret,
      { expiresIn: '1h' },
    );

    tokenB = jwt.sign(
      { userId: userB.id, email: userB.email, role: 'user' },
      config.jwt.accessSecret,
      { expiresIn: '1h' },
    );
  }, 40000);

  afterAll(async () => {
    await clearDatabase();
    await testDb.$disconnect();
  }, 40000);

  // Helper to create a test credit / debtor record with items
  async function createCreditWithItems(userId: string, businessId: string, items: Array<{ name: string; quantity: number; unitPrice: number }>) {
    const today = new Date();
    const dueDate = new Date();
    dueDate.setDate(today.getDate() + 30);

    return creditService.createCredit(userId, businessId, {
      customerName: 'Chief Emeka Okafor',
      customerEmail: 'emeka@example.com',
      customerPhone: '08031234567',
      issueDate: today,
      dueDate,
      items,
    });
  }

  // Helper to create an incoming DVA bank transfer
  async function createDvaTransfer(businessId: string, amount: number, reference?: string) {
    return testDb.salesTransaction.create({
      data: {
        businessId,
        amount,
        source: 'bank_transfer',
        dvaOrigin: true,
        status: 'pending',
        needsVerification: true,
        referenceId: reference || `PAYSTACK-DVA-${Date.now()}-${Math.random().toString(36).substring(7)}`,
        customerName: 'Chief Emeka Okafor via Zenith Bank',
        description: 'DVA settlement transfer',
        transactionDate: new Date(),
        metadata: {
          channel: 'dva',
          paystackTransactionId: 11223344,
          originatingBank: 'Zenith Bank',
          senderName: 'EMEKA OKAFOR',
        },
      },
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // 1. DVA RECONCILIATION HAPPY PATH & INTEGRITY
  // ═══════════════════════════════════════════════════════════════

  test('TC-01: Reconcile valid DVA transfer to debtor (Zero duplicate sales, isTaxable: true, metadata merged)', async () => {
    // 1. Create credit of ₦75,000 (3 items @ ₦25,000)
    const credit = await createCreditWithItems(userA.id, businessA.id, [
      { name: 'Industrial Water Pump', quantity: 3, unitPrice: 25000 },
    ]);
    expect(Number(credit.totalAmount)).toBe(75000);
    expect(Number(credit.balance)).toBe(75000);
    expect(credit.status).toBe('unpaid');

    // 2. Inbound DVA transfer of ₦75,000
    const paystackRef = `DVA-CREDIT-REF-${Date.now()}`;
    const transfer = await createDvaTransfer(businessA.id, 75000, paystackRef);
    expect(transfer.needsVerification).toBe(true);

    const initialSalesCount = await testDb.salesTransaction.count({
      where: { businessId: businessA.id },
    });

    // 3. Reconcile transfer to credit
    const reconciled = await creditService.reconcileDvaTransferToCredit(
      userA.id,
      businessA.id,
      credit.id,
      transfer.id,
    );

    // 4. Verify Credit state
    expect(reconciled.status).toBe('paid');
    expect(Number(reconciled.balance)).toBe(0);
    expect(Number(reconciled.amountPaid)).toBe(75000);

    // 5. CRITICAL: Zero duplicate sales created
    const finalSalesCount = await testDb.salesTransaction.count({
      where: { businessId: businessA.id },
    });
    expect(finalSalesCount).toBe(initialSalesCount);

    // 6. Verify SalesTransaction is confirmed and marked non-taxable (accrual-basis: debt repayment)
    const updatedSale = await testDb.salesTransaction.findUnique({
      where: { id: transfer.id },
    });
    expect(updatedSale?.needsVerification).toBe(false);
    expect(updatedSale?.status).toBe('confirmed');
    expect(updatedSale?.isTaxable).toBe(false);
    expect(updatedSale?.finalClassification).toBe('Credit Repayment (Non-Taxable)');
    expect(updatedSale?.source).toBe('bank_transfer'); // Preserved original source
    expect(updatedSale?.referenceId).toBe(paystackRef); // Preserved Paystack ref
    expect(updatedSale?.customerName).toBe('Chief Emeka Okafor');

    // 7. Verify metadata was merged without destroying DVA channel info
    const meta = updatedSale?.metadata as any;
    expect(meta.channel).toBe('dva');
    expect(meta.originatingBank).toBe('Zenith Bank');
    expect(meta.creditReconciliation).toBeDefined();
    expect(meta.creditReconciliation.creditId).toBe(credit.id);
    expect(meta.creditReconciliation.customerName).toBe('Chief Emeka Okafor');

    // 8. Verify CreditPayment was linked
    const payment = await testDb.creditPayment.findUnique({
      where: { linkedSaleId: transfer.id },
    });
    expect(payment).not.toBeNull();
    expect(Number(payment?.amount)).toBe(75000);
    expect(payment?.creditId).toBe(credit.id);
  });

  // ═══════════════════════════════════════════════════════════════
  // 2. CROSS-MODULE DEFENSE (CRITICAL RE-AUDIT FINDING)
  // ═══════════════════════════════════════════════════════════════

  test('TC-02: Cross-module defense — transfer already reconciled to an invoice cannot be claimed by debtor', async () => {
    // 1. Create and send an invoice for ₦50,000
    const invoice = await invoiceService.createInvoice(userA.id, businessA.id, {
      customerName: 'Dangote Industries',
      issueDate: new Date(),
      dueDate: new Date(),
      vatRate: 0,
      discount: 0,
      lines: [{ description: 'Cement Logistics', quantity: 1, unitPrice: 50000 }],
    });
    await invoiceService.sendInvoice(userA.id, businessA.id, invoice.id);

    // 2. Create a transfer of ₦50,000 and reconcile to invoice
    const transfer = await createDvaTransfer(businessA.id, 50000);
    await invoiceService.reconcileDvaTransferToInvoice(userA.id, businessA.id, invoice.id, transfer.id);

    // 3. Create a debtor debt of ₦50,000
    const credit = await createCreditWithItems(userA.id, businessA.id, [
      { name: 'Logistics Fee', quantity: 1, unitPrice: 50000 },
    ]);

    // 4. Attempt to reconcile the same transfer to the debtor — MUST FAIL with 409
    await expect(
      creditService.reconcileDvaTransferToCredit(userA.id, businessA.id, credit.id, transfer.id),
    ).rejects.toMatchObject({
      statusCode: 409,
      code: 'SALE_ALREADY_RECONCILED',
    });
  });

  test('TC-03: Cross-module reverse defense — transfer already reconciled to debtor cannot be claimed by invoice', async () => {
    // 1. Create a debtor of ₦60,000 and reconcile a transfer
    const credit = await createCreditWithItems(userA.id, businessA.id, [
      { name: 'Steel Rods', quantity: 2, unitPrice: 30000 },
    ]);
    const transfer = await createDvaTransfer(businessA.id, 60000);
    await creditService.reconcileDvaTransferToCredit(userA.id, businessA.id, credit.id, transfer.id);

    // 2. Create an invoice of ₦60,000
    const invoice = await invoiceService.createInvoice(userA.id, businessA.id, {
      customerName: 'Julius Berger',
      issueDate: new Date(),
      dueDate: new Date(),
      vatRate: 0,
      discount: 0,
      lines: [{ description: 'Steel Supplies', quantity: 1, unitPrice: 60000 }],
    });
    await invoiceService.sendInvoice(userA.id, businessA.id, invoice.id);

    // 3. Attempt to reconcile the same transfer to the invoice — MUST FAIL with 409
    await expect(
      invoiceService.reconcileDvaTransferToInvoice(userA.id, businessA.id, invoice.id, transfer.id),
    ).rejects.toMatchObject({
      statusCode: 409,
      code: 'SALE_ALREADY_RECONCILED',
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // 3. LINE-ITEM EDITING & ATOMIC REPLACEMENT
  // ═══════════════════════════════════════════════════════════════

  test('TC-04: Edit debtor line items — replaces credit_line_items, updates totalAmount, balance, and description', async () => {
    // 1. Create credit with initial item: 1x Laptop @ ₦120,000
    const credit = await createCreditWithItems(userA.id, businessA.id, [
      { name: 'Refurbished Dell Laptop', quantity: 1, unitPrice: 120000 },
    ]);
    expect(Number(credit.totalAmount)).toBe(120000);
    expect(Number(credit.balance)).toBe(120000);
    expect(credit.items?.length).toBe(1);

    // 2. Update with 2 new items: 2x Monitors @ ₦45,000 + 1x Dock @ ₦25,000 = ₦115,000
    const updated = await creditService.updateCredit(userA.id, businessA.id, credit.id, {
      items: [
        { name: 'Dell 27-inch Monitor', quantity: 2, unitPrice: 45000 },
        { name: 'USB-C Docking Station', quantity: 1, unitPrice: 25000 },
      ],
    });

    // 3. Check updated values
    expect(Number(updated.totalAmount)).toBe(115000);
    expect(Number(updated.balance)).toBe(115000);
    expect(updated.items?.length).toBe(2);
    expect(updated.description).toContain('2 items: Dell 27-inch Monitor (2), USB-C Docking Station (1)');

    // 4. Verify line item rows in DB were replaced (not duplicated)
    const dbItems = await testDb.creditLineItem.findMany({
      where: { creditId: credit.id },
      orderBy: { sortOrder: 'asc' },
    });
    expect(dbItems.length).toBe(2);
    expect(dbItems[0].name).toBe('Dell 27-inch Monitor');
    expect(Number(dbItems[0].lineTotal)).toBe(90000);
    expect(dbItems[1].name).toBe('USB-C Docking Station');
    expect(Number(dbItems[1].lineTotal)).toBe(25000);
  });

  // ═══════════════════════════════════════════════════════════════
  // 4. NEGATIVE BALANCE INVARIANT GUARD
  // ═══════════════════════════════════════════════════════════════

  test('TC-05: Invariant guard — cannot reduce line items total below already paid amount', async () => {
    // 1. Create credit of ₦100,000
    const credit = await createCreditWithItems(userA.id, businessA.id, [
      { name: 'Commercial Generator', quantity: 1, unitPrice: 100000 },
    ]);

    // 2. Record a partial payment of ₦60,000
    await creditService.recordPayment(userA.id, businessA.id, credit.id, {
      amount: 60000,
      paymentDate: new Date(),
      paymentType: 'bank_transfer',
      notes: 'First installment',
    });

    const refreshed = await creditService.getCreditById(userA.id, businessA.id, credit.id);
    expect(Number(refreshed.amountPaid)).toBe(60000);
    expect(Number(refreshed.balance)).toBe(40000);

    // 3. Attempt to edit items down to ₦50,000 (which is < ₦60,000 amountPaid)
    // MUST BE REJECTED with 400 INVALID_CREDIT_AMOUNT
    await expect(
      creditService.updateCredit(userA.id, businessA.id, credit.id, {
        items: [{ name: 'Smaller Generator', quantity: 1, unitPrice: 50000 }],
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
      code: 'INVALID_CREDIT_AMOUNT',
    });

    // 4. Now edit items to ₦80,000 (which is > ₦60,000 amountPaid) — should SUCCEED
    const validUpdate = await creditService.updateCredit(userA.id, businessA.id, credit.id, {
      items: [{ name: 'Medium Generator', quantity: 1, unitPrice: 80000 }],
    });
    expect(Number(validUpdate.totalAmount)).toBe(80000);
    expect(Number(validUpdate.balance)).toBe(20000); // 80,000 - 60,000
    expect(validUpdate.status).toBe('partially_paid');
  });

  // ═══════════════════════════════════════════════════════════════
  // 5. RE-RECONCILIATION GUARD
  // ═══════════════════════════════════════════════════════════════

  test('TC-06: Reject duplicate reconciliation of same transfer to another debtor', async () => {
    // 1. Create two credits
    const credit1 = await createCreditWithItems(userA.id, businessA.id, [
      { name: 'Item A', quantity: 1, unitPrice: 30000 },
    ]);
    const credit2 = await createCreditWithItems(userA.id, businessA.id, [
      { name: 'Item B', quantity: 1, unitPrice: 30000 },
    ]);

    // 2. Transfer of ₦30,000
    const transfer = await createDvaTransfer(businessA.id, 30000);

    // 3. Reconcile to credit1
    await creditService.reconcileDvaTransferToCredit(userA.id, businessA.id, credit1.id, transfer.id);

    // 4. Attempt to reconcile to credit2 — MUST FAIL with 409
    await expect(
      creditService.reconcileDvaTransferToCredit(userA.id, businessA.id, credit2.id, transfer.id),
    ).rejects.toMatchObject({
      statusCode: 409,
      code: 'SALE_ALREADY_RECONCILED',
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // 6. MULTI-TENANT SECURITY
  // ═══════════════════════════════════════════════════════════════

  test('TC-07: Tenant isolation — User B cannot edit User A debtor or link User A transfer', async () => {
    const creditA = await createCreditWithItems(userA.id, businessA.id, [
      { name: 'Secret Stock', quantity: 1, unitPrice: 40000 },
    ]);
    const transferA = await createDvaTransfer(businessA.id, 40000);

    // User B tries to update User A's credit
    await expect(
      creditService.updateCredit(userB.id, businessA.id, creditA.id, {
        customerName: 'Hacked Name',
      }),
    ).rejects.toMatchObject({
      statusCode: 403,
    });

    // User B tries to reconcile User A's transfer
    await expect(
      creditService.reconcileDvaTransferToCredit(userB.id, businessA.id, creditA.id, transferA.id),
    ).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // 7. END-TO-END HTTP API TEST VIA SUPERTEST
  // ═══════════════════════════════════════════════════════════════

  test('TC-08: HTTP PATCH /credits/:id with items & POST /reconcile-dva/:saleId', async () => {
    // 1. Create a credit for ₦50,000
    const credit = await createCreditWithItems(userA.id, businessA.id, [
      { name: 'Pre-edit Item', quantity: 1, unitPrice: 50000 },
    ]);

    // 2. PATCH credit with updated items via HTTP
    const patchRes = await request(app)
      .patch(`/api/v1/businesses/${businessA.id}/credits/${credit.id}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        customerName: 'Alhaji Sanusi Lamido',
        items: [
          { name: 'Solar Inverter 5kVA', quantity: 1, unitPrice: 70000 },
        ],
      });

    expect(patchRes.status).toBe(200);
    expect(patchRes.body.success).toBe(true);
    expect(patchRes.body.data.customerName).toBe('Alhaji Sanusi Lamido');
    expect(Number(patchRes.body.data.totalAmount)).toBe(70000);
    expect(Number(patchRes.body.data.balance)).toBe(70000);
    expect(patchRes.body.data.items.length).toBe(1);

    // 3. Create a DVA transfer for ₦70,000
    const transfer = await createDvaTransfer(businessA.id, 70000);

    // 4. POST reconcile-dva via HTTP
    const reconcileRes = await request(app)
      .post(`/api/v1/businesses/${businessA.id}/credits/${credit.id}/reconcile-dva/${transfer.id}`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect(reconcileRes.status).toBe(200);
    expect(reconcileRes.body.success).toBe(true);
    expect(reconcileRes.body.data.status).toBe('paid');
    expect(Number(reconcileRes.body.data.balance)).toBe(0);
    expect(Number(reconcileRes.body.data.amountPaid)).toBe(70000);
  });
});
