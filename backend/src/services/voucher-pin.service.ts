/**
 * Voucher PIN Service
 *
 * Handles 6-digit PIN generation, bcrypt hashing/verification, format validation,
 * and progressive lockout logic (3 attempts → 15min, 5 attempts → 1 hour).
 *
 * Part of Voucher PIN Authentication feature (replaces OTP system).
 */

import bcrypt from 'bcrypt';
import { AppError } from '@/middleware/errorHandler';

// PIN format constants
export const VOUCHER_PIN_LENGTH = 6;
export const VOUCHER_PIN_REGEX = /^\d{6}$/;

// Bcrypt rounds (matches auth.service.ts and seed.ts convention)
const BCRYPT_ROUNDS = 12;

// Lockout thresholds
const MAX_ATTEMPTS_BEFORE_LOCK = 3;
const LOCK_15M_MS = 15 * 60 * 1000; // 15 minutes
const LOCK_1H_MS = 60 * 60 * 1000; // 1 hour

/**
 * Generate a random 6-digit PIN (100000-999999)
 */
export function generateVoucherPin(): string {
  return String(100000 + Math.floor(Math.random() * 900000));
}

/**
 * Hash a PIN using bcrypt with 12 rounds
 */
export async function hashVoucherPin(pin: string): Promise<string> {
  return bcrypt.hash(pin, BCRYPT_ROUNDS);
}

/**
 * Verify a PIN against its bcrypt hash
 */
export async function verifyVoucherPin(pin: string, hash: string): Promise<boolean> {
  return bcrypt.compare(pin, hash);
}

/**
 * Validate PIN format (must be exactly 6 digits)
 * @throws AppError if format is invalid
 */
export function validatePinFormat(pin: string): void {
  if (!VOUCHER_PIN_REGEX.test(pin.trim())) {
    throw new AppError(
      400,
      'PIN must be exactly 6 digits',
      'INVALID_PIN_FORMAT'
    );
  }
}

/**
 * Check if a card is currently PIN-locked
 * @throws AppError(423) if locked with retry time
 */
export function checkPinLock(card: {
  pinAttempts: number;
  pinLockedUntil: Date | null;
}): void {
  if (card.pinLockedUntil && new Date(card.pinLockedUntil).getTime() > Date.now()) {
    const remainingMs = new Date(card.pinLockedUntil).getTime() - Date.now();
    const mins = Math.ceil(remainingMs / 60000);
    throw new AppError(
      423,
      `Voucher PIN locked. Try again in ${mins} minute(s).`,
      'VOUCHER_PIN_LOCKED',
      { retryAfterMinutes: mins }
    );
  }
}

/**
 * Calculate next lock duration based on failed attempt count
 * - 3-4 attempts: 15 minutes
 * - 5+ attempts: 1 hour
 * - <3 attempts: no lock
 */
export function nextLockDuration(attempts: number): number {
  if (attempts >= 5) return LOCK_1H_MS;
  if (attempts >= 3) return LOCK_15M_MS;
  return 0;
}

// Export constants for use in tests and other services
export { MAX_ATTEMPTS_BEFORE_LOCK, LOCK_15M_MS, LOCK_1H_MS };
