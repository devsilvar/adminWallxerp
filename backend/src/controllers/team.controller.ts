/**
 * Team Controller
 *
 * Handles team management operations for business team members.
 *
 * @author WallX Engineering Team
 */

import { Response } from 'express';
import { asyncHandler } from '@/middleware/errorHandler';
import { AuthenticatedRequest } from '@/types';
import { inviteSchema, updateMemberSchema } from '@/validators/team.validator';
import * as teamService from '@/services/team.service';

export const listTeam = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const result = await teamService.listTeam(
    req.user!.userId,
    req.params.businessId
  );

  res.status(200).json({
    success: true,
    data: result,
  });
});

export const invite = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const input = inviteSchema.parse(req.body);
  const result = await teamService.inviteMember(
    req.user!.userId,
    req.params.businessId,
    input
  );

  res.status(201).json({
    success: true,
    data: result,
    message: 'Invitation sent successfully',
  });
});

export const updateMember = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const input = updateMemberSchema.parse(req.body);
  const result = await teamService.updateMemberRole(
    req.user!.userId,
    req.params.businessId,
    req.params.memberId,
    input
  );

  res.status(200).json({
    success: true,
    data: result,
    message: 'Team member updated successfully',
  });
});

export const removeMember = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const result = await teamService.removeMember(
    req.user!.userId,
    req.params.businessId,
    req.params.memberId
  );

  res.status(200).json({
    success: true,
    data: result,
    message: result.message,
  });
});

export const revokeInvitation = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const result = await teamService.revokeInvitation(
    req.user!.userId,
    req.params.businessId,
    req.params.invitationId
  );

  res.status(200).json({
    success: true,
    data: result,
    message: result.message,
  });
});

export const resendInvitation = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const result = await teamService.resendInvitation(
    req.user!.userId,
    req.params.businessId,
    req.params.invitationId
  );

  res.status(200).json({
    success: true,
    data: result,
    message: result.message,
  });
});

export const getMyPermissions = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const result = await teamService.getMyPermissions(
    req.user!.userId,
    req.params.businessId
  );

  res.status(200).json({
    success: true,
    data: result,
  });
});

export const getRoleDefaults = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const result = await teamService.getRoleDefaults(
    req.user!.userId,
    req.params.businessId
  );

  res.status(200).json({
    success: true,
    data: result,
  });
});

