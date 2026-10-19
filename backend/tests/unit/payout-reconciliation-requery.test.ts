import { describe, test, expect, jest, beforeEach, afterAll } from '@jest/globals';
import { AppError } from '../../src/middleware/errorHandler';

const mockVerifyTransfer = jest.fn();
const mockPaymentProvider = { verifyTransfer: mockVerifyTransfer };

jest.mock('../../src/lib/payment', () => ({
  getPaymentProvider: () => mockPaymentProvider,
}));

jest.mock('../../src/services/wallet.service', () => ({
  WalletService: {
    settlePayoutDebit: jest.fn().mockResolvedValue({} as any),
    debitReleasedPayout: jest.fn().mockResolvedValue({} as any),
    releaseLockedFunds: jest.fn().mockResolvedValue({ success: true } as any),
  },
}));

jest.mock('../../src/core/events/event-bus', () => ({
  eventBus: { emit: jest.fn() },
}));

jest.mock('../../src/lib/audit', () => ({
  logAudit: jest.fn().mockResolvedValue(undefined as any),
}));

jest.mock('../../src/services/reminder.service', () => ({
  createReminderOnce: jest.fn().mockResolvedValue({ id: 'rem-1' } as any),
}));

jest.mock('../../src/services/reminder/reminder-generation.service', () => ({
  createReminderOnce: jest.fn().mockResolvedValue({ id: 'rem-1' } as any),
}));

import prisma from '../../src/lib/prisma';
import { eventBus } from '../../src/core/events/event-bus';
import { WalletService } from '../../src/services/wallet.service';
import { adminRequeryWithdrawal } from '../../src/modules/wallet/services/admin-payout.service';

const USER_ID = 'user-1';

function payout(overrides: Record<string, any> = {}) {
  return {
    id: 'payout-1',
    businessId: 'biz-1',
    amount: 30000,
    fee: 0,
    status: 'processing',
    transferReference: 'PO-20261003-1',
    paystackTransferCode: 'TRX_1',
    destinationBankName: 'Zenith Bank',
    initiatedAt: new Date(),
    business: { id: 'biz-1', userId: USER_ID, businessName: 'Acme Enterprises' },
    ...overrides,
  };
}

describe('QA-08: requery settles the wallet exactly once, whatever the prior status', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPaymentProvider.verifyTransfer = mockVerifyTransfer;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  test('a failed payout whose transfer actually settled still debits the wallet balance', async () => {
    // The hole: the payout failed, releaseLockedFunds handed the money back by
    // decrementing lockedBalance only, then Paystack confirms the transfer landed.
    // Gating the settle on wasPendingOrProcessing left the platform paying out
    // with no matching wallet debit.
    jest.spyOn(prisma.settlementPayout, 'findUnique').mockResolvedValue(payout({ status: 'failed' }) as any);
    jest.spyOn(prisma.settlementPayout, 'updateMany').mockResolvedValue({ count: 1 } as any);
    jest.spyOn(prisma.walletTransaction, 'findFirst').mockResolvedValue(null as any);

    mockVerifyTransfer.mockResolvedValue({ status: 'success' });

    const result = await adminRequeryWithdrawal('admin-1', 'payout-1');

    expect(result.status).toBe('completed');
    expect(WalletService.debitReleasedPayout).toHaveBeenCalledWith(
      expect.objectContaining({ userId: USER_ID, amount: 30000, linkedPayoutId: 'payout-1' })
    );
    // lockedBalance was already released — decrementing it again is what drives
    // a wallet negative, so the standard settle must not run.
    expect(WalletService.settlePayoutDebit).not.toHaveBeenCalled();
  });

  test('a processing payout requeried to success uses the standard settle (both counters)', async () => {
    jest.spyOn(prisma.settlementPayout, 'findUnique').mockResolvedValue(payout({ status: 'processing' }) as any);
    jest.spyOn(prisma.settlementPayout, 'updateMany').mockResolvedValue({ count: 1 } as any);
    jest.spyOn(prisma.walletTransaction, 'findFirst').mockResolvedValue(null as any);

    mockVerifyTransfer.mockResolvedValue({ status: 'success' });

    await adminRequeryWithdrawal('admin-1', 'payout-1');

    expect(WalletService.settlePayoutDebit).toHaveBeenCalledWith(
      expect.objectContaining({ userId: USER_ID, amount: 30000, linkedPayoutId: 'payout-1' })
    );
    expect(WalletService.debitReleasedPayout).not.toHaveBeenCalled();
  });

  test('does not settle again when a webhook already debited the payout', async () => {
    // settlePayoutDebit is not idempotent. A transfer.success webhook can settle
    // while the row is still 'processing'; a later admin requery must not debit twice.
    jest.spyOn(prisma.settlementPayout, 'findUnique').mockResolvedValue(payout({ status: 'processing' }) as any);
    jest.spyOn(prisma.settlementPayout, 'updateMany').mockResolvedValue({ count: 1 } as any);
    jest.spyOn(prisma.walletTransaction, 'findFirst').mockResolvedValue({ id: 'wtx-1' } as any);

    mockVerifyTransfer.mockResolvedValue({ status: 'success' });

    const result = await adminRequeryWithdrawal('admin-1', 'payout-1');

    expect(result.status).toBe('completed');
    expect(WalletService.settlePayoutDebit).not.toHaveBeenCalled();
    expect(WalletService.debitReleasedPayout).not.toHaveBeenCalled();
  });

  test('a concurrent claim that already completed the payout settles nothing', async () => {
    // updateMany count 0 means another worker won the race to 'completed'.
    jest.spyOn(prisma.settlementPayout, 'findUnique').mockResolvedValue(payout({ status: 'processing' }) as any);
    jest.spyOn(prisma.settlementPayout, 'updateMany').mockResolvedValue({ count: 0 } as any);
    const walletTxSpy = jest.spyOn(prisma.walletTransaction, 'findFirst');

    mockVerifyTransfer.mockResolvedValue({ status: 'success' });

    const result = await adminRequeryWithdrawal('admin-1', 'payout-1');

    expect(result.status).toBe('completed');
    expect(result.message).toContain('already marked completed');
    expect(WalletService.settlePayoutDebit).not.toHaveBeenCalled();
    expect(WalletService.debitReleasedPayout).not.toHaveBeenCalled();
    expect(walletTxSpy).not.toHaveBeenCalled();
    expect(eventBus.emit).not.toHaveBeenCalledWith('payout.completed', expect.anything());
  });

  test('a processing payout requeried to failed releases locked funds exactly once', async () => {
    jest.spyOn(prisma.settlementPayout, 'findUnique').mockResolvedValue(payout({ status: 'processing' }) as any);
    jest.spyOn(prisma.settlementPayout, 'update').mockResolvedValue({} as any);

    mockVerifyTransfer.mockResolvedValue({ status: 'failed', gatewayResponse: 'insufficient bank balance' });

    const result = await adminRequeryWithdrawal('admin-1', 'payout-1');

    expect(result.status).toBe('failed');
    expect(WalletService.releaseLockedFunds).toHaveBeenCalledTimes(1);
    expect(WalletService.settlePayoutDebit).not.toHaveBeenCalled();
    expect(WalletService.debitReleasedPayout).not.toHaveBeenCalled();
  });

  test('an already-failed payout does not release its funds a second time', async () => {
    // The first failure already returned the money by decrementing lockedBalance.
    // Releasing again would hand the merchant a second refund.
    jest.spyOn(prisma.settlementPayout, 'findUnique').mockResolvedValue(payout({ status: 'failed' }) as any);
    jest.spyOn(prisma.settlementPayout, 'update').mockResolvedValue({} as any);

    mockVerifyTransfer.mockResolvedValue({ status: 'failed', gatewayResponse: 'still failing' });

    const result = await adminRequeryWithdrawal('admin-1', 'payout-1');

    expect(result.status).toBe('failed');
    expect(WalletService.releaseLockedFunds).not.toHaveBeenCalled();
    expect(eventBus.emit).not.toHaveBeenCalledWith('payout.failed', expect.anything());
  });

  test('a payout whose business is missing never emits a payout.completed event', async () => {
    jest.spyOn(prisma.settlementPayout, 'findUnique').mockResolvedValue(
      payout({ business: null }) as any
    );
    jest.spyOn(prisma.settlementPayout, 'updateMany').mockResolvedValue({ count: 1 } as any);
    jest.spyOn(prisma.walletTransaction, 'findFirst').mockResolvedValue(null as any);

    mockVerifyTransfer.mockResolvedValue({ status: 'success' });

    await adminRequeryWithdrawal('admin-1', 'payout-1');

    expect(eventBus.emit).not.toHaveBeenCalledWith('payout.completed', expect.anything());
    expect(WalletService.debitReleasedPayout).not.toHaveBeenCalled();
    expect(WalletService.settlePayoutDebit).not.toHaveBeenCalled();
  });

  test('an already-completed payout short-circuits before calling Paystack', async () => {
    jest.spyOn(prisma.settlementPayout, 'findUnique').mockResolvedValue(payout({ status: 'completed' }) as any);
    const updateManySpy = jest.spyOn(prisma.settlementPayout, 'updateMany');

    const result = await adminRequeryWithdrawal('admin-1', 'payout-1');

    expect(result.status).toBe('completed');
    expect(mockVerifyTransfer).not.toHaveBeenCalled();
    expect(updateManySpy).not.toHaveBeenCalled();
  });
});