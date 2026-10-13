import { useCallback, useEffect, useState } from 'react';
import {
  Building2,
  Check,
  Clock,
  Copy,
  HelpCircle,
  Search,
} from 'lucide-react';
import { TableSkeleton } from '@/components/ui/Skeleton.tsx';
import api, { getErrorMessage } from '@/lib/axios';
import toast from 'react-hot-toast';
import PageHeader from './shared/PageHeader';
import PaginationBar from './shared/Pagination';
import { Panel, PanelEmpty } from './shared/Panel';
import StatusPill from './shared/StatusPill';
import { formatNaira, formatStamp } from './shared/format';
import { useAdminStatsStore } from '@/stores/admin.stats.store.ts';
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
      setHasLoadedOnce(true);
    }
  }, [pagination.page, pagination.limit, search]);

  useEffect(() => {
    fetchInflows();
  }, [fetchInflows]);

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  return (
    <div className='space-y-6'>
      <PageHeader
        title='Unverified Inflows'
        hint='Read-only view of auto-captured incoming transfers awaiting classification by their merchant.'
      />

      {/* KPI Overview Banner */}
      <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3'>
        <div className='rounded-lg border border-amber-500/20 bg-amber-500/5 p-4'>
          <div className='flex items-center justify-between'>
            <span className='text-xs font-medium text-amber-400 uppercase tracking-wider'>
              Unverified Inflows
            </span>
            <Clock className='h-4 w-4 text-amber-400' />
          </div>
          <div className='mt-2 flex items-baseline gap-2'>
            <span className='text-2xl font-bold tracking-tight text-ink tabular-nums'>
              {unverifiedCount}
            </span>
            <span className='text-xs text-ink-muted'>pending classification</span>
          </div>
          <p className='mt-1 text-[11px] text-ink-subtle'>
            Structurally quarantined from treasury P&L until verified.
          </p>
        </div>
      </div>

      {/* Search Toolbar */}
      <div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
        <div className='relative max-w-sm flex-1'>
          <Search className='pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-subtle' />
          <input
            type='text'
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder='Search reference, customer, or business...'
            className='h-9 w-full rounded border border-hairline bg-panel pl-9 pr-3 text-xs text-ink placeholder:text-ink-subtle focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500'
          />
        </div>

        {search && (
          <div className='flex items-center gap-2 text-xs text-ink-muted'>
            <span>Filtering by: &ldquo;{search}&rdquo;</span>
            <button
              onClick={() => setSearchInput('')}
              className='text-primary-400 hover:text-primary-300 underline'
            >
              Clear
            </button>
          </div>
        )}
      </div>

      {/* Queue Table */}
      <Panel>
        {loading && !hasLoadedOnce ? (
          <div className='p-6'>
            <TableSkeleton rows={5} columns={6} />
          </div>
        ) : inflows.length === 0 ? (
          <PanelEmpty
            icon={HelpCircle}
            title={search ? 'No matching inflows found' : 'All inflows verified'}
            hint={
              search
                ? `No unverified transactions match "${search}". Try adjusting your search query.`
                : 'There are currently no transactions awaiting classification across the platform.'
            }
          />
        ) : (
          <div className='overflow-x-auto'>
            <table className='w-full text-left text-xs'>
              <thead>
                <tr className='border-b border-hairline bg-panel-subtle/50 text-[11px] font-medium text-ink-subtle'>
                  <th className='py-3 pl-4 pr-3'>Date</th>
                  <th className='px-3 py-3'>Reference</th>
                  <th className='px-3 py-3'>Assigned Business</th>
                  <th className='px-3 py-3'>Counterparty</th>
                  <th className='px-3 py-3 text-right'>Amount</th>
                  <th className='px-3 py-3 text-center'>State</th>
                </tr>
              </thead>
              <tbody className='divide-y divide-hairline'>
                {inflows.map((row) => (
                  <tr key={row.id} className='hover:bg-panel-subtle/30 transition-colors'>
                    {/* Date */}
                    <td className='py-3.5 pl-4 pr-3 whitespace-nowrap text-ink-muted'>
                      {formatStamp(row.transactionDate)}
                    </td>

                    {/* Reference */}
                    <td className='px-3 py-3.5 whitespace-nowrap'>
                      <div className='flex items-center gap-1.5'>
                        <span className='font-mono text-[11px] text-ink'>
                          {row.referenceId || row.id.slice(0, 12)}
                        </span>
                        <button
                          onClick={() => handleCopy(row.id, row.referenceId || row.id)}
                          className='text-ink-subtle hover:text-ink transition-colors p-0.5'
                          title='Copy reference'
                        >
                          {copiedId === row.id ? (
                            <Check className='h-3 w-3 text-emerald-400' />
                          ) : (
                            <Copy className='h-3 w-3' />
                          )}
                        </button>
                      </div>
                    </td>

                    {/* Assigned Business - Dedicated Visually Distinct Block */}
                    <td className='px-3 py-3.5'>
                      <div className='rounded border border-primary-500/20 bg-primary-500/5 px-2.5 py-1.5 inline-block max-w-[240px]'>
                        <div className='flex items-center gap-1.5'>
                          <Building2 className='h-3 w-3 shrink-0 text-primary-400' />
                          <span className='truncate font-semibold text-ink'>
                            {row.business.businessName}
                          </span>
                        </div>
                        <div className='mt-0.5 flex items-center gap-2 text-[10px] text-ink-subtle'>
                          <span className='font-mono'>{row.business.merchantId}</span>
                          <span>•</span>
                          <span className='truncate'>{row.business.user.email}</span>
                        </div>
                      </div>
                    </td>

                    {/* Counterparty / Customer */}
                    <td className='px-3 py-3.5 text-ink'>
                      <div className='max-w-[160px] truncate'>
                        {row.customerName || row.customerHint || (
                          <span className='text-ink-subtle italic'>Not specified</span>
                        )}
                      </div>
                      {row.description && (
                        <div className='max-w-[160px] truncate text-[10px] text-ink-subtle'>
                          {row.description}
                        </div>
                      )}
                    </td>

                    {/* Amount */}
                    <td className='px-3 py-3.5 text-right font-mono font-medium text-ink tabular-nums'>
                      {formatNaira(row.amount)}
                    </td>

                    {/* Status */}
                    <td className='px-3 py-3.5 text-center'>
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
          <PaginationBar
            pagination={pagination}
            onPageChange={(page) => setPagination((p) => ({ ...p, page }))}
            noun='inflows'
          />
        )}
      </Panel>

    </div>
  );
}
