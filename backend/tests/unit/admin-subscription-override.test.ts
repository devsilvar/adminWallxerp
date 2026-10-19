import { testDb, createTestUser, clearDatabase } from '../helpers/test-db';
import { overrideUserSubscription, previewDowngrade, listUsers, getUserDetail } from '../../src/services/admin/admin.service';

describe('Admin Subscription Override & User Directory Subscription State', () => {
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;
  const userIds: string[] = [];

  afterAll(async () => {
    try {
      if (userIds.length > 0) {
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

  describe('overrideUserSubscription', () => {
    it('overrides user plan to starter for 30 days and logs audit', async () => {
      const admin = await createTestUser(`admin-${Date.now()}@example.com`);
      const targetUser = await createTestUser(`target-starter-${Date.now()}@example.com`);
      userIds.push(admin.id, targetUser.id);

      const result = await overrideUserSubscription(targetUser.id, admin.id, {
        tier: 'starter',
        durationDays: 30,
        reason: 'Paid via direct bank transfer invoice #1001',
      });

      expect(result.subscriptionTier).toBe('starter');
      expect(result.subscriptionExpiresAt).toBeDefined();

      const expiresMs = new Date(result.subscriptionExpiresAt!).getTime();
      const expectedMinMs = Date.now() + 29 * ONE_DAY_MS;
      const expectedMaxMs = Date.now() + 31 * ONE_DAY_MS;
      expect(expiresMs).toBeGreaterThan(expectedMinMs);
      expect(expiresMs).toBeLessThan(expectedMaxMs);

      // Verify Audit Log persisted in database
      const audit = await testDb.auditLog.findFirst({
        where: {
          action: 'admin.subscription_manual_override',
          resourceId: targetUser.id,
        },
      });
      expect(audit).toBeDefined();
      expect(audit?.userId).toBe(admin.id);
      expect((audit?.newData as any)?.tier).toBe('starter');
      expect((audit?.newData as any)?.reason).toBe('Paid via direct bank transfer invoice #1001');
    });

    it('overrides user plan to business for 90 days', async () => {
      const admin = await createTestUser(`admin-biz-${Date.now()}@example.com`);
      const targetUser = await createTestUser(`target-biz-${Date.now()}@example.com`);
      userIds.push(admin.id, targetUser.id);

      const result = await overrideUserSubscription(targetUser.id, admin.id, {
        tier: 'business',
        durationDays: 90,
        reason: 'Quarterly promo upgrade',
      });

      expect(result.subscriptionTier).toBe('business');
      const expiresMs = new Date(result.subscriptionExpiresAt!).getTime();
      const expectedMinMs = Date.now() + 89 * ONE_DAY_MS;
      expect(expiresMs).toBeGreaterThan(expectedMinMs);
    });

    it('normalizes legacy scale input to canonical scale and supports lifetime (null duration)', async () => {
      const admin = await createTestUser(`admin-scale-${Date.now()}@example.com`);
      const targetUser = await createTestUser(`target-scale-${Date.now()}@example.com`);
      userIds.push(admin.id, targetUser.id);

      const result = await overrideUserSubscription(targetUser.id, admin.id, {
        tier: 'scale', // legacy input
        durationDays: null, // lifetime / indefinite
        reason: 'VIP Founding partner lifetime waiver',
      });

      expect(result.subscriptionTier).toBe('scale');
      expect(result.subscriptionExpiresAt).toBeNull();
    });

    it('resets trial to exactly 30 days when resetTrial is true', async () => {
      const admin = await createTestUser(`admin-trial-${Date.now()}@example.com`);
      const targetUser = await createTestUser(`target-trial-${Date.now()}@example.com`);
      userIds.push(admin.id, targetUser.id);

      // Pre-set user trial to expired 5 days ago
      await testDb.user.update({
        where: { id: targetUser.id },
        data: {
          trialEndsAt: new Date(Date.now() - 5 * ONE_DAY_MS),
        },
      });

      const result = await overrideUserSubscription(targetUser.id, admin.id, {
        tier: 'free',
        resetTrial: true,
        reason: 'Courtesy 30-day trial extension for sales demo',
      });

      expect(result.subscriptionTier).toBe('free');
      expect(result.trialEndsAt).toBeDefined();

      const trialEndMs = new Date(result.trialEndsAt!).getTime();
      const expectedMinMs = Date.now() + 29 * ONE_DAY_MS;
      const expectedMaxMs = Date.now() + 31 * ONE_DAY_MS;
      expect(trialEndMs).toBeGreaterThan(expectedMinMs);
      expect(trialEndMs).toBeLessThan(expectedMaxMs);
    });

    it('throws 404 when target user is not found', async () => {
      const admin = await createTestUser(`admin-err-${Date.now()}@example.com`);
      userIds.push(admin.id);

      await expect(
        overrideUserSubscription('00000000-0000-0000-0000-000000000000', admin.id, {
          tier: 'starter',
          reason: 'Non-existent test',
        })
      ).rejects.toThrow('User not found');
    });
  });

  describe('listUsers and getUserDetail subscription fields exposure', () => {
    it('returns subscriptionTier, subscriptionExpiresAt, and trialEndsAt in listUsers and getUserDetail', async () => {
      const user = await createTestUser(`directory-user-${Date.now()}@example.com`);
      userIds.push(user.id);

      const trialEnd = new Date(Date.now() + 7 * ONE_DAY_MS);
      const subExpires = new Date(Date.now() + 30 * ONE_DAY_MS);

      await testDb.user.update({
        where: { id: user.id },
        data: {
          subscriptionTier: 'starter',
          subscriptionExpiresAt: subExpires,
          trialEndsAt: trialEnd,
        },
      });

      // 1. Check listUsers
      const listRes = await listUsers(1, 20, user.email);
      const foundInList = listRes.data.find((u) => u.id === user.id);
      expect(foundInList).toBeDefined();
      expect(foundInList?.subscriptionTier).toBe('starter');
      expect(foundInList?.subscriptionExpiresAt).toBe(subExpires.toISOString());
      expect(foundInList?.trialEndsAt).toBe(trialEnd.toISOString());

      // 2. Check getUserDetail
      const detailRes = await getUserDetail(user.id);
      expect(detailRes).toBeDefined();
      expect(detailRes?.subscriptionTier).toBe('starter');
      expect(detailRes?.subscriptionExpiresAt).toEqual(subExpires);
      expect(detailRes?.trialEndsAt).toEqual(trialEnd);
    });
  });

  describe('Downgrade Quota Preview & Confirmation Guard', () => {
    it('previewDowngrade flags accounts exceeding starter business cap (maxBusinesses = 2)', async () => {
      const user = await createTestUser(`scale-user-${Date.now()}@example.com`);
      userIds.push(user.id);

      // Create 3 businesses (exceeds Starter cap of 2)
      for (let i = 1; i <= 3; i++) {
        await testDb.business.create({
          data: {
            userId: user.id,
            businessName: `Store Branch ${i} - ${Date.now()}`,
            ownerName: 'Test Owner',
            merchantId: `MERCH-SCALE-${i}-${Date.now()}-${Math.random()}`,
          },
        });
      }

      const preview = await previewDowngrade(user.id, 'starter');
      expect(preview.isOverLimit).toBe(true);
      expect(preview.overLimit.businesses).toBeDefined();
      expect(preview.overLimit.businesses?.current).toBe(3);
      expect(preview.overLimit.businesses?.max).toBe(2);
      expect(preview.overLimit.businesses?.excess).toBe(1);
    });

    it('throws DOWNGRADE_OVER_LIMIT (409) when downgrading over-limit account without confirmDowngrade', async () => {
      const admin = await createTestUser(`admin-guard-${Date.now()}@example.com`);
      const user = await createTestUser(`downgrade-user-${Date.now()}@example.com`);
      userIds.push(admin.id, user.id);

      // Start user at Scale-up with 3 businesses
      await testDb.user.update({
        where: { id: user.id },
        data: { subscriptionTier: 'scale' },
      });

      for (let i = 1; i <= 3; i++) {
        await testDb.business.create({
          data: {
            userId: user.id,
            businessName: `Scale Branch ${i} - ${Date.now()}`,
            ownerName: 'Test Owner',
            merchantId: `MERCH-DWN-${i}-${Date.now()}-${Math.random()}`,
          },
        });
      }

      // Attempt downgrade to starter without confirmDowngrade
      await expect(
        overrideUserSubscription(user.id, admin.id, {
          tier: 'starter',
          durationDays: 30,
          reason: 'Attempt downgrade without confirmation',
          confirmDowngrade: false,
        })
      ).rejects.toMatchObject({
        statusCode: 409,
        code: 'DOWNGRADE_OVER_LIMIT',
      });
    });

    it('succeeds when confirmDowngrade is true even if account exceeds limits', async () => {
      const admin = await createTestUser(`admin-confirm-${Date.now()}@example.com`);
      const user = await createTestUser(`confirmed-dwn-${Date.now()}@example.com`);
      userIds.push(admin.id, user.id);

      await testDb.user.update({
        where: { id: user.id },
        data: { subscriptionTier: 'scale' },
      });

      for (let i = 1; i <= 3; i++) {
        await testDb.business.create({
          data: {
            userId: user.id,
            businessName: `Branch ${i} - ${Date.now()}`,
            ownerName: 'Test Owner',
            merchantId: `MERCH-CNF-${i}-${Date.now()}-${Math.random()}`,
          },
        });
      }

      const result = await overrideUserSubscription(user.id, admin.id, {
        tier: 'starter',
        durationDays: 30,
        reason: 'Customer agreed to downgrade over limits',
        confirmDowngrade: true,
      });

      expect(result.subscriptionTier).toBe('starter');
      const updatedUser = await testDb.user.findUnique({ where: { id: user.id } });
      expect(updatedUser?.subscriptionTier).toBe('starter');
    });

    it('never throws 409 for upgrades or same-tier overrides', async () => {
      const admin = await createTestUser(`admin-upgrade-${Date.now()}@example.com`);
      const user = await createTestUser(`upgrade-user-${Date.now()}@example.com`);
      userIds.push(admin.id, user.id);

      await testDb.user.update({
        where: { id: user.id },
        data: { subscriptionTier: 'starter' },
      });

      // Upgrade to business: should never throw 409
      const result = await overrideUserSubscription(user.id, admin.id, {
        tier: 'business',
        durationDays: 90,
        reason: 'Upgrading user to business tier',
      });

      expect(result.subscriptionTier).toBe('business');
    });
  });
});
