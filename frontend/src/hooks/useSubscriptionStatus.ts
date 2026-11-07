/**
 * useSubscriptionStatus Hook — WallXERP
 *
 * Provides real-time subscription lifecycle state for the authenticated user,
 * including trial progress, 2-day read-only grace period, and feature access.
 *
 * @author WallX Engineering Team
 */

import { useMemo, useEffect, useState, useRef } from 'react';
import { useAuthStore } from '@/stores/auth.store';

export type SubscriptionTier = 'free' | 'starter' | 'business' | 'scale';

export interface SubscriptionStatus {
  tier: SubscriptionTier;
  planName: string;
  isPaid: boolean;
  isTrial: boolean;
  hasAccess: boolean;
  isReadOnlyGrace: boolean;
  isExpired: boolean;
  canWrite: boolean;
  expiresAt: Date | null;
  daysRemaining: number;
  graceHoursRemaining: number;
  formattedCountdown: string;
  isInherited: boolean;
  ownerName: string | null;
  ownerEmail: string | null;
}

const TIER_DISPLAY_NAMES: Record<SubscriptionTier, string> = {
  free: 'Free Trial',
  starter: 'Starter',
  business: 'Business',
  scale: 'Scale-Up',
};

/**
 * Legacy tier spellings that must resolve to a catalog key. `scale_up` was
 * written by an earlier admin override path; treating it as unknown would
 * render the subscriber as a free trial.
 */
const TIER_ALIASES: Record<string, SubscriptionTier> = {
  scale_up: 'scale',
  scaleup: 'scale',
  free_trial: 'free',
  trial: 'free',
};

function canonicalTier(raw: string | null | undefined): SubscriptionTier {
  const normalized = (raw || 'free').toLowerCase().trim();
  return TIER_ALIASES[normalized] ?? (normalized as SubscriptionTier);
}

import { TRIAL_DAYS, GRACE_DAYS } from '@/config/subscription';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MS_PER_HOUR = 60 * 60 * 1000;

export function useSubscriptionStatus(): SubscriptionStatus {
  const user = useAuthStore((s) => s.user);
  const [, setTick] = useState(0);
  const lastFetchRef = useRef(0);

  useEffect(() => {
    if (user) void useAuthStore.getState().fetchMe();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!user) return;
    const maybeFetch = () => {
      if (document.visibilityState === 'hidden') return;
      const now = Date.now();
      if (now - lastFetchRef.current < 30_000) return;
      lastFetchRef.current = now;
      void useAuthStore.getState().fetchMe();
    };
    window.addEventListener('focus', maybeFetch);
    document.addEventListener('visibilitychange', maybeFetch);
    return () => {
      window.removeEventListener('focus', maybeFetch);
      document.removeEventListener('visibilitychange', maybeFetch);
    };
  }, [user]);

  return useMemo(() => {
    if (!user) {
      return {
        tier: 'free',
        planName: 'Free Trial',
        isPaid: false,
        isTrial: true,
        hasAccess: true,
        isReadOnlyGrace: false,
        isExpired: false,
        canWrite: true,
        expiresAt: null,
        daysRemaining: 30,
        graceHoursRemaining: 0,
        formattedCountdown: '30 Days Left',
        isInherited: false,
        ownerName: null,
        ownerEmail: null,
      };
    }

    // Admin users bypass all subscription checks - unlimited access
    if (user.role === 'admin') {
      return {
        tier: 'free' as SubscriptionTier, // Use 'free' as the tier type
        planName: 'System Administrator',
        isPaid: true,
        isTrial: false,
        hasAccess: true,
        isReadOnlyGrace: false,
        isExpired: false,
        canWrite: true,
        expiresAt: null,
        daysRemaining: 999,
        graceHoursRemaining: 0,
        formattedCountdown: 'Active',
        isInherited: false,
        ownerName: null,
        ownerEmail: null,
      };
    }

    const isInherited = Boolean(user.isSubscriptionInherited);
    const ownerName = user.subscriptionOwner?.name || null;
    const ownerEmail = user.subscriptionOwner?.email || null;

    const tier = canonicalTier(user.subscriptionTier);

    const isPaid = tier !== 'free';
    const planName = TIER_DISPLAY_NAMES[tier] || 'Free Trial';
    const now = new Date();
    const graceMs = GRACE_DAYS * MS_PER_DAY;

    // 1. Paid Tiers
    if (isPaid) {
      if (!user.subscriptionExpiresAt) {
        // Grandfathered / indefinite paid plan
        return {
          tier,
          planName,
          isPaid: true,
          isTrial: false,
          hasAccess: true,
          isReadOnlyGrace: false,
          isExpired: false,
          canWrite: true,
          expiresAt: null,
          daysRemaining: 999,
          graceHoursRemaining: 0,
          formattedCountdown: 'Active',
          isInherited,
          ownerName,
          ownerEmail,
        };
      }

      const expiresAt = new Date(user.subscriptionExpiresAt);
      const remainingMs = expiresAt.getTime() - now.getTime();

      if (remainingMs > 0) {
        const days = Math.ceil(remainingMs / MS_PER_DAY);
        return {
          tier,
          planName,
          isPaid: true,
          isTrial: false,
          hasAccess: true,
          isReadOnlyGrace: false,
          isExpired: false,
          canWrite: true,
          expiresAt,
          daysRemaining: days,
          graceHoursRemaining: 0,
          formattedCountdown: days === 1 ? '1 day left' : `${days} days left`,
          isInherited,
          ownerName,
          ownerEmail,
        };
      }

      // Past paid expiry — check grace window
      const graceRemainingMs = expiresAt.getTime() + graceMs - now.getTime();
      if (graceRemainingMs > 0) {
        const hours = Math.ceil(graceRemainingMs / MS_PER_HOUR);
        return {
          tier,
          planName,
          isPaid: true,
          isTrial: false,
          hasAccess: true,
          isReadOnlyGrace: true,
          isExpired: true,
          canWrite: false,
          expiresAt,
          daysRemaining: 0,
          graceHoursRemaining: hours,
          formattedCountdown: `Grace period (${hours}h left)`,
          isInherited,
          ownerName,
          ownerEmail,
        };
      }

      // Fully expired paid plan
      return {
        tier,
        planName,
        isPaid: true,
        isTrial: false,
        hasAccess: false,
        isReadOnlyGrace: false,
        isExpired: true,
        canWrite: false,
        expiresAt,
        daysRemaining: 0,
        graceHoursRemaining: 0,
        formattedCountdown: 'Expired',
        isInherited,
        ownerName,
        ownerEmail,
      };
    }

    // 2. Free Trial Tier — inherited staff must mirror the Owner's clock.
    // Using the staff's own `createdAt + 30` would resurrect a fresh 30-day
    // trial and hide the Owner's remaining 22 days (reported bug). For
    // isInherited we derive from subscriptionCreatedAt (Owner's createdAt)
    // and mirror the backend's max(stored, derived) bump logic.
    let trialEndsAt: Date;
    if (isInherited) {
      const ownerCreatedRaw = (user as any).subscriptionCreatedAt as string | undefined;
      if (user.trialEndsAt) {
        const stored = new Date(user.trialEndsAt);
        if (ownerCreatedRaw) {
          const derived = new Date(new Date(ownerCreatedRaw).getTime() + TRIAL_DAYS * MS_PER_DAY);
          trialEndsAt = stored.getTime() > derived.getTime() ? stored : derived;
        } else {
          trialEndsAt = stored;
        }
      } else if (ownerCreatedRaw) {
        trialEndsAt = new Date(new Date(ownerCreatedRaw).getTime() + TRIAL_DAYS * MS_PER_DAY);
      } else {
        // Defensive: server should have sent subscriptionCreatedAt for inherited
        // users — fall back to stored trialEndsAt rather than staff createdAt.
        trialEndsAt = new Date(user.trialEndsAt as string);
      }
    } else if (user.trialEndsAt) {
      const stored = new Date(user.trialEndsAt);
      const derived = new Date(new Date(user.createdAt || now).getTime() + TRIAL_DAYS * MS_PER_DAY);
      trialEndsAt = stored.getTime() > derived.getTime() ? stored : derived;
    } else {
      const created = new Date(user.createdAt || now);
      trialEndsAt = new Date(created.getTime() + TRIAL_DAYS * MS_PER_DAY);
    }

    const trialRemainingMs = trialEndsAt.getTime() - now.getTime();

    if (trialRemainingMs > 0) {
      const days = Math.ceil(trialRemainingMs / MS_PER_DAY);
      return {
        tier: 'free',
        planName: 'Free Trial',
        isPaid: false,
        isTrial: true,
        hasAccess: true,
        isReadOnlyGrace: false,
        isExpired: false,
        canWrite: true,
        expiresAt: trialEndsAt,
        daysRemaining: days,
        graceHoursRemaining: 0,
        formattedCountdown: days === 1 ? '1 day left' : `${days} days left`,
        isInherited,
        ownerName,
        ownerEmail,
      };
    }

    // Past trial — check 2-day read-only grace period
    const graceRemainingMs = trialEndsAt.getTime() + graceMs - now.getTime();
    if (graceRemainingMs > 0) {
      const hours = Math.ceil(graceRemainingMs / MS_PER_HOUR);
      return {
        tier: 'free',
        planName: 'Free Trial',
        isPaid: false,
        isTrial: true,
        hasAccess: true,
        isReadOnlyGrace: true,
        isExpired: true,
        canWrite: false,
        expiresAt: trialEndsAt,
        daysRemaining: 0,
        graceHoursRemaining: hours,
        formattedCountdown: `Grace period (${hours}h left)`,
        isInherited,
        ownerName,
        ownerEmail,
      };
    }

    // Completely expired
    return {
      tier: 'free',
      planName: 'Free Trial',
      isPaid: false,
      isTrial: true,
      hasAccess: false,
      isReadOnlyGrace: false,
      isExpired: true,
      canWrite: false,
      expiresAt: trialEndsAt,
      daysRemaining: 0,
      graceHoursRemaining: 0,
      formattedCountdown: 'Expired',
      isInherited,
      ownerName,
      ownerEmail,
    };
  }, [user]);
}
