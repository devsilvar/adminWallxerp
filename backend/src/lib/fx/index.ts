import { config } from '@/config';
import { erApiProvider } from './er-api.provider';
import type { FxProvider } from './types';

export function getFxProvider(): FxProvider {
  switch (config.fx.provider) {
    case 'er-api':
      return erApiProvider;
    default:
      throw new Error(`Unknown FX provider: ${config.fx.provider}`);
  }
}

export type { FxProvider };
