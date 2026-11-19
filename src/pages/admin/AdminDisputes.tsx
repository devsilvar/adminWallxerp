import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, LifeBuoy, Search, X } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/lib/axios.ts';
import { TableSkeleton } from '@/components/ui/Skeleton.tsx';
import PageHeader from './shared/PageHeader';
import PaginationBar from './shared/Pagination';
import { Panel, PanelEmpty } from './shared/Panel';
import StatusPill from './shared/StatusPill';
import { formatStamp } from './shared/format';
import type { Pagination } from '@/types/index.ts';
import { usePaginationTransition } from '@/hooks/usePaginationTransition';

type DisputeStatus = 'open' | 'in_review' | 'closed';
type DisputeCategory =
  | 'sales_transactions'
  | 'invoices'
  | 'expenses'
  | 'virtual_account'
  | 'settlements_withdrawals'
  | 'account_profile'
  | 'team_access'
  | 'other';

interface DisputeRow {
  id: string;
  businessId: string;
  userId: string;
  status: DisputeStatus;
  category: DisputeCategory;
  title: string;
  description: string;
  responseNote: string | null;
  respondedAt: string | null;
  respondedBy: string | null;
  createdAt: string;
  updatedAt: string;
  business?: { id: string; businessName: string } | null;
  reporter?: { id: string; email: string; fullName: string | null } | null;
}

const STATUS_OPTIONS: Array<{ value: '' | DisputeStatus; label: string }> = [
  { value: '', label: 'All statuses' },
  { value: 'open', label: 'Open' },
  { value: 'in_review', label: 'Attending to' },
  { value: 'closed', label: 'Responded' },
];

const CATEGORY_OPTIONS: Array<{ value: '' | DisputeCategory; label: string }> = [
  { value: '', label: 'All categories' },
  { value: 'sales_transactions', label: 'Sales & Transactions' },
  { value: 'invoices', label: 'Invoices' },
  { value: 'expenses', label: 'Expenses' },
  { value: 'virtual_account', label: 'Virtual Account / Incoming Payments' },
  { value: 'settlements_withdrawals', label: 'Settlements & Withdrawals' },
  { value: 'account_profile', label: 'Account & Profile' },
  { value: 'team_access', label: 'Team & Access' },
  { value: 'other', label: 'Other' },
];

const CATEGORY_LABEL = Object.fromEntries(CATEGORY_OPTIONS.filter((o) => o.value).map((o) => [o.value, o.label])) as Record<
  DisputeCategory,
  string
>;

function statusTone(status: DisputeStatus) {
  if (status === 'open') return 'warning' as const;
  if (status === 'in_review') return 'info' as const;
  return 'success' as const;
}

function statusLabel(status: DisputeStatus) {
  if (status === 'open') return 'Open';
  if (status === 'in_review') return 'Attending to';
  return 'Responded';
}

export default function AdminDisputes() {
  const [rows, setRows] = useState<DisputeRow[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<'' | DisputeStatus>('');
  const [category, setCategory] = useState<'' | DisputeCategory>('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const { isPageLoading, pendingPage, start, finish } = usePaginationTransition();

  const [selected, setSelected] = useState<DisputeRow | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<'in_review' | 'closed' | null>(null);
  const [note, setNote] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const fetchList = async (opts?: { silent?: boolean }) => {
    if (!opts?.silent && hasLoadedOnce) start(page);
    try {
      const params: Record<string, unknown> = { page, limit: 20 };
      if (status) params.status = status;
      if (category) params.category = category;
      if (search) params.search = search;
      const res = await api.get('/admin/disputes', { params });
      setRows(res.data.data ?? []);
      setPagination(res.data.pagination ?? null);
    } catch (err: any) {
      toast.error(err?.response?.data?.error?.message || 'Failed to load disputes');
    } finally {
      finish();
      setHasLoadedOnce(true);
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (hasLoadedOnce) start(page);
      try {
        const params: Record<string, unknown> = { page, limit: 20 };
        if (status) params.status = status;
        if (category) params.category = category;
        if (search) params.search = search;
        const res = await api.get('/admin/disputes', { params });
        if (cancelled) return;
        setRows(res.data.data ?? []);
        setPagination(res.data.pagination ?? null);
      } catch (err: any) {
        if (cancelled) return;
        toast.error(err?.response?.data?.error?.message || 'Failed to load disputes');
      } finally {
        if (cancelled) return;
        finish();
        setHasLoadedOnce(true);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, status, category, search]);

  const openDetail = async (row: DisputeRow) => {
    setSelected(row);
    setNote('');
    setActionError(null);
    setDetailLoading(true);
    try {
      const res = await api.get(`/admin/disputes/${row.id}`);
      setSelected(res.data.data ?? row);
    } catch (err: any) {
      toast.error(err?.response?.data?.error?.message || 'Failed to load dispute details');
    } finally {
      setDetailLoading(false);
    }
  };

  const closeDetail = () => {
    setSelected(null);
    setNote('');
    setActionError(null);
    setActionLoading(null);
  };

  const doUpdateStatus = async (nextStatus: 'in_review' | 'closed') => {
    if (!selected) return;
    setActionError(null);

    if (nextStatus === 'closed' && !note.trim()) {
      setActionError('A response note is required to respond and close this dispute.');
      return;
    }

    setActionLoading(nextStatus);
    try {
      const payload: { status: 'in_review' | 'closed'; responseNote?: string } = { status: nextStatus };
      if (note.trim()) payload.responseNote = note.trim();
      const res = await api.patch(`/admin/disputes/${selected.id}/status`, payload);
      const updated = res.data.data as DisputeRow;
      toast.success(res.data.message || 'Dispute updated');
      setSelected((prev) => (prev ? { ...prev, ...updated } : updated));
      setNote('');
      await fetchList({ silent: true });
    } catch (err: any) {
      const msg = err?.response?.data?.error?.message || 'Failed to update dispute';
      setActionError(msg);
      toast.error(msg);
    } finally {
      setActionLoading(null);
    }
  };

  const stats = useMemo(() => {
    const open = rows.filter((r) => r.status === 'open').length;
    const attending = rows.filter((r) => r.status === 'in_review').length;
    const closed = rows.filter((r) => r.status === 'closed').length;
    return { open, attending, closed };
  }, [rows]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Disputes"
        hint="Review and respond to support disputes raised by businesses."
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Panel className="px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-subtle">Open (page)</p>
          <p className="mt-1 text-xl font-semibold text-ink">{stats.open}</p>
        </Panel>
        <Panel className="px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-subtle">Attending (page)</p>
          <p className="mt-1 text-xl font-semibold text-ink">{stats.attending}</p>
        </Panel>
        <Panel className="px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-subtle">Responded (page)</p>
          <p className="mt-1 text-xl font-semibold text-ink">{stats.closed}</p>
        </Panel>
      </div>

      <Panel className="p-3 sm:p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative w-full sm:max-w-sm">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle" />
              <input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search title, business, reporter..."
                className="w-full rounded-md border border-hairline bg-panel py-2 pl-9 pr-3 text-sm text-ink placeholder:text-ink-subtle focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              />
            </div>
            <select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value as '' | DisputeStatus);
                setPage(1);
              }}
              className="w-full rounded-md border border-hairline bg-panel px-3 py-2 text-sm text-ink focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 sm:w-44"
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value || 'all'} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <select
              value={category}
              onChange={(e) => {
                setCategory(e.target.value as '' | DisputeCategory);
                setPage(1);
              }}
              className="w-full rounded-md border border-hairline bg-panel px-3 py-2 text-sm text-ink focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 sm:w-64"
            >
              {CATEGORY_OPTIONS.map((o) => (
                <option key={o.value || 'all'} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={() => fetchList({ silent: true })}
            className="inline-flex items-center justify-center rounded-md border border-hairline bg-panel px-3 py-2 text-sm font-medium text-ink hover:bg-panel-subtle"
          >
            Refresh
          </button>
        </div>
      </Panel>

      <Panel>
        {!hasLoadedOnce && isPageLoading ? (
          <TableSkeleton rows={8} columns={6} />
        ) : rows.length === 0 ? (
          <PanelEmpty
            icon={LifeBuoy}
            title="No disputes found"
            hint="No disputes match the current filters."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-hairline text-sm">
              <thead className="bg-panel-subtle/60">
                <tr>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-ink-subtle">Created</th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-ink-subtle">Status</th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-ink-subtle">Category</th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-ink-subtle">Title</th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-ink-subtle">Business</th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-ink-subtle">Reporter</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline bg-panel">
                {rows.map((r) => (
                  <tr
                    key={r.id}
                    className="cursor-pointer hover:bg-panel-subtle/40"
                    onClick={() => openDetail(r)}
                  >
                    <td className="whitespace-nowrap px-4 py-3 text-ink-muted">{formatStamp(r.createdAt)}</td>
                    <td className="px-4 py-3">
                      <StatusPill tone={statusTone(r.status)}>{statusLabel(r.status)}</StatusPill>
                    </td>
                    <td className="px-4 py-3 text-ink-muted">{CATEGORY_LABEL[r.category] ?? r.category}</td>
                    <td className="max-w-[320px] px-4 py-3">
                      <div className="truncate font-medium text-ink">{r.title}</div>
                      <div className="mt-0.5 truncate text-xs text-ink-subtle">{r.description}</div>
                    </td>
                    <td className="px-4 py-3 text-ink-muted">{r.business?.businessName ?? r.businessId}</td>
                    <td className="px-4 py-3 text-ink-muted">
                      {r.reporter?.fullName || r.reporter?.email || r.userId}
                      {r.reporter?.fullName && r.reporter?.email ? (
                        <div className="text-xs text-ink-subtle">{r.reporter.email}</div>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {pagination ? (
          <div className="border-t border-hairline px-4 py-3">
            <PaginationBar
              pagination={{
                page,
                totalPages: pagination.totalPages,
                total: pagination.total,
                hasPrev: page > 1,
                hasNext: page < pagination.totalPages,
              }}
              noun="disputes"
              isLoading={isPageLoading}
              pendingPage={pendingPage}
              onPageChange={setPage}
            />
          </div>
        ) : null}
      </Panel>

      {selected ? (
        <div
          className="fixed inset-0 z-[9999] flex h-screen w-screen items-center justify-center overflow-hidden bg-slate-950/60 p-3 backdrop-blur-xs sm:p-4"
          onClick={closeDetail}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="relative z-10 flex max-h-[92vh] w-full max-w-3xl flex-col border border-hairline bg-panel shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-hairline bg-panel-subtle/40 px-5 py-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusPill tone={statusTone(selected.status)}>{statusLabel(selected.status)}</StatusPill>
                  <span className="inline-flex rounded-full bg-panel-subtle px-2.5 py-0.5 text-xs font-medium text-ink-muted">
                    {CATEGORY_LABEL[selected.category] ?? selected.category}
                  </span>
                </div>
                <h2 className="mt-2 text-lg font-semibold text-ink">{selected.title}</h2>
                <p className="mt-1 text-xs text-ink-subtle">
                  Created {formatStamp(selected.createdAt)} · Business: {selected.business?.businessName ?? selected.businessId} · Reporter:{' '}
                  {selected.reporter?.fullName || selected.reporter?.email || selected.userId}
                </p>
              </div>
              <button
                type="button"
                onClick={closeDetail}
                aria-label="Close"
                className="rounded p-1.5 text-ink-subtle hover:bg-panel-subtle hover:text-ink"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
              {detailLoading ? (
                <div className="text-sm text-ink-subtle">Loading details…</div>
              ) : (
                <>
                  <section>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-subtle">Description</p>
                    <p className="mt-1 whitespace-pre-line text-sm text-ink">{selected.description}</p>
                  </section>

                  {selected.responseNote ? (
                    <section className="rounded-md border border-emerald-200 bg-emerald-50/60 px-4 py-3">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-800">Response</p>
                      <p className="mt-1 whitespace-pre-line text-sm text-emerald-950">{selected.responseNote}</p>
                      {selected.respondedAt ? (
                        <p className="mt-2 text-xs text-emerald-800/80">Responded {formatStamp(selected.respondedAt)}</p>
                      ) : null}
                    </section>
                  ) : null}

                  {selected.status !== 'closed' ? (
                    <section className="space-y-3 rounded-md border border-hairline bg-panel-subtle/30 p-4">
                      <div>
                        <p className="text-sm font-semibold text-ink">Update status</p>
                        <p className="mt-0.5 text-xs text-ink-subtle">
                          {selected.status === 'open'
                            ? 'Mark as attending (optional note) or respond and close (response note required).'
                            : 'Respond and close this dispute (response note required).'}
                        </p>
                      </div>

                      {actionError ? (
                        <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                          <span>{actionError}</span>
                        </div>
                      ) : null}

                      <div>
                        <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-ink-subtle">
                          Response / note {selected.status === 'in_review' ? '(required to close)' : '(required to close)'}
                        </label>
                        <textarea
                          value={note}
                          onChange={(e) => setNote(e.target.value)}
                          rows={4}
                          maxLength={2000}
                          placeholder={
                            selected.status === 'open'
                              ? 'Optional interim note, or write the response to send when closing...'
                              : 'Write the response to send to the business...'
                          }
                          className="w-full rounded-md border border-hairline bg-panel px-3 py-2 text-sm text-ink placeholder:text-ink-subtle focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                        />
                        <p className="mt-1 text-xs text-ink-subtle">{note.length}/2000</p>
                      </div>

                      <div className="flex flex-wrap items-center justify-end gap-2">
                        {selected.status === 'open' ? (
                          <button
                            type="button"
                            onClick={() => doUpdateStatus('in_review')}
                            disabled={actionLoading !== null}
                            className="inline-flex items-center rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-800 hover:bg-blue-100 disabled:opacity-60"
                          >
                            {actionLoading === 'in_review' ? 'Updating…' : 'Mark attending'}
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => doUpdateStatus('closed')}
                          disabled={actionLoading !== null}
                          className="inline-flex items-center rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
                        >
                          {actionLoading === 'closed' ? 'Responding…' : 'Respond & close'}
                        </button>
                      </div>
                    </section>
                  ) : (
                    <section className="rounded-md border border-emerald-200 bg-emerald-50/40 px-4 py-3 text-sm text-emerald-900">
                      This dispute has been responded to and is closed.
                    </section>
                  )}
                </>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-hairline bg-panel-subtle/30 px-5 py-3">
              <button
                type="button"
                onClick={closeDetail}
                className="inline-flex items-center rounded-md border border-hairline bg-panel px-3 py-2 text-sm font-medium text-ink hover:bg-panel-subtle"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}