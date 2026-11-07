import { describe, it, expect, vi, beforeEach } from 'vitest';
import api from '@/lib/axios';
import { useCurrencyStore } from '../currency.store';
import { getDisplayCurrency, getDisplayRates } from '@/lib/currency';

describe('useCurrencyStore', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useCurrencyStore.getState().clear();
  });

  it('starts in NGN with empty rates', () => {
    const state = useCurrencyStore.getState();
    expect(state.code).toBe('NGN');
    expect(state.rates).toEqual({});
    expect(state.loading).toBe(false);
    expect(state.switching).toBe(false);
    expect(state.error).toBeNull();
  });

  it('fetchRates fetches rates and updates store and snapshot', async () => {
    const mockRates = { USD: 1350.5, GBP: 1750.2, EUR: 1480.0, CAD: 1010.1 };
    vi.spyOn(api, 'get').mockResolvedValueOnce({
      data: {
        success: true,
        data: {
          rates: mockRates,
          source: 'er-api',
          fetchedAt: '2026-11-02T12:00:00Z',
          stale: false,
        },
      },
    });

    const success = await useCurrencyStore.getState().fetchRates(true);
    expect(success).toBe(true);

    const state = useCurrencyStore.getState();
    expect(state.rates).toEqual(mockRates);
    expect(state.source).toBe('er-api');
    expect(state.stale).toBe(false);
    expect(state.loading).toBe(false);

    // Verify module-level snapshot was also synchronized
    expect(getDisplayRates()).toEqual(mockRates);
  });

  it('failed fetch keeps prior rates and flags error', async () => {
    // Prime store with existing rates
    const initialRates = { USD: 1300 };
    useCurrencyStore.setState({ rates: initialRates, code: 'NGN' });

    vi.spyOn(api, 'get').mockRejectedValueOnce(new Error('Network offline'));

    const success = await useCurrencyStore.getState().fetchRates(true);

    // Prior rates retained so user can still see converted prices
    expect(success).toBe(true);
    const state = useCurrencyStore.getState();
    expect(state.rates).toEqual(initialRates);
    expect(state.stale).toBe(true);
    expect(state.error).toBe('RATES_UNAVAILABLE');
    expect(state.loading).toBe(false);
  });

  it('setCurrency instantly switches to NGN without network call', async () => {
    const apiSpy = vi.spyOn(api, 'get');
    useCurrencyStore.setState({ code: 'USD' });

    await useCurrencyStore.getState().setCurrency('NGN');

    expect(useCurrencyStore.getState().code).toBe('NGN');
    expect(getDisplayCurrency()).toBe('NGN');
    expect(apiSpy).not.toHaveBeenCalled();
  });

  it('setCurrency instantly switches if rate already cached in store', async () => {
    const apiSpy = vi.spyOn(api, 'get');
    useCurrencyStore.setState({ rates: { USD: 1350 } });

    await useCurrencyStore.getState().setCurrency('USD');

    expect(useCurrencyStore.getState().code).toBe('USD');
    expect(getDisplayCurrency()).toBe('USD');
    expect(apiSpy).not.toHaveBeenCalled();
  });

  it('clear() resets code to NGN and clears rates and errors', () => {
    useCurrencyStore.setState({
      code: 'USD',
      rates: { USD: 1350 },
      source: 'test',
      stale: true,
      error: 'TEST_ERR',
    });

    useCurrencyStore.getState().clear();

    const state = useCurrencyStore.getState();
    expect(state.code).toBe('NGN');
    expect(state.rates).toEqual({});
    expect(state.source).toBe('none');
    expect(state.stale).toBe(false);
    expect(state.error).toBeNull();
    expect(getDisplayCurrency()).toBe('NGN');
  });
});
