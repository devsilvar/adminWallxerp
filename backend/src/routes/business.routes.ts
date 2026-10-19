import { Router } from 'express';
import multer from 'multer';
import { authenticate } from '@/middleware/auth';
import { requireActiveSubscription } from '@/middleware/subscription';
import { AppError } from '@/middleware/errorHandler';
import { isAllowedLogoFile, MAX_LOGO_BYTES } from '@/lib/cloudinary';
import * as businessController from '@/controllers/business.controller';

const router = Router();

router.use(authenticate);

// ── Multer for logo uploads ──
const logoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_LOGO_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!isAllowedLogoFile(file.mimetype, file.originalname)) {
      return cb(
        new AppError(400, 'Only JPEG, PNG, WebP or SVG images are accepted.', 'LOGO_BAD_TYPE'),
      );
    }
    cb(null, true);
  },
});

router.post('/', requireActiveSubscription, businessController.create);
router.get('/', businessController.getAll);
router.get('/:id', businessController.getById);
router.put('/:id', businessController.update);
router.delete('/:id', businessController.remove);

// ── Logo routes ──
router.post('/:id/logo', logoUpload.single('logo'), businessController.uploadLogo);
router.delete('/:id/logo', businessController.deleteLogo);

// Voucher bonus — business-wide default extra % on top-ups
router.put('/:id/settings/voucher-bonus', businessController.updateVoucherBonus);
router.put('/:id/settings/voucher-adjustment-threshold', businessController.updateVoucherAdjustmentThreshold);

export default router;

