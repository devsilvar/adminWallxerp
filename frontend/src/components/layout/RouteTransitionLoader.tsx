import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { resolvePageTitle } from '@/lib/pageTitles.ts';

export default function RouteTransitionLoader() {
  const location = useLocation();
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    // 40ms flicker guard: prevent flashing on instantaneous cached transitions
    const timer = setTimeout(() => setArmed(true), 40);
    return () => clearTimeout(timer);
  }, [location.pathname]);

  if (!armed) {
    return null;
  }

  const title = resolvePageTitle(location.pathname);
  const targetLabel = title || 'Workspace';

  return (
    <div
      role="status"
      aria-live="polite"
      className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-slate-950/45 backdrop-blur-xs animate-veil-in"
    >
      <div className="relative flex flex-col items-center p-6 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-2xl text-center">
        {/* Rolling Dual-Ring Orbital Spinner */}
        <div className="relative h-12 w-12 mb-3.5">
          {/* Outer high-velocity ring */}
          <div
            className="absolute inset-0 rounded-full border-2 border-primary-500/20 border-t-primary-500 animate-spin"
            style={{ animationDuration: '0.8s' }}
          />
          {/* Inner counter-rotating ring */}
          <div
            className="absolute inset-1.5 rounded-full border-2 border-emerald-400/20 border-b-emerald-400 animate-spin"
            style={{ animationDirection: 'reverse', animationDuration: '1.2s' }}
          />
          {/* Center Brand Monogram */}
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-[10px] font-black tracking-tighter text-white">W</span>
          </div>
        </div>

        {/* Status Typography */}
        <span className="text-xs font-bold text-white tracking-wide">
          Loading {targetLabel}
        </span>
        <span className="text-[10px] font-medium text-slate-400 mt-0.5">
          Preparing secure workspace...
        </span>
      </div>
    </div>
  );
}
