import { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { AppError } from '@/middleware/errorHandler';
import { ListMessagesQuery } from '@/validators/message.validator';

/**
 * Lists inbox messages for an authenticated user with pagination, read filter, and search.
 */
export async function listMessages(userId: string, query: ListMessagesQuery) {
  const { page, limit, unread, search } = query;
  const skip = (page - 1) * limit;

  const where: Prisma.UserMessageWhereInput = {
    userId,
  };

  if (unread === true) {
    where.isRead = false;
  }

  if (search && search.trim()) {
    const s = search.trim();
    where.OR = [
      { title: { contains: s, mode: 'insensitive' } },
      { body: { contains: s, mode: 'insensitive' } },
    ];
  }

  const [total, messages] = await Promise.all([
    prisma.userMessage.count({ where }),
    prisma.userMessage.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        broadcastId: true,
        title: true,
        body: true,
        isRead: true,
        readAt: true,
        createdAt: true,
      },
    }),
  ]);

  return {
    data: messages,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
  };
}

/**
 * Returns the unread messages count for a user.
 */
export async function getUnreadCount(userId: string): Promise<{ count: number }> {
  const count = await prisma.userMessage.count({
    where: {
      userId,
      isRead: false,
    },
  });

  return { count };
}

/**
 * Marks a single message as read.
 * Throws 404 if the message does not exist or does not belong to the user.
 */
export async function markRead(userId: string, messageId: string) {
  const message = await prisma.userMessage.findUnique({
    where: { id: messageId },
    select: { id: true, userId: true, isRead: true },
  });

  if (!message || message.userId !== userId) {
    throw new AppError(404, 'Message not found', 'MESSAGE_NOT_FOUND');
  }

  if (message.isRead) {
    return message;
  }

  return prisma.userMessage.update({
    where: { id: messageId },
    data: {
      isRead: true,
      readAt: new Date(),
    },
  });
}

/**
 * Marks all unread messages as read for a user.
 */
export async function markAllRead(userId: string) {
  const result = await prisma.userMessage.updateMany({
    where: {
      userId,
      isRead: false,
    },
    data: {
      isRead: true,
      readAt: new Date(),
    },
  });

  return { count: result.count };
}

/**
 * Retrieves a single message for a user.
 * Throws 404 if not found or unauthorized.
 */
export async function getMessage(userId: string, messageId: string) {
  const message = await prisma.userMessage.findUnique({
    where: { id: messageId },
  });

  if (!message || message.userId !== userId) {
    throw new AppError(404, 'Message not found', 'MESSAGE_NOT_FOUND');
  }

  return message;
}
