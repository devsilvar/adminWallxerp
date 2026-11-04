import { config } from '@/config';
import type { FxProvider } from './types';

// USD is the base because open.er-api.com gives all rates relative to one base;
// NGN cross-rates are derived from rates.NGN / rates[CODE].
const BASE_URL = 'https://open.er-api.com/v6/latest/USD';

export const erApiProvider: FxProvider = {
  name: 'open.er-api.com',

  async fetchNgnRates(quotes: string[]): Promise<Record<string, number>> {
    // Use `fetch`, not axios: axios is only a devDependency in this package,
    // and every other outbound HTTP call in src/ (paystack.provider.ts,
    // kudisms.client.ts) uses fetch.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.fx.timeoutMs);
    let data: any;
    try {
      const response = await fetch(BASE_URL, { signal: controller.signal });
      if (!response.ok) throw new Error(`FX provider responded ${response.status}`);
      data = await response.json();
    } finally {
      clearTimeout(timer);
    }

    if (data?.result !== 'success' || typeof data?.rates?.NGN !== 'number') {
      throw new Error(`FX provider returned an unusable payload (result=${data?.result})`);
    }

    const ngnPerUnit: Record<string, number> = {};
    for (const raw of quotes) {
      const code = raw.toUpperCase();
      if (code === 'NGN') continue;

      const perUsd = data.rates[code]; // units of `code` per 1 USD
      if (typeof perUsd !== 'number' || !Number.isFinite(perUsd) || perUsd <= 0) continue;

      const rate = data.rates.NGN / perUsd; // NGN per 1 unit of `code`
      if (Number.isFinite(rate) && rate > 0) ngnPerUnit[code] = rate;
    }

    return ngnPerUnit;
  },
};
