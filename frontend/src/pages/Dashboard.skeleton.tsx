import { Skeleton } from '@/components/ui/Skeleton.tsx';

/**
 * Dashboard skeleton — matches the real layout so first paint is the same
 * shape as the loaded page. Only shown on a true cold load (no cached
 * data in the module). Subsequent visits show stale data instantly while
 * a silent background refetch runs.
 */
export default function DashboardSkeleton() {
  return (
    <div className='space-y-6 animate-fade-in'>
      {/* Greeting / header strip */}
      <div className='flex items-start justify-between gap-4'>
        <div className='space-y-3 flex-1'>
          <Skeleton width={220} height={28} rounded='lg' />
          <Skeleton width={320} height={14} />
        </div>
        <Skeleton width={140} height={36} rounded='xl' />
      </div>

      {/* KPI cards row — 4 across on desktop */}
      <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4'>
        {Array.from({ length: 4 }).map((_, i) => (
          <KpiCardSkeleton key={i} />
        ))}
      </div>

      {/* Trend chart */}
      <div className='rounded-2xl border border-gray-200 bg-white shadow-sm p-6'>
        <div className='flex items-center justify-between mb-6'>
          <div className='space-y-2'>
            <Skeleton width={160} height={18} />
            <Skeleton width={100} height={12} />
          </div>
          <Skeleton width={90} height={28} rounded='full' />
        </div>
        <Skeleton height={240} rounded='lg' />
      </div>

      {/* Two-column lower section: recent activity + reports */}
      <div className='grid grid-cols-1 lg:grid-cols-2 gap-4'>
        <ListCardSkeleton title rows={4} />
        <ListCardSkeleton title rows={3} />
      </div>
    </div>
  );
}

function KpiCardSkeleton() {
  return (
    <div className='rounded-2xl border border-gray-200 bg-white shadow-sm p-5 space-y-4'>
      <div className='flex items-center justify-between'>
        <Skeleton width={80} height={12} />
        <Skeleton width={32} height={32} rounded='lg' />
      </div>
      <Skeleton width='70%' height={28} rounded='lg' />
      <div className='flex items-center gap-2'>
        <Skeleton width={48} height={12} />
        <Skeleton width={68} height={12} />
      </div>
    </div>
  );
}

function ListCardSkeleton({ title, rows }: { title?: boolean; rows: number }) {
  return (
    <div className='rounded-2xl border border-gray-200 bg-white shadow-sm p-6 space-y-4'>
      {title && (
        <div className='flex items-center justify-between'>
          <Skeleton width={140} height={16} />
          <Skeleton width={56} height={12} />
        </div>
      )}
      <div className='space-y-3'>
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className='flex items-center justify-between gap-3'>
            <div className='flex items-center gap-3 flex-1'>
              <Skeleton width={36} height={36} rounded='lg' />
              <div className='flex-1 space-y-2'>
                <Skeleton width='60%' height={12} />
                <Skeleton width='35%' height={10} />
              </div>
            </div>
            <Skeleton width={70} height={14} />
          </div>
        ))}
      </div>
    </div>
  );
}
