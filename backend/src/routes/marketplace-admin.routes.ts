import { Router } from 'express';
import { authenticate, authorize } from '@/middleware/auth';
import * as marketplaceAdminController from '@/controllers/marketplace-admin.controller';

const router = Router();

// All marketplace moderation routes require administrative authentication and role
router.use(authenticate, authorize('admin'));

// Admin Moderation Queue (FIFO oldest-first)
router.get('/', marketplaceAdminController.listQueue);

// Admin Slot Purchases & Proofs (Phase 11)
router.get('/slots', marketplaceAdminController.listSlotPurchases);
router.post('/slots/:id/approve', marketplaceAdminController.approveSlotProof);
router.post('/slots/:id/reject', marketplaceAdminController.rejectSlotProof);
router.post('/slots/:id/refund', marketplaceAdminController.refundSlotPurchase);

// Moderation Actions
router.post('/:id/approve', marketplaceAdminController.approveProduct);
router.post('/:id/reject', marketplaceAdminController.rejectProduct);
router.post('/:id/takedown', marketplaceAdminController.takedownProduct);
router.post('/:id/send-back', marketplaceAdminController.sendBackProduct);

export default router;
