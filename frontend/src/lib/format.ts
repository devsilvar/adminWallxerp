/**
 * Financial Formatting Utilities for WallXERP Frontend
 * Handles currency (NGN), compact numbers, and localized date presentation.
 */

import { formatMoney, getDisplayCurrency } from './currency';

/**
 * NGN-locked formatter. Use ONLY where the figure must NEVER convert:
 * subscription pricing, tax-quiz amounts, payment confirmations,
 * withdrawal confirmations, tax-finalisation amounts, public records.
 *
 * For every other money display, use formatNaira() (display-aware).
 */
export function formatNgn(
  amount: number | string | undefined | null,
  compact = false
): string {
  if (amount === undefined || amount === null || amount === '') return '₦0.00';
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (isNaN(num)) return '₦0.00';

  if (compact) {
    if (Math.abs(num) >= 1_000_000) {
      return `₦${(num / 1_000_000).toFixed(1)}M`;
    }
    if (Math.abs(num) >= 1_000) {
      return `₦${(num / 1_000).toFixed(1)}K`;
    }
  }

  return `₦${num.toLocaleString('en-NG', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Display-aware. Renders in the user's selected currency. */
export function formatNaira(
  amount: number | string | undefined | null,
  compact = false
): string {
  return formatMoney(amount, getDisplayCurrency(), { compact });
}

export function formatDate(date: string | Date | undefined | null): string {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/**
 * Formats a calendar date pinned to Africa/Lagos.
 *
 * Settlement instants are stored at 00:00 Africa/Lagos, which is 23:00 UTC the
 * previous day. `formatDate` renders in the browser's local zone, so it shows
 * the wrong day for any client west of Lagos. Use this for settlement dates.
 */
export function formatLagosDate(date: string | Date | undefined | null): string {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Africa/Lagos',
  });
}

/**
 * Extract the last 4 digits of a phone number for voucher authentication.
 * Returns empty string if phone is too short or invalid.
 * 
 * @example
 * maskPhoneSuffix('08012345678') // '5678'
 * maskPhoneSuffix('+234 803 456 7890') // '7890'
 */
export function maskPhoneSuffix(phone: string | undefined | null): string {
  if (!phone) return '';
  const cleaned = phone.trim().replace(/\D/g, ''); // Remove non-digits
  if (cleaned.length < 4) return '';
  return cleaned.slice(-4);
}
