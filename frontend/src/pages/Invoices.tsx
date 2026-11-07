import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Plus,
  FileText,
  ChevronLeft,
  ChevronRight,
  SlidersHorizontal,
  Search,
  Download,
  Loader2,
  X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import Button from '@/components/ui/Button.tsx';
import ErrorState from '@/components/ui/ErrorState.tsx';
import { useBusinessStore } from '@/stores/business.store.ts';
import { useInvoiceStore } from '@/stores/invoice.store.ts';
import type { InvoiceStatus } from '@/types/index.ts';
import { getErrorMessage } from '@/lib/axios.ts';
import { useSubscriptionWriteGate } from '@/hooks/useSubscriptionWriteGate';
import { useDisplayCurrency } from '@/hooks/useDisplayCurrency';
import { formatInvoiceMoney } from '@/lib/currency';

const PAGE_SIZE = 15;

const STATUS_TABS: Array<{ key: InvoiceStatus | ''; label: string; dot?: string }> = [
  { key: '', label: 'All' },
  { key: 'draft', label: 'Draft', dot: 'bg-amber-500' },
  { key: 'sent', label: 'Sent', dot: 'bg-blue-500' },
  { key: 'overdue', label: 'Overdue', dot: 'bg-rose-500' },
  { key: 'paid', label: 'Paid', dot: 'bg-emerald-500' },
  { key: 'cancelled', label: 'Cancelled', dot: 'bg-gray-400' },
];

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatShortDate(d: string) {
  return new Date(d).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' });
}

function getInitials(name: string) {
  return (
    name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0].toUpperCase())
      .join('') || 'C'
  );
}

function daysUntil(dueDateStr: string) {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const due = new Date(dueDateStr);
  due.setHours(0, 0, 0, 0);
  return Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Flag "overdue" client-side when status=sent and dueDate has passed. The
 * backend keeps the row as `sent` until a background job flips it; surfacing
 * the visual state now matches the user's mental model ("my invoice IS overdue").
 */
function effectiveStatus(row: { status: InvoiceStatus; dueDate: string }): InvoiceStatus {
  if (row.status === 'sent' && new Date(row.dueDate) < new Date()) return 'overdue';
  return row.status;
}

type Row = { status: InvoiceStatus; dueDate: string; total: number };

/**
 * The pill replaces the status column — a sent invoice reads better as "12d
 * overdue" than as a flat "sent" badge, because the schedule is the thing the
 * user actually acts on. Terminal statuses keep their own label since their
 * due date is no longer meaningful.
 */
function urgencyMeta(row: Row) {
  const status = effectiveStatus(row);

  if (status === 'paid') {
    return { label: 'Paid', pill: 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/20', rail: 'bg-emerald-500', amount: 'text-emerald-600' };
  }
  if (status === 'cancelled') {
    return { label: 'Cancelled', pill: 'bg-gray-100 text-gray-500 ring-1 ring-inset ring-gray-500/20', rail: 'bg-gray-300', amount: 'text-gray-400' };
  }
  if (status === 'draft') {
    return { label: 'Draft', pill: 'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-600/20', rail: 'bg-amber-400', amount: 'text-gray-900' };
  }

  const diff = daysUntil(row.dueDate);
  if (diff < 0) {
    return { label: `${Math.abs(diff)}d overdue`, pill: 'bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-600/20', rail: 'bg-rose-500', amount: 'text-rose-600' };
  }
  if (diff === 0) {
    return { label: 'Due today', pill: 'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-600/20', rail: 'bg-amber-500', amount: 'text-gray-900' };
  }
  if (diff <= 7) {
    return { label: `Due in ${diff}d`, pill: 'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-600/20', rail: 'bg-amber-400', amount: 'text-gray-900' };
  }
  return { label: `Due in ${diff}d`, pill: 'bg-gray-100 text-gray-600 ring-1 ring-inset ring-gray-500/15', rail: 'bg-gray-200', amount: 'text-gray-900' };
}

export default function Invoices() {
  useDisplayCurrency();
  const biz = useBusinessStore((s) => s.activeBusiness);
  const navigate = useNavigate();
  const { blockIfNeeded } = useSubscriptionWriteGate();

  const invoices = useInvoiceStore((s) => s.invoices);
  const pagination = useInvoiceStore((s) => s.pagination);
  const listLoading = useInvoiceStore((s) => s.listLoading);
  const listError = useInvoiceStore((s) => s.listError);
  const fetchInvoices = useInvoiceStore((s) => s.fetchInvoices);
  const downloadInvoicePdf = useInvoiceStore((s) => s.downloadInvoicePdf);

  // Pre-fill search from `?search=` so the command palette can deep-link customers here.
  const [searchParams, setSearchParams] = useSearchParams();
  const initialSearch = searchParams.get('search') ?? '';

  const [page, setPage] = useState(1);
  const [filterStatus, setFilterStatus] = useState<InvoiceStatus | ''>('');
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');
  const [search, setSearch] = useState(initialSearch);
  const [debouncedSearch, setDebouncedSearch] = useState(initialSearch);
  const [showFilters, setShowFilters] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const dateFiltersActive = Boolean(filterStartDate || filterEndDate);
  const activeFilterCount =
    (filterStatus ? 1 : 0) + (debouncedSearch ? 1 : 0) + (dateFiltersActive ? 1 : 0);
  const hasActiveFilters = activeFilterCount > 0;

  // Debounce search so every keystroke doesn't refire the list query
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  // Keep the URL in sync with what the user typed — preserves "share this filter" intent
  // and lets the palette deep-link by writing ?search= without us re-reading the param.
  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    if (debouncedSearch) next.set('search', debouncedSearch);
    else next.delete('search');
    if (next.toString() !== searchParams.toString()) {
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  const currentQuery = useMemo(
    () => ({
      page,
      limit: PAGE_SIZE,
      status: filterStatus || undefined,
      search: debouncedSearch || undefined,
      startDate: filterStartDate || undefined,
      endDate: filterEndDate || undefined,
    }),
    [page, filterStatus, debouncedSearch, filterStartDate, filterEndDate]
  );

  useEffect(() => {
    if (!biz) return;
    fetchInvoices(biz.id, currentQuery);
  }, [biz, currentQuery, fetchInvoices]);

  const clearFilters = () => {
    setFilterStatus('');
    setFilterStartDate('');
    setFilterEndDate('');
    setSearch('');
    setDebouncedSearch('');
    setPage(1);
  };

  const handleDownload = async (id: string, invoiceNumber: string) => {
    if (!biz) return;
    setDownloadingId(id);
    try {
      await downloadInvoicePdf(biz.id, id, invoiceNumber);
      toast.success('Invoice downloaded');
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setDownloadingId(null);
    }
  };

  if (!biz) return <p className="py-20 text-center text-gray-400">Select a business first.</p>;

  return (
    <div className="space-y-5 animate-in fade-in duration-200">
      {/* ── Header ───────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 tracking-tight">Invoices</h1>
          <p className="font-body text-xs sm:text-sm text-gray-500 mt-0.5">
            {pagination ? `${pagination.total} ${pagination.total === 1 ? 'invoice' : 'invoices'}` : 'Loading…'} ·
            marking one paid automatically records the sale
          </p>
        </div>
        <Button onClick={() => {
          if (blockIfNeeded()) return;
          navigate('/invoices/new');
        }} className="self-start shadow-sm">
          <Plus className="h-4 w-4" /> New Invoice
        </Button>
      </div>

      {/* ── Filters ──────────────────────────────────────────────── */}
      <div className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0">
            {STATUS_TABS.map((tab) => {
              const active = filterStatus === tab.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => {
                    setFilterStatus(tab.key);
                    setPage(1);
                  }}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                    active ? 'bg-gray-900 text-white' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
                  }`}
                >
                  {tab.dot && <span className={`h-1.5 w-1.5 rounded-full ${tab.dot}`} />}
                  {tab.label}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2">
            <div className="relative flex-1 sm:w-64 sm:flex-none">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
              <input
                type="search"
                placeholder="Search invoice # or customer…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-lg border border-gray-200 bg-white py-1.5 pl-8 pr-7 text-xs text-gray-900 placeholder:text-gray-400 focus:border-gray-400 focus:ring-1 focus:ring-gray-400 focus:outline-hidden transition-colors"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700"
                  title="Clear search"
                  aria-label="Clear search"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            <button
              onClick={() => setShowFilters((v) => !v)}
              className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition-colors ${
                dateFiltersActive
                  ? 'border-gray-900 bg-gray-900 text-white'
                  : 'border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-gray-900'
              }`}
              title="Filter by date"
              aria-label="Filter by date"
              aria-expanded={showFilters}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
            </button>

            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="shrink-0 text-xs font-medium text-gray-500 hover:text-gray-900 transition-colors"
              >
                Clear
                {activeFilterCount > 1 && <span className="ml-1 tabular-nums">({activeFilterCount})</span>}
              </button>
            )}
          </div>
        </div>

        {showFilters && (
          <div className="grid grid-cols-1 gap-3 rounded-xl border border-gray-200 bg-white p-3.5 sm:grid-cols-2">
            <div>
              <label htmlFor="inv-from" className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                Issued from
              </label>
              <input
                id="inv-from"
                type="date"
                value={filterStartDate}
                onChange={(e) => {
                  setFilterStartDate(e.target.value);
                  setPage(1);
                }}
                className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-900 focus:border-gray-400 focus:outline-hidden"
              />
            </div>
            <div>
              <label htmlFor="inv-to" className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                Issued to
              </label>
              <input
                id="inv-to"
                type="date"
                value={filterEndDate}
                onChange={(e) => {
                  setFilterEndDate(e.target.value);
                  setPage(1);
                }}
                className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-900 focus:border-gray-400 focus:outline-hidden"
              />
            </div>
          </div>
        )}
      </div>

      {/* ── Rows ──────────────────────────────────────────────────── */}
      <div className="overflow-hidden rounded-xl bg-white ring-1 ring-gray-200">
        {listError ? (
          <ErrorState
            message={listError}
            onRetry={() => {
              if (biz) fetchInvoices(biz.id, currentQuery, true);
            }}
            className="border-0 shadow-none"
          />
        ) : listLoading && !invoices.length ? (
          <div className="divide-y divide-gray-100">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex animate-pulse items-center gap-3 px-4 py-3.5">
                <div className="h-9 w-9 shrink-0 rounded-lg bg-gray-100" />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="h-3 w-1/3 rounded bg-gray-100" />
                  <div className="h-2.5 w-1/2 rounded bg-gray-100" />
                </div>
                <div className="h-5 w-20 shrink-0 rounded-full bg-gray-100" />
                <div className="h-3.5 w-24 shrink-0 rounded bg-gray-100" />
              </div>
            ))}
          </div>
        ) : invoices.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl border border-gray-200 bg-gray-50 text-gray-300">
              <FileText className="h-5 w-5" />
            </div>
            <h3 className="text-sm font-semibold text-gray-900">
              {hasActiveFilters ? 'No matching invoices' : 'No invoices yet'}
            </h3>
            <p className="mx-auto mt-1 max-w-xs text-xs leading-relaxed text-gray-500">
              {hasActiveFilters
                ? 'Try a different search term, status or date range.'
                : 'Bill your customers and mark invoices paid to record the sale automatically.'}
            </p>
            {hasActiveFilters ? (
              <button
                onClick={clearFilters}
                className="mt-4 text-xs font-semibold text-primary-600 transition-colors hover:text-primary-800"
              >
                Clear filters
              </button>
            ) : (
              <Button variant="secondary" size="sm" className="mt-4" onClick={() => {
                if (blockIfNeeded()) return;
                navigate('/invoices/new');
              }}>
                <Plus className="h-3.5 w-3.5" /> Create your first invoice
              </Button>
            )}
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {invoices.map((inv) => {
              const urgency = urgencyMeta(inv);
              const downloading = downloadingId === inv.id;

              return (
                <li key={inv.id} className="group relative">
                  {/* ── Desktop row ── */}
                  <div className="hidden items-center gap-3 py-2.5 pl-[15px] pr-3 transition-colors group-hover:bg-gray-50 md:flex">
                    <span className={`absolute left-0 top-0 h-full w-[3px] ${urgency.rail}`} aria-hidden />

                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-xs font-semibold text-gray-500">
                      {getInitials(inv.customerName)}
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold leading-tight text-gray-900">
                        {inv.customerName}
                      </p>
                      <p className="mt-0.5 truncate font-mono text-[11px] leading-tight text-gray-400">
                        {inv.invoiceNumber}
                      </p>
                    </div>

                    <span
                      title={`Issued ${formatDate(inv.issueDate)}`}
                      className={`shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold ${urgency.pill}`}
                    >
                      {urgency.label}
                    </span>

                    <span className="w-20 shrink-0 text-right text-[11px] text-gray-400 tabular-nums">
                      {formatShortDate(inv.dueDate)}
                    </span>

                    <div className="w-32 shrink-0 text-right">
                      <p className={`text-sm font-semibold leading-tight tabular-nums ${urgency.amount}`}>
                        {formatInvoiceMoney(inv, inv.total)}
                      </p>
                      {Number(inv.vatAmount) > 0 && (
                        <p className="mt-0.5 text-[10px] leading-tight text-gray-400">
                          incl. {formatInvoiceMoney(inv, inv.vatAmount)} VAT
                        </p>
                      )}
                    </div>

                    <button
                      onClick={() => handleDownload(inv.id, inv.invoiceNumber)}
                      disabled={downloading}
                      title={`Download ${inv.invoiceNumber}`}
                      aria-label={`Download invoice ${inv.invoiceNumber}`}
                      className="relative z-20 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gray-300 transition-colors hover:bg-gray-100 hover:text-gray-900 disabled:opacity-50"
                    >
                      {downloading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Download className="h-4 w-4" />
                      )}
                    </button>
                  </div>

                  {/* ── Mobile card ── */}
                  <div className="py-3 pl-4 pr-3.5 transition-colors group-hover:bg-gray-50 md:hidden">
                    <span className={`absolute left-0 top-0 h-full w-[3px] ${urgency.rail}`} aria-hidden />
                    <div className="flex items-start gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-xs font-semibold text-gray-500">
                        {getInitials(inv.customerName)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className="truncate text-sm font-semibold text-gray-900">{inv.customerName}</p>
                          <p className={`shrink-0 text-sm font-semibold tabular-nums ${urgency.amount}`}>
                            {formatInvoiceMoney(inv, inv.total)}
                          </p>
                        </div>
                        <div className="mt-1 flex items-center justify-between gap-2">
                          <p className="truncate font-mono text-[11px] text-gray-400">{inv.invoiceNumber}</p>
                          <span
                            title={`Issued ${formatDate(inv.issueDate)}`}
                            className={`shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold ${urgency.pill}`}
                          >
                            {urgency.label}
                          </span>
                        </div>
                        <div className="mt-2 flex items-center justify-between gap-2">
                          <span className="text-[10px] text-gray-400">Due {formatShortDate(inv.dueDate)}</span>
                          <button
                            onClick={() => handleDownload(inv.id, inv.invoiceNumber)}
                            disabled={downloading}
                            aria-label={`Download invoice ${inv.invoiceNumber}`}
                            className="relative z-20 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-900 disabled:opacity-50"
                          >
                            {downloading ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Download className="h-3.5 w-3.5" />
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Full-row hit target, above content but below the download button */}
                  <Link
                    to={`/invoices/${inv.id}`}
                    className="absolute inset-0 z-10 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-500"
                  >
                    <span className="sr-only">View invoice {inv.invoiceNumber}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}

        {pagination && pagination.totalPages > 1 && invoices.length > 0 && (
          <div className="flex items-center justify-between border-t border-gray-100 bg-gray-50/60 px-4 py-2.5 text-xs">
            <span className="text-gray-500">
              {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, pagination.total)} of {pagination.total}
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                subscriptionExempt={true}
                disabled={!pagination.hasPrev}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                aria-label="Previous page"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <span className="tabular-nums text-gray-400">
                {page} / {pagination.totalPages}
              </span>
              <Button
                variant="ghost"
                size="sm"
                subscriptionExempt={true}
                disabled={!pagination.hasNext}
                onClick={() => setPage((p) => p + 1)}
                aria-label="Next page"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}