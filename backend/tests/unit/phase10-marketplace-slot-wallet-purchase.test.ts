import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { Prisma } from '@prisma/client';
import express from 'express';
import request from 'supertest';

const mockPrisma: any = {
  business: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  walletBalance: {
    findUnique: jest.fn(),
    update: jest.fn(),
    create: jest.fn(),
  },
  walletTransaction: {
    create: jest.fn(),
    findUnique: jest.fn(),
  },
  marketplaceSlotPurchase: {
    findUnique: jest.fn(),
    create: jest.fn(),
  },
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
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('../../src/lib/audit', () => ({
  __esModule: true,
  logAudit: jest.fn(),
}));

const mockVerifyBusinessAccess = jest.fn();
jest.mock('../../src/lib/ownership', () => ({
  __esModule: true,
  verifyBusinessAccess: (...args: any[]) => mockVerifyBusinessAccess(...args),
}));

const mockGetOrCreateWallet = jest.fn();
jest.mock('../../src/services/wallet/wallet.service', () => ({
  __esModule: true,
  WalletService: {
    getOrCreateWallet: (...args: any[]) => mockGetOrCreateWallet(...args),
  },
}));

const mockSendEmail = jest.fn();
jest.mock('../../src/lib/email', () => ({
  __esModule: true,
  sendEmail: (...args: any[]) => mockSendEmail(...args),
}));

import {
  purchaseSlotsViaWallet,
  dispatchSlotPurchaseReceiptEmail,
  TX_OPTIONS,
} from '../../src/services/marketplace/marketplace-slots.service';
import { purchaseSlots } from '../../src/controllers/marketplace.controller';
import { errorHandler } from '../../src/middleware/errorHandler';
import { logAudit } from '../../src/lib/audit';
import logger from '../../src/lib/logger';
import config from '../../src/config';

describe('Phase 10: Marketplace Slot Purchase (Wallet Path)', () => {
  const userId = 'usr-owner-123';
  const businessId = 'biz-fashion-456';
  const ownerEmail = 'merchant@example.com';
  const ownerFullName = 'Amina Bello';

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.$transaction.mockImplementation(async (cb: any) => cb(mockPrisma));

    // Ensure slot price is set in test config
    config.marketplace.slotUnitPrice = 1000;

    mockVerifyBusinessAccess.mockResolvedValue({
      business: {
        id: businessId,
        userId,
        businessName: 'Amina Couture',
        marketplaceSlotAllowance: 3,
        user: {
          id: userId,
          email: ownerEmail,
          fullName: ownerFullName,
        },
      },
      role: 'owner',
    });

    mockGetOrCreateWallet.mockResolvedValue({
      id: 'wallet-1',
      userId,
      balance: new Prisma.Decimal(10000),
      lockedBalance: new Prisma.Decimal(0),
    });

    mockPrisma.walletBalance.findUnique.mockResolvedValue({
      id: 'wallet-1',
      userId,
      balance: new Prisma.Decimal(10000),
      lockedBalance: new Prisma.Decimal(0),
      version: 1,
    });

    mockPrisma.walletBalance.update.mockResolvedValue({
      id: 'wallet-1',
      userId,
      balance: new Prisma.Decimal(8000),
      version: 2,
    });

    mockPrisma.walletTransaction.create.mockResolvedValue({
      id: 'wtx-slot-1',
      walletId: 'wallet-1',
      userId,
      businessId,
      type: 'debit',
      amount: new Prisma.Decimal(2000),
      netAmount: new Prisma.Decimal(-2000),
      balanceAfter: new Prisma.Decimal(8000),
      reference: 'WTX-SLOT-TEST',
      source: 'marketplace_slot',
    });

    mockPrisma.business.update.mockResolvedValue({
      id: businessId,
      businessName: 'Amina Couture',
      marketplaceSlotAllowance: 5,
      user: {
        id: userId,
        email: ownerEmail,
        fullName: ownerFullName,
      },
    });

    mockPrisma.marketplaceSlotPurchase.findUnique.mockResolvedValue(null);
    mockPrisma.marketplaceSlotPurchase.create.mockResolvedValue({
      id: 'slot-pur-1',
      businessId,
      slots: 2,
      unitPrice: new Prisma.Decimal(1000),
      amount: new Prisma.Decimal(2000),
      status: 'active',
      paidVia: 'wallet',
      walletTxRef: 'WTX-SLOT-TEST',
      purchasedBy: userId,
      createdAt: new Date(),
    });

    mockSendEmail.mockResolvedValue({ delivered: true, id: 'msg-email-123' });
  });

  describe('Validation & Guards', () => {
    it('rejects non-positive and non-integer slot numbers with 400 INVALID_SLOTS', async () => {
      await expect(
        purchaseSlotsViaWallet({ userId, businessId, slots: 0 })
      ).rejects.toThrow('Slots must be a positive integer');

      await expect(
        purchaseSlotsViaWallet({ userId, businessId, slots: -3 })
      ).rejects.toThrow('Slots must be a positive integer');

      await expect(
        purchaseSlotsViaWallet({ userId, businessId, slots: 2.5 })
      ).rejects.toThrow('Slots must be a positive integer');
    });

    it('rejects access if verifyBusinessAccess throws permission error', async () => {
      mockVerifyBusinessAccess.mockRejectedValueOnce(new Error('Permission denied'));

      await expect(
        purchaseSlotsViaWallet({ userId: 'other-user', businessId, slots: 1 })
      ).rejects.toThrow('Permission denied');

      expect(mockPrisma.walletBalance.update).not.toHaveBeenCalled();
      expect(mockPrisma.business.update).not.toHaveBeenCalled();
    });

    it('fails closed with 503 when slot pricing is not configured (0/negative/non-finite)', async () => {
      config.marketplace.slotUnitPrice = 0;
      await expect(
        purchaseSlotsViaWallet({ userId, businessId, slots: 1 })
      ).rejects.toMatchObject({
        statusCode: 503,
        code: 'SLOT_PRICING_NOT_CONFIGURED',
      });

      config.marketplace.slotUnitPrice = -500;
      await expect(
        purchaseSlotsViaWallet({ userId, businessId, slots: 1 })
      ).rejects.toMatchObject({
        statusCode: 503,
        code: 'SLOT_PRICING_NOT_CONFIGURED',
      });

      config.marketplace.slotUnitPrice = Number.NaN;
      await expect(
        purchaseSlotsViaWallet({ userId, businessId, slots: 1 })
      ).rejects.toMatchObject({
        statusCode: 503,
        code: 'SLOT_PRICING_NOT_CONFIGURED',
      });

      expect(mockPrisma.walletBalance.update).not.toHaveBeenCalled();
      expect(mockPrisma.business.update).not.toHaveBeenCalled();
      expect(mockPrisma.marketplaceSlotPurchase.create).not.toHaveBeenCalled();
      expect(mockSendEmail).not.toHaveBeenCalled();
    });
  });

  describe('Wallet Debit & Allowance Increment Flow', () => {
    it('successfully debits the wallet and increments allowance by slots purchased', async () => {
      const result = await purchaseSlotsViaWallet({
        userId,
        businessId,
        slots: 2,
      });

      expect(result.alreadyProcessed).toBe(false);
      expect(result.newAllowance).toBe(5);
      expect(result.purchase.slots).toBe(2);

      // Verify wallet row lock was executed
      expect(mockPrisma.$queryRaw).toHaveBeenCalled();

      // Verify balance was decremented by amount = 2 * 1000 = 2000
      expect(mockPrisma.walletBalance.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId },
          data: expect.objectContaining({
            balance: { decrement: new Prisma.Decimal(2000) },
            version: { increment: 1 },
          }),
        })
      );

      // Verify wallet ledger row created with correct debit parameters
      expect(mockPrisma.walletTransaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'debit',
            source: 'marketplace_slot',
            businessId,
            netAmount: new Prisma.Decimal(-2000),
          }),
        })
      );

      // Verify business advisory lock was executed
      expect(mockPrisma.$executeRaw).toHaveBeenCalled();

      // Verify business slot allowance incremented by 2
      expect(mockPrisma.business.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: businessId },
          data: {
            marketplaceSlotAllowance: { increment: 2 },
          },
        })
      );

      // Verify audit log written within transaction
      expect(logAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'marketplace.slots_purchased',
          resourceType: 'marketplace_slot_purchase',
          userId,
          businessId,
        }),
        mockPrisma
      );

      // Verify email receipt was dispatched post-transaction
      expect(mockSendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: ownerEmail,
          subject: expect.stringContaining('+2 Listing Slots Unlocked'),
        })
      );
    });

    it('rejects purchase with 402 INSUFFICIENT_WALLET_BALANCE if balance is too low', async () => {
      // Wallet only has 500 available, but 2 slots cost 2000
      mockPrisma.walletBalance.findUnique.mockResolvedValueOnce({
        id: 'wallet-1',
        userId,
        balance: new Prisma.Decimal(500),
        lockedBalance: new Prisma.Decimal(0),
        version: 1,
      });

      let err: any;
      try {
        await purchaseSlotsViaWallet({ userId, businessId, slots: 2 });
      } catch (e: any) {
        err = e;
      }

      expect(err).toBeDefined();
      expect(err.statusCode).toBe(402);
      expect(err.code).toBe('INSUFFICIENT_WALLET_BALANCE');

      // Neither wallet nor business allowance may be modified
      expect(mockPrisma.walletBalance.update).not.toHaveBeenCalled();
      expect(mockPrisma.business.update).not.toHaveBeenCalled();
      expect(mockPrisma.marketplaceSlotPurchase.create).not.toHaveBeenCalled();
      expect(mockSendEmail).not.toHaveBeenCalled();
    });

    it('respects locked balance when calculating available funds', async () => {
      // Wallet has 2000 balance but 1500 locked -> available is only 500
      mockPrisma.walletBalance.findUnique.mockResolvedValueOnce({
        id: 'wallet-1',
        userId,
        balance: new Prisma.Decimal(2000),
        lockedBalance: new Prisma.Decimal(1500),
        version: 1,
      });

      await expect(
        purchaseSlotsViaWallet({ userId, businessId, slots: 1 }) // 1 slot = 1000 > 500 available
      ).rejects.toMatchObject({
        statusCode: 402,
        code: 'INSUFFICIENT_WALLET_BALANCE',
      });

      expect(mockPrisma.walletBalance.update).not.toHaveBeenCalled();
    });
  });

  describe('Idempotency & Concurrency Guards', () => {
    it('returns existing purchase when duplicate idempotencyKey is queried beforehand', async () => {
      const existingPurchase = {
        id: 'slot-pur-existing',
        businessId,
        slots: 2,
        amount: new Prisma.Decimal(2000),
        status: 'active',
        idempotencyKey: 'slot-idemp-12345',
        business: {
          id: businessId,
          businessName: 'Amina Couture',
          marketplaceSlotAllowance: 5,
        },
      };

      mockPrisma.marketplaceSlotPurchase.findUnique.mockResolvedValueOnce(existingPurchase);

      const result = await purchaseSlotsViaWallet({
        userId,
        businessId,
        slots: 2,
        idempotencyKey: 'slot-idemp-12345',
      });

      expect(result.alreadyProcessed).toBe(true);
      expect(result.purchase.id).toBe('slot-pur-existing');
      expect(result.newAllowance).toBe(5);

      // No new transaction or balance decrement
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
      expect(mockPrisma.walletBalance.update).not.toHaveBeenCalled();
      expect(mockSendEmail).not.toHaveBeenCalled();
    });

    it('catches Prisma P2002 conflict and recovers cleanly with existing purchase', async () => {
      // 1. Initial fast-path check finds nothing (concurrent race condition)
      mockPrisma.marketplaceSlotPurchase.findUnique.mockResolvedValueOnce(null);

      // 2. Transaction attempts to insert and collides on unique idempotency_key constraint
      mockPrisma.$transaction.mockImplementationOnce(async () => {
        const p2002Error: any = new Error('Unique constraint failed on idempotencyKey');
        p2002Error.code = 'P2002';
        p2002Error.meta = { target: ['idempotency_key'] };
        throw p2002Error;
      });

      // 3. Catch block re-queries and retrieves the winner's committed record
      mockPrisma.marketplaceSlotPurchase.findUnique.mockResolvedValueOnce({
        id: 'slot-pur-recovered',
        businessId,
        slots: 2,
        amount: new Prisma.Decimal(2000),
        status: 'active',
        idempotencyKey: 'slot-race-key',
        business: {
          marketplaceSlotAllowance: 5,
        },
      });

      const result = await purchaseSlotsViaWallet({
        userId,
        businessId,
        slots: 2,
        idempotencyKey: 'slot-race-key',
      });

      expect(result.alreadyProcessed).toBe(true);
      expect(result.purchase.id).toBe('slot-pur-recovered');
      expect(result.newAllowance).toBe(5);
    });

    it('recovers from P2002 via wallet idempotency key when slot purchase lookup misses', async () => {
      mockPrisma.marketplaceSlotPurchase.findUnique
        .mockResolvedValueOnce(null) // fast-path
        .mockResolvedValueOnce(null) // P2002 recovery by slot idempotency key
        .mockResolvedValueOnce({
          id: 'slot-pur-wallet-recovered',
          businessId,
          slots: 2,
          amount: new Prisma.Decimal(2000),
          status: 'active',
          idempotencyKey: 'slot-race-key',
          business: { marketplaceSlotAllowance: 5 },
        });
      mockPrisma.walletTransaction.findUnique.mockResolvedValueOnce({
        reference: 'WTX-SLOT-RECOVERED',
      });

      mockPrisma.$transaction.mockImplementationOnce(async () => {
        const p2002Error: any = new Error('Unique constraint failed');
        p2002Error.code = 'P2002';
        p2002Error.meta = { target: ['idempotency_key'] };
        throw p2002Error;
      });

      const result = await purchaseSlotsViaWallet({
        userId,
        businessId,
        slots: 2,
        idempotencyKey: 'slot-race-key',
      });

      expect(result.alreadyProcessed).toBe(true);
      expect(result.purchase.id).toBe('slot-pur-wallet-recovered');
      expect(mockPrisma.walletTransaction.findUnique).toHaveBeenCalledWith({
        where: { idempotencyKey: 'slot-wallet:slot-race-key' },
        select: { reference: true },
      });
      expect(mockPrisma.marketplaceSlotPurchase.findUnique).toHaveBeenLastCalledWith({
        where: { walletTxRef: 'WTX-SLOT-RECOVERED' },
        include: {
          business: {
            select: {
              marketplaceSlotAllowance: true,
            },
          },
        },
      });
    });
  });

  describe('Isolation & Receipts', () => {
    it('uses dedicated TX_OPTIONS with explicit timeout and maxWait', () => {
      expect(TX_OPTIONS).toEqual({
        maxWait: 15000,
        timeout: 30000,
      });
    });

    it('gracefully handles receipt email failure without failing the transaction', async () => {
      mockSendEmail.mockRejectedValueOnce(new Error('Resend network timeout'));

      const emailResult = await dispatchSlotPurchaseReceiptEmail({
        toEmail: ownerEmail,
        ownerName: ownerFullName,
        businessName: 'Amina Couture',
        slots: 1,
        unitPrice: 1000,
        amount: 1000,
        reference: 'WTX-TEST-FAIL',
        newAllowance: 4,
      });

      expect(emailResult).toEqual({ delivered: false });
    });
  });

  describe('Controller: purchaseSlots (HTTP)', () => {
    let app: express.Express;

    beforeEach(() => {
      mockPrisma.$transaction.mockImplementation(async (cb: any) => cb(mockPrisma));
      mockPrisma.marketplaceSlotPurchase.findUnique.mockResolvedValue(null);
      app = express();
      app.use(express.json());
      app.use((req: any, _res, next) => {
        req.user = { userId };
        next();
      });
      app.post('/businesses/:businessId/marketplace/slots', purchaseSlots);
      app.use(errorHandler);
    });

    it('POST returns 201 on successful purchase', async () => {
      const res = await request(app)
        .post(`/businesses/${businessId}/marketplace/slots`)
        .send({ slots: 2 });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.newAllowance).toBe(5);
    });

    it('POST returns 200 when purchase is already processed with idempotencyKey', async () => {
      mockPrisma.marketplaceSlotPurchase.findUnique.mockResolvedValueOnce({
        id: 'slot-pur-prev',
        businessId,
        slots: 2,
        amount: new Prisma.Decimal(2000),
        status: 'active',
        idempotencyKey: 'idemp-hdr-123',
        business: { marketplaceSlotAllowance: 5 },
      });

      const res = await request(app)
        .post(`/businesses/${businessId}/marketplace/slots`)
        .set('Idempotency-Key', 'idemp-hdr-123')
        .send({ slots: 2 });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.alreadyProcessed).toBe(true);
    });

    it('POST returns 402 with INSUFFICIENT_WALLET_BALANCE when wallet funds are short', async () => {
      mockPrisma.walletBalance.findUnique.mockResolvedValueOnce({
        id: 'wallet-1',
        userId,
        balance: new Prisma.Decimal(100),
        lockedBalance: new Prisma.Decimal(0),
        version: 1,
      });

      const res = await request(app)
        .post(`/businesses/${businessId}/marketplace/slots`)
        .send({ slots: 2 });

      expect(res.status).toBe(402);
      expect(res.body.error.code).toBe('INSUFFICIENT_WALLET_BALANCE');
    });

    it('POST returns 400 when slots count is invalid', async () => {
      const res = await request(app)
        .post(`/businesses/${businessId}/marketplace/slots`)
        .send({ slots: 0 });

      expect(res.status).toBe(400);
    });
  });
});
