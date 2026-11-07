import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import TaxReports from '../TaxReports.tsx';
import api from '@/lib/axios.ts';
import { useBusinessStore } from '@/stores/business.store.ts';

// Mock modals to keep test focused on TaxReports sequence guard
vi.mock('@/components/FinalizeConfirmationModal.tsx', () => ({ default: () => <div data-testid="finalize-modal" /> }));
vi.mock('@/components/PaymentConfirmationModal.tsx', () => ({ default: () => <div data-testid="payment-modal" /> }));

describe('TaxReports Page - Race Condition & Sequence Guard Tests (Phase 5)', () => {
  const mockBiz = {
    id: 'biz-tax-123',
    name: 'Tax Test Business',
    businessName: 'Tax Test Business',
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

  it('discards an earlier slow reports response when filter status is changed rapidly', async () => {
    const apiGetSpy = vi.spyOn(api, 'get');

    const initialReports = [
      {
        id: 'rep-initial',
        taxMonth: '2026-09-01T00:00:00.000Z',
        status: 'draft',
        taxPayable: 15000,
        totalSales: 200000,
        totalExpenses: 0,
        grossProfit: 200000,
      },
    ];

    apiGetSpy.mockImplementation((url: string, config?: any) => {
      if (url.includes('/reports')) {
        return Promise.resolve({
          data: {
            success: true,
            data: initialReports,
            pagination: { page: 1, limit: 12, total: 1, totalPages: 1 },
          },
        }) as any;
      }
      return Promise.resolve({ data: { success: true, data: [] } }) as any;
    });

    render(
      <MemoryRouter initialEntries={['/tax?tab=reports']}>
        <TaxReports />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.queryByText('Loading tax reports...')).not.toBeInTheDocument();
      expect(screen.getByText(/September 2026/i)).toBeInTheDocument();
    });

    // Setup out-of-order responses for rapid status filter click:
    // Call 1 (click 'Pending' filter) -> slow
    let slowResolve: (val: any) => void;
    const slowP = new Promise((r) => {
      slowResolve = r;
    });

    apiGetSpy.mockImplementation((url: string, config?: any) => {
      if (url.includes('/reports')) {
        return slowP as any;
      }
      return Promise.resolve({ data: { success: true, data: [] } }) as any;
    });

    // Find filter buttons (All, Paid, Pending)
    const pendingFilterBtn = screen.getByRole('button', { name: 'Pending' });
    const paidFilterBtn = screen.getByRole('button', { name: 'Paid' });

    // Click Pending (Call 1 - slow)
    await act(async () => {
      fireEvent.click(pendingFilterBtn);
    });

    // Next call will be fast (Paid)
    const paidReports = [
      {
        id: 'rep-paid',
        taxMonth: '2026-08-01T00:00:00.000Z',
        status: 'completed',
        taxPayable: 99000,
        totalSales: 1500000,
        totalExpenses: 180000,
        grossProfit: 1320000,
      },
    ];

    apiGetSpy.mockImplementation((url: string, config?: any) => {
      if (url.includes('/reports')) {
        return Promise.resolve({
          data: {
            success: true,
            data: paidReports,
            pagination: { page: 1, limit: 12, total: 1, totalPages: 1 },
          },
        }) as any;
      }
      return Promise.resolve({ data: { success: true, data: [] } }) as any;
    });

    // Click Paid (Call 2 - fast)
    await act(async () => {
      fireEvent.click(paidFilterBtn);
    });

    // Fast call finishes and renders on screen
    await waitFor(() => {
      expect(screen.getByText(/August 2026/i)).toBeInTheDocument();
    });

    // Now let slow Call 1 finish late with stale data (July 2026)
    await act(async () => {
      slowResolve!({
        data: {
          success: true,
          data: [
            {
              id: 'rep-stale',
              taxMonth: '2026-07-01T00:00:00.000Z',
              status: 'pending',
              taxPayable: 444444,
              totalSales: 500000,
              totalExpenses: 0,
              grossProfit: 500000,
            },
          ],
          pagination: { page: 1, limit: 12, total: 1, totalPages: 1 },
        },
      });
    });

    // Sequence guard must discard the stale response
    expect(screen.queryByText(/July 2026/i)).not.toBeInTheDocument();
    expect(screen.getByText(/August 2026/i)).toBeInTheDocument();
  });
});
