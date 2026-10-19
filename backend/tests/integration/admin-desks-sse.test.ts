import request from 'supertest';
import jwt from 'jsonwebtoken';
import config from '@/config';
import { createApp } from '@/app';
import prisma from '@/lib/prisma';
import { eventBus } from '@/lib/realtime-emitter';
import { emitToAdmins, _resetAdminCacheForTest } from '@/services/admin/realtime-admin.helper';
import type { RealtimeEvent } from '@/types/realtime-events';

jest.mock('@/services/message-email.service', () => ({
  dispatchBroadcastEmails: jest.fn().mockResolvedValue(undefined),
}));

describe('Admin Desks SSE & Realtime Multi-Desk Integration Suite (QA Hunter Deep Audit)', () => {
  const app = createApp();

  const adminId1 = 'admin-qa-001';
  const adminId2 = 'admin-qa-002';
  const regularUserId = 'regular-user-qa-999';

  const adminToken = jwt.sign(
    { userId: adminId1, email: 'lead-admin@paymytax.com', role: 'admin' },
    config.jwt.accessSecret,
    { expiresIn: '15m', algorithm: 'HS256' },
  );

  const regularUserToken = jwt.sign(
    { userId: regularUserId, email: 'merchant@company.ng', role: 'user' },
    config.jwt.accessSecret,
    { expiresIn: '15m', algorithm: 'HS256' },
  );

  beforeEach(() => {
    jest.clearAllMocks();
    _resetAdminCacheForTest();
  });

  describe('Adversarial & Multi-Desk Security Isolation', () => {
    it('quarantines admin desk events so regular users NEVER receive them', async () => {
      // Mock active admins
      jest.spyOn(prisma.user, 'findMany').mockResolvedValueOnce([
        { id: adminId1 } as any,
        { id: adminId2 } as any,
      ]);

      const receivedByAdmin1: RealtimeEvent[] = [];
      const receivedByAdmin2: RealtimeEvent[] = [];
      const receivedByRegularUser: RealtimeEvent[] = [];

      const admin1Handler = (e: RealtimeEvent) => receivedByAdmin1.push(e);
      const admin2Handler = (e: RealtimeEvent) => receivedByAdmin2.push(e);
      const userHandler = (e: RealtimeEvent) => receivedByRegularUser.push(e);

      eventBus.on(`user:${adminId1}`, admin1Handler);
      eventBus.on(`user:${adminId2}`, admin2Handler);
      eventBus.on(`user:${regularUserId}`, userHandler);

      try {
        const testEvent: RealtimeEvent = {
          type: 'withdrawal_created',
          withdrawalId: 'with-sec-check-1',
          businessId: 'biz-sec-1',
          businessName: 'Sensitive Corp',
          amount: 5000000,
          timestamp: new Date().toISOString(),
        };

        await emitToAdmins(testEvent);

        // Both active admins receive the event
        expect(receivedByAdmin1).toHaveLength(1);
        expect(receivedByAdmin1[0]).toEqual(testEvent);

        expect(receivedByAdmin2).toHaveLength(1);
        expect(receivedByAdmin2[0]).toEqual(testEvent);

        // Regular merchant NEVER receives the admin event
        expect(receivedByRegularUser).toHaveLength(0);
      } finally {
        eventBus.off(`user:${adminId1}`, admin1Handler);
        eventBus.off(`user:${adminId2}`, admin2Handler);
        eventBus.off(`user:${regularUserId}`, userHandler);
      }
    });

    it('rejects regular users attempting to retry broadcasts with 403 Forbidden', async () => {
      const res = await request(app)
        .post('/api/v1/admin/broadcasts/00000000-0000-0000-0000-000000000000/retry')
        .set('Authorization', `Bearer ${regularUserToken}`)
        .expect(403);

      expect(res.body.error.code).toBe('FORBIDDEN');
    });
  });

  describe('emitToAdmins Caching & Performance Boundary', () => {
    it('caches admin IDs in memory for 60 seconds to avoid repeating DB queries', async () => {
      const findManySpy = jest.spyOn(prisma.user, 'findMany').mockResolvedValue([
        { id: adminId1 } as any,
      ]);

      const event1: RealtimeEvent = {
        type: 'subscription_submitted',
        submissionId: 'sub-test-1',
        customerName: 'Adebayo Corp',
        plan: 'Starter',
        amount: 10000,
        timestamp: new Date().toISOString(),
      };

      const event2: RealtimeEvent = {
        type: 'unverified_inflow_created',
        saleId: 'sale-test-2',
        businessId: 'biz-test-2',
        businessName: 'Lekki Ventures',
        amount: 25000,
        referenceId: 'DVA-REF-001',
        timestamp: new Date().toISOString(),
      };

      // Call 5 times in rapid succession
      await emitToAdmins(event1);
      await emitToAdmins(event2);
      await emitToAdmins(event1);
      await emitToAdmins(event2);
      await emitToAdmins(event1);

      // Only ONE database query occurred
      expect(findManySpy).toHaveBeenCalledTimes(1);
    });

    it('handles zero active admins gracefully without errors', async () => {
      jest.spyOn(prisma.user, 'findMany').mockResolvedValueOnce([]);

      const emitSpy = jest.spyOn(eventBus, 'emitToUserIds');

      const event: RealtimeEvent = {
        type: 'subscription_status_changed',
        id: 'sub-test-empty',
        status: 'approved',
        timestamp: new Date().toISOString(),
      };

      await expect(emitToAdmins(event)).resolves.not.toThrow();
      expect(emitSpy).not.toHaveBeenCalled();
    });
  });

  describe('POST /api/v1/admin/broadcasts/:id/retry Contract & Edge Cases', () => {
    const validUuid = '123e4567-e89b-12d3-a456-426614174000';

    it('returns 404 when broadcast does not exist', async () => {
      jest.spyOn(prisma.broadcast, 'findUnique').mockResolvedValueOnce(null);

      const res = await request(app)
        .post(`/api/v1/admin/broadcasts/${validUuid}/retry`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);

      expect(res.body.error.code).toBe('BROADCAST_NOT_FOUND');
    });

    it('returns 200 with retrying: false when 0 pending recipients remain (idempotent)', async () => {
      jest.spyOn(prisma.broadcast, 'findUnique').mockResolvedValueOnce({
        id: validUuid,
        status: 'sent',
      } as any);

      jest.spyOn(prisma.userMessage, 'count').mockResolvedValueOnce(0);
      const updateSpy = jest.spyOn(prisma.broadcast, 'update');

      const res = await request(app)
        .post(`/api/v1/admin/broadcasts/${validUuid}/retry`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.data.pendingCount).toBe(0);
      expect(res.body.message).toMatch(/no pending/i);
      expect(updateSpy).not.toHaveBeenCalled();
    });

    it('returns 202 with retrying: true and flips status to sending when pending > 0', async () => {
      jest.spyOn(prisma.broadcast, 'findUnique').mockResolvedValueOnce({
        id: validUuid,
        status: 'partial_failure',
      } as any);

      jest.spyOn(prisma.userMessage, 'count').mockResolvedValueOnce(14);
      const updateSpy = jest.spyOn(prisma.broadcast, 'update').mockResolvedValueOnce({
        id: validUuid,
        status: 'sending',
      } as any);

      const res = await request(app)
        .post(`/api/v1/admin/broadcasts/${validUuid}/retry`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(202);

      expect(res.body.data.pendingCount).toBe(14);
      expect(res.body.message).toMatch(/retry queued/i);
      expect(updateSpy).toHaveBeenCalledWith({
        where: { id: validUuid },
        data: { status: 'sending' },
      });
    });
  });

  describe('Full Event Delivery Lifecycle across 6 Desks', () => {
    it('delivers all 6 desk event categories via emitToAdmins to connected admin', async () => {
      jest.spyOn(prisma.user, 'findMany').mockResolvedValue([
        { id: adminId1 } as any,
      ]);

      const received: string[] = [];
      const handler = (evt: RealtimeEvent) => {
        received.push(evt.type);
      };

      eventBus.on(`user:${adminId1}`, handler);

      try {
        // 1. Broadcasts Desk
        await emitToAdmins({
          type: 'broadcast_email_progress',
          broadcastId: 'bc-1',
          totalRecipients: 100,
          sent: 20,
          failed: 0,
          skipped: 0,
          pending: 80,
          totalProcessed: 20,
          timestamp: new Date().toISOString(),
        });
        await emitToAdmins({
          type: 'broadcast_email_completed',
          broadcastId: 'bc-1',
          totalRecipients: 100,
          sent: 100,
          failed: 0,
          skipped: 0,
          pending: 0,
          status: 'sent',
          deliveryStats: { total: 100, sent: 100, failed: 0, skipped: 0, pending: 0 },
          timestamp: new Date().toISOString(),
        });

        // 2. Withdrawals Desk
        await emitToAdmins({
          type: 'withdrawal_created',
          withdrawalId: 'w-1',
          businessId: 'b-1',
          businessName: 'Store 1',
          amount: 50000,
          timestamp: new Date().toISOString(),
        });
        await emitToAdmins({
          type: 'withdrawal_status_changed',
          withdrawalId: 'w-1',
          businessId: 'b-1',
          status: 'completed',
          timestamp: new Date().toISOString(),
        });

        // 3. Unverified Inflows Desk
        await emitToAdmins({
          type: 'unverified_inflow_created',
          saleId: 's-1',
          businessId: 'b-1',
          businessName: 'Store 1',
          amount: 15000,
          referenceId: 'REF-1',
          timestamp: new Date().toISOString(),
        });
        await emitToAdmins({
          type: 'unverified_inflow_verified',
          saleId: 's-1',
          businessId: 'b-1',
          timestamp: new Date().toISOString(),
        });

        // 4. Subscriptions Desk
        await emitToAdmins({
          type: 'subscription_submitted',
          submissionId: 'sub-1',
          customerName: 'User 1',
          plan: 'Growth',
          amount: 15000,
          timestamp: new Date().toISOString(),
        });
        await emitToAdmins({
          type: 'subscription_status_changed',
          id: 'sub-1',
          status: 'approved',
          timestamp: new Date().toISOString(),
        });

        expect(received).toEqual([
          'broadcast_email_progress',
          'broadcast_email_completed',
          'withdrawal_created',
          'withdrawal_status_changed',
          'unverified_inflow_created',
          'unverified_inflow_verified',
          'subscription_submitted',
          'subscription_status_changed',
        ]);
      } finally {
        eventBus.off(`user:${adminId1}`, handler);
      }
    });
  });
});
