/**
 * Unit Tests for Voucher PIN Service
 *
 * Tests PIN generation, hashing, verification, format validation,
 * lock checking, and lockout duration calculation.
 */

import {
  generateVoucherPin,
  hashVoucherPin,
  verifyVoucherPin,
  validatePinFormat,
  checkPinLock,
  nextLockDuration,
  VOUCHER_PIN_LENGTH,
  VOUCHER_PIN_REGEX,
  MAX_ATTEMPTS_BEFORE_LOCK,
  LOCK_15M_MS,
  LOCK_1H_MS,
} from '@/services/voucher-pin.service';
import { AppError } from '@/middleware/errorHandler';

describe('Voucher PIN Service', () => {
  describe('generateVoucherPin', () => {
    it('generates a 6-digit numeric PIN', () => {
      const pin = generateVoucherPin();
      expect(pin).toMatch(/^\d{6}$/);
      expect(pin.length).toBe(6);
    });

    it('generates PIN within valid range (100000-999999)', () => {
      const pin = generateVoucherPin();
      const num = parseInt(pin, 10);
      expect(num).toBeGreaterThanOrEqual(100000);
      expect(num).toBeLessThanOrEqual(999999);
    });

    it('generates unique PINs on subsequent calls', () => {
      const pins = new Set<string>();
      for (let i = 0; i < 100; i++) {
        pins.add(generateVoucherPin());
      }
      // Should have high variance (not all same)
      expect(pins.size).toBeGreaterThan(50);
    });
  });

  describe('hashVoucherPin and verifyVoucherPin', () => {
    it('hashes a PIN and verifies it correctly', async () => {
      const pin = '123456';
      const hash = await hashVoucherPin(pin);

      expect(hash).toBeDefined();
      expect(hash.length).toBeGreaterThan(20); // bcrypt hashes are ~60 chars
      expect(hash).not.toBe(pin); // Should be hashed, not plaintext

      const isValid = await verifyVoucherPin(pin, hash);
      expect(isValid).toBe(true);
    });

    it('rejects incorrect PIN', async () => {
      const correctPin = '123456';
      const wrongPin = '654321';
      const hash = await hashVoucherPin(correctPin);

      const isValid = await verifyVoucherPin(wrongPin, hash);
      expect(isValid).toBe(false);
    });

    it('produces different hashes for same PIN (salt)', async () => {
      const pin = '123456';
      const hash1 = await hashVoucherPin(pin);
      const hash2 = await hashVoucherPin(pin);

      expect(hash1).not.toBe(hash2); // bcrypt uses random salt
      expect(await verifyVoucherPin(pin, hash1)).toBe(true);
      expect(await verifyVoucherPin(pin, hash2)).toBe(true);
    });
  });

  describe('validatePinFormat', () => {
    it('accepts valid 6-digit PIN', () => {
      expect(() => validatePinFormat('123456')).not.toThrow();
      expect(() => validatePinFormat('000000')).not.toThrow();
      expect(() => validatePinFormat('999999')).not.toThrow();
    });

    it('rejects PIN with less than 6 digits', () => {
      expect(() => validatePinFormat('12345')).toThrow(AppError);
      expect(() => validatePinFormat('12345')).toThrow('PIN must be exactly 6 digits');
    });

    it('rejects PIN with more than 6 digits', () => {
      expect(() => validatePinFormat('1234567')).toThrow(AppError);
    });

    it('rejects PIN with non-numeric characters', () => {
      expect(() => validatePinFormat('12345a')).toThrow(AppError);
      expect(() => validatePinFormat('12-456')).toThrow(AppError);
      expect(() => validatePinFormat('12 456')).toThrow(AppError);
    });

    it('rejects empty or whitespace-only PIN', () => {
      expect(() => validatePinFormat('')).toThrow(AppError);
      expect(() => validatePinFormat('      ')).toThrow(AppError);
    });

    it('handles trimming and validates correctly', () => {
      expect(() => validatePinFormat('  123456  ')).not.toThrow();
    });
  });

  describe('checkPinLock', () => {
    it('does not throw when card is not locked', () => {
      const card = {
        pinAttempts: 2,
        pinLockedUntil: null,
      };
      expect(() => checkPinLock(card)).not.toThrow();
    });

    it('does not throw when lock has expired', () => {
      const expiredLock = new Date(Date.now() - 60000); // 1 minute ago
      const card = {
        pinAttempts: 3,
        pinLockedUntil: expiredLock,
      };
      expect(() => checkPinLock(card)).not.toThrow();
    });

    it('throws 423 error when card is currently locked', () => {
      const futureLock = new Date(Date.now() + 10 * 60000); // 10 minutes from now
      const card = {
        pinAttempts: 3,
        pinLockedUntil: futureLock,
      };

      try {
        checkPinLock(card);
        fail('Expected AppError to be thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(AppError);
        expect((err as AppError).statusCode).toBe(423);
        expect((err as AppError).code).toBe('VOUCHER_PIN_LOCKED');
        expect((err as AppError).message).toContain('Try again in');
        expect((err as AppError).details?.retryAfterMinutes).toBeGreaterThan(0);
      }
    });

    it('includes correct retry time in lock error', () => {
      const lock15min = new Date(Date.now() + 15 * 60000); // 15 minutes
      const card = {
        pinAttempts: 3,
        pinLockedUntil: lock15min,
      };

      try {
        checkPinLock(card);
        fail('Expected AppError to be thrown');
      } catch (err) {
        const retryMins = (err as AppError).details?.retryAfterMinutes;
        expect(retryMins).toBeGreaterThanOrEqual(14);
        expect(retryMins).toBeLessThanOrEqual(16);
      }
    });
  });

  describe('nextLockDuration', () => {
    it('returns 0 for attempts < 3', () => {
      expect(nextLockDuration(0)).toBe(0);
      expect(nextLockDuration(1)).toBe(0);
      expect(nextLockDuration(2)).toBe(0);
    });

    it('returns 15 minutes for 3-4 attempts', () => {
      expect(nextLockDuration(3)).toBe(LOCK_15M_MS);
      expect(nextLockDuration(4)).toBe(LOCK_15M_MS);
    });

    it('returns 1 hour for 5+ attempts', () => {
      expect(nextLockDuration(5)).toBe(LOCK_1H_MS);
      expect(nextLockDuration(6)).toBe(LOCK_1H_MS);
      expect(nextLockDuration(10)).toBe(LOCK_1H_MS);
    });
  });

  describe('Constants', () => {
    it('exports correct constant values', () => {
      expect(VOUCHER_PIN_LENGTH).toBe(6);
      expect(VOUCHER_PIN_REGEX).toEqual(/^\d{6}$/);
      expect(MAX_ATTEMPTS_BEFORE_LOCK).toBe(3);
      expect(LOCK_15M_MS).toBe(15 * 60 * 1000);
      expect(LOCK_1H_MS).toBe(60 * 60 * 1000);
    });
  });
});
