import { Router } from 'express';
import { authenticate } from '@/middleware/auth';
import { requireActiveSubscription } from '@/middleware/subscription';
import { voucherLookupRateLimiter } from '@/middleware/security';
import * as customerCardController from '@/controllers/customer-card.controller';

const router = Router({ mergeParams: true });

router.use(authenticate);
router.use(requireActiveSubscription);

// Voucher PIN-only lookup (Must be registered before /:customerId param routes)
router.post('/voucher-lookup', voucherLookupRateLimiter, customerCardController.voucherLookup);

// Store-Wide Customer Voucher Stats & Audit Activity ("Who Did What")
router.get('/stats', customerCardController.getStats);
router.get('/activity', customerCardController.listActivity);

// Customer CRM & Autocomplete
router.get('/', customerCardController.listCustomers);
router.post('/', customerCardController.quickCreate);

// Virtual Store Card & Ledger
router.get('/:customerId/card', customerCardController.getCard);
router.post('/:customerId/card/top-up', customerCardController.topUp);
router.post('/:customerId/card/change', customerCardController.creditChange);
router.post('/:customerId/card/adjustment', customerCardController.adjust);

// PIN Management (Manager/Owner only via service-level RBAC)
router.post('/:customerId/card/pin/resend', customerCardController.resendPin);
router.post('/:customerId/card/pin/change', customerCardController.changePin);

// Per-customer personal bonus % — null = inherit business default, 0 = explicitly no bonus
router.patch('/:customerId/bonus', customerCardController.updateCustomerBonus);

export default router;
