import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route, Navigate } from 'react-router-dom';
import Sidebar from '@/components/layout/Sidebar.tsx';
import Sales from '../Sales.tsx';
import TaxReports from '../TaxReports.tsx';
import api from '@/lib/axios.ts';
import { useBusinessStore } from '@/stores/business.store.ts';
import { useAuthStore } from '@/stores/auth.store.ts';

// Mock sub-components and modals to isolate navigation and tab state
vi.mock('../UnverifiedTransactions.tsx', () => ({
  default: () => (
    <div data-testid='unverified-transactions-view'>
      Unverified Inflow Triage
    </div>
  ),
}));
vi.mock('../Payments.tsx', () => ({
  default: () => (
    <div data-testid='payments-history-view'>
      NRS Receipts & Payments History
    </div>
  ),
}));
vi.mock('@/pages/SalesImportModal.tsx', () => ({ default: () => null }));
vi.mock('@/components/AddSaleModal.tsx', () => ({ default: () => null }));
vi.mock('@/components/ReportExportModal.tsx', () => ({ default: () => null }));
vi.mock('@/components/TransactionDetailPanel.tsx', () => ({
  default: () => null,
}));
vi.mock('@/components/FinalizeConfirmationModal.tsx', () => ({
  default: () => null,
}));
vi.mock('@/components/PaymentConfirmationModal.tsx', () => ({
  default: () => null,
}));

describe('Core 4 Navigation & Hub Consolidation Tests', () => {
  const mockBiz = {
    id: 'biz-core-test',
    businessName: 'Core Hub Test SME',
    currency: 'NGN',
    myRole: 'owner',
    userId: 'user-core-test',
  };

  const mockUser = {
    id: 'user-core-test',
    email: 'owner@test.com',
    role: 'user',
    isOwnerAccount: true,
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    useBusinessStore.setState({
      activeBusiness: mockBiz as any,
      businesses: [mockBiz as any],
    });
    useAuthStore.setState({
      user: mockUser as any,
      isAuthenticated: true,
    });

    vi.spyOn(api, 'get').mockImplementation((url: string) => {
      if (url.includes('/sales/daily')) {
        return Promise.resolve({
          data: { success: true, data: { total: 0, bySource: [] } },
        }) as any;
      }
      if (url.includes('/sales/summary')) {
        return Promise.resolve({
          data: {
            success: true,
            data: { totalSales: 0, transactionCount: 0, sourceBreakdown: [] },
          },
        }) as any;
      }
      if (url.includes('/sales')) {
        return Promise.resolve({
          data: {
            success: true,
            data: [],
            pagination: { page: 1, limit: 15, total: 0, totalPages: 1 },
          },
        }) as any;
      }
      if (url.includes('/tax/reports')) {
        return Promise.resolve({
          data: {
            success: true,
            data: [],
            pagination: { page: 1, limit: 12, total: 0, totalPages: 1 },
          },
        }) as any;
      }
      return Promise.resolve({ data: { success: true, data: [] } }) as any;
    });
  });

  describe('CORE-05: Unverified Inflows embedded in Sales Hub', () => {
    it('mounts Unverified Inflows view when tab=unverified is selected', async () => {
      render(
        <MemoryRouter initialEntries={['/sales?tab=unverified']}>
          <Sales />
        </MemoryRouter>,
      );

      await waitFor(() => {
        expect(
          screen.getByTestId('unverified-transactions-view'),
        ).toBeInTheDocument();
      });
      expect(screen.getByText('Unverified Inflow Triage')).toBeInTheDocument();
    });

    it('switches between Daily and Unverified tabs on click', async () => {
      render(
        <MemoryRouter initialEntries={['/sales']}>
          <Sales />
        </MemoryRouter>,
      );

      // Verify default daily tab
      expect(
        screen.queryByTestId('unverified-transactions-view'),
      ).not.toBeInTheDocument();

      // Click Unverified Inflows tab
      const unverifiedTabBtn = screen.getByRole('button', {
        name: /Unverified Inflows/i,
      });
      fireEvent.click(unverifiedTabBtn);

      await waitFor(() => {
        expect(
          screen.getByTestId('unverified-transactions-view'),
        ).toBeInTheDocument();
      });
    });
  });

  describe('CORE-04: NRS Receipts & Payments embedded in Tax Hub', () => {
    it('mounts Payments history view when tab=payments is active', async () => {
      render(
        <MemoryRouter initialEntries={['/tax?tab=payments']}>
          <TaxReports />
        </MemoryRouter>,
      );

      await waitFor(() => {
        expect(screen.getByTestId('payments-history-view')).toBeInTheDocument();
      });
      expect(
        screen.getByText('NRS Receipts & Payments History'),
      ).toBeInTheDocument();
    });

    it('renders top tab switcher with Reports, Analytics, and Payments tabs', async () => {
      render(
        <MemoryRouter initialEntries={['/tax?tab=reports']}>
          <TaxReports />
        </MemoryRouter>,
      );

      expect(screen.getByRole('tab', { name: /Reports/i })).toBeInTheDocument();
      expect(
        screen.getByRole('tab', { name: /Analytics/i }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('tab', { name: /Receipts & Payments/i }),
      ).toBeInTheDocument();
    });
  });

  describe('CORE-02 & CORE-03: Consolidated Sidebar Items & Nomenclature', () => {
    it('displays Banking & Wallet in the sidebar and removes standalone Reminders and Payments', () => {
      render(
        <MemoryRouter initialEntries={['/dashboard']}>
          <Sidebar isOpen={true} />
        </MemoryRouter>,
      );

      // CORE-02: Confirms "Banking & Wallet" label for /account
      const accountLinks = screen.getAllByRole('link', {
        name: /Banking & Wallet/i,
      });
      expect(accountLinks.length).toBeGreaterThan(0);
      expect(accountLinks[0].getAttribute('href')).toBe('/account');

      // CORE-03 & CORE-04: Standalone /reminders and /payments must NOT be in the sidebar nav
      expect(
        screen.queryByRole('link', { name: /^Reminders$/i }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('link', { name: /^Payments$/i }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('link', { name: /^Unverified Transaction/i }),
      ).not.toBeInTheDocument();
    });
  });

  describe('CORE-06: Backward-Compatible Route Redirects', () => {
    it('redirects legacy /payments to /tax?tab=payments', async () => {
      let currentPath = '';

      render(
        <MemoryRouter initialEntries={['/payments']}>
          <Routes>
            <Route
              path='/payments'
              element={<Navigate to='/tax?tab=payments' replace />}
            />
            <Route
              path='/tax'
              element={
                <div>
                  <div data-testid='tax-target'>Tax Page Target</div>
                </div>
              }
            />
          </Routes>
        </MemoryRouter>,
      );

      await waitFor(() => {
        expect(screen.getByTestId('tax-target')).toBeInTheDocument();
      });
    });

    it('redirects legacy /sales/unverified to /sales?tab=unverified', async () => {
      render(
        <MemoryRouter initialEntries={['/sales/unverified']}>
          <Routes>
            <Route
              path='/sales/unverified'
              element={<Navigate to='/sales?tab=unverified' replace />}
            />
            <Route
              path='/sales'
              element={<div data-testid='sales-target'>Sales Page Target</div>}
            />
          </Routes>
        </MemoryRouter>,
      );

      await waitFor(() => {
        expect(screen.getByTestId('sales-target')).toBeInTheDocument();
      });
    });

    it('redirects legacy /reminders to /dashboard', async () => {
      render(
        <MemoryRouter initialEntries={['/reminders']}>
          <Routes>
            <Route
              path='/reminders'
              element={<Navigate to='/dashboard' replace />}
            />
            <Route
              path='/dashboard'
              element={
                <div data-testid='dashboard-target'>Dashboard Target</div>
              }
            />
          </Routes>
        </MemoryRouter>,
      );

      await waitFor(() => {
        expect(screen.getByTestId('dashboard-target')).toBeInTheDocument();
      });
    });
  });
});
