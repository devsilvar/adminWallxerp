import 'dotenv/config';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { createApp } from '../../src/app';
import prisma from '../../src/lib/prisma';
import config from '../../src/config';
import { issueCode } from '../../src/services/auth/account-code.service';
import { AccountCodePurpose } from '@prisma/client';

describe('Admin Account HTTP Endpoints — Phase 8 (qahunter.md RTM)', () => {
  const app = createApp();
  const TEST_ADMIN_EMAIL = 'richmond@wallx.co';
  let adminUserId: string;
  let adminToken: string;
  let merchantToken: string;
  const createdCodeIds: string[] = [];

  beforeAll(async () => {
    const admin = await prisma.user.findUnique({
      where: { email: TEST_ADMIN_EMAIL },
    });
    if (!admin) throw new Error(`Admin ${TEST_ADMIN_EMAIL} must exist in database.`);
    adminUserId = admin.id;

    adminToken = jwt.sign(
      { userId: admin.id, email: admin.email, role: 'admin' },
      config.jwt.accessSecret,
      { expiresIn: '15m' }
    );

    merchantToken = jwt.sign(
      { userId: '00000000-0000-0000-0000-000000000099', email: 'merchant@test.com', role: 'user' },
      config.jwt.accessSecret,
      { expiresIn: '15m' }
    );
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
    // Restore original password for richmond@wallx.co
    const hash = await bcrypt.hash('Innovation@101', 10);
    await prisma.user.update({
      where: { id: adminUserId },
      data: { passwordHash: hash },
    });
    await prisma.$disconnect();
  });

  // REQ-API-01: Authentication & Authorization Gate
  describe('Route Access Guards', () => {
    it('rejects unauthenticated requests with 401 [security]', async () => {
      const res = await request(app).post('/api/v1/admin/account/password/request-code');
      expect(res.status).toBe(401);
    });

    it('rejects non-admin (merchant) access token with 403 Forbidden [security]', async () => {
      const res = await request(app)
        .post('/api/v1/admin/account/password/request-code')
        .set('Authorization', `Bearer ${merchantToken}`);
      expect(res.status).toBe(403);
    });

    it('permits authorized admin token [positive]', async () => {
      const res = await request(app)
        .post('/api/v1/admin/account/password/request-code')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);

      const record = await prisma.accountSecurityCode.findFirst({
        where: { userId: adminUserId },
        orderBy: { createdAt: 'desc' },
      });
      if (record) createdCodeIds.push(record.id);
    });
  });

  // REQ-API-02: Request Password Code Endpoint
  describe('POST /api/v1/admin/account/password/request-code', () => {
    it('dispatches code and returns masked email without leaking code [positive/security]', async () => {
      const res = await request(app)
        .post('/api/v1/admin/account/password/request-code')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.emailHint).toBe('ri***@wallx.co');
      expect(res.body.data.expiresInMinutes).toBe(10);
      expect(res.body.data.delivered).toBeDefined();

      // STRICT SECURITY INVARIANT: The code must NEVER be returned in response body
      expect(res.body.data.code).toBeUndefined();
      expect(JSON.stringify(res.body)).not.toMatch(/^[0-9]{6}$/);

      const record = await prisma.accountSecurityCode.findFirst({
        where: { userId: adminUserId },
        orderBy: { createdAt: 'desc' },
      });
      expect(record).not.toBeNull();
      if (record) createdCodeIds.push(record.id);
    });
  });

  // REQ-API-03: Verify Password Code Endpoint
  describe('POST /api/v1/admin/account/password/verify-code', () => {
    it('rejects malformed code input with 400 validation error [negative]', async () => {
      const res = await request(app)
        .post('/api/v1/admin/account/password/verify-code')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ code: 'abc' });

      expect(res.status).toBe(400);
    });

    it('rejects incorrect code with 400 INVALID_CODE and remaining attempts [negative/boundary]', async () => {
      // Issue a fresh code
      const { code } = await issueCode(adminUserId, AccountCodePurpose.admin_password_change);
      const record = await prisma.accountSecurityCode.findFirst({
        where: { userId: adminUserId },
        orderBy: { createdAt: 'desc' },
      });
      if (record) createdCodeIds.push(record.id);

      const wrongCode = code === '111111' ? '222222' : '111111';
      const res = await request(app)
        .post('/api/v1/admin/account/password/verify-code')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ code: wrongCode });

      expect(res.status).toBe(400);
      expect(res.body.error?.code).toBe('INVALID_CODE');
      expect(res.body.error?.details?.remainingAttempts).toBe(4);
    });

    it('verifies correct code and returns signed change ticket JWT [positive]', async () => {
      const { code } = await issueCode(adminUserId, AccountCodePurpose.admin_password_change);
      const record = await prisma.accountSecurityCode.findFirst({
        where: { userId: adminUserId },
        orderBy: { createdAt: 'desc' },
      });
      if (record) createdCodeIds.push(record.id);

      const res = await request(app)
        .post('/api/v1/admin/account/password/verify-code')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ code });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.changeTicket).toBeDefined();

      const decoded: any = jwt.verify(res.body.data.changeTicket, config.jwt.accessSecret);
      expect(decoded.sub).toBe(adminUserId);
      expect(decoded.purpose).toBe('admin_password_change');
      expect(decoded.jti).toBe(record!.id);
    });
  });

  // REQ-API-04: Complete Password Change Endpoint
  describe('POST /api/v1/admin/account/password/complete', () => {
    it('completes password change, revokes sessions, and enforces single-use ticket [positive/security]', async () => {
      // 1. Issue & Verify code
      const { code } = await issueCode(adminUserId, AccountCodePurpose.admin_password_change);
      const record = await prisma.accountSecurityCode.findFirst({
        where: { userId: adminUserId },
        orderBy: { createdAt: 'desc' },
      });
      if (record) createdCodeIds.push(record.id);

      const verifyRes = await request(app)
        .post('/api/v1/admin/account/password/verify-code')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ code });

      const changeTicket = verifyRes.body.data.changeTicket;
      expect(changeTicket).toBeDefined();

      // 2. Complete password change
      const newPassword = 'NewSecretAdminPassword@2026';
      const completeRes = await request(app)
        .post('/api/v1/admin/account/password/complete')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          changeTicket,
          newPassword,
          confirmPassword: newPassword,
        });

      expect(completeRes.status).toBe(200);
      expect(completeRes.body.success).toBe(true);
      expect(completeRes.body.data.signedOut).toBe(true);

      // Verify DB password updated
      const updatedUser = await prisma.user.findUnique({ where: { id: adminUserId } });
      const passwordMatches = await bcrypt.compare(newPassword, updatedUser!.passwordHash);
      expect(passwordMatches).toBe(true);

      // 3. Attempt replay with the same ticket -> MUST be rejected (single-use)
      const replayRes = await request(app)
        .post('/api/v1/admin/account/password/complete')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          changeTicket,
          newPassword: 'AnotherPassword@2026',
          confirmPassword: 'AnotherPassword@2026',
        });

      expect(replayRes.status).toBe(400);
      expect(replayRes.body.error?.code).toBe('CODE_VERIFICATION_EXPIRED');
    });

    it('rejects request when newPassword and confirmPassword do not match [negative]', async () => {
      const res = await request(app)
        .post('/api/v1/admin/account/password/complete')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          changeTicket: 'dummy-ticket',
          newPassword: 'ValidPassword@101',
          confirmPassword: 'NonMatchingPassword@102',
        });

      expect(res.status).toBe(400);
    });

    it('rejects tampered or invalid change ticket with 401 [security]', async () => {
      const fakeTicket = jwt.sign(
        { sub: adminUserId, purpose: 'wrong_purpose', jti: 'fake-id' },
        config.jwt.accessSecret
      );

      const res = await request(app)
        .post('/api/v1/admin/account/password/complete')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          changeTicket: fakeTicket,
          newPassword: 'ValidPassword@101',
          confirmPassword: 'ValidPassword@101',
        });

      expect(res.status).toBe(401);
      expect(res.body.error?.code).toBe('INVALID_TICKET');
    });
  });
});
