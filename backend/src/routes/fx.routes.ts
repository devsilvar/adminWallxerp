import { Router } from 'express';
import { authenticate } from '@/middleware/auth';
import { asyncHandler } from '@/middleware/errorHandler';
import * as fxController from '@/controllers/fx.controller';

const router = Router();

// GET /api/v1/fx/rates — requires a valid user JWT.
// No rejectAdminOnUserRoutes: the rate is read-only and user-agnostic.
router.get('/rates', authenticate, asyncHandler(fxController.getRatesHandler));

export default router;
