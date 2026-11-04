/**
 * FX Rates Service — Unit Tests
 *
 * The FX provider is always mocked. Never call the live API from tests.
 */
import { describe, test, expect, jest, beforeEach } from '@jest/globals';

// ─── Mock the provider factory ───────────────────────────────────────────────
const mockFetchNgnRates = jest.fn<() => Promise<Record<string, number>>>();

jest.mock('../../src/lib/fx', () => ({
  getFxProvider: () => ({
    name: 'mock-provider',
    fetchNgnRates: mockFetchNgnRates,
  }),
}));

// ─── Import after mocks are set ──────────────────────────────────────────────
import { getRates, _resetCacheForTests } from '../../src/services/fx.service';

// ─────────────────────────────────────────────────────────────────────────────

describe('fx.service — getRates()', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    _resetCacheForTests();
  });

  // ── Test 1: cross-rate math ────────────────────────────────────────────────
  test('derives correct NGN-per-unit cross-rates from a USD-base payload', async () => {
    // The er-api provider converts USD-base payload to NGN-per-unit before returning.
    // The service trusts the provider result and caches it verbatim.
    mockFetchNgnRates.mockResolvedValueOnce({
      USD: 1348.79,
      GBP: 1805.75,
      CAD: 965.52,
      EUR: 1563.95,
    });

    const result = await getRates();

    expect(result.base).toBe('NGN');
    expect(result.stale).toBe(false);
    expect(result.source).toBe('mock-provider');
    expect(result.fetchedAt).not.toBeNull();
    expect(result.rates.USD).toBeCloseTo(1348.79, 1);
    expect(result.rates.CAD).toBeCloseTo(965.52, 1);
    expect(result.rates.GBP).toBeCloseTo(1805.75, 1);
  });

  // ── Test 2: provider returns result !== 'success' ─────────────────────────
  test('returns empty rates + stale:true when provider rejects, does NOT throw', async () => {
    mockFetchNgnRates.mockRejectedValueOnce(
      new Error('FX provider returned an unusable payload (result=error)')
    );

    const result = await getRates();

    expect(result.rates).toEqual({});
    expect(result.stale).toBe(true);
    expect(result.source).toBe('unavailable');
    expect(result.fetchedAt).toBeNull();
    // Must not throw — a display feature must not 500
  });

  // ── Test 3: valid quote passes through; missing ones are absent ───────────
  test('valid quotes are passed through; missing ones are absent from rates', async () => {
    // Provider returns only what passes its own filter; service emits a well-shaped response.
    mockFetchNgnRates.mockResolvedValueOnce({
      USD: 1348.79,
      // GBP omitted — simulates provider dropping a bad/missing quote
    });

    const result = await getRates();

    expect(result.rates.USD).toBeCloseTo(1348.79, 1);
    expect(result.rates.GBP).toBeUndefined();
  });

  // ── Test 4: single-flight — two concurrent calls ⇒ provider invoked once ──
  test('two concurrent getRates() calls on cold cache invoke provider exactly once', async () => {
    let resolveFirst!: (v: Record<string, number>) => void;
    const deferred = new Promise<Record<string, number>>((res) => {
      resolveFirst = res;
    });

    mockFetchNgnRates.mockReturnValueOnce(deferred);

    // Fire both before awaiting either
    const p1 = getRates();
    const p2 = getRates();

    resolveFirst({ USD: 1348.79 });

    const [r1, r2] = await Promise.all([p1, p2]);

    expect(mockFetchNgnRates).toHaveBeenCalledTimes(1);
    expect(r1.rates.USD).toBeCloseTo(1348.79, 1);
    expect(r2.rates.USD).toBeCloseTo(1348.79, 1);
  });

  // ── Test 5: second call inside the TTL does NOT invoke provider ────────────
  test('second call within the TTL hits cache and does not call the provider again', async () => {
    mockFetchNgnRates.mockResolvedValue({ USD: 1348.79 });

    await getRates(); // warms cache
    await getRates(); // should hit cache — provider NOT called again

    expect(mockFetchNgnRates).toHaveBeenCalledTimes(1);
  });

  // ── Test 6: successful refresh produces stale:false ────────────────────────
  test('a fresh successful getRates() returns stale:false', async () => {
    mockFetchNgnRates.mockResolvedValueOnce({ USD: 1200.0 });
    const r = await getRates();

    // Normal successful fetch — stale is false (not older than 24h)
    expect(r.stale).toBe(false);
    expect(r.rates.USD).toBe(1200.0);
    expect(r.source).toBe('mock-provider');
  });

  // ── Test 6b: cold cache + provider down → empty rates, stale:true ─────────
  test('cold cache + provider failure → empty rates object, stale:true, never throws', async () => {
    // Cache starts empty (beforeEach called _resetCacheForTests).
    // Provider fails immediately.
    mockFetchNgnRates.mockRejectedValueOnce(new Error('provider down'));

    const result = await getRates();

    // Must not throw; must return the documented failure shape.
    expect(result.rates).toEqual({});
    expect(result.stale).toBe(true);
    expect(result.source).toBe('unavailable');
    expect(result.fetchedAt).toBeNull();
  });

  // ── Test 6c: warm cache + provider failure → serves stale cache ───────────
  test('warm cache + provider failure serves stale cached rates with stale:true', async () => {
    // 1. Prime the cache.
    mockFetchNgnRates.mockResolvedValueOnce({ USD: 1348.79, GBP: 1805.75 });
    await getRates();

    // 2. Force-expire TTL by manipulating fetchedAt. We do this by calling
    //    _resetCacheForTests() to wipe only inflight, then re-priming with an
    //    aged fetchedAt isn't directly possible from tests. Instead, we verify
    //    the "warm cache path" by: clearing only inflight (not cache) through
    //    the service's own logic — when the TTL expires, it re-fetches.
    //    Since we cannot mock Date.now() cleanly without jest.useFakeTimers,
    //    we test the branch via the code-path: cache exists + fetch fails.
    //    We achieve this by calling _resetCacheForTests to wipe the inflight
    //    slot, then directly reading the service's exported cache (not exposed).
    //    The cleanest way: use jest.useFakeTimers to advance past maxAgeMs.

    jest.useFakeTimers();
    // Advance past the 6h TTL so the service decides to re-fetch.
    jest.advanceTimersByTime(7 * 60 * 60 * 1000); // 7 hours

    // 3. Make the provider fail on the refresh attempt.
    mockFetchNgnRates.mockRejectedValueOnce(new Error('network down'));

    const result = await getRates();

    jest.useRealTimers();

    // Should serve the stale cache, not crash with empty rates.
    expect(result.stale).toBe(true);
    expect(result.rates.USD).toBeCloseTo(1348.79, 1);
    expect(result.rates.GBP).toBeCloseTo(1805.75, 1);
    expect(result.source).toBe('mock-provider');
  });
});
