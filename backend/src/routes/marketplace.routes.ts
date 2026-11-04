import { Router } from 'express';
import multer from 'multer';
import { authenticate } from '@/middleware/auth';
import { AppError } from '@/middleware/errorHandler';
import { isAllowedProductImage, MAX_PRODUCT_IMAGE_BYTES } from '@/lib/cloudinary';
import * as marketplaceController from '@/controllers/marketplace.controller';

const router = Router({ mergeParams: true });

// All SME marketplace routes require valid session authentication.
// Business membership access is strictly enforced by verifyBusinessAccess in the domain service.
router.use(authenticate);

// Multer memory storage middleware for product image uploads (5MB max per image)
const productMediaUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_PRODUCT_IMAGE_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!isAllowedProductImage(file.mimetype, file.originalname)) {
      return cb(
        new AppError(
          400,
          'Only JPEG, PNG, or WebP images under 5MB are accepted.',
          'INVALID_FILE_TYPE'
        )
      );
    }
    cb(null, true);
  },
}).fields([
  { name: 'file', maxCount: 1 },
  { name: 'image', maxCount: 1 },
]);

// SME Product Inventory & Marketplace CRUD
router.post('/', marketplaceController.createProduct);
router.get('/', marketplaceController.listProducts);
router.get('/:id', marketplaceController.getProduct);
router.patch('/:id', marketplaceController.updateProduct);

// Media upload / Cloudinary integration
router.post('/images', productMediaUpload, marketplaceController.uploadProductImage);
router.delete('/images', marketplaceController.deleteProductImage);

// Lifecycle transitions
router.post('/:id/submit', marketplaceController.submitForApproval);
router.post('/:id/archive', marketplaceController.archiveProduct);

export default router;
