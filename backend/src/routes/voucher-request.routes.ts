import { Router } from 'express';
import { authenticate } from '@/middleware/auth';
import { requireActiveSubscription } from '@/middleware/subscription';
import * as voucherRequestController from '@/controllers/voucher-ledger-request.controller';

const router = Router({ mergeParams: true });

router.use(authenticate);
router.use(requireActiveSubscription);

// GET / - List voucher requests with filtering and pagination
router.get('/', voucherRequestController.list);

// POST / - Create voucher request (kind: 'top_up' | 'adjustment')
router.post('/', voucherRequestController.create);

// Convenience routes
router.post('/top-up', voucherRequestController.createTopUp);
router.post('/adjustment', voucherRequestController.createAdjustment);

// GET /:id - Single voucher request
router.get('/:id', voucherRequestController.getById);

// POST /:id/authorize - Authorize pending request
router.post('/:id/authorize', voucherRequestController.authorize);

// POST /:id/reject - Reject pending or awaiting request
router.post('/:id/reject', voucherRequestController.reject);

// POST /:id/resend - Resend verification link
router.post('/:id/resend', voucherRequestController.resend);

export default router;
