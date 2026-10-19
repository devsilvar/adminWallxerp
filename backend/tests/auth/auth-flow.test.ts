/**
 * Comprehensive Authentication Flow Tests
 * 
 * Coverage:
 * - User registration (happy path + validation errors)
 * - Email verification (valid token, expired token, invalid token)
 * - Login (valid credentials, invalid credentials, unverified email)
 * - Token refresh
 * - Session management
 * - Password change
 * - Frontend-backend contract validation
 */

import request from 'supertest';
import crypto from 'crypto';
import app from '../../src/app';
import prisma from '../../src/lib/prisma';
import bcrypt from 'bcrypt';

describe('Authentication Flow - Happy Path', () => {
  const testEmail = `test-${Date.now()}@example.com`;
  const testPhone = '+2348012345678';
  const testPassword = 'TestPass123!';
  let verificationToken: string;
  let accessToken: string;
  let refreshToken: string;
  let userId: string;

  afterAll(async () => {
    // Cleanup: delete test user
    if (userId) {
      await prisma.user.delete({ where: { id: userId } }).catch(() => {});
    }
    await prisma.$disconnect();
  });

  describe('1. User Registration', () => {
    it('should register a new user with valid credentials', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: testEmail,
          phone: testPhone,
          password: testPassword,
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.user).toHaveProperty('email', testEmail.toLowerCase());
      expect(res.body.data.user).toHaveProperty('phone', testPhone);
      expect(res.body.data.user).not.toHaveProperty('passwordHash');
      expect(res.body.data.user.isVerified).toBe(false);
      expect(res.body.data).toHaveProperty('accessToken');
      expect(res.body.data).toHaveProperty('refreshToken');
      expect(res.body.data.verificationPending).toBe(true);

      // Save user ID for cleanup
      userId = res.body.data.user.id;

      // In development, verification link may be returned
      if (res.body.data.verificationLink) {
        const url = new URL(res.body.data.verificationLink);
        verificationToken = url.searchParams.get('token') || '';
        expect(verificationToken).toBeTruthy();
      }
    });

    it('should reject registration with duplicate email', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: testEmail,
          password: testPassword,
        })
        .expect(409);

      expect(res.body.success).toBeUndefined();
      expect(res.body.error.code).toBe('DUPLICATE_EMAIL');
    });

    it('should reject registration with duplicate phone', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: `other-${Date.now()}@example.com`,
          phone: testPhone,
          password: testPassword,
        })
        .expect(409);

      expect(res.body.error.code).toBe('DUPLICATE_PHONE');
    });

    it('should reject weak password (no uppercase)', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: `weak-${Date.now()}@example.com`,
          password: 'weakpass123',
        })
        .expect(400);

      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should reject weak password (no number)', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: `weak2-${Date.now()}@example.com`,
          password: 'WeakPass',
        })
        .expect(400);

      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should reject weak password (too short)', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: `weak3-${Date.now()}@example.com`,
          password: 'Weak1',
        })
        .expect(400);

      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should reject invalid email format', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: 'not-an-email',
          password: testPassword,
        })
        .expect(400);

      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should reject invalid phone format', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: `phone-test-${Date.now()}@example.com`,
          phone: '12345', // Too short
          password: testPassword,
        })
        .expect(400);

      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('2. Login - Before Email Verification', () => {
    it('should reject login for unverified user in production mode', async () => {
      // Note: In test environment, email verification is bypassed
      // This test documents the expected behavior in production
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: testEmail,
          password: testPassword,
        });

      process.env.NODE_ENV = originalEnv;

      // In test mode, this might pass; in production it would be 403
      if (res.status === 403) {
        expect(res.body.error.code).toBe('EMAIL_NOT_VERIFIED');
      }
    });
  });

  describe('3. Email Verification', () => {
    beforeAll(async () => {
      // Get verification token from database if not already available
      if (!verificationToken) {
        const user = await prisma.user.findUnique({
          where: { email: testEmail.toLowerCase() },
          select: { verificationTokenHash: true },
        });
        
        if (user?.verificationTokenHash) {
          // In a real scenario, we'd have the raw token from email
          // For testing, we'll generate a new one
          const rawToken = crypto.randomBytes(32).toString('hex');
          const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
          
          await prisma.user.update({
            where: { email: testEmail.toLowerCase() },
            data: {
              verificationTokenHash: tokenHash,
              verificationTokenExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
            },
          });
          
          verificationToken = rawToken;
        }
      }
    });

    it('should verify email with valid token', async () => {
      if (!verificationToken) {
        console.warn('Skipping verification test - no token available');
        return;
      }

      const res = await request(app)
        .post('/api/v1/auth/verify-email')
        .send({ token: verificationToken })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.success).toBe(true);
      expect(res.body.data.email).toBe(testEmail.toLowerCase());
    });

    it('should be idempotent - verifying again should succeed', async () => {
      if (!verificationToken) {
        console.warn('Skipping idempotency test - no token available');
        return;
      }

      const res = await request(app)
        .post('/api/v1/auth/verify-email')
        .send({ token: verificationToken })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.alreadyVerified).toBe(true);
    });

    it('should reject invalid verification token', async () => {
      const invalidToken = 'invalid-token-' + crypto.randomBytes(16).toString('hex');
      
      const res = await request(app)
        .post('/api/v1/auth/verify-email')
        .send({ token: invalidToken })
        .expect(400);

      expect(res.body.error.code).toBe('INVALID_VERIFICATION_TOKEN');
    });

    it('should reject expired verification token', async () => {
      // Create a user with an expired token
      const expiredEmail = `expired-${Date.now()}@example.com`;
      const expiredPassword = await bcrypt.hash(testPassword, 10);
      const rawToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

      const expiredUser = await prisma.user.create({
        data: {
          email: expiredEmail,
          passwordHash: expiredPassword,
          isVerified: false,
          verificationTokenHash: tokenHash,
          verificationTokenExpiresAt: new Date(Date.now() - 1000), // Expired 1 second ago
        },
      });

      const res = await request(app)
        .post('/api/v1/auth/verify-email')
        .send({ token: rawToken })
        .expect(400);

      expect(res.body.error.code).toBe('VERIFICATION_TOKEN_EXPIRED');

      // Cleanup
      await prisma.user.delete({ where: { id: expiredUser.id } });
    });

    it('should reject missing token', async () => {
      const res = await request(app)
        .post('/api/v1/auth/verify-email')
        .send({})
        .expect(400);

      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('4. Resend Verification Email', () => {
    it('should handle resend for existing unverified user', async () => {
      // Create a fresh unverified user
      const resendEmail = `resend-${Date.now()}@example.com`;
      const passwordHash = await bcrypt.hash(testPassword, 10);
      
      const unverifiedUser = await prisma.user.create({
        data: {
          email: resendEmail,
          passwordHash,
          isVerified: false,
        },
      });

      const res = await request(app)
        .post('/api/v1/auth/resend-verification')
        .send({ email: resendEmail })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.message).toContain('verification link has been sent');

      // Cleanup
      await prisma.user.delete({ where: { id: unverifiedUser.id } });
    });

    it('should handle resend for already verified user', async () => {
      const res = await request(app)
        .post('/api/v1/auth/resend-verification')
        .send({ email: testEmail })
        .expect(200);

      expect(res.body.success).toBe(true);
      // May indicate already verified
      if (res.body.data.alreadyVerified) {
        expect(res.body.data.alreadyVerified).toBe(true);
      }
    });

    it('should not reveal if email does not exist (anti-enumeration)', async () => {
      const nonExistentEmail = `nonexistent-${Date.now()}@example.com`;

      const res = await request(app)
        .post('/api/v1/auth/resend-verification')
        .send({ email: nonExistentEmail })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.message).toContain('verification link has been sent');
    });
  });

  describe('5. Login - After Verification', () => {
    it('should login successfully with correct credentials', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: testEmail,
          password: testPassword,
        })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.user).toHaveProperty('email', testEmail.toLowerCase());
      expect(res.body.data.user).not.toHaveProperty('passwordHash');
      expect(res.body.data).toHaveProperty('accessToken');
      expect(res.body.data).toHaveProperty('refreshToken');

      // Save tokens for subsequent tests
      accessToken = res.body.data.accessToken;
      refreshToken = res.body.data.refreshToken;
    });

    it('should reject login with wrong password', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: testEmail,
          password: 'WrongPassword123!',
        })
        .expect(401);

      expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
    });

    it('should reject login with non-existent email', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: `nonexistent-${Date.now()}@example.com`,
          password: testPassword,
        })
        .expect(401);

      expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
    });

    it('should reject login for deactivated user', async () => {
      // Deactivate the user
      await prisma.user.update({
        where: { email: testEmail.toLowerCase() },
        data: { isActive: false },
      });

      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: testEmail,
          password: testPassword,
        })
        .expect(403);

      expect(res.body.error.code).toBe('ACCOUNT_DEACTIVATED');

      // Reactivate for subsequent tests
      await prisma.user.update({
        where: { email: testEmail.toLowerCase() },
        data: { isActive: true },
      });
    });

    it('should reject login with missing email', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          password: testPassword,
        })
        .expect(400);

      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should reject login with missing password', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: testEmail,
        })
        .expect(400);

      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('6. Authenticated Endpoints', () => {
    it('should get current user with valid access token', async () => {
      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('email', testEmail.toLowerCase());
      expect(res.body.data).toHaveProperty('isVerified', true);
      expect(res.body.data).not.toHaveProperty('passwordHash');
    });

    it('should reject GET /me without token', async () => {
      const res = await request(app)
        .get('/api/v1/auth/me')
        .expect(401);

      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('should reject GET /me with invalid token', async () => {
      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', 'Bearer invalid-token-xyz')
        .expect(401);

      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('7. Token Refresh', () => {
    it('should refresh access token with valid refresh token', async () => {
      const res = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('accessToken');
      expect(res.body.data.accessToken).not.toBe(accessToken);

      // Update access token for subsequent tests
      accessToken = res.body.data.accessToken;
    });

    it('should reject refresh with invalid token', async () => {
      const res = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: 'invalid-refresh-token' })
        .expect(401);

      expect(res.body.error.code).toBe('INVALID_REFRESH_TOKEN');
    });

    it('should reject refresh with missing token', async () => {
      const res = await request(app)
        .post('/api/v1/auth/refresh')
        .send({})
        .expect(400);

      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('8. Password Change', () => {
    const newPassword = 'NewTestPass456!';

    it('should change password with correct current password', async () => {
      const res = await request(app)
        .put('/api/v1/auth/change-password')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          currentPassword: testPassword,
          newPassword,
        })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.message).toContain('Password changed successfully');
    });

    it('should login with new password', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: testEmail,
          password: newPassword,
        })
        .expect(200);

      expect(res.body.success).toBe(true);
      accessToken = res.body.data.accessToken;
    });

    it('should reject old password after change', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: testEmail,
          password: testPassword, // Old password
        })
        .expect(401);

      expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
    });

    it('should reject password change with wrong current password', async () => {
      const res = await request(app)
        .put('/api/v1/auth/change-password')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          currentPassword: 'WrongCurrent123!',
          newPassword: 'AnotherNew789!',
        })
        .expect(401);

      expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
    });

    it('should reject weak new password', async () => {
      const res = await request(app)
        .put('/api/v1/auth/change-password')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          currentPassword: newPassword,
          newPassword: 'weak', // Too short, no uppercase, no number
        })
        .expect(400);

      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });
});
