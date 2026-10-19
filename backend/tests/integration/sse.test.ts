import request from 'supertest';
import jwt from 'jsonwebtoken';
import config from '@/config';
import { createApp } from '@/app';
import { eventBus } from '@/lib/realtime-emitter';

describe('SSE Routes', () => {
  const app = createApp();

  it('GET /api/v1/events/ticket without Bearer → 401', async () => {
    await request(app).get('/api/v1/events/ticket').expect(401);
  });

  it('GET /api/v1/events/stream without ticket → 401', async () => {
    const res = await request(app).get('/api/v1/events/stream').expect(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('GET /api/v1/events/ticket with valid Bearer token → 200 with ticket', async () => {
    const token = jwt.sign(
      { userId: 'user-sse-test', email: 'test@paymytax.com', role: 'owner' },
      config.jwt.accessSecret,
      { expiresIn: '15m', algorithm: 'HS256' }
    );

    const res = await request(app)
      .get('/api/v1/events/ticket')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.ticket).toBeDefined();

    const decoded = jwt.verify(
      res.body.ticket,
      (config as any).realtime.ticketSecret,
      { algorithms: ['HS256'], audience: 'sse' } as any
    ) as any;
    expect(decoded.userId).toBe('user-sse-test');
    expect(decoded.aud).toBe('sse');
  });

  it('GET /api/v1/events/stream with invalid ticket → 401', async () => {
    await request(app)
      .get('/api/v1/events/stream?ticket=invalid-ticket')
      .expect(401);
  });
});
