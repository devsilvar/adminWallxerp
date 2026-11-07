import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import WithdrawalsTable, { type PayoutItem } from '../WithdrawalsTable.tsx';

describe('WithdrawalsTable', () => {
  const mockPayouts: PayoutItem[] = [
    {
      id: 'payout-1',
      amount: 50000,
      fee: 100,
      netAmount: 49900,
      status: 'completed',
      initiatedAt: '2026-03-20T10:00:00Z',
      transferReference: 'TRF-9901',
      destinationBankName: 'Zenith Bank',
      destinationAccountNum: '1029384756',
      narration: 'Payout to Zenith Bank',
    },
    {
      id: 'payout-2',
      amount: 25000,
      fee: 50,
      netAmount: 24950,
      status: 'pending',
      initiatedAt: '2026-03-21T11:00:00Z',
      transferReference: 'TRF-9902',
      destinationBankName: 'GTBank',
      destinationAccountNum: '0129384756',
      narration: 'Payout to GTBank',
    },
  ];

  it('renders withdrawal items with bank and status badges', () => {
    render(
      <WithdrawalsTable
        payouts={mockPayouts}
        statusFilter="all"
      />
    );

    expect(screen.getByText('Payout to Zenith Bank')).toBeInTheDocument();
    expect(screen.getByText('Sent to Bank')).toBeInTheDocument();
    expect(screen.getByText('Queued')).toBeInTheDocument();
  });

  it('filters status when Sent filter chip is clicked', () => {
    const onFilterChange = vi.fn();
    render(
      <WithdrawalsTable
        payouts={mockPayouts}
        statusFilter="all"
        onStatusFilterChange={onFilterChange}
      />
    );

    const sentFilter = screen.getByRole('button', { name: /sent/i });
    fireEvent.click(sentFilter);

    expect(onFilterChange).toHaveBeenCalledWith('completed');
  });

  it('shows empty state when no payouts exist', () => {
    render(<WithdrawalsTable payouts={[]} />);
    expect(screen.getByTestId('withdrawals-empty-state')).toBeInTheDocument();
    expect(screen.getByText('No withdrawals yet')).toBeInTheDocument();
  });
});
