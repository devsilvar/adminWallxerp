import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, Check, ChevronsUpDown, Loader2, Building2 } from 'lucide-react';
import type { Bank } from '@/types';

interface BankSelectProps {
  banks: Bank[] | null;
  loading?: boolean;
  error?: string;
  value: string; // selected bank code
  onChange: (code: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

/**
 * Searchable bank picker (combobox). Native <select> is unusable once the
 * Nigerian bank list runs to several hundred entries (microfinance banks),
 * so we render a type-ahead filtered list — the pattern Paystack/Stripe use.
 *
 * Closes on outside-click + Escape; focus moves to the search box on open.
 * Purely presentational — the parent owns the bank list + selected value.
 */
export default function BankSelect({
  banks,
  loading = false,
  error = '',
  value,
  onChange,
  disabled = false,
  placeholder = 'Select your bank',
}: BankSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const selected = useMemo(
    () => banks?.find((b) => b.code === value) ?? null,
    [banks, value],
  );

  const filtered = useMemo(() => {
    if (!banks) return [];
    const q = query.trim().toLowerCase();
    if (!q) return banks;
    // Match by name OR bank code — needed so users can find a specific NIBSS
    // code (e.g. Paystack's test-mode fixture uses code "007") when they
    // don't know/trust the bank's display name for that code.
    return banks.filter(
      (b) => b.name.toLowerCase().includes(q) || b.code.includes(q),
    );
  }, [banks, query]);

  // Outside-click + Escape to close.
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Focus the search box when the panel opens (no state writes here — query
  // is reset in the open handler to avoid a cascading render).
  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => searchRef.current?.focus());
    }
  }, [open]);

  const isDisabled = disabled || loading || !!error;

  const toggleOpen = () => {
    setOpen((o) => {
      if (!o) setQuery('');
      return !o;
    });
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        disabled={isDisabled}
        onClick={toggleOpen}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-left text-[14px] text-gray-900 transition-colors hover:border-gray-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-400"
      >
        <span className="flex min-w-0 items-center gap-2">
          {selected ? (
            <>
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-primary-50 text-[10px] font-bold text-primary-600">
                {selected.name.charAt(0)}
              </span>
              <span className="truncate">{selected.name}</span>
              <span className="shrink-0 text-xs text-gray-400">· {selected.code}</span>
            </>
          ) : (
            <span className="truncate text-gray-400">
              {loading ? 'Loading banks…' : error ? 'Failed to load banks' : placeholder}
            </span>
          )}
        </span>
        {loading ? (
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-gray-400" />
        ) : (
          <ChevronsUpDown className="h-4 w-4 shrink-0 text-gray-400" />
        )}
      </button>

      {open && !isDisabled && (
        <div className="absolute z-30 mt-1.5 w-full overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl shadow-gray-900/10 animate-in">
          <div className="flex items-center gap-2 border-b border-gray-100 px-3 py-2.5">
            <Search className="h-4 w-4 shrink-0 text-gray-400" />
            <input
              ref={searchRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by bank name or code…"
              className="w-full border-0 bg-transparent p-0 text-[14px] text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-0"
            />
          </div>

          <div className="max-h-64 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center gap-1.5 px-4 py-8 text-center">
                <Building2 className="h-5 w-5 text-gray-300" />
                <p className="text-[12px] text-gray-400">No banks match "{query}"</p>
              </div>
            ) : (
              filtered.map((b) => {
                const isActive = b.code === value;
                return (
                  <button
                    key={b.id}
                    type="button"
                    role="option"
                    aria-selected={isActive}
                    onClick={() => {
                      onChange(b.code);
                      setOpen(false);
                    }}
                    className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-[13.5px] transition-colors ${
                      isActive ? 'bg-primary-50 text-primary-700' : 'text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <span className="flex min-w-0 items-center gap-2.5">
                      <span
                        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded text-[11px] font-bold ${
                          isActive ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-500'
                        }`}
                      >
                        {b.name.charAt(0)}
                      </span>
                      <span className="truncate">{b.name}</span>
                      <span className="shrink-0 text-[11px] text-gray-400">{b.code}</span>
                    </span>
                    {isActive && <Check className="h-4 w-4 shrink-0 text-primary-600" />}
                  </button>
                );
              })
            )}
          </div>

          {banks && (
            <div className="border-t border-gray-100 px-3 py-1.5">
              <p className="text-[11px] text-gray-400">
                {filtered.length} of {banks.length} banks
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
