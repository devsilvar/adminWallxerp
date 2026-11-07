import { describe, it, expect, beforeEach, jest } from '@jest/globals';

const mockPrisma: any = {
  business: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
  },
  businessMember: {
    findFirst: jest.fn(),
  },
  marketplaceProduct: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    update: jest.fn(),
  },
  marketplaceBoost: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    count: jest.fn(),
  },
  auditLog: {
    create: jest.fn(),
  },
  $transaction: jest.fn(async (cb: any) => cb(mockPrisma)),
  $queryRaw: jest.fn().mockResolvedValue([{ median_price: 50000, cnt: 10 }]),
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

const mockLogAudit = jest.fn();
jest.mock('../../src/lib/audit', () => ({
  __esModule: true,
  logAudit: mockLogAudit,
}));

// Mock email notifications
jest.mock('../../src/services/email-dispatch.service', () => ({
  __esModule: true,
  dispatchProductApprovedEmail: jest.fn(),
  dispatchProductRejectedEmail: jest.fn(),
}));

import {
  updateProduct,
  submitForApproval,
  sendProductBack,
} from '../../src/services/marketplace/marketplace.service';
import { AppError } from '../../src/middleware/errorHandler';

describe('Phase 16: Marketplace Live-Edit Re-Review & Admin Status Control', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.$queryRaw.mockResolvedValue([{ median_price: 50000, cnt: 10 }]);
    mockPrisma.business.findFirst.mockResolvedValue({
      id: 'biz-1',
      userId: 'user-1',
      businessName: 'Test Business',
    });
    mockPrisma.business.findUnique.mockResolvedValue({
      id: 'biz-1',
      userId: 'user-1',
      businessName: 'Test Business',
    });
  });

  describe('1. updateProduct demotion rules & empty patch guard', () => {
    it('demotes approved listing on non-core field edit (e.g. contact phone) and pauses active boosts', async () => {
      mockPrisma.marketplaceProduct.findFirst.mockResolvedValue({
        id: 'prod-1',
        businessId: 'biz-1',
        status: 'approved',
        name: 'Live Phone Case',
        category: 'electronics',
        contactPhone: '+2348000000000',
        trackInventory: false,
        stockQuantity: null,
      });
      mockPrisma.marketplaceProduct.update.mockResolvedValue({
        id: 'prod-1',
        status: 'pending_approval',
      });

      const res = await updateProduct('user-1', 'biz-1', 'prod-1', {
        contactPhone: '+2348099999999',
      });

      expect(mockPrisma.marketplaceProduct.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'prod-1' },
          data: expect.objectContaining({
            contactPhone: '+2348099999999',
            status: 'pending_approval',
            approvedAt: null,
            approvedBy: null,
            rejectionReason: null,
            boostEndsAt: null,
          }),
        })
      );
      expect(mockPrisma.marketplaceBoost.updateMany).toHaveBeenCalledWith({
        where: { productId: 'prod-1', status: 'active' },
        data: { status: 'paused' },
      });
      expect(res.status).toBe('pending_approval');
    });

    it('demotes approved listing on core field edit (e.g. price) and pauses active boosts', async () => {
      mockPrisma.marketplaceProduct.findFirst.mockResolvedValue({
        id: 'prod-2',
        businessId: 'biz-1',
        status: 'approved',
        name: 'Leather Shoes',
        category: 'fashion',
        price: '25000',
        trackInventory: false,
        stockQuantity: null,
      });
      mockPrisma.marketplaceProduct.update.mockResolvedValue({
        id: 'prod-2',
        status: 'pending_approval',
      });

      await updateProduct('user-1', 'biz-1', 'prod-2', {
        price: 30000,
      });

      expect(mockPrisma.marketplaceProduct.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'prod-2' },
          data: expect.objectContaining({
            status: 'pending_approval',
            approvedAt: null,
            approvedBy: null,
            rejectionReason: null,
            boostEndsAt: null,
          }),
        })
      );
      expect(mockPrisma.marketplaceBoost.updateMany).toHaveBeenCalledWith({
        where: { productId: 'prod-2', status: 'active' },
        data: { status: 'paused' },
      });
    });

    it('throws 400 NO_CHANGES on empty update payload', async () => {
      mockPrisma.marketplaceProduct.findFirst.mockResolvedValue({
        id: 'prod-empty',
        businessId: 'biz-1',
        status: 'approved',
        name: 'Test Product',
        category: 'fashion',
      });

      await expect(
        updateProduct('user-1', 'biz-1', 'prod-empty', {})
      ).rejects.toThrow(
        expect.objectContaining({
          statusCode: 400,
          code: 'NO_CHANGES',
          message: 'No changes submitted',
        })
      );
      expect(mockPrisma.marketplaceProduct.update).not.toHaveBeenCalled();
    });

    it('does not demote when product status is draft', async () => {
      mockPrisma.marketplaceProduct.findFirst.mockResolvedValue({
        id: 'prod-draft',
        businessId: 'biz-1',
        status: 'draft',
        name: 'Draft Product',
        category: 'fashion',
        trackInventory: false,
        stockQuantity: null,
      });
      mockPrisma.marketplaceProduct.update.mockResolvedValue({
        id: 'prod-draft',
        status: 'draft',
        name: 'Updated Draft',
      });

      await updateProduct('user-1', 'biz-1', 'prod-draft', {
        name: 'Updated Draft',
      });

      expect(mockPrisma.marketplaceProduct.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'prod-draft' },
          data: expect.not.objectContaining({
            status: 'pending_approval',
          }),
        })
      );
    });
  });

  describe('2. submitForApproval widening & early-return', () => {
    it('returns immediately without writes or checks when status is already pending_approval', async () => {
      const pendingProduct = {
        id: 'prod-pending',
        businessId: 'biz-1',
        status: 'pending_approval',
        name: 'Pending Product',
        images: [], // intentionally empty to verify early-return bypasses image gate
      };
      mockPrisma.marketplaceProduct.findFirst.mockResolvedValue(pendingProduct);

      const result = await submitForApproval('user-1', 'biz-1', 'prod-pending');

      expect(result).toBe(pendingProduct);
      expect(mockPrisma.marketplaceProduct.update).not.toHaveBeenCalled();
      expect(mockLogAudit).not.toHaveBeenCalled();
    });

    it('allows submission from approved status (widened gate), resetting stamps and pausing boosts', async () => {
      mockPrisma.marketplaceProduct.findFirst.mockResolvedValue({
        id: 'prod-approved',
        businessId: 'biz-1',
        status: 'approved',
        name: 'Live Approved Listing',
        description: 'Complete high quality description for tests with more than twenty characters.',
        category: 'electronics',
        images: ['https://example.com/img1.jpg'],
        price: '50000',
        trackInventory: false,
        stockQuantity: null,
        contactPhone: '+2348012345678',
        attributes: { brand: 'Sony', model: 'WH-1000XM5' },
      });
      mockPrisma.marketplaceProduct.update.mockResolvedValue({
        id: 'prod-approved',
        status: 'pending_approval',
      });

      const result = await submitForApproval('user-1', 'biz-1', 'prod-approved');

      expect(mockPrisma.marketplaceProduct.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'prod-approved' },
          data: expect.objectContaining({
            status: 'pending_approval',
            rejectionReason: null,
            approvedAt: null,
            approvedBy: null,
            boostEndsAt: null,
          }),
        })
      );
      expect(mockPrisma.marketplaceBoost.updateMany).toHaveBeenCalledWith({
        where: { productId: 'prod-approved', status: 'active' },
        data: { status: 'paused' },
      });
      expect(mockLogAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'product.submitted',
          newData: { status: 'pending_approval' },
        }),
        mockPrisma
      );
    });

    it('rejects submission from archived status with 400 INVALID_STATUS_TRANSITION', async () => {
      mockPrisma.marketplaceProduct.findFirst.mockResolvedValue({
        id: 'prod-archived',
        businessId: 'biz-1',
        status: 'archived',
        name: 'Archived Listing',
      });

      await expect(
        submitForApproval('user-1', 'biz-1', 'prod-archived')
      ).rejects.toThrow(
        expect.objectContaining({
          statusCode: 400,
          code: 'INVALID_STATUS_TRANSITION',
        })
      );
      expect(mockPrisma.marketplaceProduct.update).not.toHaveBeenCalled();
    });
  });

  describe('3. sendProductBack admin operation', () => {
    it('successfully sends back an approved listing to pending_approval with reason and pauses active boost', async () => {
      mockPrisma.marketplaceProduct.findUnique.mockResolvedValue({
        id: 'prod-live',
        businessId: 'biz-1',
        status: 'approved',
        name: 'Live Widget',
      });
      mockPrisma.marketplaceProduct.update.mockResolvedValue({
        id: 'prod-live',
        status: 'pending_approval',
        rejectionReason: 'Please upload clearer product photos showing the serial tag.',
      });

      const reason = 'Please upload clearer product photos showing the serial tag.';
      const res = await sendProductBack('admin-user-1', 'prod-live', reason);

      expect(mockPrisma.marketplaceProduct.update).toHaveBeenCalledWith({
        where: { id: 'prod-live' },
        data: {
          status: 'pending_approval',
          approvedAt: null,
          approvedBy: null,
          rejectionReason: reason,
          boostEndsAt: null,
        },
      });
      expect(mockPrisma.marketplaceBoost.updateMany).toHaveBeenCalledWith({
        where: { productId: 'prod-live', status: 'active' },
        data: { status: 'paused' },
      });
      expect(mockLogAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'admin-user-1',
          businessId: 'biz-1',
          action: 'product.sent_back',
          oldData: { status: 'approved' },
          newData: { status: 'pending_approval', rejectionReason: reason },
        }),
        mockPrisma
      );
      expect(res.status).toBe('pending_approval');
    });

    it('throws 404 when product is not found', async () => {
      mockPrisma.marketplaceProduct.findUnique.mockResolvedValue(null);

      await expect(
        sendProductBack('admin-user-1', 'non-existent', 'Valid reason here')
      ).rejects.toThrow(
        expect.objectContaining({
          statusCode: 404,
          code: 'PRODUCT_NOT_FOUND',
        })
      );
    });

    it('throws 400 INVALID_STATUS_TRANSITION when sending back non-approved listing', async () => {
      mockPrisma.marketplaceProduct.findUnique.mockResolvedValue({
        id: 'prod-draft',
        status: 'draft',
      });

      await expect(
        sendProductBack('admin-user-1', 'prod-draft', 'Valid reason here')
      ).rejects.toThrow(
        expect.objectContaining({
          statusCode: 400,
          code: 'INVALID_STATUS_TRANSITION',
        })
      );
    });

    it('throws 400 INVALID_REASON when reason is too short (< 3 characters)', async () => {
      await expect(
        sendProductBack('admin-user-1', 'prod-1', 'ab')
      ).rejects.toThrow(
        expect.objectContaining({
          statusCode: 400,
          code: 'INVALID_REASON',
        })
      );
    });

    it('throws 400 INVALID_REASON when reason exceeds 500 characters', async () => {
      const longReason = 'a'.repeat(501);
      await expect(
        sendProductBack('admin-user-1', 'prod-1', longReason)
      ).rejects.toThrow(
        expect.objectContaining({
          statusCode: 400,
          code: 'INVALID_REASON',
        })
      );
    });
  });
});
