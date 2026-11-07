import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { Prisma } from '@prisma/client';

const mockPrisma: any = {
  business: { findUnique: jest.fn(), update: jest.fn() },
  walletBalance: { findUnique: jest.fn(), update: jest.fn(), create: jest.fn() },
  walletTransaction: { create: jest.fn(), findUnique: jest.fn() },
  marketplaceSlotPurchase: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  marketplaceProduct: { count: jest.fn() },
  $executeRaw: jest.fn(),
  $queryRaw: jest.fn(),
  $transaction: jest.fn(async (cb: any) => cb(mockPrisma)),
};

jest.mock('../../src/lib/prisma', () => ({
  __esModule: true,
  prisma: mockPrisma,
  default: mockPrisma,
}));
jest.mock('../../src/lib/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
const mockLogAudit = jest.fn();
jest.mock('../../src/lib/audit', () => ({
  __esModule: true,
  logAudit: (...args: any[]) => mockLogAudit(...args),
}));
const mockVerifyBusinessAccess = jest.fn();
jest.mock('../../src/lib/ownership', () => ({
  __esModule: true,
  verifyBusinessAccess: (...args: any[]) => mockVerifyBusinessAccess(...args),
}));
const mockCreditWallet = jest.fn();
jest.mock('../../src/services/wallet/wallet.service', () => ({
  __esModule: true,
  WalletService: {
    creditWallet: (...args: any[]) => mockCreditWallet(...args),
    getOrCreateWallet: jest.fn(),
  },
}));
jest.mock('../../src/lib/email', () => ({
  __esModule: true,
  sendEmail: jest.fn(async () => ({ delivered: false })),
}));

import {
  submitSlotProof,
  listAdminSlotPurchases,
  approveSlotProof,
  rejectSlotProof,
  refundSlotPurchase,
} from '../../src/services/marketplace/marketplace-slots.service';

describe('Phase 11 non-happy-path guards (service-level)', () => {
  const dummyUser = { id: 'usr-owner-001', email: 'merchant@test.com', fullName: 'Test Merchant' };
  const dummyBusiness = {
    id: 'biz-123',
    userId: dummyUser.id,
    businessName: 'Lagos Trends',
    marketplaceSlotAllowance: 3,
    user: dummyUser,
  };
  const sampleFile = {
    originalname: 'r.jpg',
    buffer: Buffer.from('x'),
    mimetype: 'image/jpeg',
    size: 10,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.$transaction.mockImplementation(async (cb: any) => cb(mockPrisma));
    mockVerifyBusinessAccess.mockResolvedValue({ business: dummyBusiness, userRole: 'owner' });
    mockPrisma.business.findUnique.mockResolvedValue(dummyBusiness);
    mockPrisma.marketplaceProduct.count.mockResolvedValue(0);
    mockCreditWallet.mockResolvedValue({ alreadyProcessed: false });
  });

  it('submitSlotProof: missing file => PROOF_REQUIRED, no access check, no persist', async () => {
    await expect(
      submitSlotProof({ userId: 'u', businessId: 'biz-123', slots: 1, file: undefined as any })
    ).rejects.toMatchObject({ statusCode: 400, code: 'PROOF_REQUIRED' });
    expect(mockVerifyBusinessAccess).not.toHaveBeenCalled();
    expect(mockPrisma.marketplaceSlotPurchase.create).not.toHaveBeenCalled();
  });

  it('submitSlotProof: wrong business / no access => 403 bubbles, no persist, no allowance change', async () => {
    const { AppError } = await import('../../src/middleware/errorHandler');
    mockVerifyBusinessAccess.mockRejectedValue(new AppError(403, 'Forbidden', 'FORBIDDEN'));
    await expect(
      submitSlotProof({ userId: 'intruder', businessId: 'biz-123', slots: 1, file: sampleFile })
    ).rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });
    expect(mockPrisma.marketplaceSlotPurchase.create).not.toHaveBeenCalled();
    expect(mockPrisma.business.update).not.toHaveBeenCalled();
  });

  it('submitSlotProof: negative/fractional slots => INVALID_SLOTS, no persist', async () => {
    await expect(
      submitSlotProof({ userId: 'u', businessId: 'biz-123', slots: -1, file: sampleFile })
    ).rejects.toMatchObject({ statusCode: 400, code: 'INVALID_SLOTS' });
    await expect(
      submitSlotProof({ userId: 'u', businessId: 'biz-123', slots: 1.2 as any, file: sampleFile })
    ).rejects.toMatchObject({ statusCode: 400, code: 'INVALID_SLOTS' });
    expect(mockPrisma.marketplaceSlotPurchase.create).not.toHaveBeenCalled();
  });

  it('submitSlotProof: bad MIME / oversized => 400, no persist', async () => {
    await expect(
      submitSlotProof({
        userId: 'u',
        businessId: 'biz-123',
        slots: 1,
        file: { ...sampleFile, mimetype: 'text/html' },
      })
    ).rejects.toMatchObject({ statusCode: 400, code: 'BAD_FILE_TYPE' });
    await expect(
      submitSlotProof({
        userId: 'u',
        businessId: 'biz-123',
        slots: 1,
        file: { ...sampleFile, size: 11 * 1024 * 1024 },
      })
    ).rejects.toMatchObject({ statusCode: 400, code: 'FILE_TOO_LARGE' });
    expect(mockPrisma.marketplaceSlotPurchase.create).not.toHaveBeenCalled();
  });

  it('submitSlotProof: creates pending_proof + audits; never updates allowance/wallet', async () => {
    mockPrisma.marketplaceSlotPurchase.create.mockResolvedValue({
      id: 'p1',
      status: 'pending_proof',
      paidVia: 'proof',
      business: dummyBusiness,
    });
    const r = await submitSlotProof({
      userId: dummyUser.id,
      businessId: 'biz-123',
      slots: 2,
      file: sampleFile,
    });
    expect(r.purchase.status).toBe('pending_proof');
    expect(mockPrisma.business.update).not.toHaveBeenCalled();
    expect(mockCreditWallet).not.toHaveBeenCalled();
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'marketplace.slot_proof_submitted' })
    );
  });

  it('listAdminSlotPurchases: clamps paging; FIFO asc for pending_proof, desc otherwise', async () => {
    mockPrisma.marketplaceSlotPurchase.count.mockResolvedValue(0);
    mockPrisma.marketplaceSlotPurchase.findMany.mockResolvedValue([]);
    await listAdminSlotPurchases({ status: 'pending_proof', page: 0, limit: 5000 } as any);
    expect(mockPrisma.marketplaceSlotPurchase.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 0, take: 100, orderBy: { createdAt: 'asc' } })
    );
    mockPrisma.marketplaceSlotPurchase.findMany.mockClear();
    await listAdminSlotPurchases({ status: 'active', page: 2, limit: 10 } as any);
    expect(mockPrisma.marketplaceSlotPurchase.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 10, take: 10, orderBy: { createdAt: 'desc' } })
    );
  });

  it('approveSlotProof: 404 when missing', async () => {
    mockPrisma.marketplaceSlotPurchase.findUnique.mockResolvedValue(null);
    await expect(approveSlotProof({ adminUserId: 'a', purchaseId: 'x' })).rejects.toMatchObject({
      statusCode: 404,
      code: 'PURCHASE_NOT_FOUND',
    });
  });

  it('approveSlotProof: refuses active/rejected/refunded (no allowance increment)', async () => {
    for (const status of ['active', 'rejected', 'refunded']) {
      jest.clearAllMocks();
      mockPrisma.$transaction.mockImplementation(async (cb: any) => cb(mockPrisma));
      mockPrisma.marketplaceSlotPurchase.findUnique.mockResolvedValue({
        id: 'p',
        businessId: 'biz-123',
        slots: 2,
        status,
        amount: new Prisma.Decimal(1),
        unitPrice: new Prisma.Decimal(1),
        business: dummyBusiness,
      });
      await expect(approveSlotProof({ adminUserId: 'a', purchaseId: 'p' })).rejects.toMatchObject({
        statusCode: 409,
        code: 'PROOF_ALREADY_PROCESSED',
      });
      expect(mockPrisma.business.update).not.toHaveBeenCalled();
    }
  });

  it('approveSlotProof: tx re-check catches mid-flight status change (no increment)', async () => {
    mockPrisma.marketplaceSlotPurchase.findUnique
      .mockResolvedValueOnce({
        id: 'p',
        businessId: 'biz-123',
        slots: 2,
        status: 'pending_proof',
        amount: new Prisma.Decimal(1),
        unitPrice: new Prisma.Decimal(1),
        business: dummyBusiness,
      })
      .mockResolvedValueOnce({ id: 'p', status: 'rejected' });
    await expect(approveSlotProof({ adminUserId: 'a', purchaseId: 'p' })).rejects.toMatchObject({
      statusCode: 409,
      code: 'PROOF_ALREADY_PROCESSED',
    });
    expect(mockPrisma.business.update).not.toHaveBeenCalled();
  });

  it('rejectSlotProof: mandatory reason (empty/short/whitespace) => 400, no update', async () => {
    await expect(
      rejectSlotProof({ adminUserId: 'a', purchaseId: 'p', reason: '' })
    ).rejects.toMatchObject({ statusCode: 400, code: 'REASON_REQUIRED' });
    await expect(
      rejectSlotProof({ adminUserId: 'a', purchaseId: 'p', reason: ' ab ' })
    ).rejects.toMatchObject({ statusCode: 400, code: 'REASON_REQUIRED' });
    expect(mockPrisma.marketplaceSlotPurchase.findUnique).not.toHaveBeenCalled();
  });

  it('rejectSlotProof: refuses non-pending; tx re-check guards race; allowance unchanged', async () => {
    mockPrisma.marketplaceSlotPurchase.findUnique.mockResolvedValue({
      id: 'p',
      businessId: 'biz-123',
      status: 'active',
    });
    await expect(
      rejectSlotProof({ adminUserId: 'a', purchaseId: 'p', reason: 'nope' })
    ).rejects.toMatchObject({ statusCode: 409, code: 'PROOF_ALREADY_PROCESSED' });

    jest.clearAllMocks();
    mockPrisma.$transaction.mockImplementation(async (cb: any) => cb(mockPrisma));
    mockPrisma.marketplaceSlotPurchase.findUnique
      .mockResolvedValueOnce({ id: 'p', businessId: 'biz-123', status: 'pending_proof' })
      .mockResolvedValueOnce({ id: 'p', status: 'active' });
    await expect(
      rejectSlotProof({ adminUserId: 'a', purchaseId: 'p', reason: 'race' })
    ).rejects.toMatchObject({ statusCode: 409, code: 'PROOF_ALREADY_PROCESSED' });
    expect(mockPrisma.marketplaceSlotPurchase.update).not.toHaveBeenCalled();
    expect(mockPrisma.business.update).not.toHaveBeenCalled();
  });

  it('refundSlotPurchase: refuses non-active statuses', async () => {
    for (const status of ['pending_proof', 'rejected', 'refunded']) {
      jest.clearAllMocks();
      mockPrisma.marketplaceSlotPurchase.findUnique.mockResolvedValue({
        id: 'p',
        status,
        businessId: 'biz-123',
        slots: 1,
        amount: new Prisma.Decimal(1),
        business: dummyBusiness,
      });
      await expect(refundSlotPurchase({ adminUserId: 'a', purchaseId: 'p' })).rejects.toMatchObject({
        statusCode: 400,
        code: 'CANNOT_REFUND_INACTIVE_PURCHASE',
      });
      expect(mockCreditWallet).not.toHaveBeenCalled();
    }
  });

  it('refundSlotPurchase: fast floor blocks (allowance-slots < live) with NO tx/credit', async () => {
    mockPrisma.marketplaceSlotPurchase.findUnique.mockResolvedValue({
      id: 'p',
      businessId: 'biz-123',
      slots: 2,
      amount: new Prisma.Decimal(5),
      status: 'active',
      business: { ...dummyBusiness, marketplaceSlotAllowance: 3 },
    });
    mockPrisma.marketplaceProduct.count.mockResolvedValue(2);
    await expect(refundSlotPurchase({ adminUserId: 'a', purchaseId: 'p' })).rejects.toMatchObject({
      statusCode: 409,
      code: 'ALLOWANCE_BELOW_LIVE_COUNT',
    });
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(mockCreditWallet).not.toHaveBeenCalled();
  });

  it('refundSlotPurchase: tx-time floor violation (race) blocks credit/decrement', async () => {
    mockPrisma.marketplaceSlotPurchase.findUnique
      .mockResolvedValueOnce({
        id: 'p',
        businessId: 'biz-123',
        slots: 1,
        amount: new Prisma.Decimal(1),
        status: 'active',
        business: { ...dummyBusiness, marketplaceSlotAllowance: 2 },
      })
      .mockResolvedValueOnce({ id: 'p', status: 'active', slots: 1, amount: new Prisma.Decimal(1) });
    mockPrisma.business.findUnique.mockResolvedValue({
      marketplaceSlotAllowance: 2,
      userId: dummyUser.id,
    });
    mockPrisma.marketplaceProduct.count.mockResolvedValueOnce(0).mockResolvedValueOnce(2);
    await expect(refundSlotPurchase({ adminUserId: 'a', purchaseId: 'p' })).rejects.toMatchObject({
      statusCode: 409,
      code: 'ALLOWANCE_BELOW_LIVE_COUNT',
    });
    expect(mockPrisma.business.update).not.toHaveBeenCalled();
    expect(mockCreditWallet).not.toHaveBeenCalled();
  });

  it('refundSlotPurchase: status flips inside tx => PURCHASE_NOT_ACTIVE, no side effects', async () => {
    mockPrisma.marketplaceSlotPurchase.findUnique
      .mockResolvedValueOnce({
        id: 'p',
        businessId: 'biz-123',
        slots: 1,
        amount: new Prisma.Decimal(1),
        status: 'active',
        business: { ...dummyBusiness, marketplaceSlotAllowance: 5 },
      })
      .mockResolvedValueOnce({ id: 'p', status: 'refunded' });
    mockPrisma.marketplaceProduct.count.mockResolvedValue(0);
    await expect(refundSlotPurchase({ adminUserId: 'a', purchaseId: 'p' })).rejects.toMatchObject({
      statusCode: 409,
      code: 'PURCHASE_NOT_ACTIVE',
    });
    expect(mockCreditWallet).not.toHaveBeenCalled();
  });
});
