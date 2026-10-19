import request from 'supertest';
import { createApp } from '../../src/app';

describe('Public Subscription Plans API', () => {
  const app = createApp();

  it('GET /api/v1/public/subscription-plans returns 200 with all active tiers', async () => {
    const res = await request(app).get('/api/v1/public/subscription-plans');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeDefined();

    // Verify all four tiers are present
    expect(res.body.data.free).toBeDefined();
    expect(res.body.data.starter).toBeDefined();
    expect(res.body.data.business).toBeDefined();
    expect(res.body.data.scale).toBeDefined();

    // Verify prices and limits match requirements
    expect(res.body.data.starter.priceNgn).toBe(5000);
    expect(res.body.data.starter.maxBusinesses).toBe(2);
    expect(res.body.data.starter.maxTeamMembers).toBe(3);
    expect(res.body.data.starter.maxMonthlyAiQueries).toBe(30);

    expect(res.body.data.business.priceNgn).toBe(12000);
    expect(res.body.data.business.maxBusinesses).toBe(5);
    expect(res.body.data.business.maxTeamMembers).toBe(10);
    expect(res.body.data.business.features.bnplCredits).toBe(true);

    expect(res.body.data.scale.priceNgn).toBe(45000);
    expect(res.body.data.scale.maxBusinesses).toBe(-1);
    expect(res.body.data.scale.maxTeamMembers).toBe(-1);
  });
});
