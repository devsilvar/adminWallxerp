/**
 * Financial Formatting Utilities for WallXERP Frontend
 * Handles currency (NGN), compact numbers, and localized date presentation.
 */

export function formatNaira(
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
