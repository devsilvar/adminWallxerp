import { testDb, createTestUser, clearDatabase } from '../helpers/test-db';
import { checkPromptEligibility } from '../../src/services/feedback.service';

describe('Scheduled Review Campaign Engine (Prompt Eligibility)', () => {
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;
  const userIds: string[] = [];

  afterAll(async () => {
    try {
      if (userIds.length > 0) {
        await testDb.userFeedback.deleteMany({
          where: { userId: { in: userIds } },
        });
        await testDb.user.deleteMany({
          where: { id: { in: userIds } },
        });
      }
    } catch {
      // Ignore cleanup error
    } finally {
      await clearDatabase();
      await testDb.$disconnect();
    }
  });

  it('rejects unauthenticated requests', async () => {
    const res = await checkPromptEligibility(undefined);
    expect(res.eligible).toBe(false);
    expect(res.reason).toBe('UNAUTHENTICATED');
  });

  it('rejects new accounts under 3 days old', async () => {
    const user = await createTestUser(`new-user-${Date.now()}@example.com`);
    userIds.push(user.id);

    // Default created_at is right now (< 3 days old)
    const res = await checkPromptEligibility(user.id, { force: true });
    expect(res.eligible).toBe(false);
    expect(res.reason).toBe('NEW_ACCOUNT');
  });

  it('rejects returning accounts that submitted feedback within 30 days', async () => {
    const user = await createTestUser(`reviewed-user-${Date.now()}@example.com`);
    userIds.push(user.id);

    // Set account creation date to 10 days ago (established user)
    await testDb.user.update({
      where: { id: user.id },
      data: { createdAt: new Date(Date.now() - 10 * ONE_DAY_MS) },
    });

    // Record a review from 5 days ago (< 30 days)
    await testDb.userFeedback.create({
      data: {
        userId: user.id,
        rating: 5,
        sentiment: 'positive',
        tags: ['Super Fast'],
        comment: 'Great app!',
        createdAt: new Date(Date.now() - 5 * ONE_DAY_MS),
      },
    });

    const res = await checkPromptEligibility(user.id, { force: true });
    expect(res.eligible).toBe(false);
    expect(res.reason).toBe('ALREADY_REVIEWED_RECENTLY');
  });

  it('approves established returning user on target campaign day with 150s delay', async () => {
    const user = await createTestUser(`returning-eligible-${Date.now()}@example.com`);
    userIds.push(user.id);

    // Account created 14 days ago
    await testDb.user.update({
      where: { id: user.id },
      data: { createdAt: new Date(Date.now() - 14 * ONE_DAY_MS) },
    });

    // Test with force: true (simulating campaign trigger)
    const res = await checkPromptEligibility(user.id, { force: true });
    expect(res.eligible).toBe(true);
    expect(res.delaySeconds).toBe(150);
  });

  it('allows eligible returning user after 30-day cool-off period expires', async () => {
    const user = await createTestUser(`reeligible-user-${Date.now()}@example.com`);
    userIds.push(user.id);

    // Account created 60 days ago
    await testDb.user.update({
      where: { id: user.id },
      data: { createdAt: new Date(Date.now() - 60 * ONE_DAY_MS) },
    });

    // Review submitted 45 days ago (> 30 days cool-off)
    await testDb.userFeedback.create({
      data: {
        userId: user.id,
        rating: 4,
        sentiment: 'positive',
        tags: ['Clean Invoices'],
        createdAt: new Date(Date.now() - 45 * ONE_DAY_MS),
      },
    });

    const res = await checkPromptEligibility(user.id, { force: true });
    expect(res.eligible).toBe(true);
    expect(res.delaySeconds).toBe(150);
  });
});
