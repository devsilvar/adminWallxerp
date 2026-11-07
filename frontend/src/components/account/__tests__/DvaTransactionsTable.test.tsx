import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import DvaTransactionsTable, { type DvaTransactionItem } from '../DvaTransactionsTable.tsx';

describe('DvaTransactionsTable', () => {
  const mockTransactions: DvaTransactionItem[] = [
    {
      id: 'txn-1',
      amount: 45000,
      type: 'inbound',
      status: 'completed',
      description: 'Transfer from Jane Doe',
      date: '2026-03-15T10:00:00Z',
      referenceId: 'REF-1001',
      needsVerification: false,
    },
    {
      id: 'txn-2',
      amount: 12000,
      type: 'inbound',
      status: 'pending',
      description: 'Transfer from John Smith',
      date: '2026-03-16T12:00:00Z',
      referenceId: 'REF-1002',
      needsVerification: true,
    },
  ];

  it('renders rows with amounts and statuses', () => {
    render(
      <DvaTransactionsTable
        transactions={mockTransactions}
        onSelectTransaction={vi.fn()}
      />
    );

    expect(screen.getByText('Transfer from Jane Doe')).toBeInTheDocument();
    expect(screen.getByText('Transfer from John Smith')).toBeInTheDocument();
    expect(screen.getByText('Review')).toBeInTheDocument();
  });

  it('filters transactions when Settled chip is clicked', () => {
    render(
      <DvaTransactionsTable
        transactions={mockTransactions}
        onSelectTransaction={vi.fn()}
      />
    );

    const settledFilter = screen.getByRole('button', { name: /settled/i });
    fireEvent.click(settledFilter);

    expect(screen.getByText('Transfer from Jane Doe')).toBeInTheDocument();
    expect(screen.queryByText('Transfer from John Smith')).not.toBeInTheDocument();
  });

  it('dispatches onSelectTransaction on row click', () => {
    const onSelect = vi.fn();
    render(
      <DvaTransactionsTable
        transactions={mockTransactions}
        onSelectTransaction={onSelect}
      />
    );

    const row = screen.getByTestId('inflow-row-txn-1');
    fireEvent.click(row);

    expect(onSelect).toHaveBeenCalledWith(mockTransactions[0]);
  });
});
