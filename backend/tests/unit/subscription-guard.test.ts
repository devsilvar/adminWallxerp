import {
  getSubscriptionStatus,
  checkBusinessLimit,
  checkTeamLimit,
  checkAiQueryLimit,
  logAiQuery,
} from '@/services/subscription/subscription-guard.service';

describe('Phase 2: Subscription Guard Service Unit Tests', () => {
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;

  describe('getSubscriptionStatus (Pure Functional Evaluation)', () => {
    describe('Admin User Bypass', () => {
      it('grants unlimited access to admin users regardless of subscription fields', () => {
        const status = getSubscriptionStatus({
          role: 'admin',
          createdAt: new Date(Date.now() - 100 * ONE_DAY_MS), // Old account
          subscriptionTier: null, // No subscription
          subscriptionExpiresAt: null,
          trialEndsAt: null,
        });

        expect(status.hasAccess).toBe(true);
        expect(status.isReadOnlyGrace).toBe(false);
        expect(status.isExpired).toBe(false);
        expect(status.isPaid).toBe(true);
        expect(status.tier).toBe('admin');
        expect(status.planName).toBe('System Administrator');
        expect(status.expiresAt).toBe(null);
        expect(status.reason).toBe('ACTIVE');
      });

      it('admin bypasses subscription even if expired subscription fields are present', () => {
        const expiredDate = new Date(Date.now() - 100 * ONE_DAY_MS);
        const status = getSubscriptionStatus({
          role: 'admin',
          createdAt: new Date(Date.now() - 200 * ONE_DAY_MS),
          subscriptionTier: 'starter',
          subscriptionExpiresAt: expiredDate,
          trialEndsAt: expiredDate,
        });

        expect(status.hasAccess).toBe(true);
        expect(status.isExpired).toBe(false);
        expect(status.tier).toBe('admin');
        expect(status.reason).toBe('ACTIVE');
      });
    });

    describe('Free Trial Lifecycle', () => {
      it('grants full access during the 30-day free trial window', () => {
        const createdAt = new Date(Date.now() - 15 * ONE_DAY_MS); // 15 days old
        const status = getSubscriptionStatus({
          createdAt,
          subscriptionTier: 'free',
        });

        expect(status.hasAccess).toBe(true);
        expect(status.isReadOnlyGrace).toBe(false);
        expect(status.isExpired).toBe(false);
        expect(status.isPaid).toBe(false);
        expect(status.reason).toBe('TRIAL_ACTIVE');
        expect(status.expiresAt).toBeDefined();
      });

      it('enters read-only grace period on day 31 (within 2-day grace window)', () => {
        const createdAt = new Date(Date.now() - 31 * ONE_DAY_MS); // 31 days old
        const status = getSubscriptionStatus({
          createdAt,
          subscriptionTier: 'free',
        });

        expect(status.hasAccess).toBe(true);
        expect(status.isReadOnlyGrace).toBe(true);
        expect(status.isExpired).toBe(true);
        expect(status.reason).toBe('TRIAL_IN_GRACE_PERIOD');
      });

      it('completely marks expired on day 33 (past 2-day grace window)', () => {
        const createdAt = new Date(Date.now() - 33 * ONE_DAY_MS); // 33 days old
        const status = getSubscriptionStatus({
          createdAt,
          subscriptionTier: 'free',
        });

        expect(status.hasAccess).toBe(false);
        expect(status.isReadOnlyGrace).toBe(false);
        expect(status.isExpired).toBe(true);
        expect(status.reason).toBe('TRIAL_EXPIRED');
      });

      it('respects explicit trialEndsAt override over createdAt', () => {
        const createdAt = new Date(Date.now() - 40 * ONE_DAY_MS); // 40 days old
        const trialEndsAt = new Date(Date.now() + 5 * ONE_DAY_MS); // 5 days in future

        const status = getSubscriptionStatus({
          createdAt,
          trialEndsAt,
          subscriptionTier: 'free',
        });

        expect(status.hasAccess).toBe(true);
        expect(status.isReadOnlyGrace).toBe(false);
        expect(status.isExpired).toBe(false);
        expect(status.reason).toBe('TRIAL_ACTIVE');
        expect(status.expiresAt).toEqual(trialEndsAt);
      });
    });

    describe('Paid Subscription Lifecycle', () => {
      it('grants full active access for valid active subscription', () => {
        const expiresAt = new Date(Date.now() + 20 * ONE_DAY_MS); // 20 days in future
        const status = getSubscriptionStatus({
          createdAt: new Date(),
          subscriptionTier: 'starter',
          subscriptionExpiresAt: expiresAt,
        });

        expect(status.hasAccess).toBe(true);
        expect(status.isReadOnlyGrace).toBe(false);
        expect(status.isExpired).toBe(false);
        expect(status.isPaid).toBe(true);
        expect(status.tier).toBe('starter');
        expect(status.reason).toBe('ACTIVE');
      });

      it('enters read-only grace period when subscription expired 1 day ago', () => {
        const expiresAt = new Date(Date.now() - 1 * ONE_DAY_MS); // expired yesterday
        const status = getSubscriptionStatus({
          createdAt: new Date(),
          subscriptionTier: 'business',
          subscriptionExpiresAt: expiresAt,
        });

        expect(status.hasAccess).toBe(true);
        expect(status.isReadOnlyGrace).toBe(true);
        expect(status.isExpired).toBe(true);
        expect(status.isPaid).toBe(true);
        expect(status.reason).toBe('SUBSCRIPTION_IN_GRACE_PERIOD');
      });

      it('locks out when subscription expired 5 days ago (past 2-day grace)', () => {
        const expiresAt = new Date(Date.now() - 5 * ONE_DAY_MS); // expired 5 days ago
        const status = getSubscriptionStatus({
          createdAt: new Date(),
          subscriptionTier: 'scale',
          subscriptionExpiresAt: expiresAt,
        });

        expect(status.hasAccess).toBe(false);
        expect(status.isReadOnlyGrace).toBe(false);
        expect(status.isExpired).toBe(true);
        expect(status.isPaid).toBe(true);
        expect(status.reason).toBe('SUBSCRIPTION_EXPIRED');
      });

      it('allows lifetime/grandfathered accounts with null subscriptionExpiresAt', () => {
        const status = getSubscriptionStatus({
          createdAt: new Date(),
          subscriptionTier: 'scale',
          subscriptionExpiresAt: null,
        });

        expect(status.hasAccess).toBe(true);
        expect(status.isReadOnlyGrace).toBe(false);
        expect(status.isExpired).toBe(false);
        expect(status.isPaid).toBe(true);
        expect(status.reason).toBe('ACTIVE');
      });
    });
  });

  describe('Mocked Resource Limit Checks', () => {
    describe('Admin User Resource Bypasses', () => {
      it('checkBusinessLimit grants unlimited businesses to admin users', async () => {
        const mockDb: any = {
          user: {
            findUnique: jest.fn().mockResolvedValue({ role: 'admin' }),
          },
          business: {
            count: jest.fn().mockResolvedValue(50),
          },
        };

        const res = await checkBusinessLimit('admin-user-id', 'free', mockDb);
        expect(res.allowed).toBe(true);
        expect(res.current).toBe(50);
        expect(res.max).toBe(-1);
        expect(res.tier).toBe('admin');
      });

      it('checkTeamLimit grants unlimited team members to admin business owners', async () => {
        const mockDb: any = {
          business: {
            findUnique: jest.fn().mockResolvedValue({
              id: 'admin-biz',
              userId: 'admin-user-id',
              user: { role: 'admin', subscriptionTier: null },
            }),
          },
          businessMember: {
            count: jest.fn().mockResolvedValue(100),
          },
          invitation: {
            count: jest.fn().mockResolvedValue(50),
          },
        };

        const res = await checkTeamLimit('admin-biz', mockDb);
        expect(res.allowed).toBe(true);
        expect(res.current).toBe(150);
        expect(res.max).toBe(-1);
        expect(res.tier).toBe('admin');
        expect(res.ownerTier).toBe('admin');
      });

      it('checkAiQueryLimit grants unlimited queries to admin users', async () => {
        const mockDb: any = {
          user: {
            findUnique: jest.fn().mockResolvedValue({ role: 'admin' }),
          },
          aiQueryLog: {
            count: jest.fn().mockResolvedValue(9999),
          },
        };

        const res = await checkAiQueryLimit('admin-user-id', null, mockDb);
        expect(res.allowed).toBe(true);
        expect(res.current).toBe(0);
        expect(res.max).toBe(-1);
        expect(res.tier).toBe('admin');
      });
    });

    it('checkBusinessLimit correctly enforces tier caps', async () => {
      // Mock TxClient with count returning 1
      const mockDb1: any = {
        user: {
          findUnique: jest.fn().mockResolvedValue({ role: 'user' }),
        },
        business: {
          count: jest.fn().mockResolvedValue(1),
        },
      };

      // Starter max is 2: 1 < 2 -> allowed
      const res1 = await checkBusinessLimit('user-1', 'starter', mockDb1);
      expect(res1.allowed).toBe(true);
      expect(res1.current).toBe(1);
      expect(res1.max).toBe(2);

      // Mock TxClient with count returning 2
      const mockDb2: any = {
        user: {
          findUnique: jest.fn().mockResolvedValue({ role: 'user' }),
        },
        business: {
          count: jest.fn().mockResolvedValue(2),
        },
      };

      // Starter max is 2: 2 >= 2 -> blocked
      const res2 = await checkBusinessLimit('user-1', 'starter', mockDb2);
      expect(res2.allowed).toBe(false);
      expect(res2.current).toBe(2);
      expect(res2.max).toBe(2);

      // Scale-Up plan has unlimited businesses (-1)
      const mockDbScale: any = {
        user: {
          findUnique: jest.fn().mockResolvedValue({ role: 'user' }),
        },
        business: {
          count: jest.fn().mockResolvedValue(99),
        },
      };
      const resScale = await checkBusinessLimit('user-1', 'scale', mockDbScale);
      expect(resScale.allowed).toBe(true);
      expect(resScale.max).toBe(-1);
    });

    it('checkTeamLimit resolves owner tier and checks combined active + pending count', async () => {
      // Mock Business belonging to owner with Business tier (max 10 team members)
      const mockDb: any = {
        business: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'biz-1',
            userId: 'owner-1',
            user: { role: 'user', subscriptionTier: 'business' },
          }),
        },
        businessMember: {
          count: jest.fn().mockResolvedValue(7), // 7 active non-owner members
        },
        invitation: {
          count: jest.fn().mockResolvedValue(2), // 2 pending invitations
        },
      };

      // 7 + 2 = 9 < 10 -> allowed
      const res = await checkTeamLimit('biz-1', mockDb);
      expect(res.allowed).toBe(true);
      expect(res.current).toBe(9);
      expect(res.max).toBe(10);
      expect(res.ownerTier).toBe('business');

      // Now pretend 8 active + 2 pending = 10 -> blocked
      mockDb.businessMember.count.mockResolvedValue(8);
      const resFull = await checkTeamLimit('biz-1', mockDb);
      expect(resFull.allowed).toBe(false);
      expect(resFull.current).toBe(10);
      expect(resFull.max).toBe(10);
    });

    it('checkAiQueryLimit enforces monthly 30-query limit', async () => {
      const mockDb: any = {
        user: {
          findUnique: jest.fn().mockResolvedValue({ role: 'user' }),
        },
        aiQueryLog: {
          count: jest.fn().mockResolvedValue(29),
        },
      };

      // 29 < 30 -> allowed
      const res1 = await checkAiQueryLimit('user-1', 'starter', mockDb);
      expect(res1.allowed).toBe(true);
      expect(res1.current).toBe(29);
      expect(res1.max).toBe(30);

      // 30 >= 30 -> blocked
      mockDb.aiQueryLog.count.mockResolvedValue(30);
      const res2 = await checkAiQueryLimit('user-1', 'starter', mockDb);
      expect(res2.allowed).toBe(false);
      expect(res2.current).toBe(30);
      expect(res2.max).toBe(30);
    });

    it('logAiQuery inserts record with user and query data', async () => {
      const mockDb: any = {
        aiQueryLog: {
          create: jest.fn().mockResolvedValue({ id: 'log-1' }),
        },
      };

      await logAiQuery('user-1', 'biz-1', 'What is my gross profit?', 150, mockDb);

      expect(mockDb.aiQueryLog.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-1',
          businessId: 'biz-1',
          queryText: 'What is my gross profit?',
          responseLength: 150,
        },
      });
    });
  });
});
