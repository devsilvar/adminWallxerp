import type { CSSProperties } from 'react';

/**
 * Skeleton — shimmering placeholder block. Compose into page-shaped
 * skeletons (DashboardSkeleton, ListSkeleton, etc) that mirror the real
 * layout so the page feels instant on first paint.
 *
 * Defaults to a single line of text height. Pass `width` / `height` /
 * `className` for custom shapes. `circle` is a quick accessor for round
 * placeholders (avatars, status dots).
 */
interface SkeletonProps {
  width?: number | string;
  height?: number | string;
  circle?: boolean;
  rounded?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full' | 'none';
  className?: string;
  style?: CSSProperties;
}

const roundedMap: Record<NonNullable<SkeletonProps['rounded']>, string> = {
  none: '',
  sm: 'rounded',
  md: 'rounded-md',
  lg: 'rounded-lg',
  xl: 'rounded-xl',
  '2xl': 'rounded-2xl',
  full: 'rounded-full',
};

export function Skeleton({
  width,
  height,
  circle,
  rounded = 'md',
  className = '',
  style,
}: SkeletonProps) {
  const radiusClass = circle ? roundedMap.full : roundedMap[rounded];

  return (
    <div
      aria-hidden='true'
      className={`animate-pulse bg-gray-200/70 ${radiusClass} ${className}`}
      style={{
        width: width ?? '100%',
        height: height ?? '0.875rem',
        ...style,
      }}
    />
  );
}

/**
 * SkeletonText — multi-line text block. Each line gets a slightly varied
 * width so it looks less mechanical.
 */
export function SkeletonText({
  lines = 3,
  className = '',
}: {
  lines?: number;
  className?: string;
}) {
  const widths = ['100%', '92%', '85%', '78%', '70%'];
  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} width={widths[i % widths.length]} height='0.75rem' />
      ))}
    </div>
  );
}

/**
 * TableSkeleton — generic list/table loader for the standard CRUD pages
 * (Sales, Expenses, Payments, Reminders, Tax Reports, Invoices). Renders
 * a card-like header strip + N rows so the page doesn't visually collapse
 * to "Loading..." text while data is in flight.
 */
export function TableSkeleton({
  rows = 6,
  columns = 4,
  showHeader = true,
  className = '',
}: {
  rows?: number;
  columns?: number;
  showHeader?: boolean;
  className?: string;
}) {
  return (
    <div
      className={`rounded-md border border-gray-200 bg-white shadow-sm overflow-hidden ${className}`}
    >
      {showHeader && (
        <div className='grid gap-4 border-b border-gray-100 bg-gray-50/60 px-4 py-3'
             style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
          {Array.from({ length: columns }).map((_, i) => (
            <Skeleton key={i} width='60%' height={10} />
          ))}
        </div>
      )}
      <div className='divide-y divide-gray-50'>
        {Array.from({ length: rows }).map((_, r) => (
          <div
            key={r}
            className='grid items-center gap-4 px-4 py-4'
            style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
          >
            {Array.from({ length: columns }).map((_, c) => (
              <Skeleton
                key={c}
                width={c === columns - 1 ? '40%' : c === 0 ? '70%' : '85%'}
                height={12}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * CardListSkeleton — vertically stacked card placeholders, used by pages
 * that render rich cards instead of tables (TaxReports, Reminders, mobile
 * card list fallbacks).
 */
export function CardListSkeleton({
  rows = 4,
  className = '',
}: {
  rows?: number;
  className?: string;
}) {
  return (
    <div className={`space-y-3 ${className}`}>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className='rounded-xl border border-gray-200 bg-white shadow-sm p-4 flex items-center gap-4'
        >
          <Skeleton width={40} height={40} rounded='lg' />
          <div className='flex-1 space-y-2'>
            <Skeleton width='55%' height={12} />
            <Skeleton width='35%' height={10} />
          </div>
          <Skeleton width={70} height={14} />
        </div>
      ))}
    </div>
  );
}

export default Skeleton;
