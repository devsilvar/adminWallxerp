import 'dotenv/config';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApp } from '../../src/app';
import { config } from '../../src/config';
import prisma from '../../src/lib/prisma';
import type { Application } from 'express';

describe('Broadcasts & User Messaging E2E Tests', () => {
  let app: Application;
  let adminToken: string;
  let userToken: string;
  let otherUserToken: string;
  let adminId: string;
  let userId: string;
  let otherUserId: string;

  beforeAll(async () => {
    app = createApp();

    // Ensure test users exist in DB
    const adminUser = await prisma.user.upsert({
      where: { email: 'broadcast-admin-e2e@test.com' },
      update: { role: 'admin', isActive: true },
      create: {
        email: 'broadcast-admin-e2e@test.com',
        passwordHash: 'dummy',
        role: 'admin',
        isActive: true,
      },
    });
    adminId = adminUser.id;

    const regularUser = await prisma.user.upsert({
      where: { email: 'broadcast-user-e2e@test.com' },
      update: { role: 'user', isActive: true },
      create: {
        email: 'broadcast-user-e2e@test.com',
        passwordHash: 'dummy',
        role: 'user',
        isActive: true,
      },
    });
    userId = regularUser.id;

    const otherUser = await prisma.user.upsert({
      where: { email: 'broadcast-other-e2e@test.com' },
      update: { role: 'user', isActive: true },
      create: {
        email: 'broadcast-other-e2e@test.com',
        passwordHash: 'dummy',
        role: 'user',
        isActive: true,
      },
    });
    otherUserId = otherUser.id;

    adminToken = jwt.sign(
      { userId: adminId, email: 'broadcast-admin-e2e@test.com', role: 'admin' },
      config.jwt.accessSecret,
      { expiresIn: '15m' },
    );

    userToken = jwt.sign(
      { userId, email: 'broadcast-user-e2e@test.com', role: 'owner' },
      config.jwt.accessSecret,
      { expiresIn: '15m' },
    );

    otherUserToken = jwt.sign(
      { userId: otherUserId, email: 'broadcast-other-e2e@test.com', role: 'owner' },
      config.jwt.accessSecret,
      { expiresIn: '15m' },
    );
  });

  afterAll(async () => {
    // Clean up created test broadcasts and user messages
    const broadcasts = await prisma.broadcast.findMany({
      where: { createdById: adminId },
      select: { id: true },
    });
    const ids = broadcasts.map((b) => b.id);
    if (ids.length > 0) {
      await prisma.userMessage.deleteMany({
        where: { broadcastId: { in: ids } },
      });
      await prisma.broadcast.deleteMany({
        where: { id: { in: ids } },
      });
    }

    await prisma.user.deleteMany({
      where: {
        id: { in: [adminId, userId, otherUserId] },
      },
    });

    await prisma.$disconnect();
  });

  it('rejects unauthenticated requests on admin broadcasts with 401', async () => {
    const res = await request(app).get('/api/v1/admin/broadcasts');
    expect(res.status).toBe(401);
  });

  it('rejects non-admin users from creating broadcasts with 403', async () => {
    const res = await request(app)
      .post('/api/v1/admin/broadcasts')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        title: 'Unauthorized Broadcast',
        body: 'This should fail immediately with 403',
        audience: { type: 'all' },
      });

    expect(res.status).toBe(403);
  });

  it('rejects invalid inputs on broadcast creation with 400', async () => {
    const res = await request(app)
      .post('/api/v1/admin/broadcasts')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'ab', // < 3 chars
        body: 'short', // < 10 chars
        audience: { type: 'all' },
      });

    expect(res.status).toBe(400);
  });

  it('allows admin to create a direct broadcast to a specific user', async () => {
    const res = await request(app)
      .post('/api/v1/admin/broadcasts')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Direct Message to User',
        body: 'This is a dedicated direct message for E2E testing purposes.',
        audience: { type: 'user', userId },
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBeDefined();
    expect(res.body.data.totalRecipients).toBe(1);

    const broadcastId = res.body.data.id;

    // Verify User receives message in inbox
    const inboxRes = await request(app)
      .get('/api/v1/messages')
      .set('Authorization', `Bearer ${userToken}`);

    expect(inboxRes.status).toBe(200);
    expect(inboxRes.body.success).toBe(true);
    const userMsg = inboxRes.body.data.find(
      (m: any) => m.broadcastId === broadcastId,
    );
    expect(userMsg).toBeDefined();
    expect(userMsg.isRead).toBe(false);

    // Verify other user did NOT receive this direct message
    const otherInboxRes = await request(app)
      .get('/api/v1/messages')
      .set('Authorization', `Bearer ${otherUserToken}`);

    const otherMsg = otherInboxRes.body.data.find(
      (m: any) => m.broadcastId === broadcastId,
    );
    expect(otherMsg).toBeUndefined();

    // Verify user can get unread count
    const unreadRes = await request(app)
      .get('/api/v1/messages/unread-count')
      .set('Authorization', `Bearer ${userToken}`);
    expect(unreadRes.status).toBe(200);
    expect(unreadRes.body.count).toBeGreaterThanOrEqual(1);

    // Verify other user trying to mark this message as read gets 404 (anti-enumeration)
    const unauthorizedMarkRes = await request(app)
      .patch(`/api/v1/messages/${userMsg.id}/read`)
      .set('Authorization', `Bearer ${otherUserToken}`);
    expect(unauthorizedMarkRes.status).toBe(404);

    // Verify legitimate user can mark read
    const markReadRes = await request(app)
      .patch(`/api/v1/messages/${userMsg.id}/read`)
      .set('Authorization', `Bearer ${userToken}`);
    expect(markReadRes.status).toBe(200);
    expect(markReadRes.body.data.isRead).toBe(true);

    // Verify mark all read
    const markAllRes = await request(app)
      .patch('/api/v1/messages/read-all')
      .set('Authorization', `Bearer ${userToken}`);
    expect(markAllRes.status).toBe(200);

    // Verify admin can fetch broadcast detail
    const detailRes = await request(app)
      .get(`/api/v1/admin/broadcasts/${broadcastId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(detailRes.status).toBe(200);
    expect(detailRes.body.data.title).toBe('Direct Message to User');
  });

  it('allows admin to list broadcasts with pagination and stats', async () => {
    const res = await request(app)
      .get('/api/v1/admin/broadcasts?page=1&limit=10')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.pagination).toBeDefined();
    expect(res.body.stats).toBeDefined();
  });
});
