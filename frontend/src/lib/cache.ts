/**
 * Cache freshness helpers — shared by Zustand stores to implement
 * stale-while-revalidate without pulling in a query library.
 *
 * Pattern in stores:
 *   - track lastFetchedAt + lastFetchedKey (e.g. businessId)
 *   - on fetch, if fresh AND key matches AND not forced → skip the network
 *   - otherwise: serve cached data immediately, kick off background refetch
 */

export const STALE = {
  /** Fast-changing data: dashboard, sales list, active reminders. */
  short: 30_000, // 30s

  /** Medium-velocity: invoices list, expense list. */
  medium: 60_000, // 1min

  /** Mostly-static: businesses list, settings. */
  long: 5 * 60_000, // 5min
};

export function isFresh(lastFetchedAt: number | null, ttl: number): boolean {
  if (!lastFetchedAt) return false;
  return Date.now() - lastFetchedAt < ttl;
}
