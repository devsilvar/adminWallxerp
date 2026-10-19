import { config } from '@/config';
import {
  SUBSCRIPTION_PLANS,
  getPlanLimits,
  isFeatureAllowed,
} from '@/config/subscription-plans';

describe('Phase 1: Subscription Plans Configuration & Foundations', () => {
  describe('Central Easy-Edit Plan Definitions', () => {
    it('defines all four core tiers with required properties', () => {
      const requiredTiers = ['free', 'starter', 'business', 'scale'];
      for (const tier of requiredTiers) {
        expect(SUBSCRIPTION_PLANS[tier]).toBeDefined();
        expect(SUBSCRIPTION_PLANS[tier].name).toBeDefined();
        expect(SUBSCRIPTION_PLANS[tier].priceNgn).toBeDefined();
        expect(SUBSCRIPTION_PLANS[tier].maxBusinesses).toBeDefined();
        expect(SUBSCRIPTION_PLANS[tier].maxTeamMembers).toBeDefined();
        expect(SUBSCRIPTION_PLANS[tier].maxMonthlyAiQueries).toBeDefined();
        expect(SUBSCRIPTION_PLANS[tier].features).toBeDefined();
      }
    });

    it('enforces exact requirements from freetrial.txt', () => {
      // 30-day free trial
      expect(SUBSCRIPTION_PLANS.free.priceNgn).toBe(0);
      expect(SUBSCRIPTION_PLANS.free.maxMonthlyAiQueries).toBe(30);
      expect(SUBSCRIPTION_PLANS.free.features.bnplCredits).toBe(true);

      // Starter plan: ₦5,000/mo, 2 businesses, 3 team members, 30 AI queries, no BNPL
      expect(SUBSCRIPTION_PLANS.starter.priceNgn).toBe(5000);
      expect(SUBSCRIPTION_PLANS.starter.maxBusinesses).toBe(2);
      expect(SUBSCRIPTION_PLANS.starter.maxTeamMembers).toBe(3);
      expect(SUBSCRIPTION_PLANS.starter.maxMonthlyAiQueries).toBe(30);
      expect(SUBSCRIPTION_PLANS.starter.features.bnplCredits).toBe(false);

      // Business plan: ₦12,000/quarter, 5 businesses, 10 team members, 30 AI queries, BNPL enabled
      expect(SUBSCRIPTION_PLANS.business.priceNgn).toBe(12000);
      expect(SUBSCRIPTION_PLANS.business.maxBusinesses).toBe(5);
      expect(SUBSCRIPTION_PLANS.business.maxTeamMembers).toBe(10);
      expect(SUBSCRIPTION_PLANS.business.maxMonthlyAiQueries).toBe(30);
      expect(SUBSCRIPTION_PLANS.business.features.bnplCredits).toBe(true);

      // Scale-Up plan: ₦45,000/yr, unlimited businesses (-1), unlimited team (-1), 30 AI queries
      expect(SUBSCRIPTION_PLANS.scale.priceNgn).toBe(45000);
      expect(SUBSCRIPTION_PLANS.scale.maxBusinesses).toBe(-1);
      expect(SUBSCRIPTION_PLANS.scale.maxTeamMembers).toBe(-1);
      expect(SUBSCRIPTION_PLANS.scale.maxMonthlyAiQueries).toBe(30);
      expect(SUBSCRIPTION_PLANS.scale.features.bnplCredits).toBe(true);
    });

    it('getPlanLimits helper provides safe defaults', () => {
      expect(getPlanLimits(null).tier).toBe('free');
      expect(getPlanLimits(undefined).tier).toBe('free');
      expect(getPlanLimits('unknown_plan').tier).toBe('free');
      expect(getPlanLimits('starter').tier).toBe('starter');
      expect(getPlanLimits('BUSINESS').tier).toBe('business');
      expect(getPlanLimits('scale').tier).toBe('scale');
    });

    it('isFeatureAllowed correctly evaluates feature flags', () => {
      // BNPL Credits
      expect(isFeatureAllowed('starter', 'bnplCredits')).toBe(false);
      expect(isFeatureAllowed('business', 'bnplCredits')).toBe(true);
      expect(isFeatureAllowed('scale', 'bnplCredits')).toBe(true);
      expect(isFeatureAllowed('free', 'bnplCredits')).toBe(true);

      // Core sales management allowed across all plans
      expect(isFeatureAllowed('starter', 'salesManagement')).toBe(true);
      expect(isFeatureAllowed('free', 'salesManagement')).toBe(true);
    });
  });

  describe('Central Config Values', () => {
    it('initializes subscription config with safe defaults', () => {
      expect(config.subscription).toBeDefined();
      expect(config.subscription.trialDays).toBe(30);
      expect(config.subscription.graceDays).toBe(2);
      expect(typeof config.subscription.enforcementEnabled).toBe('boolean');
    });
  });
});
