import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import toast from 'react-hot-toast';
import api from '@/lib/axios.ts';
import { setDisplaySnapshot, type DisplayCurrency } from '@/lib/currency';

const FRESH_MS = 6 * 60 * 60 * 1000; // 6h

interface CurrencyState {
  code: DisplayCurrency;
  rates: Record<string, number>;
  fetchedAt: number | null;
  source: string;
  stale: boolean;
  loading: boolean;   // background prefetch in flight (mount, TTL expiry) — no veil
  switching: boolean; // user-initiated switch waiting on the network — veil
  error: string | null;
  fetchRates: (force?: boolean) => Promise<boolean>;
  setCurrency: (code: DisplayCurrency) => Promise<void>;
  clear: () => void;
}

export const useCurrencyStore = create<CurrencyState>()(
  persist(
    (set, get) => ({
      code: 'NGN',
      rates: {},
      fetchedAt: null,
      source: 'none',
      stale: false,
      loading: false,
      switching: false,
      error: null,

      fetchRates: async (force = false) => {
        const { rates, fetchedAt, loading } = get();
        const hasRates = Object.keys(rates).length > 0;
        const fresh = hasRates && fetchedAt !== null && Date.now() - fetchedAt < FRESH_MS;
        if (!force && fresh) return true;
        if (loading) return hasRates;

        set({ loading: true, error: null });
        try {
          const { data } = await api.get('/fx/rates');
          const payload = data?.data ?? {};
          const nextRates: Record<string, number> = payload.rates ?? {};
          set({
            rates: nextRates,
            fetchedAt: payload.fetchedAt ? new Date(payload.fetchedAt).getTime() : Date.now(),
            source: payload.source ?? 'unknown',
            stale: Boolean(payload.stale),
            loading: false,
          });
          return Object.keys(nextRates).length > 0;
        } catch {
          set({ loading: false, stale: true, error: 'RATES_UNAVAILABLE' });
          return Object.keys(get().rates).length > 0;
        }
      },

      setCurrency: async (code) => {
        if (get().code === code) return;
        // Warm path: the rate is already in the store ⇒ instant switch, no veil.
        if (code === 'NGN' || (get().rates[code] ?? 0) > 0) {
          set({ code });
          return;
        }
        set({ switching: true });
        try {
          const ok = await get().fetchRates(true);
          if (ok && (get().rates[code] ?? 0) > 0) {
            set({ code });
          } else {
            toast.error('Live rates unavailable. Showing Naira.');
          }
        } finally {
          set({ switching: false });
        }
      },

      clear: () =>
        set({
          code: 'NGN',
          rates: {},
          fetchedAt: null,
          source: 'none',
          stale: false,
          loading: false,
          switching: false,
          error: null,
        }),
    }),
    {
      name: 'wallx_display_currency',
      partialize: (s) => ({ code: s.code, rates: s.rates, fetchedAt: s.fetchedAt }),
    }
  )
);

// formatMoney reads this snapshot outside React. Keep it in sync with the store,
// including rehydration from localStorage.
setDisplaySnapshot({
  code: useCurrencyStore.getState().code,
  rates: useCurrencyStore.getState().rates,
});
useCurrencyStore.subscribe((s) => setDisplaySnapshot({ code: s.code, rates: s.rates }));
