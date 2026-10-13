import { useEffect, useMemo, useState } from 'react';
import { ScrollText, Search, X } from 'lucide-react';
import { TableSkeleton } from '@/components/ui/Skeleton.tsx';
import api from '@/lib/axios.ts';
import toast from 'react-hot-toast';
import type { AuditLog, Pagination } from '@/types/index.ts';
import PageHeader from './shared/PageHeader';
import PaginationBar from './shared/Pagination';
import { Panel, PanelEmpty } from './shared/Panel';
import StatusPill, { type Tone } from './shared/StatusPill';
import { formatStamp } from './shared/format';

/**
 * Only two outcomes are worth colour in an audit trail: something was created
 * and something was destroyed. Updates and logins are routine, so they stay
 * neutral rather than borrowing amber for attention they don't warrant.
 */
const TONE_BY_PREFIX: Record<string, Tone> = {
  create: 'success',
  delete: 'danger',
};

const toneFor = (action: string): Tone => TONE_BY_PREFIX[action.split('_')[0]] ?? 'neutral';

export default function AdminAuditLogs() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [page, setPage] = useState(1);
  const [actionInput, setActionInput] = useState('');
  const [filterAction, setFilterAction] = useState('');
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

  // The input used to sit in the fetch effect's deps directly, so every
  // keystroke fired a request. Debounced to match the Invoices list.
  useEffect(() => {
    const timer = setTimeout(() => {
      setFilterAction(actionInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [actionInput]);

  useEffect(() => {
    const params: Record<string, unknown> = { page, limit: 20 };
    if (filterAction) params.action = filterAction;
    api.get('/admin/audit-logs', { params })
      .then((r) => { setLogs(r.data.data); setPagination(r.data.pagination); })
      .catch((err: any) => toast.error(err?.response?.data?.error?.message || 'Failed to load audit logs'))
      .finally(() => setHasLoadedOnce(true));
  }, [page, filterAction]);

  const rows = useMemo(
    () =>
      logs.map((l) => ({
        ...l,
        stamp: formatStamp(l.createdAt),
        tone: toneFor(l.action),
        entityLabel: l.entityId ? `${l.entity} #${l.entityId.slice(0, 8)}` : l.entity,
      })),
    [logs]
  );

  return (
    <div className='space-y-4'>
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

      <Panel className='px-3 py-2'>
        <div className='flex flex-col items-start justify-between gap-2 sm:flex-row sm:items-center'>
          <div className='relative w-full sm:w-72'>
            <Search
              className='absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-subtle'
              aria-hidden='true'
            />
            <input
              type='search'
              placeholder='Filter by action...'
              aria-label='Filter audit logs by action'
              value={actionInput}
              onChange={(e) => setActionInput(e.target.value)}
              className='h-8 w-full rounded border border-hairline-strong bg-panel pl-8 pr-8 font-mono text-xs text-ink placeholder:text-ink-subtle focus:border-primary-500 focus:ring-1 focus:ring-primary-500/30 focus:outline-none'
            />
            {actionInput && (
              <button
                type='button'
                onClick={() => setActionInput('')}
                aria-label='Clear action filter'
                className='absolute right-2 top-1/2 -translate-y-1/2 text-ink-subtle hover:text-ink focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:outline-none'
              >
                <X className='h-3.5 w-3.5' />
              </button>
            )}
          </div>
          {filterAction && (
            <span className='text-[11px] text-ink-muted'>
              Showing action <span className='font-mono text-ink'>{filterAction}</span>
            </span>
          )}
        </div>
      </Panel>

      {!hasLoadedOnce ? (
        <TableSkeleton rows={8} columns={5} />
      ) : rows.length === 0 ? (
        <Panel>
          <PanelEmpty
            icon={ScrollText}
            title='No audit logs found'
            hint={filterAction ? 'No events match that action filter.' : 'No events have been recorded yet.'}
          />
        </Panel>
      ) : (
        <Panel className='overflow-hidden'>
          <div className='overflow-x-auto'>
            <table className='w-full min-w-[720px] text-left text-xs'>
              <thead className='border-b border-hairline-strong bg-panel-subtle text-[10px] font-semibold uppercase tracking-wider text-ink-muted'>
                <tr>
                  <th scope='col' className='px-3 py-1.5'>Timestamp</th>
                  <th scope='col' className='px-3 py-1.5'>User</th>
                  <th scope='col' className='px-3 py-1.5'>Action</th>
                  <th scope='col' className='px-3 py-1.5'>Entity</th>
                  <th scope='col' className='px-3 py-1.5'>IP</th>
                </tr>
              </thead>
              <tbody className='divide-y divide-hairline'>
                {rows.map((l) => (
                  <tr key={l.id} className='transition-colors hover:bg-panel-subtle'>
                    <td className='whitespace-nowrap px-3 py-1.5 font-mono text-ink-muted'>{l.stamp}</td>
                    <td className='px-3 py-1.5 text-ink'>{l.user?.email || '—'}</td>
                    <td className='px-3 py-1.5'>
                      <StatusPill tone={l.tone}>{l.action}</StatusPill>
                    </td>
                    <td className='max-w-[220px] truncate px-3 py-1.5 font-mono text-ink-muted'>
                      {l.entityLabel}
                    </td>
                    <td className='px-3 py-1.5 font-mono text-ink-subtle'>{l.ipAddress || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {pagination && <PaginationBar pagination={pagination} onPageChange={setPage} noun='logs' />}
        </Panel>
      )}
    </div>
  );
}
