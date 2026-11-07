import { describe, it, expect, beforeEach } from 'vitest';
import {
  DISPLAY_CURRENCIES,
  CURRENCY_META,
  isDisplayCurrency,
  setDisplaySnapshot,
  getDisplayCurrency,
  getDisplayRates,
  ngnRateFor,
  convertFromNgn,
  formatMoney,
  formatInvoiceMoney,
} from '../currency';
import { formatNaira, formatNgn } from '../format';

describe('currency utilities', () => {
  beforeEach(() => {
    // Reset snapshot to initial NGN state with standard test rates
    setDisplaySnapshot({
      code: 'NGN',
      rates: {
        USD: 1350,
        GBP: 1750,
        EUR: 1500,
        CAD: 1000,
      },
    });
  });

  describe('constants & metadata', () => {
    it('defines 5 display currencies', () => {
      expect(DISPLAY_CURRENCIES).toEqual(['NGN', 'USD', 'GBP', 'EUR', 'CAD']);
    });

    it('has valid metadata for each display currency', () => {
      for (const code of DISPLAY_CURRENCIES) {
        const meta = CURRENCY_META[code];
        expect(meta).toBeDefined();
        expect(meta.symbol).toBeTruthy();
        expect(meta.locale).toBeTruthy();
      }
      expect(CURRENCY_META.CAD.symbol).toBe('CA$');
      expect(CURRENCY_META.CAD.currencyDisplay).toBe('symbol');
      expect(CURRENCY_META.EUR.locale).toBe('en-IE');
    });

    it('validates display currency with isDisplayCurrency', () => {
      expect(isDisplayCurrency('NGN')).toBe(true);
      expect(isDisplayCurrency('USD')).toBe(true);
      expect(isDisplayCurrency('GBP')).toBe(true);
      expect(isDisplayCurrency('EUR')).toBe(true);
      expect(isDisplayCurrency('CAD')).toBe(true);

      expect(isDisplayCurrency('JPY')).toBe(false);
      expect(isDisplayCurrency('')).toBe(false);
      expect(isDisplayCurrency(null)).toBe(false);
      expect(isDisplayCurrency(undefined)).toBe(false);
      expect(isDisplayCurrency(123)).toBe(false);
    });
  });

  describe('rates & conversion', () => {
    it('ngnRateFor returns 1 for NGN and rate for foreign currencies', () => {
      expect(ngnRateFor('NGN')).toBe(1);
      expect(ngnRateFor('USD')).toBe(1350);
      expect(ngnRateFor('GBP')).toBe(1750);
      expect(ngnRateFor('EUR')).toBe(1500);
      expect(ngnRateFor('CAD')).toBe(1000);
    });

    it('ngnRateFor returns null when rate is missing or invalid', () => {
      setDisplaySnapshot({ code: 'NGN', rates: { USD: 0, GBP: -10 } });
      expect(ngnRateFor('USD')).toBeNull();
      expect(ngnRateFor('GBP')).toBeNull();
      expect(ngnRateFor('CAD')).toBeNull();
    });

    it('convertFromNgn calculates correct converted amounts', () => {
      expect(convertFromNgn(1350, 'USD')).toBe(1);
      expect(convertFromNgn(2700, 'USD')).toBe(2);
      expect(convertFromNgn(1750, 'GBP')).toBe(1);
      expect(convertFromNgn(5000, 'NGN')).toBe(5000);
    });

    it('convertFromNgn returns unchanged amount if rate is missing', () => {
      setDisplaySnapshot({ code: 'NGN', rates: {} });
      expect(convertFromNgn(1350, 'USD')).toBe(1350);
    });
  });

  describe('formatMoney', () => {
    it('formats NGN by default with ₦ symbol and commas', () => {
      const res = formatMoney(1500000);
      expect(res).toContain('1,500,000.00');
      expect(res).toContain('₦');
    });

    it('formats USD with $ symbol', () => {
      const res = formatMoney(1350, 'USD');
      expect(res).toContain('$');
      expect(res).toContain('1.00');
    });

    it('formats GBP with £ symbol', () => {
      const res = formatMoney(1750, 'GBP');
      expect(res).toContain('£');
      expect(res).toContain('1.00');
    });

    it('formats EUR with € symbol', () => {
      const res = formatMoney(1500, 'EUR');
      expect(res).toContain('€');
      expect(res).toContain('1.00');
    });

    it('formats CAD with CA$ symbol to prevent USD collision', () => {
      const res = formatMoney(1000, 'CAD');
      expect(res).toContain('CA$');
      expect(res).toContain('1.00');
    });

    it('falls back to NGN when rate is missing rather than rendering foreign symbol over unconverted amount', () => {
      setDisplaySnapshot({ code: 'NGN', rates: {} });
      const res = formatMoney(5000, 'USD');
      expect(res).toContain('₦');
      expect(res).toContain('5,000.00');
      expect(res).not.toContain('$');
    });

    it('handles null, undefined, and empty string safely', () => {
      expect(formatMoney(null)).toContain('0.00');
      expect(formatMoney(undefined)).toContain('0.00');
      expect(formatMoney('')).toContain('0.00');
    });

    it('supports compact notation for NGN', () => {
      expect(formatMoney(1_500_000, 'NGN', { compact: true })).toBe('₦1.5M');
      expect(formatMoney(2_500, 'NGN', { compact: true })).toBe('₦2.5K');
      expect(formatMoney(500, 'NGN', { compact: true })).toContain('500.00');
    });

    it('supports custom decimal places', () => {
      const res = formatMoney(1350, 'USD', { decimals: 0 });
      expect(res).toContain('$1');
      expect(res).not.toContain('$1.00');
    });
  });

  describe('formatInvoiceMoney', () => {
    it('formats foreign invoice currency without conversion', () => {
      const usdInvoice = { currency: 'USD' };
      const res = formatInvoiceMoney(usdInvoice, 100);
      expect(res).toContain('$');
      expect(res).toContain('100.00');
    });

    it('converts NGN invoice to display currency', () => {
      setDisplaySnapshot({
        code: 'USD',
        rates: { USD: 1350 },
      });
      const ngnInvoice = { currency: 'NGN' };
      const res = formatInvoiceMoney(ngnInvoice, 1350);
      expect(res).toContain('$');
      expect(res).toContain('1.00');
    });

    it('handles null/missing invoice currency as NGN', () => {
      const noCurrencyInvoice = {};
      const res = formatInvoiceMoney(noCurrencyInvoice, 5000);
      expect(res).toContain('5,000.00');
    });
  });

  describe('formatNaira & formatNgn', () => {
    it('formatNgn always renders Naira regardless of snapshot', () => {
      setDisplaySnapshot({ code: 'USD', rates: { USD: 1350 } });
      const res = formatNgn(1000);
      expect(res).toContain('₦');
      expect(res).toContain('1,000.00');
      expect(res).not.toContain('$');
    });

    it('formatNaira reacts to active display currency', () => {
      setDisplaySnapshot({ code: 'USD', rates: { USD: 1350 } });
      const res = formatNaira(1350);
      expect(res).toContain('$');
      expect(res).toContain('1.00');
    });

    it('formatNaira handles compact format', () => {
      setDisplaySnapshot({ code: 'NGN', rates: {} });
      expect(formatNaira(1_500_000, true)).toBe('₦1.5M');
    });
  });
});
