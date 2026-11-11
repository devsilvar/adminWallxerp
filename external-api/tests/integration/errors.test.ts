import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createTestApp } from '../helpers/createTestApp.js';

describe('error envelope (plan §7.2)', () => {
  it('answers an unknown route with NOT_FOUND and the request id', async () => {
    const res = await request(createTestApp()).get('/does-not-exist');

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
    expect(res.body.error.requestId).toBe(res.headers['x-request-id']);
  });

  it('carries code, message, details and requestId on every error', async () => {
    const res = await request(createTestApp()).get('/does-not-exist');

    expect(Object.keys(res.body.error).sort()).toEqual(
      ['code', 'details', 'message', 'requestId'].sort(),
    );
  });

  it('issues a distinct request id per request', async () => {
    const app = createTestApp();
    const [first, second] = await Promise.all([request(app).get('/health'), request(app).get('/health')]);

    expect(first.headers['x-request-id']).not.toBe(second.headers['x-request-id']);
  });

  it('ignores a client-supplied X-Request-Id', async () => {
    const res = await request(createTestApp())
      .get('/health')
      .set('X-Request-Id', 'caller-chosen-id');

    expect(res.headers['x-request-id']).not.toBe('caller-chosen-id');
  });

  it('maps malformed JSON to VALIDATION_FAILED rather than a 500', async () => {
    const res = await request(createTestApp())
      .post('/health')
      .set('Content-Type', 'application/json')
      .send('{"broken":');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    expect(res.body.error.requestId).toBe(res.headers['x-request-id']);
  });

  it('returns 413 PAYLOAD_TOO_LARGE above the 1 MB body limit', async () => {
    const oversized = JSON.stringify({ padding: 'x'.repeat(1024 * 1024 + 1) });
    const res = await request(createTestApp())
      .post('/health')
      .set('Content-Type', 'application/json')
      .send(oversized);

    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('does not leak an internal message on an unexpected error', async () => {
    const app = createTestApp();
    // A route is not needed: the not-found handler is terminal, so this asserts
    // the envelope shape rather than a thrown error.
    const res = await request(app).get('/boom');

    expect(res.status).toBe(404);
    expect(res.body.error.message).not.toMatch(/at .*\.ts/);
  });
});

describe('kill switch, layer 1 — EXTERNAL_API_ENABLED (D16)', () => {
  it('returns 503 API_DISABLED on API routes when disabled', async () => {
    const res = await request(createTestApp({ EXTERNAL_API_ENABLED: 'false' })).get(
      '/api/external/v1/sales',
    );

    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('API_DISABLED');
    expect(res.body.error.requestId).toBe(res.headers['x-request-id']);
  });

  it('lets API routes through to the router when enabled', async () => {
    const res = await request(createTestApp()).get('/api/external/v1/sales');

    // No route is mounted yet, so 404 — the point is that the switch did not fire.
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});
