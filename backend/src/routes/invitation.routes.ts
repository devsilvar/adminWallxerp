/**
 * Invitation Routes
 *
 * Mounted at /api/v1/invitations
 * User-facing invitation operations (not scoped to a business).
 *
 * @author WallX Engineering Team
 */

import { Router } from 'express';
import { authenticate } from '@/middleware/auth';
import { authRateLimiter } from '@/middleware/security';
import * as invitationController from '@/controllers/invitation.controller';

const router = Router();

// Public onboarding routes (unauthenticated, rate-limited)
router.get('/validate', authRateLimiter, invitationController.validateToken);
router.post('/accept-onboarding', authRateLimiter, invitationController.acceptOnboarding);

// Authenticated routes
router.use(authenticate);

router.get('/', invitationController.listMine);
router.post('/accept', invitationController.accept);
router.post('/decline', invitationController.decline);

export default router;
