import { Router } from 'express';
import { authenticate, authorize } from '@/middleware/auth';
import * as marketplaceAdminController from '@/controllers/marketplace-admin.controller';

const router = Router();

// All marketplace moderation routes require administrative authentication and role
router.use(authenticate, authorize('admin'));

// Admin Moderation Queue (FIFO oldest-first)
router.get('/', marketplaceAdminController.listQueue);

// Moderation Actions
router.post('/:id/approve', marketplaceAdminController.approveProduct);
router.post('/:id/reject', marketplaceAdminController.rejectProduct);
router.post('/:id/takedown', marketplaceAdminController.takedownProduct);

export default router;
