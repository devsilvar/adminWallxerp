import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { testDb, clearDatabase, createTestUser, createTestBusiness } from '../helpers/test-db';
import { processDVATransferWebhook } from '../../src/services/dva/dva-webhook.service';

jest.setTimeout(60000);

describe('DVA-ALLOC-03: Business-Agnostic Webhook Idempotency Suite', () => {
  let user: any;
  let businessA: any;
  let businessB: any;
  const dvaAccountNumber = `99${Date.now().toString().slice(-8)}`;

  beforeAll(async () => {
    await clearDatabase();

    user = await createTestUser(`idemp-user-${Date.now()}@example.com`);
    await testDb.user.update({
      where: { id: user.id },
      data: { virtualAccountNumber: dvaAccountNumber },
    });

    businessA = await createTestBusiness(user.id, 'Idempotency Store Alpha');
    businessB = await createTestBusiness(user.id, 'Idempotency Store Beta');

    // Create wallet for user
    await testDb.walletBalance.create({
      data: {
        userId: user.id,
        balance: 0,
        lockedBalance: 0,
      },
    });

    // Set businessA as primary
    await testDb.user.update({
      where: { id: user.id },
      data: { primaryBusinessId: businessA.id },
    });
  }, 30000);

  afterAll(async () => {
    await clearDatabase();
    await testDb.$disconnect();
  }, 30000);

  test('same reference delivered twice across primary business switch yields exactly 1 sales transaction', async () => {
    const reference = `REF-DVA-IDEMP-${Date.now()}`;
    const webhookPayload = {
      event: 'charge.success',
      data: {
        channel: 'dedicated_nuban',
        amount: 3500000, // 35,000 NGN in kobo
        reference,
        narration: 'Invoice Payment via DVA',
        dedicated_account: {
          account_number: dvaAccountNumber,
        },
        customer: {
          first_name: 'Babajide',
          last_name: 'Sanwo-Olu',
        },
      },
    };

    // 1. First webhook delivery when primaryBusinessId = businessA
    const firstResult = await processDVATransferWebhook(webhookPayload);
    expect(firstResult).toBe(true);

    // Verify sale was created under businessA
    const salesUnderA = await testDb.salesTransaction.findMany({
      where: { referenceId: reference },
    });
    expect(salesUnderA).toHaveLength(1);
    expect(salesUnderA[0].businessId).toBe(businessA.id);

    // 2. User switches their primary business to businessB
    await testDb.user.update({
      where: { id: user.id },
      data: { primaryBusinessId: businessB.id },
    });

    // 3. Webhook delivery retries with the SAME reference
    const secondResult = await processDVATransferWebhook(webhookPayload);
    expect(secondResult).toBe(true);

    // 4. Assert total sales with this reference remains strictly 1 across all businesses
    const allSales = await testDb.salesTransaction.findMany({
      where: { referenceId: reference },
    });
    expect(allSales).toHaveLength(1);
    expect(allSales[0].businessId).toBe(businessA.id);

    // Assert NO sale was created under businessB
    const salesUnderB = await testDb.salesTransaction.findMany({
      where: { referenceId: reference, businessId: businessB.id },
    });
    expect(salesUnderB).toHaveLength(0);
  });

  test('exact business virtualAccountNumber routes directly to that business even when sibling is primary', async () => {
    const businessBAccount = `88${Date.now().toString().slice(-8)}`;
    await testDb.business.update({
      where: { id: businessB.id },
      data: { virtualAccountNumber: businessBAccount },
    });

    // businessA is still primary
    await testDb.user.update({
      where: { id: user.id },
      data: { primaryBusinessId: businessA.id },
    });

    const reference = `REF-DVA-EXACT-BIZ-${Date.now()}`;
    const webhookPayload = {
      event: 'charge.success',
      data: {
        channel: 'dedicated_nuban',
        amount: 2000000, // 20,000 NGN in kobo
        reference,
        narration: 'Transfer to Business B direct DVA',
        dedicated_account: {
          account_number: businessBAccount,
        },
        customer: {
          first_name: 'Chioma',
          last_name: 'Adeyemi',
        },
      },
    };

    const result = await processDVATransferWebhook(webhookPayload);
    expect(result).toBe(true);

    // Verify sale was created directly under businessB (not primary businessA)
    const salesUnderB = await testDb.salesTransaction.findMany({
      where: { referenceId: reference },
    });
    expect(salesUnderB).toHaveLength(1);
    expect(salesUnderB[0].businessId).toBe(businessB.id);

    const salesUnderA = await testDb.salesTransaction.findMany({
      where: { referenceId: reference, businessId: businessA.id },
    });
    expect(salesUnderA).toHaveLength(0);
  });
});
