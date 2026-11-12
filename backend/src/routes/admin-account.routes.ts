import { Router } from 'express';
import * as controller from '@/controllers/admin-account.controller';
import { adminPasswordCodeRateLimiter } from '@/middleware/security';

const router = Router();

router.post('/password/request-code', adminPasswordCodeRateLimiter, controller.requestPasswordCode);
router.post('/password/verify-code', adminPasswordCodeRateLimiter, controller.verifyPasswordCode);
router.post('/password/complete', controller.completePasswordChange);

export default router;
