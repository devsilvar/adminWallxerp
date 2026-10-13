import { ChevronLeft, ChevronRight } from 'lucide-react';

export interface PaginationState {
  page: number;
  totalPages: number;
  total: number;
  hasPrev: boolean;
  hasNext: boolean;
}

/**
 * The admin list pages all paginate identically. Extracted because four
 * copies of this block had already drifted apart.
 */
export default function Pagination({
  pagination,
  onPageChange,
  noun = 'records',
}: {
  pagination: PaginationState;
  onPageChange: (page: number) => void;
  noun?: string;
}) {
  if (pagination.totalPages <= 1) return null;

  return (
    <div className='flex items-center justify-between border-t border-hairline bg-panel-subtle px-3 py-2'>
      <p className='text-[11px] text-ink-muted'>
        Page <span className='font-medium text-ink'>{pagination.page}</span> of{' '}
        <span className='font-medium text-ink'>{pagination.totalPages}</span> · {pagination.total} {noun}
      </p>
      <div className='flex items-center gap-1.5'>
        <button
          type='button'
          aria-label='Previous page'
          disabled={!pagination.hasPrev}
          onClick={() => onPageChange(Math.max(pagination.page - 1, 1))}
          className='flex h-7 w-7 items-center justify-center rounded border border-hairline-strong bg-panel text-ink-muted transition-colors hover:bg-panel-subtle disabled:cursor-not-allowed disabled:opacity-40'
        >
          <ChevronLeft className='h-3.5 w-3.5' />
        </button>
        <button
          type='button'
          aria-label='Next page'
          disabled={!pagination.hasNext}
          onClick={() => onPageChange(pagination.page + 1)}
          className='flex h-7 w-7 items-center justify-center rounded border border-hairline-strong bg-panel text-ink-muted transition-colors hover:bg-panel-subtle disabled:cursor-not-allowed disabled:opacity-40'
        >
          <ChevronRight className='h-3.5 w-3.5' />
        </button>
      </div>
    </div>
  );
}