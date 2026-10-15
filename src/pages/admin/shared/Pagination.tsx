import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';

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
  isLoading = false,
  pendingPage = null,
}: {
  pagination: PaginationState;
  onPageChange: (page: number) => void;
  noun?: string;
  isLoading?: boolean;
  pendingPage?: number | null;
}) {
  if (pagination.totalPages <= 1) return null;

  const prevTarget = Math.max(pagination.page - 1, 1);
  const nextTarget = pagination.page + 1;
  const isPrevPending = isLoading && pendingPage === prevTarget;
  const isNextPending = isLoading && pendingPage === nextTarget;
  const isAnyPending = isLoading && pendingPage != null;

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
          aria-busy={isPrevPending}
          disabled={!pagination.hasPrev || isAnyPending}
          onClick={() => onPageChange(prevTarget)}
          className='flex h-7 w-7 items-center justify-center rounded border border-hairline-strong bg-panel text-ink-muted transition-colors hover:bg-panel-subtle disabled:cursor-not-allowed disabled:opacity-40'
        >
          {isPrevPending ? <Loader2 className='h-3.5 w-3.5 animate-spin text-primary-600' /> : <ChevronLeft className='h-3.5 w-3.5' />}
        </button>
        <button
          type='button'
          aria-label='Next page'
          aria-busy={isNextPending}
          disabled={!pagination.hasNext || isAnyPending}
          onClick={() => onPageChange(nextTarget)}
          className='flex h-7 w-7 items-center justify-center rounded border border-hairline-strong bg-panel text-ink-muted transition-colors hover:bg-panel-subtle disabled:cursor-not-allowed disabled:opacity-40'
        >
          {isNextPending ? <Loader2 className='h-3.5 w-3.5 animate-spin text-primary-600' /> : <ChevronRight className='h-3.5 w-3.5' />}
        </button>
      </div>
    </div>
  );
}