import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import { createApp } from '../../src/app';
import type { Application } from 'express';
import { testDb, clearDatabase, createTestUser, createTestBusiness } from '../helpers/test-db';
import { customerCardService } from '../../src/services/customer-card.service';
import { createSale, listSales, updateSale, deleteSale } from '../../src/services/sales.service';
import { invalidateOwnershipCache } from '../../src/lib/ownership';
import { AppError } from '../../src/middleware/errorHandler';

import jwt from 'jsonwebtoken';
import config from '../../src/config';
import { hashVoucherPin } from '../../src/services/voucher-pin.service';
import { getSalesReceipt } from '../../src/services/documents/receipt.service';
import { applyReassignment } from '../../src/services/sales/sales-verification.service';
import { createSaleSchema, salesQuerySchema } from '../../src/validators/sales.validator';

jest.setTimeout(60000);

describe('Customer Card & Store Voucher Integration Suite', () => {
  let app: Application;
  let owner: any;
  let ownerToken: string;
  let manager: any;
  let staff: any;
  let business: any;
  let customer: any;
  let voucherSale: any;
  const customerPin = '123456';

  beforeAll(async () => {
    app = createApp();
    await clearDatabase();

    owner = await createTestUser(`voucher-owner-${Date.now()}@example.com`);
    manager = await createTestUser(`voucher-mgr-${Date.now()}@example.com`);
    staff = await createTestUser(`voucher-staff-${Date.now()}@example.com`);

    business = await createTestBusiness(owner.id, 'Voucher Test Supermarket');

    // Add manager and sales_staff to business
    await testDb.businessMember.createMany({
      data: [
        { businessId: business.id, userId: manager.id, role: 'manager', isActive: true },
        { businessId: business.id, userId: staff.id, role: 'sales_staff', isActive: true },
      ],
    });

    invalidateOwnershipCache(business.id, owner.id);
    invalidateOwnershipCache(business.id, manager.id);
    invalidateOwnershipCache(business.id, staff.id);

    // Quick-create customer with virtual card
    customer = await customerCardService.quickCreateCustomer(owner.id, business.id, {
      name: 'Adewale Adeleke',
      phone: '08031234567',
    });

    const pinHash = await hashVoucherPin(customerPin);
    await testDb.customerCard.update({
      where: { id: customer.card.id },
      data: { pinHash, pinAttempts: 0, pinLockedUntil: null },
    });

    ownerToken = jwt.sign(
      { userId: owner.id, email: owner.email, role: 'user' },
      config.jwt.accessSecret,
      { expiresIn: '1h' }
    );
  }, 90000);

  afterAll(async () => {
    await clearDatabase();
    await testDb.$disconnect();
  }, 90000);

  test('1. Quick-create customer creates both Customer and CustomerCard with 0 initial balance', async () => {
    expect(customer.id).toBeDefined();
    expect(customer.card).toBeDefined();
    expect(Number(customer.card.balance)).toBe(0);
    expect(customer.card.cardCode).toBeDefined();
  });

  test('2. Top-up increases liability-only balance without creating a SalesTransaction', async () => {
    const beforeSales = await listSales(owner.id, business.id, { page: 1, limit: 10 });
    const initialSalesCount = beforeSales.data.length;

    const topUpResult = await customerCardService.topUpCard(owner.id, business.id, customer.id, {
      amount: 15000,
      notes: 'Customer deposited cash upfront',
    });

    expect(Number(topUpResult.card.balance)).toBe(15000);
    expect(topUpResult.ledger.type).toBe('top_up');
    expect(Number(topUpResult.ledger.amount)).toBe(15000);

    // Verify CustomerCard details via getCustomerCard
    const { card } = await customerCardService.getCustomerCard(owner.id, business.id, customer.id);
    expect(card.balance).toBe(15000);
    expect(card.ledgers.length).toBeGreaterThanOrEqual(1);
    expect(card.ledgers[0].type).toBe('top_up');

    // Verify NO SalesTransaction was created (top-up is pure unearned liability)
    const afterSales = await listSales(owner.id, business.id, { page: 1, limit: 10 });
    expect(afterSales.data.length).toBe(initialSalesCount);
  });

  test('3. Credit change deposit records change_credit in card ledger', async () => {
    const changeResult = await customerCardService.creditChange(owner.id, business.id, customer.id, {
      amount: 250,
      notes: 'Change from cash purchase',
    });

    expect(Number(changeResult.card.balance)).toBe(15250);
    expect(changeResult.ledger.type).toBe('change_credit');
    expect(Number(changeResult.ledger.amount)).toBe(250);

    const { card } = await customerCardService.getCustomerCard(owner.id, business.id, customer.id);
    expect(card.balance).toBe(15250);
    const changeEntry = card.ledgers.find((e: any) => e.type === 'change_credit');
    expect(changeEntry).toBeDefined();
    expect(Number(changeEntry.amount)).toBe(250);
  });

  test('4. Manager/Owner can redeem voucher in createSale without SMS OTP step-up token', async () => {
    const sale = await createSale(owner.id, business.id, {
      amount: 5000,
      source: 'store_voucher',
      status: 'confirmed',
      transactionDate: new Date(),
      description: 'Supermarket purchase paid with store voucher',
      metadata: {
        voucherCustomerId: customer.id,
        voucherPin: customerPin,
        voucherLast4: '4567',
      },
    });

    expect(sale.id).toBeDefined();
    expect(sale.source).toBe('store_voucher');
    expect(sale.isTaxable).toBe(true);
    expect(sale.customerId).toBe(customer.id);
    voucherSale = sale;

    // Balance should have decreased from 15250 to 10250
    const { card } = await customerCardService.getCustomerCard(owner.id, business.id, customer.id);
    expect(card.balance).toBe(10250);

    // Check ledger for redemption entry
    const redemptionEntry = card.ledgers.find((e: any) => e.type === 'sale_debit');
    expect(redemptionEntry).toBeDefined();
    expect(Number(redemptionEntry.amount)).toBe(5000);
    expect(redemptionEntry.linkedSaleId).toBe(sale.id);
  });

  test('5. Sales staff requires step-up token to redeem voucher', async () => {
    // Attempting voucher redemption as sales_staff without step-up token must fail
    await expect(
      createSale(staff.id, business.id, {
        amount: 2000,
        source: 'store_voucher',
        status: 'confirmed',
        transactionDate: new Date(),
        description: 'Staff attempting redemption without OTP',
        metadata: {
          voucherCustomerId: customer.id,
        },
      })
    ).rejects.toThrow(AppError);
  });

  test('6. Overdraft prevention: attempting to redeem more than available balance fails', async () => {
    // Balance is 10250. Attempting to redeem 20000 must fail with 409
    await expect(
      createSale(owner.id, business.id, {
        amount: 20000,
        source: 'store_voucher',
        status: 'confirmed',
        transactionDate: new Date(),
        description: 'Attempting to spend more than balance',
        metadata: {
          voucherCustomerId: customer.id,
          voucherPin: customerPin,
          voucherLast4: '4567',
        },
      })
    ).rejects.toThrow(AppError);

    // Balance remains unchanged
    const { card } = await customerCardService.getCustomerCard(owner.id, business.id, customer.id);
    expect(card.balance).toBe(10250);
  });

  test('7. Pessimistic concurrency: concurrent redemptions cannot exceed balance', async () => {
    // Card currently has 10250 balance.
    // We launch two concurrent redemptions of 6000 each (6000 + 6000 = 12000 > 10250).
    // Exactly one must succeed and one must fail.
    const runSale = (idx: number) =>
      createSale(owner.id, business.id, {
        amount: 6000,
        source: 'store_voucher',
        status: 'confirmed',
        transactionDate: new Date(),
        description: `Concurrent attempt ${idx}`,
        metadata: {
          voucherCustomerId: customer.id,
          voucherPin: customerPin,
          voucherLast4: '4567',
        },
      });

    const results = await Promise.allSettled([runSale(1), runSale(2)]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);

    // Balance should be exactly 10250 - 6000 = 4250
    const { card: finalCard } = await customerCardService.getCustomerCard(owner.id, business.id, customer.id);
    expect(finalCard.balance).toBe(4250);
  });

  test('8. Cross-customer step-up token mismatch rejection', async () => {
    // Create customer 2
    const customer2 = await customerCardService.quickCreateCustomer(owner.id, business.id, {
      name: 'Second Customer',
      phone: '08098765432',
    });

    // Create a valid step-up token scoped to customer 1
    const tokenForCustomer1 = jwt.sign(
      {
        purpose: 'voucher_auth',
        customerId: customer.id,
        cardId: customer.card.id,
      },
      config.jwt.accessSecret,
      { expiresIn: '15m' }
    );

    // Attempting to redeem customer 2 using customer 1's token must fail
    await expect(
      createSale(staff.id, business.id, {
        amount: 500,
        source: 'store_voucher',
        status: 'confirmed',
        transactionDate: new Date(),
        description: 'Cross customer token attack attempt',
        metadata: {
          voucherCustomerId: customer2.id,
          voucherStepUpToken: tokenForCustomer1,
        },
      })
    ).rejects.toThrow(AppError);
  });

  test('9. Month-lock rejection: cannot redeem voucher into a locked financial period', async () => {
    const lockedDate = new Date('2025-01-15T12:00:00Z');

    // Create a locked tax report for 2025-01
    await testDb.monthlyTaxReport.create({
      data: {
        businessId: business.id,
        taxMonth: new Date(Date.UTC(2025, 0, 1)),
        isLocked: true,
        isFinalized: true,
        totalSales: 0,
        totalExpenses: 0,
        grossProfit: 0,
        taxRate: 0,
        taxPayable: 0,
      },
    });

    await expect(
      createSale(owner.id, business.id, {
        amount: 500,
        source: 'store_voucher',
        status: 'confirmed',
        transactionDate: lockedDate,
        description: 'Voucher redemption in locked month',
        metadata: {
          voucherCustomerId: customer.id,
          voucherPin: customerPin,
          voucherLast4: '4567',
        },
      })
    ).rejects.toThrow(AppError);
  });

  test('10. Manual balance adjustments enforce owner/manager authorization', async () => {
    // 1. Sales staff adjustment must fail with 403 PERMISSION_DENIED
    await expect(
      customerCardService.adjustCardBalance(staff.id, business.id, customer.id, {
        amount: 500,
        reason: 'Staff adjustment attempt',
      })
    ).rejects.toThrow(AppError);

    // 2. Manager adjustment succeeds
    const mgrResult = await customerCardService.adjustCardBalance(manager.id, business.id, customer.id, {
      amount: 500,
      reason: 'Manager goodwill credit',
    });
    expect(mgrResult.card.balance).toBe(4750);
    expect(mgrResult.ledger.type).toBe('adjustment');
    expect(mgrResult.ledger.amount).toBe(500);

    // 3. Owner adjustment succeeds
    const ownerResult = await customerCardService.adjustCardBalance(owner.id, business.id, customer.id, {
      amount: 250,
      reason: 'Owner correction',
    });
    expect(ownerResult.card.balance).toBe(5000);
    expect(ownerResult.ledger.type).toBe('adjustment');
  });

  test('11. Accrual sale immutability: voucher sale cannot be reassigned to another business', async () => {
    const targetBusiness = await createTestBusiness(owner.id, 'Target Retail Outlet');

    await expect(
      applyReassignment({
        saleId: voucherSale.id,
        sourceBusinessId: business.id,
        targetBusinessId: targetBusiness.id,
        actor: { kind: 'user', userId: owner.id },
      })
    ).rejects.toThrow('This sale is linked to an accrual transaction (credit or store voucher), so it cannot be moved to another business.');
  });

  test('12. Accrual basis tax reporting: redemptions count as taxable sales, deposits do not', async () => {
    const allSales = await testDb.salesTransaction.findMany({
      where: { businessId: business.id },
    });

    // Redemptions are taxable sales transactions
    const voucherSales = allSales.filter((s: any) => s.source === 'store_voucher');
    expect(voucherSales.length).toBe(2);
    voucherSales.forEach((s: any) => {
      expect(s.isTaxable).toBe(true);
      expect(s.status).toBe('confirmed');
      expect(s.customerId).toBe(customer.id);
    });

    // Top-ups (15,000) and change credits (250) must NEVER create a SalesTransaction
    const depositSales = allSales.filter((s: any) => [15000, 250].includes(Number(s.amount)));
    expect(depositSales.length).toBe(0);
  });

  test('13. Official sales receipt generation with store voucher details', async () => {
    const receipt = await getSalesReceipt(owner.id, business.id, voucherSale.id);

    expect(receipt.buffer).toBeInstanceOf(Buffer);
    expect(receipt.buffer.length).toBeGreaterThan(0);
    expect(receipt.filename).toMatch(/^RCT-SALE-.*\.pdf$/);
    expect(receipt.receiptNumber).toMatch(/^RCT-SALE-/);
  });

  test('14. Zod sales validator contracts accept store_voucher and credit sources', () => {
    const createVoucher = createSaleSchema.parse({
      amount: 4500,
      source: 'store_voucher',
      status: 'confirmed',
      transactionDate: new Date().toISOString(),
      description: 'Zod store voucher sale test',
    });
    expect(createVoucher.source).toBe('store_voucher');

    const createCredit = createSaleSchema.parse({
      amount: 8000,
      source: 'credit',
      status: 'confirmed',
      transactionDate: new Date().toISOString(),
      description: 'Zod credit sale test',
    });
    expect(createCredit.source).toBe('credit');

    const queryFilters = salesQuerySchema.parse({
      source: 'store_voucher',
      search: 'Adewale',
      minAmount: 100,
      maxAmount: 10000,
    });
    expect(queryFilters.source).toBe('store_voucher');
    expect(queryFilters.search).toBe('Adewale');
    expect(queryFilters.minAmount).toBe(100);
    expect(queryFilters.maxAmount).toBe(10000);
  });

  test('15. Financial immutability: in-place editing of amount or source on voucher sale is rejected', async () => {
    // 1. Attempting to change amount on voucher sale must fail with 409
    await expect(
      updateSale(owner.id, business.id, voucherSale.id, {
        amount: 3000,
      })
    ).rejects.toThrow(
      'Sales paid with store voucher cannot have their amount, items, or payment method edited directly. To correct a mistake, please reverse/void the sale to restore the customer voucher balance, then enter the correct sale.'
    );

    // 2. Attempting to change payment source must fail with 409
    await expect(
      updateSale(owner.id, business.id, voucherSale.id, {
        source: 'cash',
      })
    ).rejects.toThrow(
      'Sales paid with store voucher cannot have their amount, items, or payment method edited directly. To correct a mistake, please reverse/void the sale to restore the customer voucher balance, then enter the correct sale.'
    );

    // 3. Updating non-financial metadata (description, customerName) succeeds cleanly
    const nonFinancialUpdate = await updateSale(owner.id, business.id, voucherSale.id, {
      description: 'Supermarket purchase paid with store voucher (Annotated by cashier)',
    });
    expect(nonFinancialUpdate.description).toContain('Annotated');
  });

  test('16. Void/Reversal auto-restoration: reversing a voucher sale automatically refunds the debited amount to card', async () => {
    // Current customer balance before reversal was 5000 (after test 10 adjustments)
    const { card: beforeCard } = await customerCardService.getCustomerCard(owner.id, business.id, customer.id);
    expect(beforeCard.balance).toBe(5000);

    // Reversing the ₦5,000 voucher sale
    const reversedSale = await updateSale(owner.id, business.id, voucherSale.id, {
      status: 'reversed',
      description: 'Voided due to cashier scanning error',
    });

    expect(reversedSale.status).toBe('reversed');
    expect(reversedSale.isTaxable).toBe(false);

    // Customer balance must have increased by ₦5,000 back to ₦10,000
    const { card: afterCard } = await customerCardService.getCustomerCard(owner.id, business.id, customer.id);
    expect(afterCard.balance).toBe(10000);

    // An explicit adjustment ledger entry must be recorded
    const refundLedger = afterCard.ledgers.find((l: any) => l.type === 'adjustment' && l.linkedSaleId === voucherSale.id);
    expect(refundLedger).toBeDefined();
    expect(Number(refundLedger.amount)).toBe(5000);
    expect(refundLedger.notes).toContain('Reversal refund for voided sale');

    // Idempotency: re-updating status to reversed must not double-refund
    await updateSale(owner.id, business.id, voucherSale.id, {
      status: 'reversed',
    });
    const { card: idempotentCard } = await customerCardService.getCustomerCard(owner.id, business.id, customer.id);
    expect(idempotentCard.balance).toBe(10000);
  });

  test('17. Delete auto-restoration: deleting a voucher sale safely restores the customer card balance', async () => {
    // 1. Create a ₦3,000 voucher sale. Customer balance drops from 10,000 to 7,000
    const mistakeSale = await createSale(owner.id, business.id, {
      amount: 3000,
      source: 'store_voucher',
      status: 'confirmed',
      transactionDate: new Date(),
      description: 'Mistake sale that will be deleted',
      metadata: {
        voucherCustomerId: customer.id,
        voucherPin: customerPin,
        voucherLast4: '4567',
      },
    });

    const { card: midCard } = await customerCardService.getCustomerCard(owner.id, business.id, customer.id);
    expect(midCard.balance).toBe(7000);

    // 2. Delete the mistake sale
    await deleteSale(owner.id, business.id, mistakeSale.id);

    // 3. Customer balance must be safely restored back to ₦10,000
    const { card: restoredCard } = await customerCardService.getCustomerCard(owner.id, business.id, customer.id);
    expect(restoredCard.balance).toBe(10000);
  });

  describe('18. POST /voucher-lookup endpoint suite', () => {
    let pinCustomer: any;
    const testPin = '654321';

    beforeAll(async () => {
      pinCustomer = await customerCardService.quickCreateCustomer(owner.id, business.id, {
        name: 'Lookup Test Customer',
        phone: '08099887766',
      });
      const pinHash = await hashVoucherPin(testPin);
      await testDb.customerCard.update({
        where: { id: pinCustomer.card.id },
        data: { pinHash, pinAttempts: 0, pinLockedUntil: null, balance: 5000 },
      });
    });

    test('200 with valid pin+last4 returns customer and card balance', async () => {
      const res = await request(app)
        .post(`/api/v1/businesses/${business.id}/customers/voucher-lookup`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ pin: testPin, last4: '7766' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.customer.id).toBe(pinCustomer.id);
      expect(res.body.data.customer.name).toBe('Lookup Test Customer');
      expect(res.body.data.card.balance).toBe(5000);
    });

    test('401 on wrong pin', async () => {
      const res = await request(app)
        .post(`/api/v1/businesses/${business.id}/customers/voucher-lookup`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ pin: '000000', last4: '7766' });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('VOUCHER_AUTH_FAILED');
    });

    test('401 on unknown last4', async () => {
      const res = await request(app)
        .post(`/api/v1/businesses/${business.id}/customers/voucher-lookup`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ pin: testPin, last4: '9999' });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('VOUCHER_AUTH_FAILED');
    });

    test('423 when card is locked', async () => {
      await testDb.customerCard.update({
        where: { id: pinCustomer.card.id },
        data: { pinLockedUntil: new Date(Date.now() + 15 * 60 * 1000) },
      });

      const res = await request(app)
        .post(`/api/v1/businesses/${business.id}/customers/voucher-lookup`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ pin: testPin, last4: '7766' });

      expect(res.status).toBe(423);
      expect(res.body.error.code).toBe('VOUCHER_PIN_LOCKED');

      // Reset lock
      await testDb.customerCard.update({
        where: { id: pinCustomer.card.id },
        data: { pinLockedUntil: null, pinAttempts: 0 },
      });
    });

    test('429 when rate-limited', async () => {
      let rateLimited = false;
      for (let i = 0; i < 25; i++) {
        const res = await request(app)
          .post(`/api/v1/businesses/${business.id}/customers/voucher-lookup`)
          .set('Authorization', `Bearer ${ownerToken}`)
          .send({ pin: '111111', last4: '0000' });
        if (res.status === 429) {
          rateLimited = true;
          expect(res.body.error.code).toBe('VOUCHER_LOOKUP_RATE_LIMITED');
          break;
        }
      }
      expect(rateLimited).toBe(true);
    });

    test('search by cardCode returns 0 after OR removal', async () => {
      const mgrToken = jwt.sign(
        { userId: manager.id, email: manager.email, role: 'user' },
        config.jwt.accessSecret,
        { expiresIn: '1h' }
      );
      const res = await request(app)
        .get(`/api/v1/businesses/${business.id}/customers?search=${pinCustomer.card.cardCode}`)
        .set('Authorization', `Bearer ${mgrToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(0);
    });
  });
});
