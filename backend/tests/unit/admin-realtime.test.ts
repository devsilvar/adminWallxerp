import { describe, test, expect, jest, beforeEach } from '@jest/globals';

const mockEmitToUserIds = jest.fn();
jest.mock('../../src/lib/realtime-emitter', () => ({
  eventBus: {
    emitToUserIds: mockEmitToUserIds,
  },
}));

const mockUserFindMany = jest.fn();
jest.mock('../../src/lib/prisma', () => ({
  __esModule: true,
  default: {
    user: {
      findMany: mockUserFindMany,
    },
  },
}));

import { emitToAdmins, _resetAdminCacheForTest } from '../../src/services/admin/realtime-admin.helper';
import type { RealtimeEvent } from '../../src/types/realtime-events';

describe('emitToAdmins Unit Tests (Step 1)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    _resetAdminCacheForTest();
  });

  test('fetches active admins from DB on first call and emits event', async () => {
    (mockUserFindMany as any).mockResolvedValue([
      { id: 'admin-1' },
      { id: 'admin-2' },
    ]);

    const event: RealtimeEvent = {
      type: 'withdrawal_created',
      withdrawalId: 'wd-1',
      businessId: 'biz-1',
      businessName: 'Apex Store',
      amount: 150000,
      timestamp: new Date().toISOString(),
    };

    await emitToAdmins(event);

    expect(mockUserFindMany).toHaveBeenCalledTimes(1);
    expect(mockUserFindMany).toHaveBeenCalledWith({
      where: { role: 'admin', isActive: true },
      select: { id: true },
    });
    expect(mockEmitToUserIds).toHaveBeenCalledWith(['admin-1', 'admin-2'], event);
  });

  test('uses cached admin IDs within 60 seconds without re-querying DB', async () => {
    (mockUserFindMany as any).mockResolvedValue([
      { id: 'admin-1' },
      { id: 'admin-2' },
    ]);

    const event1: RealtimeEvent = {
      type: 'subscription_submitted',
      submissionId: 'sub-1',
      customerName: 'Chidi Store',
      plan: 'Growth',
      amount: 15000,
      timestamp: new Date().toISOString(),
    };

    const event2: RealtimeEvent = {
      type: 'unverified_inflow_created',
      saleId: 'sale-99',
      businessId: 'biz-2',
      businessName: 'Beta Logistics',
      amount: 85000,
      timestamp: new Date().toISOString(),
    };

    await emitToAdmins(event1);
    await emitToAdmins(event2);

    // DB query should only happen once due to 60s cache
    expect(mockUserFindMany).toHaveBeenCalledTimes(1);
    expect(mockEmitToUserIds).toHaveBeenCalledTimes(2);
    expect(mockEmitToUserIds).toHaveBeenNthCalledWith(1, ['admin-1', 'admin-2'], event1);
    expect(mockEmitToUserIds).toHaveBeenNthCalledWith(2, ['admin-1', 'admin-2'], event2);
  });

  test('does not emit if no active admins exist', async () => {
    (mockUserFindMany as any).mockResolvedValue([]);

    const event: RealtimeEvent = {
      type: 'unverified_inflow_verified',
      saleId: 'sale-1',
      businessId: 'biz-1',
      timestamp: new Date().toISOString(),
    };

    await emitToAdmins(event);

    expect(mockUserFindMany).toHaveBeenCalledTimes(1);
    expect(mockEmitToUserIds).not.toHaveBeenCalled();
  });
});
