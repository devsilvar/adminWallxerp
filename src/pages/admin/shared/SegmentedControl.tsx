import type { LucideIcon } from 'lucide-react';

interface Option<T extends string> {
  value: T;
  label: string;
  /** Overrides the neutral active state — used for the profit/loss outcome chips. */
  activeClassName?: string;
}

export default function SegmentedControl<T extends string>({
  label,
  icon: Icon,
  options,
  value,
  onChange,
}: {
  label: string;
  icon?: LucideIcon;
  options: ReadonlyArray<Option<T>>;
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className='flex flex-wrap items-center gap-1.5'>
      <span className='mr-0.5 flex items-center gap-1 text-[11px] font-semibold text-ink-muted'>
        {Icon && <Icon className='h-3 w-3' />}
        {label}
      </span>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type='button'
            onClick={() => onChange(opt.value)}
            aria-pressed={active}
            className={`h-7 rounded border px-2.5 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 focus-visible:outline-none ${
              active
                ? opt.activeClassName ??
                  'border-hairline-strong bg-ink text-panel'
                : 'border-hairline bg-panel text-ink-muted hover:bg-panel-subtle hover:text-ink'
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}