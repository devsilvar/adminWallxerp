import { create } from 'zustand';
import api from '@/lib/axios.ts';
import { STALE, isFresh } from '@/lib/cache.ts';
import type { Business } from '@/types/index.ts';

interface BusinessState {
  businesses: Business[];
  activeBusiness: Business | null;
  isLoading: boolean;
  lastFetchedAt: number | null;

  /**
   * Fetch businesses. By default uses the cache: if data was loaded within
   * STALE.long, returns immediately without a network call. Pass `force: true`
   * after a mutation that invalidates the list (e.g. create / delete).
   *
   * In-flight requests are deduplicated — concurrent callers share one
   * round-trip.
   */
  fetchBusinesses: (force?: boolean) => Promise<void>;
  setActiveBusiness: (business: Business) => void;
  createBusiness: (data: Partial<Business>) => Promise<Business>;
  updateVoucherAdjustmentThreshold: (businessId: string, threshold: number) => Promise<void>;
  updateSlotAllowance: (businessId: string, allowance: number) => void;
  /**
   * Reset to initial state. Called from auth.store.logout() to prevent the
   * previous user's businesses from bleeding into the next session.
   */
  clear: () => void;
}

// Per-call AbortController. The prior version cached the in-flight Promise
// at module scope (`inflight`). If that Promise was aborted (tab-throttled
// browser, hot reload, React effect cleanup, logout) the cache held a
// never-resolving Promise and isLoading stayed `true` — which strands
// ProtectedRoute's <GlobalLoadingSkeleton/> until manual refresh. The
// post-invite `/dashboard` landing hits this path: InvitationAccept.tsx
// calls fetchBusinesses(true) and then setTimeout(navigate('/dashboard'))
// — if the request aborts between, the dashboard renders the skeleton
// forever. AbortController per call plus equality-guarded settle (only
// the active controller clears isLoading) closes the gap. Same pattern
// as Dashboard.tsx::bundleAbortRef, promoted to store layer.
let inflightCtrl: AbortController | null = null;

export const useBusinessStore = create<BusinessState>((set, get) => ({
  businesses: [],
  activeBusiness: null,
  isLoading: true,
  lastFetchedAt: null,

  fetchBusinesses: async (force = false) => {
    const state = get();

    // Cache hit — return cached data without a network call.
    if (!force && isFresh(state.lastFetchedAt, STALE.long) && state.businesses.length > 0) {
      // Make sure isLoading is false in case a stale `true` lingered.
      if (state.isLoading) set({ isLoading: false });
      return;
    }

    // Abort any prior in-flight call to guarantee a single settler.
    inflightCtrl?.abort();
    const ctrl = new AbortController();
    inflightCtrl = ctrl;

    set({ isLoading: state.businesses.length === 0 });

    try {
      const { data } = await api.get('/businesses', { signal: ctrl.signal });
      if (ctrl.signal.aborted) return;
      const businesses: Business[] = data.data;

      const stored = localStorage.getItem('activeBusinessId');
      const active =
        businesses.find((b) => b.id === stored) || businesses[0] || null;
      if (active) localStorage.setItem('activeBusinessId', active.id);

      const currentActive = get().activeBusiness;
      const activeChanged =
        !currentActive ||
        currentActive.id !== active?.id ||
        JSON.stringify(currentActive) !== JSON.stringify(active);

      set({
        businesses,
        ...(activeChanged ? { activeBusiness: active } : {}),
        lastFetchedAt: Date.now(),
      });
    } catch (err: any) {
      if (err?.name === 'CanceledError' || err?.code === 'ERR_CANCELED') return;
      throw err;
    } finally {
      // Only settle isLoading if WE are still the active call. Aborted
      // callers must not clobber a newer in-flight controller's state.
      if (inflightCtrl === ctrl) {
        set({ isLoading: false });
        inflightCtrl = null;
      }
    }
  },

  setActiveBusiness: (business) => {
    localStorage.setItem('activeBusinessId', business.id);
    set({ activeBusiness: business });
  },

  createBusiness: async (payload) => {
    const { data } = await api.post('/businesses', payload);
    const business = data.data;
    set((state) => ({
      businesses: [...state.businesses, business],
      activeBusiness: state.activeBusiness || business,
      lastFetchedAt: Date.now(), // we just got fresh data
    }));
    return business;
  },

  updateVoucherAdjustmentThreshold: async (businessId, threshold) => {
    const prev = get().businesses.find((b) => b.id === businessId)?.voucherAdjustmentThreshold;
    // Optimistic update
    set((state) => ({
      businesses: state.businesses.map((b) =>
        b.id === businessId ? { ...b, voucherAdjustmentThreshold: threshold } : b
      ),
      activeBusiness:
        state.activeBusiness?.id === businessId
          ? { ...state.activeBusiness, voucherAdjustmentThreshold: threshold }
          : state.activeBusiness,
    }));

    try {
      await api.put(`/businesses/${businessId}/settings/voucher-adjustment-threshold`, { threshold });
    } catch (err) {
      // Revert on error
      set((state) => ({
        businesses: state.businesses.map((b) =>
          b.id === businessId ? { ...b, voucherAdjustmentThreshold: prev } : b
        ),
        activeBusiness:
          state.activeBusiness?.id === businessId
            ? { ...state.activeBusiness, voucherAdjustmentThreshold: prev }
            : state.activeBusiness,
      }));
      throw err;
    }
  },

  updateSlotAllowance: (businessId, allowance) => {
    set((state) => ({
      businesses: state.businesses.map((b) =>
        b.id === businessId ? { ...b, marketplaceSlotAllowance: allowance } : b
      ),
      activeBusiness:
        state.activeBusiness?.id === businessId
          ? { ...state.activeBusiness, marketplaceSlotAllowance: allowance }
          : state.activeBusiness,
    }));
  },

  clear: () => {
    // `inflightCtrl` is module-scoped (not in the store) — abort + reset it
    // here so a request still in flight at logout time can't unblock new
    // requests for the next user. Called from auth.store.logout()
    // (auth.store.ts clears every domain store before nulling user).
    inflightCtrl?.abort();
    inflightCtrl = null;
    set({
      businesses: [],
      activeBusiness: null,
      isLoading: false,
      lastFetchedAt: null,
    });
  },
}));
