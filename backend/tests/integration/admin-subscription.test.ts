import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { testDb, clearDatabase, createTestUser, createTestBusiness } from '../helpers/test-db';
import { processPaymentProof } from '../../src/services/subscription.service';
import {
  listSubscriptionSubmissions,
  getSubscriptionSubmissionDetail,
  getSubscriptionReceipt,
  approveSubscription,
  rejectSubscription,
  getDashboardStats,
} from '../../src/services/admin/admin.service';
import { AppError } from '../../src/middleware/errorHandler';

jest.setTimeout(60000);

describe('Admin Subscriptions Desk Integration Suite', () => {
  let subscriber: any;
  let adminUser: any;
  let business: any;
  let submission1: any;
  let submission2: any;

  beforeAll(async () => {
    await clearDatabase();

    const timestamp = Date.now();
    subscriber = await createTestUser(`subscriber-${timestamp}@example.com`);
    adminUser = await createTestUser(`admin-${timestamp}@example.com`, { role: 'admin' });
    business = await createTestBusiness(subscriber.id, 'Subscriber Retail Store');
  }, 90000);

  afterAll(async () => {
    await clearDatabase();
    await testDb.$disconnect();
  }, 90000);

  test('1. Submitting payment proof with commas in amount string persists cleanly with pending status', async () => {
    const dummyReceiptBuffer = Buffer.from('Mock PDF Content for Zenith Bank transfer');

    const result = await processPaymentProof({
      userId: subscriber.id,
      businessId: business.id,
      name: 'Chinedu Okeke',
      email: subscriber.email,
      phone: '08022223333',
      businessName: business.businessName,
      plan: 'Quarterly (Business)',
      amount: '12,000', // Contains locale thousand separator comma
      notes: 'Transfer from GTBank session ID 992819',
      file: {
        originalname: 'zenith-receipt.pdf',
        buffer: dummyReceiptBuffer,
        mimetype: 'application/pdf',
        size: dummyReceiptBuffer.length,
      },
    });

    expect(result.delivered).toBe(true);
    expect(result.submissionId).toBeDefined();

    const saved = await testDb.subscriptionSubmission.findUnique({
      where: { id: result.submissionId },
    });

    expect(saved).not.toBeNull();
    expect(saved?.customerName).toBe('Chinedu Okeke');
    expect(Number(saved?.amount)).toBe(12000);
    expect(saved?.billingCycle).toBe('quarterly');
    expect(saved?.status).toBe('pending');
    expect(saved?.receiptUrl).toBeDefined();

    submission1 = saved;
  });

  test('2. Admin listSubscriptionSubmissions returns submission and live pending counter', async () => {
    const listResult = await listSubscriptionSubmissions({
      page: 1,
      limit: 20,
    });

    expect(listResult.data.length).toBeGreaterThanOrEqual(1);
    expect(listResult.counts.pending).toBeGreaterThanOrEqual(1);
    expect(listResult.data[0].customerName).toBe('Chinedu Okeke');
  });

  test('3. getSubscriptionReceipt retrieves receipt stream path and MIME type', async () => {
    const receipt = await getSubscriptionReceipt(submission1.id);
    expect(receipt.id).toBe(submission1.id);
    expect(receipt.receiptMime).toBe('application/pdf');
    expect(receipt.receiptFileName).toBe('zenith-receipt.pdf');
  });

  test('4. Admin getDashboardStats reflects pendingSubscriptionsCount', async () => {
    const stats = await getDashboardStats();
    expect(stats.pendingSubscriptionsCount).toBeGreaterThanOrEqual(1);
  });

  test('5. Admin 1-click Approve activates plan, sets user subscriptionTier & expiry, and logs audit', async () => {
    const approved = await approveSubscription(submission1.id, adminUser.id);

    expect(approved.status).toBe('approved');
    expect(approved.activatedTier).toBe('business');
    expect(approved.subscriptionExpiresAt).toBeDefined();

    // Verify user record in database
    const userInDb = await testDb.user.findUnique({
      where: { id: subscriber.id },
    });
    expect(userInDb?.subscriptionTier).toBe('business');
    expect(userInDb?.subscriptionExpiresAt).not.toBeNull();

    // Verify audit log
    const audit = await testDb.auditLog.findFirst({
      where: {
        resourceType: 'subscription_submission',
        resourceId: submission1.id,
        action: 'subscription.approved',
      },
    });
    expect(audit).not.toBeNull();
  });

  test('6. Attempting to approve an already approved subscription throws 409 conflict', async () => {
    await expect(approveSubscription(submission1.id, adminUser.id)).rejects.toThrow(AppError);
  });

  test('7. Admin rejecting a submission saves reason, sets status to rejected, and records audit', async () => {
    const result2 = await processPaymentProof({
      userId: subscriber.id,
      name: 'Chinedu Okeke',
      email: subscriber.email,
      plan: 'Monthly (Starter)',
      amount: '5,000',
      notes: 'Fake transfer attempt',
      file: {
        originalname: 'fake-proof.png',
        buffer: Buffer.from('fake image'),
        mimetype: 'image/png',
        size: 10,
      },
    });

    submission2 = await testDb.subscriptionSubmission.findUnique({
      where: { id: result2.submissionId },
    });

    const rejected = await rejectSubscription(
      submission2.id,
      adminUser.id,
      'Transfer not reflected on Zenith Bank statement credit alert',
    );

    expect(rejected.status).toBe('rejected');
    expect(rejected.rejectionReason).toBe('Transfer not reflected on Zenith Bank statement credit alert');

    const audit = await testDb.auditLog.findFirst({
      where: {
        resourceType: 'subscription_submission',
        resourceId: submission2.id,
        action: 'subscription.rejected',
      },
    });
    expect(audit).not.toBeNull();
  });
});
