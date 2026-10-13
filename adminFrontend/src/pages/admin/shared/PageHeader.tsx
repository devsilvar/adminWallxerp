import type { ReactNode } from 'react';

export default function PageHeader({
  title,
  hint,
  actions,
}: {
  title: string;
  hint?: string;
  actions?: ReactNode;
}) {
  return (
    <div className='flex flex-col items-start justify-between gap-2 sm:flex-row sm:items-center'>
      <div className='min-w-0'>
        <h1 className='text-lg font-semibold text-ink'>{title}</h1>
        {hint && <p className='mt-0.5 text-[11px] text-ink-muted'>{hint}</p>}
      </div>
      {actions && <div className='flex shrink-0 items-center gap-2'>{actions}</div>}
    </div>
  );
}