/**
 * Team Service
 *
 * Manages business team members, invitations, and role assignments.
 *
 * @author WallX Engineering Team
 */

import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { config } from '@/config';
import prisma, { TxClient } from '@/lib/prisma';
import { AppError } from '@/middleware/errorHandler';
import { logAudit } from '@/lib/audit';
import logger from '@/lib/logger';
import { verifyBusinessAccess, invalidateOwnershipCache } from '@/lib/ownership';
import {
  TEAM_MEMBER_CAP,
  INVITATION_EXPIRY_DAYS,
  INVITABLE_ROLES_BY_ROLE,
  ROLE_DEFAULTS,
  resolvePermissions,
  type PermissionKey,
} from '@/services/team/permission.service';
import {
  evaluateInvitee,
  mapVerdictToError,
} from '@/services/team/org-boundary.service';
import { dispatchTeamInvitationEmail } from '@/services/email-dispatch.service';
import { recordSession } from '@/services/auth/session.service';
import { generateTokens, sanitizeUser, BCRYPT_ROUNDS } from '@/services/auth/auth.service';
import { checkTeamLimit } from '@/services/subscription/subscription-guard.service';
import type { InviteInput, UpdateMemberInput, AcceptOnboardingInput } from '@/validators/team.validator';
import type { BusinessRole } from '@prisma/client';

// ─── Helpers ────────────────────────────────────────────────────

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function generateInviteToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/** Safe user fields for team roster — excludes passwordHash, BVN, PIN, etc. */
const SAFE_USER_SELECT = {
  id: true,
  email: true,
  phone: true,
  fullName: true,
  isVerified: true,
  lastLoginAt: true,
} as const;

// ─── Stale Invitation Cleanup ───────────────────────────────────

/**
 * Transitions expired pending invitations to 'expired' status.
 * Must be called before creating new invitations or checking caps
 * to prevent the partial unique index from blocking re-invites.
 */
export async function expireStaleInvitations(
  db: typeof prisma | TxClient,
  filter?: { businessId?: string; email?: string }
): Promise<number> {
  const where: any = {
    status: 'pending',
    expiresAt: { lte: new Date() },
  };
  if (filter?.businessId) where.businessId = filter.businessId;
  if (filter?.email) where.email = filter.email.toLowerCase();

  const result = await db.invitation.updateMany({
    where,
    data: { status: 'expired', respondedAt: new Date() },
  });

  if (result.count > 0) {
    logger.info('Expired stale invitations', { count: result.count, filter });
  }

  return result.count;
}

// ─── Invitation Functions ───────────────────────────────────────

/**
 * Invite a new member to a business team.
 */
export async function inviteMember(
  userId: string,
  businessId: string,
  input: InviteInput
) {
  // Verify caller has team.manage permission
  const access = await verifyBusinessAccess(userId, businessId, 'team.manage');

  // Verify the caller can invite the requested role
  const callerRole = access.role;
  const invitableRoles = INVITABLE_ROLES_BY_ROLE[callerRole] || [];
  if (!invitableRoles.includes(input.role as BusinessRole)) {
    throw new AppError(403, `Your role (${callerRole}) cannot invite members with the ${input.role} role`, 'INSUFFICIENT_ROLE');
  }

  const normalizedEmail = input.email.toLowerCase().trim();

  // Block self-invitation
  const callerUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true },
  });
  if (callerUser && callerUser.email.toLowerCase() === normalizedEmail) {
    throw new AppError(400, 'You cannot invite yourself', 'SELF_INVITATION');
  }

  // Expire stale invitations first (prevents partial unique index conflicts)
  await expireStaleInvitations(prisma, { businessId, email: normalizedEmail });

  // Check if user already has an account and evaluate organization boundary
  const existingUser = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    select: { id: true, role: true },
  });
  if (existingUser) {
    const verdict = await evaluateInvitee(prisma, existingUser, access.business);
    if (!verdict.ok) {
      throw mapVerdictToError(verdict, 'invite', {
        targetBusinessId: businessId,
        inviteeId: existingUser.id,
        targetOwnerId: access.business.userId,
      });
    }
  }

  // Check for existing pending invitation
  const existingInvite = await prisma.invitation.findFirst({
    where: {
      businessId,
      email: normalizedEmail,
      status: 'pending',
      expiresAt: { gt: new Date() },
    },
  });
  if (existingInvite) {
    throw new AppError(409, 'A pending invitation already exists for this email', 'INVITATION_ALREADY_PENDING');
  }

  // Enforce team member cap dynamically based on the business owner's subscription tier
  const teamLimit = await checkTeamLimit(businessId);
  if (!teamLimit.allowed) {
    throw new AppError(
      400,
      `Team member cap reached. Maximum ${teamLimit.max} invited members allowed for ${teamLimit.ownerTier} tier (currently ${teamLimit.current} active/pending).`,
      'TEAM_MEMBER_CAP_REACHED',
      { currentPlan: teamLimit.ownerTier, maxTeamMembers: teamLimit.max }
    );
  }

  // Generate token and create invitation
  const rawToken = generateInviteToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + INVITATION_EXPIRY_DAYS);
  const normalizedName = input.fullName?.trim() || null;

  const invitation = await prisma.invitation.create({
    data: {
      businessId,
      email: normalizedEmail,
      fullName: normalizedName,
      role: input.role as BusinessRole,
      permissions: input.permissions ?? undefined,
      tokenHash,
      invitedBy: userId,
      expiresAt,
    },
  });

  // Audit log
  await logAudit({
    userId,
    businessId,
    action: 'team.invited',
    resourceType: 'invitation',
    resourceId: invitation.id,
    newData: {
      email: normalizedEmail,
      fullName: normalizedName,
      role: input.role,
    },
  });

  // Dispatch invitation email (fire-and-forget)
  dispatchTeamInvitationEmail(
    normalizedEmail,
    access.business.businessName,
    access.business.ownerName,
    input.role,
    rawToken,
    !!existingUser
  );

  logger.info('Team member invited', { businessId, email: normalizedEmail, role: input.role });

  const frontendUrl = config.cors.frontendUrl.split(',')[0].trim();

  return {
    invitation: {
      id: invitation.id,
      email: invitation.email,
      fullName: invitation.fullName,
      role: invitation.role,
      status: invitation.status,
      expiresAt: invitation.expiresAt,
      createdAt: invitation.createdAt,
    },
    meta: (config.app.isDevelopment || config.app.env === 'test')
      ? { rawToken, inviteLink: `${frontendUrl}/invite?token=${rawToken}` }
      : undefined,
  };
}

/**
 * List team members and pending invitations for a business.
 */
export async function listTeam(userId: string, businessId: string) {
  // Only owner and manager (roles with team.manage) can view the team roster
  const access = await verifyBusinessAccess(userId, businessId, 'team.manage');

  // Expire stale invitations first
  await expireStaleInvitations(prisma, { businessId });

  const [members, pendingInvitations] = await Promise.all([
    prisma.businessMember.findMany({
      where: { businessId, isActive: true },
      include: { user: { select: SAFE_USER_SELECT } },
      orderBy: [
        { role: 'asc' },  // owner first
        { joinedAt: 'asc' },
      ],
    }),
    prisma.invitation.findMany({
      where: {
        businessId,
        status: 'pending',
        expiresAt: { gt: new Date() },
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        status: true,
        expiresAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  const activeInvitedCount = members.filter((m) => m.role !== 'owner').length;
  const pendingCount = pendingInvitations.length;
  const teamLimit = await checkTeamLimit(businessId);

  return {
    members: members.map((m) => {
      const resolvedFullName =
        m.user.fullName ||
        (m.role === 'owner' ? access.business.ownerName : null) ||
        (m.permissions as any)?.memberName ||
        null;
      return {
        id: m.id,
        userId: m.userId,
        role: m.role,
        permissions: m.permissions,
        isActive: m.isActive,
        joinedAt: m.joinedAt,
        user: {
          ...m.user,
          fullName: resolvedFullName,
        },
      };
    }),
    pendingInvitations,
    cap: {
      maxInvitedMembers: teamLimit.max,
      activeInvitedCount,
      pendingCount,
      remainingSlots: teamLimit.max === -1
        ? 999999
        : Math.max(0, teamLimit.max - activeInvitedCount - pendingCount),
    },
  };
}

/**
 * Update a team member's role, permissions, and/or full name.
 * 
 * Rules:
 * - A member may update their own full name (self-update).
 * - A member cannot modify their own role or permissions (no privilege escalation).
 * - Modifying another member's name, role, or permissions requires `team.manage`.
 * - The owner's role and permissions are permanent and cannot be modified.
 * - Non-owners cannot modify the owner's name.
 * - Managers cannot modify other managers or promote members to manager.
 */
export async function updateMemberRole(
  userId: string,
  businessId: string,
  memberId: string,
  input: UpdateMemberInput
) {
  // Verify caller has access to this business
  const access = await verifyBusinessAccess(userId, businessId);

  const member = await prisma.businessMember.findFirst({
    where: { id: memberId, businessId },
    include: { user: { select: SAFE_USER_SELECT } },
  });

  if (!member) {
    throw new AppError(404, 'Team member not found', 'MEMBER_NOT_FOUND');
  }

  const isSelf = member.userId === userId;
  const isTargetOwner = member.role === 'owner';

  // 1. Role / permissions updates check
  if (input.role !== undefined || input.permissions !== undefined) {
    if (isTargetOwner && !access.isOwner) {
      throw new AppError(403, 'Cannot modify the business owner', 'CANNOT_MODIFY_OWNER');
    }
    if (isTargetOwner) {
      throw new AppError(400, 'Owner role and permissions cannot be changed', 'CANNOT_MODIFY_OWNER_ROLE');
    }
    if (isSelf) {
      throw new AppError(403, 'Cannot modify your own role. Ask the business owner.', 'CANNOT_MODIFY_SELF');
    }
    if (!access.permissions['team.manage']) {
      throw new AppError(403, 'You do not have permission to manage team members', 'PERMISSION_DENIED');
    }
    if (access.role === 'manager') {
      if (member.role === 'manager') {
        throw new AppError(403, 'Managers cannot modify other managers', 'INSUFFICIENT_ROLE');
      }
      if (input.role === 'manager') {
        throw new AppError(403, 'Managers cannot promote members to manager', 'INSUFFICIENT_ROLE');
      }
    }
  }

  // 2. Name updates check
  if (input.fullName !== undefined) {
    if (!isSelf) {
      if (!access.permissions['team.manage']) {
        throw new AppError(403, 'You do not have permission to manage team members', 'PERMISSION_DENIED');
      }
      if (isTargetOwner && !access.isOwner) {
        throw new AppError(403, 'Cannot modify the business owner', 'CANNOT_MODIFY_OWNER');
      }
      if (access.role === 'manager' && member.role === 'manager') {
        throw new AppError(403, 'Managers cannot modify other managers', 'INSUFFICIENT_ROLE');
      }
    }
  }

  const oldData = {
    role: member.role,
    permissions: member.permissions,
    fullName: member.user?.fullName,
  };

  const trimmedFullName = input.fullName !== undefined ? input.fullName.trim() : undefined;
  const existingMemberName = (member.permissions as Record<string, any>)?.memberName;
  const targetMemberName = trimmedFullName !== undefined ? (trimmedFullName || null) : existingMemberName;

  let permissionsUpdate: any = undefined;
  if (input.permissions !== undefined) {
    if (input.permissions === null) {
      permissionsUpdate = targetMemberName ? { memberName: targetMemberName } : null;
    } else {
      permissionsUpdate = {
        ...input.permissions,
        ...(targetMemberName ? { memberName: targetMemberName } : {}),
      };
    }
  } else if (trimmedFullName !== undefined) {
    const currentPerms = (member.permissions as Record<string, any>) || {};
    permissionsUpdate = {
      ...currentPerms,
      ...(targetMemberName ? { memberName: targetMemberName } : {}),
    };
    if (!targetMemberName && permissionsUpdate.memberName) {
      delete permissionsUpdate.memberName;
    }
  }

  // 1. Update user.fullName if provided
  if (trimmedFullName !== undefined) {
    await prisma.user.update({
      where: { id: member.userId },
      data: { fullName: trimmedFullName || null },
    });
  }

  // 2. If modifying owner, sync business.ownerName
  if (isTargetOwner && trimmedFullName !== undefined) {
    await prisma.business.update({
      where: { id: businessId },
      data: { ownerName: trimmedFullName || null },
    });
    invalidateOwnershipCache(businessId);
  }

  // 3. Update businessMember
  const updated = await prisma.businessMember.update({
    where: { id: memberId },
    data: {
      ...(input.role && { role: input.role as BusinessRole }),
      ...(permissionsUpdate !== undefined && { permissions: permissionsUpdate }),
    },
    include: { user: { select: SAFE_USER_SELECT } },
  });

  await logAudit({
    userId,
    businessId,
    action: 'team.member_updated',
    resourceType: 'business_member',
    resourceId: memberId,
    oldData,
    newData: {
      role: updated.role,
      permissions: updated.permissions,
      fullName: trimmedFullName,
    },
  });

  // Invalidate cache so the member's permissions/access are re-evaluated
  invalidateOwnershipCache(businessId, member.userId);

  logger.info('Team member updated', {
    businessId,
    memberId,
    newRole: input.role,
    hasFullNameUpdate: trimmedFullName !== undefined,
  });

  const resolvedFullName =
    updated.user.fullName ||
    (updated.role === 'owner' ? access.business.ownerName : null) ||
    (updated.permissions as any)?.memberName ||
    null;

  return {
    id: updated.id,
    userId: updated.userId,
    role: updated.role,
    permissions: updated.permissions,
    isActive: updated.isActive,
    joinedAt: updated.joinedAt,
    user: {
      ...updated.user,
      fullName: resolvedFullName,
    },
  };
}

/**
 * Remove a team member from a business.
 * Non-owners can remove themselves (self-leave).
 */
export async function removeMember(
  userId: string,
  businessId: string,
  memberId: string
) {
  const member = await prisma.businessMember.findFirst({
    where: { id: memberId, businessId },
    include: { user: { select: { email: true } } },
  });

  if (!member) {
    throw new AppError(404, 'Team member not found', 'MEMBER_NOT_FOUND');
  }

  // Cannot remove the owner
  if (member.role === 'owner') {
    throw new AppError(403, 'Cannot remove the business owner', 'CANNOT_REMOVE_OWNER');
  }

  const isSelfLeave = member.userId === userId;

  if (!isSelfLeave) {
    // Caller must have team.manage permission to remove others
    const access = await verifyBusinessAccess(userId, businessId, 'team.manage');

    // Manager cannot remove another manager
    if (access.role === 'manager' && member.role === 'manager') {
      throw new AppError(403, 'Managers cannot remove other managers', 'INSUFFICIENT_ROLE');
    }
  }

  // Hard-delete so re-invitation works cleanly (unique constraint on businessId+userId)
  await prisma.businessMember.delete({
    where: { id: memberId },
  });

  const auditAction = isSelfLeave ? 'team.member_left' : 'team.member_removed';
  await logAudit({
    userId,
    businessId,
    action: auditAction,
    resourceType: 'business_member',
    resourceId: memberId,
    oldData: { email: member.user.email, role: member.role },
  });

  // Invalidate cache
  invalidateOwnershipCache(businessId, member.userId);

  logger.info('Team member removed', {
    businessId,
    memberId,
    selfLeave: isSelfLeave,
    email: member.user.email,
  });

  return { message: isSelfLeave ? 'You have left the business' : 'Team member removed successfully' };
}

/**
 * Revoke a pending invitation.
 */
export async function revokeInvitation(
  userId: string,
  businessId: string,
  invitationId: string
) {
  const access = await verifyBusinessAccess(userId, businessId, 'team.manage');

  const invitation = await prisma.invitation.findFirst({
    where: { id: invitationId, businessId, status: 'pending' },
  });

  if (!invitation) {
    throw new AppError(404, 'Pending invitation not found', 'INVITATION_NOT_FOUND');
  }

  // Manager cannot revoke a manager invitation
  if (access.role === 'manager' && invitation.role === 'manager') {
    throw new AppError(403, 'Managers cannot revoke manager invitations', 'INSUFFICIENT_ROLE');
  }

  await prisma.invitation.update({
    where: { id: invitationId },
    data: { status: 'revoked', respondedAt: new Date() },
  });

  await logAudit({
    userId,
    businessId,
    action: 'team.invitation_revoked',
    resourceType: 'invitation',
    resourceId: invitationId,
    oldData: { email: invitation.email, role: invitation.role },
  });

  logger.info('Invitation revoked', { businessId, invitationId, email: invitation.email });

  return { message: 'Invitation revoked successfully' };
}

// ─── Invitee-Side Functions ─────────────────────────────────────

/**
 * List pending invitations for the authenticated user's email.
 */
export async function listMyInvitations(userEmail: string) {
  const normalizedEmail = userEmail.toLowerCase().trim();

  // Expire stale invitations for this email first
  await expireStaleInvitations(prisma, { email: normalizedEmail });

  const invitations = await prisma.invitation.findMany({
    where: {
      email: normalizedEmail,
      status: 'pending',
      expiresAt: { gt: new Date() },
    },
    include: {
      business: {
        select: {
          id: true,
          businessName: true,
          ownerName: true,
          logoUrl: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  return invitations.map((inv) => ({
    id: inv.id,
    role: inv.role,
    fullName: inv.fullName ?? null,
    expiresAt: inv.expiresAt,
    createdAt: inv.createdAt,
    business: inv.business,
  }));
}

export type AcceptOrDeclineInviteInput =
  | string
  | { token?: string; invitationId?: string };

/**
 * Accept an invitation by token or invitationId (for authenticated users).
 */
export async function acceptInvitation(
  userId: string,
  userEmail: string,
  input: AcceptOrDeclineInviteInput
) {
  const normalizedEmail = userEmail.toLowerCase().trim();
  const token = typeof input === 'string' ? input : input.token;
  const invitationId = typeof input === 'object' ? input.invitationId : undefined;

  let invitation;
  if (token) {
    const tokenHash = hashToken(token);
    invitation = await prisma.invitation.findUnique({
      where: { tokenHash },
      include: {
        business: { select: { id: true, businessName: true } },
      },
    });
  } else if (invitationId) {
    invitation = await prisma.invitation.findFirst({
      where: {
        id: invitationId,
        email: normalizedEmail,
      },
      include: {
        business: { select: { id: true, businessName: true } },
      },
    });
  } else {
    throw new AppError(400, 'Either token or invitationId is required', 'INVALID_INVITE');
  }

  if (!invitation || invitation.status !== 'pending') {
    throw new AppError(404, 'Invalid or already used invitation', 'INVITATION_NOT_FOUND');
  }

  // Check expiry
  if (invitation.expiresAt <= new Date()) {
    await prisma.invitation.update({
      where: { id: invitation.id },
      data: { status: 'expired', respondedAt: new Date() },
    });
    throw new AppError(400, 'This invitation has expired', 'INVITATION_EXPIRED');
  }

  // Verify email matches
  if (userEmail.toLowerCase().trim() !== invitation.email.toLowerCase()) {
    throw new AppError(403, 'This invitation was sent to a different email address', 'EMAIL_MISMATCH');
  }

  // Atomic transaction: create membership + mark invitation accepted
  const result = await prisma.$transaction(async (tx) => {
    // 1. Concurrency control: Lock the user row to prevent race conditions across parallel invites
    await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;

    // 2. Authoritative boundary check inside transaction
    const targetBusiness = await tx.business.findUnique({
      where: { id: invitation.businessId },
      select: { id: true, userId: true },
    });
    if (!targetBusiness) {
      throw new AppError(404, 'Business not found', 'BUSINESS_NOT_FOUND');
    }

    const callerUser = await tx.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, fullName: true },
    });
    if (!callerUser) {
      throw new AppError(404, 'User not found', 'USER_NOT_FOUND');
    }

    const verdict = await evaluateInvitee(tx, callerUser, targetBusiness);
    if (!verdict.ok) {
      throw mapVerdictToError(verdict, 'accept', {
        targetBusinessId: invitation.businessId,
        inviteeId: userId,
        targetOwnerId: targetBusiness.userId,
      });
    }

    // Check if already a member
    const existingMember = await tx.businessMember.findUnique({
      where: {
        businessId_userId: { businessId: invitation.businessId, userId },
      },
    });
    if (existingMember) {
      throw new AppError(409, 'You are already a member of this business', 'ALREADY_MEMBER');
    }

    // Re-check cap inside transaction dynamically based on owner's subscription tier
    const teamLimit = await checkTeamLimit(invitation.businessId, tx);
    if (!teamLimit.allowed) {
      throw new AppError(400, 'Team member cap reached. The business cannot accept more members right now.', 'TEAM_MEMBER_CAP_REACHED');
    }

    // Safely embed memberName into permissions if invitation has fullName
    const permissionsData = {
      ...((invitation.permissions as Record<string, boolean>) || {}),
      ...(invitation.fullName ? { memberName: invitation.fullName } : {}),
    };

    // If user's global fullName is not set and invitation has a fullName, populate it
    if (!callerUser.fullName && invitation.fullName) {
      await tx.user.update({
        where: { id: userId },
        data: { fullName: invitation.fullName },
      });
    }

    // Create membership
    const membership = await tx.businessMember.create({
      data: {
        businessId: invitation.businessId,
        userId,
        role: invitation.role,
        permissions: permissionsData,
        isActive: true,
      },
    });

    // Mark invitation as accepted
    await tx.invitation.update({
      where: { id: invitation.id },
      data: { status: 'accepted', respondedAt: new Date() },
    });

    // Audit log (transactional)
    await logAudit({
      userId,
      businessId: invitation.businessId,
      action: 'team.invitation_accepted',
      resourceType: 'business_member',
      resourceId: membership.id,
      newData: { role: invitation.role, email: invitation.email, existingAccount: true },
    }, tx);

    return membership;
  }, { maxWait: 10000, timeout: 25000 });

  // Invalidate cache outside transaction
  invalidateOwnershipCache(invitation.businessId, userId);

  logger.info('Invitation accepted', {
    businessId: invitation.businessId,
    userId,
    role: invitation.role,
  });

  return {
    membership: {
      id: result.id,
      businessId: result.businessId,
      role: result.role,
      permissions: resolvePermissions(result.role, result.permissions as Record<string, boolean> | null),
    },
    business: {
      ...invitation.business,
      role: result.role,
    },
  };
}

/**
 * Decline an invitation by token or invitationId.
 */
export async function declineInvitation(
  userId: string,
  userEmail: string,
  input: AcceptOrDeclineInviteInput
) {
  const normalizedEmail = userEmail.toLowerCase().trim();
  const token = typeof input === 'string' ? input : input.token;
  const invitationId = typeof input === 'object' ? input.invitationId : undefined;

  let invitation;
  if (token) {
    const tokenHash = hashToken(token);
    invitation = await prisma.invitation.findUnique({
      where: { tokenHash },
    });
  } else if (invitationId) {
    invitation = await prisma.invitation.findFirst({
      where: {
        id: invitationId,
        email: normalizedEmail,
      },
    });
  } else {
    throw new AppError(400, 'Either token or invitationId is required', 'INVALID_INVITE');
  }

  if (!invitation || invitation.status !== 'pending') {
    throw new AppError(404, 'Invalid or already used invitation', 'INVITATION_NOT_FOUND');
  }

  // Check expiry
  if (invitation.expiresAt <= new Date()) {
    await prisma.invitation.update({
      where: { id: invitation.id },
      data: { status: 'expired', respondedAt: new Date() },
    });
    throw new AppError(400, 'This invitation has expired', 'INVITATION_EXPIRED');
  }

  // Verify email matches
  if (userEmail.toLowerCase().trim() !== invitation.email.toLowerCase()) {
    throw new AppError(403, 'This invitation was sent to a different email address', 'EMAIL_MISMATCH');
  }

  await prisma.invitation.update({
    where: { id: invitation.id },
    data: { status: 'declined', respondedAt: new Date() },
  });

  await logAudit({
    userId,
    businessId: invitation.businessId,
    action: 'team.invitation_declined',
    resourceType: 'invitation',
    resourceId: invitation.id,
    oldData: { email: invitation.email, role: invitation.role },
  });

  logger.info('Invitation declined', {
    businessId: invitation.businessId,
    email: invitation.email,
  });

  return { message: 'Invitation declined' };
}

/**
 * Validate an invitation token publicly (unauthenticated lookup).
 * Returns invitation details if valid, or a structured invalid reason.
 */
export async function validateInviteToken(token: string) {
  const tokenHash = hashToken(token);

  const invitation = await prisma.invitation.findUnique({
    where: { tokenHash },
    include: {
      business: {
        select: {
          id: true,
          userId: true,
          businessName: true,
          ownerName: true,
          logoUrl: true,
        },
      },
    },
  });

  if (!invitation) {
    return { valid: false, reason: 'not_found', fullName: null };
  }

  if (invitation.status === 'revoked') {
    return { valid: false, reason: 'revoked', fullName: null };
  }

  if (invitation.status === 'accepted') {
    return {
      valid: false,
      reason: 'already_used',
      email: invitation.email,
      businessName: invitation.business.businessName,
      business: {
        id: invitation.business.id,
        businessName: invitation.business.businessName,
        ownerName: invitation.business.ownerName,
        logoUrl: invitation.business.logoUrl,
      },
      fullName: invitation.fullName ?? null,
    };
  }

  if (invitation.status === 'expired' || invitation.expiresAt <= new Date()) {
    if (invitation.status === 'pending') {
      await prisma.invitation.update({
        where: { id: invitation.id },
        data: { status: 'expired', respondedAt: new Date() },
      });
    }
    return { valid: false, reason: 'expired', expiresAt: invitation.expiresAt, fullName: null };
  }

  // Check if an account was registered with this email and evaluate eligibility
  const existingUser = await prisma.user.findUnique({
    where: { email: invitation.email },
    select: { id: true, role: true },
  });
  if (existingUser) {
    const verdict = await evaluateInvitee(prisma, existingUser, {
      id: invitation.business.id,
      userId: invitation.business.userId,
    });
    if (!verdict.ok) {
      if (verdict.reason === 'already_member') {
        return {
          valid: false,
          reason: 'already_member',
          email: invitation.email,
          businessName: invitation.business.businessName,
          business: {
            id: invitation.business.id,
            businessName: invitation.business.businessName,
            ownerName: invitation.business.ownerName,
            logoUrl: invitation.business.logoUrl,
          },
          fullName: invitation.fullName ?? null,
        };
      }
      return { valid: false, reason: 'account_not_eligible', fullName: null };
    }
  }

  return {
    valid: true,
    accountExists: !!existingUser,
    email: invitation.email,
    fullName: invitation.fullName ?? null,
    role: invitation.role,
    businessName: invitation.business.businessName,
    business: {
      id: invitation.business.id,
      businessName: invitation.business.businessName,
      ownerName: invitation.business.ownerName,
      logoUrl: invitation.business.logoUrl,
    },
    expiresAt: invitation.expiresAt,
  };
}

/**
 * Accept an invitation via the streamlined single-step onboarding flow.
 * Creates the user account as verified, assigns team membership, marks
 * the invitation accepted, and issues authenticated session tokens.
 */
export async function acceptOnboardingInvite(
  input: AcceptOnboardingInput,
  ipAddress?: string,
  userAgent?: string
) {
  const tokenHash = hashToken(input.token);

  // 1. Initial validation outside transaction
  const invitation = await prisma.invitation.findUnique({
    where: { tokenHash },
    include: {
      business: { select: { id: true, businessName: true } },
    },
  });

  if (!invitation || invitation.status !== 'pending') {
    throw new AppError(404, 'This invitation is invalid or has already been used.', 'INVITATION_NOT_FOUND');
  }

  if (invitation.expiresAt <= new Date()) {
    await prisma.invitation.update({
      where: { id: invitation.id },
      data: { status: 'expired', respondedAt: new Date() },
    });
    throw new AppError(400, 'This invitation has expired. Please ask the business owner to resend it.', 'INVITATION_EXPIRED');
  }

  // 2. Hash password outside transaction to avoid holding DB lock during CPU work
  const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);

  // 3. Execute atomic transaction
  const { user, membership } = await prisma.$transaction(async (tx) => {
    // Re-verify invitation status to prevent double-click race conditions
    const liveInvite = await tx.invitation.findUnique({
      where: { id: invitation.id },
      select: { id: true, status: true, email: true, fullName: true, businessId: true, role: true, permissions: true },
    });

    if (!liveInvite || liveInvite.status !== 'pending') {
      throw new AppError(409, 'This invitation has already been accepted.', 'INVITATION_ALREADY_USED');
    }

    // Safety guard: ensure email was not registered in the interim
    const duplicateUser = await tx.user.findUnique({
      where: { email: liveInvite.email },
      select: { id: true },
    });
    if (duplicateUser) {
      throw new AppError(
        409,
        'An account has already been registered with this email. Please sign in to accept this invitation.',
        'ACCOUNT_ALREADY_EXISTS'
      );
    }

    // Re-check team member cap
    const teamLimit = await checkTeamLimit(liveInvite.businessId, tx);
    if (!teamLimit.allowed) {
      throw new AppError(
        400,
        'Team member capacity reached for this business.',
        'TEAM_MEMBER_CAP_REACHED'
      );
    }

    // Create User: verified immediately by virtue of email inbox delivery
    const newUser = await tx.user.create({
      data: {
        email: liveInvite.email,
        fullName: liveInvite.fullName ?? null,
        passwordHash,
        isVerified: true,
        verifiedAt: new Date(),
        isActive: true,
        role: 'user',
        primaryBusinessId: liveInvite.businessId,
      },
    });

    // Create BusinessMember with role and permissions (safely embedding memberName if provided)
    const permissionsData = {
      ...((liveInvite.permissions as Record<string, boolean>) || {}),
      ...(liveInvite.fullName ? { memberName: liveInvite.fullName } : {}),
    };

    const membership = await tx.businessMember.create({
      data: {
        businessId: liveInvite.businessId,
        userId: newUser.id,
        role: liveInvite.role,
        permissions: permissionsData,
        isActive: true,
      },
    });

    // Mark invitation accepted
    await tx.invitation.update({
      where: { id: liveInvite.id },
      data: {
        status: 'accepted',
        respondedAt: new Date(),
      },
    });

    // Audit log (transactional)
    await logAudit({
      userId: newUser.id,
      businessId: liveInvite.businessId,
      action: 'user.registered_via_invite',
      resourceType: 'user',
      resourceId: newUser.id,
      newData: { email: newUser.email, role: liveInvite.role },
      ipAddress,
      userAgent,
    }, tx);

    await logAudit({
      userId: newUser.id,
      businessId: liveInvite.businessId,
      action: 'team.invitation_accepted',
      resourceType: 'business_member',
      resourceId: membership.id,
      newData: { role: liveInvite.role, email: liveInvite.email },
      ipAddress,
      userAgent,
    }, tx);

    return { user: newUser, membership };
  }, { maxWait: 10000, timeout: 25000 });

  // 4. Invalidate ownership cache outside transaction
  invalidateOwnershipCache(invitation.businessId, user.id);

  // 5. Generate auth tokens and record session
  const tokens = generateTokens({ userId: user.id, email: user.email, role: user.role });
  await recordSession(user.id, tokens.refreshToken, ipAddress, userAgent);

  logger.info('User onboarded via team invite', {
    userId: user.id,
    email: user.email,
    businessId: invitation.businessId,
    role: invitation.role,
  });

  return {
    user: { ...sanitizeUser(user), isOwnerAccount: false },
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    business: {
      id: invitation.businessId,
      businessName: invitation.business.businessName,
      role: invitation.role,
    },
    membership: {
      id: membership.id,
      businessId: membership.businessId,
      role: membership.role,
      permissions: resolvePermissions(
        membership.role,
        membership.permissions as Record<string, boolean> | null
      ),
    },
  };
}

/**
 * Resend a pending or expired invitation with a fresh 7-day token.
 */
export async function resendInvitation(
  userId: string,
  businessId: string,
  invitationId: string
) {
  const access = await verifyBusinessAccess(userId, businessId, 'team.manage');

  const invitation = await prisma.invitation.findFirst({
    where: { id: invitationId, businessId },
    include: { business: true },
  });

  if (!invitation) {
    throw new AppError(404, 'Invitation not found', 'INVITATION_NOT_FOUND');
  }

  if (invitation.status === 'accepted') {
    throw new AppError(400, 'Cannot resend an already accepted invitation', 'ALREADY_ACCEPTED');
  }

  // Manager cannot resend manager invitations
  if (access.role === 'manager' && invitation.role === 'manager') {
    throw new AppError(403, 'Managers cannot manage manager invitations', 'INSUFFICIENT_ROLE');
  }

  const rawToken = generateInviteToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + INVITATION_EXPIRY_DAYS);

  await prisma.invitation.update({
    where: { id: invitationId },
    data: {
      tokenHash,
      expiresAt,
      status: 'pending',
    },
  });

  await logAudit({
    userId,
    businessId,
    action: 'team.invitation_resent',
    resourceType: 'invitation',
    resourceId: invitationId,
    newData: { email: invitation.email, role: invitation.role },
  });

  const existingUser = await prisma.user.findUnique({
    where: { email: invitation.email },
    select: { id: true },
  });

  dispatchTeamInvitationEmail(
    invitation.email,
    invitation.business.businessName,
    invitation.business.ownerName,
    invitation.role,
    rawToken,
    !!existingUser
  );

  logger.info('Invitation resent', { businessId, invitationId, email: invitation.email });

  const frontendUrl = config.cors.frontendUrl.split(',')[0].trim();
  return {
    message: 'Invitation resent successfully',
    meta: (config.app.isDevelopment || config.app.env === 'test')
      ? { rawToken, inviteLink: `${frontendUrl}/invite?token=${rawToken}` }
      : undefined,
  };
}

/**
 * Expose the calling member's resolved permissions for this business.
 * Self-authorizing: any active member or owner can view their own permissions.
 */
export async function getMyPermissions(userId: string, businessId: string) {
  const access = await verifyBusinessAccess(userId, businessId);
  return {
    role: access.role,
    isOwner: access.isOwner,
    permissions: access.permissions,
  };
}

/**
 * Return default role permissions matrix for non-owner roles.
 * Single source of truth from ROLE_DEFAULTS.
 */
export async function getRoleDefaults(userId: string, businessId: string) {
  await verifyBusinessAccess(userId, businessId);
  return {
    manager: ROLE_DEFAULTS.manager,
    sales_staff: ROLE_DEFAULTS.sales_staff,
    accountant: ROLE_DEFAULTS.accountant,
    viewer: ROLE_DEFAULTS.viewer,
  };
}

