import { create } from 'zustand';
import api, { getErrorMessage } from '@/lib/axios.ts';
import type { AdminDashboardStats } from '@/types/index.ts';

/**
 * Admin platform-stats store.
 *
 * `/admin/dashboard` was being requested independently by three components —
 * the sidebar (for the pending-withdrawal badge), the withdrawals list (for
 * the SLA banner), and the dashboard overview tab. On an admin page load that
 * is 2–3 identical round-trips for one payload.
 *
 * `inFlight` dedupes concurrent callers: whichever mounts first issues the
 * request, the rest await the same promise. `fetchStats` returns the cached
 * value unless `force` is set, which is what the dashboard's refresh button
 * and the post-sweep invalidation use.
 */
interface AdminStatsState {
  stats: AdminDashboardStats | null;
  loading: boolean;
  error: string | null;

  fetchStats: (opts?: { force?: boolean }) => Promise<AdminDashboardStats | null>;
  clear: () => void;
}

/** TTL for the shared cache. Short enough that a payout approval elsewhere
 *  doesn't leave a stale pending count on the sidebar badge. */
const CACHE_TTL_MS = 30_000;

let inFlight: Promise<AdminDashboardStats | null> | null = null;
let fetchedAt = 0;

export const useAdminStatsStore = create<AdminStatsState>((set, get) => ({
  stats: null,
  loading: false,
  error: null,

  fetchStats: async ({ force = false } = {}) => {
    const { stats } = get();
    if (!force && stats && Date.now() - fetchedAt < CACHE_TTL_MS) return stats;
    if (inFlight) return inFlight;

    set({ loading: true, error: null });

    inFlight = api
      .get('/admin/dashboard')
      .then((r) => {
        fetchedAt = Date.now();
        set({ stats: r.data.data, loading: false, error: null });
        return r.data.data as AdminDashboardStats;
      })
      .catch((err) => {
        set({ error: getErrorMessage(err, 'Failed to load platform stats'), loading: false });
        return null;
      })
      .finally(() => {
        inFlight = null;
      });

    return inFlight;
  },

  clear: () => {
    fetchedAt = 0;
    inFlight = null;
    set({ stats: null, loading: false, error: null });
  },
}));
