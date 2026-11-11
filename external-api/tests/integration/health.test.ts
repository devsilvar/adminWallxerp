import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createTestApp } from '../helpers/createTestApp.js';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('GET /health', () => {
  it('returns 200 in the success envelope', async () => {
    const res = await request(createTestApp()).get('/health');

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('ok');
    expect(Number.isInteger(res.body.data.uptimeSeconds)).toBe(true);
    expect(new Date(res.body.data.timestamp).toString()).not.toBe('Invalid Date');
  });

  it('mints a request id and echoes it as a header', async () => {
    const res = await request(createTestApp()).get('/health');

    expect(res.headers['x-request-id']).toMatch(UUID_V4);
  });

  it('does not advertise the framework', async () => {
    const res = await request(createTestApp()).get('/health');

    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('stays 200 when the API is disabled — the kill switch must not fail the probe', async () => {
    const res = await request(createTestApp({ EXTERNAL_API_ENABLED: 'false' })).get('/health');

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('ok');
  });
});
