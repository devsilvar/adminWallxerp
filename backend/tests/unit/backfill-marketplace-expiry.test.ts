import { describe, it, expect, beforeEach, jest } from '@jest/globals';

jest.mock('../../src/lib/prisma', () => ({
  __esModule: true,
  default: {
    marketplaceProduct: {
      findMany: jest.fn(),
      update: jest.fn(),
    },
    $disconnect: jest.fn(),
  },
}));

jest.mock('../../src/lib/logger', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

import prisma from '../../src/lib/prisma';
import { runBackfill } from '../../src/scripts/backfill-marketplace-expiry';

describe('backfill-marketplace-expiry script', () => {
  const approvedAtDate = new Date('2026-10-01T12:00:00.000Z');
  const mockCandidates = [
    {
      id: 'prod-1',
      name: 'Leather Handbag',
      slug: 'leather-handbag',
      status: 'approved',
      approvedAt: approvedAtDate,
      createdAt: new Date('2026-09-30T10:00:00.000Z'),
    },
    {
      id: 'prod-2',
      name: 'Sneakers',
      slug: 'sneakers',
      status: 'approved',
      approvedAt: null,
      createdAt: new Date('2026-10-02T10:00:00.000Z'),
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('runs dry-run mode without mutating database', async () => {
    (prisma.marketplaceProduct.findMany as jest.MockedFunction<any>).mockResolvedValue(mockCandidates);

    const result = await runBackfill(false);

    expect(result.totalCandidates).toBe(2);
    expect(result.processed).toBe(2);
    expect(result.isDryRun).toBe(true);
    expect(prisma.marketplaceProduct.findMany).toHaveBeenCalledWith({
      where: {
        status: 'approved',
        expiresAt: null,
      },
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        approvedAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });
    expect(prisma.marketplaceProduct.update).not.toHaveBeenCalled();
  });

  it('runs apply mode and updates expiresAt = approvedAt + 90 days', async () => {
    (prisma.marketplaceProduct.findMany as jest.MockedFunction<any>).mockResolvedValue(mockCandidates);
    (prisma.marketplaceProduct.update as jest.MockedFunction<any>).mockResolvedValue({});

    const result = await runBackfill(true);

    expect(result.totalCandidates).toBe(2);
    expect(result.processed).toBe(2);
    expect(result.isDryRun).toBe(false);
    expect(prisma.marketplaceProduct.update).toHaveBeenCalledTimes(2);

    const expectedExpiry1 = new Date(approvedAtDate.getTime() + 90 * 24 * 60 * 60 * 1000);
    expect(prisma.marketplaceProduct.update).toHaveBeenNthCalledWith(1, {
      where: { id: 'prod-1' },
      data: { expiresAt: expectedExpiry1 },
    });

    const expectedExpiry2 = new Date(mockCandidates[1].createdAt.getTime() + 90 * 24 * 60 * 60 * 1000);
    expect(prisma.marketplaceProduct.update).toHaveBeenNthCalledWith(2, {
      where: { id: 'prod-2' },
      data: { expiresAt: expectedExpiry2 },
    });
  });

  it('handles zero candidates gracefully', async () => {
    (prisma.marketplaceProduct.findMany as jest.MockedFunction<any>).mockResolvedValue([]);

    const result = await runBackfill(false);

    expect(result.totalCandidates).toBe(0);
    expect(result.processed).toBe(0);
    expect(prisma.marketplaceProduct.update).not.toHaveBeenCalled();
  });
});
