import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { Prisma } from '@prisma/client';
import express from 'express';
import request from 'supertest';
import multer from 'multer';

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
    findMany: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  marketplaceProduct: {
    count: jest.fn(),
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

const mockCreditWallet = jest.fn();
jest.mock('../../src/services/wallet/wallet.service', () => ({
  __esModule: true,
  WalletService: {
    creditWallet: (...args: any[]) => mockCreditWallet(...args),
    getOrCreateWallet: jest.fn(),
  },
}));

const mockSendEmail = jest.fn();
jest.mock('../../src/lib/email', () => ({
  __esModule: true,
  sendEmail: (...args: any[]) => mockSendEmail(...args),
}));

import {
  submitSlotProof,
  listAdminSlotPurchases,
  approveSlotProof,
  rejectSlotProof,
  refundSlotPurchase,
} from '../../src/services/marketplace/marketplace-slots.service';
import { submitSlotProof as submitSlotProofController } from '../../src/controllers/marketplace.controller';
import {
  listSlotPurchases as listSlotPurchasesAdmin,
  approveSlotProof as approveSlotProofAdmin,
  rejectSlotProof as rejectSlotProofAdmin,
  refundSlotPurchase as refundSlotPurchaseAdmin,
} from '../../src/controllers/marketplace-admin.controller';
import { errorHandler, AppError } from '../../src/middleware/errorHandler';

describe('Phase 11 — Marketplace Slot Purchase (Proof Path) + Admin Moderation', () => {
  const dummyUser = { id: 'usr-owner-001', email: 'merchant@test.com', fullName: 'Test Merchant' };
  const dummyBusiness = {
    id: 'biz-123',
    userId: dummyUser.id,
    businessName: 'Lagos Trends',
    marketplaceSlotAllowance: 3,
    user: dummyUser,
  };

  const sampleFile = {
    originalname: 'transfer-receipt.jpg',
    buffer: Buffer.from('fake-jpeg-binary-data'),
    mimetype: 'image/jpeg',
    size: 1024,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.$transaction.mockImplementation(async (cb: any) => cb(mockPrisma));
    mockVerifyBusinessAccess.mockResolvedValue({ business: dummyBusiness, userRole: 'owner' });
    mockPrisma.business.findUnique.mockResolvedValue(dummyBusiness);
    mockPrisma.marketplaceProduct.count.mockResolvedValue(0);
    mockCreditWallet.mockResolvedValue({ alreadyProcessed: false });
  });

  describe('1. Merchant Proof Submission (submitSlotProof)', () => {
    it('creates purchase with status pending_proof and does not alter slot allowance', async () => {
      const mockCreated = {
        id: 'slot-pur-001',
        businessId: 'biz-123',
        slots: 2,
        unitPrice: new Prisma.Decimal(2500),
        amount: new Prisma.Decimal(5000),
        status: 'pending_proof',
        paidVia: 'proof',
        proofUrl: 'data:image/jpeg;base64,ZmFrZS1qcGVnLWJpbmFyeS1kYXRh',
        purchasedBy: 'usr-owner-001',
        business: dummyBusiness,
      };
      mockPrisma.marketplaceSlotPurchase.create.mockResolvedValue(mockCreated);

      const result = await submitSlotProof({
        userId: 'usr-owner-001',
        businessId: 'biz-123',
        slots: 2,
        file: sampleFile,
      });

      expect(mockVerifyBusinessAccess).toHaveBeenCalledWith('usr-owner-001', 'biz-123');
      expect(mockPrisma.marketplaceSlotPurchase.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            businessId: 'biz-123',
            slots: 2,
            status: 'pending_proof',
            paidVia: 'proof',
            purchasedBy: 'usr-owner-001',
          }),
        })
      );
      // Crucial: business slot allowance must NOT be touched during proof submission
      expect(mockPrisma.business.update).not.toHaveBeenCalled();
      expect(result.purchase.status).toBe('pending_proof');
    });

    it('rejects upload when caller lacks access to the business (wrong business -> 403)', async () => {
      mockVerifyBusinessAccess.mockRejectedValue(new AppError(403, 'Forbidden', 'FORBIDDEN'));

      await expect(
        submitSlotProof({
          userId: 'usr-unauthorized',
          businessId: 'biz-123',
          slots: 1,
          file: sampleFile,
        })
      ).rejects.toThrow('Forbidden');

      expect(mockPrisma.marketplaceSlotPurchase.create).not.toHaveBeenCalled();
    });

    it('rejects disallowed file types with 400 BAD_FILE_TYPE', async () => {
      const badFile = {
        originalname: 'script.exe',
        buffer: Buffer.from('malicious'),
        mimetype: 'application/x-msdownload',
        size: 500,
      };

      await expect(
        submitSlotProof({
          userId: 'usr-owner-001',
          businessId: 'biz-123',
          slots: 1,
          file: badFile,
        })
      ).rejects.toThrow('Only JPEG, PNG, WebP images or PDF documents are accepted');
    });

    it('rejects files exceeding 10MB with 400 FILE_TOO_LARGE', async () => {
      const hugeFile = {
        originalname: 'large.pdf',
        buffer: Buffer.alloc(11 * 1024 * 1024),
        mimetype: 'application/pdf',
        size: 11 * 1024 * 1024,
      };

      await expect(
        submitSlotProof({
          userId: 'usr-owner-001',
          businessId: 'biz-123',
          slots: 1,
          file: hugeFile,
        })
      ).rejects.toThrow('Proof document must be under 10MB');
    });

    it('rejects invalid slot count (0 or negative) with 400 INVALID_SLOTS', async () => {
      await expect(
        submitSlotProof({
          userId: 'usr-owner-001',
          businessId: 'biz-123',
          slots: 0,
          file: sampleFile,
        })
      ).rejects.toThrow('Slots must be a positive integer');
    });
  });

  describe('2. Admin Slot Listing (listAdminSlotPurchases)', () => {
    it('returns filtered and paginated purchases (FIFO for pending_proof)', async () => {
      const mockItems = [
        { id: 'slot-1', status: 'pending_proof', createdAt: new Date('2026-11-01') },
        { id: 'slot-2', status: 'pending_proof', createdAt: new Date('2026-11-02') },
      ];
      mockPrisma.marketplaceSlotPurchase.count.mockResolvedValue(2);
      mockPrisma.marketplaceSlotPurchase.findMany.mockResolvedValue(mockItems);

      const result = await listAdminSlotPurchases({
        status: 'pending_proof',
        page: 1,
        limit: 10,
      });

      expect(result.data).toHaveLength(2);
      expect(result.pagination.total).toBe(2);
      expect(mockPrisma.marketplaceSlotPurchase.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { createdAt: 'asc' }, // FIFO oldest first
        })
      );
    });
  });

  describe('3. Admin Slot Proof Approval (approveSlotProof)', () => {
    it('approves pending proof and increments allowance in one atomic transaction', async () => {
      const pendingPurchase = {
        id: 'slot-pur-001',
        businessId: 'biz-123',
        slots: 3,
        unitPrice: new Prisma.Decimal(2500),
        amount: new Prisma.Decimal(7500),
        status: 'pending_proof',
        paidVia: 'proof',
        business: dummyBusiness,
      };
      mockPrisma.marketplaceSlotPurchase.findUnique.mockResolvedValue(pendingPurchase);

      const updatedBiz = {
        ...dummyBusiness,
        marketplaceSlotAllowance: 6, // 3 + 3
      };
      mockPrisma.business.update.mockResolvedValue(updatedBiz);

      const updatedPur = {
        ...pendingPurchase,
        status: 'active',
        reviewedBy: 'admin-007',
        reviewedAt: new Date(),
      };
      mockPrisma.marketplaceSlotPurchase.update.mockResolvedValue(updatedPur);

      const result = await approveSlotProof({
        adminUserId: 'admin-007',
        purchaseId: 'slot-pur-001',
      });

      expect(mockPrisma.$transaction).toHaveBeenCalled();
      expect(mockPrisma.marketplaceSlotPurchase.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'slot-pur-001' },
          data: expect.objectContaining({ status: 'active', reviewedBy: 'admin-007' }),
        })
      );
      expect(mockPrisma.business.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'biz-123' },
          data: { marketplaceSlotAllowance: { increment: 3 } },
        })
      );
      expect(result.newAllowance).toBe(6);
      expect(result.purchase.status).toBe('active');
    });

    it('guard: prevents double-approval and does not increment allowance twice', async () => {
      const alreadyActivePurchase = {
        id: 'slot-pur-001',
        businessId: 'biz-123',
        slots: 2,
        status: 'active', // already approved!
      };
      mockPrisma.marketplaceSlotPurchase.findUnique.mockResolvedValue(alreadyActivePurchase);

      await expect(
        approveSlotProof({
          adminUserId: 'admin-007',
          purchaseId: 'slot-pur-001',
        })
      ).rejects.toThrow("Slot purchase cannot be approved because current status is 'active'");

      expect(mockPrisma.business.update).not.toHaveBeenCalled();
    });

    it('throws 404 when purchase record does not exist', async () => {
      mockPrisma.marketplaceSlotPurchase.findUnique.mockResolvedValue(null);

      await expect(
        approveSlotProof({
          adminUserId: 'admin-007',
          purchaseId: 'slot-nonexistent',
        })
      ).rejects.toThrow('Slot purchase record not found');
    });
  });

  describe('4. Admin Slot Proof Rejection (rejectSlotProof)', () => {
    it('rejects pending proof with mandatory reason and leaves allowance strictly unchanged', async () => {
      const pendingPurchase = {
        id: 'slot-pur-001',
        businessId: 'biz-123',
        slots: 2,
        status: 'pending_proof',
      };
      mockPrisma.marketplaceSlotPurchase.findUnique.mockResolvedValue(pendingPurchase);

      const rejectedPurchase = {
        ...pendingPurchase,
        status: 'rejected',
        rejectionReason: 'Illegible bank transfer receipt provided',
        reviewedBy: 'admin-007',
        reviewedAt: new Date(),
      };
      mockPrisma.marketplaceSlotPurchase.update.mockResolvedValue(rejectedPurchase);

      const result = await rejectSlotProof({
        adminUserId: 'admin-007',
        purchaseId: 'slot-pur-001',
        reason: 'Illegible bank transfer receipt provided',
      });

      expect(mockPrisma.marketplaceSlotPurchase.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'rejected',
            rejectionReason: 'Illegible bank transfer receipt provided',
            reviewedBy: 'admin-007',
          }),
        })
      );
      // Crucial: business slot allowance must NOT be altered on rejection
      expect(mockPrisma.business.update).not.toHaveBeenCalled();
      expect(result.purchase.status).toBe('rejected');
    });

    it('requires mandatory rejection reason (min 3 chars)', async () => {
      await expect(
        rejectSlotProof({
          adminUserId: 'admin-007',
          purchaseId: 'slot-pur-001',
          reason: '  ',
        })
      ).rejects.toThrow('Rejection reason is mandatory and must be at least 3 characters');
    });

    it('guard: cannot reject already rejected or active purchase', async () => {
      mockPrisma.marketplaceSlotPurchase.findUnique.mockResolvedValue({
        id: 'slot-pur-001',
        status: 'rejected',
      });

      await expect(
        rejectSlotProof({
          adminUserId: 'admin-007',
          purchaseId: 'slot-pur-001',
          reason: 'Duplicate rejection attempt',
        })
      ).rejects.toThrow("Slot purchase cannot be rejected because current status is 'rejected'");
    });
  });

  describe('5. Admin Slot Refund (refundSlotPurchase)', () => {
    it('refunds active purchase: status -> refunded, credits wallet, decrements allowance', async () => {
      const activePurchase = {
        id: 'slot-pur-001',
        businessId: 'biz-123',
        slots: 2,
        unitPrice: new Prisma.Decimal(2500),
        amount: new Prisma.Decimal(5000),
        status: 'active',
        business: {
          ...dummyBusiness,
          marketplaceSlotAllowance: 5, // allowance is 5; 5 - 2 = 3 >= 0 live products
        },
      };
      mockPrisma.marketplaceSlotPurchase.findUnique.mockResolvedValue(activePurchase);
      mockPrisma.business.findUnique.mockResolvedValue({
        ...dummyBusiness,
        marketplaceSlotAllowance: 5,
      });

      const updatedBiz = {
        ...dummyBusiness,
        marketplaceSlotAllowance: 3,
      };
      mockPrisma.business.update.mockResolvedValue(updatedBiz);

      const refundedPurchase = {
        ...activePurchase,
        status: 'refunded',
      };
      mockPrisma.marketplaceSlotPurchase.update.mockResolvedValue(refundedPurchase);

      const result = await refundSlotPurchase({
        adminUserId: 'admin-007',
        purchaseId: 'slot-pur-001',
        reason: 'Merchant requested refund',
      });

      expect(mockPrisma.business.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'biz-123' },
          data: { marketplaceSlotAllowance: { decrement: 2 } },
        })
      );
      expect(mockCreditWallet).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: dummyUser.id,
          businessId: 'biz-123',
          amount: 5000,
          source: 'marketplace_slot_refund',
        }),
        expect.anything()
      );
      expect(result.newAllowance).toBe(3);
      expect(result.purchase.status).toBe('refunded');
    });

    it('guard: blocks refund with 409 when allowance - slots < live products', async () => {
      const activePurchase = {
        id: 'slot-pur-001',
        businessId: 'biz-123',
        slots: 2,
        amount: new Prisma.Decimal(5000),
        status: 'active',
        business: {
          ...dummyBusiness,
          marketplaceSlotAllowance: 3, // current allowance = 3. 3 - 2 = 1
        },
      };
      mockPrisma.marketplaceSlotPurchase.findUnique.mockResolvedValue(activePurchase);
      // Mock that merchant has 2 live products! 3 - 2 = 1 < 2 live products
      mockPrisma.marketplaceProduct.count.mockResolvedValue(2);

      await expect(
        refundSlotPurchase({
          adminUserId: 'admin-007',
          purchaseId: 'slot-pur-001',
        })
      ).rejects.toThrow('Cannot reduce slot allowance to 1; business currently has 2 active product(s)');

      // Neither allowance decrement nor wallet credit should occur
      expect(mockPrisma.business.update).not.toHaveBeenCalled();
      expect(mockCreditWallet).not.toHaveBeenCalled();
    });

    it('guard: cannot refund non-active purchase (e.g. pending_proof or refunded)', async () => {
      mockPrisma.marketplaceSlotPurchase.findUnique.mockResolvedValue({
        id: 'slot-pur-001',
        status: 'pending_proof',
      });

      await expect(
        refundSlotPurchase({
          adminUserId: 'admin-007',
          purchaseId: 'slot-pur-001',
        })
      ).rejects.toThrow("Only active slot purchases can be refunded (current status: 'pending_proof')");
    });
  });

  describe('6. HTTP Controller Routes Integration', () => {
    let app: express.Express;

    beforeEach(() => {
      app = express();
      app.use(express.json());

      // Mock authenticated session
      app.use((req, _res, next) => {
        (req as any).user = { userId: 'usr-owner-001', role: 'admin' };
        next();
      });

      // Multer memory upload middleware
      const upload = multer({ storage: multer.memoryStorage() });

      // SME route
      app.post(
        '/api/v1/businesses/:businessId/marketplace/slots/proof',
        upload.single('file'),
        submitSlotProofController
      );

      // Admin routes
      app.get('/api/v1/admin/marketplace/slots', listSlotPurchasesAdmin);
      app.post('/api/v1/admin/marketplace/slots/:id/approve', approveSlotProofAdmin);
      app.post('/api/v1/admin/marketplace/slots/:id/reject', rejectSlotProofAdmin);
      app.post('/api/v1/admin/marketplace/slots/:id/refund', refundSlotPurchaseAdmin);

      app.use(errorHandler);
    });

    it('POST /businesses/:businessId/marketplace/slots/proof handles file upload and returns 201', async () => {
      const mockCreated = {
        id: 'slot-pur-001',
        businessId: 'biz-123',
        slots: 1,
        amount: new Prisma.Decimal(2500),
        status: 'pending_proof',
        paidVia: 'proof',
      };
      mockPrisma.marketplaceSlotPurchase.create.mockResolvedValue(mockCreated);

      const res = await request(app)
        .post('/api/v1/businesses/biz-123/marketplace/slots/proof')
        .field('slots', '1')
        .attach('file', Buffer.from('fake-receipt-content'), 'payment.jpg');

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('pending_proof');
    });

    it('POST /admin/marketplace/slots/:id/approve returns 200 with new allowance', async () => {
      const pending = {
        id: 'slot-pur-001',
        businessId: 'biz-123',
        slots: 2,
        status: 'pending_proof',
        business: dummyBusiness,
      };
      mockPrisma.marketplaceSlotPurchase.findUnique.mockResolvedValue(pending);
      mockPrisma.business.update.mockResolvedValue({
        ...dummyBusiness,
        marketplaceSlotAllowance: 5,
      });
      mockPrisma.marketplaceSlotPurchase.update.mockResolvedValue({
        ...pending,
        status: 'active',
      });

      const res = await request(app).post('/api/v1/admin/marketplace/slots/slot-pur-001/approve');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.newAllowance).toBe(5);
    });

    it('POST /admin/marketplace/slots/:id/reject rejects with 400 when reason is missing', async () => {
      const res = await request(app)
        .post('/api/v1/admin/marketplace/slots/slot-pur-001/reject')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('POST /admin/marketplace/slots/:id/refund returns 409 when floor violated', async () => {
      mockPrisma.marketplaceSlotPurchase.findUnique.mockResolvedValue({
        id: 'slot-pur-001',
        businessId: 'biz-123',
        slots: 2,
        status: 'active',
        business: {
          ...dummyBusiness,
          marketplaceSlotAllowance: 3,
        },
      });
      // 2 live products prevents reducing allowance to 1 (3 - 2)
      mockPrisma.marketplaceProduct.count.mockResolvedValue(2);

      const res = await request(app)
        .post('/api/v1/admin/marketplace/slots/slot-pur-001/refund')
        .send({ reason: 'Accidental purchase' });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('ALLOWANCE_BELOW_LIVE_COUNT');
    });
  });
});
