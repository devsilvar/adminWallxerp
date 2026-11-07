import { describe, it, expect, vi, beforeEach } from 'vitest';
import api from '@/lib/axios';
import { useCreditStore } from '@/stores/credit.store';

describe('useCreditStore - Race Condition & Sequence Guard Tests (Phase 1)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useCreditStore.getState().clear();
  });

  it('sets credits and summary on normal single request', async () => {
    const mockCredits = [{ id: 'cred-1', customerName: 'Customer One', totalAmount: 5000 }];
    const mockSummary = { totalReceivable: 5000, totalOverdue: 0, totalRecovered: 0, activeCount: 1 };

    vi.spyOn(api, 'get').mockResolvedValueOnce({
      data: {
        success: true,
        data: mockCredits,
        summary: mockSummary,
        pagination: { page: 1, limit: 15, total: 1, totalPages: 1 },
      },
    });

    await useCreditStore.getState().fetchCredits('biz-123', { page: 1, limit: 15 });

    const state = useCreditStore.getState();
    expect(state.credits).toEqual(mockCredits);
    expect(state.summary).toEqual(mockSummary);
    expect(state.listLoading).toBe(false);
    expect(state.listError).toBeNull();
  });

  it('discards an earlier slow response when superseded by a newer faster request in fetchCredits', async () => {
    let resolveSlow: (val: any) => void;
    const slowPromise = new Promise((resolve) => {
      resolveSlow = resolve;
    });

    const fastCredits = [{ id: 'cred-fast', customerName: 'Fast Search Result', totalAmount: 1000 }];
    const slowCredits = [{ id: 'cred-slow', customerName: 'Old Stale Search', totalAmount: 9000 }];

    const apiGetSpy = vi.spyOn(api, 'get');

    // Call 1 (slow) returns unresolved promise initially
    apiGetSpy.mockImplementationOnce(() => slowPromise as any);
    // Call 2 (fast) resolves immediately
    apiGetSpy.mockImplementationOnce(() =>
      Promise.resolve({
        data: {
          success: true,
          data: fastCredits,
          summary: null,
          pagination: { page: 1, limit: 15, total: 1, totalPages: 1 },
        },
      }) as any
    );

    // Trigger Call 1 (e.g. user typed "Emeka")
    const call1 = useCreditStore.getState().fetchCredits('biz-123', { search: 'Emeka' });

    // Trigger Call 2 (e.g. user backspaced to "Em")
    const call2 = useCreditStore.getState().fetchCredits('biz-123', { search: 'Em' });

    // Fast call completes first
    await call2;

    expect(useCreditStore.getState().credits).toEqual(fastCredits);

    // Now slow call finishes late
    resolveSlow!({
      data: {
        success: true,
        data: slowCredits,
        summary: null,
        pagination: { page: 1, limit: 15, total: 1, totalPages: 1 },
      },
    });
    await call1;

    // The store MUST still have fastCredits and must NOT be overwritten by slowCredits!
    expect(useCreditStore.getState().credits).toEqual(fastCredits);
    expect(useCreditStore.getState().credits[0].id).toBe('cred-fast');
  });

  it('discards an earlier slow error when superseded by a newer faster request in fetchCredits', async () => {
    let rejectSlow: (err: any) => void;
    const slowPromise = new Promise((_, reject) => {
      rejectSlow = reject;
    });

    const fastCredits = [{ id: 'cred-2', customerName: 'Valid Result' }];

    const apiGetSpy = vi.spyOn(api, 'get');
    apiGetSpy.mockImplementationOnce(() => slowPromise as any);
    apiGetSpy.mockImplementationOnce(() =>
      Promise.resolve({
        data: {
          success: true,
          data: fastCredits,
          summary: null,
          pagination: null,
        },
      }) as any
    );

    const call1 = useCreditStore.getState().fetchCredits('biz-123', { page: 1 });
    const call2 = useCreditStore.getState().fetchCredits('biz-123', { page: 2 });

    await call2;
    expect(useCreditStore.getState().credits).toEqual(fastCredits);
    expect(useCreditStore.getState().listError).toBeNull();

    // Call 1 errors out after call 2 succeeded
    rejectSlow!(new Error('Network error on page 1'));
    await call1;

    // Error must not overwrite store state
    expect(useCreditStore.getState().listError).toBeNull();
    expect(useCreditStore.getState().credits).toEqual(fastCredits);
  });

  it('discards an earlier slow response when superseded in fetchSummary', async () => {
    let resolveSlow: (val: any) => void;
    const slowPromise = new Promise((resolve) => {
      resolveSlow = resolve;
    });

    const fastSummary = { totalReceivable: 200, totalOverdue: 0, totalRecovered: 0, activeCount: 1 };
    const slowSummary = { totalReceivable: 99999, totalOverdue: 0, totalRecovered: 0, activeCount: 99 };

    const apiGetSpy = vi.spyOn(api, 'get');
    apiGetSpy.mockImplementationOnce(() => slowPromise as any);
    apiGetSpy.mockImplementationOnce(() =>
      Promise.resolve({
        data: {
          success: true,
          data: fastSummary,
        },
      }) as any
    );

    const call1 = useCreditStore.getState().fetchSummary('biz-1');
    const call2 = useCreditStore.getState().fetchSummary('biz-2');

    const result2 = await call2;
    expect(result2).toEqual(fastSummary);
    expect(useCreditStore.getState().summary).toEqual(fastSummary);

    // Now resolve slow call 1
    resolveSlow!({
      data: {
        success: true,
        data: slowSummary,
      },
    });
    const result1 = await call1;

    // Superseded call returns null and does NOT overwrite state
    expect(result1).toBeNull();
    expect(useCreditStore.getState().summary).toEqual(fastSummary);
  });
});
