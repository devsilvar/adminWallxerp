/**
 * Unit Tests: Organization Boundary Service (Single-Owner Team Membership)
 *
 * Tests the single-owner organization boundary validation logic:
 * - Admin role rejection (not_eligible)
 * - Business owner rejection (owns_business)
 * - Already member rejection (already_member)
 * - Different owner rejection (other_org)
 * - Same owner acceptance (same_org_member)
 * - Free agent acceptance (free_agent)
 * - Error mapping for invite phase (generic privacy-preserving) vs accept phase (specific actionable)
 *
 * Runs without a database connection using mocked Prisma/TxClient.
 * Execute: npm run test:unit
 */

import {
  evaluateInvitee,
  mapVerdictToError,
  type InviteeVerdict,
} from '../../src/services/team/org-boundary.service';

describe('Organization Boundary Unit Tests', () => {
  const targetOwnerId = 'owner-uuid-1';
  const targetBizId = 'biz-uuid-1';
  const targetBusiness = { id: targetBizId, userId: targetOwnerId };

  function mockDb(options: {
    ownedBusiness?: { id: string } | null;
    memberships?: Array<{ businessId: string; business: { userId: string } }>;
  }) {
    return {
      business: {
        findFirst: jest.fn().mockResolvedValue(options.ownedBusiness ?? null),
      },
      businessMember: {
        findMany: jest.fn().mockResolvedValue(options.memberships ?? []),
      },
    } as any;
  }

  describe('evaluateInvitee', () => {
    it('rejects admin accounts with not_eligible', async () => {
      const db = mockDb({});
      const verdict = await evaluateInvitee(
        db,
        { id: 'user-admin', role: 'admin' },
        targetBusiness
      );

      expect(verdict).toEqual({ ok: false, reason: 'not_eligible' });
      expect(db.business.findFirst).not.toHaveBeenCalled();
    });

    it('rejects users who own at least one business with owns_business', async () => {
      const db = mockDb({ ownedBusiness: { id: 'some-owned-biz' } });
      const verdict = await evaluateInvitee(
        db,
        { id: 'user-owner', role: 'user' },
        targetBusiness
      );

      expect(verdict).toEqual({ ok: false, reason: 'owns_business' });
      expect(db.business.findFirst).toHaveBeenCalledWith({
        where: { userId: 'user-owner' },
        select: { id: true },
      });
      expect(db.businessMember.findMany).not.toHaveBeenCalled();
    });

    it('rejects users already in the target business with already_member', async () => {
      const db = mockDb({
        ownedBusiness: null,
        memberships: [
          { businessId: targetBizId, business: { userId: targetOwnerId } },
        ],
      });
      const verdict = await evaluateInvitee(
        db,
        { id: 'user-member', role: 'user' },
        targetBusiness
      );

      expect(verdict).toEqual({ ok: false, reason: 'already_member' });
    });

    it('rejects users who belong to another owner organization with other_org', async () => {
      const db = mockDb({
        ownedBusiness: null,
        memberships: [
          { businessId: 'different-biz', business: { userId: 'different-owner-99' } },
        ],
      });
      const verdict = await evaluateInvitee(
        db,
        { id: 'user-other-org', role: 'user' },
        targetBusiness
      );

      expect(verdict).toEqual({ ok: false, reason: 'other_org' });
    });

    it('allows users belonging to another business of the SAME owner as same_org_member', async () => {
      const db = mockDb({
        ownedBusiness: null,
        memberships: [
          { businessId: 'sibling-biz-2', business: { userId: targetOwnerId } },
          { businessId: 'sibling-biz-3', business: { userId: targetOwnerId } },
        ],
      });
      const verdict = await evaluateInvitee(
        db,
        { id: 'user-same-org', role: 'user' },
        targetBusiness
      );

      expect(verdict).toEqual({ ok: true, kind: 'same_org_member' });
    });

    it('allows registered users with no businesses and no memberships as free_agent', async () => {
      const db = mockDb({
        ownedBusiness: null,
        memberships: [],
      });
      const verdict = await evaluateInvitee(
        db,
        { id: 'user-free-agent', role: 'user' },
        targetBusiness
      );

      expect(verdict).toEqual({ ok: true, kind: 'free_agent' });
    });

    it('prioritizes owns_business over membership checks if user both owns and is member', async () => {
      const db = mockDb({
        ownedBusiness: { id: 'owned-biz' },
        memberships: [
          { businessId: 'sibling-biz', business: { userId: targetOwnerId } },
        ],
      });
      const verdict = await evaluateInvitee(
        db,
        { id: 'user-hybrid', role: 'user' },
        targetBusiness
      );

      expect(verdict).toEqual({ ok: false, reason: 'owns_business' });
      expect(db.businessMember.findMany).not.toHaveBeenCalled();
    });
  });

  describe('mapVerdictToError', () => {
    describe('Invite phase (privacy-preserving)', () => {
      it('returns 409 ALREADY_MEMBER for already_member', () => {
        const err = mapVerdictToError(
          { ok: false, reason: 'already_member' },
          'invite'
        );
        expect(err.statusCode).toBe(409);
        expect(err.code).toBe('ALREADY_MEMBER');
      });

      it('returns generic 400 INVALID_INVITE_EMAIL for other_org', () => {
        const err = mapVerdictToError(
          { ok: false, reason: 'other_org' },
          'invite'
        );
        expect(err.statusCode).toBe(400);
        expect(err.code).toBe('INVALID_INVITE_EMAIL');
        expect(err.message).toContain('Unable to send invitation to this email address');
      });

      it('returns generic 400 INVALID_INVITE_EMAIL for owns_business', () => {
        const err = mapVerdictToError(
          { ok: false, reason: 'owns_business' },
          'invite'
        );
        expect(err.statusCode).toBe(400);
        expect(err.code).toBe('INVALID_INVITE_EMAIL');
      });

      it('returns generic 400 INVALID_INVITE_EMAIL for not_eligible', () => {
        const err = mapVerdictToError(
          { ok: false, reason: 'not_eligible' },
          'invite'
        );
        expect(err.statusCode).toBe(400);
        expect(err.code).toBe('INVALID_INVITE_EMAIL');
      });
    });

    describe('Accept phase (actionable guidance)', () => {
      it('returns 409 ALREADY_MEMBER for already_member', () => {
        const err = mapVerdictToError(
          { ok: false, reason: 'already_member' },
          'accept'
        );
        expect(err.statusCode).toBe(409);
        expect(err.code).toBe('ALREADY_MEMBER');
      });

      it('returns 403 INVITEE_OWNS_BUSINESS for owns_business', () => {
        const err = mapVerdictToError(
          { ok: false, reason: 'owns_business' },
          'accept'
        );
        expect(err.statusCode).toBe(403);
        expect(err.code).toBe('INVITEE_OWNS_BUSINESS');
      });

      it('returns 403 INVITEE_NOT_ELIGIBLE for not_eligible', () => {
        const err = mapVerdictToError(
          { ok: false, reason: 'not_eligible' },
          'accept'
        );
        expect(err.statusCode).toBe(403);
        expect(err.code).toBe('INVITEE_NOT_ELIGIBLE');
      });

      it('returns 403 ORGANIZATION_MISMATCH for other_org', () => {
        const err = mapVerdictToError(
          { ok: false, reason: 'other_org' },
          'accept'
        );
        expect(err.statusCode).toBe(403);
        expect(err.code).toBe('ORGANIZATION_MISMATCH');
      });
    });
  });
});
