import { describe, it, expect, beforeEach, jest } from '@jest/globals';

// ─── Mocks ───────────────────────────────────────────────────

const mockVerifyBusinessAccess = jest.fn();
jest.mock('@/lib/ownership', () => ({
  verifyBusinessAccess: mockVerifyBusinessAccess,
}));

const mockGetWithdrawalActor = jest.fn();
jest.mock('@/shared/helpers', () => {
  const actual: any = jest.requireActual('@/shared/helpers');
  return {
    ...actual,
    getWithdrawalActor: mockGetWithdrawalActor,
  };
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
    }),
  },
}));

jest.mock('@/modules/wallet/services/daily-payout-cap.service', () => ({
  getDailyPayoutAllowance: jest.fn().mockResolvedValue({
    dailyLimit: 5000000,
    alreadyPaidOut: 0,
    remaining: 5000000,
  }),
}));

const mockPrisma = {
  business: {
    findMany: jest.fn(),
  },
  salesTransaction: {
    aggregate: jest.fn(),
    count: jest.fn(),
  },
  expense: {
    aggregate: jest.fn(),
  },
  settlementPayout: {
    aggregate: jest.fn(),
  },
  monthlyTaxReport: {
    findMany: jest.fn(),
  },
  businessTaxProfile: {
    findUnique: jest.fn(),
  },
  walletTransaction: {
    aggregate: jest.fn(),
  },
};

jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: mockPrisma,
}));

import { getPayoutPreview } from '@/services/settlement/payout-preview.service';
import config from '@/config';

describe('getPayoutPreview — Tax Reserve & Policy Enforcement (Phase 10)', () => {
  const userId = 'usr_test_payout';
  const businessId = 'biz_test_payout';

  const mockActor = {
    id: businessId,
    userId,
    businessName: 'Apex Retail Ltd',
    user: {
      id: userId,
      settlementBankCode: '058',
      settlementBankName: 'GTBank',
      settlementAccountNumber: '0123456789',
      settlementAccountName: 'Apex Retail',
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    config.tax.defaultRate = 7.5;

    mockVerifyBusinessAccess.mockResolvedValue({
      business: { id: businessId, userId },
      role: 'owner',
    });

    mockGetWithdrawalActor.mockResolvedValue(mockActor);

    // Default 1 business for user
    (mockPrisma.business.findMany as any).mockResolvedValue([{ id: businessId }]);

    // Default inflows: 1,000,000 settled DVA inflows, 0 settling
    (mockPrisma.salesTransaction.aggregate as any).mockImplementation((args: any) => {
      // Inflow aggregations
      if (args.where?.walletTx?.isNot !== undefined) {
        return Promise.resolve({ _sum: { amount: 1_000_000 } });
      }
      if (args.where?.walletTx === null) {
        return Promise.resolve({ _sum: { amount: 0 } });
      }
      // Qualified taxable sales aggregation
      if (args.where?.isTaxable === true) {
        return Promise.resolve({ _sum: { amount: 800_000 } });
      }
      // Fee cap aggregations
      return Promise.resolve({ _sum: { amount: 0, platformRetained: 0 } });
    });

    (mockPrisma.salesTransaction.count as any).mockResolvedValue(0);

    // Default withdrawals: 0
    (mockPrisma.settlementPayout.aggregate as any).mockResolvedValue({
      _sum: { amount: 0 },
    });

    // Default expenses: 300,000 deductible
    (mockPrisma.expense.aggregate as any).mockResolvedValue({
      _sum: { amount: 300_000 },
    });

    // No outstanding settlement advance by default
    (mockPrisma.walletTransaction.aggregate as any).mockResolvedValue({
      _sum: { amount: 0, netAmount: 0 },
    });
  });

  it('exempt business => taxReserve is strictly 0 (even with taxable sales and gross profit)', async () => {
    // Mock a completed VAT-exempt tax profile
    (mockPrisma.businessTaxProfile.findUnique as any).mockResolvedValue({
      completedAt: new Date(),
      computedConfig: {
        vatExempt: true,
        mustChargeVat: false,
        citRate: 0,
        incomeTaxType: 'CIT',
      },
    });

    // No unpaid monthly reports
    (mockPrisma.monthlyTaxReport.findMany as any).mockResolvedValue([]);

    const preview = await getPayoutPreview(userId, businessId);

    // Gross profit is 800,000 - 300,000 = 500,000
    // But since business is exempt, taxReserve must be 0
    expect(preview.taxReserve).toBe(0);
    // Withdrawable amount should equal platform-held funds (1,000,000)
    expect(preview.availableForWithdrawal).toBe(1_000_000);
  });

  it('FTZ exempt business => taxReserve is 0', async () => {
    (mockPrisma.businessTaxProfile.findUnique as any).mockResolvedValue({
      completedAt: new Date(),
      computedConfig: {
        isFtzExempt: true,
        vatExempt: true,
        mustChargeVat: false,
        citRate: 0,
      },
    });

    (mockPrisma.monthlyTaxReport.findMany as any).mockResolvedValue([]);

    const preview = await getPayoutPreview(userId, businessId);

    expect(preview.taxReserve).toBe(0);
  });

  it('standard VAT-chargeable business => calculates statutory tax reserve when no unpaid reports', async () => {
    // Standard VAT-charging business profile
    (mockPrisma.businessTaxProfile.findUnique as any).mockResolvedValue({
      completedAt: new Date(),
      computedConfig: {
        vatExempt: false,
        mustChargeVat: true,
        citRate: 0,
      },
    });

    (mockPrisma.monthlyTaxReport.findMany as any).mockResolvedValue([]);

    const preview = await getPayoutPreview(userId, businessId);

    // Sales = 800,000, Expenses = 300,000 => Gross Profit = 500,000
    // Tax Reserve = 500,000 * 7.5% = 37,500
    expect(preview.taxReserve).toBe(37500);
    // Crucial: taxReserve does NOT subtract from availableForWithdrawal
    expect(preview.availableForWithdrawal).toBe(1_000_000);
  });

  it('unpaid finalized reports exist => sums report.taxPayable directly', async () => {
    (mockPrisma.businessTaxProfile.findUnique as any).mockResolvedValue({
      completedAt: new Date(),
      computedConfig: {
        vatExempt: false,
        mustChargeVat: true,
      },
    });

    // Two unpaid reports
    (mockPrisma.monthlyTaxReport.findMany as any).mockResolvedValue([
      { id: 'rep_1', taxPayable: 25000 },
      { id: 'rep_2', taxPayable: 15000 },
    ]);

    const preview = await getPayoutPreview(userId, businessId);

    expect(preview.taxReserve).toBe(40000);
    expect(preview.availableForWithdrawal).toBe(1_000_000);
  });

  it('expenses exceed sales => taxReserve is 0 (floored at zero, never negative)', async () => {
    (mockPrisma.businessTaxProfile.findUnique as any).mockResolvedValue({
      completedAt: new Date(),
      computedConfig: {
        vatExempt: false,
        mustChargeVat: true,
      },
    });

    (mockPrisma.monthlyTaxReport.findMany as any).mockResolvedValue([]);

    // Expenses exceed sales
    (mockPrisma.expense.aggregate as any).mockResolvedValue({
      _sum: { amount: 1_200_000 },
    });

    const preview = await getPayoutPreview(userId, businessId);

    expect(preview.taxReserve).toBe(0);
  });

  it('business with no profile => falls back to default policy rate', async () => {
    (mockPrisma.businessTaxProfile.findUnique as any).mockResolvedValue(null);
    (mockPrisma.monthlyTaxReport.findMany as any).mockResolvedValue([]);

    const preview = await getPayoutPreview(userId, businessId);

    // 500,000 * 7.5% = 37,500
    expect(preview.taxReserve).toBe(37500);
  });
});
