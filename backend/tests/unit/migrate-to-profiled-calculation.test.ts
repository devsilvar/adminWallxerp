import { describe, it, expect, beforeEach, jest } from '@jest/globals';

jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: {
    business: {
      findMany: jest.fn(),
    },
    businessTaxProfile: {
      create: jest.fn(),
    },
  },
}));

jest.mock('@/lib/logger', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('@/lib/email', () => ({
  sendEmail: jest.fn(),
}));

import prisma from '@/lib/prisma';
import { sendEmail } from '@/lib/email';
import { migrateExistingBusinesses } from '@/scripts/migrate-to-profiled-calculation';

describe('Migrate Existing Businesses Script', () => {
  const mockBusinesses = [
    {
      id: 'biz_1',
      businessName: 'Lagos Supermart Ltd',
      user: {
        id: 'usr_1',
        email: 'owner1@example.com',
        fullName: 'Ade Johnson',
      },
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('runs dry-run mode without mutating database or sending emails', async () => {
    (prisma.business.findMany as any).mockResolvedValue(mockBusinesses);

    const result = await migrateExistingBusinesses({ dryRun: true });

    expect(result.found).toBe(1);
    expect(result.migrated).toBe(0);
    expect(prisma.businessTaxProfile.create).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('runs live migration, creates pending profile, and dispatches notification email', async () => {
    (prisma.business.findMany as any).mockResolvedValue(mockBusinesses);
    (prisma.businessTaxProfile.create as any).mockResolvedValue({ id: 'prof_1' });
    (sendEmail as any).mockResolvedValue({ id: 'email_1' });

    const result = await migrateExistingBusinesses({ dryRun: false });

    expect(result.found).toBe(1);
    expect(result.migrated).toBe(1);
    expect(prisma.businessTaxProfile.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        businessId: 'biz_1',
        needsManualReview: true,
      }),
    });
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'owner1@example.com',
        subject: expect.stringContaining('NTA 2025'),
      })
    );
  });
});
