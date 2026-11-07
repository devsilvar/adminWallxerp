import { describe, it, expect, vi, beforeEach } from 'vitest';
import api from '@/lib/axios';
import { useSettlementStore } from '@/stores/settlement.store';

describe('useSettlementStore - Race Condition & Sequence Guard Tests (Phase 2)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useSettlementStore.setState({
      preview: null,
      regulatory: null,
      history: [],
      loadingPreview: false,
      loadingHistory: false,
      withdrawing: false,
      pagination: { page: 1, limit: 10, total: 0, totalPages: 1 },
    });
  });

  it('sets preview on normal single request', async () => {
    const mockPreview = {
      businessId: 'biz-1',
      businessName: 'Business One',
      availableForWithdrawal: 50000,
      totalInflows: 100000,
      totalWithdrawn: 50000,
      taxReserve: 7500,
      totalSplitSettled: 0,
    };

    vi.spyOn(api, 'get').mockResolvedValueOnce({
      data: {
        success: true,
        data: mockPreview,
        meta: { regulatory: { autoSplitMinPercent: 7.5 } },
      },
    });

    await useSettlementStore.getState().fetchPreview('biz-1');

    const state = useSettlementStore.getState();
    expect(state.preview).toEqual(mockPreview);
    expect(state.loadingPreview).toBe(false);
  });

  it('discards an earlier slow response when superseded by a newer faster request in fetchPreview', async () => {
    let resolveSlow: (val: any) => void;
    const slowPromise = new Promise((resolve) => {
      resolveSlow = resolve;
    });

    const fastPreview = {
      businessId: 'biz-fast',
      businessName: 'Fast Biz',
      availableForWithdrawal: 8888,
      totalInflows: 10000,
      totalWithdrawn: 1000,
      taxReserve: 500,
      totalSplitSettled: 0,
    };
    const slowPreview = {
      businessId: 'biz-slow',
      businessName: 'Slow Biz',
      availableForWithdrawal: 1111,
      totalInflows: 2000,
      totalWithdrawn: 500,
      taxReserve: 100,
      totalSplitSettled: 0,
    };

    const apiGetSpy = vi.spyOn(api, 'get');
    apiGetSpy.mockImplementationOnce(() => slowPromise as any);
    apiGetSpy.mockImplementationOnce(() =>
      Promise.resolve({
        data: {
          success: true,
          data: fastPreview,
          meta: {},
        },
      }) as any
    );

    // Call 1 (biz-slow)
    const call1 = useSettlementStore.getState().fetchPreview('biz-slow');
    // Call 2 (biz-fast)
    const call2 = useSettlementStore.getState().fetchPreview('biz-fast');

    await call2;
    expect(useSettlementStore.getState().preview).toEqual(fastPreview);
    expect(useSettlementStore.getState().loadingPreview).toBe(false);

    // Now resolve slow Call 1
    resolveSlow!({
      data: {
        success: true,
        data: slowPreview,
        meta: {},
      },
    });
    await call1;

    // Must remain fastPreview!
    expect(useSettlementStore.getState().preview).toEqual(fastPreview);
    expect(useSettlementStore.getState().preview?.businessId).toBe('biz-fast');
  });

  it('discards an earlier slow response when superseded by a newer request in fetchHistory', async () => {
    let resolveSlow: (val: any) => void;
    const slowPromise = new Promise((resolve) => {
      resolveSlow = resolve;
    });

    const fastHistory = [{ id: 'payout-fast', amount: 5000, status: 'completed' }];
    const slowHistory = [{ id: 'payout-slow', amount: 99000, status: 'pending' }];

    const apiGetSpy = vi.spyOn(api, 'get');
    apiGetSpy.mockImplementationOnce(() => slowPromise as any);
    apiGetSpy.mockImplementationOnce(() =>
      Promise.resolve({
        data: {
          success: true,
          data: fastHistory,
          pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
        },
      }) as any
    );

    const call1 = useSettlementStore.getState().fetchHistory('biz-1', 1);
    const call2 = useSettlementStore.getState().fetchHistory('biz-2', 1);

    await call2;
    expect(useSettlementStore.getState().history).toEqual(fastHistory);

    resolveSlow!({
      data: {
        success: true,
        data: slowHistory,
        pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
      },
    });
    await call1;

    expect(useSettlementStore.getState().history).toEqual(fastHistory);
    expect(useSettlementStore.getState().history[0].id).toBe('payout-fast');
  });
});
