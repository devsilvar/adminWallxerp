/**
 * Security Middleware
 * 
 * Implements various security measures:
 * - Helmet for HTTP headers
 * - CORS configuration
 * - Rate limiting
 * 
 * @author WallX Engineering Team
 */

import helmet from 'helmet';
import cors from 'cors';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import config from '@/config';
// `logger` is used in the CORS callback below (line ~72) to log blocked
// origins in production. Without this import, `tsc` errors and any blocked
// origin in prod would also be a runtime ReferenceError crash mid-request.
import logger from '@/lib/logger';

/**
 * Helmet configuration for secure HTTP headers
 */
export const helmetMiddleware = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'https:'],
    },
  },
  crossOriginEmbedderPolicy: false, // Allow file downloads
});

/**
 * CORS configuration
 *
 * Production: allowlist is built from `FRONTEND_URL` (comma-separated for
 * multi-domain apps — e.g. `https://app.paymytax.ng,https://www.paymytax.ng`).
 * Dev: allow any origin so localhost ports, IP addresses, and mobile-device
 * testing all work without reconfiguration.
 */
const buildAllowedOrigins = (): string[] => {
  const fromEnv = config.cors.frontendUrl
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  if (config.app.isDevelopment) {
    const defaults = ['http://localhost:5173', 'http://localhost:3000'];
    return Array.from(new Set([...fromEnv, ...defaults]));
  }

  return Array.from(new Set(fromEnv));
};

const ALLOWED_ORIGINS = buildAllowedOrigins();

export const corsMiddleware = cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (curl, mobile apps, Postman,
    // server-to-server, same-origin) — these don't carry an Origin header.
    if (!origin) return callback(null, true);

    // Dev: fully permissive.
    if (config.app.isDevelopment) {
      return callback(null, true);
    }

    // Prod: strict allowlist.
    if (ALLOWED_ORIGINS.includes(origin)) {
      return callback(null, true);
    }

    // Log the blocked origin but don't crash - return a JSON response instead
    logger.warn(`CORS blocked origin: ${origin}. Add to FRONTEND_URL env var.`);
    return callback(null, false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Business-Id'],
  maxAge: 86400, // 24 hours
});

/**
 * Localhost / loopback detection — used to exempt dev traffic from rate limits.
 * Covers IPv4 127.0.0.0/8, IPv6 ::1, and the IPv4-mapped ::ffff:127.0.0.1 that
 * Node surfaces when the client connects over IPv4 while the server listens
 * on ::. A 100-year engineer doesn't make a dev fight their own rate limiter.
 */
const LOOPBACK_EXACT = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

const isLocalhostIp = (ip?: string): boolean => {
  if (!ip) return false;
  const raw = ip.split(',')[0]!.trim(); // X-Forwarded-For may be comma-separated
  if (LOOPBACK_EXACT.has(raw)) return true;
  if (raw.startsWith('127.')) return true; // full 127.0.0.0/8
  if (raw === 'localhost') return true;
  return false;
};

const skipLocalhost = (req: any): boolean => {
  // req.ip is the trusted client IP (respects trust proxy in prod). Fall
  // back to socket remote address for edge cases pre-trust-proxy.
  const ip: string | undefined = req.ip || req.socket?.remoteAddress;
  return isLocalhostIp(ip);
};

/**
 * Global rate limiter - applies to all routes
 * Skips localhost entirely so local dev / E2E runs never get throttled.
 */
export const globalRateLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs, // 15 minutes
  max: config.rateLimit.maxRequests, // 100 requests per window
  skip: skipLocalhost,
  message: {
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests, please try again later.',
    },
  },
  standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
  legacyHeaders: false, // Disable `X-RateLimit-*` headers
});

/**
 * Strict rate limiter for auth endpoints (login, register)
 * - In production: 10 failed attempts per 15 minutes per IP
 * - In test/dev: 5,000 attempts to allow test suite execution
 * - skipSuccessfulRequests: true ensures legitimate users are never throttled
 */
export const authRateLimiter = rateLimit({
  windowMs: config.rateLimit.authWindowMs,
  max: config.rateLimit.authMaxRequests,
  skip: skipLocalhost,
  skipSuccessfulRequests: true, // Don't count successful requests
  standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
  legacyHeaders: false, // Disable `X-RateLimit-*` headers
  message: {
    error: {
      code: 'AUTH_RATE_LIMIT_EXCEEDED',
      message: 'Too many authentication attempts. Please try again in 15 minutes.',
    },
  },
});

/**
 * Rate limiter for payment endpoints
 */
export const paymentRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: config.app.isDevelopment ? 5000 : 5, // 5,000 (dev) / 5 (prod)
  skip: skipLocalhost,
  message: {
    error: {
      code: 'PAYMENT_RATE_LIMIT_EXCEEDED',
      message: 'Too many payment attempts. Please try again later.',
    },
  },
});

/**
 * Strict rate limiter for password reset endpoints
 * 
 * More restrictive than general auth limiter to prevent:
 * - Email bombing attacks
 * - User enumeration attempts
 * - Resource exhaustion via email sending
 * 
 * Enterprise best practice: 3-5 attempts per hour per IP
 * Development: 1000x higher limit for testing and dev flows
 */
export const passwordResetRateLimiter = rateLimit({
  windowMs: config.app.isDevelopment ? 15 * 60 * 1000 : 60 * 60 * 1000, // 15 min (dev) / 1 hour (prod)
  max: config.app.isDevelopment ? 3000 : 3, // 3000 attempts (dev) / 3 attempts (prod)
  skip: skipLocalhost,
  skipSuccessfulRequests: false, // Count all requests to prevent enumeration
  message: {
    error: {
      code: 'PASSWORD_RESET_RATE_LIMIT_EXCEEDED',
      message: 'Too many password reset attempts. Please try again in 1 hour.',
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Strict rate limiter for email verification resend endpoint
 * Independent counter from password reset to prevent counter collision.
 */
export const verificationRateLimiter = rateLimit({
  windowMs: config.app.isDevelopment ? 15 * 60 * 1000 : 60 * 60 * 1000, // 15 min (dev) / 1 hour (prod)
  max: config.app.isDevelopment ? 5000 : 5, // 5000 attempts (dev) / 5 attempts (prod)
  skip: skipLocalhost,
  skipSuccessfulRequests: false, // Count all requests to prevent email bombing
  message: {
    error: {
      code: 'VERIFICATION_RATE_LIMIT_EXCEEDED',
      message: 'Too many verification email requests. Please try again later.',
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Strict rate limiter for customer voucher OTP requests.
 * Keyed per card (businessId:customerId) with 3 requests per hour in production.
 */
export const voucherOtpRequestRateLimiter = rateLimit({
  windowMs: config.app.isDevelopment ? 15 * 60 * 1000 : 60 * 60 * 1000,
  max: config.app.isDevelopment ? 3000 : 3,
  skip: skipLocalhost,
  keyGenerator: (req) => {
    const businessId = req.params?.businessId || 'global';
    const customerId = req.params?.customerId || (req as any).user?.userId || 'unknown';
    return `voucher_otp:${businessId}:${customerId}`;
  },
  validate: { keyGeneratorIpFallback: false, ip: false },
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: {
      code: 'OTP_RATE_LIMIT_EXCEEDED',
      message: 'Too many OTP requests for this card. Please wait before requesting another code.',
    },
  },
});

/**
 * Rate limiter for voucher PIN lookup.
 * Limits lookups to 20 attempts per 15 minutes per business + user/ip to block brute-force enumeration.
 */
export const voucherLookupRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: config.app.isDevelopment ? 20000 : 20, // 20,000 (dev) / 20 (prod)
  skip: skipLocalhost,
  keyGenerator: (req) => {
    const bid = (req.params as any)?.businessId || 'global';
    const uid = (req as any).user?.userId || ipKeyGenerator(req.ip || 'anon');
    return `voucher_lookup:${bid}:${uid}`;
  },
  validate: { keyGeneratorIpFallback: false, ip: false },
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: {
      code: 'VOUCHER_LOOKUP_RATE_LIMITED',
      message: 'Too many voucher lookups. Try again in 15 minutes.',
    },
  },
});

/**
 * Broadcast creation rate limiter for administrative announcements.
 * Prevents rapid-fire mass messaging and API exhaustion.
 */
export const broadcastRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: config.app.isDevelopment ? 1000 : 10,
  skip: skipLocalhost,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: {
      code: 'BROADCAST_RATE_LIMITED',
      message: 'Too many broadcasts, try again in a minute.',
    },
  },
});

/**
 * Rate limiter for public voucher verification links.
 * Limits attempts to 20 attempts per 15 minutes to prevent token enumeration.
 */
export const voucherVerificationRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: config.app.isDevelopment ? 20000 : 20, // 20,000 (dev) / 20 (prod)
  skip: skipLocalhost,
  keyGenerator: (req) => {
    const bid = (req.params as any)?.businessId || (req.params as any)?.id || 'global';
    const ip = ipKeyGenerator(req.ip || 'anon');
    return `voucher_verify:${bid}:${ip}`;
  },
  validate: { keyGeneratorIpFallback: false, ip: false },
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: {
      code: 'VERIFICATION_RATE_LIMITED',
      message: 'Too many verification attempts. Try again in 15 minutes.',
    },
  },
});


