import { Router } from 'express';
import { authenticate } from '@/middleware/auth';
import * as msgCtrl from '@/controllers/message.controller';

const router = Router();

// All user message routes require an authenticated user
router.use(authenticate);

router.get('/', msgCtrl.listMessages);
router.get('/unread-count', msgCtrl.unreadCount);
router.patch('/read-all', msgCtrl.markAllRead);
router.patch('/:id/read', msgCtrl.markRead);
router.get('/:id', msgCtrl.getMessage);

export default router;
