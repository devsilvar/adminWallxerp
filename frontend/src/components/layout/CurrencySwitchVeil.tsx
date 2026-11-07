import { useEffect, useState } from 'react';
import { useCurrencyStore } from '@/stores/currency.store';

/**
 * Shown only while the *switch itself* is waiting on the network.
 * It must NOT key off `loading` — that flag is also set by the mount-time
 * prefetch, which would veil the whole app on every cold page load.
 */
export default function CurrencySwitchVeil() {
  const switching = useCurrencyStore((s) => s.switching);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!switching) {
      setVisible(false);
      return;
    }
    const timer = setTimeout(() => setVisible(true), 150);
    return () => clearTimeout(timer);
  }, [switching]);

  if (!visible) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="absolute inset-0 z-40 flex items-center justify-center bg-slate-950/45 backdrop-blur-xs animate-veil-in"
    >
      <div className="flex flex-col items-center rounded-2xl border border-slate-800 bg-slate-900/90 p-6 shadow-2xl">
        <div className="relative mb-3.5 h-12 w-12">
          <div
            className="absolute inset-0 animate-spin rounded-full border-2 border-primary-500/20 border-t-primary-500"
            style={{ animationDuration: '0.8s' }}
          />
          <div
            className="absolute inset-1.5 animate-spin rounded-full border-2 border-emerald-400/20 border-b-emerald-400"
            style={{ animationDirection: 'reverse', animationDuration: '1.2s' }}
          />
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-[10px] font-black tracking-tighter text-white">W</span>
          </div>
        </div>
        <span className="text-xs font-bold tracking-wide text-white">Changing currency…</span>
      </div>
    </div>
  );
}
