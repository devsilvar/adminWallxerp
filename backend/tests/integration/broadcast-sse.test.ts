import request from 'supertest';
import jwt from 'jsonwebtoken';
import config from '@/config';
import { createApp } from '@/app';
import { eventBus } from '@/lib/realtime-emitter';
import type { RealtimeEvent } from '@/types/realtime-events';

describe('Broadcast and SSE Integration Tests (Step 1)', () => {
  const app = createApp();

  const adminToken = jwt.sign(
    { userId: 'admin-broadcast-test', email: 'admin@paymytax.com', role: 'admin' },
    config.jwt.accessSecret,
    { expiresIn: '15m', algorithm: 'HS256' },
  );

  it('GET /api/v1/events/ticket returns a valid SSE ticket with aud: "sse"', async () => {
    const res = await request(app)
      .get('/api/v1/events/ticket')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body.ticket).toBeDefined();

    const decoded = jwt.verify(
      res.body.ticket,
      (config as any).realtime.ticketSecret,
      { algorithms: ['HS256'], audience: 'sse' } as any,
    ) as any;

    expect(decoded.userId).toBe('admin-broadcast-test');
    expect(decoded.aud).toBe('sse');
  });

  it('GET /api/v1/events/stream rejects requests without ticket with 401', async () => {
    const res = await request(app).get('/api/v1/events/stream').expect(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('eventBus emits typed broadcast progress and completion events to user listener', (done) => {
    const targetUserId = 'admin-listener-1';
    const receivedEvents: RealtimeEvent[] = [];

    const handler = (evt: RealtimeEvent) => {
      receivedEvents.push(evt);
      if (evt.type === 'broadcast_email_completed') {
        expect(receivedEvents).toHaveLength(2);
        expect(receivedEvents[0].type).toBe('broadcast_email_progress');
        expect(receivedEvents[1].type).toBe('broadcast_email_completed');
        eventBus.off(`user:${targetUserId}`, handler);
        done();
      }
    };

    eventBus.on(`user:${targetUserId}`, handler);

    // Emit progress event
    eventBus.emitToUserIds([targetUserId], {
      type: 'broadcast_email_progress',
      broadcastId: 'bc-test-live',
      totalRecipients: 20,
      sent: 10,
      failed: 0,
      skipped: 0,
      pending: 10,
      totalProcessed: 10,
      timestamp: new Date().toISOString(),
    });

    // Emit completed event
    eventBus.emitToUserIds([targetUserId], {
      type: 'broadcast_email_completed',
      broadcastId: 'bc-test-live',
      totalRecipients: 20,
      sent: 20,
      failed: 0,
      skipped: 0,
      pending: 0,
      status: 'sent',
      deliveryStats: {
        total: 20,
        sent: 20,
        failed: 0,
        skipped: 0,
        pending: 0,
      },
      timestamp: new Date().toISOString(),
    });
  });

  it('POST /api/v1/admin/broadcasts/:id/retry rejects unauthenticated requests with 401', async () => {
    await request(app)
      .post('/api/v1/admin/broadcasts/00000000-0000-0000-0000-000000000000/retry')
      .expect(401);
  });

  it('POST /api/v1/admin/broadcasts/:id/retry rejects invalid UUID with 400', async () => {
    await request(app)
      .post('/api/v1/admin/broadcasts/not-a-uuid/retry')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(400);
  });
});

