import { Router } from 'express';
import multer from 'multer';
import { AppError } from '@/middleware/errorHandler';
import { authenticate } from '@/middleware/auth';
import { authRateLimiter } from '@/middleware/security';
import * as subscriptionController from '@/controllers/subscription.controller';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 }, // 10MB max
  fileFilter: (_req, file, cb) => {
    const allowedMimes = [
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/webp',
      'application/pdf',
    ];
    if (!allowedMimes.includes(file.mimetype.toLowerCase())) {
      return cb(
        new AppError(
          400,
          'Only JPEG, PNG, WebP images or PDF documents are accepted as proof of payment.',
          'BAD_FILE_TYPE',
        ),
      );
    }
    cb(null, true);
  },
});

router.post('/start-trial', authenticate, subscriptionController.startTrial);

router.post(
  '/proof',
  authenticate,
  authRateLimiter,
  upload.single('file'),
  subscriptionController.submitProof,
);

export default router;
