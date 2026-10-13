import type { ComponentType, ReactNode } from 'react';

/**
 * Admin console surfaces. The app-wide `Card` is untouched — it carries
 * `shadow-sm` + `rounded-xl`, which is the wrong shape for a dense console.
 */
export function Panel({
  className = '',
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={`rounded-panel border border-hairline bg-panel ${className}`}>
      {children}
    </section>
  );
}

export function PanelHeader({
  title,
  hint,
  actions,
}: {
  title: string;
  hint?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="flex items-center justify-between gap-3 border-b border-hairline px-3 py-2">
      <div className="min-w-0">
        <h2 className="text-[13px] font-semibold text-ink">{title}</h2>
        {hint && <p className="mt-0.5 text-[11px] text-ink-muted">{hint}</p>}
      </div>
      {actions}
    </header>
  );
}

/**
 * Tiles separated by a 1px background rather than borders — 1px hairlines
 * read as a single grid instead of N stacked cards. `overflow-hidden` +
 * `rounded-panel` on the same element keeps the radius from leaking through
 * the gaps.
 */
export function HairlineGrid({
  columns = 2,
  className = '',
  children,
}: {
  columns?: 2 | 3 | 4;
  className?: string;
  children: ReactNode;
}) {
  const cols =
    columns === 4
      ? 'grid-cols-2 lg:grid-cols-4'
      : columns === 3
        ? 'grid-cols-1 sm:grid-cols-3'
        : 'grid-cols-1 sm:grid-cols-2';
  return (
    <div className={`grid gap-px overflow-hidden rounded-panel border border-hairline bg-hairline ${cols} ${className}`}>
      {children}
    </div>
  );
}

export function HairlineCell({
  className = '',
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return <div className={`bg-panel px-3 py-2.5 ${className}`}>{children}</div>;
}

/** The "fetch succeeded, zero rows" state, rendered inside a Panel. */
export function PanelEmpty({
  icon: Icon,
  title,
  hint,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  hint?: string;
}) {
  return (
    <div className='px-3 py-14 text-center'>
      <Icon className='mx-auto mb-2 h-8 w-8 text-hairline-strong' />
      <p className='text-xs font-semibold text-ink'>{title}</p>
      {hint && <p className='mt-1 text-[11px] text-ink-subtle'>{hint}</p>}
    </div>
  );
}