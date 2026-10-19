import { Router } from 'express';
import { authenticate } from '@/middleware/auth';
import { requireActiveSubscription, requireFeature } from '@/middleware/subscription';
import * as creditController from '@/controllers/credit.controller';

const router = Router({ mergeParams: true });

router.use(authenticate);
router.use(requireActiveSubscription);

// Reads — no feature gate (existing data stays visible)
router.get('/', creditController.list);
router.get('/summary', creditController.getSummary);
router.get('/:creditId', creditController.getById);
router.post('/:creditId/whatsapp-reminder', creditController.getWhatsAppLink);
router.post('/:creditId/send-whatsapp', creditController.getWhatsAppLink);
router.post('/:creditId/send-email', requireFeature('bnplCredits'), creditController.sendDebtorEmail);

// Writes — feature gated
router.post('/', requireFeature('bnplCredits'), creditController.create);
router.patch('/:creditId', requireFeature('bnplCredits'), creditController.update);
router.post('/:creditId/payments', requireFeature('bnplCredits'), creditController.recordPayment);
router.post('/:creditId/write-off', requireFeature('bnplCredits'), creditController.writeOff);
router.post('/:creditId/link-dva/:saleId', requireFeature('bnplCredits'), creditController.linkDva);
router.post('/:creditId/reconcile-dva/:saleId', requireFeature('bnplCredits'), creditController.linkDva);

export default router;
