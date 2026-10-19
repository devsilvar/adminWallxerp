import { describe, test, expect, jest, beforeEach } from '@jest/globals';

const mockSendEmail = jest.fn();
jest.mock('../../src/lib/email', () => ({
  sendEmail: mockSendEmail,
}));

const mockEmitToUserIds = jest.fn();
jest.mock('../../src/lib/realtime-emitter', () => ({
  eventBus: {
    emitToUserIds: mockEmitToUserIds,
  },
}));

const mockBroadcastFindUnique = jest.fn();
const mockBroadcastUpdate = jest.fn();
const mockUserMessageFindMany = jest.fn();
const mockUserMessageUpdate = jest.fn();
const mockUserMessageGroupBy = jest.fn();
const mockUserMessageCount = jest.fn();

jest.mock('../../src/lib/prisma', () => ({
  __esModule: true,
  default: {
    broadcast: {
      findUnique: mockBroadcastFindUnique,
      update: mockBroadcastUpdate,
    },
    userMessage: {
      findMany: mockUserMessageFindMany,
      update: mockUserMessageUpdate,
      groupBy: mockUserMessageGroupBy,
      count: mockUserMessageCount,
    },
  },
}));

import { dispatchBroadcastEmails } from '../../src/services/message-email.service';
import { retryBroadcast } from '../../src/services/message.service';

describe('dispatchBroadcastEmails Unit Tests (Step 1)', () => {
  const broadcastId = 'bc-test-123';
  const adminId = 'admin-user-1';

  beforeEach(() => {
    jest.resetAllMocks();
  });

  test('15 pending messages: emits progress after chunk 1 (10) and completion after finish', async () => {
    const mockMessages = Array.from({ length: 15 }, (_, i) => ({
      id: `msg-${i + 1}`,
      broadcastId,
      userId: `usr-${i + 1}`,
      title: 'Update Notice',
      body: 'Important tax update',
      emailStatus: 'pending',
      user: { email: `user${i + 1}@business.ng` },
    }));

    (mockBroadcastFindUnique as any).mockResolvedValue({
      id: broadcastId,
      title: 'Update Notice',
      body: 'Important tax update',
      createdById: adminId,
      totalRecipients: 15,
      sentEmailCount: 0,
      failedEmailCount: 0,
    });

    // Initial group by: 15 pending
    (mockUserMessageGroupBy as any).mockResolvedValueOnce([
      { emailStatus: 'pending', _count: 15 },
    ]);
    (mockUserMessageCount as any).mockResolvedValueOnce(15);

    // Page 1 returns all 15 (< 1000, so loop finishes after this page)
    (mockUserMessageFindMany as any).mockResolvedValueOnce(mockMessages);

    // Final group by after all sent: 15 sent
    (mockUserMessageGroupBy as any).mockResolvedValueOnce([
      { emailStatus: 'sent', _count: 15 },
    ]);
    (mockUserMessageCount as any).mockResolvedValueOnce(15);

    mockSendEmail.mockResolvedValue({ delivered: true, id: 'resend-id' });
    mockBroadcastUpdate.mockResolvedValue({});
    mockUserMessageUpdate.mockResolvedValue({});

    await dispatchBroadcastEmails(broadcastId, { adminId });

    // SendEmail called 15 times
    expect(mockSendEmail).toHaveBeenCalledTimes(15);

    // Broadcast update called incrementally per chunk (chunk of 10, then chunk of 5)
    // plus the final status update
    expect(mockBroadcastUpdate).toHaveBeenCalledWith({
      where: { id: broadcastId },
      data: { sentEmailCount: { increment: 10 } },
    });
    expect(mockBroadcastUpdate).toHaveBeenCalledWith({
      where: { id: broadcastId },
      data: { sentEmailCount: { increment: 5 } },
    });
    expect(mockBroadcastUpdate).toHaveBeenCalledWith({
      where: { id: broadcastId },
      data: { status: 'sent' },
    });

    // Verify progress events
    expect(mockEmitToUserIds).toHaveBeenCalledWith(
      [adminId],
      expect.objectContaining({
        type: 'broadcast_email_progress',
        broadcastId,
        sent: 10,
        pending: 5,
        totalProcessed: 10,
      }),
    );
    expect(mockEmitToUserIds).toHaveBeenCalledWith(
      [adminId],
      expect.objectContaining({
        type: 'broadcast_email_progress',
        broadcastId,
        sent: 15,
        pending: 0,
        totalProcessed: 15,
      }),
    );

    // Verify completed event
    expect(mockEmitToUserIds).toHaveBeenCalledWith(
      [adminId],
      expect.objectContaining({
        type: 'broadcast_email_completed',
        broadcastId,
        status: 'sent',
        deliveryStats: {
          total: 15,
          sent: 15,
          failed: 0,
          skipped: 0,
          pending: 0,
        },
      }),
    );
  });

  test('skips example.com test domains without calling sendEmail', async () => {
    const mockMessages = [
      {
        id: 'msg-skip-1',
        broadcastId,
        userId: 'usr-skip',
        title: 'Skip Notice',
        body: 'Body',
        emailStatus: 'pending',
        user: { email: 'test@example.com' },
      },
    ];

    (mockBroadcastFindUnique as any).mockResolvedValue({
      id: broadcastId,
      title: 'Skip Notice',
      body: 'Body',
      createdById: adminId,
      totalRecipients: 1,
      sentEmailCount: 0,
      failedEmailCount: 0,
    });

    (mockUserMessageGroupBy as any)
      .mockResolvedValueOnce([{ emailStatus: 'pending', _count: 1 }])
      .mockResolvedValueOnce([{ emailStatus: 'skipped', _count: 1 }]);
    (mockUserMessageCount as any).mockResolvedValue(1);

    (mockUserMessageFindMany as any).mockResolvedValueOnce(mockMessages);
    mockBroadcastUpdate.mockResolvedValue({});
    mockUserMessageUpdate.mockResolvedValue({});

    await dispatchBroadcastEmails(broadcastId, { adminId });

    // sendEmail must NOT have been called for example.com
    expect(mockSendEmail).not.toHaveBeenCalled();

    // User message marked as skipped
    expect(mockUserMessageUpdate).toHaveBeenCalledWith({
      where: { id: 'msg-skip-1' },
      data: expect.objectContaining({ emailStatus: 'skipped' }),
    });

    // Completed event reflects skipped: 1
    expect(mockEmitToUserIds).toHaveBeenCalledWith(
      [adminId],
      expect.objectContaining({
        type: 'broadcast_email_completed',
        deliveryStats: expect.objectContaining({
          skipped: 1,
          sent: 0,
        }),
      }),
    );
  });

  test('retries rate-limited (429) send once and succeeds', async () => {
    const mockMessages = [
      {
        id: 'msg-rate-1',
        broadcastId,
        userId: 'usr-rate',
        title: 'Rate Limit Notice',
        body: 'Body',
        emailStatus: 'pending',
        user: { email: 'real@business.ng' },
      },
    ];

    (mockBroadcastFindUnique as any).mockResolvedValue({
      id: broadcastId,
      title: 'Rate Limit Notice',
      body: 'Body',
      createdById: adminId,
      totalRecipients: 1,
      sentEmailCount: 0,
      failedEmailCount: 0,
    });

    (mockUserMessageGroupBy as any)
      .mockResolvedValueOnce([{ emailStatus: 'pending', _count: 1 }])
      .mockResolvedValueOnce([{ emailStatus: 'sent', _count: 1 }]);
    (mockUserMessageCount as any).mockResolvedValue(1);

    (mockUserMessageFindMany as any).mockResolvedValueOnce(mockMessages);
    mockBroadcastUpdate.mockResolvedValue({});
    mockUserMessageUpdate.mockResolvedValue({});

    // First attempt fails with 429 rate limit, second attempt succeeds
    mockSendEmail
      .mockRejectedValueOnce(new Error('Rate limit exceeded: 429 Too Many Requests'))
      .mockResolvedValueOnce({ delivered: true, id: 'resend-rate-success' });

    await dispatchBroadcastEmails(broadcastId, { adminId });

    // SendEmail called twice (1 failure + 1 retry)
    expect(mockSendEmail).toHaveBeenCalledTimes(2);

    // Message marked as sent
    expect(mockUserMessageUpdate).toHaveBeenCalledWith({
      where: { id: 'msg-rate-1' },
      data: { emailStatus: 'sent' },
    });

    // Progress and completion events reflect sent: 1
    expect(mockEmitToUserIds).toHaveBeenCalledWith(
      [adminId],
      expect.objectContaining({
        type: 'broadcast_email_completed',
        deliveryStats: expect.objectContaining({
          sent: 1,
          failed: 0,
        }),
      }),
    );
  });
});

describe('retryBroadcast Unit Tests (Step 2)', () => {
  const broadcastId = 'bc-retry-456';
  const adminId = 'admin-user-1';

  beforeEach(() => {
    jest.resetAllMocks();
  });

  test('throws 404 if broadcast does not exist', async () => {
    (mockBroadcastFindUnique as any).mockResolvedValue(null);

    await expect(retryBroadcast(broadcastId, adminId)).rejects.toThrow('Broadcast not found');
  });

  test('returns retrying: false and pendingCount: 0 when no messages are pending', async () => {
    (mockBroadcastFindUnique as any).mockResolvedValue({
      id: broadcastId,
      status: 'sent',
    });
    (mockUserMessageCount as any).mockResolvedValue(0);

    const result = await retryBroadcast(broadcastId, adminId);

    expect(result).toEqual({
      retrying: false,
      pendingCount: 0,
      message: 'No pending recipients to retry',
    });
    expect(mockBroadcastUpdate).not.toHaveBeenCalled();
  });

  test('updates status to sending and queues dispatch when pending messages exist', async () => {
    (mockBroadcastFindUnique as any).mockResolvedValue({
      id: broadcastId,
      status: 'sent',
    });
    (mockUserMessageCount as any).mockResolvedValue(2);
    mockBroadcastUpdate.mockResolvedValue({});

    const result = await retryBroadcast(broadcastId, adminId);

    expect(result).toEqual({
      retrying: true,
      pendingCount: 2,
      message: 'Retry queued for 2 pending recipient(s)',
    });
    expect(mockBroadcastUpdate).toHaveBeenCalledWith({
      where: { id: broadcastId },
      data: { status: 'sending' },
    });
  });
});

