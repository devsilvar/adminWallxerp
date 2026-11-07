import { describe, it, expect, beforeEach, jest } from '@jest/globals';

const mockPrisma: any = {
  business: {
    findUnique: jest.fn(),
  },
  marketplaceProduct: {
    count: jest.fn(),
    create: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
  },
  $executeRaw: jest.fn(),
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

import {
  createProduct,
  assertAllowanceNotBelowLiveProducts,
} from '../../src/services/marketplace/marketplace.service';
import { AppError } from '../../src/middleware/errorHandler';

describe('Phase 9: Slot Entitlement (Schema & Cap)', () => {
  const userId = 'usr-test-123';
  const businessId = 'bus-test-456';

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.$transaction.mockImplementation(async (cb: any) => cb(mockPrisma));
    mockPrisma.business.findUnique.mockResolvedValue({
      id: businessId,
      userId,
      marketplaceSlotAllowance: 3,
    });
    mockPrisma.marketplaceProduct.findUnique.mockResolvedValue(null);
  });

  const validProductInput = {
    name: 'Wireless Noise Canceling Headphones',
    category: 'electronics' as const,
    productType: 'physical' as const,
    description: 'High fidelity audio with 40-hour battery life.',
    price: 85000,
  };

  it('allows creating a product when live products are below the default allowance (3)', async () => {
    // 2 active products currently
    mockPrisma.marketplaceProduct.count.mockResolvedValueOnce(2);
    mockPrisma.marketplaceProduct.create.mockResolvedValueOnce({
      id: 'prod-new-1',
      businessId,
      name: validProductInput.name,
      slug: 'wireless-noise-canceling-headphones',
      status: 'draft',
      price: validProductInput.price,
    });

    const result = await createProduct(userId, businessId, validProductInput);

    expect(result.id).toBe('prod-new-1');
    expect(mockPrisma.marketplaceProduct.count).toHaveBeenCalledWith({
      where: {
        businessId,
        status: { in: ['draft', 'pending_approval', 'approved'] },
      },
    });
  });

  it('blocks creation with PRODUCT_LIMIT_REACHED when live products reach the default allowance (3)', async () => {
    // 3 active products currently (draft, pending, approved)
    mockPrisma.marketplaceProduct.count.mockResolvedValueOnce(3);

    await expect(
      createProduct(userId, businessId, validProductInput)
    ).rejects.toMatchObject({
      statusCode: 400,
      code: 'PRODUCT_LIMIT_REACHED',
      message: expect.stringContaining('Maximum of 3 products permitted for this business'),
    });

    expect(mockPrisma.marketplaceProduct.create).not.toHaveBeenCalled();
  });

  it('frees a slot for rejected products — a business with 2 approved + 1 rejected can create a 3rd active listing', async () => {
    // Count query strictly matches status: { in: ['draft', 'pending_approval', 'approved'] }
    // Thus the 1 rejected product does NOT count against the cap, returning count = 2
    mockPrisma.marketplaceProduct.count.mockResolvedValueOnce(2);
    mockPrisma.marketplaceProduct.create.mockResolvedValueOnce({
      id: 'prod-new-3',
      businessId,
      name: validProductInput.name,
      status: 'draft',
    });

    const result = await createProduct(userId, businessId, validProductInput);

    expect(result.id).toBe('prod-new-3');
    expect(mockPrisma.marketplaceProduct.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: { in: ['draft', 'pending_approval', 'approved'] },
        }),
      })
    );
  });

  it('respects expanded allowance when merchant has purchased extra slots (e.g. allowance = 5)', async () => {
    // Business has purchased 2 extra slots -> allowance = 5
    mockPrisma.business.findUnique.mockResolvedValueOnce({
      id: businessId,
      userId,
      marketplaceSlotAllowance: 5,
    });

    // 4 active products exist
    mockPrisma.marketplaceProduct.count.mockResolvedValueOnce(4);
    mockPrisma.marketplaceProduct.create.mockResolvedValueOnce({
      id: 'prod-new-5',
      businessId,
      name: validProductInput.name,
      status: 'draft',
    });

    const result = await createProduct(userId, businessId, validProductInput);

    expect(result.id).toBe('prod-new-5');

    // Now test reaching the expanded cap (5)
    mockPrisma.business.findUnique.mockResolvedValueOnce({
      id: businessId,
      userId,
      marketplaceSlotAllowance: 5,
    });
    mockPrisma.marketplaceProduct.count.mockResolvedValueOnce(5);

    await expect(
      createProduct(userId, businessId, validProductInput)
    ).rejects.toMatchObject({
      statusCode: 400,
      code: 'PRODUCT_LIMIT_REACHED',
      message: expect.stringContaining('Maximum of 5 products permitted for this business'),
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // assertAllowanceNotBelowLiveProducts (Refund / Downgrade validation)
  // ───────────────────────────────────────────────────────────────────────────
  describe('assertAllowanceNotBelowLiveProducts', () => {
    it('succeeds when new allowance is greater than or equal to currently active products', async () => {
      // 3 active products
      mockPrisma.marketplaceProduct.count.mockResolvedValueOnce(3);

      await expect(
        assertAllowanceNotBelowLiveProducts(businessId, 3, mockPrisma)
      ).resolves.not.toThrow();

      mockPrisma.marketplaceProduct.count.mockResolvedValueOnce(3);

      await expect(
        assertAllowanceNotBelowLiveProducts(businessId, 4, mockPrisma)
      ).resolves.not.toThrow();
    });

    it('throws 409 ALLOWANCE_BELOW_LIVE_COUNT when proposed allowance is less than active products', async () => {
      // 4 active products, proposed allowance is 3
      mockPrisma.marketplaceProduct.count.mockResolvedValueOnce(4);

      await expect(
        assertAllowanceNotBelowLiveProducts(businessId, 3, mockPrisma)
      ).rejects.toMatchObject({
        statusCode: 409,
        code: 'ALLOWANCE_BELOW_LIVE_COUNT',
        message: expect.stringContaining('Cannot reduce slot allowance to 3; business currently has 4 active product(s)'),
      });
    });
  });
});
