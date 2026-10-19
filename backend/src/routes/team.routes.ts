/**
 * Team Routes
 *
 * Mounted at /api/v1/businesses/:businessId/team
 *
 * @author WallX Engineering Team
 */

import { Router } from 'express';
import { authenticate } from '@/middleware/auth';
import { requireActiveSubscription } from '@/middleware/subscription';
import * as teamController from '@/controllers/team.controller';

const router = Router({ mergeParams: true });

router.use(authenticate);
router.use(requireActiveSubscription);

router.get('/', teamController.listTeam);
router.get('/my-permissions', teamController.getMyPermissions);
router.get('/role-defaults', teamController.getRoleDefaults);
router.post('/invite', teamController.invite);
router.patch('/members/:memberId', teamController.updateMember);
router.delete('/members/:memberId', teamController.removeMember);
router.post('/invitations/:invitationId/revoke', teamController.revokeInvitation);
router.post('/invitations/:invitationId/resend', teamController.resendInvitation);

export default router;
