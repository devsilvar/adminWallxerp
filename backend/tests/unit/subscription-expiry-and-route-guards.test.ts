import { checkAndMarkExpiredSubscriptions } from '@/services/subscription/subscription-expiry.service';
import { requireActiveSubscription, requireFeature } from '@/middleware/subscription';
import prisma from '@/lib/prisma';
import config from '@/config';
import * as emailDispatch from '@/services/email-dispatch.service';

jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: {
    user: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    $queryRaw: jest.fn(),
    $transaction: jest.fn((cb) => cb({
      $queryRaw: jest.fn().mockResolvedValue([{ locked: true }]),
    })),
  },
}));

jest.mock('@/services/email-dispatch.service', () => ({
  dispatchSubscriptionExpiredEmail: jest.fn().mockResolvedValue(undefined),
  dispatchTrialEndingReminderEmail: jest.fn().mockResolvedValue(undefined),
}));

describe('Phase 3: Subscription Expiry & Route Protection Guards', () => {
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('checkAndMarkExpiredSubscriptions Service', () => {
    it('detects recently expired trials and dispatches email alerts', async () => {
      const mockExpiredTrialUsers = [
        {
          id: 'user-trial-expired',
          email: 'trial@example.com',
          fullName: 'Trial User',
          subscriptionTier: 'free',
          trialEndsAt: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
        },
      ];

      (prisma.user.findMany as jest.Mock)
        .mockResolvedValueOnce(mockExpiredTrialUsers) // 1. Expired trials
        .mockResolvedValueOnce([]) // 2. Expired subs
        .mockResolvedValueOnce([]) // 3. 3-day reminders
        .mockResolvedValueOnce([]); // 4. 1-day reminders

      const result = await checkAndMarkExpiredSubscriptions();

      expect(result.expiredTrials).toBe(1);
      expect(result.expiredSubs).toBe(0);
      expect(emailDispatch.dispatchSubscriptionExpiredEmail).toHaveBeenCalledWith(
        mockExpiredTrialUsers[0],
        'trial'
      );
    });

    it('detects recently expired paid subscriptions and dispatches email alerts', async () => {
      const mockExpiredPaidUsers = [
        {
          id: 'user-sub-expired',
          email: 'paid@example.com',
          fullName: 'Paid User',
          subscriptionTier: 'business',
          subscriptionExpiresAt: new Date(Date.now() - 5 * 60 * 60 * 1000), // 5 hours ago
        },
      ];

      (prisma.user.findMany as jest.Mock)
        .mockResolvedValueOnce([]) // 1. Expired trials
        .mockResolvedValueOnce(mockExpiredPaidUsers) // 2. Expired subs
        .mockResolvedValueOnce([]) // 3. 3-day reminders
        .mockResolvedValueOnce([]); // 4. 1-day reminders

      const result = await checkAndMarkExpiredSubscriptions();

      expect(result.expiredTrials).toBe(0);
      expect(result.expiredSubs).toBe(1);
      expect(emailDispatch.dispatchSubscriptionExpiredEmail).toHaveBeenCalledWith(
        mockExpiredPaidUsers[0],
        'subscription'
      );
    });
  });

  describe('requireActiveSubscription Middleware', () => {
    let mockReq: any;
    let mockRes: any;
    let next: jest.Mock;

    beforeEach(() => {
      mockReq = {
        user: { userId: 'user-1' },
        method: 'POST',
        originalUrl: '/api/v1/sales',
      };
      mockRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      next = jest.fn();
      // Ensure enforcement is enabled in test environment
      (config as any).subscription = {
        enforcementEnabled: true,
        trialDays: 30,
        gracePeriodDays: 2,
      };
    });

    it('allows full access during active 30-day trial', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: 'user-1',
        createdAt: new Date(Date.now() - 3 * ONE_DAY_MS),
        subscriptionTier: 'free',
        subscriptionExpiresAt: null,
        trialEndsAt: null,
      });

      await requireActiveSubscription(mockReq, mockRes, next);

      expect(next).toHaveBeenCalledWith();
      expect(mockReq.subscription.hasAccess).toBe(true);
      expect(mockReq.subscription.isReadOnlyGrace).toBe(false);
    });

    it('allows read requests (GET) during 2-day grace period', async () => {
      mockReq.method = 'GET';
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: 'user-1',
        createdAt: new Date(Date.now() - 31 * ONE_DAY_MS), // Day 31 (in 2-day grace period)
        subscriptionTier: 'free',
        subscriptionExpiresAt: null,
        trialEndsAt: null,
      });

      await requireActiveSubscription(mockReq, mockRes, next);

      expect(next).toHaveBeenCalledWith();
      expect(mockReq.subscription.isReadOnlyGrace).toBe(true);
    });

    it('blocks mutating requests (POST) during 2-day grace period with 403 error', async () => {
      mockReq.method = 'POST';
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: 'user-1',
        createdAt: new Date(Date.now() - 31 * ONE_DAY_MS), // Day 31
        subscriptionTier: 'free',
        subscriptionExpiresAt: null,
        trialEndsAt: null,
      });

      await requireActiveSubscription(mockReq, mockRes, next);

      expect(next).toHaveBeenCalled();
      const error = next.mock.calls[0][0];
      expect(error.statusCode).toBe(403);
      expect(error.code).toBe('TRIAL_IN_GRACE_PERIOD');
    });

    it('allows read requests (GET) even when trial and grace period are both expired (soft read-only)', async () => {
      mockReq.method = 'GET';
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: 'user-1',
        createdAt: new Date(Date.now() - 35 * ONE_DAY_MS), // Day 35 (expired)
        subscriptionTier: 'free',
        subscriptionExpiresAt: null,
        trialEndsAt: null,
      });

      await requireActiveSubscription(mockReq, mockRes, next);

      expect(next).toHaveBeenCalledWith();
      expect(mockReq.subscription.hasAccess).toBe(false);
      expect(mockReq.subscription.isExpired).toBe(true);
    });

    it('blocks mutating requests (POST) when trial and grace period are both expired', async () => {
      mockReq.method = 'POST';
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: 'user-1',
        createdAt: new Date(Date.now() - 35 * ONE_DAY_MS), // Day 35 (expired)
        subscriptionTier: 'free',
        subscriptionExpiresAt: null,
        trialEndsAt: null,
      });

      await requireActiveSubscription(mockReq, mockRes, next);

      expect(next).toHaveBeenCalled();
      const error = next.mock.calls[0][0];
      expect(error.statusCode).toBe(403);
      expect(error.code).toBe('TRIAL_EXPIRED');
    });

    it('allows fund access exempt requests (POST /settlement/withdraw) even when expired', async () => {
      mockReq.method = 'POST';
      mockReq.originalUrl = '/api/v1/settlement/withdraw';
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: 'user-1',
        createdAt: new Date(Date.now() - 35 * ONE_DAY_MS), // Day 35 (expired)
        subscriptionTier: 'free',
        subscriptionExpiresAt: null,
        trialEndsAt: null,
      });

      await requireActiveSubscription(mockReq, mockRes, next);

      expect(next).toHaveBeenCalledWith();
    });

    it('allows request when enforcementEnabled is false (soft-launch monitoring mode)', async () => {
      (config as any).subscription.enforcementEnabled = false;
      mockReq.method = 'POST';
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: 'user-1',
        createdAt: new Date(Date.now() - 40 * ONE_DAY_MS), // Expired
        subscriptionTier: 'free',
        subscriptionExpiresAt: null,
        trialEndsAt: null,
      });

      await requireActiveSubscription(mockReq, mockRes, next);

      // In soft launch, next() is called with no error
      expect(next).toHaveBeenCalledWith();
      expect(mockReq.subscription).toBeDefined();
    });
  });

  describe('requireFeature Middleware', () => {
    let mockReq: any;
    let mockRes: any;
    let next: jest.Mock;

    beforeEach(() => {
      mockReq = {
        user: { userId: 'user-1' },
        subscription: {
          tier: 'starter',
          hasAccess: true,
        },
      };
      mockRes = {};
      next = jest.fn();
      (config as any).subscription.enforcementEnabled = true;
    });

    it('blocks bnplCredits on Starter tier', async () => {
      const middleware = requireFeature('bnplCredits');
      await middleware(mockReq, mockRes, next);

      expect(next).toHaveBeenCalled();
      const error = next.mock.calls[0][0];
      expect(error.statusCode).toBe(403);
      expect(error.code).toBe('FEATURE_BLOCKED');
    });

    it('allows bnplCredits on Business tier', async () => {
      mockReq.subscription.tier = 'business';
      const middleware = requireFeature('bnplCredits');
      await middleware(mockReq, mockRes, next);

      expect(next).toHaveBeenCalledWith();
    });

    it('allows bnplCredits during Free Trial (full access)', async () => {
      mockReq.subscription.tier = 'free';
      const middleware = requireFeature('bnplCredits');
      await middleware(mockReq, mockRes, next);

      expect(next).toHaveBeenCalledWith();
    });
  });
});
