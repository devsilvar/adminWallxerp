/**
 * Authentication Edge Cases & Security Tests
 * 
 * Coverage:
 * - SQL injection attempts
 * - XSS attempts in input fields
 * - Email enumeration protection
 * - Rate limiting
 * - Token manipulation
 * - Concurrent registration attempts
 * - Case sensitivity handling
 * - Unicode and special characters
 * - Boundary conditions
 */

import request from 'supertest';
import crypto from 'crypto';
import app from '../../src/app';
import prisma from '../../src/lib/prisma';
import bcrypt from 'bcrypt';

describe('Authentication Security & Edge Cases', () => {
  const validPassword = 'SecurePass123!';

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('SQL Injection Prevention', () => {
    it('should handle SQL injection in email field', async () => {
      const maliciousEmail = "admin'--";
      
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: maliciousEmail,
          password: validPassword,
        })
        .expect(400); // Should fail validation before reaching DB

      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should handle SQL injection in registration', async () => {
      const maliciousEmail = "test@example.com'; DROP TABLE users; --";
      
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: maliciousEmail,
          password: validPassword,
        })
        .expect(400);

      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('XSS Prevention', () => {
    it('should reject XSS in email field', async () => {
      const xssEmail = '<script>alert("xss")</script>@test.com';
      
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: xssEmail,
          password: validPassword,
        })
        .expect(400);

      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should sanitize fullName if provided', async () => {
      const xssName = '<script>alert("xss")</script>';
      const safeEmail = `xss-test-${Date.now()}@example.com`;
      
      // First register
      const registerRes = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: safeEmail,
          password: validPassword,
        })
        .expect(201);

      const accessToken = registerRes.body.data.accessToken;
      const userId = registerRes.body.data.user.id;

      // Try to update with XSS in fullName
      const updateRes = await request(app)
        .patch('/api/v1/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          fullName: xssName,
        });

      // Should either reject or sanitize
      if (updateRes.status === 200) {
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { fullName: true },
        });
        
        // Ensure raw script tags are not stored
        expect(user?.fullName).not.toContain('<script>');
      }

      // Cleanup
      await prisma.user.delete({ where: { id: userId } }).catch(() => {});
    });
  });

  describe('Email Enumeration Protection', () => {
    it('should not reveal if email exists on login failure', async () => {
      const existingEmail = `existing-${Date.now()}@example.com`;
      const nonExistentEmail = `nonexistent-${Date.now()}@example.com`;

      // Create a test user
      const passwordHash = await bcrypt.hash(validPassword, 10);
      const user = await prisma.user.create({
        data: {
          email: existingEmail,
          passwordHash,
          isVerified: true,
        },
      });

      // Try logging in with wrong password for existing user
      const res1 = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: existingEmail,
          password: 'WrongPassword123!',
        })
        .expect(401);

      // Try logging in with non-existent user
      const res2 = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: nonExistentEmail,
          password: validPassword,
        })
        .expect(401);

      // Both should return the same error code and message
      expect(res1.body.error.code).toBe(res2.body.error.code);
      expect(res1.body.error.message).toBe(res2.body.error.message);

      // Cleanup
      await prisma.user.delete({ where: { id: user.id } });
    });

    it('should not reveal if email exists on password reset request', async () => {
      const existingEmail = `reset-existing-${Date.now()}@example.com`;
      const nonExistentEmail = `reset-nonexistent-${Date.now()}@example.com`;

      // Create a test user
      const passwordHash = await bcrypt.hash(validPassword, 10);
      const user = await prisma.user.create({
        data: {
          email: existingEmail,
          passwordHash,
          isVerified: true,
        },
      });

      // Request reset for existing email
      const res1 = await request(app)
        .post('/api/v1/auth/forgot-password')
        .send({ email: existingEmail })
        .expect(200);

      // Request reset for non-existent email
      const res2 = await request(app)
        .post('/api/v1/auth/forgot-password')
        .send({ email: nonExistentEmail })
        .expect(200);

      // Both should return the same success message
      expect(res1.body.data.message).toBe(res2.body.data.message);

      // Cleanup
      await prisma.user.delete({ where: { id: user.id } });
    });
  });

  describe('Case Sensitivity & Normalization', () => {
    it('should treat emails case-insensitively', async () => {
      const email = `CaseTest${Date.now()}@Example.COM`;
      const lowerEmail = email.toLowerCase();

      // Register with mixed case
      const registerRes = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email,
          password: validPassword,
        })
        .expect(201);

      const userId = registerRes.body.data.user.id;

      // Login with lowercase
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: lowerEmail,
          password: validPassword,
        })
        .expect(200);

      expect(loginRes.body.success).toBe(true);

      // Verify email is stored in lowercase
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { email: true },
      });
      expect(user?.email).toBe(lowerEmail);

      // Cleanup
      await prisma.user.delete({ where: { id: userId } });
    });

    it('should reject duplicate registration with different case', async () => {
      const baseEmail = `duplicate${Date.now()}@example.com`;
      const upperEmail = baseEmail.toUpperCase();

      // Register with lowercase
      const res1 = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: baseEmail,
          password: validPassword,
        })
        .expect(201);

      const userId = res1.body.data.user.id;

      // Try to register with uppercase version
      const res2 = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: upperEmail,
          password: validPassword,
        })
        .expect(409);

      expect(res2.body.error.code).toBe('DUPLICATE_EMAIL');

      // Cleanup
      await prisma.user.delete({ where: { id: userId } });
    });
  });

  describe('Unicode & Special Characters', () => {
    it('should handle unicode characters in email local part', async () => {
      const unicodeEmail = `tëst${Date.now()}@example.com`;

      // This might fail validation depending on email validation rules
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: unicodeEmail,
          password: validPassword,
        });

      // Either accepts or rejects with validation error
      if (res.status === 201) {
        await prisma.user.delete({ where: { id: res.body.data.user.id } });
      } else {
        expect(res.status).toBe(400);
      }
    });

    it('should handle very long valid email', async () => {
      const longLocalPart = 'a'.repeat(64); // Max local part length
      const longEmail = `${longLocalPart}@example.com`;

      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: longEmail,
          password: validPassword,
        });

      // Should either accept or reject gracefully
      if (res.status === 201) {
        await prisma.user.delete({ where: { id: res.body.data.user.id } });
      }
    });

    it('should handle international phone numbers', async () => {
      const internationalPhone = '+447911123456'; // UK number
      const email = `intl-phone-${Date.now()}@example.com`;

      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email,
          phone: internationalPhone,
          password: validPassword,
        })
        .expect(201);

      expect(res.body.data.user.phone).toBe(internationalPhone);

      // Cleanup
      await prisma.user.delete({ where: { id: res.body.data.user.id } });
    });
  });

  describe('Boundary Conditions', () => {
    it('should reject password at minimum length - 1', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: `short-pw-${Date.now()}@example.com`,
          password: 'Short1A', // 7 chars, need 8
        })
        .expect(400);

      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should accept password at minimum length', async () => {
      const email = `min-pw-${Date.now()}@example.com`;
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email,
          password: 'MinPas1!', // Exactly 8 chars
        })
        .expect(201);

      await prisma.user.delete({ where: { id: res.body.data.user.id } });
    });

    it('should accept password at maximum length', async () => {
      const email = `max-pw-${Date.now()}@example.com`;
      const maxPassword = 'A1' + 'a'.repeat(126); // 128 chars total

      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email,
          password: maxPassword,
        })
        .expect(201);

      await prisma.user.delete({ where: { id: res.body.data.user.id } });
    });

    it('should reject password over maximum length', async () => {
      const tooLongPassword = 'A1' + 'a'.repeat(127); // 129 chars

      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: `toolong-pw-${Date.now()}@example.com`,
          password: tooLongPassword,
        })
        .expect(400);

      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('Token Manipulation', () => {
    it('should reject tampered JWT access token', async () => {
      // Create a valid user and get token
      const email = `token-test-${Date.now()}@example.com`;
      const passwordHash = await bcrypt.hash(validPassword, 10);
      
      const user = await prisma.user.create({
        data: {
          email,
          passwordHash,
          isVerified: true,
        },
      });

      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({ email, password: validPassword })
        .expect(200);

      const validToken = loginRes.body.data.accessToken;
      
      // Tamper with the token (change one character)
      const tamperedToken = validToken.slice(0, -1) + (validToken.slice(-1) === 'A' ? 'B' : 'A');

      // Try to use tampered token
      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${tamperedToken}`)
        .expect(401);

      expect(res.body.error.code).toBe('UNAUTHORIZED');

      // Cleanup
      await prisma.user.delete({ where: { id: user.id } });
    });

    it('should reject token with modified payload', async () => {
      // Attempt to use a token structure with manipulated claims
      // JWT structure: header.payload.signature
      const fakeToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJhZG1pbiIsImVtYWlsIjoiYWRtaW5AZXhhbXBsZS5jb20iLCJyb2xlIjoiYWRtaW4ifQ.fakesignature';

      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${fakeToken}`)
        .expect(401);

      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('Concurrent Operations', () => {
    it('should handle concurrent registrations with same email gracefully', async () => {
      const email = `concurrent-${Date.now()}@example.com`;

      // Fire off 3 concurrent registration requests
      const results = await Promise.allSettled([
        request(app).post('/api/v1/auth/register').send({ email, password: validPassword }),
        request(app).post('/api/v1/auth/register').send({ email, password: validPassword }),
        request(app).post('/api/v1/auth/register').send({ email, password: validPassword }),
      ]);

      // Exactly one should succeed, others should get DUPLICATE_EMAIL
      const succeeded = results.filter(
        (r) => r.status === 'fulfilled' && r.value.status === 201
      );
      const failed = results.filter(
        (r) => r.status === 'fulfilled' && r.value.status === 409
      );

      expect(succeeded.length).toBe(1);
      expect(failed.length).toBeGreaterThanOrEqual(1);

      // Cleanup
      const user = await prisma.user.findUnique({ where: { email } });
      if (user) {
        await prisma.user.delete({ where: { id: user.id } });
      }
    });

    it('should handle concurrent token refreshes', async () => {
      const email = `refresh-test-${Date.now()}@example.com`;
      const passwordHash = await bcrypt.hash(validPassword, 10);
      
      const user = await prisma.user.create({
        data: {
          email,
          passwordHash,
          isVerified: true,
        },
      });

      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({ email, password: validPassword })
        .expect(200);

      const refreshToken = loginRes.body.data.refreshToken;

      // Fire concurrent refresh requests
      const results = await Promise.allSettled([
        request(app).post('/api/v1/auth/refresh').send({ refreshToken }),
        request(app).post('/api/v1/auth/refresh').send({ refreshToken }),
        request(app).post('/api/v1/auth/refresh').send({ refreshToken }),
      ]);

      // All should succeed (refresh tokens are reusable until expired or explicitly revoked)
      const succeeded = results.filter(
        (r) => r.status === 'fulfilled' && r.value.status === 200
      );

      expect(succeeded.length).toBe(3);

      // Cleanup
      await prisma.user.delete({ where: { id: user.id } });
    });
  });

  describe('Rate Limiting', () => {
    it('should rate limit excessive registration attempts', async () => {
      const results: any[] = [];

      // Fire off many registration requests rapidly
      for (let i = 0; i < 20; i++) {
        const res = await request(app)
          .post('/api/v1/auth/register')
          .send({
            email: `rate-test-${Date.now()}-${i}@example.com`,
            password: validPassword,
          });
        
        results.push(res);
        
        // Stop if we hit rate limit
        if (res.status === 429) {
          break;
        }
      }

      // Should eventually get rate limited
      const rateLimited = results.find((r) => r.status === 429);
      expect(rateLimited).toBeDefined();
      if (rateLimited) {
        expect(rateLimited.body.error.code).toBe('RATE_LIMIT_EXCEEDED');
      }

      // Cleanup created users
      const emails = results
        .filter((r) => r.status === 201)
        .map((r) => r.body.data.user.email);
      
      await prisma.user.deleteMany({
        where: { email: { in: emails } },
      });
    }, 30000); // Increase timeout for this test

    it('should rate limit excessive login attempts', async () => {
      const email = `login-rate-test-${Date.now()}@example.com`;
      const passwordHash = await bcrypt.hash(validPassword, 10);
      
      const user = await prisma.user.create({
        data: {
          email,
          passwordHash,
          isVerified: true,
        },
      });

      const results: any[] = [];

      // Fire off many login requests rapidly
      for (let i = 0; i < 20; i++) {
        const res = await request(app)
          .post('/api/v1/auth/login')
          .send({
            email,
            password: 'WrongPassword123!',
          });
        
        results.push(res);
        
        if (res.status === 429) {
          break;
        }
      }

      // Should eventually get rate limited
      const rateLimited = results.find((r) => r.status === 429);
      expect(rateLimited).toBeDefined();

      // Cleanup
      await prisma.user.delete({ where: { id: user.id } });
    }, 30000);
  });

  describe('Empty and Null Values', () => {
    it('should reject empty email string', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: '',
          password: validPassword,
        })
        .expect(400);

      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should reject null email', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: null,
          password: validPassword,
        })
        .expect(400);

      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should reject empty password string', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: `empty-pw-${Date.now()}@example.com`,
          password: '',
        })
        .expect(400);

      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should handle optional phone as undefined gracefully', async () => {
      const email = `no-phone-${Date.now()}@example.com`;

      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email,
          password: validPassword,
          // phone is optional
        })
        .expect(201);

      expect(res.body.data.user.phone).toBeUndefined();

      // Cleanup
      await prisma.user.delete({ where: { id: res.body.data.user.id } });
    });
  });
});
