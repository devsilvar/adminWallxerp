import 'dotenv/config';
import prisma from '../../src/lib/prisma';
import { AccountCodePurpose } from '@prisma/client';

describe('AccountSecurityCode Model & Schema — Hardening Phase 5 (qahunter.md RTM)', () => {
  const TEST_ADMIN_EMAIL = 'richmond@wallx.co';
  let adminUserId: string;
  let testCodeId: string | null = null;

  beforeAll(async () => {
    const admin = await prisma.user.findUnique({
      where: { email: TEST_ADMIN_EMAIL },
    });
    if (!admin) {
      throw new Error(`Admin user ${TEST_ADMIN_EMAIL} must exist before running model tests.`);
    }
    adminUserId = admin.id;
  });

  afterEach(async () => {
    if (testCodeId) {
      await prisma.accountSecurityCode.deleteMany({
        where: { id: testCodeId },
      });
      testCodeId = null;
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // REQ-DB-01: Enum Definition
  it('exposes AccountCodePurpose enum with admin_password_change [positive]', () => {
    expect(AccountCodePurpose.admin_password_change).toBe('admin_password_change');
  });

  // REQ-DB-02: Model CRUD & Defaults
  it('persists and retrieves an AccountSecurityCode record with correct defaults [positive]', async () => {
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    const codeHash = 'test-sha256-code-hash-abc-123';

    const record = await prisma.accountSecurityCode.create({
      data: {
        userId: adminUserId,
        purpose: AccountCodePurpose.admin_password_change,
        codeHash,
        expiresAt,
        requestedIp: '192.168.1.1',
      },
    });

    testCodeId = record.id;

    expect(record.id).toBeDefined();
    expect(record.userId).toBe(adminUserId);
    expect(record.purpose).toBe('admin_password_change');
    expect(record.codeHash).toBe(codeHash);
    expect(record.attempts).toBe(0);
    expect(record.consumedAt).toBeNull();
    expect(record.usedAt).toBeNull();
    expect(record.requestedIp).toBe('192.168.1.1');
    expect(record.createdAt).toBeInstanceOf(Date);
  });

  // REQ-DB-03: User Relation Navigation
  it('fetches accountSecurityCodes via User model relation [positive]', async () => {
    const record = await prisma.accountSecurityCode.create({
      data: {
        userId: adminUserId,
        purpose: AccountCodePurpose.admin_password_change,
        codeHash: 'rel-hash-456',
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      },
    });
    testCodeId = record.id;

    const userWithCodes = await prisma.user.findUnique({
      where: { id: adminUserId },
      include: {
        accountSecurityCodes: {
          where: { id: record.id },
        },
      },
    });

    expect(userWithCodes).not.toBeNull();
    expect(userWithCodes?.accountSecurityCodes).toHaveLength(1);
    expect(userWithCodes?.accountSecurityCodes[0].id).toBe(record.id);
  });

  // REQ-DB-04: Negative Foreign Key Constraint
  it('rejects creating AccountSecurityCode for non-existent userId [negative]', async () => {
    const nonExistentUserId = '00000000-0000-0000-0000-000000000000';

    await expect(
      prisma.accountSecurityCode.create({
        data: {
          userId: nonExistentUserId,
          purpose: AccountCodePurpose.admin_password_change,
          codeHash: 'fake-hash',
          expiresAt: new Date(Date.now() + 10 * 60 * 1000),
        },
      })
    ).rejects.toThrow();
  });
});
