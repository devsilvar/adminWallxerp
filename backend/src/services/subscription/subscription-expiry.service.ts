/**
 * Subscription Expiry Service — WallXERP
 *
 * Scans for users whose free trial or paid subscription has passed the active period.
 *
 * Invariants:
 * 1. Expiry status is dynamically computed from `trialEndsAt` / `subscriptionExpiresAt`.
 * 2. Pure read requests never write expiry to DB.
 * 3. Never throws unhandled errors to the cron scheduler.
 * 4. Emails are dispatched asynchronously (fire-and-forget).
 *
 * @author WallX Engineering Team
 */

import prisma from '@/lib/prisma';
import logger from '@/lib/logger';
import {
  dispatchSubscriptionExpiredEmail,
  dispatchTrialEndingReminderEmail,
} from '@/services/email-dispatch.service';

export interface ExpiryCheckResult {
  expiredTrials: number;
  expiredSubs: number;
  remindedUsers: number;
}

/**
 * Checks expired trials and paid subscriptions, sending notification emails.
 */
export async function checkAndMarkExpiredSubscriptions(): Promise<ExpiryCheckResult> {
  const now = new Date();
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;
  const yesterday = new Date(now.getTime() - ONE_DAY_MS);

  // 1. Expired Trials (trial concluded within the last 24h sweep window)
  const expiredTrials = await prisma.user.findMany({
    where: {
      trialEndsAt: { gte: yesterday, lt: now },
      OR: [
        { subscriptionTier: 'free' },
        { subscriptionTier: null },
      ],
    },
    select: {
      id: true,
      email: true,
      fullName: true,
      subscriptionTier: true,
      trialEndsAt: true,
    },
  });

  // 2. Expired Paid Subscriptions (expired within the last 24h sweep window)
  const expiredSubs = await prisma.user.findMany({
    where: {
      subscriptionExpiresAt: { gte: yesterday, lt: now },
      subscriptionTier: { notIn: ['free'] },
    },
    select: {
      id: true,
      email: true,
      fullName: true,
      subscriptionTier: true,
      subscriptionExpiresAt: true,
    },
  });

  // Post-sweep email notifications (fire-and-forget)
  for (const user of expiredTrials) {
    logger.info('[subscription-expiry] Found recently expired trial', {
      userId: user.id,
      email: user.email,
    });
    void dispatchSubscriptionExpiredEmail(user, 'trial').catch((err) =>
      logger.warn('[subscription-expiry] Failed to send trial expired email', {
        userId: user.id,
        error: err.message,
      })
    );
  }

  for (const user of expiredSubs) {
    logger.info('[subscription-expiry] Found recently expired subscription', {
      userId: user.id,
      email: user.email,
    });
    void dispatchSubscriptionExpiredEmail(user, 'subscription').catch((err) =>
      logger.warn('[subscription-expiry] Failed to send subscription expired email', {
        userId: user.id,
        error: err.message,
      })
    );
  }

  // 3. Proactive Reminders for Trials ending in ~3 days (60-72h) or ~1 day (12-24h)
  let remindedUsers = 0;
  try {
    const in3DaysStart = new Date(now.getTime() + 60 * 60 * 60 * 1000);
    const in3DaysEnd = new Date(now.getTime() + 72 * 60 * 60 * 1000);

    const endingSoon3Days = await prisma.user.findMany({
      where: {
        trialEndsAt: { gte: in3DaysStart, lte: in3DaysEnd },
        OR: [{ subscriptionTier: 'free' }, { subscriptionTier: null }],
      },
      select: { id: true, email: true, fullName: true },
    });

    for (const u of endingSoon3Days) {
      void dispatchTrialEndingReminderEmail(u, 3).catch((err) =>
        logger.warn('[subscription-expiry] Failed to send 3-day reminder', { userId: u.id, err: err.message })
      );
      remindedUsers++;
    }

    const in1DayStart = new Date(now.getTime() + 12 * 60 * 60 * 1000);
    const in1DayEnd = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    const endingSoon1Day = await prisma.user.findMany({
      where: {
        trialEndsAt: { gte: in1DayStart, lte: in1DayEnd },
        OR: [{ subscriptionTier: 'free' }, { subscriptionTier: null }],
      },
      select: { id: true, email: true, fullName: true },
    });

    for (const u of endingSoon1Day) {
      void dispatchTrialEndingReminderEmail(u, 1).catch((err) =>
        logger.warn('[subscription-expiry] Failed to send 1-day reminder', { userId: u.id, err: err.message })
      );
      remindedUsers++;
    }
  } catch (err: any) {
    logger.warn('[subscription-expiry] Reminder sweep warning:', { error: err.message });
  }

  return {
    expiredTrials: expiredTrials.length,
    expiredSubs: expiredSubs.length,
    remindedUsers,
  };
}
