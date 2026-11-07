import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import SettlementBankCard from '../SettlementBankCard.tsx';

describe('SettlementBankCard', () => {
  const linkedProps = {
    isLinked: true,
    bankName: 'Access Bank',
    accountNumber: '0123456789',
    accountName: 'ACME Supermarket Ltd',
    availableBalance: 150000,
    pendingWithdrawn: 20000,
    autoSplitEnabled: false,
    updatingAutoSplit: false,
    onWithdraw: vi.fn(),
    onToggleAutoSplit: vi.fn(),
  };

  it('shows connected bank name and masked account number', () => {
    render(<SettlementBankCard {...linkedProps} />);

    expect(screen.getByTestId('linked-badge')).toBeInTheDocument();
    expect(screen.getByTestId('settlement-account-name').textContent).toBe('ACME Supermarket Ltd');
    expect(screen.getByTestId('settlement-account-details').textContent).toContain('Access Bank · •••• 6789');
  });

  it('shows locked notice for security', () => {
    render(<SettlementBankCard {...linkedProps} />);

    expect(screen.getByTestId('payout-bank-lock-notice')).toBeInTheDocument();
    expect(screen.getByText('Bank Account Locked')).toBeInTheDocument();
  });

  it('shows pending withdrawal reservation alert when pendingWithdrawn > 0', () => {
    render(<SettlementBankCard {...linkedProps} />);

    const alertEl = screen.getByTestId('pending-withdrawal-alert');
    expect(alertEl).toBeInTheDocument();
    expect(alertEl.textContent).toContain('20,000.00');
    expect(alertEl.textContent).toContain("withdrawal that's in flight");
  });

  it.skip('calls onToggleAutoSplit when the auto-split switch is clicked (toggle disabled in UI)', () => {
    const onToggle = vi.fn();
    render(<SettlementBankCard {...linkedProps} onToggleAutoSplit={onToggle} />);

    const toggleBtn = screen.getByTestId('auto-split-toggle');
    fireEvent.click(toggleBtn);

    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('calls onWithdraw when Withdraw Funds button is clicked', () => {
    const onWithdraw = vi.fn();
    render(<SettlementBankCard {...linkedProps} onWithdraw={onWithdraw} />);

    const withdrawBtn = screen.getByRole('button', { name: /withdraw funds/i });
    fireEvent.click(withdrawBtn);

    expect(onWithdraw).toHaveBeenCalledTimes(1);
  });

  it('renders Connect Bank prompt when not linked', () => {
    render(
      <SettlementBankCard
        isLinked={false}
        availableBalance={0}
      />
    );

    expect(screen.queryByTestId('linked-badge')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /connect bank/i })).toBeInTheDocument();
  });
});
