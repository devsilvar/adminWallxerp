/**
 * Invitation Controller
 *
 * Handles user-facing invitation operations (list mine, accept, decline).
 *
 * @author WallX Engineering Team
 */

import { Request, Response } from 'express';
import { asyncHandler } from '@/middleware/errorHandler';
import { AuthenticatedRequest } from '@/types';
import {
  acceptInvitationSchema,
  declineInvitationSchema,
  validateInviteTokenSchema,
  acceptOnboardingSchema,
} from '@/validators/team.validator';
import * as teamService from '@/services/team.service';

export const validateToken = asyncHandler(async (req: Request, res: Response) => {
  const { token } = validateInviteTokenSchema.parse(req.query);
  const result = await teamService.validateInviteToken(token);

  res.status(200).json({
    success: true,
    data: result,
  });
});

export const acceptOnboarding = asyncHandler(async (req: Request, res: Response) => {
  const input = acceptOnboardingSchema.parse(req.body);
  const result = await teamService.acceptOnboardingInvite(
    input,
    req.ip,
    req.get('user-agent')
  );

  res.status(200).json({
    success: true,
    data: result,
    message: 'Account created and verified. Welcome to the team!',
  });
});

export const listMine = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const invitations = await teamService.listMyInvitations(
    req.user!.email
  );

  res.status(200).json({
    success: true,
    data: invitations,
  });
});

export const accept = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const input = acceptInvitationSchema.parse(req.body);
  const result = await teamService.acceptInvitation(
    req.user!.userId,
    req.user!.email,
    input
  );

  res.status(200).json({
    success: true,
    data: result,
    message: 'Invitation accepted. You are now a member of this business.',
  });
});

export const decline = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const input = declineInvitationSchema.parse(req.body);
  const result = await teamService.declineInvitation(
    req.user!.userId,
    req.user!.email,
    input
  );

  res.status(200).json({
    success: true,
    data: result,
    message: result.message,
  });
});
