import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import WalletBalanceCard from '../WalletBalanceCard.tsx';

describe('WalletBalanceCard', () => {
  const defaultProps = {
    availableBalance: 250000.5,
    isLoading: false,
    isRefreshing: false,
    onRefresh: vi.fn(),
    onExportStatement: vi.fn(),
    onShareDetails: vi.fn(),
    dvaAccountNumber: '9920192831',
    dvaBankName: 'Wema Bank',
    accountName: 'ACME Supermarket',
    onShowQR: vi.fn(),
  };

  it('renders correctly and formats available balance in Naira', () => {
    render(<WalletBalanceCard {...defaultProps} />);

    const balanceEl = screen.getByTestId('balance-amount');
    expect(balanceEl).toBeInTheDocument();
    // Check that amount includes Naira formatting
    expect(balanceEl.textContent).toContain('250,000.50');
    expect(balanceEl.textContent).toMatch(/NGN|₦/);
  });

  it('toggles balance visibility when eye button is clicked', () => {
    render(<WalletBalanceCard {...defaultProps} />);

    const balanceEl = screen.getByTestId('balance-amount');
    expect(balanceEl.textContent).not.toBe('₦ ••••••••');

    // Click hide button
    const toggleBtn = screen.getByRole('button', { name: /hide balance/i });
    fireEvent.click(toggleBtn);

    expect(balanceEl.textContent).toBe('₦ ••••••••');

    // Click show button
    const showBtn = screen.getByRole('button', { name: /show balance/i });
    fireEvent.click(showBtn);

    expect(balanceEl.textContent).toContain('250,000.50');
  });

  it('calls onRefresh callback when refresh button is clicked', () => {
    const onRefresh = vi.fn();
    render(<WalletBalanceCard {...defaultProps} onRefresh={onRefresh} />);

    const refreshBtn = screen.getByRole('button', { name: /refresh balance/i });
    fireEvent.click(refreshBtn);

    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('calls onExportStatement when Statement button is clicked', () => {
    const onExportStatement = vi.fn();
    render(<WalletBalanceCard {...defaultProps} onExportStatement={onExportStatement} />);

    const statementBtn = screen.getByRole('button', { name: /statement/i });
    fireEvent.click(statementBtn);

    expect(onExportStatement).toHaveBeenCalledTimes(1);
  });

  it('renders embedded DVA card details', () => {
    render(<WalletBalanceCard {...defaultProps} />);

    expect(screen.getByTestId('dva-account-number').textContent).toBe('9920192831');
    expect(screen.getByTestId('dva-account-name').textContent).toBe('ACME Supermarket');
    expect(screen.getByText('Wema Bank')).toBeInTheDocument();
  });

  it('shows loading skeleton when isLoading is true', () => {
    render(<WalletBalanceCard {...defaultProps} isLoading={true} />);

    expect(screen.getByTestId('balance-loading')).toBeInTheDocument();
    expect(screen.queryByTestId('balance-amount')).not.toBeInTheDocument();
  });
});
