import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import WithdrawalsTable, { type PayoutItem } from '../WithdrawalsTable';
import PayoutDetailPanel from '../PayoutDetailPanel';
import SettlementBankCard from '../SettlementBankCard';

const mockPayouts: PayoutItem[] = [
  {
    id: 'payout-001',
    amount: 50000,
    fee: 150,
    netAmount: 49850,
    status: 'completed',
    initiatedAt: '2026-10-01T06:00:00.000Z',
    completedAt: '2026-10-01T06:05:00.000Z',
    transferReference: 'PO-20261001-A1B2C3',
    destinationBankName: 'GTBank',
    destinationAccountNum: '0123456789',
    destinationAccountName: 'ACME TRADING LTD',
    narration: 'Payout to GTBank',
    failureReason: null,
  },
  {
    id: 'payout-002',
    amount: 15000,
    fee: 50,
    netAmount: 14950,
    status: 'pending',
    initiatedAt: '2026-10-01T07:00:00.000Z',
    completedAt: null,
    transferReference: 'PO-20261001-D4E5F6',
    destinationBankName: 'Access Bank',
    destinationAccountNum: '9876543210',
    destinationAccountName: 'ACME TRADING LTD',
    narration: 'Mid-week inventory withdrawal',
    failureReason: null,
  },
  {
    id: 'payout-003',
    amount: 25000,
    fee: 100,
    netAmount: 24900,
    status: 'failed',
    initiatedAt: '2026-09-30T10:00:00.000Z',
    completedAt: null,
    transferReference: 'PO-20260930-G7H8I9',
    destinationBankName: 'Zenith Bank',
    destinationAccountNum: '1122334455',
    destinationAccountName: 'ACME TRADING LTD',
    narration: 'Operational expense sweep',
    failureReason: 'Account number does not exist at destination bank',
  },
];

describe('Withdrawal UI & Auto-Payout Component Tests', () => {
  describe('WithdrawalsTable (Card Feed Layout)', () => {
    it('renders withdrawal items as responsive cards without horizontal table headers', () => {
      render(
        <WithdrawalsTable
          payouts={mockPayouts}
          isLoading={false}
        />
      );

      // Verify table title
      expect(screen.getByText('Withdrawals History')).toBeDefined();

      // Verify each card shows its narration and formatted gross amount
      expect(screen.getByText('Payout to GTBank')).toBeDefined();
      expect(screen.getByText('Mid-week inventory withdrawal')).toBeDefined();
      expect(screen.getByText('Operational expense sweep')).toBeDefined();

      // Verify status pills
      expect(screen.getByText('Sent to Bank')).toBeDefined();
      expect(screen.getByText('Queued')).toBeDefined();
      expect(screen.getByText('Failed')).toBeDefined();

      // Verify View Details action indicator is rendered
      const detailButtons = screen.getAllByText(/View Details/i);
      expect(detailButtons.length).toBe(3);
    });

    it('triggers onSelectPayout when a payout card is clicked', () => {
      const handleSelectPayout = vi.fn();
      render(
        <WithdrawalsTable
          payouts={mockPayouts}
          onSelectPayout={handleSelectPayout}
        />
      );

      const firstRow = screen.getByTestId('payout-row-payout-001');
      fireEvent.click(firstRow);

      expect(handleSelectPayout).toHaveBeenCalledTimes(1);
      expect(handleSelectPayout).toHaveBeenCalledWith(mockPayouts[0]);
    });
  });

  describe('PayoutDetailPanel (Comprehensive Slide-Over)', () => {
    it('renders complete financial breakdown, bank destination, and reference', () => {
      const handleClose = vi.fn();
      render(
        <PayoutDetailPanel
          isOpen={true}
          onClose={handleClose}
          payout={mockPayouts[0]}
        />
      );

      expect(screen.getByTestId('payout-detail-panel')).toBeDefined();
      expect(screen.getByText('Withdrawal Details')).toBeDefined();
      expect(screen.getAllByText('PO-20261001-A1B2C3').length).toBeGreaterThan(0);

      // Recipient details
      expect(screen.getByText('ACME TRADING LTD')).toBeDefined();
      expect(screen.getByText('0123456789')).toBeDefined();

      // Financial breakdown
      expect(screen.getByText('Financial Breakdown')).toBeDefined();
      expect(screen.getByText('Net Remitted to Bank:')).toBeDefined();

      // Close button
      const closeButtons = screen.getAllByRole('button', { name: /close/i });
      expect(closeButtons.length).toBeGreaterThan(0);
      fireEvent.click(closeButtons[0]);
      expect(handleClose).toHaveBeenCalled();
    });

    it('displays bank rejection callout when payout status is failed', () => {
      render(
        <PayoutDetailPanel
          isOpen={true}
          onClose={vi.fn()}
          payout={mockPayouts[2]}
        />
      );

      expect(screen.getByText('Bank Rejection Details')).toBeDefined();
      expect(screen.getByText('Account number does not exist at destination bank')).toBeDefined();
    });
  });

  describe('SettlementBankCard (Auto-Payout Toggle)', () => {
    it('renders Automatic Payout (T+1) toggle switch with Automatic badge when enabled', () => {
      const handleToggle = vi.fn();
      render(
        <SettlementBankCard
          isLinked={true}
          bankName="GTBank"
          accountNumber="0123456789"
          accountName="ACME TRADING LTD"
          availableBalance={125000}
          autoPayoutEnabled={true}
          onToggleAutoPayout={handleToggle}
        />
      );

      expect(screen.getByText('Automatic Payouts (T+1)')).toBeDefined();
      const badge = screen.getByTestId('auto-payout-mode-badge');
      expect(badge.textContent).toBe('Automatic');

      const toggleBtn = screen.getByTestId('auto-payout-toggle');
      fireEvent.click(toggleBtn);
      expect(handleToggle).toHaveBeenCalledTimes(1);
    });

    it('renders Manual badge when auto-payout is disabled', () => {
      render(
        <SettlementBankCard
          isLinked={true}
          bankName="GTBank"
          accountNumber="0123456789"
          accountName="ACME TRADING LTD"
          availableBalance={125000}
          autoPayoutEnabled={false}
          onToggleAutoPayout={vi.fn()}
        />
      );

      const badge = screen.getByTestId('auto-payout-mode-badge');
      expect(badge.textContent).toBe('Manual');
    });
  });
});
