import { describe, test, expect, jest, beforeEach, afterEach } from '@jest/globals';
import {
  normalizePhoneForKudiSms,
  KudiSmsClient,
} from '../../src/lib/sms/kudisms.client';
import { AppError } from '../../src/middleware/errorHandler';

describe('KudiSMS Client Unit Tests', () => {
  describe('normalizePhoneForKudiSms', () => {
    test('normalizes 11-digit Nigerian local phone starting with 0', () => {
      expect(normalizePhoneForKudiSms('08012345678')).toBe('2348012345678');
      expect(normalizePhoneForKudiSms('09098765432')).toBe('2349098765432');
    });

    test('normalizes international format with +234', () => {
      expect(normalizePhoneForKudiSms('+2348012345678')).toBe('2348012345678');
    });

    test('preserves 234 prefix without duplicate prefixes', () => {
      expect(normalizePhoneForKudiSms('2348012345678')).toBe('2348012345678');
    });

    test('strips spaces, dashes, and parentheses', () => {
      expect(normalizePhoneForKudiSms('080-123-45678')).toBe('2348012345678');
      expect(normalizePhoneForKudiSms('+234 (801) 234 5678')).toBe('2348012345678');
    });

    test('returns empty string for empty input', () => {
      expect(normalizePhoneForKudiSms('')).toBe('');
      expect(normalizePhoneForKudiSms(null as any)).toBe('');
    });
  });

  describe('KudiSmsClient API interactions', () => {
    let client: KudiSmsClient;
    const originalFetch = global.fetch;

    beforeEach(() => {
      client = new KudiSmsClient({
        apiToken: 'test-token',
        senderId: 'WallX',
        appnameCode: 'TESTAPP',
        templateCode: 'TESTTMPL',
      });
    });

    afterEach(() => {
      global.fetch = originalFetch;
      jest.restoreAllMocks();
    });

    test('sendOtp successfully dispatches OTP and parses response', async () => {
      const mockResponse = {
        status: 'success',
        error_code: '000',
        cost: 3.5,
        balance: 500,
        verification_id: 'v_id_123456',
        msg: 'OTP sent successfully',
      };

      global.fetch = jest.fn(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(mockResponse),
        } as Response)
      ) as any;

      const result = await client.sendOtp('08012345678');
      expect(result).toEqual({
        verificationId: 'v_id_123456',
        status: 'success',
        cost: 3.5,
        balance: 500,
      });

      expect(global.fetch).toHaveBeenCalledWith(
        'https://my.kudisms.net/api/sendotp',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            token: 'test-token',
            recipients: '2348012345678',
            channel: 'sms',
            otp_type: 'NUMERIC',
            otp_length: 6,
            otp_duration: 10,
            otp_attempts: 3,
            senderID: 'WallX',
            appnamecode: 'TESTAPP',
            templatecode: 'TESTTMPL',
          }),
        })
      );
    });

    test('sendOtp throws 402 KUDISMS_INSUFFICIENT_BALANCE when error_code is 109', async () => {
      const mockResponse = {
        status: 'error',
        error_code: '109',
        msg: 'Insufficient units',
      };

      global.fetch = jest.fn(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(mockResponse),
        } as Response)
      ) as any;

      await expect(client.sendOtp('08012345678')).rejects.toThrow(AppError);

      try {
        await client.sendOtp('08012345678');
      } catch (err: any) {
        expect(err.statusCode).toBe(402);
        expect(err.code).toBe('KUDISMS_INSUFFICIENT_BALANCE');
      }
    });

    test('sendOtp throws 400 KUDISMS_INVALID_PHONE when error_code is 107', async () => {
      const mockResponse = {
        status: 'error',
        error_code: '107',
        msg: 'Invalid recipient',
      };

      global.fetch = jest.fn(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(mockResponse),
        } as Response)
      ) as any;

      try {
        await client.sendOtp('08012345678');
      } catch (err: any) {
        expect(err.statusCode).toBe(400);
        expect(err.code).toBe('KUDISMS_INVALID_PHONE');
      }
    });

    test('sendOtp throws 502 KUDISMS_CONFIG_ERROR when error_code indicates credential failure', async () => {
      const mockResponse = {
        status: 'error',
        error_code: '100',
        msg: 'Invalid API Token',
      };

      global.fetch = jest.fn(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(mockResponse),
        } as Response)
      ) as any;

      try {
        await client.sendOtp('08012345678');
      } catch (err: any) {
        expect(err.statusCode).toBe(502);
        expect(err.code).toBe('KUDISMS_CONFIG_ERROR');
      }
    });

    test('verifyOtp successfully validates OTP session', async () => {
      const mockResponse = {
        status: 'success',
        error_code: '000',
        verification_id: 'v_id_123456',
        cost: 0,
        msg: 'OTP verified successfully',
      };

      global.fetch = jest.fn(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(mockResponse),
        } as Response)
      ) as any;

      const result = await client.verifyOtp('v_id_123456', '123456');
      expect(result).toEqual({
        valid: true,
        status: 'success',
        verificationId: 'v_id_123456',
        cost: 0,
      });

      expect(global.fetch).toHaveBeenCalledWith(
        'https://my.kudisms.net/api/verifyotp',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            token: 'test-token',
            verification_id: 'v_id_123456',
            otp: '123456',
          }),
        })
      );
    });

    test('handles gateway timeout gracefully with 504 AppError', async () => {
      const timeoutError = new Error('The operation was aborted');
      timeoutError.name = 'TimeoutError';

      global.fetch = jest.fn(() => Promise.reject(timeoutError)) as any;

      await expect(client.sendOtp('08012345678')).rejects.toThrow(AppError);

      try {
        await client.sendOtp('08012345678');
      } catch (err: any) {
        expect(err.statusCode).toBe(504);
        expect(err.code).toBe('KUDISMS_TIMEOUT');
      }
    });

    test('handles network transport failure gracefully with 502 AppError', async () => {
      const netError = new Error('ECONNREFUSED');
      netError.name = 'FetchError';

      global.fetch = jest.fn(() => Promise.reject(netError)) as any;

      try {
        await client.sendOtp('08012345678');
      } catch (err: any) {
        expect(err.statusCode).toBe(502);
        expect(err.code).toBe('KUDISMS_TRANSPORT_ERROR');
      }
    });
  });
});
