import { describe, it, expect, beforeEach, jest } from '@jest/globals';

// ─── Mocks ───────────────────────────────────────────────────

const mockVerifyBusinessAccess = jest.fn();
jest.mock('@/lib/ownership', () => ({
  verifyBusinessAccess: mockVerifyBusinessAccess,
}));

const mockGetWithdrawalActor = jest.fn();
jest.mock('@/shared/helpers', () => {
  const actual: any = jest.requireActual('@/shared/helpers');
  return { ...actual, getWithdrawalActor: mockGetWithdrawalActor };
});

jest.mock('@/lib/payout-lock', () => ({
  getPayoutLockStatus: jest.fn().mockReturnValue({ isLocked: false }),
}));

jest.mock('@/services/platform-config.service', () => ({
  PlatformConfigService: {
    getFeeConfig: jest.fn().mockResolvedValue({
      withdrawalFeePct: 0,
      withdrawalFeeCap: 0,
      minWithdrawalAmount: 100,
      advanceFeePct: 1,
      advanceFeeCap: 500,
      maxAdvancePct: 30,
      minAdvanceAmount: 1000,
    }),
  },
}));

jest.mock('@/modules/wallet/services/daily-payout-cap.service', () => ({
  getDailyPayoutAllowance: jest.fn().mockResolvedValue({
    dailyLimit: 5_000_000,
    alreadyPaidOut: 0,
    remaining: 5_000_000,
  }),
}));

const mockPrisma = {
  business: { findMany: jest.fn() },
  salesTransaction: { aggregate: jest.fn(), count: jest.fn() },
  expense: { aggregate: jest.fn() },
  settlementPayout: { aggregate: jest.fn(), findFirst: jest.fn() },
  monthlyTaxReport: { findMany: jest.fn() },
  businessTaxProfile: { findUnique: jest.fn() },
  walletTransaction: { aggregate: jest.fn() },
};

jest.mock('@/lib/prisma', () => ({ __esModule: true, default: mockPrisma }));

import { getPayoutPreview } from '@/services/settlement/payout-preview.service';

const SETTLED_INFLOWS = 1_900;
const PENDING_INFLOWS = 450;

describe('settlement advance netting', () => {
  const userId = 'usr_advance';
  const businessId = 'biz_advance';

  const mockActor = {
    id: businessId,
    userId,
    businessName: 'Findme',
    user: {
      id: userId,
      settlementBankCode: '058',
      settlementBankName: 'GTBank',
      settlementAccountNumber: '0123456789',
      settlementAccountName: 'Findme',
    },
  };

  /** Stubs the settlementPayout aggregates used by getPayoutPreview. */
  const stubPayouts = (opts: { legacyAdvanceGross: number }) => {
    (mockPrisma.settlementPayout.aggregate as any).mockImplementation((args: any) => {
      // The legacy-advance lookup is the only one that filters on walletTx.
      if (args.where?.isAdvance === true && args.where?.walletTx) {
        return Promise.resolve({ _sum: { amount: opts.legacyAdvanceGross } });
      }
      return Promise.resolve({ _sum: { amount: 0 } });
    });
  };

  /** Stubs the wallet ledger aggregates behind getOutstandingAdvance. */
  const stubAdvanceLedger = (opts: { creditedGross: number; creditedNet: number }) => {
    (mockPrisma.walletTransaction.aggregate as any).mockImplementation((args: any) => {
      if (args.where?.source === 'settlement_advance') {
        return Promise.resolve({
          _sum: { amount: opts.creditedGross, netAmount: opts.creditedNet },
        });
      }
      // settlement_advance_recovery
      return Promise.resolve({ _sum: { amount: 0, netAmount: 0 } });
    });
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockVerifyBusinessAccess.mockResolvedValue({
      business: { id: businessId, userId },
      role: 'owner',
    });
    mockGetWithdrawalActor.mockResolvedValue(mockActor);

    (mockPrisma.business.findMany as any).mockResolvedValue([{ id: businessId }]);

    (mockPrisma.salesTransaction.aggregate as any).mockImplementation((args: any) => {
      if (args.where?.walletTx?.isNot !== undefined) {
        return Promise.resolve({ _sum: { amount: SETTLED_INFLOWS } });
      }
      if (args.where?.walletTx === null) {
        return Promise.resolve({ _sum: { amount: PENDING_INFLOWS } });
      }
      return Promise.resolve({ _sum: { amount: 0 } });
    });

    (mockPrisma.salesTransaction.count as any).mockResolvedValue(0);
    (mockPrisma.expense.aggregate as any).mockResolvedValue({ _sum: { amount: 0 } });
    (mockPrisma.monthlyTaxReport.findMany as any).mockResolvedValue([]);
    (mockPrisma.businessTaxProfile.findUnique as any).mockResolvedValue(null);
    (mockPrisma.settlementPayout.findFirst as any).mockResolvedValue(null);
  });

  it('bank-fulfilled advance leaves settlement untouched and deducts it from the spendable balance', async () => {
    stubPayouts({ legacyAdvanceGross: 101 });
    stubAdvanceLedger({ creditedGross: 0, creditedNet: 0 });

    const preview = await getPayoutPreview(userId, businessId);

    // The ₦101 already left the wallet as a bank transfer, so the maturing
    // inflow is still owed in full — netting it here would pay it out twice.
    expect(preview.pendingSettlement).toBe(PENDING_INFLOWS);
    expect(preview.pooledPendingSettlement).toBe(PENDING_INFLOWS);
    expect(preview.outstandingAdvance).toBe(0);

    // ...but the cash is gone, so the spendable balance must reflect it.
    expect(preview.legacyAdvanceWithdrawn).toBe(101);
    expect(preview.availableForWithdrawal).toBe(SETTLED_INFLOWS - 101);
  });

  it('wallet-credited advance reduces the settlement and adds the net to the spendable balance', async () => {
    stubPayouts({ legacyAdvanceGross: 0 });
    stubAdvanceLedger({ creditedGross: 101, creditedNet: 100 });

    const preview = await getPayoutPreview(userId, businessId);

    // ₦101 was drawn against the pending batch and recovered when it matures.
    expect(preview.outstandingAdvance).toBe(101);
    expect(preview.pendingSettlement).toBe(PENDING_INFLOWS - 101);
    expect(preview.pooledPendingSettlement).toBe(PENDING_INFLOWS - 101);
    expect(preview.grossPendingSettlement).toBe(PENDING_INFLOWS);
    expect(preview.grossPooledPendingSettlement).toBe(PENDING_INFLOWS);

    // The merchant holds the net advance in the wallet, so it stays spendable.
    expect(preview.legacyAdvanceWithdrawn).toBe(0);
    expect(preview.availableForWithdrawal).toBe(SETTLED_INFLOWS + 100);
  });

  it('never reports a negative settlement when the advance exceeds the pending batch', async () => {
    stubPayouts({ legacyAdvanceGross: 0 });
    stubAdvanceLedger({ creditedGross: 5_000, creditedNet: 4_950 });

    const preview = await getPayoutPreview(userId, businessId);

    expect(preview.pendingSettlement).toBe(0);
    expect(preview.pooledPendingSettlement).toBe(0);
    expect(preview.grossPendingSettlement).toBe(PENDING_INFLOWS);
  });
});
