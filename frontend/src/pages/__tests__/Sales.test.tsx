import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Sales from '../Sales.tsx';
import api from '@/lib/axios.ts';
import { useBusinessStore } from '@/stores/business.store.ts';

// Mock modals and complex sub-components to keep unit test focused on Sales component state & race conditions
vi.mock('@/pages/SalesImportModal.tsx', () => ({ default: () => <div data-testid="import-modal" /> }));
vi.mock('@/components/AddSaleModal.tsx', () => ({ default: () => <div data-testid="add-modal" /> }));
vi.mock('@/components/ReportExportModal.tsx', () => ({ default: () => <div data-testid="export-modal" /> }));
vi.mock('@/components/TransactionDetailPanel.tsx', () => ({ default: () => <div data-testid="detail-panel" /> }));

describe('Sales Page - Race Condition & Sequence Guard Tests (Phase 3)', () => {
  const mockBiz = {
    id: 'biz-test-123',
    name: 'Test Business',
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
    let resolveSlowMonth: (val: any) => void;
    const slowMonthPromise = new Promise((resolve) => {
      resolveSlowMonth = resolve;
    });

    // Month 1 (Initial month, will be slow when re-triggered)
    const initialSummary = {
      totalSales: 100000,
      transactionCount: 5,
      sourceBreakdown: [{ source: 'cash', total: 100000, count: 5 }],
    };

    // Month 2 (Target month after rapid click, fast)
    const fastTargetSummary = {
      totalSales: 50000,
      transactionCount: 2,
      sourceBreakdown: [{ source: 'cash', total: 50000, count: 2 }],
    };

    // Stale slow Month response
    const slowStaleSummary = {
      totalSales: 999999,
      transactionCount: 99,
      sourceBreakdown: [{ source: 'cash', total: 999999, count: 99 }],
    };

    const apiGetSpy = vi.spyOn(api, 'get');
    apiGetSpy.mockImplementation((url: string, config?: any) => {
      if (url.includes('/summary')) {
        const month = config?.params?.month;
        if (month === 2) {
          // Slow request
          return slowMonthPromise as any;
        } else {
          return Promise.resolve({
            data: { success: true, data: fastTargetSummary },
          }) as any;
        }
      }
      if (url.includes('/daily')) {
        return Promise.resolve({
          data: { success: true, data: { total: 0, bySource: [] } },
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
      <MemoryRouter initialEntries={['/sales?tab=monthly']}>
        <Sales />
      </MemoryRouter>
    );

    // Initial render fetches summary - wait for loading to finish
    await waitFor(() => {
      expect(screen.queryByText('Loading summary...')).not.toBeInTheDocument();
      expect(screen.getByText(/Total Sales/i)).toBeInTheDocument();
    });

    // Find Chevron buttons in the Monthly Summary header
    const chevronButtons = screen.getAllByRole('button').filter(
      (b) => b.querySelector('svg.lucide-chevron-left') || b.querySelector('svg.lucide-chevron-right')
    );
    const leftBtn = chevronButtons.find((b) => b.querySelector('svg.lucide-chevron-left'));
    const rightBtn = chevronButtons.find((b) => b.querySelector('svg.lucide-chevron-right'));

    expect(leftBtn).toBeDefined();
    expect(rightBtn).toBeDefined();

    // Now set mock: next call is slow, following call is fast
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

    // Next call will be fast
    apiGetSpy.mockImplementation((url: string) => {
      if (url.includes('/summary')) {
        return Promise.resolve({
          data: {
            success: true,
            data: {
              totalSales: 75000,
              transactionCount: 3,
              sourceBreakdown: [],
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

    // Wait for fast Call 2 to settle on screen. Both "Total Sales" and
    // "Collected (Cash)" render this figure (empty sourceBreakdown => no
    // credit portion), so assert on presence, not a single node.
    await waitFor(() => {
      expect(screen.getAllByText('₦75,000.00').length).toBeGreaterThan(0);
    });

    // Now let the older Call 1 finish late with ₦999,999
    await act(async () => {
      slowResolve!({
        data: {
          success: true,
          data: {
            totalSales: 999999,
            transactionCount: 99,
            sourceBreakdown: [],
          },
        },
      });
    });

    // The display MUST NOT be overwritten by the stale ₦999,999!
    expect(screen.queryByText('₦999,999.00')).not.toBeInTheDocument();
    expect(screen.getAllByText('₦75,000.00').length).toBeGreaterThan(0);
  });
});
