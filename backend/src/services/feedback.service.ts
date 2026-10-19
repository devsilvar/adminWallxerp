/**
 * User Feedback & In-App Review Service — WallXERP
 * Handles sentiment capture, star ratings, tags, and administrative analytics.
 */

import { prisma } from '@/lib/prisma';
import logger from '@/lib/logger';
import { CreateFeedbackInput } from '@/validators/feedback.validator';

export async function submitFeedback(
  input: CreateFeedbackInput,
  userId?: string,
  businessId?: string,
) {
  let resolvedName = input.userName || null;
  let resolvedEmail = input.userEmail || null;

  if (userId) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { fullName: true, email: true },
    });
    if (user) {
      resolvedName = resolvedName || user.fullName || user.email.split('@')[0];
      resolvedEmail = resolvedEmail || user.email;
    }
  }

  // Derive sentiment if not explicitly provided
  let sentiment = input.sentiment;
  if (!sentiment) {
    if (input.rating >= 4) sentiment = 'positive';
    else if (input.rating === 3) sentiment = 'neutral';
    else sentiment = 'negative';
  }

  logger.info('Recording user review / feedback', {
    userId,
    rating: input.rating,
    sentiment,
    tagsCount: input.tags?.length || 0,
  });

  const feedback = await prisma.userFeedback.create({
    data: {
      userId: userId || null,
      businessId: businessId || null,
      userName: resolvedName,
      userEmail: resolvedEmail,
      rating: input.rating,
      sentiment,
      tags: input.tags || [],
      comment: input.comment || null,
    },
  });

  return feedback;
}

export interface ListFeedbacksFilter {
  page?: number;
  limit?: number;
  rating?: number;
  sentiment?: string;
  search?: string;
}

export async function listFeedbacksForAdmin(filter: ListFeedbacksFilter = {}) {
  const page = Math.max(1, Number(filter.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(filter.limit) || 20));
  const skip = (page - 1) * limit;

  const where: any = {};
  if (filter.rating) {
    where.rating = Number(filter.rating);
  }
  if (filter.sentiment) {
    where.sentiment = filter.sentiment;
  }
  if (filter.search) {
    const s = filter.search.trim();
    where.OR = [
      { userName: { contains: s, mode: 'insensitive' } },
      { userEmail: { contains: s, mode: 'insensitive' } },
      { comment: { contains: s, mode: 'insensitive' } },
    ];
  }

  const [total, feedbacks, allFeedbacks] = await Promise.all([
    prisma.userFeedback.count({ where }),
    prisma.userFeedback.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      include: {
        user: {
          select: {
            id: true,
            email: true,
            fullName: true,
            subscriptionTier: true,
          },
        },
        business: {
          select: {
            id: true,
            businessName: true,
          },
        },
      },
    }),
    prisma.userFeedback.findMany({
      select: {
        rating: true,
        sentiment: true,
        tags: true,
      },
    }),
  ]);

  // Aggregate distribution
  const totalCount = allFeedbacks.length;
  const ratingDistribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  const tagCounts: Record<string, number> = {};
  let totalRatingSum = 0;

  for (const item of allFeedbacks) {
    totalRatingSum += item.rating;
    ratingDistribution[item.rating] = (ratingDistribution[item.rating] || 0) + 1;
    if (Array.isArray(item.tags)) {
      for (const tag of item.tags) {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      }
    }
  }

  const averageRating = totalCount > 0 ? Number((totalRatingSum / totalCount).toFixed(2)) : 5.0;

  return {
    data: feedbacks,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
    analytics: {
      totalCount,
      averageRating,
      ratingDistribution,
      topTags: Object.entries(tagCounts)
        .map(([tag, count]) => ({ tag, count }))
        .sort((a, b) => b.count - a.count),
    },
  };
}

export interface PromptEligibilityResult {
  eligible: boolean;
  delaySeconds: number;
  reason?: string;
  targetDay?: string;
  currentDay?: string;
}

export async function checkPromptEligibility(
  userId?: string,
  options?: { force?: boolean; targetDay?: string }
): Promise<PromptEligibilityResult> {
  if (!userId) {
    return {
      eligible: false,
      delaySeconds: 0,
      reason: 'UNAUTHENTICATED',
    };
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, createdAt: true },
  });

  if (!user) {
    return {
      eligible: false,
      delaySeconds: 0,
      reason: 'USER_NOT_FOUND',
    };
  }

  // 1. Established returning account check: Must be at least 3 days old
  const accountAgeMs = Date.now() - user.createdAt.getTime();
  const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;
  if (accountAgeMs < THREE_DAYS_MS) {
    return {
      eligible: false,
      delaySeconds: 0,
      reason: 'NEW_ACCOUNT',
    };
  }

  // 2. Feedback cool-off check: No feedback in the last 30 days
  const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
  const thirtyDaysAgo = new Date(Date.now() - THIRTY_DAYS_MS);
  const recentFeedback = await prisma.userFeedback.findFirst({
    where: {
      userId,
      createdAt: { gte: thirtyDaysAgo },
    },
    select: { id: true, createdAt: true },
  });

  if (recentFeedback) {
    return {
      eligible: false,
      delaySeconds: 0,
      reason: 'ALREADY_REVIEWED_RECENTLY',
    };
  }

  // 3. Campaign day check: Check current day in Africa/Lagos (UTC+1)
  const lagosDay = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Africa/Lagos',
    weekday: 'long',
  })
    .format(new Date())
    .toLowerCase();

  const targetDay = (options?.targetDay || 'saturday').toLowerCase();

  const isTargetDay =
    options?.force === true ||
    targetDay === 'any' ||
    targetDay === 'all' ||
    lagosDay === targetDay;

  if (!isTargetDay) {
    return {
      eligible: false,
      delaySeconds: 0,
      reason: 'NOT_CAMPAIGN_DAY',
      targetDay,
      currentDay: lagosDay,
    };
  }

  return {
    eligible: true,
    delaySeconds: 150, // 2.5 minutes session delay for returning users
    targetDay,
    currentDay: lagosDay,
  };
}

