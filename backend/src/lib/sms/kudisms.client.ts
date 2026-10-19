/**
 * KudiSMS Verification & SMS Client
 *
 * Provides phone-based OTP verification using KudiSMS hosted verification API:
 * - POST https://my.kudisms.net/api/sendotp
 * - POST https://my.kudisms.net/api/verifyotp
 *
 * Checks both HTTP status code and response body `error_code === '000'`.
 *
 * @author WallX Engineering Team
 */

import config from '@/config';
import { AppError } from '@/middleware/errorHandler';
import logger from '@/lib/logger';

const KUDISMS_BASE_URL = 'https://my.kudisms.net/api';
const DEFAULT_TIMEOUT_MS = 10000;

export interface KudiSmsSendOtpResult {
  verificationId: string;
  status: string;
  cost?: string | number;
  balance?: string | number;
}

export interface KudiSmsVerifyOtpResult {
  valid: boolean;
  status: string;
  verificationId: string;
  cost?: string | number;
}

/**
 * Normalizes any phone number into KudiSMS's required 234XXXXXXXXXX format.
 * Strips leading '+', replaces leading '0' with '234', and strips non-digits.
 */
export function normalizePhoneForKudiSms(rawPhone: string): string {
  if (!rawPhone) return '';
  let cleaned = rawPhone.trim().replace(/\D/g, '');

  if (cleaned.startsWith('234')) {
    return cleaned;
  }
  if (cleaned.startsWith('0')) {
    cleaned = cleaned.slice(1);
  }
  return `234${cleaned}`;
}

export class KudiSmsClient {
  private apiToken: string;
  private senderId: string;
  private appnameCode: string;
  private templateCode: string;
  private silentMode: boolean;

  constructor(opts?: {
    apiToken?: string;
    senderId?: string;
    appnameCode?: string;
    templateCode?: string;
    silentMode?: boolean;
  }) {
    this.apiToken = opts?.apiToken ?? config.kudisms.apiToken;
    this.senderId = opts?.senderId ?? config.kudisms.senderId;
    this.appnameCode = opts?.appnameCode ?? config.kudisms.appnameCode;
    this.templateCode = opts?.templateCode ?? config.kudisms.templateCode;
    this.silentMode =
      opts?.silentMode ??
      (opts?.apiToken ? false : config.kudisms.silentMode);
  }

  private async request<T = any>(
    endpoint: string,
    payload: Record<string, any>,
    timeoutMs: number = DEFAULT_TIMEOUT_MS
  ): Promise<T> {
    const url = `${KUDISMS_BASE_URL}${endpoint}`;
    let response: Response;

    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (fetchErr: any) {
      if (fetchErr.name === 'TimeoutError' || fetchErr.name === 'AbortError') {
        logger.error('[KUDISMS_TIMEOUT] KudiSMS request timed out', {
          endpoint,
          timeoutMs,
        });
        throw new AppError(
          504,
          `KudiSMS gateway timed out after ${timeoutMs}ms on ${endpoint}`,
          'KUDISMS_TIMEOUT',
          { timeoutMs, endpoint }
        );
      }

      logger.error('[KUDISMS_TRANSPORT_ERROR] KudiSMS transport failure', {
        endpoint,
        errorName: fetchErr.name,
        errorMessage: fetchErr.message,
      });
      throw new AppError(
        502,
        `KudiSMS network transport error on ${endpoint}: ${fetchErr.message}`,
        'KUDISMS_TRANSPORT_ERROR',
        { endpoint, originalError: fetchErr.message }
      );
    }

    let body: any;
    try {
      body = await response.json();
    } catch (parseErr: any) {
      logger.error('[KUDISMS_PARSE_ERROR] Failed to parse response JSON', {
        endpoint,
        status: response.status,
      });
      throw new AppError(
        502,
        'Invalid response received from SMS gateway',
        'KUDISMS_TRANSPORT_ERROR',
        { status: response.status }
      );
    }

    // Both HTTP status AND body.error_code must indicate success
    const errorCode = body?.error_code;
    const isSuccess = response.ok && errorCode === '000';

    if (!isSuccess) {
      logger.warn('[KUDISMS_ERROR] KudiSMS request rejected', {
        endpoint,
        status: response.status,
        errorCode,
        msg: body?.msg,
      });

      switch (errorCode) {
        case '109':
          throw new AppError(
            402,
            'Insufficient SMS credit balance — please contact administrator or support',
            'KUDISMS_INSUFFICIENT_BALANCE',
            { errorCode, msg: body?.msg }
          );
        case '107':
          throw new AppError(
            400,
            'Invalid phone number provided for SMS verification',
            'KUDISMS_INVALID_PHONE',
            { errorCode, msg: body?.msg }
          );
        case '100':
        case '101':
        case '105':
        case '106':
        case '111':
        case '114':
        case '185':
        case '188':
          throw new AppError(
            502,
            `SMS provider configuration issue: ${body?.msg || 'Check Sender ID and API credentials'}`,
            'KUDISMS_CONFIG_ERROR',
            { errorCode, msg: body?.msg }
          );
        default:
          throw new AppError(
            response.status >= 400 && response.status < 500 ? 400 : 502,
            body?.msg || 'KudiSMS operation failed',
            'KUDISMS_ERROR',
            { errorCode, msg: body?.msg, httpStatus: response.status }
          );
      }
    }

    return body as T;
  }

  /**
   * Sends a 6-digit OTP code to the recipient phone number via KudiSMS hosted verification.
   */
  async sendOtp(phone: string): Promise<KudiSmsSendOtpResult> {
    const normalizedPhone = normalizePhoneForKudiSms(phone);

    // Silent simulation mode when API credentials are not yet configured
    if (this.silentMode) {
      logger.info('[KUDISMS_SILENT_MODE] SMS API unconfigured/silent; returning simulated session', {
        phone: normalizedPhone,
      });
      return {
        verificationId: `sim_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        status: 'simulated_success',
        cost: 0,
        balance: 9999,
      };
    }

    const payload = {
      token: this.apiToken,
      recipients: normalizedPhone,
      channel: 'sms',
      otp_type: 'NUMERIC',
      otp_length: 6,
      otp_duration: 10, // 10 minutes expiry on KudiSMS side
      otp_attempts: 3,  // maximum 3 wrong attempts allowed by KudiSMS
      senderID: this.senderId,
      appnamecode: this.appnameCode,
      templatecode: this.templateCode,
    };

    const result = await this.request<any>('/sendotp', payload);

    return {
      verificationId: result.verification_id,
      status: result.status,
      cost: result.cost,
      balance: result.balance,
    };
  }

  /**
   * Verifies the customer-entered OTP against the active KudiSMS verification session.
   */
  async verifyOtp(verificationId: string, otp: string): Promise<KudiSmsVerifyOtpResult> {
    if (this.silentMode || verificationId.startsWith('sim_')) {
      logger.info('[KUDISMS_SILENT_MODE] Verifying silent simulated session', {
        verificationId,
        otp,
      });
      return {
        valid: true,
        status: 'simulated_success',
        verificationId,
        cost: 0,
      };
    }

    const payload = {
      token: this.apiToken,
      verification_id: verificationId,
      otp: otp.trim(),
    };

    const result = await this.request<any>('/verifyotp', payload);

    return {
      valid: true,
      status: result.status,
      verificationId: result.verification_id,
      cost: result.cost,
    };
  }
}

export const kudismsClient = new KudiSmsClient();
