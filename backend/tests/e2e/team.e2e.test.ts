/* eslint-disable */
/**
 * Team Roles & Permissions E2E Tests — Comprehensive Flow
 *
 * Tests the team management lifecycle:
 * - Registration rejection of existing accounts at invite send-time
 * - Unregistered-only email invitations with single-step onboarding
 * - Direct email verification on account creation (no separate email step)
 * - Public token validation endpoint (/validate)
 * - Resend invitation with 7-day token refresh and old token invalidation
 * - Token replay protection (used token rejected)
 * - Mid-lifecycle account registration collision
 * - Decline, cap enforcement, role updates, and self-leave.
 *
 * @author WallX Engineering Team
 */
import 'dotenv/config';
import request from 'supertest';
import { createApp } from '../../src/app';
import prisma from '../../src/lib/prisma';
import type { Application } from 'express';

let app: Application;

// ── Shared state across sequential tests ──
let ownerToken = '';
let ownerEmail = '';
let ownerId = '';
let businessId = '';
let businessName = '';

let registeredExternalToken = '';
let registeredExternalId = '';

let member1Token = '';
let member1Email = '';
let member1Id = '';
let member1MemberId = '';

let member2Token = '';
let member2Email = '';
let member2Id = '';

let member3Token = '';
let member3Email = '';
let member3Id = '';

let inviteToken1 = '';
let invitationId1 = '';
let inviteToken2 = '';
let invitationId2 = '';
let inviteToken3 = '';
let invitationId3 = '';

const now = Date.now();
const OWNER_EMAIL = `team-owner-${now}@e2e.com`;
const REGISTERED_EXTERNAL_EMAIL = `team-external-${now}@e2e.com`;
const MEMBER1_EMAIL = `team-member1-${now}@e2e.com`;
const MEMBER2_EMAIL = `team-member2-${now}@e2e.com`;
const MEMBER3_EMAIL = `team-member3-${now}@e2e.com`;
const MEMBER4_EMAIL = `team-member4-${now}@e2e.com`;
const CONFLICT_EMAIL = `team-conflict-${now}@e2e.com`;
const PASSWORD = 'TestPass@123';

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

jest.setTimeout(45000);

beforeAll(async () => {
  app = createApp();
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await prisma.$connect();
      break;
    } catch (err) {
      if (attempt === 3) throw err;
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}, 60000);

afterAll(async () => {
  // Cleanup test data
  try {
    const testEmails = [
      OWNER_EMAIL,
      REGISTERED_EXTERNAL_EMAIL,
      MEMBER1_EMAIL,
      MEMBER2_EMAIL,
      MEMBER3_EMAIL,
      MEMBER4_EMAIL,
      CONFLICT_EMAIL,
    ];
    const users = await prisma.user.findMany({
      where: { email: { in: testEmails } },
      select: { id: true },
    });
    const userIds = users.map((u) => u.id);
    if (userIds.length > 0) {
      await prisma.invitation.deleteMany({ where: { business: { userId: { in: userIds } } } });
      await prisma.businessMember.deleteMany({ where: { business: { userId: { in: userIds } } } });
      await prisma.business.deleteMany({ where: { userId: { in: userIds } } });
    }
    if (businessId) {
      await prisma.invitation.deleteMany({ where: { businessId } });
      await prisma.businessMember.deleteMany({ where: { businessId } });
      await prisma.business.deleteMany({ where: { id: businessId } });
    }
    await prisma.user.deleteMany({ where: { email: { in: testEmails } } });
  } catch (err) {
    // cleanup is best-effort
  }
  await prisma.$disconnect();
});

describe('Team Roles & Permissions E2E', () => {
  // ═══════════════════════════════════════
  // SETUP: Register owner & existing external user, create business
  // ═══════════════════════════════════════
  describe('Setup', () => {
    it('Register owner', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({ email: OWNER_EMAIL, password: PASSWORD });

      expect(res.status).toBe(201);
      ownerToken = res.body.data.accessToken;
      ownerId = res.body.data.user.id;
      ownerEmail = OWNER_EMAIL;
    });

    it('Register an existing external user (to test invite rejection of registered emails)', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({ email: REGISTERED_EXTERNAL_EMAIL, password: PASSWORD });

      expect(res.status).toBe(201);
      registeredExternalToken = res.body.data.accessToken;
      registeredExternalId = res.body.data.user.id;

      // Create a business for this external user so they are a business owner and cannot be invited
      const extBizRes = await request(app)
        .post('/api/v1/businesses')
        .set(auth(registeredExternalToken))
        .send({
          businessName: 'External Owner Biz',
          ownerName: 'External Owner',
          businessType: 'Retail',
        });
      expect(extBizRes.status).toBe(201);
    });

    it('Create business (auto-creates owner membership)', async () => {
      const res = await request(app)
        .post('/api/v1/businesses')
        .set(auth(ownerToken))
        .send({
          businessName: 'Team Test Business',
          ownerName: 'Test Owner',
          businessType: 'Retail',
        });

      expect(res.status).toBe(201);
      businessId = res.body.data.id;
      businessName = res.body.data.businessName;
      expect(res.body.data.myRole).toBe('owner');
      expect(res.body.data.memberCount).toBe(1);
    });

    it('getMe returns pendingInvitationCount and isOwnerAccount=true', async () => {
      const res = await request(app)
        .get('/api/v1/auth/me')
        .set(auth(ownerToken));

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveProperty('pendingInvitationCount');
      expect(res.body.data.pendingInvitationCount).toBe(0);
      expect(res.body.data.isOwnerAccount).toBe(true);
    });

    it('listBusinesses returns myRole and myPermissions', async () => {
      const res = await request(app)
        .get('/api/v1/businesses')
        .set(auth(ownerToken));

      expect(res.status).toBe(200);
      const biz = res.body.data.find((b: any) => b.id === businessId);
      expect(biz).toBeDefined();
      expect(biz.myRole).toBe('owner');
      expect(biz.myPermissions).toBeDefined();
      expect(biz.myPermissions['team.manage']).toBe(true);
    });

    it('getBusinessById returns myRole and myPermissions', async () => {
      const res = await request(app)
        .get(`/api/v1/businesses/${businessId}`)
        .set(auth(ownerToken));

      expect(res.status).toBe(200);
      expect(res.body.data.myRole).toBe('owner');
      expect(res.body.data.myPermissions).toBeDefined();
      expect(res.body.data.memberCount).toBe(1);
    });
  });

  // ═══════════════════════════════════════
  // INVITATION FLOW (Send-Time Validation & Caps)
  // ═══════════════════════════════════════
  describe('Invitations', () => {
    it('Inviting an already registered email is rejected at send time → 400', async () => {
      const res = await request(app)
        .post(`/api/v1/businesses/${businessId}/team/invite`)
        .set(auth(ownerToken))
        .send({ email: REGISTERED_EXTERNAL_EMAIL, role: 'manager' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_INVITE_EMAIL');
      expect(res.body.error.message).toContain('Unable to send invitation to this email address');
    });

    it('Self-invitation blocked → 400', async () => {
      const res = await request(app)
        .post(`/api/v1/businesses/${businessId}/team/invite`)
        .set(auth(ownerToken))
        .send({ email: OWNER_EMAIL, role: 'manager' });

      expect(res.status).toBe(400);
      // Because OWNER_EMAIL exists in user table, it triggers INVALID_INVITE_EMAIL
      expect(['INVALID_INVITE_EMAIL', 'SELF_INVITATION']).toContain(res.body.error.code);
    });

    it('Owner invites member1 (unregistered) as manager → 201 with rawToken', async () => {
      const res = await request(app)
        .post(`/api/v1/businesses/${businessId}/team/invite`)
        .set(auth(ownerToken))
        .send({ email: MEMBER1_EMAIL, role: 'manager' });

      expect(res.status).toBe(201);
      expect(res.body.data.invitation.email).toBe(MEMBER1_EMAIL);
      expect(res.body.data.invitation.role).toBe('manager');
      expect(res.body.data.invitation.status).toBe('pending');
      expect(res.body.data.meta).toBeDefined();
      expect(typeof res.body.data.meta.rawToken).toBe('string');

      inviteToken1 = res.body.data.meta.rawToken;
      invitationId1 = res.body.data.invitation.id;
    });

    it('Duplicate pending invite blocked → 409', async () => {
      const res = await request(app)
        .post(`/api/v1/businesses/${businessId}/team/invite`)
        .set(auth(ownerToken))
        .send({ email: MEMBER1_EMAIL, role: 'sales_staff' });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('INVITATION_ALREADY_PENDING');
    });

    it('Owner invites member2 (unregistered) as sales_staff → 201', async () => {
      const res = await request(app)
        .post(`/api/v1/businesses/${businessId}/team/invite`)
        .set(auth(ownerToken))
        .send({ email: MEMBER2_EMAIL, role: 'sales_staff' });

      expect(res.status).toBe(201);
      expect(res.body.data.invitation.role).toBe('sales_staff');
      expect(res.body.data.meta.rawToken).toBeDefined();

      inviteToken2 = res.body.data.meta.rawToken;
      invitationId2 = res.body.data.invitation.id;
    });

    it('Owner invites member3 (unregistered) as accountant → 201', async () => {
      const res = await request(app)
        .post(`/api/v1/businesses/${businessId}/team/invite`)
        .set(auth(ownerToken))
        .send({ email: MEMBER3_EMAIL, role: 'accountant' });

      expect(res.status).toBe(201);
      expect(res.body.data.meta.rawToken).toBeDefined();

      inviteToken3 = res.body.data.meta.rawToken;
      invitationId3 = res.body.data.invitation.id;
    });

    it('Cap reached: 4th invite blocked → 400', async () => {
      const res = await request(app)
        .post(`/api/v1/businesses/${businessId}/team/invite`)
        .set(auth(ownerToken))
        .send({ email: MEMBER4_EMAIL, role: 'viewer' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('TEAM_MEMBER_CAP_REACHED');
    });

    it('listTeam shows 1 active member (owner) + 3 pending invitations', async () => {
      const res = await request(app)
        .get(`/api/v1/businesses/${businessId}/team`)
        .set(auth(ownerToken));

      expect(res.status).toBe(200);
      expect(res.body.data.members).toHaveLength(1); // just the owner
      expect(res.body.data.members[0].role).toBe('owner');
      expect(res.body.data.pendingInvitations).toHaveLength(3);
      expect(res.body.data.cap.maxInvitedMembers).toBe(3);
      expect(res.body.data.cap.activeInvitedCount).toBe(0);
      expect(res.body.data.cap.pendingCount).toBe(3);
      expect(res.body.data.cap.remainingSlots).toBe(0);
    });

    it('Revoke member3 invitation → 200', async () => {
      const res = await request(app)
        .post(`/api/v1/businesses/${businessId}/team/invitations/${invitationId3}/revoke`)
        .set(auth(ownerToken));

      expect(res.status).toBe(200);
    });

    it('After revoke, cap has 1 remaining slot', async () => {
      const res = await request(app)
        .get(`/api/v1/businesses/${businessId}/team`)
        .set(auth(ownerToken));

      expect(res.status).toBe(200);
      expect(res.body.data.pendingInvitations).toHaveLength(2);
      expect(res.body.data.cap.remainingSlots).toBe(1);
    });
  });

  // ═══════════════════════════════════════
  // PUBLIC TOKEN VALIDATION
  // ═══════════════════════════════════════
  describe('Public Token Validation (/api/v1/invitations/validate)', () => {
    it('Valid token returns invitation details and valid=true', async () => {
      const res = await request(app)
        .get(`/api/v1/invitations/validate?token=${inviteToken1}`);

      expect(res.status).toBe(200);
      expect(res.body.data.valid).toBe(true);
      expect(res.body.data.email).toBe(MEMBER1_EMAIL);
      expect(res.body.data.role).toBe('manager');
      expect(res.body.data.businessName).toBe(businessName);
    });

    it('Non-existent token returns valid=false with reason "not_found"', async () => {
      const res = await request(app)
        .get('/api/v1/invitations/validate?token=nonexistent1234567890abcdef1234567890abcdef1234567890abcdef12345678');

      expect(res.status).toBe(200);
      expect(res.body.data.valid).toBe(false);
      expect(res.body.data.reason).toBe('not_found');
    });

    it('Revoked token returns valid=false with reason "revoked"', async () => {
      const res = await request(app)
        .get(`/api/v1/invitations/validate?token=${inviteToken3}`);

      expect(res.status).toBe(200);
      expect(res.body.data.valid).toBe(false);
      expect(res.body.data.reason).toBe('revoked');
    });
  });

  // ═══════════════════════════════════════
  // SINGLE-STEP ONBOARDING ACCEPTANCE
  // ═══════════════════════════════════════
  describe('Single-Step Onboarding Acceptance & Token Guards', () => {
    it('member1 accepts invitation via accept-onboarding → creates verified user + member', async () => {
      const res = await request(app)
        .post('/api/v1/invitations/accept-onboarding')
        .send({
          token: inviteToken1,
          fullName: 'Manager One',
          password: PASSWORD,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.email).toBe(MEMBER1_EMAIL);
      expect(res.body.data.user.isVerified).toBe(true);
      expect(res.body.data.accessToken).toBeDefined();
      expect(res.body.data.refreshToken).toBeDefined();
      expect(res.body.data.membership.role).toBe('manager');
      expect(res.body.data.business.id).toBe(businessId);

      member1Token = res.body.data.accessToken;
      member1Id = res.body.data.user.id;
      member1Email = res.body.data.user.email;
      member1MemberId = res.body.data.membership.id;
    });

    it('Invited team member (manager) is BLOCKED from creating a business → 403', async () => {
      const res = await request(app)
        .post('/api/v1/businesses')
        .set(auth(member1Token))
        .send({
          businessName: 'Unauthorized Manager Business',
          ownerName: 'Manager One',
          businessType: 'Retail',
        });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('ONLY_OWNER_CAN_CREATE_BUSINESS');
    });

    it('getMe for invited member returns isOwnerAccount=false', async () => {
      const res = await request(app)
        .get('/api/v1/auth/me')
        .set(auth(member1Token));

      expect(res.status).toBe(200);
      expect(res.body.data.isOwnerAccount).toBe(false);
    });

    it('Token replay guard: using the accepted token again returns 404', async () => {
      const res = await request(app)
        .post('/api/v1/invitations/accept-onboarding')
        .send({
          token: inviteToken1,
          fullName: 'Manager One Again',
          password: PASSWORD,
        });

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('INVITATION_NOT_FOUND');
    });

    it('Validate on used token returns valid=false with reason "already_used"', async () => {
      const res = await request(app)
        .get(`/api/v1/invitations/validate?token=${inviteToken1}`);

      expect(res.status).toBe(200);
      expect(res.body.data.valid).toBe(false);
      expect(res.body.data.reason).toBe('already_used');
    });

    it('Resend invitation for member2: invalidates old token and returns new rawToken', async () => {
      const res = await request(app)
        .post(`/api/v1/businesses/${businessId}/team/invitations/${invitationId2}/resend`)
        .set(auth(ownerToken));

      expect(res.status).toBe(200);
      expect(res.body.data.meta).toBeDefined();
      expect(typeof res.body.data.meta.rawToken).toBe('string');
      expect(res.body.data.meta.rawToken).not.toBe(inviteToken2);

      const newInviteToken2 = res.body.data.meta.rawToken;

      // Old token should now be invalid
      const oldCheck = await request(app)
        .get(`/api/v1/invitations/validate?token=${inviteToken2}`);
      expect(oldCheck.body.data.valid).toBe(false);

      // New token should be valid
      const newCheck = await request(app)
        .get(`/api/v1/invitations/validate?token=${newInviteToken2}`);
      expect(newCheck.body.data.valid).toBe(true);
      expect(newCheck.body.data.email).toBe(MEMBER2_EMAIL);

      // Onboard member2 with new token
      const acceptRes = await request(app)
        .post('/api/v1/invitations/accept-onboarding')
        .send({
          token: newInviteToken2,
          fullName: 'Staff Two',
          password: PASSWORD,
        });

      expect(acceptRes.status).toBe(200);
      expect(acceptRes.body.data.user.email).toBe(MEMBER2_EMAIL);
      expect(acceptRes.body.data.user.isVerified).toBe(true);
      expect(acceptRes.body.data.membership.role).toBe('sales_staff');

      member2Token = acceptRes.body.data.accessToken;
      member2Id = acceptRes.body.data.user.id;
      member2Email = acceptRes.body.data.user.email;
    });

    it('Mid-lifecycle collision: registered after invite sent triggers accountExists and onboarding rejection', async () => {
      // 1. Owner invites CONFLICT_EMAIL (slot is available since member3 was revoked)
      const invRes = await request(app)
        .post(`/api/v1/businesses/${businessId}/team/invite`)
        .set(auth(ownerToken))
        .send({ email: CONFLICT_EMAIL, role: 'viewer' });

      expect(invRes.status).toBe(201);
      const conflictToken = invRes.body.data.meta.rawToken;

      // 2. An account is registered for CONFLICT_EMAIL before the invite is accepted
      const regRes = await request(app)
        .post('/api/v1/auth/register')
        .send({ email: CONFLICT_EMAIL, password: PASSWORD });
      expect(regRes.status).toBe(201);

      // 3. Validation returns valid=true with accountExists=true (eligible free agent)
      const valRes = await request(app)
        .get(`/api/v1/invitations/validate?token=${conflictToken}`);

      expect(valRes.status).toBe(200);
      expect(valRes.body.data.valid).toBe(true);
      expect(valRes.body.data.accountExists).toBe(true);

      // 4. Onboarding accept is rejected with 409 ACCOUNT_ALREADY_EXISTS (must use authenticated accept)
      const accRes = await request(app)
        .post('/api/v1/invitations/accept-onboarding')
        .send({
          token: conflictToken,
          fullName: 'Conflict Person',
          password: PASSWORD,
        });

      expect(accRes.status).toBe(409);
      expect(accRes.body.error.code).toBe('ACCOUNT_ALREADY_EXISTS');
    });

    it('Decline invitation: registered user can decline their pending invitation', async () => {
      // Register member3 user so we can test the authenticated decline endpoint
      const regRes = await request(app)
        .post('/api/v1/auth/register')
        .send({ email: MEMBER3_EMAIL, password: PASSWORD });
      expect(regRes.status).toBe(201);
      member3Token = regRes.body.data.accessToken;
      member3Id = regRes.body.data.user.id;
      member3Email = MEMBER3_EMAIL;

      // Clean up previous conflict invite to free a slot
      const conflictInv = await prisma.invitation.findFirst({
        where: { businessId, email: CONFLICT_EMAIL, status: 'pending' },
      });
      if (conflictInv) {
        await prisma.invitation.update({
          where: { id: conflictInv.id },
          data: { status: 'revoked' },
        });
      }

      // Create a pending invitation directly for member3
      const crypto = await import('crypto');
      const rawToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);

      await prisma.invitation.create({
        data: {
          businessId,
          email: MEMBER3_EMAIL,
          role: 'accountant',
          tokenHash,
          invitedBy: ownerId,
          expiresAt,
        },
      });

      const res = await request(app)
        .post('/api/v1/invitations/decline')
        .set(auth(member3Token))
        .send({ token: rawToken });

      expect(res.status).toBe(200);
      expect(res.body.data.message).toContain('declined');
    });

    it('Already-member cannot accept again → 409', async () => {
      const crypto = await import('crypto');
      const rawToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);

      await prisma.invitation.create({
        data: {
          businessId,
          email: MEMBER1_EMAIL,
          role: 'viewer',
          tokenHash,
          invitedBy: ownerId,
          expiresAt,
        },
      });

      const res = await request(app)
        .post('/api/v1/invitations/accept')
        .set(auth(member1Token))
        .send({ token: rawToken });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('ALREADY_MEMBER');
    });

    it('Team now has 3 members (owner + manager + sales_staff)', async () => {
      const res = await request(app)
        .get(`/api/v1/businesses/${businessId}/team`)
        .set(auth(ownerToken));

      expect(res.status).toBe(200);
      expect(res.body.data.members).toHaveLength(3);
      expect(res.body.data.cap.activeInvitedCount).toBe(2);
    });

    it('member1 (manager) can list the business via listBusinesses', async () => {
      const res = await request(app)
        .get('/api/v1/businesses')
        .set(auth(member1Token));

      expect(res.status).toBe(200);
      const biz = res.body.data.find((b: any) => b.id === businessId);
      expect(biz).toBeDefined();
      expect(biz.myRole).toBe('manager');
      expect(biz.myPermissions['team.manage']).toBe(true);
    });

    it('member2 (sales_staff) can see business via getBusinessById', async () => {
      const res = await request(app)
        .get(`/api/v1/businesses/${businessId}`)
        .set(auth(member2Token));

      expect(res.status).toBe(200);
      expect(res.body.data.myRole).toBe('sales_staff');
      expect(res.body.data.myPermissions['sales.create']).toBe(true);
      expect(res.body.data.myPermissions['expenses.create']).toBe(false);
    });
  });

  // ═══════════════════════════════════════
  // ROLE UPDATE
  // ═══════════════════════════════════════
  describe('Role Updates', () => {
    it('Owner updates member2 from sales_staff to accountant → 200', async () => {
      const members = await prisma.businessMember.findMany({
        where: { businessId, userId: member2Id },
      });
      const memberId = members[0].id;

      const res = await request(app)
        .patch(`/api/v1/businesses/${businessId}/team/members/${memberId}`)
        .set(auth(ownerToken))
        .send({ role: 'accountant' });

      expect(res.status).toBe(200);
      expect(res.body.data.role).toBe('accountant');
    });

    it('Accountant CAN view settlement preview (wallet balance & inflows) → 200', async () => {
      const res = await request(app)
        .get(`/api/v1/businesses/${businessId}/settlement/preview`)
        .set(auth(member2Token));

      expect(res.status).toBe(200);
      expect(res.body.data.businessId).toBe(businessId);
      expect(res.body.data.availableForWithdrawal).toBeDefined();
    });

    it('Accountant CAN view DVA account summary → 200', async () => {
      const res = await request(app)
        .get(`/api/v1/businesses/${businessId}/dva/account-summary`)
        .set(auth(member2Token));

      expect(res.status).toBe(200);
      expect(res.body.data.ledgerBalance).toBeDefined();
    });

    it('Accountant CAN view settlement payout history → 200', async () => {
      const res = await request(app)
        .get(`/api/v1/businesses/${businessId}/settlement/history`)
        .set(auth(member2Token));

      expect(res.status).toBe(200);
      expect(res.body.data).toBeDefined();
    });

    it('Accountant CANNOT withdraw funds → 404 BUSINESS_NOT_FOUND', async () => {
      const res = await request(app)
        .post(`/api/v1/businesses/${businessId}/settlement/withdraw`)
        .set(auth(member2Token))
        .send({ amount: 5000, pin: '1234' });

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('BUSINESS_NOT_FOUND');
    });

    it('Manager CAN view settlement preview → 200', async () => {
      const res = await request(app)
        .get(`/api/v1/businesses/${businessId}/settlement/preview`)
        .set(auth(member1Token));

      expect(res.status).toBe(200);
      expect(res.body.data.businessId).toBe(businessId);
    });

    it('Manager cannot modify owner → 403', async () => {
      const ownerMember = await prisma.businessMember.findFirst({
        where: { businessId, role: 'owner' },
      });

      const res = await request(app)
        .patch(`/api/v1/businesses/${businessId}/team/members/${ownerMember!.id}`)
        .set(auth(member1Token))
        .send({ role: 'viewer' });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('CANNOT_MODIFY_OWNER');
    });

    it('Manager cannot promote to manager → 403', async () => {
      const member2Membership = await prisma.businessMember.findFirst({
        where: { businessId, userId: member2Id },
      });

      const res = await request(app)
        .patch(`/api/v1/businesses/${businessId}/team/members/${member2Membership!.id}`)
        .set(auth(member1Token))
        .send({ role: 'manager' });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('INSUFFICIENT_ROLE');
    });

    it('Manager CAN update non-manager member role → 200', async () => {
      const member2Membership = await prisma.businessMember.findFirst({
        where: { businessId, userId: member2Id },
      });

      const res = await request(app)
        .patch(`/api/v1/businesses/${businessId}/team/members/${member2Membership!.id}`)
        .set(auth(member1Token))
        .send({ role: 'viewer' });

      expect(res.status).toBe(200);
      expect(res.body.data.role).toBe('viewer');
    });

    it('sales_staff cannot manage team → 403', async () => {
      // First, change member2 back to sales_staff
      const member2Membership = await prisma.businessMember.findFirst({
        where: { businessId, userId: member2Id },
      });
      await prisma.businessMember.update({
        where: { id: member2Membership!.id },
        data: { role: 'sales_staff' },
      });

      const res = await request(app)
        .post(`/api/v1/businesses/${businessId}/team/invite`)
        .set(auth(member2Token))
        .send({ email: MEMBER4_EMAIL, role: 'viewer' });

      expect(res.status).toBe(403);
    });

    it('sales_staff cannot list team members → 403', async () => {
      const res = await request(app)
        .get(`/api/v1/businesses/${businessId}/team`)
        .set(auth(member2Token));

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('PERMISSION_DENIED');
    });

    it('Manager CAN list team members → 200', async () => {
      const res = await request(app)
        .get(`/api/v1/businesses/${businessId}/team`)
        .set(auth(member1Token));

      expect(res.status).toBe(200);
      expect(res.body.data.members).toBeDefined();
    });

    it('Non-owner cannot setup transaction PIN → 403 OWNER_ONLY_PIN', async () => {
      const res = await request(app)
        .post('/api/v1/auth/pin/setup')
        .set(auth(member1Token))
        .send({ pin: '8371', password: PASSWORD });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('OWNER_ONLY_PIN');
    });

    it('Owner CAN setup transaction PIN → 200', async () => {
      const res = await request(app)
        .post('/api/v1/auth/pin/setup')
        .set(auth(ownerToken))
        .send({ pin: '8492', password: PASSWORD });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('Owner updates member with permission overrides → 200', async () => {
      const member2Membership = await prisma.businessMember.findFirst({
        where: { businessId, userId: member2Id },
      });

      const res = await request(app)
        .patch(`/api/v1/businesses/${businessId}/team/members/${member2Membership!.id}`)
        .set(auth(ownerToken))
        .send({
          permissions: { 'expenses.create': true },
        });

      expect(res.status).toBe(200);
      expect(res.body.data.permissions).toBeDefined();
    });

    it('Cannot set FINANCIAL_OWNER_ONLY permissions → 400', async () => {
      const member2Membership = await prisma.businessMember.findFirst({
        where: { businessId, userId: member2Id },
      });

      const res = await request(app)
        .patch(`/api/v1/businesses/${businessId}/team/members/${member2Membership!.id}`)
        .set(auth(ownerToken))
        .send({
          permissions: { 'tax.pay': true },
        });

      expect(res.status).toBe(400);
    });
  });

  // ═══════════════════════════════════════
  // SELF-LEAVE & MEMBER REMOVAL
  // ═══════════════════════════════════════
  describe('Self-Leave & Removal', () => {
    it('Cannot remove owner → 403', async () => {
      const ownerMember = await prisma.businessMember.findFirst({
        where: { businessId, role: 'owner' },
      });

      const res = await request(app)
        .delete(`/api/v1/businesses/${businessId}/team/members/${ownerMember!.id}`)
        .set(auth(member1Token));

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('CANNOT_REMOVE_OWNER');
    });

    it('member2 self-leaves → 200', async () => {
      const member2Membership = await prisma.businessMember.findFirst({
        where: { businessId, userId: member2Id },
      });

      const res = await request(app)
        .delete(`/api/v1/businesses/${businessId}/team/members/${member2Membership!.id}`)
        .set(auth(member2Token));

      expect(res.status).toBe(200);
      expect(res.body.data.message).toContain('left');
    });

    it('After self-leave, member2 cannot access business → 403', async () => {
      const res = await request(app)
        .get(`/api/v1/businesses/${businessId}`)
        .set(auth(member2Token));

      expect(res.status).toBe(403);
    });

    it('Owner removes member1 (manager) → 200', async () => {
      const member1Membership = await prisma.businessMember.findFirst({
        where: { businessId, userId: member1Id },
      });

      const res = await request(app)
        .delete(`/api/v1/businesses/${businessId}/team/members/${member1Membership!.id}`)
        .set(auth(ownerToken));

      expect(res.status).toBe(200);
    });

    it('Team now has only the owner', async () => {
      const res = await request(app)
        .get(`/api/v1/businesses/${businessId}/team`)
        .set(auth(ownerToken));

      expect(res.status).toBe(200);
      expect(res.body.data.members).toHaveLength(1);
      expect(res.body.data.members[0].role).toBe('owner');
      expect(res.body.data.cap.activeInvitedCount).toBe(0);
    });
  });
});
