import { Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '@/middleware/errorHandler';
import { AuthenticatedRequest } from '@/types';
import {
  createBroadcastSchema,
  listBroadcastsSchema,
  listMessagesSchema,
  markReadSchema,
} from '@/validators/message.validator';
import * as messageService from '@/services/message.service';
import * as userMessageService from '@/services/user-message.service';

/**
 * Admin: Create and fan-out a new broadcast or direct message.
 */
export const createBroadcast = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const input = createBroadcastSchema.parse(req.body);
    const broadcast = await messageService.createBroadcast(input, req.user!.userId);
    res.status(201).json({
      success: true,
      data: broadcast,
    });
  },
);

/**
 * Admin: List broadcasts with pagination, search, and stats.
 */
export const listBroadcasts = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const query = listBroadcastsSchema.parse(req.query);
    const result = await messageService.listBroadcasts(query);
    res.status(200).json({
      success: true,
      ...result,
    });
  },
);

/**
 * Admin: Retrieve a single broadcast with paginated delivery logs.
 * Query ?page&limit paginates `messages` (not broadcasts). Defaults 1/50.
 */
export const getBroadcast = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const id = z.string().uuid('Broadcast ID must be a valid UUID').parse(req.params.id);
    const page = Math.max(1, parseInt((req.query.page as string) || '1', 10) || 1);
    const limitRaw = parseInt((req.query.limit as string) || '50', 10) || 50;
    const limit = Math.min(100, Math.max(1, limitRaw));
    const broadcast = await messageService.getBroadcast(id, page, limit);
    res.status(200).json({
      success: true,
      data: broadcast,
    });
  },
);

/**
 * Admin: List paginated recipient deliveries for a broadcast.
 * Dedicated endpoint so the modal can page without refetching broadcast metadata.
 */
export const listBroadcastMessages = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const id = z.string().uuid('Broadcast ID must be a valid UUID').parse(req.params.id);
    const page = Math.max(1, parseInt((req.query.page as string) || '1', 10) || 1);
    const limitRaw = parseInt((req.query.limit as string) || '50', 10) || 50;
    const limit = Math.min(100, Math.max(1, limitRaw));
    const result = await messageService.listBroadcastMessages(id, page, limit);
    res.status(200).json({
      success: true,
      data: result,
    });
  },
);

/**
 * Admin: Retry dispatching emails for pending recipients of a broadcast.
 * Returns 202 if retry queued, 200 if no pending messages remain.
 */
export const retryBroadcastEmails = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const id = z.string().uuid('Broadcast ID must be a valid UUID').parse(req.params.id);
    const result = await messageService.retryBroadcast(id, req.user!.userId);
    if (!result.retrying) {
      res.status(200).json({
        success: true,
        message: result.message,
        data: { pendingCount: 0 },
      });
      return;
    }
    res.status(202).json({
      success: true,
      message: result.message,
      data: { pendingCount: result.pendingCount },
    });
  },
);


/**
 * User: List inbox messages with pagination, read filter, and search.
 */
export const listMessages = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const query = listMessagesSchema.parse(req.query);
    const result = await userMessageService.listMessages(req.user!.userId, query);
    res.status(200).json({
      success: true,
      ...result,
    });
  },
);

/**
 * User: Get unread inbox messages count.
 */
export const unreadCount = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const result = await userMessageService.getUnreadCount(req.user!.userId);
    res.status(200).json({
      success: true,
      ...result,
    });
  },
);

/**
 * User: Mark a single inbox message as read.
 */
export const markRead = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const { id } = markReadSchema.parse({ id: req.params.id });
    const message = await userMessageService.markRead(req.user!.userId, id);
    res.status(200).json({
      success: true,
      data: message,
    });
  },
);

/**
 * User: Mark all unread inbox messages as read.
 */
export const markAllRead = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const result = await userMessageService.markAllRead(req.user!.userId);
    res.status(200).json({
      success: true,
      ...result,
    });
  },
);

/**
 * User: Get a single inbox message.
 */
export const getMessage = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const { id } = markReadSchema.parse({ id: req.params.id });
    const message = await userMessageService.getMessage(req.user!.userId, id);
    res.status(200).json({
      success: true,
      data: message,
    });
  },
);
