import { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  ArrowDownLeft,
  Building2,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  HelpCircle,
  RefreshCw,
  Search,
  X,
} from 'lucide-react';
import { TableSkeleton } from '@/components/ui/Skeleton.tsx';
import api, { getErrorMessage } from '@/lib/axios';
import toast from 'react-hot-toast';
import PaginationBar from './shared/Pagination';
import { PanelEmpty } from './shared/Panel';
import StatusPill from './shared/StatusPill';
import { formatNaira, formatStamp } from './shared/format';
import { useAdminStatsStore } from '@/stores/admin.stats.store.ts';
import { usePaginationTransition } from '@/hooks/usePaginationTransition';
import type { AdminUnverifiedInflowRow } from '@/types/index.ts';

export default function AdminUnverifiedInflows() {
  const [inflows, setInflows] = useState<AdminUnverifiedInflowRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const unverifiedCount = useAdminStatsStore((s) => s.stats?.unverifiedInflows?.count ?? 0);

  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 1,
    hasNext: false,
    hasPrev: false,
  });
  const { isPageLoading, pendingPage, start, finish } = usePaginationTransition();

  // Debounce search input by 300ms
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput.trim());
      setPagination((p) => ({ ...p, page: 1 }));
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const fetchInflows = useCallback(async () => {
    try {
      setLoading(true);
      if (hasLoadedOnce) start(pagination.page);
      const params = new URLSearchParams({
        page: String(pagination.page),
        limit: String(pagination.limit),
      });
      if (search) {
        params.set('search', search);
      }

      const res = await api.get(`/admin/sales/unverified?${params.toString()}`);
      if (res.data?.success) {
        setInflows(res.data.data);
        if (res.data.pagination) {
          setPagination(res.data.pagination);
        }
      }
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to load unverified inflows queue'));
    } finally {
      setLoading(false);
      finish();
      setHasLoadedOnce(true);
    }
  }, [pagination.page, pagination.limit, search, hasLoadedOnce, start, finish]);

  useEffect(() => {
    fetchInflows();
  }, [fetchInflows]);

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const handlePageChange = (next: number) => {
    if (next === pagination.page || isPageLoading) return;
    start(next);
    setPagination((p) => ({ ...p, page: next }));
  };

  const handleRefresh = () => {
    fetchInflows();
    useAdminStatsStore.getState().fetchStats({ force: true });
  };

  const totalPendingValue = inflows.reduce((sum, r) => sum + Number(r.amount ?? 0), 0);
  const affectedBusinesses = new Set(inflows.map((r) => r.business?.merchantId ?? r.business?.businessName)).size;

  return (
    <div className='space-y-6'>
      {/* Header — Subscriptions desk pattern */}
      <div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
        <div>
          <div className='flex items-center gap-2'>
            <h1 className='text-xl font-bold tracking-tight text-ink sm:text-2xl'>
              Unverified Inflows
            </h1>
            <span className='rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800'>
              Triage Queue
            </span>
          </div>
          <p className='mt-1 text-xs text-ink-muted sm:text-sm'>
            Auto-captured transfers awaiting merchant classification — quarantined from treasury P&amp;L until verified.
          </p>
        </div>

        <button
          onClick={handleRefresh}
          disabled={loading}
          className='inline-flex items-center gap-1.5 self-start rounded-lg border border-hairline bg-panel px-3.5 py-2 text-xs font-semibold text-ink shadow-2xs transition-colors hover:bg-panel-subtle sm:self-auto'
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Summary KPI Cards — Subscriptions desk pattern */}
      <div className='grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4'>
        <div className='rounded-xl border border-hairline bg-panel p-4 shadow-2xs'>
          <div className='flex items-center justify-between text-ink-subtle'>
            <span className='text-xs font-medium'>Awaiting Review</span>
            <Clock className='h-4 w-4 text-amber-500' />
          </div>
          <p className='mt-2 text-2xl font-bold tabular-nums text-amber-600'>
            {unverifiedCount || pagination.total || inflows.length}
          </p>
          <p className='mt-0.5 text-[11px] text-ink-subtle'>Pending classification</p>
        </div>

        <div className='rounded-xl border border-hairline bg-panel p-4 shadow-2xs'>
          <div className='flex items-center justify-between text-ink-subtle'>
            <span className='text-xs font-medium'>Quarantined Value</span>
            <ArrowDownLeft className='h-4 w-4 text-emerald-500' />
          </div>
          <p className='mt-2 font-mono text-2xl font-bold tabular-nums text-ink'>
            {formatNaira(totalPendingValue)}
          </p>
          <p className='mt-0.5 text-[11px] text-ink-subtle'>Held out of treasury P&amp;L</p>
        </div>

        <div className='rounded-xl border border-hairline bg-panel p-4 shadow-2xs'>
          <div className='flex items-center justify-between text-ink-subtle'>
            <span className='text-xs font-medium'>Businesses Affected</span>
            <Building2 className='h-4 w-4 text-primary-500' />
          </div>
          <p className='mt-2 text-2xl font-bold tabular-nums text-ink'>
            {affectedBusinesses}
          </p>
          <p className='mt-0.5 text-[11px] text-ink-subtle'>Merchants must classify</p>
        </div>

        <div className='rounded-xl border border-hairline bg-panel p-4 shadow-2xs'>
          <div className='flex items-center justify-between text-ink-subtle'>
            <span className='text-xs font-medium'>Queue Health</span>
            <CheckCircle2 className='h-4 w-4 text-emerald-500' />
          </div>
          <p className='mt-2 text-2xl font-bold tabular-nums text-emerald-600'>
            {inflows.length === 0 ? 'Clear' : 'Active'}
          </p>
          <p className='mt-0.5 text-[11px] text-ink-subtle'>
            {search ? `Filtered by “${search}”` : 'Read-only triage view'}
          </p>
        </div>
      </div>

      {/* Search Toolbar — Subscriptions desk pattern */}
      <div className='flex flex-col justify-between gap-3 border-b border-hairline pb-4 sm:flex-row sm:items-center'>
        <div className='flex items-center gap-1.5'>
          <span className='rounded-lg bg-primary-600 px-3 py-1.5 text-xs font-semibold text-white shadow-2xs'>
            Queue ({pagination.total || inflows.length})
          </span>
          {search && (
            <span className='text-[11px] text-ink-muted'>
              Filtering by “{search}”
            </span>
          )}
        </div>
        <div className='relative w-full sm:w-72'>
          <Search className='absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-subtle' />
          <input
            type='search'
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder='Search reference, customer, business…'
            aria-label='Search unverified inflows'
            className='w-full rounded-lg border border-hairline bg-panel py-1.5 pl-9 pr-8 text-xs text-ink placeholder:text-ink-subtle focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500'
          />
          {searchInput && (
            <button
              type='button'
              onClick={() => setSearchInput('')}
              aria-label='Clear search'
              className='absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-subtle hover:text-ink'
            >
              <X className='h-3.5 w-3.5' />
            </button>
          )}
        </div>
      </div>

      {/* Queue Table — Subscriptions desk pattern */}
      <div className='overflow-hidden rounded-xl border border-hairline bg-panel shadow-2xs'>
        {loading && !hasLoadedOnce ? (
          <div className='p-6'>
            <TableSkeleton rows={5} columns={6} />
          </div>
        ) : inflows.length === 0 ? (
          <div className='px-4 py-12 text-center'>
            {search ? (
              <>
                <AlertCircle className='mx-auto mb-2 h-8 w-8 text-ink-subtle opacity-40' />
                <p className='font-semibold text-ink'>No matching inflows found</p>
                <p className='mt-0.5 text-[11px] text-ink-subtle'>
                  No unverified transactions match “{search}”. Try clearing your search query.
                </p>
              </>
            ) : (
              <PanelEmpty
                icon={HelpCircle}
                title='All inflows verified'
                hint='There are currently no transactions awaiting classification across the platform.'
              />
            )}
          </div>
        ) : (
          <div className={`overflow-x-auto transition-opacity ${isPageLoading ? 'opacity-60 pointer-events-none' : 'opacity-100'}`} aria-busy={isPageLoading}>
            <table className='w-full text-left text-xs'>
              <thead className='border-b border-hairline bg-panel-subtle text-[10px] font-semibold uppercase tracking-wider text-ink-muted'>
                <tr>
                  <th className='px-4 py-3'>Business</th>
                  <th className='px-4 py-3'>Counterparty</th>
                  <th className='px-4 py-3 text-right'>Amount</th>
                  <th className='px-4 py-3'>Reference</th>
                  <th className='px-4 py-3'>Date</th>
                  <th className='px-4 py-3 text-center'>State</th>
                </tr>
              </thead>
              <tbody className='divide-y divide-hairline'>
                {inflows.map((row) => (
                  <tr key={row.id} className='transition-colors hover:bg-panel-subtle/50'>
                    {/* Business with avatar — Subscriptions customer-cell pattern */}
                    <td className='px-4 py-3.5'>
                      <div className='flex items-center gap-2.5'>
                        <div className='flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-100 font-bold text-primary-700'>
                          {row.business.businessName.charAt(0).toUpperCase()}
                        </div>
                        <div className='min-w-0'>
                          <p className='truncate font-bold text-ink'>{row.business.businessName}</p>
                          <p className='truncate font-mono text-[11px] text-ink-muted'>
                            {row.business.merchantId} · {row.business.user.email}
                          </p>
                        </div>
                      </div>
                    </td>

                    {/* Counterparty / Customer */}
                    <td className='px-4 py-3.5 text-ink'>
                      <div className='max-w-[160px] truncate font-medium'>
                        {row.customerName || row.customerHint || (
                          <span className='italic text-ink-subtle'>Not specified</span>
                        )}
                      </div>
                      {row.description && (
                        <div className='max-w-[160px] truncate text-[10px] text-ink-subtle'>
                          {row.description}
                        </div>
                      )}
                    </td>

                    {/* Amount */}
                    <td className='px-4 py-3.5 text-right'>
                      <span className='font-bold tabular-nums text-sm text-ink'>
                        {formatNaira(row.amount)}
                      </span>
                    </td>

                    {/* Reference */}
                    <td className='whitespace-nowrap px-4 py-3.5'>
                      <div className='flex items-center gap-1.5'>
                        <span className='font-mono text-[11px] text-ink'>
                          {row.referenceId || row.id.slice(0, 12)}
                        </span>
                        <button
                          onClick={() => handleCopy(row.id, row.referenceId || row.id)}
                          className='p-0.5 text-ink-subtle transition-colors hover:text-ink'
                          title='Copy reference'
                        >
                          {copiedId === row.id ? (
                            <Check className='h-3 w-3 text-emerald-500' />
                          ) : (
                            <Copy className='h-3 w-3' />
                          )}
                        </button>
                      </div>
                    </td>

                    {/* Date */}
                    <td className='whitespace-nowrap px-4 py-3.5 text-[11px] text-ink-muted'>
                      {formatStamp(row.transactionDate)}
                    </td>

                    {/* Status */}
                    <td className='px-4 py-3.5 text-center'>
                      <StatusPill tone='warning'>Needs Verification</StatusPill>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {inflows.length > 0 && (
          <div className='border-t border-hairline bg-panel-subtle'>
            <PaginationBar
              pagination={pagination}
              onPageChange={handlePageChange}
              noun='inflows'
              isLoading={isPageLoading}
              pendingPage={pendingPage}
            />
          </div>
        )}
      </div>
    </div>
  );
}
