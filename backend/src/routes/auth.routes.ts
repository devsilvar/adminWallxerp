import { Router } from 'express';
import {
  authRateLimiter,
  passwordResetRateLimiter,
  verificationRateLimiter,
} from '@/middleware/security';
import { authenticate } from '@/middleware/auth';
import * as authController from '@/controllers/auth.controller';
import * as pinController from '@/controllers/pin.controller';
import * as sessionController from '@/controllers/session.controller';

const router = Router();

// Rate limiter re-enabled with higher limits for testing
router.post('/register', authRateLimiter, authController.register);
router.post('/login', authRateLimiter, authController.login);
router.post('/refresh', authRateLimiter, authController.refreshToken);
router.get('/me', authenticate, authController.getMe);
router.patch('/me', authenticate, authController.updateMe);
router.patch('/me/primary-business', authenticate, authController.updatePrimaryBusiness);
router.put('/change-password', authenticate, authController.changePassword);
// Dedicated stricter rate limiter for password reset to prevent abuse
router.post('/forgot-password', passwordResetRateLimiter, authController.forgotPassword);
router.post('/reset-password', passwordResetRateLimiter, authController.resetPassword);

// ─── Email Verification (Public) ─────────────────────────
router.post('/verify-email', verificationRateLimiter, authController.verifyEmail);
router.post('/resend-verification', verificationRateLimiter, authController.resendVerification);


// ─── Sensitive Data (PIN Step-Up Required) ──────────────────
router.post('/reveal-bvn', authenticate, authRateLimiter, authController.revealBvn);
router.post('/update-bvn', authenticate, authRateLimiter, authController.updateBvn);

// ─── Transaction PIN Management (Authenticated) ────────────
router.get('/pin/status', authenticate, pinController.getStatus);
router.post('/pin/setup', authenticate, authRateLimiter, pinController.setup);
router.post('/pin/verify', authenticate, authRateLimiter, pinController.verify);
router.put('/pin/change', authenticate, authRateLimiter, pinController.change);

// ─── Non-Custodial Regulatory Terms (Authenticated) ─────────
router.post('/accept-regulatory-terms', authenticate, authController.acceptRegulatoryTerms);

// ─── Multi-Device Session Management (Authenticated) ───────
router.get('/sessions', authenticate, sessionController.listSessions);
router.delete('/sessions/:sessionId', authenticate, sessionController.revokeSession);
router.post('/sessions/revoke-others', authenticate, sessionController.revokeAllOtherSessions);

export default router;
