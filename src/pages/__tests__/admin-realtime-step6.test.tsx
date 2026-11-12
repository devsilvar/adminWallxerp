import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AdminDashboard from '../admin/AdminDashboard';
import AdminTransactions from '../admin/AdminTransactions';
import { useAuthStore } from '../../stores/auth.store';
import { useAdminStatsStore } from '../../stores/admin.stats.store';
import api from '@/lib/axios';

// Mock SSE client
const mockListeners = new Map<string, Set<(e: any) => void>>();
const mockOn = vi.fn((type: string, cb: (e: any) => void) => {
  if (!mockListeners.has(type)) mockListeners.set(type, new Set());
  mockListeners.get(type)!.add(cb);
});
const mockOff = vi.fn((type: string, cb: (e: any) => void) => {
  mockListeners.get(type)?.delete(cb);
});

vi.mock('@/lib/sse-client', () => ({
  getSSEClient: () => ({
    on: mockOn,
    off: mockOff,
  }),
}));

vi.mock('@/lib/axios', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    interceptors: {
      request: { use: vi.fn() },
      response: { use: vi.fn() },
    },
  },
  getErrorMessage: (err: any, fallback: string) => fallback,
}));

describe('Admin Step 6 Realtime Integration Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListeners.clear();
    useAuthStore.setState({
      user: { id: 'admin-1', email: 'admin@paymytax.com', role: 'admin' } as any,
      isAuthenticated: true,
      isLoading: false,
    });

    (api.get as any).mockImplementation((url: string) => {
      if (url.includes('/admin/dashboard')) {
        return Promise.resolve({
          data: {
            success: true,
            data: {
              totalUsers: 100,
              totalBusinesses: 50,
              pendingWithdrawalsCount: 2,
              unverifiedInflowsCount: 1,
              pendingSubscriptionsCount: 3,
            },
          },
        });
      }
      if (url.includes('/admin/treasury/analytics')) {
        return Promise.resolve({
          data: {
            success: true,
            data: {
              summary: { totalInflow: 0, totalOutflow: 0, netMargin: 0, activeFloat: 0 },
              records: [],
            },
          },
        });
      }
      if (url.includes('/admin/transactions')) {
        return Promise.resolve({
          data: {
            success: true,
            data: [],
            summary: { totalIn: 0, totalOut: 0, failedOut: 0, netMargin: 0 },
            pagination: { page: 1, limit: 20, total: 0, totalPages: 1 },
          },
        });
      }
      return Promise.resolve({ data: { success: true, data: {} } });
    });
  });

  describe('AdminDashboard Realtime Listeners', () => {
    const ALL_8_ADMIN_EVENTS = [
      'broadcast_email_progress',
      'broadcast_email_completed',
      'withdrawal_created',
      'withdrawal_status_changed',
      'unverified_inflow_created',
      'unverified_inflow_verified',
      'subscription_submitted',
      'subscription_status_changed',
    ];

    it('subscribes to all 8 admin events on mount and unsubscribes on unmount', () => {
      const { unmount } = render(
        <MemoryRouter>
          <AdminDashboard />
        </MemoryRouter>
      );

      ALL_8_ADMIN_EVENTS.forEach((evt) => {
        expect(mockOn).toHaveBeenCalledWith(evt, expect.any(Function));
      });

      unmount();

      ALL_8_ADMIN_EVENTS.forEach((evt) => {
        expect(mockOff).toHaveBeenCalledWith(evt, expect.any(Function));
      });
    });

    it('triggers fetchStats when an admin event fires', async () => {
      const fetchStatsSpy = vi.spyOn(useAdminStatsStore.getState(), 'fetchStats');

      render(
        <MemoryRouter>
          <AdminDashboard />
        </MemoryRouter>
      );

      fetchStatsSpy.mockClear();

      // Simulate a withdrawal_created event
      await act(async () => {
        const cbs = mockListeners.get('withdrawal_created');
        cbs?.forEach((cb) => cb({ type: 'withdrawal_created' }));
        await Promise.resolve();
      });

      expect(fetchStatsSpy).toHaveBeenCalled();
    });
  });

  describe('AdminTransactions Realtime Listeners', () => {
    it('subscribes to transaction-impacting events on mount and unsubscribes on unmount', () => {
      const { unmount } = render(
        <MemoryRouter>
          <AdminTransactions />
        </MemoryRouter>
      );

      const EXPECTED_EVENTS = [
        'withdrawal_created',
        'withdrawal_status_changed',
        'unverified_inflow_created',
        'unverified_inflow_verified',
        'subscription_submitted',
        'subscription_status_changed',
      ];

      EXPECTED_EVENTS.forEach((evt) => {
        expect(mockOn).toHaveBeenCalledWith(evt, expect.any(Function));
      });

      unmount();

      EXPECTED_EVENTS.forEach((evt) => {
        expect(mockOff).toHaveBeenCalledWith(evt, expect.any(Function));
      });
    });

    it('refreshes transactions when an event fires in a clean unfiltered view', async () => {
      render(
        <MemoryRouter>
          <AdminTransactions />
        </MemoryRouter>
      );

      const initialCalls = (api.get as any).mock.calls.filter((c: any) =>
        c[0].includes('/admin/transactions')
      ).length;

      // Simulate unverified_inflow_created event while in clean view
      await act(async () => {
        const cbs = mockListeners.get('unverified_inflow_created');
        cbs?.forEach((cb) => cb({ type: 'unverified_inflow_created' }));
      });

      const afterCalls = (api.get as any).mock.calls.filter((c: any) =>
        c[0].includes('/admin/transactions')
      ).length;

      expect(afterCalls).toBeGreaterThan(initialCalls);
    });
  });
});
