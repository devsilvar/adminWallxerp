import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import AdminTransactions from '../AdminTransactions';
import api from '@/lib/axios';

vi.mock('@/lib/axios', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
  },
  getErrorMessage: vi.fn(() => 'Request failed'),
}));

vi.mock('react-hot-toast', () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

const inflowRow = {
  id: 'sale-001',
  sourceType: 'inflow' as const,
  direction: 'in' as const,
  date: '2026-10-01T08:00:00.000Z',
  businessId: 'biz-001',
  businessName: 'Apex Logistics Ltd',
  merchantId: 'PMTW0000001',
  userEmail: 'owner@apex.test',
  reference: 'TRF-001',
  status: 'confirmed',
  amount: 60000,
  fee: 0,
  netAmount: 60000,
  counterparty: 'Acme Customer',
  description: 'DVA transfer',
  needsVerification: false,
  destinationBankName: null,
  destinationAccountNum: null,
  failureReason: null,
};

const withdrawalRow = {
  id: 'po-001',
  sourceType: 'withdrawal' as const,
  direction: 'out' as const,
  date: '2026-10-02T09:00:00.000Z',
  businessId: 'biz-002',
  businessName: 'Kano Supermart',
  merchantId: 'PMTW0000002',
  userEmail: 'owner@kano.test',
  reference: 'PO-20261002-A1B2',
  status: 'pending',
  amount: 50000,
  fee: 250,
  netAmount: 49750,
  counterparty: 'KANO SUPERMART',
  description: 'Treasury withdrawal',
  needsVerification: false,
  destinationBankName: 'Guaranty Trust Bank',
  destinationAccountNum: '0123456789',
  failureReason: null,
};

const taxRow = {
  id: 'tx-001',
  sourceType: 'tax' as const,
  direction: 'out' as const,
  date: '2026-10-03T10:00:00.000Z',
  businessId: 'biz-003',
  businessName: 'Delta Foods',
  merchantId: 'PMTW0000003',
  userEmail: 'owner@delta.test',
  reference: 'TAX-REF-001',
  status: 'completed',
  amount: 25000,
  fee: 0,
  netAmount: 25000,
  counterparty: null,
  description: 'bank_transfer',
  needsVerification: false,
  destinationBankName: null,
  destinationAccountNum: null,
  failureReason: null,
};

const allRows = [inflowRow, withdrawalRow, taxRow];

describe('AdminTransactions UI Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // React Router's setSearchParams pushes onto the real jsdom URL — reset it
    // so one test's filter doesn't seed the next test's initial source state.
    window.history.replaceState({}, '', '/');
    (api.get as any).mockImplementation((url: string) => {
      if (url.includes('/admin/transactions')) {
        const rows = url.includes('source=withdrawal')
          ? [withdrawalRow]
          : url.includes('source=inflow')
            ? [inflowRow]
            : allRows;
        const totalIn = rows.filter((r) => r.direction === 'in').reduce((s, r) => s + r.amount, 0);
        const totalOut = rows.filter((r) => r.direction === 'out').reduce((s, r) => s + r.amount, 0);
        return Promise.resolve({
          data: {
            success: true,
            data: rows,
            summary: { totalIn, totalOut, net: totalIn - totalOut },
            pagination: {
              page: 1,
              limit: 20,
              total: rows.length,
              totalPages: 1,
              hasNext: false,
              hasPrev: false,
            },
          },
        });
      }
      return Promise.resolve({ data: {} });
    });
  });

  it('renders all three money-movement sources in a table with a summary strip', async () => {
    render(
      <BrowserRouter>
        <AdminTransactions />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Apex Logistics Ltd')).toBeDefined();
      expect(screen.getByText('Kano Supermart')).toBeDefined();
      expect(screen.getByText('Delta Foods')).toBeDefined();
    });

    // Real table markup, not stacked cards
    expect(screen.getAllByRole('row').length).toBeGreaterThan(3);

    // Source labels per row
    expect(screen.getByText('Inflow')).toBeDefined();
    expect(screen.getByText('Withdrawal')).toBeDefined();
    expect(screen.getByText('Tax Payment')).toBeDefined();

    // Signed amounts by direction
    expect(screen.getByText('+₦60,000')).toBeDefined();
    expect(screen.getByText('−₦25,000')).toBeDefined();

    // Summary strip
    expect(screen.getByText('Money In')).toBeDefined();
    expect(screen.getByText('Money Out')).toBeDefined();
    expect(screen.getByText('Net')).toBeDefined();
    expect(screen.getByText('₦60,000')).toBeDefined(); // totalIn
    expect(screen.getByText('₦75,000')).toBeDefined(); // totalOut (50k + 25k)
  });

  it('refetches with source=withdrawal when the Withdrawals filter is clicked', async () => {
    render(
      <BrowserRouter>
        <AdminTransactions />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Apex Logistics Ltd')).toBeDefined();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Withdrawals' }));

    await waitFor(() => {
      expect(screen.getByText('Kano Supermart')).toBeDefined();
      expect(screen.queryByText('Apex Logistics Ltd')).toBeNull();
      expect(screen.queryByText('Delta Foods')).toBeNull();
    });

    const txnCalls = (api.get as any).mock.calls.filter((c: string[]) =>
      c[0].includes('/admin/transactions')
    );
    expect(txnCalls.some((c: string[]) => c[0].includes('source=withdrawal'))).toBe(true);
  });

  it('opens a read-only detail modal from the Details button', async () => {
    render(
      <BrowserRouter>
        <AdminTransactions />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Apex Logistics Ltd')).toBeDefined();
    });

    fireEvent.click(screen.getAllByText(/^Details$/)[0]);

    await waitFor(() => {
      expect(screen.getByText('Transaction Details')).toBeDefined();
      expect(screen.getByText('Acme Customer')).toBeDefined();
      expect(screen.getByText('Amount received')).toBeDefined();
      expect(screen.getByText('owner@apex.test')).toBeDefined();
    });
  });
});
