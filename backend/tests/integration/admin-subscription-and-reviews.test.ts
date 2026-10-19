import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApp } from '../../src/app';
import { testDb, createTestUser, clearDatabase } from '../helpers/test-db';
import config from '../../src/config';

describe('Admin Subscription Override & Review Campaign End-to-End Integration', () => {
  const app = createApp();
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;
  const userIds: string[] = [];

  const signToken = (user: { id: string; email: string; role?: string }) => {
    return jwt.sign(
      { userId: user.id, email: user.email, role: user.role || 'user' },
      config.jwt.accessSecret,
      { expiresIn: '1h' }
    );
  };

  afterAll(async () => {
    try {
      if (userIds.length > 0) {
        await testDb.userFeedback.deleteMany({
          where: { userId: { in: userIds } },
        });
        await testDb.auditLog.deleteMany({
          where: { resourceId: { in: userIds } },
        });
        await testDb.user.deleteMany({
          where: { id: { in: userIds } },
        });
      }
    } catch {
      // Ignore cleanup error
    } finally {
      await clearDatabase();
      await testDb.$disconnect();
    }
  });

  describe('PATCH /api/v1/admin/users/:id/subscription', () => {
    it('allows admin to override user subscription to business for 90 days', async () => {
      const admin = await createTestUser(`admin-it-${Date.now()}@example.com`);
      const targetUser = await createTestUser(`target-user-it-${Date.now()}@example.com`);
      userIds.push(admin.id, targetUser.id);

      // Upgrade admin to role = admin
      await testDb.user.update({
        where: { id: admin.id },
        data: { role: 'admin' },
      });

      const adminToken = signToken({ id: admin.id, email: admin.email, role: 'admin' });

      const res = await request(app)
        .patch(`/api/v1/admin/users/${targetUser.id}/subscription`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          tier: 'business',
          durationDays: 90,
          reason: 'Corporate contract offline payment verified',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.subscriptionTier).toBe('business');
      expect(res.body.data.subscriptionExpiresAt).toBeDefined();

      // Verify DB persistence
      const updatedInDb = await testDb.user.findUnique({
        where: { id: targetUser.id },
      });
      expect(updatedInDb?.subscriptionTier).toBe('business');
      expect(updatedInDb?.subscriptionExpiresAt).toBeDefined();

      // Verify Audit Log persisted
      const audit = await testDb.auditLog.findFirst({
        where: {
          action: 'admin.subscription_manual_override',
          resourceId: targetUser.id,
        },
      });
      expect(audit).toBeDefined();
      expect(audit?.userId).toBe(admin.id);
    });

    it('rejects non-admin users with 403 Forbidden', async () => {
      const regularUser = await createTestUser(`regular-${Date.now()}@example.com`);
      const targetUser = await createTestUser(`target-403-${Date.now()}@example.com`);
      userIds.push(regularUser.id, targetUser.id);

      const userToken = signToken({ id: regularUser.id, email: regularUser.email, role: 'user' });

      const res = await request(app)
        .patch(`/api/v1/admin/users/${targetUser.id}/subscription`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          tier: 'scale_up',
          reason: 'Unauthorized attempt',
        });

      expect(res.status).toBe(403);
    });

    it('rejects payloads with missing or too short audit reasons with 400 Bad Request', async () => {
      const admin = await createTestUser(`admin-short-reason-${Date.now()}@example.com`);
      const targetUser = await createTestUser(`target-short-${Date.now()}@example.com`);
      userIds.push(admin.id, targetUser.id);

      await testDb.user.update({
        where: { id: admin.id },
        data: { role: 'admin' },
      });

      const adminToken = signToken({ id: admin.id, email: admin.email, role: 'admin' });

      const res = await request(app)
        .patch(`/api/v1/admin/users/${targetUser.id}/subscription`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          tier: 'starter',
          reason: 'no', // < 3 characters
        });

      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/v1/feedback/prompt-eligibility', () => {
    it('returns unauthenticated for requests without user token', async () => {
      const res = await request(app).get('/api/v1/feedback/prompt-eligibility');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.eligible).toBe(false);
      expect(res.body.data.reason).toBe('UNAUTHENTICATED');
    });

    it('returns eligible: true with delaySeconds: 150 for established returning users on campaign day', async () => {
      const returningUser = await createTestUser(`returning-api-${Date.now()}@example.com`);
      userIds.push(returningUser.id);

      // Set user creation date to 10 days ago (established user)
      await testDb.user.update({
        where: { id: returningUser.id },
        data: { createdAt: new Date(Date.now() - 10 * ONE_DAY_MS) },
      });

      const userToken = signToken({ id: returningUser.id, email: returningUser.email, role: 'user' });

      const res = await request(app)
        .get('/api/v1/feedback/prompt-eligibility?force=true')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.eligible).toBe(true);
      expect(res.body.data.delaySeconds).toBe(150);
    });
  });
});
