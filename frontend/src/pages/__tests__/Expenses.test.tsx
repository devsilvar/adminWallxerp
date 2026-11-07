import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Expenses from '../Expenses.tsx';
import api from '@/lib/axios.ts';
import { useBusinessStore } from '@/stores/business.store.ts';

// Mock modals to keep test focused on Expenses race condition logic
vi.mock('@/components/AddExpenseModal.tsx', () => ({ default: () => <div data-testid="add-modal" /> }));
vi.mock('@/components/ReportExportModal.tsx', () => ({ default: () => <div data-testid="export-modal" /> }));

describe('Expenses Page - Race Condition & Sequence Guard Tests (Phase 4)', () => {
  const mockBiz = {
    id: 'biz-expenses-123',
    name: 'Expenses Test Business',
    currency: 'NGN',
    role: 'owner',
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    useBusinessStore.setState({
      activeBusiness: mockBiz as any,
      businesses: [mockBiz as any],
    });
  });

  it('discards an earlier slow summary response when month is switched rapidly', async () => {
    const apiGetSpy = vi.spyOn(api, 'get');
    apiGetSpy.mockImplementation((url: string) => {
      if (url.includes('/summary')) {
        return Promise.resolve({
          data: {
            success: true,
            data: {
              month: 9,
              year: 2026,
              totalExpenses: 25000,
              totalSales: 100000,
              transactionCount: 2,
              categoryBreakdown: [],
              alerts: [],
            },
          },
        }) as any;
      }
      if (url.includes('/daily')) {
        return Promise.resolve({
          data: {
            success: true,
            data: { date: '2026-09-24', totalExpenses: 0, totalSales: 0, transactionCount: 0, categoryBreakdown: [], alerts: [], transactions: [] },
          },
        }) as any;
      }
      return Promise.resolve({
        data: {
          success: true,
          data: [],
          pagination: { page: 1, limit: 15, total: 0, totalPages: 1 },
        },
      }) as any;
    });

    render(
      <MemoryRouter initialEntries={['/expenses?tab=monthly']}>
        <Expenses />
      </MemoryRouter>
    );

    // Initial render fetches summary - wait for loading to finish
    await waitFor(() => {
      expect(screen.queryByText('Loading summary...')).not.toBeInTheDocument();
      expect(screen.getByText(/Total Expenses/i)).toBeInTheDocument();
    });

    const chevronButtons = screen.getAllByRole('button').filter(
      (b) => b.querySelector('svg.lucide-chevron-left') || b.querySelector('svg.lucide-chevron-right')
    );
    const leftBtn = chevronButtons.find((b) => b.querySelector('svg.lucide-chevron-left'));
    const rightBtn = chevronButtons.find((b) => b.querySelector('svg.lucide-chevron-right'));

    expect(leftBtn).toBeDefined();
    expect(rightBtn).toBeDefined();

    // Now test out-of-order race: Call 1 is slow, Call 2 is fast
    let slowResolve: (val: any) => void;
    const slowP = new Promise((r) => {
      slowResolve = r;
    });

    apiGetSpy.mockImplementation((url: string) => {
      if (url.includes('/summary')) {
        // Slow call
        return slowP as any;
      }
      return Promise.resolve({ data: { success: true, data: [] } }) as any;
    });

    // Click left (Call 1 - slow)
    await act(async () => {
      fireEvent.click(leftBtn!);
    });

    // Next call will be fast with ₦45,000
    apiGetSpy.mockImplementation((url: string) => {
      if (url.includes('/summary')) {
        return Promise.resolve({
          data: {
            success: true,
            data: {
              month: 9,
              year: 2026,
              totalExpenses: 45000,
              totalSales: 100000,
              transactionCount: 3,
              categoryBreakdown: [],
              alerts: [],
            },
          },
        }) as any;
      }
      return Promise.resolve({ data: { success: true, data: [] } }) as any;
    });

    // Click right (Call 2 - fast)
    await act(async () => {
      fireEvent.click(rightBtn!);
    });

    // Wait for fast Call 2 to settle on screen
    await waitFor(() => {
      expect(screen.getByText('₦45,000.00')).toBeInTheDocument();
    });

    // Now let the older Call 1 finish late with ₦888,888
    await act(async () => {
      slowResolve!({
        data: {
          success: true,
          data: {
            month: 8,
            year: 2026,
            totalExpenses: 888888,
            totalSales: 100000,
            transactionCount: 88,
            categoryBreakdown: [],
            alerts: [],
          },
        },
      });
    });

    // Stale ₦888,888 must be discarded by the sequence guard
    expect(screen.queryByText('₦888,888.00')).not.toBeInTheDocument();
    expect(screen.getByText('₦45,000.00')).toBeInTheDocument();
  });
});
