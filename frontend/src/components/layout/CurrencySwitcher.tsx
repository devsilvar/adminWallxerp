import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import {
  CURRENCY_META,
  DISPLAY_CURRENCIES,
  type DisplayCurrency,
} from '@/lib/currency';
import { formatNgn, formatDate } from '@/lib/format';
import { useCurrencyStore } from '@/stores/currency.store';

export default function CurrencySwitcher() {
  const code = useCurrencyStore((s) => s.code);
  const rates = useCurrencyStore((s) => s.rates);
  const stale = useCurrencyStore((s) => s.stale);
  const fetchedAt = useCurrencyStore((s) => s.fetchedAt);
  const setCurrency = useCurrencyStore((s) => s.setCurrency);

  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (panelRef.current?.contains(target)) return;
      if (buttonRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const active = CURRENCY_META[code];
  const hasAnyRate = DISPLAY_CURRENCIES.some((c) => c !== 'NGN' && (rates[c] ?? 0) > 0);

  const choose = (next: DisplayCurrency) => {
    setOpen(false);
    void setCurrency(next);
  };

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Change display currency"
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex h-9 items-center gap-1 rounded-full border border-gray-200 bg-white px-2.5 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 sm:px-3 sm:text-sm"
      >
        <span className="text-base leading-none">{active.symbol}</span>
        <span className="hidden sm:inline">{code}</span>
        <ChevronDown className="h-3.5 w-3.5 text-gray-400" strokeWidth={2.5} />
      </button>

      {open && (
        <div
          ref={panelRef}
          role="menu"
          aria-label="Display currency"
          className="absolute right-0 z-50 mt-2 w-72 overflow-hidden rounded-xl border border-gray-100 bg-white shadow-xl shadow-gray-200/60"
        >
          <div className="px-4 pb-2 pt-3">
            <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400">
              Display currency
            </p>
          </div>

          <ul className="pb-1">
            {DISPLAY_CURRENCIES.map((c) => {
              const meta = CURRENCY_META[c];
              const isActive = c === code;
              const rate = rates[c] ?? 0;
              const disabled = c !== 'NGN' && rate <= 0;

              return (
                <li key={c}>
                  <button
                    type="button"
                    role="menuitemradio"
                    aria-checked={isActive}
                    disabled={disabled}
                    onClick={() => choose(c)}
                    className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors ${
                      isActive ? 'bg-primary-50/70' : 'hover:bg-gray-50'
                    } ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}
                  >
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gray-50 text-xs font-bold text-gray-600 ring-1 ring-inset ring-gray-100">
                      {meta.symbol}
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-gray-900">{meta.name}</span>
                      <span className="mt-0.5 block text-[11px] text-gray-400">
                        {c === 'NGN'
                          ? 'Base currency'
                          : rate > 0
                            ? `1 ${c} ≈ ${formatNgn(rate)}`
                            : 'Rate unavailable'}
                      </span>
                    </span>

                    <span className="shrink-0 text-[11px] font-semibold text-gray-400">{c}</span>
                    {isActive && <Check className="h-4 w-4 shrink-0 text-primary-600" strokeWidth={3} />}
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="border-t border-gray-100 bg-gray-50/80 px-4 py-2.5">
            {stale && (
              <p className="mb-1.5 rounded-lg bg-amber-50 px-2.5 py-1.5 text-[11px] font-medium text-amber-700">
                Rates may be outdated.
              </p>
            )}
            <p className="text-[11px] leading-relaxed text-gray-500">
              {!hasAnyRate
                ? 'Rates unavailable — showing Naira.'
                : fetchedAt
                  ? `Rates updated ${formatDate(new Date(fetchedAt))}`
                  : 'Rates not loaded yet'}
            </p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-gray-400">
              Display only — transactions and tax filings stay in Naira (₦).
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
