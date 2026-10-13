import { useRef } from 'react';
import { Building2, Scale, ShieldCheck, Sliders } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export const ADMIN_TABS = [
  { id: 'overview', label: 'Overview', icon: Building2 },
  { id: 'treasury', label: 'Treasury & P&L', icon: Scale },
  { id: 'fee-settings', label: 'Fee & Sweep', icon: Sliders },
  { id: 'tax-compliance', label: 'Tax Compliance', icon: ShieldCheck },
] as const satisfies ReadonlyArray<{ id: string; label: string; icon: LucideIcon }>;

export function tabPanelId(id: string) {
  return `admin-tabpanel-${id}`;
}

export function tabButtonId(id: string) {
  return `admin-tab-${id}`;
}

/**
 * Underline tabs with roving focus. Arrow keys move between tabs and wrap;
 * Home/End jump to the ends. Tab itself does not cycle through them — the
 * tablist is a single tab stop, per the ARIA authoring practices.
 */
export default function AdminTabBar({
  activeTab,
  onChange,
}: {
  activeTab: string;
  onChange: (tab: string) => void;
}) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  function moveFocus(from: string, delta: number) {
    const idx = ADMIN_TABS.findIndex((t) => t.id === from);
    const next = ADMIN_TABS[(idx + delta + ADMIN_TABS.length) % ADMIN_TABS.length];
    refs.current[next.id]?.focus();
    onChange(next.id);
  }

  return (
    <div
      role='tablist'
      aria-label='Admin dashboard sections'
      className='flex items-center gap-0.5 overflow-x-auto border-b border-hairline'
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight') {
          e.preventDefault();
          moveFocus(activeTab, 1);
        } else if (e.key === 'ArrowLeft') {
          e.preventDefault();
          moveFocus(activeTab, -1);
        } else if (e.key === 'Home') {
          e.preventDefault();
          refs.current[ADMIN_TABS[0].id]?.focus();
          onChange(ADMIN_TABS[0].id);
        } else if (e.key === 'End') {
          e.preventDefault();
          const last = ADMIN_TABS[ADMIN_TABS.length - 1].id;
          refs.current[last]?.focus();
          onChange(last);
        }
      }}
    >
      {ADMIN_TABS.map(({ id, label, icon: Icon }) => {
        const active = id === activeTab;
        return (
          <button
            key={id}
            ref={(el) => {
              refs.current[id] = el;
            }}
            role='tab'
            id={tabButtonId(id)}
            aria-selected={active}
            aria-controls={tabPanelId(id)}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(id)}
            className={`flex shrink-0 items-center gap-1.5 border-b-2 px-2.5 py-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-500 ${
              active
                ? 'border-primary-600 text-ink'
                : 'border-transparent text-ink-muted hover:border-hairline-strong hover:text-ink'
            }`}
          >
            <Icon className='h-3.5 w-3.5' />
            {label}
          </button>
        );
      })}
    </div>
  );
}