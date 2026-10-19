/**
 * Organization Boundary Service
 *
 * Enforces the Single-Owner Organization Boundary rule:
 * A team member account can only belong to businesses owned by a single employer/owner.
 *
 * @author WallX Engineering Team
 */

import prisma, { TxClient } from '@/lib/prisma';
import { AppError } from '@/middleware/errorHandler';
import logger from '@/lib/logger';

export interface InviteeVerdict {
  ok: boolean;
  kind?: 'free_agent' | 'same_org_member';
  reason?: 'already_member' | 'owns_business' | 'not_eligible' | 'other_org';
}

export interface InviteeEntity {
  id: string;
  role: string;
}

export interface TargetBusinessEntity {
  id: string;
  userId: string; // Owner ID
}

export interface BoundaryContext {
  targetBusinessId?: string;
  inviteeId?: string;
  targetOwnerId?: string;
}

/**
 * Evaluates whether an existing user is eligible to join or be invited to the target business
 * under the single-owner organization boundary policy.
 */
export async function evaluateInvitee(
  db: typeof prisma | TxClient,
  invitee: InviteeEntity,
  target: TargetBusinessEntity
): Promise<InviteeVerdict> {
  // 1. Admin accounts cannot be invited / joined as subordinate staff
  if (invitee.role === 'admin') {
    return { ok: false, reason: 'not_eligible' };
  }

  // 2. Business owners (who own >= 1 business) cannot be subordinated into another owner's team
  const ownedBusiness = await db.business.findFirst({
    where: { userId: invitee.id },
    select: { id: true },
  });
  if (ownedBusiness) {
    return { ok: false, reason: 'owns_business' };
  }

  // 3. Query all active business memberships for the invitee
  const memberships = await db.businessMember.findMany({
    where: { userId: invitee.id, isActive: true },
    select: {
      businessId: true,
      business: { select: { userId: true } },
    },
  });

  // 4. Already a member of this specific target business
  if (memberships.some((m) => m.businessId === target.id)) {
    return { ok: false, reason: 'already_member' };
  }

  // 5. Active member of any business owned by a different owner
  if (memberships.some((m) => m.business.userId !== target.userId)) {
    return { ok: false, reason: 'other_org' };
  }

  // 6. Eligible: same_org_member if has existing memberships under target owner, else free_agent
  return {
    ok: true,
    kind: memberships.length > 0 ? 'same_org_member' : 'free_agent',
  };
}

/**
 * Maps an ineligible verdict to the appropriate HTTP AppError based on lifecycle phase.
 */
export function mapVerdictToError(
  v: InviteeVerdict,
  phase: 'invite' | 'accept',
  context?: BoundaryContext
): AppError {
  if (phase === 'invite') {
    // Log the actual boundary reason internally for operational auditing
    logger.warn('Team invitation blocked by organization boundary', {
      reason: v.reason,
      targetBusinessId: context?.targetBusinessId,
      inviteeId: context?.inviteeId,
      targetOwnerId: context?.targetOwnerId,
    });

    if (v.reason === 'already_member') {
      return new AppError(409, 'This user is already an active team member of this business.', 'ALREADY_MEMBER');
    }

    // Generic response for owns_business, not_eligible, other_org to prevent account/org enumeration
    return new AppError(
      400,
      'Unable to send invitation to this email address. Team invitations can only be sent to new users without an existing account.',
      'INVALID_INVITE_EMAIL'
    );
  }

  // Accept phase: specific errors with actionable guidance
  switch (v.reason) {
    case 'already_member':
      return new AppError(409, 'You are already a member of this business.', 'ALREADY_MEMBER');
    case 'owns_business':
      return new AppError(403, 'Business owners cannot join another business as a team member.', 'INVITEE_OWNS_BUSINESS');
    case 'not_eligible':
      return new AppError(403, 'This account is not eligible to join as a team member.', 'INVITEE_NOT_ELIGIBLE');
    case 'other_org':
      return new AppError(403, 'Team members can only belong to one business owner\'s organization.', 'ORGANIZATION_MISMATCH');
    default:
      return new AppError(400, 'Unable to accept invitation for this business.', 'INVALID_INVITE');
  }
}
