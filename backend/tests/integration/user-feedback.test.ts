import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { testDb, clearDatabase, createTestUser, createTestBusiness } from '../helpers/test-db';
import { submitFeedback, listFeedbacksForAdmin } from '../../src/services/feedback.service';
import { createFeedbackSchema } from '../../src/validators/feedback.validator';

jest.setTimeout(60000);

describe('User Feedback & In-App Review Engine Suite', () => {
  let user: any;
  let business: any;

  beforeAll(async () => {
    await clearDatabase();

    const timestamp = Date.now();
    user = await createTestUser(`reviewer-${timestamp}@example.com`);
    business = await createTestBusiness(user.id, 'Happy SME Store');
  }, 90000);

  afterAll(async () => {
    await clearDatabase();
    await testDb.$disconnect();
  }, 90000);

  test('1. Feedback schema validates 1-5 rating range', () => {
    expect(() => createFeedbackSchema.parse({ rating: 0 })).toThrow();
    expect(() => createFeedbackSchema.parse({ rating: 6 })).toThrow();
    expect(createFeedbackSchema.parse({ rating: 5, tags: ['⚡ Super Fast'] })).toMatchObject({
      rating: 5,
      tags: ['⚡ Super Fast'],
    });
  });

  test('2. submitFeedback records user feedback, sentiment, and tags in database', async () => {
    const feedback = await submitFeedback(
      {
        rating: 5,
        tags: ['⚡ Super Fast', '🧾 Clean Invoices'],
        comment: 'WallX is by far the fastest invoicing ERP we have used in Lagos!',
      },
      user.id,
      business.id,
    );

    expect(feedback.id).toBeDefined();
    expect(feedback.rating).toBe(5);
    expect(feedback.sentiment).toBe('positive');
    expect(feedback.tags).toEqual(['⚡ Super Fast', '🧾 Clean Invoices']);
    expect(feedback.userName).toBe(user.fullName || user.email.split('@')[0]);

    const inDb = await testDb.userFeedback.findUnique({
      where: { id: feedback.id },
    });
    expect(inDb).not.toBeNull();
  });

  test('3. listFeedbacksForAdmin aggregates average rating, rating distribution, and tag frequencies', async () => {
    // Add a second feedback with rating 4
    await submitFeedback({
      rating: 4,
      tags: ['⚡ Super Fast', '🇳🇬 Smooth Tax Filings'],
      comment: 'Very solid experience.',
    });

    const result = await listFeedbacksForAdmin();

    expect(result.pagination.total).toBe(2);
    expect(result.analytics.totalCount).toBe(2);
    expect(result.analytics.averageRating).toBe(4.5);
    expect(result.analytics.ratingDistribution[5]).toBe(1);
    expect(result.analytics.ratingDistribution[4]).toBe(1);

    const superFastTag = result.analytics.topTags.find((t) => t.tag === '⚡ Super Fast');
    expect(superFastTag?.count).toBe(2);
  });
});
