import { Router } from 'express';
import { optionalAuthenticate } from '@/middleware/auth';
import * as feedbackController from '@/controllers/feedback.controller';

const router = Router();

router.get('/prompt-eligibility', optionalAuthenticate, feedbackController.getPromptEligibility);
router.post('/', optionalAuthenticate, feedbackController.submitFeedback);

export default router;
