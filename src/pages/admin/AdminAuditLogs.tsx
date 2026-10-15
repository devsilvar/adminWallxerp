import { useEffect, useMemo, useState } from 'react';
import { ScrollText, Search, X, ShieldCheck, AlertCircle, Clock, CheckCircle2 } from 'lucide-react';
import { TableSkeleton } from '@/components/ui/Skeleton.tsx';
import api from '@/lib/axios.ts';
import toast from 'react-hot-toast';
import type { AuditLog, Pagination } from '@/types/index.ts';
import PageHeader from './shared/PageHeader';
import PaginationBar from './shared/Pagination';
import { Panel, PanelEmpty } from './shared/Panel';
import StatusPill, { type Tone } from './shared/StatusPill';
import { formatStamp } from './shared/format';
import { usePaginationTransition } from '@/hooks/usePaginationTransition';

const TONE_BY_PREFIX: Record<string, Tone> = {
  create: 'success',
  delete: 'danger',
};

const toneFor = (action: string): Tone => TONE_BY_PREFIX[action.split('_')[0]] ?? 'neutral';

const ACTION_TAGS = [
  { tag: 'admin.user_', label: 'User Management', tone: 'info' as const },
  { tag: 'admin.business_', label: 'Business Operations', tone: 'info' as const },
  { tag: 'invoice.', label: 'Invoicing', tone: 'success' as const },
  { tag: 'tax.', label: 'Tax & Payments', tone: 'primary' as const },
  { tag: 'sales.', label: 'Sales', tone: 'success' as const },
  { tag: 'expense.', label: 'Expenses', tone: 'warning' as const },
  { tag: 'withdrawal', label: 'Payouts', tone: 'warning' as const },
  { tag: 'payment.', label: 'Payments', tone: 'success' as const },
  { tag: 'subscription', label: 'Subscriptions', tone: 'info' as const },
  { tag: 'admin.broadcast_', label: 'Broadcasts', tone: 'info' as const },
];

function getActionCategory(action: string) {
  for (const { tag, label } of ACTION_TAGS) {
    if (action.startsWith(tag)) return label;
  }
  return 'System';
}

export default function AdminAuditLogs() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [page, setPage] = useState(1);
  const [actionInput, setActionInput] = useState('');
  const [filterAction, setFilterAction] = useState('');
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const { isPageLoading, pendingPage, start, finish } = usePaginationTransition();

  useEffect(() => {
    const timer = setTimeout(() => {
      setFilterAction(actionInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [actionInput]);

  useEffect(() => {
    let cancelled = false;
    if (hasLoadedOnce) start(page);
    const params: Record<string, unknown> = { page, limit: 20 };
    if (filterAction) params.action = filterAction;
    api.get('/admin/audit-logs', { params })
      .then((r) => {
        if (cancelled) return;
        setLogs(r.data.data); setPagination(r.data.pagination);
      })
      .catch((err: any) => {
        if (cancelled) return;
        toast.error(err?.response?.data?.error?.message || 'Failed to load audit logs');
      })
      .finally(() => {
        if (cancelled) return;
        finish();
        setHasLoadedOnce(true);
      });
    return () => { cancelled = true; };
  }, [page, filterAction]);

  const handlePageChange = (next: number) => {
    if (next === page || isPageLoading) return;
    start(next);
    setPage(next);
  };

  const rows = useMemo(
    () =>
      logs.map((l) => ({
        ...l,
        stamp: formatStamp(l.createdAt),
        tone: toneFor(l.action),
        entityLabel: l.entityId ? `${l.entity} #${l.entityId.slice(0, 8)}` : l.entity,
        category: getActionCategory(l.action),
      })),
    [logs]
  );

  const totalEvents = logs.length;
  const createEvents = logs.filter((l) => l.action.startsWith('create')).length;
  const updateEvents = logs.filter((l) => l.action.startsWith('update')).length;
  const deleteEvents = logs.filter((l) => l.action.startsWith('delete')).length;

  return (
    <div className='space-y-6'>
      {/* KPI Summary Cards - matching Subscription pattern */}
      <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4'>
        <Panel className='p-4'>
          <div className='flex items-center justify-between text-ink-muted text-xs'>
            <span className='font-medium'>Total Events</span>
            <ShieldCheck className='h-4 w-4 text-primary-600' />
          </div>
          <div className='mt-2 text-2xl font-bold tabular-nums text-ink'>
            {totalEvents}
          </div>
          <div className='text-xs text-ink-subtle mt-1'>Actions recorded</div>
        </Panel>

        <Panel className='p-4'>
          <div className='flex items-center justify-between text-ink-muted text-xs'>
            <span className='font-medium'>Creations</span>
            <CheckCircle2 className='h-4 w-4 text-emerald-600' />
          </div>
          <div className='mt-2 text-2xl font-bold tabular-nums text-success-600'>
            {createEvents}
          </div>
          <div className='text-xs text-ink-subtle mt-1'>Resources created</div>
        </Panel>

        <Panel className='p-4'>
          <div className='flex items-center justify-between text-ink-muted text-xs'>
            <span className='font-medium'>Updates</span>
            <Clock className='h-4 w-4 text-amber-500' />
          </div>
          <div className='mt-2 text-2xl font-bold tabular-nums text-ink'>
            {updateEvents}
          </div>
          <div className='text-xs text-ink-subtle mt-1'>Records modified</div>
        </Panel>

        <Panel className='p-4'>
          <div className='flex items-center justify-between text-ink-muted text-xs'>
            <span className='font-medium'>Deletions</span>
            <AlertCircle className='h-4 w-4 text-rose-600' />
          </div>
          <div className='mt-2 text-2xl font-bold tabular-nums text-danger-600'>
            {deleteEvents}
          </div>
          <div className='text-xs text-ink-subtle mt-1'>Resources removed</div>
        </Panel>
      </div>

      <PageHeader
        title='Audit & Compliance Trail'
        hint='Immutable record of every administrative and system mutation.'
        actions={
          pagination && (
            <span className='text-[11px] text-ink-muted'>
              {pagination.total} {pagination.total === 1 ? 'event' : 'events'} recorded
            </span>
          )
        }
      />

      {/* Filter Panel - matching Subscriptions filter tabs */}
      <div className='flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-hairline pb-4'>
        <div className='flex items-center gap-2'>
          <button
            onClick={() => setFilterAction('')}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
              filterAction === ''
                ? 'bg-primary-600 text-white'
                : 'text-ink-muted hover:bg-panel-subtle hover:text-ink border border-hairline'
            }`}
          >
            All Actions
          </button>
          <button
            onClick={() => setFilterAction('create')}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
              filterAction === 'create'
                ? 'bg-emerald-600 text-white'
                : 'text-ink-muted hover:bg-panel-subtle hover:text-ink border border-hairline'
            }`}
          >
            Creations
          </button>
          <button
            onClick={() => setFilterAction('delete')}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
              filterAction === 'delete'
                ? 'bg-rose-600 text-white'
                : 'text-ink-muted hover:bg-panel-subtle hover:text-ink border border-hairline'
            }`}
          >
            Deletions
          </button>
        </div>

        <div className='relative w-full sm:w-72'>
          <Search
            className='absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-subtle'
            aria-hidden='true'
          />
          <input
            type='search'
            placeholder='Filter by action...'
            aria-label='Filter audit logs by action'
            value={actionInput}
            onChange={(e) => setActionInput(e.target.value)}
            className='h-8 w-full rounded border border-hairline-strong bg-panel pl-9 pr-3 text-xs text-ink placeholder:text-ink-subtle focus:border-primary-500 focus:ring-1 focus:ring-primary-500/30 focus:outline-none'
          />
          {actionInput && (
            <button
              type='button'
              onClick={() => setActionInput('')}
              aria-label='Clear action filter'
              className='absolute right-3 top-1/2 -translate-y-1/2 text-ink-subtle hover:text-ink'
            >
              <X className='h-3.5 w-3.5' />
            </button>
          )}
        </div>
      </div>

      {!hasLoadedOnce ? (
        <TableSkeleton rows={8} columns={5} />
      ) : rows.length === 0 ? (
        <Panel>
          <PanelEmpty
            icon={ScrollText}
            title='No audit logs found'
            hint={filterAction ? 'No events match that filter.' : 'No events have been recorded yet.'}
          />
        </Panel>
      ) : (
        <Panel className='overflow-hidden'>
          <div className={`overflow-x-auto transition-opacity ${isPageLoading ? 'opacity-60 pointer-events-none' : 'opacity-100'}`} aria-busy={isPageLoading}>
            <table className='w-full min-w-[720px] text-left text-xs'>
              <thead className='border-b border-hairline-strong bg-panel-subtle text-[10px] font-semibold uppercase tracking-wider text-ink-muted'>
                <tr>
                  <th scope='col' className='px-3 py-1.5'>Timestamp</th>
                  <th scope='col' className='px-3 py-1.5'>Category</th>
                  <th scope='col' className='px-3 py-1.5'>Action</th>
                  <th scope='col' className='px-3 py-1.5'>Entity</th>
                  <th scope='col' className='px-3 py-1.5'>User</th>
                  <th scope='col' className='px-3 py-1.5'>IP</th>
                </tr>
              </thead>
              <tbody className='divide-y divide-hairline'>
                {rows.map((l) => (
                  <tr key={l.id} className='transition-colors hover:bg-panel-subtle'>
                    <td className='whitespace-nowrap px-3 py-1.5 font-mono text-ink-muted'>{l.stamp}</td>
                    <td className='px-3 py-1.5 text-ink-muted text-xs'>{l.category}</td>
                    <td className='px-3 py-1.5'>
                      <StatusPill tone={l.tone}>{l.action}</StatusPill>
                    </td>
                    <td className='max-w-[180px] truncate px-3 py-1.5 font-mono text-ink-muted'>
                      {l.entityLabel}
                    </td>
                    <td className='px-3 py-1.5 text-ink'>{l.user?.email || '—'}</td>
                    <td className='px-3 py-1.5 font-mono text-ink-subtle'>{l.ipAddress || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {pagination && <PaginationBar pagination={pagination} onPageChange={handlePageChange} noun='logs' isLoading={isPageLoading} pendingPage={pendingPage} />}
        </Panel>
      )}
    </div>
  );
}