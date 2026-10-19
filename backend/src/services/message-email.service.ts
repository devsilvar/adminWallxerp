import prisma from '@/lib/prisma';
import logger from '@/lib/logger';
import config from '@/config';
import { sendEmail } from '@/lib/email';
import {
  generateBroadcastHtml,
  generateBroadcastText,
} from '@/lib/email/templates/broadcast';
import { eventBus } from '@/lib/realtime-emitter';

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const RESEND_BLOCKED_DOMAINS = new Set(['example.com', 'example.org', 'example.net', 'example.edu']);
function isBlockedTestDomain(email: string): boolean {
  const domain = email.split('@')[1]?.toLowerCase();
  return Boolean(domain && RESEND_BLOCKED_DOMAINS.has(domain));
}

function isRateLimitedError(msg: string): boolean {
  return /rate.?limit|too many requests|429/i.test(msg);
}

export interface DispatchBroadcastOptions {
  adminId?: string;
}

const inFlightDispatches = new Set<string>();

/**
 * Dispatches emails for a broadcast with senior-grade resilience.
 * - Guarded by inFlight Set to prevent concurrent double-dispatch
 * - Pre-skips Resend-blocked test domains (example.com) without API call
 * - Sends in small batches (10) with 400ms pacing to stay under Resend burst limits
 * - Retries rate-limited sends once after 1.2s
 * - Updates sentEmailCount / failedEmailCount incrementally per chunk in DB
 * - Emits live broadcast_email_progress event per chunk to admin
 * - Computes true deliveryStats via groupBy and updates status to 'sent' on completion
 * - Emits broadcast_email_completed event to admin
 * - Paginates through all pending messages (no 5000 cap)
 * - Never throws — all errors are handled and logged
 */
export async function dispatchBroadcastEmails(
  broadcastId: string,
  opts?: DispatchBroadcastOptions,
): Promise<void> {
  if (inFlightDispatches.has(broadcastId)) {
    logger.warn('Broadcast email dispatch already in flight', { broadcastId });
    return;
  }
  inFlightDispatches.add(broadcastId);

  try {
    logger.info('Starting broadcast email dispatch', { broadcastId });

    const broadcast = await prisma.broadcast.findUnique({
      where: { id: broadcastId },
      select: {
        id: true,
        title: true,
        body: true,
        createdById: true,
        totalRecipients: true,
        sentEmailCount: true,
        failedEmailCount: true,
      },
    });

    if (!broadcast) {
      logger.warn('Broadcast not found for email dispatch', { broadcastId });
      return;
    }

    const adminId = opts?.adminId ?? broadcast.createdById;
    const frontendUrl = config.cors.frontendUrl.split(',')[0]?.trim() || 'http://localhost:5173';
    const ctaUrl = `${frontendUrl}/messages`;

    // Fetch initial status counts for baseline accuracy
    const [initialStatusAgg, totalMsgCount] = await Promise.all([
      prisma.userMessage.groupBy({
        by: ['emailStatus'],
        where: { broadcastId },
        _count: true,
      }),
      prisma.userMessage.count({ where: { broadcastId } }),
    ]);

    const initialStatus: Record<string, number> = {};
    for (const s of initialStatusAgg) {
      initialStatus[s.emailStatus] = s._count;
    }

    let runningSent = initialStatus['sent'] ?? broadcast.sentEmailCount ?? 0;
    let runningFailed = initialStatus['failed'] ?? broadcast.failedEmailCount ?? 0;
    let runningSkipped = initialStatus['skipped'] ?? 0;
    let runningPending = initialStatus['pending'] ?? 0;
    const totalRecipients = totalMsgCount || broadcast.totalRecipients || 0;
    let totalProcessedInRun = 0;

    let hasMore = true;
    let cursor: string | undefined;

    while (hasMore) {
      const page = await prisma.userMessage.findMany({
        where: { broadcastId, emailStatus: 'pending' },
        take: 1000,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        orderBy: { id: 'asc' },
        include: { user: { select: { email: true } } },
      });

      if (page.length === 0) {
        if (totalProcessedInRun === 0) {
          logger.info('No pending user messages to email for broadcast', { broadcastId });
        }
        break;
      }

      const chunks = chunkArray(page, 10);

      for (let cIdx = 0; cIdx < chunks.length; cIdx++) {
        const currentChunk = chunks[cIdx];
        let chunkSent = 0;
        let chunkFailed = 0;
        let chunkSkipped = 0;

        await Promise.all(
          currentChunk.map(async (m) => {
            const recipientEmail = m.user?.email?.trim();
            if (!recipientEmail) {
              chunkSkipped++;
              await prisma.userMessage.update({
                where: { id: m.id },
                data: { emailStatus: 'skipped', emailError: 'User has no email address' },
              });
              return;
            }
            if (isBlockedTestDomain(recipientEmail)) {
              chunkSkipped++;
              await prisma.userMessage.update({
                where: { id: m.id },
                data: { emailStatus: 'skipped', emailError: 'Skipped: Resend test mode blocks example.* domains' },
              });
              return;
            }
            const attemptSend = async (retry = false): Promise<void> => {
              try {
                const result = await sendEmail({
                  to: recipientEmail,
                  subject: `[WallX] ${m.title}`,
                  html: generateBroadcastHtml({ title: m.title, body: m.body, ctaUrl }),
                  text: generateBroadcastText({ title: m.title, body: m.body, ctaUrl }),
                });
                if (result.delivered) {
                  chunkSent++;
                  await prisma.userMessage.update({ where: { id: m.id }, data: { emailStatus: 'sent' } });
                } else {
                  chunkSkipped++;
                  await prisma.userMessage.update({
                    where: { id: m.id },
                    data: { emailStatus: 'skipped', emailError: 'Provider returned delivered=false' },
                  });
                }
              } catch (err: unknown) {
                const errorMessage = err instanceof Error ? err.message : String(err);
                if (!retry && isRateLimitedError(errorMessage)) {
                  logger.warn('Broadcast email rate-limited, retrying once', {
                    messageId: m.id,
                    email: recipientEmail,
                  });
                  await sleep(1200);
                  return attemptSend(true);
                }
                chunkFailed++;
                logger.warn('Failed to send broadcast email to user', {
                  messageId: m.id,
                  userId: m.userId,
                  email: recipientEmail,
                  error: errorMessage,
                });
                await prisma.userMessage.update({
                  where: { id: m.id },
                  data: { emailStatus: 'failed', emailError: errorMessage.slice(0, 1000) },
                });
              }
            };
            await attemptSend();
          }),
        );

        runningSent += chunkSent;
        runningFailed += chunkFailed;
        runningSkipped += chunkSkipped;
        runningPending = Math.max(0, runningPending - (chunkSent + chunkFailed + chunkSkipped));
        totalProcessedInRun += currentChunk.length;

        // Incremental DB update per chunk
        if (chunkSent > 0 || chunkFailed > 0) {
          await prisma.broadcast.update({
            where: { id: broadcastId },
            data: {
              ...(chunkSent > 0 ? { sentEmailCount: { increment: chunkSent } } : {}),
              ...(chunkFailed > 0 ? { failedEmailCount: { increment: chunkFailed } } : {}),
            },
          });
        }

        // Live progress event emitted per chunk to admin
        if (adminId) {
          eventBus.emitToUserIds([adminId], {
            type: 'broadcast_email_progress',
            broadcastId,
            totalRecipients,
            sent: runningSent,
            failed: runningFailed,
            skipped: runningSkipped,
            pending: runningPending,
            totalProcessed: totalProcessedInRun,
            timestamp: new Date().toISOString(),
          });
        }

        if (cIdx < chunks.length - 1) {
          await sleep(400);
        }
      }

      cursor = page[page.length - 1].id;
      hasMore = page.length === 1000;
      if (hasMore) {
        await sleep(400);
      }
    }

    // Rollup via groupBy for authoritative deliveryStats
    const [finalStatusAgg, finalTotal] = await Promise.all([
      prisma.userMessage.groupBy({
        by: ['emailStatus'],
        where: { broadcastId },
        _count: true,
      }),
      prisma.userMessage.count({ where: { broadcastId } }),
    ]);

    const finalStatus: Record<string, number> = {};
    for (const r of finalStatusAgg) {
      finalStatus[r.emailStatus] = r._count;
    }

    const deliveryStats = {
      total: finalTotal,
      sent: finalStatus['sent'] ?? 0,
      failed: finalStatus['failed'] ?? 0,
      skipped: finalStatus['skipped'] ?? 0,
      pending: finalStatus['pending'] ?? 0,
    };

    // Flip broadcast status to 'sent' now that all emails are dispatched
    await prisma.broadcast.update({
      where: { id: broadcastId },
      data: {
        status: 'sent',
      },
    });

    if (adminId) {
      eventBus.emitToUserIds([adminId], {
        type: 'broadcast_email_completed',
        broadcastId,
        totalRecipients: deliveryStats.total,
        sent: deliveryStats.sent,
        failed: deliveryStats.failed,
        skipped: deliveryStats.skipped,
        pending: deliveryStats.pending,
        status: 'sent',
        deliveryStats,
        timestamp: new Date().toISOString(),
      });
    }

    logger.info('Broadcast email dispatch completed', {
      broadcastId,
      ...deliveryStats,
    });
  } catch (err: unknown) {
    logger.error('Unexpected error during broadcast email dispatch', {
      broadcastId,
      error: err instanceof Error ? err.message : String(err),
    });
  } finally {
    inFlightDispatches.delete(broadcastId);
  }
}
