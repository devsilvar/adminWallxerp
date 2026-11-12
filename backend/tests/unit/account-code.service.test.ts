import 'dotenv/config';
import prisma from '../../src/lib/prisma';
import {
  generateCode,
  hashCode,
  issueCode,
  verifyCode,
  consumeCode,
  MAX_CODE_ATTEMPTS,
  CODE_TTL_MINUTES,
} from '../../src/services/auth/account-code.service';
import { AccountCodePurpose } from '@prisma/client';
import { AppError } from '../../src/middleware/errorHandler';

describe('Account Code Service — Phase 6 (qahunter.md RTM)', () => {
  const TEST_ADMIN_EMAIL = 'richmond@wallx.co';
  let adminUserId: string;
  const createdCodeIds: string[] = [];

  beforeAll(async () => {
    const admin = await prisma.user.findUnique({
      where: { email: TEST_ADMIN_EMAIL },
    });
    if (!admin) {
      throw new Error(`Admin user ${TEST_ADMIN_EMAIL} must exist in database.`);
    }
    adminUserId = admin.id;
  });

  afterEach(async () => {
    if (createdCodeIds.length > 0) {
      await prisma.accountSecurityCode.deleteMany({
        where: { id: { in: createdCodeIds } },
      });
      createdCodeIds.length = 0;
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // REQ-CODE-01: Code Generation Format & Bounds
  describe('generateCode', () => {
    it('always generates a 6-digit decimal string with padding [positive/boundary]', () => {
      for (let i = 0; i < 50; i++) {
        const code = generateCode();
        expect(code).toMatch(/^\d{6}$/);
        expect(code.length).toBe(6);
      }
    });
  });

  // REQ-CODE-02: Cryptographic HMAC-SHA256 Hashing with Pepper
  describe('hashCode', () => {
    it('returns a 64-char hex digest deterministic for same parameters [positive]', () => {
      const hash1 = hashCode(adminUserId, AccountCodePurpose.admin_password_change, '123456');
      const hash2 = hashCode(adminUserId, AccountCodePurpose.admin_password_change, '123456');

      expect(hash1).toMatch(/^[a-f0-9]{64}$/);
      expect(hash1).toBe(hash2);
    });

    it('hashes differently for different user IDs with the same code [isolation]', () => {
      const hashUserA = hashCode('user-aaa', AccountCodePurpose.admin_password_change, '123456');
      const hashUserB = hashCode('user-bbb', AccountCodePurpose.admin_password_change, '123456');

      expect(hashUserA).not.toBe(hashUserB);
    });

    it('hashes differently for different purposes with same user and code [isolation]', () => {
      const hash1 = hashCode(adminUserId, AccountCodePurpose.admin_password_change, '123456');
      const hashFakePurpose = hashCode(adminUserId, 'other_purpose' as any, '123456');

      expect(hash1).not.toBe(hashFakePurpose);
    });

    it('hashes differently for different codes [positive]', () => {
      const hash1 = hashCode(adminUserId, AccountCodePurpose.admin_password_change, '123456');
      const hash2 = hashCode(adminUserId, AccountCodePurpose.admin_password_change, '654321');

      expect(hash1).not.toBe(hash2);
    });
  });

  // REQ-CODE-03: Issue Code Lifecycle & Prior Code Expiry
  describe('issueCode', () => {
    it('issues a valid code and sets TTL to 10 minutes [positive]', async () => {
      const before = Date.now();
      const { code, expiresAt } = await issueCode(
        adminUserId,
        AccountCodePurpose.admin_password_change,
        '10.0.0.1'
      );

      const record = await prisma.accountSecurityCode.findFirst({
        where: { userId: adminUserId, purpose: AccountCodePurpose.admin_password_change },
        orderBy: { createdAt: 'desc' },
      });
      if (record) createdCodeIds.push(record.id);

      expect(code).toMatch(/^\d{6}$/);
      expect(record).not.toBeNull();
      expect(record?.codeHash).toBe(hashCode(adminUserId, AccountCodePurpose.admin_password_change, code));
      expect(record?.requestedIp).toBe('10.0.0.1');
      expect(record?.attempts).toBe(0);
      expect(record?.consumedAt).toBeNull();

      const expectedExpiry = before + CODE_TTL_MINUTES * 60 * 1000;
      expect(Math.abs(expiresAt.getTime() - expectedExpiry)).toBeLessThan(5000);
    });

    it('invalidates prior unconsumed codes when a new code is issued [lifecycle]', async () => {
      const first = await issueCode(adminUserId, AccountCodePurpose.admin_password_change);
      const firstRecord = await prisma.accountSecurityCode.findFirst({
        where: { userId: adminUserId },
        orderBy: { createdAt: 'desc' },
      });
      if (firstRecord) createdCodeIds.push(firstRecord.id);

      const second = await issueCode(adminUserId, AccountCodePurpose.admin_password_change);
      const secondRecord = await prisma.accountSecurityCode.findFirst({
        where: { userId: adminUserId },
        orderBy: { createdAt: 'desc' },
      });
      if (secondRecord) createdCodeIds.push(secondRecord.id);

      expect(firstRecord?.id).not.toBe(secondRecord?.id);

      // Reload first record — must have been expired
      const reloadedFirst = await prisma.accountSecurityCode.findUnique({
        where: { id: firstRecord!.id },
      });
      expect(reloadedFirst?.expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + 100);

      // Attempting to verify the stale first code fails against the new active code
      await expect(
        verifyCode(adminUserId, AccountCodePurpose.admin_password_change, first.code)
      ).rejects.toMatchObject({
        code: 'INVALID_CODE',
        statusCode: 400,
      });

      // Verifying the second (newest) code succeeds
      const verification = await verifyCode(adminUserId, AccountCodePurpose.admin_password_change, second.code);
      expect(verification.codeId).toBe(secondRecord!.id);
    });
  });

  // REQ-CODE-04: Code Verification, Attempts, and Expiry
  describe('verifyCode', () => {
    it('verifies correct code and marks consumedAt [positive]', async () => {
      const { code } = await issueCode(adminUserId, AccountCodePurpose.admin_password_change);
      const record = await prisma.accountSecurityCode.findFirst({
        where: { userId: adminUserId },
        orderBy: { createdAt: 'desc' },
      });
      if (record) createdCodeIds.push(record.id);

      const result = await verifyCode(adminUserId, AccountCodePurpose.admin_password_change, code);
      expect(result.codeId).toBe(record!.id);

      const updated = await prisma.accountSecurityCode.findUnique({ where: { id: record!.id } });
      expect(updated?.consumedAt).not.toBeNull();
    });

    it('rejects incorrect code and decrements remaining attempts [boundary]', async () => {
      const { code } = await issueCode(adminUserId, AccountCodePurpose.admin_password_change);
      const record = await prisma.accountSecurityCode.findFirst({
        where: { userId: adminUserId },
        orderBy: { createdAt: 'desc' },
      });
      if (record) createdCodeIds.push(record.id);

      const wrongCode = code === '000000' ? '111111' : '000000';

      try {
        await verifyCode(adminUserId, AccountCodePurpose.admin_password_change, wrongCode);
        fail('Should have thrown AppError');
      } catch (err: any) {
        expect(err).toBeInstanceOf(AppError);
        expect(err.code).toBe('INVALID_CODE');
        expect(err.statusCode).toBe(400);
        expect(err.details?.remainingAttempts).toBe(MAX_CODE_ATTEMPTS - 1);
      }

      const updated = await prisma.accountSecurityCode.findUnique({ where: { id: record!.id } });
      expect(updated?.attempts).toBe(1);
    });

    it('locks out after 5 consecutive incorrect attempts with CODE_ATTEMPTS_EXCEEDED [security]', async () => {
      const { code } = await issueCode(adminUserId, AccountCodePurpose.admin_password_change);
      const record = await prisma.accountSecurityCode.findFirst({
        where: { userId: adminUserId },
        orderBy: { createdAt: 'desc' },
      });
      if (record) createdCodeIds.push(record.id);

      const wrongCode = code === '999999' ? '888888' : '999999';

      // 4 wrong attempts
      for (let i = 1; i <= 4; i++) {
        await expect(
          verifyCode(adminUserId, AccountCodePurpose.admin_password_change, wrongCode)
        ).rejects.toMatchObject({
          code: 'INVALID_CODE',
          statusCode: 400,
          details: { remainingAttempts: MAX_CODE_ATTEMPTS - i },
        });
      }

      // 5th wrong attempt triggers lockout
      await expect(
        verifyCode(adminUserId, AccountCodePurpose.admin_password_change, wrongCode)
      ).rejects.toMatchObject({
        code: 'CODE_ATTEMPTS_EXCEEDED',
        statusCode: 429,
      });

      // Even providing the correct code now is blocked by lockout
      await expect(
        verifyCode(adminUserId, AccountCodePurpose.admin_password_change, code)
      ).rejects.toMatchObject({
        code: 'CODE_ATTEMPTS_EXCEEDED',
        statusCode: 429,
      });
    });

    it('rejects expired codes with CODE_EXPIRED [negative]', async () => {
      const { code } = await issueCode(adminUserId, AccountCodePurpose.admin_password_change);
      const record = await prisma.accountSecurityCode.findFirst({
        where: { userId: adminUserId },
        orderBy: { createdAt: 'desc' },
      });
      if (record) createdCodeIds.push(record.id);

      // Force expiration in DB
      await prisma.accountSecurityCode.update({
        where: { id: record!.id },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });

      await expect(
        verifyCode(adminUserId, AccountCodePurpose.admin_password_change, code)
      ).rejects.toMatchObject({
        code: 'CODE_EXPIRED',
        statusCode: 400,
      });
    });
  });

  // REQ-CODE-05: Single-Use Ticket Consumption
  describe('consumeCode', () => {
    it('consumes a verified code ticket once, and rejects a second consumption [single-use]', async () => {
      const { code } = await issueCode(adminUserId, AccountCodePurpose.admin_password_change);
      const { codeId } = await verifyCode(adminUserId, AccountCodePurpose.admin_password_change, code);
      createdCodeIds.push(codeId);

      // First consumption succeeds
      await expect(consumeCode(codeId, adminUserId)).resolves.toBeUndefined();

      const record = await prisma.accountSecurityCode.findUnique({ where: { id: codeId } });
      expect(record?.usedAt).not.toBeNull();

      // Second consumption with same ticket MUST fail
      await expect(consumeCode(codeId, adminUserId)).rejects.toMatchObject({
        code: 'CODE_VERIFICATION_EXPIRED',
        statusCode: 400,
      });
    });

    it('rejects consumption for mismatched user ID [security]', async () => {
      const { code } = await issueCode(adminUserId, AccountCodePurpose.admin_password_change);
      const { codeId } = await verifyCode(adminUserId, AccountCodePurpose.admin_password_change, code);
      createdCodeIds.push(codeId);

      await expect(consumeCode(codeId, 'different-user-id')).rejects.toMatchObject({
        code: 'CODE_VERIFICATION_EXPIRED',
        statusCode: 400,
      });
    });

    it('rejects consumption if code was never verified (consumedAt is null) [negative]', async () => {
      await issueCode(adminUserId, AccountCodePurpose.admin_password_change);
      const record = await prisma.accountSecurityCode.findFirst({
        where: { userId: adminUserId },
        orderBy: { createdAt: 'desc' },
      });
      if (record) createdCodeIds.push(record.id);

      await expect(consumeCode(record!.id, adminUserId)).rejects.toMatchObject({
        code: 'CODE_VERIFICATION_EXPIRED',
        statusCode: 400,
      });
    });
  });
});
