import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Calculator,
  Loader2,
  Search,
  Wallet,
  X,
  XCircle,
} from 'lucide-react';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import { TableSkeleton } from '@/components/ui/Skeleton.tsx';
import api, { getErrorMessage } from '@/lib/axios';
import toast from 'react-hot-toast';
import PageHeader from './shared/PageHeader';
import PaginationBar from './shared/Pagination';
import { Panel, PanelEmpty } from './shared/Panel';
import StatusPill from './shared/StatusPill';
import { formatNaira, formatStamp, formatTransferStamp } from './shared/format';
import type { AdminTransactionRow, AdminTransactionsSummary } from '@/types/index.ts';

type SourceFilter = 'all' | 'inflow' | 'withdrawal' | 'tax';

const SOURCE_OPTIONS: ReadonlyArray<{ value: SourceFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'inflow', label: 'Inflows' },
  { value: 'withdrawal', label: 'Withdrawals' },
  { value: 'tax', label: 'Tax' },
];

const SOURCE_META: Record<
  AdminTransactionRow['sourceType'],
  { label: string; icon: typeof ArrowDownLeft }
> = {
  inflow: { label: 'Inflow', icon: ArrowDownLeft },
  withdrawal: { label: 'Withdrawal', icon: ArrowUpRight },
  tax: { label: 'Tax Payment', icon: Calculator },
};

const RowStatus = ({ row }: { row: AdminTransactionRow }) => {
  if (row.needsVerification) return <StatusPill tone='warning'>Unverified</StatusPill>;
  switch (row.sourceType) {
    case 'inflow':
      return <StatusPill tone='success'>Settled</StatusPill>;
    case 'withdrawal':
      switch (row.status) {
        case 'pending':
          return <StatusPill tone='warning'>Awaiting approval</StatusPill>;
        case 'processing':
          return (
            <StatusPill tone='info' icon={<Loader2 className='h-3 w-3 animate-spin' />}>
              Processing
            </StatusPill>
          );
        case 'completed':
          return <StatusPill tone='success'>Completed</StatusPill>;
        case 'failed':
          return <StatusPill tone='danger'>Failed</StatusPill>;
        case 'refunded':
          return <StatusPill tone='neutral'>Refunded</StatusPill>;
        default:
          return <StatusPill tone='neutral'>{row.status}</StatusPill>;
      }
    case 'tax':
      switch (row.status) {
        case 'completed':
          return <StatusPill tone='success'>Completed</StatusPill>;
        case 'pending':
        case 'processing':
          return (
            <StatusPill tone='info' icon={<Loader2 className='h-3 w-3 animate-spin' />}>
              Processing
            </StatusPill>
          );
        case 'failed':
          return <StatusPill tone='danger'>Failed</StatusPill>;
        case 'refunded':
          return <StatusPill tone='neutral'>Refunded</StatusPill>;
        default:
          return <StatusPill tone='neutral'>{row.status}</StatusPill>;
      }
  }
};

export default function AdminTransactions() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialSource = searchParams.get('source') as SourceFilter | null;

  const [transactions, setTransactions] = useState<AdminTransactionRow[]>([]);
  const [summary, setSummary] = useState<AdminTransactionsSummary | null>(null);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>(
    initialSource && SOURCE_OPTIONS.some((o) => o.value === initialSource) ? initialSource : 'all'
  );
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [detailRow, setDetailRow] = useState<AdminTransactionRow | null>(null);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 1,
    hasNext: false,
    hasPrev: false,
  });

  // Debounced search — mirrors the Withdrawals list (no request per keystroke).
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput.trim());
      setPagination((prev) => (prev.page === 1 ? prev : { ...prev, page: 1 }));
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const fetchTransactions = useCallback(async () => {
    const params = new URLSearchParams({
      page: String(pagination.page),
      limit: String(pagination.limit),
    });
    if (sourceFilter !== 'all') params.append('source', sourceFilter);
    if (search) params.append('search', search);
    if (fromDate) params.append('from', fromDate);
    if (toDate) params.append('to', toDate);

    try {
      const res = await api.get(`/admin/transactions?${params.toString()}`);
      setTransactions(Array.isArray(res.data?.data) ? res.data.data : []);
      if (res.data?.summary) setSummary(res.data.summary);
      if (res.data?.pagination) setPagination(res.data.pagination);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to load transactions'));
      setTransactions([]);
    } finally {
      setHasLoadedOnce(true);
    }
  }, [pagination.page, pagination.limit, sourceFilter, search, fromDate, toDate]);

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  const applySourceFilter = (source: SourceFilter) => {
    setSourceFilter(source);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (source === 'all') next.delete('source');
      else next.set('source', source);
      return next;
    });
    setPagination((prev) => (prev.page === 1 ? prev : { ...prev, page: 1 }));
  };

  const isFiltered = Boolean(search) || sourceFilter !== 'all' || fromDate || toDate;

  return (
    <div className='space-y-4'>
      <PageHeader
        title='Transactions'
        hint='Real wallet movements across all merchants — Paystack inflows, withdrawals to bank, and tax payments.'
        actions={
          <span className='text-[11px] text-ink-muted'>
            {pagination.total} {pagination.total === 1 ? 'transaction' : 'transactions'}
          </span>
        }
      />

      {/* Summary KPI Cards — Subscriptions desk pattern
          Money Out = successful (completed) only; Failed is isolated so ledger stays accurate. */}
      <div className='grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4'>
        <div className='rounded-xl border border-hairline bg-panel p-4 shadow-2xs'>
          <div className='flex items-center justify-between text-ink-subtle'>
            <span className='text-xs font-medium'>Money In</span>
            <ArrowDownLeft className='h-4 w-4 text-emerald-500' />
          </div>
          <p className='mt-2 font-mono text-2xl font-bold tabular-nums text-emerald-600'>
            {formatNaira(summary?.totalIn ?? 0)}
          </p>
          <p className='mt-0.5 text-[11px] text-ink-subtle'>DVA bank-transfer inflows</p>
        </div>
        <div className='rounded-xl border border-hairline bg-panel p-4 shadow-2xs'>
          <div className='flex items-center justify-between text-ink-subtle'>
            <span className='text-xs font-medium'>Money Out</span>
            <ArrowUpRight className='h-4 w-4 text-emerald-600' />
          </div>
          <p className='mt-2 font-mono text-2xl font-bold tabular-nums text-ink'>
            {formatNaira(summary?.totalOut ?? 0)}
          </p>
          <p className='mt-0.5 text-[11px] text-ink-subtle'>Successful payouts only (completed)</p>
        </div>
        <div className='rounded-xl border border-danger-200 bg-danger-50/40 p-4 shadow-2xs'>
          <div className='flex items-center justify-between text-ink-subtle'>
            <span className='text-xs font-medium'>Failed</span>
            <XCircle className='h-4 w-4 text-rose-500' />
          </div>
          <p className='mt-2 font-mono text-2xl font-bold tabular-nums text-rose-600'>
            {formatNaira(summary?.totalFailed ?? 0)}
          </p>
          <p className='mt-0.5 text-[11px] text-ink-subtle'>
            {summary?.failedCount ?? 0} failed · excluded from Money Out & Net
          </p>
        </div>
        <div className='rounded-xl border border-hairline bg-panel p-4 shadow-2xs'>
          <div className='flex items-center justify-between text-ink-subtle'>
            <span className='text-xs font-medium'>Net</span>
            <Wallet className='h-4 w-4 text-primary-500' />
          </div>
          <p
            className={`mt-2 font-mono text-2xl font-bold tabular-nums ${
              (summary?.net ?? 0) >= 0 ? 'text-primary-700' : 'text-rose-600'
            }`}
          >
            {formatNaira(summary?.net ?? 0)}
          </p>
          <p className='mt-0.5 text-[11px] text-ink-subtle'>Money In − Money Out (successful only)</p>
        </div>
      </div>

      {/* Filter Tabs & Search — Subscriptions desk pattern */}
      <div className='flex flex-col justify-between gap-3 border-b border-hairline pb-4 lg:flex-row lg:items-center'>
        <div className='flex items-center gap-1.5 overflow-x-auto pb-1 lg:pb-0'>
          {SOURCE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type='button'
              onClick={() => applySourceFilter(opt.value)}
              className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                sourceFilter === opt.value
                  ? 'bg-primary-600 text-white shadow-2xs'
                  : 'text-ink-muted hover:bg-panel-subtle hover:text-ink'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <div className='flex flex-col gap-2 sm:flex-row sm:items-center'>
          <div className='flex w-full flex-wrap items-center gap-2 lg:w-auto lg:justify-end'>
            <label className='flex items-center gap-1.5 text-[11px] text-ink-muted'>
              From
              <input
                type='date'
                value={fromDate}
                onChange={(e) => {
                  setFromDate(e.target.value);
                  setPagination((prev) => (prev.page === 1 ? prev : { ...prev, page: 1 }));
                }}
                aria-label='From date'
                className='h-8 rounded border border-hairline-strong bg-panel px-2 text-xs text-ink focus:border-primary-500 focus:ring-1 focus:ring-primary-500/30 focus:outline-none'
              />
            </label>
            <label className='flex items-center gap-1.5 text-[11px] text-ink-muted'>
              To
              <input
                type='date'
                value={toDate}
                onChange={(e) => {
                  setToDate(e.target.value);
                  setPagination((prev) => (prev.page === 1 ? prev : { ...prev, page: 1 }));
                }}
                aria-label='To date'
                className='h-8 rounded border border-hairline-strong bg-panel px-2 text-xs text-ink focus:border-primary-500 focus:ring-1 focus:ring-primary-500/30 focus:outline-none'
              />
            </label>
            <div className='relative w-full sm:w-56'>
              <Search
                className='absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-subtle'
                aria-hidden='true'
              />
              <input
                type='search'
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder='Search business or reference...'
                aria-label='Search transactions by business name or reference'
                className='h-8 w-full rounded border border-hairline-strong bg-panel pl-8 pr-8 text-xs text-ink placeholder:text-ink-subtle focus:border-primary-500 focus:ring-1 focus:ring-primary-500/30 focus:outline-none'
              />
              {searchInput && (
                <button
                  type='button'
                  onClick={() => setSearchInput('')}
                  aria-label='Clear search'
                  className='absolute right-2 top-1/2 -translate-y-1/2 text-ink-subtle hover:text-ink focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:outline-none'
                >
                  <X className='h-3.5 w-3.5' />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Submissions Table — Subscriptions desk pattern */}
      {!hasLoadedOnce ? (
        <TableSkeleton rows={6} columns={5} />
      ) : transactions.length === 0 ? (
        <Panel>
          <PanelEmpty
            icon={Wallet}
            title={isFiltered ? 'No matching transactions' : 'No transactions yet'}
            hint={
              isFiltered
                ? 'Try adjusting your filters or date range.'
                : 'Real wallet movements from merchants will appear here.'
            }
          />
        </Panel>
      ) : (
        <div className='overflow-hidden rounded-xl border border-hairline bg-panel shadow-2xs'>
          <div className='overflow-x-auto'>
            <table className='w-full text-left text-xs'>
              <thead className='border-b border-hairline bg-panel-subtle text-[10px] font-semibold uppercase tracking-wider text-ink-muted'>
                <tr>
                  <th className='px-4 py-3'>Business</th>
                  <th className='px-4 py-3'>Type</th>
                  <th className='px-4 py-3'>Status</th>
                  <th className='px-4 py-3 text-right'>Amount</th>
                  <th className='px-4 py-3'>Date</th>
                  <th className='px-4 py-3 text-right'>Action</th>
                </tr>
              </thead>
              <tbody className='divide-y divide-hairline'>
                {transactions.map((row) => {
                  const meta = SOURCE_META[row.sourceType];
                  const TypeIcon = meta.icon;
                  return (
                    <tr
                      key={`${row.sourceType}-${row.id}`}
                      className='cursor-pointer transition-colors hover:bg-panel-subtle/50'
                      onClick={() => setDetailRow(row)}
                    >
                      <td className='px-4 py-3.5'>
                        <div className='flex items-center gap-2.5'>
                          <div className='flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-100 font-bold text-primary-700'>
                            {row.businessName.charAt(0).toUpperCase()}
                          </div>
                          <div className='min-w-0'>
                            <p className='truncate font-bold text-ink'>{row.businessName}</p>
                            <p className='truncate font-mono text-[11px] text-ink-muted'>
                              {row.merchantId}
                              {row.reference && <span> · {row.reference.slice(0, 12)}</span>}
                            </p>
                          </div>
                        </div>
                      </td>

                      <td className='px-4 py-3.5 whitespace-nowrap'>
                        <span className='inline-flex items-center gap-1.5 text-[11px] font-medium text-ink-muted'>
                          <TypeIcon
                            className={`h-3.5 w-3.5 ${
                              row.direction === 'in' ? 'text-success-600' : 'text-ink-subtle'
                            }`}
                            aria-hidden='true'
                          />
                          {meta.label}
                        </span>
                      </td>

                      <td className='px-4 py-3.5 whitespace-nowrap'>
                        <RowStatus row={row} />
                      </td>

                      <td className='px-4 py-3.5 text-right'>
                        <span
                          className={`font-bold tabular-nums text-sm ${
                            row.direction === 'in' ? 'text-success-600' : 'text-ink'
                          }`}
                        >
                          {row.direction === 'in' ? '+' : '−'}
                          {formatNaira(row.amount)}
                        </span>
                        {row.sourceType === 'withdrawal' && row.fee > 0 && (
                          <div className='text-[10px] font-normal text-ink-subtle'>
                            fee {formatNaira(row.fee)} · net {formatNaira(row.netAmount)}
                          </div>
                        )}
                      </td>

                      <td className='px-4 py-3.5 whitespace-nowrap text-ink-muted'>
                        {formatTransferStamp(row.date)}
                      </td>

                      <td className='px-4 py-3.5 text-right'>
                        <button
                          type='button'
                          onClick={(e) => {
                            e.stopPropagation();
                            setDetailRow(row);
                          }}
                          className='inline-flex items-center gap-1.5 rounded-lg border border-hairline bg-panel px-3 py-1.5 text-xs font-semibold text-primary-700 shadow-2xs transition-colors hover:bg-primary-50'
                        >
                          Details
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <PaginationBar
            pagination={pagination}
            onPageChange={(page) => setPagination((prev) => ({ ...prev, page }))}
            noun='transactions'
          />
        </div>
      )}

      {/* Detail */}
      <Modal
        isOpen={Boolean(detailRow)}
        onClose={() => setDetailRow(null)}
        title='Transaction Details'
        subtitle={detailRow?.reference || undefined}
        icon={
          detailRow ? (
            (() => {
              const Icon = SOURCE_META[detailRow.sourceType].icon;
              return <Icon className='h-4 w-4' />;
            })()
          ) : undefined
        }
        size='md'
        footer={
          <Button variant='secondary' size='sm' onClick={() => setDetailRow(null)}>
            Close
          </Button>
        }
      >
        {detailRow && (
          <div className='space-y-3'>
            <div className='flex flex-wrap items-center justify-between gap-2'>
              <RowStatus row={detailRow} />
              <span className='text-[11px] text-ink-muted'>
                {SOURCE_META[detailRow.sourceType].label}
                {detailRow.direction === 'in' ? ' · money in' : ' · money out'}
              </span>
            </div>

            {detailRow.needsVerification && (
              <p className='rounded border border-warning-200 bg-warning-50 px-3 py-2 text-[11px] text-warning-900'>
                Awaiting merchant classification — structurally quarantined from treasury P&amp;L
                until verified.
              </p>
            )}

            <section className='rounded border border-hairline px-3 py-2.5'>
              <h3 className='text-[10px] font-semibold uppercase tracking-wider text-ink-muted'>
                Business
              </h3>
              <dl className='mt-1.5 grid grid-cols-1 gap-3 sm:grid-cols-2'>
                <div>
                  <dt className='text-[11px] text-ink-muted'>Business name</dt>
                  <dd className='mt-0.5 text-xs font-medium text-ink'>{detailRow.businessName}</dd>
                </div>
                <div>
                  <dt className='text-[11px] text-ink-muted'>Merchant ID</dt>
                  <dd className='mt-0.5 font-mono text-xs text-ink'>{detailRow.merchantId}</dd>
                </div>
                <div className='sm:col-span-2'>
                  <dt className='text-[11px] text-ink-muted'>Owner email</dt>
                  <dd className='mt-0.5 text-xs font-medium text-ink'>{detailRow.userEmail}</dd>
                </div>
              </dl>
            </section>

            <section className='rounded border border-hairline px-3 py-2.5'>
              <h3 className='text-[10px] font-semibold uppercase tracking-wider text-ink-muted'>
                Financial
              </h3>
              <dl className='mt-1.5 space-y-1.5'>
                {detailRow.sourceType === 'withdrawal' ? (
                  <>
                    <div className='flex items-center justify-between'>
                      <dt className='text-[11px] text-ink-muted'>Wallet debit (gross)</dt>
                      <dd className='font-mono text-sm font-semibold text-ink'>
                        {formatNaira(detailRow.amount)}
                      </dd>
                    </div>
                    {detailRow.fee > 0 && (
                      <div className='flex items-center justify-between'>
                        <dt className='text-[11px] text-ink-muted'>Transfer fee</dt>
                        <dd className='font-mono text-xs text-ink-muted'>
                          −{formatNaira(detailRow.fee)}
                        </dd>
                      </div>
                    )}
                    <div className='flex items-center justify-between border-t border-hairline pt-1.5'>
                      <dt className='text-[11px] font-semibold text-ink'>Net to bank</dt>
                      <dd className='font-mono text-sm font-semibold text-success-700'>
                        {formatNaira(detailRow.netAmount)}
                      </dd>
                    </div>
                  </>
                ) : detailRow.sourceType === 'tax' ? (
                  <>
                    <div className='flex items-center justify-between'>
                      <dt className='text-[11px] text-ink-muted'>Amount paid</dt>
                      <dd className='font-mono text-sm font-semibold text-ink'>
                        {formatNaira(detailRow.amount)}
                      </dd>
                    </div>
                    {detailRow.description && (
                      <div className='flex items-center justify-between'>
                        <dt className='text-[11px] text-ink-muted'>Payment method</dt>
                        <dd className='text-xs text-ink'>{detailRow.description}</dd>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <div className='flex items-center justify-between'>
                      <dt className='text-[11px] text-ink-muted'>Amount received</dt>
                      <dd className='font-mono text-sm font-semibold text-success-700'>
                        {formatNaira(detailRow.amount)}
                      </dd>
                    </div>
                    <div className='flex items-center justify-between'>
                      <dt className='text-[11px] text-ink-muted'>Customer</dt>
                      <dd className='text-xs text-ink'>{detailRow.counterparty || '—'}</dd>
                    </div>
                  </>
                )}
                {detailRow.description && detailRow.sourceType !== 'tax' && (
                  <div className='flex items-center justify-between gap-3'>
                    <dt className='shrink-0 text-[11px] text-ink-muted'>Description</dt>
                    <dd className='truncate text-[11px] text-ink'>{detailRow.description}</dd>
                  </div>
                )}
              </dl>
            </section>

            {detailRow.sourceType === 'withdrawal' && (
              <section className='rounded border border-hairline px-3 py-2.5'>
                <h3 className='text-[10px] font-semibold uppercase tracking-wider text-ink-muted'>
                  Destination Bank
                </h3>
                <dl className='mt-1.5 grid grid-cols-1 gap-3 sm:grid-cols-2'>
                  <div>
                    <dt className='text-[11px] text-ink-muted'>Bank</dt>
                    <dd className='mt-0.5 text-xs font-medium text-ink'>
                      {detailRow.destinationBankName}
                    </dd>
                  </div>
                  <div>
                    <dt className='text-[11px] text-ink-muted'>Account number</dt>
                    <dd className='mt-0.5 font-mono text-xs font-medium text-ink'>
                      {detailRow.destinationAccountNum}
                    </dd>
                  </div>
                  <div className='sm:col-span-2'>
                    <dt className='text-[11px] text-ink-muted'>Account name</dt>
                    <dd className='mt-0.5 text-xs font-medium text-ink'>
                      {detailRow.counterparty || '—'}
                    </dd>
                  </div>
                </dl>
              </section>
            )}

            <section className='rounded border border-hairline px-3 py-2.5'>
              <h3 className='text-[10px] font-semibold uppercase tracking-wider text-ink-muted'>
                Reference
              </h3>
              <dl className='mt-1.5 space-y-1.5'>
                <div className='flex items-center justify-between gap-3'>
                  <dt className='shrink-0 text-[11px] text-ink-muted'>Reference</dt>
                  <dd className='truncate font-mono text-xs font-medium text-ink'>
                    {detailRow.reference || '—'}
                  </dd>
                </div>
                <div className='flex items-center justify-between gap-3'>
                  <dt className='text-[11px] text-ink-muted'>Date</dt>
                  <dd className='text-[11px] text-ink'>{formatStamp(detailRow.date)}</dd>
                </div>
              </dl>

              {detailRow.failureReason && (
                <p className='mt-2 rounded border border-danger-200 bg-danger-50 px-2.5 py-2 text-[11px] text-danger-700'>
                  <span className='flex items-center gap-1 font-semibold'>
                    <XCircle className='h-3.5 w-3.5' aria-hidden='true' />
                    Failure reason
                  </span>
                  <span className='mt-0.5 block'>{detailRow.failureReason}</span>
                </p>
              )}
            </section>
          </div>
        )}
      </Modal>
    </div>
  );
}
