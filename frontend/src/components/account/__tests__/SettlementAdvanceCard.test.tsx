import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SettlementAdvanceCard from '../SettlementAdvanceCard.tsx';
import WithdrawalsTable, { type PayoutItem } from '../WithdrawalsTable.tsx';
import { useSettlementStore } from '@/stores/settlement.store.ts';

vi.mock('@/lib/axios', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

describe('Task 7.1 & 7.2: Settlement Advance Card & History Filter (One-Shot 30%)', () => {
  const mockBizId = 'biz-adv-test-1';

  beforeEach(() => {
    vi.clearAllMocks();
    useSettlementStore.setState({
      advancePreview: {
        pooledPending: 100000,
        maxAdvance: 30000,
        remainingPending: 70000,
        pendingSettlement: 100000,
        hasOutstandingAdvance: false,
        batchStartDate: '2026-10-01T10:00:00.000Z',
        fees: {
          advance: {
            pct: 1.0,
            cap: 500,
            maxPct: 30,
            minAmount: 1000,
          },
        },
        settlementAccount: {
          isConnected: true,
          bankName: 'Guaranty Trust Bank',
          bankCode: '058',
          accountNumber: '0123456789',
          accountName: 'TEST SME OWNER',
        },
        security: {
          hasPin: true,
          isPinLocked: false,
          remainingAttempts: 3,
        },
      },
      loadingAdvancePreview: false,
      requestingAdvance: false,
    });
  });

  it('renders pending inflows, max advance (30%), and remaining normal settlement', () => {
    render(
      <SettlementAdvanceCard
        businessId={mockBizId}
        isOwner={true}
        isLinked={true}
      />
    );

    expect(screen.getByText('Settlement Advance')).toBeInTheDocument();
    expect(screen.getByText('30% One-Shot')).toBeInTheDocument();

    // Inflows: 100,000 | Max: 30,000 | Normal: 70,000
    expect(screen.getByText('₦100,000.00')).toBeInTheDocument();
    expect(screen.getAllByText('₦30,000.00').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('₦70,000.00').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('settles normally')).toBeInTheDocument();
  });

  it('calculates 1% fee live and displays total wallet debit for 25,000', async () => {
    render(
      <SettlementAdvanceCard
        businessId={mockBizId}
        isOwner={true}
        isLinked={true}
      />
    );

    const input = screen.getByTestId('advance-amount-input');
    fireEvent.change(input, { target: { value: '25000' } });

    // Net: 25,000 | Fee: 250 (1% of 25k) | Total debit: 25,250
    expect(screen.getByTestId('advance-quote-box')).toBeInTheDocument();
    expect(screen.getByText('₦25,000.00')).toBeInTheDocument();
    expect(screen.getByText('+₦250.00')).toBeInTheDocument();
    expect(screen.getByText('₦25,250.00')).toBeInTheDocument();
  });

  it('caps the advance fee at ₦500 when fee exceeds cap', async () => {
    // Override maxAdvance to 60k to test cap
    useSettlementStore.setState({
      advancePreview: {
        ...useSettlementStore.getState().advancePreview!,
        maxAdvance: 60000,
        pooledPending: 200000,
      },
    });

    render(
      <SettlementAdvanceCard
        businessId={mockBizId}
        isOwner={true}
        isLinked={true}
      />
    );

    const input = screen.getByTestId('advance-amount-input');
    fireEvent.change(input, { target: { value: '55000' } });

    // 1% of 55,000 is 550, but capped at 500
    expect(screen.getByText('+₦500.00')).toBeInTheDocument();
    expect(screen.getByText('₦55,500.00')).toBeInTheDocument();
  });

  it('enforces mandatory checkbox consent and 4-digit PIN before enabling submit', async () => {
    const mockRequestAdvance = vi.fn().mockResolvedValue({ id: 'payout-adv-1' });
    useSettlementStore.setState({ requestAdvance: mockRequestAdvance });

    render(
      <SettlementAdvanceCard
        businessId={mockBizId}
        isOwner={true}
        isLinked={true}
      />
    );

    const submitBtn = screen.getByTestId('advance-submit-btn');
    expect(submitBtn).toBeDisabled();

    // 1. Enter amount
    fireEvent.change(screen.getByTestId('advance-amount-input'), { target: { value: '25000' } });
    expect(submitBtn).toBeDisabled();

    // 2. Check consent
    fireEvent.click(screen.getByTestId('advance-accept-charge-checkbox'));
    expect(submitBtn).toBeDisabled();

    // 3. Enter PIN (only 2 digits -> still disabled)
    fireEvent.change(screen.getByTestId('advance-pin-input'), { target: { value: '12' } });
    expect(submitBtn).toBeDisabled();

    // 4. Enter full 4 digits -> enabled
    fireEvent.change(screen.getByTestId('advance-pin-input'), { target: { value: '1234' } });
    expect(submitBtn).not.toBeDisabled();

    // 5. Submit form
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockRequestAdvance).toHaveBeenCalledWith(
        mockBizId,
        expect.objectContaining({
          amount: 25000,
          pin: '1234',
          acceptCharge: true,
        })
      );
    });
  });

  it('one-shot gate: disables form and displays banner when hasOutstandingAdvance is true', () => {
    useSettlementStore.setState({
      advancePreview: {
        ...useSettlementStore.getState().advancePreview!,
        hasOutstandingAdvance: true,
        remainingPending: 70000,
      },
    });

    render(
      <SettlementAdvanceCard
        businessId={mockBizId}
        isOwner={true}
        isLinked={true}
      />
    );

    // Banner must be visible with required text
    expect(screen.getByTestId('advance-already-taken-banner')).toBeInTheDocument();
    expect(screen.getByText(/Advance already taken for this batch/i)).toBeInTheDocument();
    expect(screen.getByText(/Remaining/i)).toBeInTheDocument();
    expect(screen.getByText(/settles on schedule/i)).toBeInTheDocument();

    // Form inputs must not be rendered
    expect(screen.queryByTestId('advance-amount-input')).not.toBeInTheDocument();
    expect(screen.queryByTestId('advance-submit-btn')).not.toBeInTheDocument();
  });

  it('renders ADV badge for advance payouts in WithdrawalsTable and triggers advance filter', () => {
    const onFilterChange = vi.fn();
    const payouts: PayoutItem[] = [
      {
        id: 'payout-norm-1',
        amount: 50000,
        fee: 100,
        netAmount: 49900,
        status: 'completed',
        initiatedAt: '2026-10-23T10:00:00Z',
        transferReference: 'TRF-1001',
        destinationBankName: 'Zenith Bank',
        destinationAccountNum: '1234567890',
        narration: 'Normal Payout',
        isAdvance: false,
      },
      {
        id: 'payout-adv-1',
        amount: 25250,
        fee: 250,
        netAmount: 25000,
        status: 'completed',
        initiatedAt: '2026-10-23T12:00:00Z',
        transferReference: 'ADV-20261023-9988',
        destinationBankName: 'GTBank',
        destinationAccountNum: '0123456789',
        narration: 'Settlement Advance Disbursal',
        isAdvance: true,
      },
    ];

    render(
      <WithdrawalsTable
        payouts={payouts}
        statusFilter="all"
        onStatusFilterChange={onFilterChange}
      />
    );

    // ADV badge must appear for payout-adv-1
    expect(screen.getByTestId('advance-badge')).toBeInTheDocument();
    expect(screen.getByText('ADV')).toBeInTheDocument();

    // Advances filter pill
    const advanceFilterBtn = screen.getByRole('button', { name: /advances \(adv\)/i });
    expect(advanceFilterBtn).toBeInTheDocument();

    fireEvent.click(advanceFilterBtn);
    expect(onFilterChange).toHaveBeenCalledWith('advance');
  });
});
