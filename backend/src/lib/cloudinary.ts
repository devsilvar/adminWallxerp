/**
 * Cloudinary upload / delete / transform wrapper.
 *
 * Logos are stored under `paymytax/logos/<businessId>/`.
 * On-the-fly transforms via URL rewriting (no sharp dependency).
 */
import { v2 as cloudinary } from 'cloudinary';
import { Readable } from 'stream';
import config from '@/config';
import { AppError } from '@/middleware/errorHandler';
import logger from './logger';

// ── Configure once at module load ───────────────────────────
cloudinary.config({
  cloud_name: config.cloudinary.cloudName,
  api_key: config.cloudinary.apiKey,
  api_secret: config.cloudinary.apiSecret,
  secure: true,
});

export const ALLOWED_LOGO_MIMES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/pjpeg',
  'image/jfif',
  'image/png',
  'image/x-png',
  'image/webp',
  'image/svg+xml',
  'image/svg',
]);

export const MAX_LOGO_BYTES = 5 * 1024 * 1024; // 5 MB

export function isAllowedLogoFile(mimetype?: string, originalname?: string): boolean {
  if (mimetype && ALLOWED_LOGO_MIMES.has(mimetype.toLowerCase())) {
    return true;
  }
  if (originalname) {
    const ext = originalname.split('.').pop()?.toLowerCase();
    if (ext && ['jpg', 'jpeg', 'png', 'webp', 'svg'].includes(ext)) {
      return true;
    }
  }
  return false;
}

/**
 * Upload a logo buffer to Cloudinary via streaming.
 * Deletes the previous logo if `oldPublicId` is supplied.
 */
export async function uploadLogoToCloudinary(
  businessId: string,
  buffer: Buffer,
  mimetype: string,
  oldPublicId?: string | null,
): Promise<{ url: string; publicId: string }> {
  // If Cloudinary is configured, attempt upload
  if (config.cloudinary.cloudName && config.cloudinary.apiKey && config.cloudinary.apiSecret) {
    // Delete previous asset first (best-effort, never blocks upload)
    if (oldPublicId && oldPublicId !== 'local_data_uri') {
      try {
        await cloudinary.uploader.destroy(oldPublicId);
        logger.info('Old logo deleted from Cloudinary', { oldPublicId });
      } catch (err) {
        logger.warn('Failed to delete old logo', { oldPublicId, error: err });
      }
    }

    try {
      const result = await new Promise<{ url: string; publicId: string }>((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          {
            folder: `paymytax/logos/${businessId}`,
            resource_type: 'image',
            transformation: [{ width: 800, height: 800, crop: 'limit' }],
          },
          (error, res) => {
            if (error || !res) {
              return reject(error || new Error('Cloudinary returned empty result'));
            }
            resolve({ url: res.secure_url, publicId: res.public_id });
          },
        );
        Readable.from(buffer).pipe(uploadStream);
      });
      return result;
    } catch (err) {
      logger.warn('Cloudinary upload failed, falling back to data URI storage', { error: err, businessId });
    }
  } else {
    logger.info('Cloudinary not configured — using data URI storage for business logo', { businessId });
  }

  // Graceful fallback: Store as Base64 Data URI
  const base64 = buffer.toString('base64');
  const dataUrl = `data:${mimetype};base64,${base64}`;
  return {
    url: dataUrl,
    publicId: 'local_data_uri',
  };
}

/**
 * Delete a logo by its Cloudinary public_id. Best-effort — never throws.
 */
export async function deleteLogoFromCloudinary(
  publicId: string,
): Promise<void> {
  if (!publicId || publicId === 'local_data_uri') return;
  if (!config.cloudinary.cloudName || !config.cloudinary.apiKey) return;
  try {
    await cloudinary.uploader.destroy(publicId);
    logger.info('Logo deleted from Cloudinary', { publicId });
  } catch (err) {
    logger.warn('Logo delete failed', { publicId, error: err });
  }
}

/**
 * Build a Cloudinary transform URL for a given use case.
 *
 * Inserts transforms between `/upload/` and the version segment:
 *   https://res.cloudinary.com/<cloud>/image/upload/<TRANSFORMS>/v.../file.jpg
 */
export function getTransformedLogoUrl(
  baseUrl: string,
  preset: 'thumb' | 'dashboard' | 'pdf',
): string {
  if (!baseUrl || baseUrl.startsWith('data:')) return baseUrl;
  if (!baseUrl.includes('/image/upload/')) return baseUrl;
  const transforms: Record<string, string> = {
    thumb: 'w_96,h_96,c_fill,g_auto,r_max,f_auto,q_auto',
    dashboard: 'w_200,h_200,c_fill,g_auto,r_max,f_auto,q_auto',
    pdf: 'w_200,h_200,c_fill,g_auto,f_png',
  };
  return baseUrl.replace('/image/upload/', `/image/upload/${transforms[preset]}/`);
}


/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Marketplace Product Images (Cloudinary)
 * ─────────────────────────────────────────────────────────────────────────────
 */

export const ALLOWED_PRODUCT_IMAGE_MIMES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/pjpeg',
  'image/png',
  'image/webp',
]);

export const MAX_PRODUCT_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB

export function isAllowedProductImage(mimetype?: string, originalname?: string): boolean {
  if (mimetype && ALLOWED_PRODUCT_IMAGE_MIMES.has(mimetype.toLowerCase())) {
    return true;
  }
  if (originalname) {
    const ext = originalname.split('.').pop()?.toLowerCase();
    if (ext && ['jpg', 'jpeg', 'png', 'webp'].includes(ext)) {
      return true;
    }
  }
  return false;
}

/**
 * Validates actual file binary header (magic bytes) to prevent content spoofing.
 */
export function isValidImageBuffer(buffer: Buffer): boolean {
  if (!buffer || buffer.length < 4) return false;
  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return true;
  // PNG: 89 50 4E 47
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return true;
  // WebP: RIFF ... WEBP
  if (
    buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return true;
  }
  return false;
}

/**
 * Upload a marketplace product image to Cloudinary via streaming.
 * Stored under `paymytax/marketplace/<businessId>/`.
 */
export async function uploadProductImageToCloudinary(
  businessId: string,
  buffer: Buffer,
  mimetype: string,
): Promise<{ url: string; publicId: string }> {
  if (config.cloudinary.cloudName && config.cloudinary.apiKey && config.cloudinary.apiSecret) {
    try {
      const result = await new Promise<{ url: string; publicId: string }>((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          {
            folder: `paymytax/marketplace/${businessId}`,
            resource_type: 'image',
            transformation: [{ width: 1200, height: 1200, crop: 'limit', quality: 'auto' }],
          },
          (error, res) => {
            if (error || !res) {
              return reject(error || new Error('Cloudinary returned empty result'));
            }
            resolve({ url: res.secure_url, publicId: res.public_id });
          },
        );
        Readable.from(buffer).pipe(uploadStream);
      });
      return result;
    } catch (err) {
      logger.warn('Cloudinary product image upload failed, falling back to data URI storage', { error: err, businessId });
    }
  } else {
    logger.info('Cloudinary not configured — using data URI storage for product image', { businessId });
  }

  // Graceful dev / offline fallback: Store as Base64 Data URI
  const base64 = buffer.toString('base64');
  const dataUrl = `data:${mimetype};base64,${base64}`;
  return {
    url: dataUrl,
    publicId: 'local_data_uri',
  };
}

/**
 * Delete a product image from Cloudinary by its public_id. Best-effort — never throws.
 */
export async function deleteProductImageFromCloudinary(
  publicId: string,
): Promise<void> {
  if (!publicId || publicId === 'local_data_uri') return;
  if (!config.cloudinary.cloudName || !config.cloudinary.apiKey) return;
  try {
    await cloudinary.uploader.destroy(publicId);
    logger.info('Product image deleted from Cloudinary', { publicId });
  } catch (err) {
    logger.warn('Product image delete failed', { publicId, error: err });
  }
}

export default cloudinary;
