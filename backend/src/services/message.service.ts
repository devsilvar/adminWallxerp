import { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import logger from '@/lib/logger';
import { AppError } from '@/middleware/errorHandler';
import { logAudit } from '@/lib/audit';
import { CreateBroadcastInput, ListBroadcastsQuery } from '@/validators/message.validator';
import { dispatchBroadcastEmails } from '@/services/message-email.service';

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

/**
 * Creates a broadcast and fans out user messages.
 * Asynchronously queues email delivery after the database transaction commits.
 */
export async function createBroadcast(input: CreateBroadcastInput, adminId: string) {
  let recipients: { id: string; email: string }[] = [];

  if (input.audience.type === 'user') {
    const targetUser = await prisma.user.findUnique({
      where: { id: input.audience.userId },
      select: { id: true, email: true, isActive: true },
    });

    if (!targetUser || !targetUser.isActive) {
      throw new AppError(404, 'User not found or inactive', 'USER_NOT_FOUND');
    }
    recipients = [{ id: targetUser.id, email: targetUser.email }];
  } else {
    recipients = await prisma.user.findMany({
      where: { isActive: true, role: 'user' },
      select: { id: true, email: true },
    });
  }

  const audienceUserId = input.audience.type === 'user' ? input.audience.userId : null;

  let broadcast: any;

  if (recipients.length <= 2000) {
    // Single interactive transaction flow
    broadcast = await prisma.$transaction(async (tx) => {
      const created = await tx.broadcast.create({
        data: {
          title: input.title,
          body: input.body,
          audienceType: input.audience.type,
          audienceUserId,
          createdById: adminId,
          status: 'sending',
          totalRecipients: recipients.length,
        },
      });

      const batches = chunkArray(recipients, 500);
      for (const batch of batches) {
        await tx.userMessage.createMany({
          data: batch.map((r) => ({
            userId: r.id,
            broadcastId: created.id,
            title: input.title,
            body: input.body,
            isRead: false,
            emailStatus: 'pending',
          })),
        });
      }

      await logAudit(
        {
          userId: adminId,
          action: 'admin.broadcast_created',
          resourceType: 'broadcast',
          resourceId: created.id,
          newData: {
            title: input.title,
            audienceType: input.audience.type,
            audienceUserId,
            totalRecipients: recipients.length,
          },
        },
        tx,
      );

      return created;
    });
  } else {
    // Large recipient flow (>2000): avoid single massive transaction (PG param limit + lock time)
    // Create broadcast as 'sending', fan-out in 500-row batches.
    // status flips to 'sent' in dispatchBroadcastEmails once all emails are processed.
    broadcast = await prisma.broadcast.create({
      data: {
        title: input.title.trim(),
        body: input.body.trim(),
        audienceType: input.audience.type,
        audienceUserId,
        createdById: adminId,
        status: 'sending',
        totalRecipients: recipients.length,
      },
    });

    try {
      const batches = chunkArray(recipients, 500);
      for (const batch of batches) {
        await prisma.userMessage.createMany({
          data: batch.map((r) => ({
            userId: r.id,
            broadcastId: broadcast.id,
            title: input.title.trim(),
            body: input.body.trim(),
            isRead: false,
            emailStatus: 'pending',
          })),
        });
      }
    } catch (err) {
      logger.error('Large broadcast fan-out partially failed', {
        broadcastId: broadcast.id,
        totalRecipients: recipients.length,
        error: err instanceof Error ? err.message : String(err),
      });
      // Keep as 'sending' so admin can see it's incomplete; don't delete — partial inbox is better than data loss
      throw err;
    }

    await logAudit({
      userId: adminId,
      action: 'admin.broadcast_created',
      resourceType: 'broadcast',
      resourceId: broadcast.id,
      newData: {
        title: input.title,
        audienceType: input.audience.type,
        audienceUserId,
        totalRecipients: recipients.length,
      },
    });
  }

  // Asynchronous email dispatch — NEVER inside the database transaction
  void dispatchBroadcastEmails(broadcast.id, { adminId }).catch((err: unknown) => {
    logger.warn('Failed to dispatch broadcast emails', {
      broadcastId: broadcast.id,
      error: err instanceof Error ? err.message : String(err),
    });
  });

  return broadcast;
}

/**
 * Lists broadcasts with pagination, search, and KPI aggregates.
 */
export async function listBroadcasts(query: ListBroadcastsQuery) {
  const { page, limit, search } = query;
  const skip = (page - 1) * limit;

  const where: Prisma.BroadcastWhereInput = {};
  if (search && search.trim()) {
    const s = search.trim();
    where.OR = [
      { title: { contains: s, mode: 'insensitive' } },
      { body: { contains: s, mode: 'insensitive' } },
    ];
  }

  const [total, broadcasts, statsAgg] = await Promise.all([
    prisma.broadcast.count({ where }),
    prisma.broadcast.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        createdBy: {
          select: { id: true, email: true },
        },
      },
    }),
    prisma.broadcast.aggregate({
      _sum: {
        totalRecipients: true,
        sentEmailCount: true,
        failedEmailCount: true,
      },
      _count: {
        id: true,
      },
    }),
  ]);

  const stats = {
    totalBroadcasts: statsAgg._count.id,
    totalRecipients: statsAgg._sum.totalRecipients || 0,
    sentEmailCount: statsAgg._sum.sentEmailCount || 0,
    failedEmailCount: statsAgg._sum.failedEmailCount || 0,
  };

  return {
    data: broadcasts,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
    stats,
  };
}

/**
 * Retrieves a broadcast by ID with creator details, paginated recipients, and delivery aggregates.
 * `messages` is now paginated (not a fixed 20 sample) so the modal shows all recipients.
 */
export async function getBroadcast(id: string, messagesPage = 1, messagesLimit = 50) {
  const broadcast = await prisma.broadcast.findUnique({
    where: { id },
    include: {
      createdBy: {
        select: { id: true, email: true },
      },
    },
  });

  if (!broadcast) {
    throw new AppError(404, 'Broadcast not found', 'BROADCAST_NOT_FOUND');
  }

  const skip = (messagesPage - 1) * messagesLimit;
  const [messages, totalMessages, emailStatusAgg, readAgg] = await Promise.all([
    prisma.userMessage.findMany({
      where: { broadcastId: id },
      skip,
      take: messagesLimit,
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: { id: true, email: true },
        },
      },
    }),
    prisma.userMessage.count({ where: { broadcastId: id } }),
    prisma.userMessage.groupBy({
      by: ['emailStatus'],
      where: { broadcastId: id },
      _count: true,
    }),
    prisma.userMessage.groupBy({
      by: ['isRead'],
      where: { broadcastId: id },
      _count: true,
    }),
  ]);

  const byStatus: Record<string, number> = {};
  for (const r of emailStatusAgg) byStatus[r.emailStatus] = r._count;
  const readCount = readAgg.find((r) => r.isRead === true)?._count ?? 0;
  const unreadCount = readAgg.find((r) => r.isRead === false)?._count ?? 0;

  return {
    ...broadcast,
    messages,
    messagesPagination: {
      page: messagesPage,
      limit: messagesLimit,
      total: totalMessages,
      totalPages: Math.ceil(totalMessages / messagesLimit) || 1,
      hasNext: skip + messages.length < totalMessages,
      hasPrev: messagesPage > 1,
    },
    deliveryStats: {
      total: totalMessages,
      sent: byStatus['sent'] ?? 0,
      failed: byStatus['failed'] ?? 0,
      skipped: byStatus['skipped'] ?? 0,
      pending: byStatus['pending'] ?? 0,
      read: readCount,
      unread: unreadCount,
    },
  };
}

export async function listBroadcastMessages(broadcastId: string, page = 1, limit = 50) {
  const exists = await prisma.broadcast.findUnique({ where: { id: broadcastId }, select: { id: true } });
  if (!exists) throw new AppError(404, 'Broadcast not found', 'BROADCAST_NOT_FOUND');
  return getBroadcast(broadcastId, page, limit);
}

/**
 * Admin: Retries email dispatch for pending recipients of a broadcast.
 * Idempotent: returns 200 if no recipients remain pending.
 */
export async function retryBroadcast(id: string, adminId: string) {
  const broadcast = await prisma.broadcast.findUnique({
    where: { id },
    select: { id: true, status: true },
  });

  if (!broadcast) {
    throw new AppError(404, 'Broadcast not found', 'BROADCAST_NOT_FOUND');
  }

  const pendingCount = await prisma.userMessage.count({
    where: { broadcastId: id, emailStatus: 'pending' },
  });

  if (pendingCount === 0) {
    return {
      retrying: false,
      pendingCount: 0,
      message: 'No pending recipients to retry',
    };
  }

  await prisma.broadcast.update({
    where: { id },
    data: { status: 'sending' },
  });

  void dispatchBroadcastEmails(id, { adminId }).catch((err: unknown) => {
    logger.warn('Failed to retry dispatching broadcast emails', {
      broadcastId: id,
      error: err instanceof Error ? err.message : String(err),
    });
  });

  return {
    retrying: true,
    pendingCount,
    message: `Retry queued for ${pendingCount} pending recipient(s)`,
  };
}

