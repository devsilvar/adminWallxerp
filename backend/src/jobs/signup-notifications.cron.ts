/**
 * New Sign-Up Notification Cron — WallX ERP
 *
 * Fans out an internal heads-up email (new user's email, full name, phone) to
 * `config.signupNotifications.recipients` shortly after a merchant registers.
 *
 * Why a cron and not an inline send in `register()`:
 *   - Registration must never wait on the email provider. Resend latency (or an
 *     outage) would otherwise slow — or fail — account creation.
 *   - In-process `setTimeout` would silently drop notifications on a restart,
 *     deploy, or crash. The pending marker (`users.signup_notified_at IS NULL`)
 *     lives in Postgres, so the sweep resumes after any restart.
 *
 * Timing: runs every minute; only picks up accounts created at least
 * `config.signupNotifications.delayMinutes` (default 5) ago. So the alert
 * lands ~5-6 minutes after signup.
 *
 * Concurrency: no advisory lock needed. Each user row is claimed atomically
 * with `updateMany({ where: { id, signupNotifiedAt: null } })` — only one
 * process can win the claim, so multi-instance deploys never double-send.
 *
 * Failure handling: if every recipient send throws (provider outage), the
 * claim is reverted to NULL so the next tick retries. A crash between claim and
 * send loses that alert — acceptable for an internal notification, and far
 * cheaper than a full outbox with delivery state.
 *
 * Gating: no-op unless `config.cron.enabled` (true in production, opt-in in dev
 * via ENABLE_CRON=true so `tsx watch` doesn't re-register on every save).
 *
 * @author WallX Engineering Team
 */

import cron from 'node-cron';
import prisma from '@/lib/prisma';
import logger from '@/lib/logger';
import config from '@/config';
import { dispatchNewSignupNotificationEmails } from '@/services/email-dispatch.service';
import { isTestAccountEmail } from '@/lib/test-accounts';
import { formatLagosDateTime } from '@/lib/format';

// Every minute. The fresh-user query is cheap and narrow (pending marker +
// createdAt window), so a tight cadence keeps the delay close to the configured
// 5 minutes instead of drifting to ~10.
const SCHEDULE = '* * * * *';
const TIMEZONE = 'Africa/Lagos';
const MAX_USERS_PER_SWEEP = 50;

export interface SignupNotificationSweepResult {
  candidates: number;
  processed: number;
  delivered: number;
  skipped: number;
  failed: number;
  retriedLater: number;
}

export function registerSignupNotificationsCron(): void {
  if (!config.cron.enabled) {
    logger.info(
      'Sign-up notification cron skipped (set ENABLE_CRON=true to enable in non-production)'
    );
    return;
  }

  cron.schedule(
    SCHEDULE,
    () => {
      void runSignupNotificationSweep().catch((err) => {
        logger.error('Unhandled failure in sign-up notification sweep', {
          error: err instanceof Error ? err.message : String(err),
          stack: err instanceof Error ? err.stack : undefined,
        });
      });
    },
    { timezone: TIMEZONE }
  );

  logger.info('Sign-up notification cron registered', {
    schedule: SCHEDULE,
    timezone: TIMEZONE,
    recipients: config.signupNotifications.recipients.length,
    delayMinutes: config.signupNotifications.delayMinutes,
  });
}

/**
 * Exported so a one-off `tsx` script or test can run the sweep directly.
 * `delayMinutes` overrides the configured delay (pass 0 to flush immediately).
 */
export async function runSignupNotificationSweep(opts?: {
  delayMinutes?: number;
}): Promise<SignupNotificationSweepResult> {
  const result: SignupNotificationSweepResult = {
    candidates: 0,
    processed: 0,
    delivered: 0,
    skipped: 0,
    failed: 0,
    retriedLater: 0,
  };

  const delayMinutes =
    opts?.delayMinutes ?? config.signupNotifications.delayMinutes;
  const cutoff = new Date(Date.now() - delayMinutes * 60 * 1000);

  const pending = await prisma.user.findMany({
    where: {
      signupNotifiedAt: null,
      role: 'user',
      createdAt: { lte: cutoff },
    },
    select: {
      id: true,
      email: true,
      fullName: true,
      phone: true,
      createdAt: true,
      acquisitionSource: true,
    },
    orderBy: { createdAt: 'asc' },
    take: MAX_USERS_PER_SWEEP,
  });

  result.candidates = pending.length;
  if (pending.length === 0) return result;

  logger.info('Sign-up notification sweep: start', {
    candidates: pending.length,
    delayMinutes,
  });

  for (const user of pending) {
    // Atomic claim: exactly one process wins this compare-and-set.
    const claim = await prisma.user.updateMany({
      where: { id: user.id, signupNotifiedAt: null },
      data: { signupNotifiedAt: new Date() },
    });
    if (claim.count === 0) continue;

    if (isTestAccountEmail(user.email)) continue;

    result.processed++;

    const delivery = await dispatchNewSignupNotificationEmails({
      userEmail: user.email,
      fullName: user.fullName,
      phone: user.phone,
      userId: user.id,
      signedUpAt: formatLagosDateTime(user.createdAt),
      acquisitionSource: user.acquisitionSource,
    });

    result.delivered += delivery.delivered;
    if (delivery.skipped) result.skipped++;

    if (!delivery.skipped && delivery.delivered === 0 && delivery.failed > 0) {
      // Every recipient threw — provider is likely down. Release the claim so
      // the next tick retries.
      result.failed++;
      result.retriedLater++;
      try {
        await prisma.user.update({
          where: { id: user.id },
          data: { signupNotifiedAt: null },
        });
      } catch (err) {
        logger.warn('Failed to release sign-up notification claim for retry', {
          userId: user.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  logger.info('Sign-up notification sweep: done', {
    candidates: result.candidates,
    processed: result.processed,
    delivered: result.delivered,
    skipped: result.skipped,
    retriedLater: result.retriedLater,
  });

  return result;
}
