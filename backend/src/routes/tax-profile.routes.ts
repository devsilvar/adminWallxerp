import { Router } from 'express';
import { authenticate } from '@/middleware/auth';
import { requireActiveSubscription } from '@/middleware/subscription';
import * as taxProfileController from '@/controllers/tax-profile.controller';

// 1. Separate router for tax-policy: authenticate only (works during subscription grace period)
export const taxPolicyRouter = Router({ mergeParams: true });
taxPolicyRouter.use(authenticate);
taxPolicyRouter.get('/', taxProfileController.getTaxPolicy);

// 2. Standard router for tax-profile: requires active subscription
const router = Router({ mergeParams: true });

router.use(authenticate);
router.use(requireActiveSubscription);

// GET /businesses/:businessId/tax-profile
router.get('/', taxProfileController.getTaxProfile);

// GET /businesses/:businessId/tax-profile/pdf
router.get('/pdf', taxProfileController.downloadObligationReportPdf);

// GET /businesses/:businessId/tax-profile/obligation-report.pdf
router.get('/obligation-report.pdf', taxProfileController.downloadObligationReportPdf);

// POST /businesses/:businessId/tax-profile
router.post('/', taxProfileController.saveTaxProfile);

// DELETE /businesses/:businessId/tax-profile
router.delete('/', taxProfileController.deleteTaxProfile);

export default router;
