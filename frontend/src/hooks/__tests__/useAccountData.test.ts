import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useAccountData } from '../useAccountData';
import api from '@/lib/axios';

vi.mock('react-hot-toast', () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe('useAccountData Hook - Account Summary Consumption (Phase 8)', () => {
  const bizId = 'biz-account-123';

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('fetches authoritative balance and monthly inflow from /dva/account-summary', async () => {
    const apiGetSpy = vi.spyOn(api, 'get');
    apiGetSpy.mockImplementation((url: string) => {
      if (url.includes('/dva/account-summary')) {
        return Promise.resolve({
          data: {
            success: true,
            data: {
              ledgerBalance: 350000,
              receivedThisMonth: 120000,
              dva: { status: 'active', accountNumber: '0123456789' },
              transactions: [],
            },
          },
        }) as any;
      }
      if (url.includes('/dva/transactions')) {
        // Return 50 transactions with arbitrary sum to ensure moneyIn is NOT computed from this list
        return Promise.resolve({
          data: {
            success: true,
            data: [
              {
                id: 'tx-1',
                amount: '1000',
                status: 'confirmed',
                transactionDate: new Date().toISOString(),
              },
            ],
            pagination: { page: 1, limit: 50, total: 100 },
          },
        }) as any;
      }
      if (url.includes('/dva')) {
        return Promise.resolve({
          data: {
            success: true,
            data: {
              status: 'active',
              accountNumber: '0123456789',
              bankName: 'Wema Bank',
            },
          },
        }) as any;
      }
      if (url.includes('/banks')) {
        return Promise.resolve({
          data: {
            success: true,
            data: [],
          },
        }) as any;
      }
      return Promise.resolve({ data: { success: true, data: {} } }) as any;
    });

    const { result } = renderHook(() => useAccountData(bizId));

    // Wait for initial load
    await waitFor(() => {
      expect(result.current.moneyIn.totalBalance).toBe(350000);
      expect(result.current.moneyIn.receivedThisMonth).toBe(120000);
    });

    // Verify it called /dva/account-summary
    expect(apiGetSpy).toHaveBeenCalledWith(`/businesses/${bizId}/dva/account-summary`);

    // Ensure moneyIn does NOT reflect client-side sum of the transactions list (which was 1000)
    expect(result.current.moneyIn.totalBalance).not.toBe(1000);
    expect(result.current.moneyIn.totalBalance).toBe(350000);
  });
});
