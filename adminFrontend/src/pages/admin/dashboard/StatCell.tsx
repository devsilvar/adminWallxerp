import { memo } from 'react';
import { Link } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import type { Tone } from '../shared/StatusPill';

const valueTone: Record<Tone, string> = {
  success: 'text-success-700',
  danger: 'text-danger-700',
  warning: 'text-warning-700',
  info: 'text-info-700',
  neutral: 'text-ink',
};

interface StatCellProps {
  label: string;
  value: string;
  sublabel?: string;
  icon?: LucideIcon;
  tone?: Tone;
  /** Present → renders as a link (the tile is a navigation affordance). */
  to?: string;
}

/**
 * One KPI tile. Neutral by default: colour is reserved for state, so a plain
 * metric never gets a tint. Memoised because the overview grid re-renders on
 * every refresh and the values rarely change.
 */
function StatCell({ label, value, sublabel, icon: Icon, tone = 'neutral', to }: StatCellProps) {
  const body = (
    <>
      <div className='flex items-start justify-between gap-2'>
        <span className='text-[11px] font-medium text-ink-muted'>{label}</span>
        {Icon && <Icon className={`h-3.5 w-3.5 shrink-0 ${valueTone[tone]} opacity-70`} aria-hidden='true' />}
      </div>
      <p className={`mt-1 font-mono text-xl font-semibold tabular-nums ${valueTone[tone]}`}>{value}</p>
      {sublabel && <p className='mt-0.5 text-[10px] text-ink-subtle'>{sublabel}</p>}
    </>
  );

  if (to) {
    return (
      <Link
        to={to}
        aria-label={`${label}: ${value}`}
        className='group bg-panel px-3 py-2.5 transition-colors hover:bg-panel-subtle focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-500 focus-visible:outline-none'
      >
        {body}
      </Link>
    );
  }

  return <div className='bg-panel px-3 py-2.5'>{body}</div>;
}

export default memo(StatCell);