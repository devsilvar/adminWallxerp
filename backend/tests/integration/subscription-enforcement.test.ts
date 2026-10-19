import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApp } from '../../src/app';
import { testDb, createTestUser, createTestBusiness, clearDatabase } from '../helpers/test-db';
import config from '../../src/config';

describe('Subscription & Quota Enforcement Integration Tests', () => {
  const app = createApp();
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;

  // Track created IDs for clean teardown
  const userIds: string[] = [];
  const businessIds: string[] = [];

  const signToken = (user: { id: string; email: string; role?: string }) => {
    return jwt.sign(
      { userId: user.id, email: user.email, role: user.role || 'user' },
      config.jwt.accessSecret,
      { expiresIn: '1h' }
    );
  };

  beforeAll(async () => {
    // Explicitly enable enforcement in test context to test hard guards
    (config as any).subscription = {
      ...config.subscription,
      enforcementEnabled: true,
      trialDays: 30,
      graceDays: 2,
    };
  });

  afterAll(async () => {
    try {
      await testDb.aiQueryLog.deleteMany({
        where: { userId: { in: userIds } },
      });
      await testDb.invitation.deleteMany({
        where: { businessId: { in: businessIds } },
      });
      await testDb.businessMember.deleteMany({
        where: { businessId: { in: businessIds } },
      });
      await testDb.customerCredit.deleteMany({
        where: { businessId: { in: businessIds } },
      });
      await testDb.salesTransaction.deleteMany({
        where: { businessId: { in: businessIds } },
      });
      await testDb.business.deleteMany({
        where: { id: { in: businessIds } },
      });
      await testDb.user.deleteMany({
        where: { id: { in: userIds } },
      });
    } catch {
      // Ignore teardown errors
    } finally {
      await clearDatabase();
      await testDb.$disconnect();
    }
  }, 30000);

  describe('Trial Lifecycle & 2-Day Read-Only Grace Period', () => {
    it('Active 30-day trial: allows both reads (GET) and writes (POST)', async () => {
      const activeUser = await createTestUser(`active-trial-${Date.now()}@example.com`);
      userIds.push(activeUser.id);

      // Active trial: created 3 days ago (expires in 27 days)
      await testDb.user.update({
        where: { id: activeUser.id },
        data: {
          createdAt: new Date(Date.now() - 3 * ONE_DAY_MS),
          subscriptionTier: 'free',
          trialEndsAt: new Date(Date.now() + 7 * ONE_DAY_MS),
        },
      });

      const biz = await createTestBusiness(activeUser.id, 'Active Trial Store');
      businessIds.push(biz.id);

      const token = signToken(activeUser);

      // 1. GET /sales -> 200 OK
      const getRes = await request(app)
        .get(`/api/v1/businesses/${biz.id}/sales`)
        .set('Authorization', `Bearer ${token}`);

      expect(getRes.status).toBe(200);

      // 2. POST /sales -> 201 Created
      const postRes = await request(app)
        .post(`/api/v1/businesses/${biz.id}/sales`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          amount: 15000,
          customerName: 'Amina Bello',
          source: 'cash',
          transactionDate: new Date().toISOString(),
        });

      expect(postRes.status).toBe(201);
      expect(postRes.body.success).toBe(true);
    });

    it('2-Day Read-Only Grace Period: allows reads (GET), blocks mutating writes (POST)', async () => {
      const graceUser = await createTestUser(`grace-user-${Date.now()}@example.com`);
      userIds.push(graceUser.id);

      // 11 days old: trial ended 1 day ago (within 2-day grace window)
      const trialEndsAt = new Date(Date.now() - 1 * ONE_DAY_MS);
      await testDb.user.update({
        where: { id: graceUser.id },
        data: {
          createdAt: new Date(Date.now() - 11 * ONE_DAY_MS),
          subscriptionTier: 'free',
          trialEndsAt,
        },
      });

      const biz = await createTestBusiness(graceUser.id, 'Grace Period Store');
      businessIds.push(biz.id);

      const token = signToken(graceUser);

      // 1. Read access MUST be permitted
      const getRes = await request(app)
        .get(`/api/v1/businesses/${biz.id}/sales`)
        .set('Authorization', `Bearer ${token}`);

      expect(getRes.status).toBe(200);

      // 2. Mutating write MUST be blocked with TRIAL_IN_GRACE_PERIOD
      const postRes = await request(app)
        .post(`/api/v1/businesses/${biz.id}/sales`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          amount: 25000,
          customerName: 'Grace Tester',
          source: 'cash',
          transactionDate: new Date().toISOString(),
        });

      expect(postRes.status).toBe(403);
      expect(postRes.body.error.code).toBe('TRIAL_IN_GRACE_PERIOD');
    });

    it('Expired past grace period: allows reads (GET) and blocks writes (POST) under soft read-only lockout', async () => {
      const expiredUser = await createTestUser(`expired-user-${Date.now()}@example.com`);
      userIds.push(expiredUser.id);

      // 35 days old: trial ended 5 days ago (past 2-day grace window)
      const trialEndsAt = new Date(Date.now() - 5 * ONE_DAY_MS);
      await testDb.user.update({
        where: { id: expiredUser.id },
        data: {
          createdAt: new Date(Date.now() - 35 * ONE_DAY_MS),
          subscriptionTier: 'free',
          trialEndsAt,
        },
      });

      const biz = await createTestBusiness(expiredUser.id, 'Locked Out Store');
      businessIds.push(biz.id);

      const token = signToken(expiredUser);

      // 1. Read allowed (soft read-only)
      const getRes = await request(app)
        .get(`/api/v1/businesses/${biz.id}/sales`)
        .set('Authorization', `Bearer ${token}`);

      expect(getRes.status).toBe(200);

      // 2. Write blocked
      const postRes = await request(app)
        .post(`/api/v1/businesses/${biz.id}/sales`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          amount: 5000,
          customerName: 'Locked Out User',
          source: 'cash',
          transactionDate: new Date().toISOString(),
        });

      expect(postRes.status).toBe(403);
      expect(postRes.body.error.code).toBe('TRIAL_EXPIRED');
    });
  });

  describe('Tier Resource Limit Enforcement', () => {
    it('Starter tier: allows creating up to 2 businesses; 3rd is blocked', async () => {
      const starterUser = await createTestUser(`starter-biz-${Date.now()}@example.com`);
      userIds.push(starterUser.id);

      await testDb.user.update({
        where: { id: starterUser.id },
        data: {
          subscriptionTier: 'starter',
          subscriptionExpiresAt: new Date(Date.now() + 30 * ONE_DAY_MS),
        },
      });

      const token = signToken(starterUser);

      // 1st business -> 201 Created
      const res1 = await request(app)
        .post('/api/v1/businesses')
        .set('Authorization', `Bearer ${token}`)
        .send({
          businessName: 'Starter Branch 1',
          ownerName: 'Starter Owner',
          businessType: 'Retail',
        });

      expect(res1.status).toBe(201);
      businessIds.push(res1.body.data.id);

      // 2nd business -> 201 Created
      const res2 = await request(app)
        .post('/api/v1/businesses')
        .set('Authorization', `Bearer ${token}`)
        .send({
          businessName: 'Starter Branch 2',
          ownerName: 'Starter Owner',
          businessType: 'Retail',
        });

      expect(res2.status).toBe(201);
      businessIds.push(res2.body.data.id);

      // 3rd business -> 403 BUSINESS_LIMIT_REACHED
      const res3 = await request(app)
        .post('/api/v1/businesses')
        .set('Authorization', `Bearer ${token}`)
        .send({
          businessName: 'Starter Branch 3 (Excess)',
          ownerName: 'Starter Owner',
          businessType: 'Retail',
        });

      expect(res3.status).toBe(403);
      expect(res3.body.error.code).toBe('BUSINESS_LIMIT_REACHED');
      expect(res3.body.error.details.maxBusinesses).toBe(2);
    });

    it('Starter tier: allows inviting up to 3 team members; 4th is blocked', async () => {
      const ownerUser = await createTestUser(`starter-team-${Date.now()}@example.com`);
      userIds.push(ownerUser.id);

      await testDb.user.update({
        where: { id: ownerUser.id },
        data: {
          subscriptionTier: 'starter',
          subscriptionExpiresAt: new Date(Date.now() + 30 * ONE_DAY_MS),
        },
      });

      const biz = await createTestBusiness(ownerUser.id, 'Starter Team SME');
      businessIds.push(biz.id);

      const token = signToken(ownerUser);

      // Invite 3 members (cap is 3)
      for (let i = 1; i <= 3; i++) {
        const invRes = await request(app)
          .post(`/api/v1/businesses/${biz.id}/team/invite`)
          .set('Authorization', `Bearer ${token}`)
          .send({
            email: `member-${i}-${Date.now()}@example.com`,
            role: 'sales_staff',
          });

        expect(invRes.status).toBe(201);
      }

      // 4th invitation -> 400 TEAM_MEMBER_CAP_REACHED
      const inv4Res = await request(app)
        .post(`/api/v1/businesses/${biz.id}/team/invite`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          email: `member-excess-${Date.now()}@example.com`,
          role: 'sales_staff',
        });

      expect(inv4Res.status).toBe(400);
      expect(inv4Res.body.error.code).toBe('TEAM_MEMBER_CAP_REACHED');
      expect(inv4Res.body.error.details.maxTeamMembers).toBe(3);
    });
  });

  describe('Route-Level Feature Gating', () => {
    it('Starter tier: blocks customer credits with 403 FEATURE_BLOCKED', async () => {
      const starterUser = await createTestUser(`starter-credit-${Date.now()}@example.com`);
      userIds.push(starterUser.id);

      await testDb.user.update({
        where: { id: starterUser.id },
        data: {
          subscriptionTier: 'starter',
          subscriptionExpiresAt: new Date(Date.now() + 30 * ONE_DAY_MS),
        },
      });

      const biz = await createTestBusiness(starterUser.id, 'Starter Credit SME');
      businessIds.push(biz.id);

      const token = signToken(starterUser);

      const res = await request(app)
        .post(`/api/v1/businesses/${biz.id}/credits`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          customerName: 'Chidi Obi',
          amount: 50000,
          dueDate: new Date(Date.now() + 14 * ONE_DAY_MS).toISOString(),
        });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FEATURE_BLOCKED');
      expect(res.body.error.details.feature).toBe('bnplCredits');
    });

    it('Business tier: permits customer credits feature', async () => {
      const bizUser = await createTestUser(`business-credit-${Date.now()}@example.com`);
      userIds.push(bizUser.id);

      await testDb.user.update({
        where: { id: bizUser.id },
        data: {
          subscriptionTier: 'business',
          subscriptionExpiresAt: new Date(Date.now() + 90 * ONE_DAY_MS),
        },
      });

      const biz = await createTestBusiness(bizUser.id, 'Business Credit SME');
      businessIds.push(biz.id);

      const token = signToken(bizUser);

      // Business tier passes the feature guard (returns 201 or validation error, not 403 FEATURE_BLOCKED)
      const res = await request(app)
        .post(`/api/v1/businesses/${biz.id}/credits`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          customerName: 'Emeka Okafor',
          amount: 75000,
          dueDate: new Date(Date.now() + 14 * ONE_DAY_MS).toISOString(),
        });

      expect(res.status).not.toBe(403);
      expect(res.body.error?.code).not.toBe('FEATURE_BLOCKED');
    });
  });

  describe('AI Copilot Monthly Quota Enforcement', () => {
    it('Blocks AI question when 30 monthly queries are exceeded', async () => {
      const aiUser = await createTestUser(`ai-quota-${Date.now()}@example.com`);
      userIds.push(aiUser.id);

      await testDb.user.update({
        where: { id: aiUser.id },
        data: {
          subscriptionTier: 'starter',
          subscriptionExpiresAt: new Date(Date.now() + 30 * ONE_DAY_MS),
        },
      });

      const biz = await createTestBusiness(aiUser.id, 'AI Quota SME');
      businessIds.push(biz.id);

      // Seed 30 AI query log records in the current UTC month
      const now = new Date();
      const logs = Array.from({ length: 30 }, (_, i) => ({
        userId: aiUser.id,
        businessId: biz.id,
        queryText: `Test question ${i + 1}`,
        createdAt: now,
      }));

      await testDb.aiQueryLog.createMany({ data: logs });

      const token = signToken(aiUser);

      // 31st query attempt must be rejected with 403 AI_QUERY_LIMIT_REACHED
      const res = await request(app)
        .post(`/api/v1/businesses/${biz.id}/ai/chat`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          message: 'What is my current monthly profit?',
        });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('AI_QUERY_LIMIT_REACHED');
      expect(res.body.error.details.maxQueries).toBe(30);
    });
  });

  describe('Downgrade Lifecycle & Read/Write Split Enforcement', () => {
    it('Scale -> Starter with confirmDowngrade: true keeps GET /credits (200), blocks POST /credits (403), and blocks exceeding business cap (403)', async () => {
      const admin = await createTestUser(`admin-int-${Date.now()}@example.com`);
      const user = await createTestUser(`downgraded-owner-${Date.now()}@example.com`);
      userIds.push(admin.id, user.id);

      // User starts on Scale tier with 2 businesses
      await testDb.user.update({
        where: { id: user.id },
        data: {
          subscriptionTier: 'scale',
          subscriptionExpiresAt: new Date(Date.now() + 30 * ONE_DAY_MS),
        },
      });

      const biz1 = await createTestBusiness(user.id, `Store Alpha - ${Date.now()}`);
      const biz2 = await createTestBusiness(user.id, `Store Beta - ${Date.now()}`);
      businessIds.push(biz1.id, biz2.id);

      // Create an existing debtor credit on biz1 while on Scale tier
      const credit = await testDb.customerCredit.create({
        data: {
          businessId: biz1.id,
          customerName: 'Existing Debtor',
          description: 'Store credit goods',
          totalAmount: 50000,
          balance: 50000,
          issueDate: new Date(),
          dueDate: new Date(Date.now() + 14 * ONE_DAY_MS),
          status: 'unpaid',
        },
      });

      const adminToken = jwt.sign(
        { userId: admin.id, email: admin.email, role: 'admin' },
        config.jwt.accessSecret,
        { expiresIn: '1h' }
      );
      const userToken = signToken(user);

      // 1. Admin downgrades user to Starter with confirmDowngrade: true
      const downgradeRes = await request(app)
        .patch(`/api/v1/admin/users/${user.id}/subscription`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          tier: 'starter',
          durationDays: 30,
          reason: 'User requested downgrade to Starter',
          confirmDowngrade: true,
        });

      expect(downgradeRes.status).toBe(200);
      expect(downgradeRes.body.data.subscriptionTier).toBe('starter');

      // 2. READ SPLIT VERIFICATION: GET /credits must return 200 and return the existing credit
      const getCreditsRes = await request(app)
        .get(`/api/v1/businesses/${biz1.id}/credits`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(getCreditsRes.status).toBe(200);
      expect(Array.isArray(getCreditsRes.body.data)).toBe(true);
      expect(getCreditsRes.body.data.length).toBeGreaterThanOrEqual(1);

      // 3. WRITE GATE VERIFICATION: POST /credits must return 403 FEATURE_BLOCKED
      const postCreditRes = await request(app)
        .post(`/api/v1/businesses/${biz1.id}/credits`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          customerName: 'New Debtor Blocked',
          description: 'Blocked credit',
          totalAmount: 20000,
          issueDate: new Date().toISOString(),
          dueDate: new Date(Date.now() + 7 * ONE_DAY_MS).toISOString(),
        });

      expect(postCreditRes.status).toBe(403);
      expect(postCreditRes.body.error.code).toBe('FEATURE_BLOCKED');

      // 4. BUSINESS QUOTA: User already has 2 businesses (Starter cap = 2). POST /businesses must return 403 BUSINESS_LIMIT_REACHED
      const postBizRes = await request(app)
        .post('/api/v1/businesses')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          businessName: `3rd Business Attempt - ${Date.now()}`,
          ownerName: 'Test Owner',
          businessType: 'sole_proprietorship',
        });

      expect(postBizRes.status).toBe(403);
      expect(postBizRes.body.error.code).toBe('BUSINESS_LIMIT_REACHED');

      // Clean up the credit
      await testDb.customerCredit.delete({ where: { id: credit.id } });
    });
  });
});
