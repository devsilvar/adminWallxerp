/* eslint-disable */
/**
 * Team Multi-Business & Single-Owner Organization Boundary E2E Tests
 *
 * Verifies the single-owner organization boundary:
 * 1. Owner A can invite the same user (Member B) to multiple businesses (Biz 1, Biz 2, Biz 3)
 *    with independent roles and permissions.
 * 2. Member B has separate roles per business (manager on Biz 1, accountant on Biz 2, viewer on Biz 3).
 * 3. A different owner (Owner X) CANNOT invite Member B to their business (400 INVALID_INVITE_EMAIL).
 * 4. Business owners and admin accounts are strictly ineligible for team invitations.
 * 5. Accept-time cross-owner race condition enforcement throws 403 ORGANIZATION_MISMATCH.
 * 6. Free agents who accept invitations become staff and cannot create their own businesses (403 STAFF_CANNOT_CREATE_BUSINESS).
 * 7. Per-business seat caps are isolated across businesses owned by the same owner.
 * 8. Removing a member from all businesses of Owner A releases them back to free-agent status,
 *    allowing them to be invited by Owner X.
 *
 * @author WallX Engineering Team
 */

import 'dotenv/config';
import request from 'supertest';
import { createApp } from '../../src/app';
import prisma from '../../src/lib/prisma';
import type { Application } from 'express';

let app: Application;

// ── Test Accounts & Tokens ──
let ownerAToken = '';
let ownerAId = '';
let ownerXToken = '';
let ownerXId = '';

let biz1Id = '';
let biz2Id = '';
let biz3Id = '';
let bizXId = '';

let memberBToken = '';
let memberBId = '';

let memberCToken = '';
let memberCId = '';
let memberCMemberIdOnBiz1 = '';

let adminToken = '';
let adminId = '';

let racerToken = '';
let racerId = '';
let racerInviteTokenForBizX = '';

let inAppUserToken = '';
let inAppUserId = '';

const now = Date.now();
const OWNER_A_EMAIL = `owner-a-${now}@e2e.com`;
const OWNER_X_EMAIL = `owner-x-${now}@e2e.com`;
const MEMBER_B_EMAIL = `member-b-${now}@e2e.com`;
const MEMBER_C_EMAIL = `member-c-${now}@e2e.com`;
const INAPP_USER_EMAIL = `inapp-user-${now}@e2e.com`;
const ADMIN_EMAIL = `admin-${now}@e2e.com`;
const RACER_EMAIL = `racer-${now}@e2e.com`;
const EXTRA_STAFF_1 = `extra-staff1-${now}@e2e.com`;
const EXTRA_STAFF_2 = `extra-staff2-${now}@e2e.com`;
const PASSWORD = 'TestPass@123';

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

jest.setTimeout(60000);

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
  try {
    const testEmails = [
      OWNER_A_EMAIL,
      OWNER_X_EMAIL,
      MEMBER_B_EMAIL,
      MEMBER_C_EMAIL,
      INAPP_USER_EMAIL,
      ADMIN_EMAIL,
      RACER_EMAIL,
      EXTRA_STAFF_1,
      EXTRA_STAFF_2,
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
    await prisma.user.deleteMany({ where: { email: { in: testEmails } } });
  } catch (err) {
    // best-effort cleanup
  }
  await prisma.$disconnect();
});

describe('Single-Owner Organization Boundary E2E', () => {
  // ═══════════════════════════════════════════════════════════
  // 1. SETUP: Owners, Businesses, Free Agents, Admin
  // ═══════════════════════════════════════════════════════════
  describe('Phase 1: Setup Accounts and Organizations', () => {
    it('Register Owner A', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({ email: OWNER_A_EMAIL, password: PASSWORD });
      expect(res.status).toBe(201);
      ownerAToken = res.body.data.accessToken;
      ownerAId = res.body.data.user.id;
    });

    it('Owner A creates 3 businesses (Biz 1, Biz 2, Biz 3)', async () => {
      const b1 = await request(app)
        .post('/api/v1/businesses')
        .set(auth(ownerAToken))
        .send({ businessName: 'Owner A Retail', ownerName: 'Owner A', businessType: 'Retail' });
      expect(b1.status).toBe(201);
      biz1Id = b1.body.data.id;

      const b2 = await request(app)
        .post('/api/v1/businesses')
        .set(auth(ownerAToken))
        .send({ businessName: 'Owner A Logistics', ownerName: 'Owner A', businessType: 'Logistics' });
      expect(b2.status).toBe(201);
      biz2Id = b2.body.data.id;

      const b3 = await request(app)
        .post('/api/v1/businesses')
        .set(auth(ownerAToken))
        .send({ businessName: 'Owner A Tech', ownerName: 'Owner A', businessType: 'Technology' });
      expect(b3.status).toBe(201);
      biz3Id = b3.body.data.id;
    });

    it('Register Owner X and create Biz X', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({ email: OWNER_X_EMAIL, password: PASSWORD });
      expect(res.status).toBe(201);
      ownerXToken = res.body.data.accessToken;
      ownerXId = res.body.data.user.id;

      const bx = await request(app)
        .post('/api/v1/businesses')
        .set(auth(ownerXToken))
        .send({ businessName: 'Owner X Competitor', ownerName: 'Owner X', businessType: 'Finance' });
      expect(bx.status).toBe(201);
      bizXId = bx.body.data.id;
    });

    it('Register Member B (Free Agent - no businesses)', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({ email: MEMBER_B_EMAIL, password: PASSWORD });
      expect(res.status).toBe(201);
      memberBToken = res.body.data.accessToken;
      memberBId = res.body.data.user.id;
    });

    it('Register Member C (Free Agent - no businesses)', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({ email: MEMBER_C_EMAIL, password: PASSWORD });
      expect(res.status).toBe(201);
      memberCToken = res.body.data.accessToken;
      memberCId = res.body.data.user.id;
    });

    it('Register Admin user', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({ email: ADMIN_EMAIL, password: PASSWORD });
      expect(res.status).toBe(201);
      adminToken = res.body.data.accessToken;
      adminId = res.body.data.user.id;

      // Promote to admin directly in db
      await prisma.user.update({
        where: { id: adminId },
        data: { role: 'admin' },
      });
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 2. SAME-OWNER MULTI-BUSINESS INVITATION & ACCEPTANCE
  // ═══════════════════════════════════════════════════════════
  describe('Phase 2: Same-Owner Multi-Business Invitation & Acceptance', () => {
    it('Owner A invites Member B to Biz 1 as manager -> 201', async () => {
      const res = await request(app)
        .post(`/api/v1/businesses/${biz1Id}/team/invite`)
        .set(auth(ownerAToken))
        .send({ email: MEMBER_B_EMAIL, role: 'manager', fullName: 'Member B Manager' });

      expect(res.status).toBe(201);
      expect(res.body.data.invitation.email).toBe(MEMBER_B_EMAIL);
      expect(res.body.data.invitation.role).toBe('manager');

      const token = res.body.data.meta.rawToken;

      // Member B accepts invite to Biz 1
      const acceptRes = await request(app)
        .post('/api/v1/invitations/accept')
        .set(auth(memberBToken))
        .send({ token });

      expect(acceptRes.status).toBe(200);
      expect(acceptRes.body.data.membership.role).toBe('manager');
      expect(acceptRes.body.data.business.id).toBe(biz1Id);
    });

    it('Owner A invites Member B to Biz 2 as accountant -> 201', async () => {
      const res = await request(app)
        .post(`/api/v1/businesses/${biz2Id}/team/invite`)
        .set(auth(ownerAToken))
        .send({ email: MEMBER_B_EMAIL, role: 'accountant', fullName: 'Member B Accountant' });

      expect(res.status).toBe(201);
      expect(res.body.data.invitation.email).toBe(MEMBER_B_EMAIL);
      expect(res.body.data.invitation.role).toBe('accountant');

      const token = res.body.data.meta.rawToken;

      // Member B accepts invite to Biz 2
      const acceptRes = await request(app)
        .post('/api/v1/invitations/accept')
        .set(auth(memberBToken))
        .send({ token });

      expect(acceptRes.status).toBe(200);
      expect(acceptRes.body.data.membership.role).toBe('accountant');
      expect(acceptRes.body.data.business.id).toBe(biz2Id);
    });

    it('Owner A invites Member B to Biz 3 as viewer -> 201', async () => {
      const res = await request(app)
        .post(`/api/v1/businesses/${biz3Id}/team/invite`)
        .set(auth(ownerAToken))
        .send({ email: MEMBER_B_EMAIL, role: 'viewer', fullName: 'Member B Viewer' });

      expect(res.status).toBe(201);
      expect(res.body.data.invitation.email).toBe(MEMBER_B_EMAIL);
      expect(res.body.data.invitation.role).toBe('viewer');

      const token = res.body.data.meta.rawToken;

      // Member B accepts invite to Biz 3
      const acceptRes = await request(app)
        .post('/api/v1/invitations/accept')
        .set(auth(memberBToken))
        .send({ token });

      expect(acceptRes.status).toBe(200);
      expect(acceptRes.body.data.membership.role).toBe('viewer');
      expect(acceptRes.body.data.business.id).toBe(biz3Id);
    });

    it('Member B verifies distinct roles and permissions across all 3 businesses', async () => {
      // Access Biz 1: manager role has team.manage = true
      const b1Res = await request(app)
        .get(`/api/v1/businesses/${biz1Id}`)
        .set(auth(memberBToken));
      expect(b1Res.status).toBe(200);
      expect(b1Res.body.data.myRole).toBe('manager');
      expect(b1Res.body.data.myPermissions['team.manage']).toBe(true);

      // Access Biz 2: accountant role has team.manage = false, expense.read = true
      const b2Res = await request(app)
        .get(`/api/v1/businesses/${biz2Id}`)
        .set(auth(memberBToken));
      expect(b2Res.status).toBe(200);
      expect(b2Res.body.data.myRole).toBe('accountant');
      expect(b2Res.body.data.myPermissions['team.manage']).toBe(false);
      expect(b2Res.body.data.myPermissions['expenses.read']).toBe(true);

      // Access Biz 3: viewer role has sales.create = false, expenses.create = false
      const b3Res = await request(app)
        .get(`/api/v1/businesses/${biz3Id}`)
        .set(auth(memberBToken));
      expect(b3Res.status).toBe(200);
      expect(b3Res.body.data.myRole).toBe('viewer');
      expect(b3Res.body.data.myPermissions['sales.create']).toBe(false);
      expect(b3Res.body.data.myPermissions['expenses.create']).toBe(false);
    });

    it('Member B listBusinesses returns all 3 businesses with correct roles', async () => {
      const res = await request(app)
        .get('/api/v1/businesses')
        .set(auth(memberBToken));

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(3);

      const b1 = res.body.data.find((b: any) => b.id === biz1Id);
      const b2 = res.body.data.find((b: any) => b.id === biz2Id);
      const b3 = res.body.data.find((b: any) => b.id === biz3Id);

      expect(b1.myRole).toBe('manager');
      expect(b2.myRole).toBe('accountant');
      expect(b3.myRole).toBe('viewer');
    });

    it('Cannot invite Member B again to Biz 1 (duplicate invitation blocked -> 409 ALREADY_MEMBER)', async () => {
      const res = await request(app)
        .post(`/api/v1/businesses/${biz1Id}/team/invite`)
        .set(auth(ownerAToken))
        .send({ email: MEMBER_B_EMAIL, role: 'manager' });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('ALREADY_MEMBER');
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 3. CROSS-OWNER BOUNDARY ENFORCEMENT (THE GOLDEN RULE)
  // ═══════════════════════════════════════════════════════════
  describe('Phase 3: Cross-Owner Boundary Enforcement', () => {
    it('Different Owner X CANNOT invite Member B to Biz X -> 400 INVALID_INVITE_EMAIL', async () => {
      const res = await request(app)
        .post(`/api/v1/businesses/${bizXId}/team/invite`)
        .set(auth(ownerXToken))
        .send({ email: MEMBER_B_EMAIL, role: 'manager' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_INVITE_EMAIL');
      expect(res.body.error.message).toContain('Unable to send invitation to this email address');
      // Verify no organizational details leaked
      expect(JSON.stringify(res.body)).not.toContain(ownerAId);
      expect(JSON.stringify(res.body)).not.toContain('Owner A');
    });

    it('Owner A CANNOT invite Owner X (business owners are ineligible for team roles) -> 400 INVALID_INVITE_EMAIL', async () => {
      const res = await request(app)
        .post(`/api/v1/businesses/${biz1Id}/team/invite`)
        .set(auth(ownerAToken))
        .send({ email: OWNER_X_EMAIL, role: 'manager' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_INVITE_EMAIL');
      expect(res.body.error.message).toContain('Unable to send invitation to this email address');
    });

    it('Owner A CANNOT invite Admin user -> 400 INVALID_INVITE_EMAIL', async () => {
      const res = await request(app)
        .post(`/api/v1/businesses/${biz1Id}/team/invite`)
        .set(auth(ownerAToken))
        .send({ email: ADMIN_EMAIL, role: 'manager' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_INVITE_EMAIL');
      expect(res.body.error.message).toContain('Unable to send invitation to this email address');
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 4. RACE CONDITION & ACCEPT-TIME CROSS-OWNER ENFORCEMENT
  // ═══════════════════════════════════════════════════════════
  describe('Phase 4: Race Condition & Accept-Time Cross-Owner Enforcement', () => {
    it('Owner X invites unregistered RACER_EMAIL to Biz X -> 201', async () => {
      const res = await request(app)
        .post(`/api/v1/businesses/${bizXId}/team/invite`)
        .set(auth(ownerXToken))
        .send({ email: RACER_EMAIL, role: 'sales_staff' });

      expect(res.status).toBe(201);
      racerInviteTokenForBizX = res.body.data.meta.rawToken;
      expect(racerInviteTokenForBizX).toBeDefined();
    });

    it('RACER_EMAIL registers account before accepting Owner X invite', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({ email: RACER_EMAIL, password: PASSWORD });

      expect(res.status).toBe(201);
      racerToken = res.body.data.accessToken;
      racerId = res.body.data.user.id;
    });

    it('Owner A invites RACER_EMAIL to Biz 1 and RACER accepts (joining Owner A org)', async () => {
      const invRes = await request(app)
        .post(`/api/v1/businesses/${biz1Id}/team/invite`)
        .set(auth(ownerAToken))
        .send({ email: RACER_EMAIL, role: 'sales_staff' });

      expect(invRes.status).toBe(201);
      const racerTokenForBiz1 = invRes.body.data.meta.rawToken;

      const accRes = await request(app)
        .post('/api/v1/invitations/accept')
        .set(auth(racerToken))
        .send({ token: racerTokenForBiz1 });

      expect(accRes.status).toBe(200);
      expect(accRes.body.data.business.id).toBe(biz1Id);
    });

    it('RACER_EMAIL now attempts to accept Owner X invite to Biz X -> 403 ORGANIZATION_MISMATCH', async () => {
      const accRes = await request(app)
        .post('/api/v1/invitations/accept')
        .set(auth(racerToken))
        .send({ token: racerInviteTokenForBizX });

      expect(accRes.status).toBe(403);
      expect(accRes.body.error.code).toBe('ORGANIZATION_MISMATCH');
      expect(accRes.body.error.message).toContain('organization');
    });

    it('RACER_EMAIL validates Owner X invite token -> valid=false, reason=account_not_eligible', async () => {
      const valRes = await request(app)
        .get(`/api/v1/invitations/validate?token=${racerInviteTokenForBizX}`);

      expect(valRes.status).toBe(200);
      expect(valRes.body.data.valid).toBe(false);
      expect(valRes.body.data.reason).toBe('account_not_eligible');
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 5. FREE AGENT LOCKOUT AFTER ACCEPTANCE
  // ═══════════════════════════════════════════════════════════
  describe('Phase 5: Staff Accounts Cannot Create Business', () => {
    it('Member B attempts to create a business -> 403 STAFF_CANNOT_CREATE_BUSINESS', async () => {
      const res = await request(app)
        .post('/api/v1/businesses')
        .set(auth(memberBToken))
        .send({
          businessName: 'Member B Solo Business',
          ownerName: 'Member B',
          businessType: 'Retail',
        });

      expect(res.status).toBe(403);
      expect(['ONLY_OWNER_CAN_CREATE_BUSINESS', 'STAFF_CANNOT_CREATE_BUSINESS']).toContain(res.body.error.code);
    });

    it('Member B /auth/me reflects isOwnerAccount=false', async () => {
      const res = await request(app)
        .get('/api/v1/auth/me')
        .set(auth(memberBToken));

      expect(res.status).toBe(200);
      expect(res.body.data.isOwnerAccount).toBe(false);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 6. PER-BUSINESS SEAT CAP ISOLATION
  // ═══════════════════════════════════════════════════════════
  describe('Phase 6: Per-Business Seat Cap Isolation', () => {
    it('Fill Biz 1 seats to cap (3 non-owner members: Member B, Racer, Extra Staff 1)', async () => {
      // Biz 1 currently has Member B and Racer (2 non-owner members).
      // Invite Extra Staff 1 to reach cap (3 members).
      const invRes = await request(app)
        .post(`/api/v1/businesses/${biz1Id}/team/invite`)
        .set(auth(ownerAToken))
        .send({ email: EXTRA_STAFF_1, role: 'viewer' });

      expect(invRes.status).toBe(201);

      // Attempting 4th member invite on Biz 1 should fail with cap reached
      const capRes = await request(app)
        .post(`/api/v1/businesses/${biz1Id}/team/invite`)
        .set(auth(ownerAToken))
        .send({ email: EXTRA_STAFF_2, role: 'viewer' });

      expect(capRes.status).toBe(400);
      expect(capRes.body.error.code).toBe('TEAM_MEMBER_CAP_REACHED');
    });

    it('Biz 2 can still invite members independently (cap is per-business, not per-owner)', async () => {
      // Biz 2 only has Member B (1 member). Can invite Extra Staff 2 without hitting cap.
      const res = await request(app)
        .post(`/api/v1/businesses/${biz2Id}/team/invite`)
        .set(auth(ownerAToken))
        .send({ email: EXTRA_STAFF_2, role: 'viewer' });

      expect(res.status).toBe(201);
      expect(res.body.data.invitation.email).toBe(EXTRA_STAFF_2);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 7. MEMBER REMOVAL & CROSS-OWNER BOUNDARY RELEASE
  // ═══════════════════════════════════════════════════════════
  describe('Phase 7: Member Removal and Cross-Owner Boundary Release', () => {
    it('Owner A invites Member C to Biz 2 (Biz 1 is at cap) and Member C accepts', async () => {
      const invRes = await request(app)
        .post(`/api/v1/businesses/${biz2Id}/team/invite`)
        .set(auth(ownerAToken))
        .send({ email: MEMBER_C_EMAIL, role: 'sales_staff' });

      expect(invRes.status).toBe(201);
      const token = invRes.body.data.meta.rawToken;

      const accRes = await request(app)
        .post('/api/v1/invitations/accept')
        .set(auth(memberCToken))
        .send({ token });

      expect(accRes.status).toBe(200);
      memberCMemberIdOnBiz1 = accRes.body.data.id;
    });

    it('While affiliated with Owner A, Owner X CANNOT invite Member C -> 400 INVALID_INVITE_EMAIL', async () => {
      const res = await request(app)
        .post(`/api/v1/businesses/${bizXId}/team/invite`)
        .set(auth(ownerXToken))
        .send({ email: MEMBER_C_EMAIL, role: 'sales_staff' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_INVITE_EMAIL');
    });

    it('Owner A removes Member C from Biz 2 -> 200', async () => {
      // Find Member C's membership on Biz 2
      const member = await prisma.businessMember.findFirst({
        where: { businessId: biz2Id, userId: memberCId },
      });
      expect(member).toBeDefined();

      const res = await request(app)
        .delete(`/api/v1/businesses/${biz2Id}/team/members/${member!.id}`)
        .set(auth(ownerAToken));

      expect(res.status).toBe(200);
    });

    it('Member C is now a free agent again (0 memberships, 0 businesses)', async () => {
      const memberships = await prisma.businessMember.findMany({
        where: { userId: memberCId, isActive: true },
      });
      expect(memberships.length).toBe(0);
    });

    it('Owner X CAN NOW invite Member C to Biz X -> 201 SUCCESS!', async () => {
      const res = await request(app)
        .post(`/api/v1/businesses/${bizXId}/team/invite`)
        .set(auth(ownerXToken))
        .send({ email: MEMBER_C_EMAIL, role: 'manager', fullName: 'Member C on Biz X' });

      expect(res.status).toBe(201);
      expect(res.body.data.invitation.email).toBe(MEMBER_C_EMAIL);

      const token = res.body.data.meta.rawToken;

      // Member C accepts invite to Biz X
      const accRes = await request(app)
        .post('/api/v1/invitations/accept')
        .set(auth(memberCToken))
        .send({ token });

      expect(accRes.status).toBe(200);
      expect(accRes.body.data.membership.role).toBe('manager');
      expect(accRes.body.data.business.id).toBe(bizXId);
    });

    it('Now Member C is affiliated with Owner X, so Owner A CANNOT invite Member C -> 400', async () => {
      const res = await request(app)
        .post(`/api/v1/businesses/${biz3Id}/team/invite`)
        .set(auth(ownerAToken))
        .send({ email: MEMBER_C_EMAIL, role: 'viewer' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_INVITE_EMAIL');
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 9. IN-APP INVITATION ACCEPTANCE & DECLINE VIA INVITATIONID
  // ═══════════════════════════════════════════════════════════
  describe('Phase 9: In-App Notification Acceptance & Decline via invitationId (Without Token)', () => {
    let inviteBiz3Id = '';
    let inviteBiz2Id = '';

    it('Register In-App Test User', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({ email: INAPP_USER_EMAIL, password: PASSWORD });
      expect(res.status).toBe(201);
      inAppUserToken = res.body.data.accessToken;
      inAppUserId = res.body.data.user.id;
    });

    it('Owner A invites In-App User to Biz 3 as viewer -> 201', async () => {
      const res = await request(app)
        .post(`/api/v1/businesses/${biz3Id}/team/invite`)
        .set(auth(ownerAToken))
        .send({ email: INAPP_USER_EMAIL, role: 'viewer', fullName: 'In-App User Viewer' });

      expect(res.status).toBe(201);
      inviteBiz3Id = res.body.data.invitation.id;
      expect(inviteBiz3Id).toBeDefined();
    });

    it('In-App User queries pending invitations via GET /api/v1/invitations -> sees invitation with details', async () => {
      const res = await request(app)
        .get('/api/v1/invitations')
        .set(auth(inAppUserToken));

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      const found = res.body.data.find((inv: any) => inv.id === inviteBiz3Id);
      expect(found).toBeDefined();
      expect(found.role).toBe('viewer');
      expect(found.fullName).toBe('In-App User Viewer');
      expect(found.business.id).toBe(biz3Id);
    });

    it('In-App User accepts invitation using ONLY { invitationId } (no token) -> 200 SUCCESS', async () => {
      const res = await request(app)
        .post('/api/v1/invitations/accept')
        .set(auth(inAppUserToken))
        .send({ invitationId: inviteBiz3Id });

      expect(res.status).toBe(200);
      expect(res.body.data.membership.role).toBe('viewer');
      expect(res.body.data.business.id).toBe(biz3Id);

      // Verify in DB that invitation is accepted and membership exists
      const invDb = await prisma.invitation.findUnique({ where: { id: inviteBiz3Id } });
      expect(invDb?.status).toBe('accepted');

      const memberDb = await prisma.businessMember.findUnique({
        where: { businessId_userId: { businessId: biz3Id, userId: inAppUserId } },
      });
      expect(memberDb).not.toBeNull();
      expect(memberDb?.role).toBe('viewer');
    });

    it('Owner A invites In-App User to Biz 2 as accountant -> 201', async () => {
      const res = await request(app)
        .post(`/api/v1/businesses/${biz2Id}/team/invite`)
        .set(auth(ownerAToken))
        .send({ email: INAPP_USER_EMAIL, role: 'accountant' });

      expect(res.status).toBe(201);
      inviteBiz2Id = res.body.data.invitation.id;
      expect(inviteBiz2Id).toBeDefined();
    });

    it('In-App User declines invitation using ONLY { invitationId } (no token) -> 200 SUCCESS', async () => {
      const res = await request(app)
        .post('/api/v1/invitations/decline')
        .set(auth(inAppUserToken))
        .send({ invitationId: inviteBiz2Id });

      expect(res.status).toBe(200);

      // Verify in DB that invitation is declined and NO membership created
      const invDb = await prisma.invitation.findUnique({ where: { id: inviteBiz2Id } });
      expect(invDb?.status).toBe('declined');

      const memberDb = await prisma.businessMember.findUnique({
        where: { businessId_userId: { businessId: biz2Id, userId: inAppUserId } },
      });
      expect(memberDb).toBeNull();
    });

    it('Attacker tries to accept another user invitation via { invitationId } -> 404', async () => {
      // Create a fresh invite for In-App User
      const newInvite = await prisma.invitation.create({
        data: {
          businessId: biz2Id,
          email: INAPP_USER_EMAIL,
          role: 'sales_staff',
          tokenHash: 'dummy_hash_for_test_' + Date.now(),
          status: 'pending',
          expiresAt: new Date(Date.now() + 86400000),
        },
      });

      // Member C (different email) attempts to accept this invitationId
      const res = await request(app)
        .post('/api/v1/invitations/accept')
        .set(auth(memberCToken))
        .send({ invitationId: newInvite.id });

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('INVITATION_NOT_FOUND');
    });

    it('Accepting with empty payload (neither token nor invitationId) returns 400 validation error', async () => {
      const res = await request(app)
        .post('/api/v1/invitations/accept')
        .set(auth(inAppUserToken))
        .send({});

      expect(res.status).toBe(400);
    });
  });
});
