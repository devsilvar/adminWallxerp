import { config } from '@/config';
import logger from '@/lib/logger';
import { getFxProvider } from '@/lib/fx';

interface CachedRates {
  rates: Record<string, number>;
  fetchedAt: number;
  source: string;
}

export interface FxRatesResponse {
  base: 'NGN';
  rates: Record<string, number>;
  fetchedAt: string | null;
  stale: boolean;
  source: string;
}

// Stale flag is added to the response when rates are older than 24h,
// even if `config.fx.maxAgeMs` (6h TTL for re-fetch) has not expired.
const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

// Module-level in-process cache. Intentionally not Redis — display-only
// data that can tolerate per-instance drift by minutes.
let cache: CachedRates | null = null;

// Single-flight: if a refresh is already in progress, share the same promise
// rather than hammering the FX provider.
let inflight: Promise<CachedRates> | null = null;

function shape(c: CachedRates, stale: boolean): FxRatesResponse {
  return {
    base: 'NGN',
    rates: c.rates,
    fetchedAt: new Date(c.fetchedAt).toISOString(),
    stale: stale || Date.now() - c.fetchedAt > STALE_AFTER_MS,
    source: c.source,
  };
}

async function refresh(): Promise<CachedRates> {
  const provider = getFxProvider();
  const rates = await provider.fetchNgnRates(config.fx.displayCurrencies);
  if (Object.keys(rates).length === 0) {
    throw new Error('FX provider returned no usable rates');
  }
  const next: CachedRates = { rates, fetchedAt: Date.now(), source: provider.name };
  cache = next;
  logger.info('FX rates refreshed', { source: provider.name, count: Object.keys(rates).length });
  return next;
}

/**
 * Returns cached NGN-per-unit rates, refreshing when the TTL (config.fx.maxAgeMs) expires.
 * Never throws — a display feature must not 500.
 */
export async function getRates(): Promise<FxRatesResponse> {
  if (cache && Date.now() - cache.fetchedAt < config.fx.maxAgeMs) {
    return shape(cache, false);
  }

  try {
    if (!inflight) {
      inflight = refresh().finally(() => {
        inflight = null;
      });
    }
    return shape(await inflight, false);
  } catch (err) {
    logger.warn('FX rates refresh failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    // Warm cache: serve stale rather than an empty object.
    if (cache) return shape(cache, true);
    // Cold cache + provider down: empty rates, foreign rows will be disabled.
    return { base: 'NGN', rates: {}, fetchedAt: null, stale: true, source: 'unavailable' };
  }
}

/** Exposed for tests only — resets the module-level cache. */
export function _resetCacheForTests(): void {
  cache = null;
  inflight = null;
}
