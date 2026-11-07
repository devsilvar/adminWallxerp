import { useCurrencyStore } from '@/stores/currency.store';
import type { DisplayCurrency } from '@/lib/currency';

/**
 * Subscribes the calling component to the display currency.
 *
 * Formatting itself is a plain function and cannot subscribe, so every component
 * that renders money must call this, even when it ignores the return value.
 * Without it the component keeps its last HTML after a currency switch.
 *
 * A bare `useDisplayCurrency();` with no assignment is a legal hook call and
 * is what most components use when they only need the re-render trigger.
 */
export function useDisplayCurrency(): DisplayCurrency {
  return useCurrencyStore((s) => s.code);
}
