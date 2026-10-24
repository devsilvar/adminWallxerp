import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from '../../App';
import { useAuthStore } from '../../stores/auth.store';

// Mock axios
vi.mock('@/lib/axios', () => {
  return {
    default: {
      get: vi.fn().mockResolvedValue({
        data: {
          success: true,
          data: {
            userCount: 10,
            businessCount: 5,
            recentUsers: [],
            recentBusinesses: [],
            recentSignups: [],
            financials: { totalSalesCount: 0, totalSalesVolume: 0 },
            settlement: { totalSettled: 0, feeCollected: 0 },
            withdrawalSla: { pendingCount: 0, breachedCount: 0, oldestPendingHours: 0 },
            withdrawalDisputes: { count: 0, valueNaira: 0, oldestHours: 0 },
            unverifiedInflows: { count: 0 },
            pendingSubscriptionsCount: 0,
          },
        },
      }),
      post: vi.fn().mockResolvedValue({ data: { success: true, data: {} } }),
      put: vi.fn().mockResolvedValue({ data: { success: true, data: {} } }),
      patch: vi.fn().mockResolvedValue({ data: { success: true, data: {} } }),
      delete: vi.fn().mockResolvedValue({ data: { success: true, data: {} } }),
      interceptors: {
        request: { use: vi.fn() },
        response: { use: vi.fn() },
      },
    },
  };
});

describe('Admin App Shell Smoke Test', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({
      user: null,
      isAuthenticated: false,
      isLoading: false,
    });
  });

  it('renders login page without crashing when unauthenticated on /admin/login', async () => {
    window.history.pushState({}, '', '/admin/login');
    render(<App />);

    const heading = await screen.findByRole('heading', { name: /operations/i }, { timeout: 10000 });
    expect(heading).toBeInTheDocument();
  });

  it('renders admin dashboard shell when authenticated as admin', async () => {
    useAuthStore.setState({
      user: {
        id: 'admin-1',
        email: 'admin@paymytax.com',
        role: 'admin',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      } as any,
      isAuthenticated: true,
      isLoading: false,
    });

    window.history.pushState({}, '', '/admin');
    render(<App />);

    const brands = await screen.findAllByText(
      /platform management/i,
      {},
      { timeout: 10000 }
    );
    expect(brands.length).toBeGreaterThan(0);
  });
});
