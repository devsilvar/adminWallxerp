import 'dotenv/config';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApp } from '../../src/app';
import { config } from '../../src/config';
import type { Application } from 'express';

describe('Admin / SME Session Isolation E2E Tests (Amend. B)', () => {
  let app: Application;
  let adminToken: string;
  let userToken: string;

  beforeAll(async () => {
    app = createApp();

    // Generate test JWTs with proper secrets
    adminToken = jwt.sign(
      { userId: 'admin-isolation-test-id', email: 'admin@paymytax.com', role: 'admin' },
      config.jwt.accessSecret,
      { expiresIn: '15m' }
    );

    userToken = jwt.sign(
      { userId: 'user-isolation-test-id', email: 'sme-owner@example.com', role: 'owner' },
      config.jwt.accessSecret,
      { expiresIn: '15m' }
    );
  });

  it('rejects admin JWT on SME business route with 403 ADMIN_CANNOT_USE_USER_APP', async () => {
    const res = await request(app)
      .get('/api/v1/businesses')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(403);
    expect(res.body.error).toBeDefined();
    expect(res.body.error.code).toBe('ADMIN_CANNOT_USE_USER_APP');
    expect(res.body.error.message).toContain('Admin sessions cannot access SME business data');
  });

  it('rejects admin JWT on SME wallet route with 403 ADMIN_CANNOT_USE_USER_APP', async () => {
    const res = await request(app)
      .get('/api/v1/wallet')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(403);
    expect(res.body.error).toBeDefined();
    expect(res.body.error.code).toBe('ADMIN_CANNOT_USE_USER_APP');
  });

  it('rejects regular user JWT on admin route with 403 FORBIDDEN', async () => {
    const res = await request(app)
      .get('/api/v1/admin/dashboard')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(403);
    expect(res.body.error).toBeDefined();
    expect(res.body.error.code).toBe('FORBIDDEN');
  });
});
