/**
 * Display currency — PRESENTATION ONLY.
 *
 * The ledger is Naira. Nothing here may be used to build a request payload.
 * Never convert: amount inputs, payment initiation, subscription checkout,
 * PDFs, emails, exports, public pages, tax constants, admin portal.
 */

export const DISPLAY_CURRENCIES = ['NGN', 'USD', 'GBP', 'EUR', 'CAD'] as const;
export type DisplayCurrency = (typeof DISPLAY_CURRENCIES)[number];

export const CURRENCY_META: Record<
  DisplayCurrency,
  { name: string; symbol: string; locale: string; currencyDisplay: 'narrowSymbol' | 'symbol' }
> = {
  NGN: { name: 'Nigerian Naira', symbol: '₦', locale: 'en-NG', currencyDisplay: 'narrowSymbol' },
  USD: { name: 'US Dollar', symbol: '$', locale: 'en-US', currencyDisplay: 'narrowSymbol' },
  GBP: { name: 'British Pound', symbol: '£', locale: 'en-GB', currencyDisplay: 'narrowSymbol' },
  EUR: { name: 'Euro', symbol: '€', locale: 'en-IE', currencyDisplay: 'narrowSymbol' },
  // en-US + symbol is deliberate: en-CA renders CAD as "$" and collides with USD.
  CAD: { name: 'Canadian Dollar', symbol: 'CA$', locale: 'en-US', currencyDisplay: 'symbol' },
};

export function isDisplayCurrency(value: unknown): value is DisplayCurrency {
  return typeof value === 'string' && (DISPLAY_CURRENCIES as readonly string[]).includes(value);
}

let snapshot: { code: DisplayCurrency; rates: Record<string, number> } = { code: 'NGN', rates: {} };

export function setDisplaySnapshot(next: { code: DisplayCurrency; rates: Record<string, number> }) {
  snapshot = next;
}

export function getDisplayCurrency(): DisplayCurrency {
  return snapshot.code;
}

export function getDisplayRates(): Record<string, number> {
  return snapshot.rates;
}

/** NGN per 1 unit of `code`. `null` when the rate is missing or unusable. */
export function ngnRateFor(code: DisplayCurrency): number | null {
  if (code === 'NGN') return 1;
  const rate = snapshot.rates[code];
  return Number.isFinite(rate) && rate > 0 ? rate : null;
}

function toNumber(amount: number | string | null | undefined): number {
  if (amount === null || amount === undefined || amount === '') return 0;
  const n = typeof amount === 'string' ? parseFloat(amount) : amount;
  return Number.isFinite(n) ? n : 0;
}

export function convertFromNgn(amount: number, code: DisplayCurrency = snapshot.code): number {
  const rate = ngnRateFor(code);
  if (rate === null || rate === 1) return amount;
  return amount / rate;
}

export function formatMoney(
  amount: number | string | null | undefined,
  code: DisplayCurrency = snapshot.code,
  opts: { compact?: boolean; decimals?: number } = {}
): string {
  const num = toNumber(amount);
  const rate = ngnRateFor(code);

  // No rate ⇒ render Naira. Never print a foreign symbol over an unconverted number.
  const effective: DisplayCurrency = rate === null ? 'NGN' : code;
  const value = rate === null || rate === 1 ? num : num / rate;
  const meta = CURRENCY_META[effective];

  if (opts.compact && effective === 'NGN') {
    // Preserve the exact NGN compact output the app ships today.
    if (Math.abs(value) >= 1_000_000) return `₦${(value / 1_000_000).toFixed(1)}M`;
    if (Math.abs(value) >= 1_000) return `₦${(value / 1_000).toFixed(1)}K`;
  }

  return new Intl.NumberFormat(meta.locale, {
    style: 'currency',
    currency: effective,
    currencyDisplay: meta.currencyDisplay,
    notation: opts.compact ? 'compact' : 'standard',
    minimumFractionDigits: opts.decimals ?? 2,
    maximumFractionDigits: opts.decimals ?? 2,
  }).format(value);
}

/** Invoice documents may carry a foreign currency; those are formatted, never converted. */
export function formatInvoiceMoney(
  invoice: { currency?: string | null },
  amount: number | string | null | undefined
): string {
  const code = (invoice.currency || 'NGN').toUpperCase();
  if (code === 'NGN') return formatMoney(amount);

  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: code,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(toNumber(amount));
  } catch {
    return formatMoney(amount);
  }
}
