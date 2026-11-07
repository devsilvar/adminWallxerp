import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Plus,
  Wallet,
  // Trash2 removed — delete buttons disabled per business rule
  Pencil,
  ChevronLeft,
  ChevronRight,
  PieChart,
  AlertTriangle,
  Filter,
  XCircle,
  CalendarDays,
  Download,
} from 'lucide-react';
import Card from '@/components/ui/Card.tsx';
import Button from '@/components/ui/Button.tsx';
import { useSubscriptionWriteGate } from '@/hooks/useSubscriptionWriteGate';
import AddExpenseModal from '@/components/AddExpenseModal.tsx';
import ReportExportModal from '@/components/ReportExportModal.tsx';
import { TableSkeleton } from '@/components/ui/Skeleton.tsx';
import ErrorState from '@/components/ui/ErrorState.tsx';
import EmptyState from '@/components/ui/EmptyState.tsx';
import { useBusinessStore } from '@/stores/business.store.ts';
import api, { getErrorMessage } from '@/lib/axios.ts';
import type { Expense, Pagination } from '@/types/index.ts';
import NoBusinessPrompt from '@/components/NoBusinessPrompt.tsx';
import { formatNaira } from '@/lib/format';
import { useDisplayCurrency } from '@/hooks/useDisplayCurrency';

// Core and system expense categories
const CATEGORIES = [
  'bad_debt',
  'bank_charges',
  'communication',
  'depreciation',
  'fuel',
  'gift',
  'insurance',
  'interest',
  'inventory',
  'logistics',
  'marketing',
  'office_supplies',
  'other',
  'professional_fees',
  'rent',
  'repairs_maintenance',
  'salary',
  'subscription',
  'tax_permit',
  'travel',
  'utility',
] as const;

const CATEGORY_LABELS: Record<string, string> = {
  bad_debt: 'Bad Debt',
  bank_charges: 'Bank Charges',
  office_supplies: 'Office Supplies',
  professional_fees: 'Professional Fees',
  repairs_maintenance: 'Repairs & Maintenance',
  tax_permit: 'Tax/Permit',
};

function formatCategoryLabel(cat: string): string {
  if (CATEGORY_LABELS[cat]) return CATEGORY_LABELS[cat];
  return cat.charAt(0).toUpperCase() + cat.slice(1);
}

// Fixed box order for the daily strip — every category always has a home,
// even at ₦0 (dimmed), so the layout doesn't reshuffle through the day.
const DAILY_CATEGORIES = CATEGORIES;

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ─── Types ──────────────────────────────────────────────────

type CategoryBreakdown = {
  category: string;
  total: number;
  count: number;
};

type ExpenseSummary = {
  month: number;
  year: number;
  totalExpenses: number;
  totalSales: number;
  transactionCount: number;
  categoryBreakdown: CategoryBreakdown[];
  alerts: { type: string; message: string }[];
};

// Shape returned by GET /expenses/daily (expense.service.getDailySummary)
type DailyExpense = {
  id: string;
  amount: string;
  quantity?: number;
  unitPrice?: number | string | null;
  category: string;
  description: string | null;
  expenseDate: string;
  isDeductible: boolean;
};

function renderExpenseAmount(amount: number, quantity?: number, unitPrice?: number | string | null) {
  const qty = Number(quantity ?? 1);
  if (qty > 1 && unitPrice) {
    return (
      <div className="text-right inline-block">
        <div className="font-semibold text-gray-900">{formatNaira(amount)}</div>
        <div className="text-[11px] text-gray-500 font-normal">
          {qty} × {formatNaira(Number(unitPrice))}
        </div>
      </div>
    );
  }
  return <span>{formatNaira(amount)}</span>;
}

type DailyExpenseSummary = {
  date: string;
  totalExpenses: number;
  totalSales: number;
  transactionCount: number;
  categoryBreakdown: CategoryBreakdown[];
  alerts: { type: string; message: string }[];
  transactions: DailyExpense[];
};

// ─── Category color map ─────────────────────────────────────

const CATEGORY_COLORS: Record<string, string> = {
  bad_debt: 'bg-rose-500',
  bank_charges: 'bg-blue-600',
  communication: 'bg-sky-500',
  depreciation: 'bg-slate-500',
  fuel: 'bg-orange-500',
  gift: 'bg-fuchsia-500',
  insurance: 'bg-indigo-500',
  interest: 'bg-blue-700',
  inventory: 'bg-emerald-500',
  logistics: 'bg-cyan-500',
  marketing: 'bg-pink-500',
  office_supplies: 'bg-teal-500',
  other: 'bg-gray-400',
  professional_fees: 'bg-violet-500',
  rent: 'bg-blue-500',
  repairs_maintenance: 'bg-yellow-600',
  salary: 'bg-purple-500',
  subscription: 'bg-cyan-600',
  tax_permit: 'bg-red-600',
  travel: 'bg-lime-600',
  utility: 'bg-amber-500',
};

// ─── Component ──────────────────────────────────────────────

export default function Expenses() {
  useDisplayCurrency();
  const { writesBlocked, blockIfNeeded } = useSubscriptionWriteGate();
  const biz = useBusinessStore((s) => s.activeBusiness);
  const fetchExpensesSeqRef = useRef(0);
  const fetchSummarySeqRef = useRef(0);
  const fetchDailySeqRef = useRef(0);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [page, setPage] = useState(1);
  const [filterCat, setFilterCat] = useState('');
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [editExpense, setEditExpense] = useState<Expense | null>(null);

  // Summary state
  const now = new Date();
  const [summaryMonth, setSummaryMonth] = useState(now.getMonth() + 1);
  const [summaryYear, setSummaryYear] = useState(now.getFullYear());
  const [summary, setSummary] = useState<ExpenseSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);

  // ─── Daily view state (default tab) ─────────────────────────
  const todayStr = now.toISOString().slice(0, 10);
  const [dailyDate, setDailyDate] = useState(todayStr);
  const [daily, setDaily] = useState<DailyExpenseSummary | null>(null);
  const [dailyLoading, setDailyLoading] = useState(false);

  const basePath = biz ? `/businesses/${biz.id}/expenses` : '';

  const hasActiveFilters = !!(filterCat || filterStartDate || filterEndDate);

  const clearFilters = () => {
    setFilterCat(''); setFilterStartDate(''); setFilterEndDate('');
    setPage(1);
  };

  const fetchExpenses = () => {
    if (!biz) return;
    const seq = ++fetchExpensesSeqRef.current;
    setIsLoading(true);
    setError(null);
    const params: Record<string, string | number> = { page, limit: 15 };
    if (filterCat) params.category = filterCat;
    if (filterStartDate) params.startDate = filterStartDate;
    if (filterEndDate) params.endDate = filterEndDate;
    api.get(basePath, { params })
      .then((r) => {
        if (seq !== fetchExpensesSeqRef.current) return;
        setExpenses(r.data.data);
        setPagination(r.data.pagination);
      })
      .catch((e) => {
        if (seq !== fetchExpensesSeqRef.current) return;
        setError(getErrorMessage(e, 'Failed to load expenses.'));
      })
      .finally(() => {
        if (seq === fetchExpensesSeqRef.current) setIsLoading(false);
      });
  };

  const fetchSummary = () => {
    if (!biz) return;
    const seq = ++fetchSummarySeqRef.current;
    setSummaryLoading(true);
    api.get(`${basePath}/summary`, { params: { month: summaryMonth, year: summaryYear } })
      .then((r) => {
        if (seq !== fetchSummarySeqRef.current) return;
        setSummary(r.data.data);
      })
      .catch(() => {
        if (seq !== fetchSummarySeqRef.current) return;
        setSummary(null);
      })
      .finally(() => {
        if (seq === fetchSummarySeqRef.current) setSummaryLoading(false);
      });
  };

  useEffect(() => { fetchExpenses(); }, [biz, page, filterCat, filterStartDate, filterEndDate]);
  useEffect(() => { fetchSummary(); }, [biz, summaryMonth, summaryYear]);

  // ─── Daily tab (default) — URL-backed like TaxReports ?tab=analytics ──
  const [searchParams, setSearchParams] = useSearchParams();
  const tab: 'daily' | 'monthly' =
    searchParams.get('tab') === 'monthly' ? 'monthly' : 'daily';
  const setTab = (t: 'daily' | 'monthly') =>
    setSearchParams(t === 'monthly' ? { tab: 'monthly' } : {}, { replace: true });

  const fetchDaily = () => {
    if (!biz) return;
    const seq = ++fetchDailySeqRef.current;
    setDailyLoading(true);
    api
      .get(`${basePath}/daily`, { params: { date: dailyDate } })
      .then((r) => {
        if (seq !== fetchDailySeqRef.current) return;
        setDaily(r.data.data);
      })
      .catch(() => {
        if (seq !== fetchDailySeqRef.current) return;
        setDaily(null);
      })
      .finally(() => {
        if (seq === fetchDailySeqRef.current) setDailyLoading(false);
      });
  };

  useEffect(() => { fetchDaily(); }, [biz, dailyDate]);

  // Keep "today's" boxes live while the daily tab is open (60s cadence).
  useEffect(() => {
    if (tab !== 'daily' || dailyDate !== todayStr || !biz) return;
    const t = setInterval(fetchDaily, 60_000);
    return () => clearInterval(t);
  }, [tab, dailyDate, biz]);

  const shiftDay = (delta: number) => {
    const d = new Date(`${dailyDate}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + delta);
    setDailyDate(d.toISOString().slice(0, 10));
  };

  const openEdit = (exp: Expense) => {
    setEditExpense(exp);
    setShowAddModal(true);
  };

  const handleSaveComplete = (outcome: 'created' | 'updated') => {
    // A new expense must be visible on page 1; an edit stays on the current page.
    if (outcome === 'created') setPage(1);
    fetchExpenses();
    fetchSummary();
    fetchDaily();
  };

  // handleDelete disabled — expense entries are permanent per business rule
  // const handleDelete = async (id: string) => {
  //   if (!confirm('Delete this expense?')) return;
  //   try {
  //     await api.delete(`${basePath}/${id}`);
  //     toast.success('Expense deleted');
  //     invalidateDashboard('expense_deleted');
  //     fetchExpenses();
  //     fetchSummary();
  //     fetchDaily();
  //   } catch (err: unknown) {
  //     const apiErr = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error;
  //     toast.error(apiErr?.message || 'Failed');
  //   }
  // };

  // Month navigation
  const prevMonth = () => {
    if (summaryMonth === 1) { setSummaryMonth(12); setSummaryYear(summaryYear - 1); }
    else setSummaryMonth(summaryMonth - 1);
  };
  const nextMonth = () => {
    if (summaryMonth === 12) { setSummaryMonth(1); setSummaryYear(summaryYear + 1); }
    else setSummaryMonth(summaryMonth + 1);
  };
  const monthLabel = new Date(summaryYear, summaryMonth - 1).toLocaleDateString('en-NG', { month: 'long', year: 'numeric' });

  if (!biz) return <NoBusinessPrompt />;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Expenses</h1>
          <p className="mt-1 font-body text-sm text-gray-500">Track your business expenses.</p>
        </div>
        <div className="flex flex-wrap gap-2 self-start sm:self-auto">
          <Button variant="secondary" subscriptionExempt={true} onClick={() => setShowReportModal(true)}>
            <Download className="h-4 w-4" /> PDF Report
          </Button>
          <Button onClick={() => { setEditExpense(null); setShowAddModal(true); }}>
            <Plus className="h-4 w-4" /> Add Expense
          </Button>
        </div>
      </div>

      {/* Daily / Monthly tabs — default is Daily (no URL param) */}
      <div className="flex w-fit gap-1 rounded-lg bg-gray-100 p-1">
        {(['daily', 'monthly'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-md px-4 py-1.5 text-sm font-medium capitalize transition-colors ${
              tab === t
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'monthly' && (
        <>
      {/* Monthly Summary */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <PieChart className="h-5 w-5 text-warning-500" />
            Monthly Summary
          </h2>
          <div className="flex items-center gap-2">
            <button onClick={prevMonth} className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="min-w-[140px] text-center text-sm font-medium text-gray-700">{monthLabel}</span>
            <button onClick={nextMonth} className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        {summaryLoading ? (
          <div className="py-6 text-center text-sm text-gray-400">Loading summary...</div>
        ) : !summary || summary.transactionCount === 0 ? (
          <div className="py-6 text-center">
            <Wallet className="mx-auto h-8 w-8 text-gray-300" />
            <p className="mt-2 font-body text-sm text-gray-400">No expenses for {monthLabel}.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Totals row */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-lg bg-red-50 px-4 py-3">
                <p className="font-body text-xs text-red-600 uppercase tracking-wider">Total Expenses</p>
                <p className="mt-1 text-xl font-bold text-red-700">{formatNaira(summary.totalExpenses)}</p>
              </div>
              <div className="rounded-lg bg-green-50 px-4 py-3">
                <p className="font-body text-xs text-green-600 uppercase tracking-wider">Total Sales</p>
                <p className="mt-1 text-xl font-bold text-green-700">{formatNaira(summary.totalSales)}</p>
              </div>
              <div className="rounded-lg bg-gray-50 px-4 py-3">
                <p className="font-body text-xs text-gray-500 uppercase tracking-wider">Entries</p>
                <p className="mt-1 text-xl font-bold text-gray-700">{summary.transactionCount}</p>
              </div>
            </div>

            {/* Expense intelligence alerts */}
            {summary.alerts.length > 0 && (
              <div className="space-y-2">
                {summary.alerts.map((alert, i) => (
                  <div key={i} className="flex items-start gap-3 rounded-lg border border-warning-200 bg-warning-50 px-4 py-3">
                    <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-warning-600" />
                    <p className="font-body text-sm text-warning-700">{alert.message}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Category breakdown */}
            {summary.categoryBreakdown.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-medium text-gray-500 uppercase tracking-wider">By Category</p>
                {/* Stacked bar */}
                <div className="flex h-3 overflow-hidden rounded-full bg-gray-100">
                  {summary.categoryBreakdown.map((cb) => {
                    const pct = summary.totalExpenses > 0
                      ? (Number(cb.total) / summary.totalExpenses) * 100
                      : 0;
                    return (
                      <div
                        key={cb.category}
                        className={`${CATEGORY_COLORS[cb.category] || 'bg-gray-400'} transition-all`}
                        style={{ width: `${pct}%` }}
                        title={`${cb.category}: ${formatNaira(Number(cb.total))} (${pct.toFixed(1)}%)`}
                      />
                    );
                  })}
                </div>
                {/* Legend */}
                <div className="mt-3 grid grid-cols-1 gap-y-2 sm:grid-cols-2 sm:gap-x-6 lg:grid-cols-3">
                  {summary.categoryBreakdown.map((cb) => (
                    <div key={cb.category} className="flex items-center gap-2">
                      <span className={`h-2.5 w-2.5 rounded-full ${CATEGORY_COLORS[cb.category] || 'bg-gray-400'}`} />
                      <span className="font-body text-sm text-gray-600">{formatCategoryLabel(cb.category)}</span>
                      <span className="ml-auto font-body text-sm font-medium text-gray-700">{formatNaira(Number(cb.total))}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Filters */}
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
              hasActiveFilters
                ? 'border-primary-300 bg-primary-50 text-primary-700'
                : 'border-gray-300 text-gray-600 hover:bg-gray-50'
            }`}
          >
            <Filter className="h-4 w-4" />
            Filters
            {hasActiveFilters && (
              <span className="ml-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary-600 text-xs text-white">
                {[filterCat, filterStartDate, filterEndDate].filter(Boolean).length}
              </span>
            )}
          </button>
          {hasActiveFilters && (
            <button onClick={clearFilters} className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
              <XCircle className="h-4 w-4" /> Clear all
            </button>
          )}
          {pagination && <span className="ml-auto font-body text-xs text-gray-400">{pagination.total} total</span>}
        </div>

        {showFilters && (
          <Card className="py-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="space-y-1">
                <label className="block text-xs font-medium text-gray-500">Category</label>
                <select value={filterCat} onChange={(e) => { setFilterCat(e.target.value); setPage(1); }} className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
                  <option value="">All Categories</option>
                  {CATEGORIES.map((c) => <option key={c} value={c}>{formatCategoryLabel(c)}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className="block text-xs font-medium text-gray-500">From</label>
                <input type="date" value={filterStartDate} onChange={(e) => { setFilterStartDate(e.target.value); setPage(1); }} className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
              </div>
              <div className="space-y-1">
                <label className="block text-xs font-medium text-gray-500">To</label>
                <input type="date" value={filterEndDate} onChange={(e) => { setFilterEndDate(e.target.value); setPage(1); }} className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
              </div>
            </div>
          </Card>
        )}
      </div>

      {/* Table */}
      {error && <ErrorState message={error} onRetry={fetchExpenses} />}

      {!error && isLoading && <TableSkeleton rows={6} columns={6} />}

      {!error && !isLoading && expenses.length === 0 && (
        <EmptyState icon={Wallet} message="No expenses found." />
      )}

      {!error && !isLoading && expenses.length > 0 && (
        <>
          {/* Desktop table */}
          <div className="hidden md:block rounded-md border border-gray-200 bg-white shadow-sm overflow-x-auto">
            <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 text-left text-xs font-medium uppercase tracking-wider text-gray-400">
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Description</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3 text-right">Amount</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="font-body text-sm">
              {expenses.map((exp) => (
                <tr key={exp.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-600">{formatDate(exp.expenseDate)}</td>
                  <td className="px-4 py-3 text-gray-700">{exp.description || '—'}</td>
                  <td className="px-4 py-3 text-gray-600">
                    {formatCategoryLabel(exp.category)}
                    {exp.categoryDetail && (
                      <div className="text-xs font-normal normal-case text-gray-400">{exp.categoryDetail}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-900">
                    <div className="flex items-center justify-end gap-2">
                      {renderExpenseAmount(Number(exp.amount), exp.quantity, exp.unitPrice)}
                      {!exp.isDeductible && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800">
                          Non-deductible
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {exp.linkedCreditId ? (
                      <span className="inline-flex items-center text-[10px] font-semibold text-rose-600 bg-rose-50 px-2 py-0.5 border border-rose-200">
                        Auto · CITA §25
                      </span>
                    ) : (
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => {
                            if (blockIfNeeded()) return;
                            openEdit(exp);
                          }}
                          disabled={writesBlocked}
                          className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
                          title={writesBlocked ? 'Upgrade your plan to enable this action' : 'Edit expense'}
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        {/* <button onClick={() => handleDelete(exp.id)} className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500"><Trash2 className="h-4 w-4" /></button> */}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>

        {/* Mobile card list */}
        <div className="md:hidden space-y-3">
          {expenses.map((exp) => (
            <Card key={exp.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="font-semibold text-gray-900">
                      {formatNaira(Number(exp.amount))}
                      {Number(exp.quantity ?? 1) > 1 && exp.unitPrice && (
                        <span className="ml-1 text-xs text-gray-500 font-normal">
                          ({exp.quantity} × {formatNaira(Number(exp.unitPrice))})
                        </span>
                      )}
                    </div>
                    <span className="inline-block rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">{formatCategoryLabel(exp.category)}</span>
                  </div>
                  <p className="mt-1 text-sm text-gray-600 truncate">{exp.description || '—'}</p>
                  {exp.categoryDetail && (
                    <p className="mt-0.5 text-xs text-gray-400 truncate">{exp.categoryDetail}</p>
                  )}
                  <p className="mt-1 text-xs text-gray-400">{formatDate(exp.expenseDate)}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {exp.linkedCreditId ? (
                    <span className="inline-flex items-center text-[10px] font-semibold text-rose-600 bg-rose-50 px-2 py-0.5 border border-rose-200">
                      Auto · CITA §25
                    </span>
                  ) : (
                    <button
                      onClick={() => {
                        if (blockIfNeeded()) return;
                        openEdit(exp);
                      }}
                      disabled={writesBlocked}
                      className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
                      title={writesBlocked ? 'Upgrade your plan to enable this action' : 'Edit expense'}
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    /* <button onClick={() => handleDelete(exp.id)} className="rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-500"><Trash2 className="h-4 w-4" /></button> */
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
        </>
      )}

      {/* Pagination */}
      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="font-body text-xs text-gray-400">Page {pagination.page} of {pagination.totalPages}</span>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" disabled={!pagination.hasPrev} onClick={() => setPage(page - 1)}><ChevronLeft className="h-4 w-4" /></Button>
            <Button variant="secondary" size="sm" disabled={!pagination.hasNext} onClick={() => setPage(page + 1)}><ChevronRight className="h-4 w-4" /></Button>
          </div>
        </div>
      )}
      </>
      )}

      {tab === 'daily' && (
        <Card>
          {/* Date navigation */}
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900">
              <CalendarDays className="h-5 w-5 text-warning-500" />
              Daily Summary
            </h2>
            <div className="flex items-center gap-1">
              <button
                onClick={() => shiftDay(-1)}
                className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                aria-label="Previous day"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <input
                type="date"
                value={dailyDate}
                max={todayStr}
                onChange={(e) => setDailyDate(e.target.value)}
                className="rounded-lg border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
              <button
                onClick={() => shiftDay(1)}
                disabled={dailyDate >= todayStr}
                className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="Next day"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
              {dailyDate !== todayStr && (
                <button
                  onClick={() => setDailyDate(todayStr)}
                  className="ml-1 rounded-lg px-2 py-1 text-xs font-medium text-primary-600 hover:bg-primary-50"
                >
                  Today
                </button>
              )}
            </div>
          </div>

          {dailyLoading && !daily ? (
            <div className="py-6 text-center text-sm text-gray-400">Loading daily summary...</div>
          ) : !daily ? (
            <div className="py-6 text-center text-sm text-gray-400">Could not load daily summary.</div>
          ) : (
            <div className="space-y-4">
              {/* Boxes strip — Total Today + one box per category.
                  ₦0 categories stay visible (dimmed) so the layout is stable. */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                <div className="col-span-2 rounded-lg bg-red-50 px-4 py-3 sm:col-span-3 lg:col-span-1">
                  <p className="font-body text-xs uppercase tracking-wider text-red-600">
                    Total {daily.date === todayStr ? 'Today' : ''}
                  </p>
                  <p className="mt-1 text-lg font-bold text-red-700 sm:text-xl">
                    {formatNaira(Number(daily.totalExpenses))}
                  </p>
                </div>
                {DAILY_CATEGORIES.map((cat) => {
                  const entry = daily.categoryBreakdown.find((cb) => cb.category === cat);
                  const total = Number(entry?.total ?? 0);
                  const count = entry?.count ?? 0;
                  const dim = total === 0;
                  return (
                    <div
                      key={cat}
                      className={`rounded-lg bg-gray-50 px-4 py-3 ${dim ? 'opacity-60' : ''}`}
                      title={`${formatCategoryLabel(cat)} — ${count} entr${count === 1 ? 'y' : 'ies'}`}
                    >
                      <p className="truncate font-body text-xs uppercase tracking-wider text-gray-500">
                        {formatCategoryLabel(cat)}
                      </p>
                      <p className={`mt-1 text-base font-bold sm:text-lg ${dim ? 'text-gray-400' : 'text-gray-800'}`}>
                        {formatNaira(total)}
                      </p>
                      <p className="text-xs text-gray-400">
                        {count} entr{count === 1 ? 'y' : 'ies'}
                      </p>
                    </div>
                  );
                })}
              </div>

              {/* Daily intelligence alerts — same rule as monthly */}
              {daily.alerts.length > 0 && (
                <div className="space-y-2">
                  {daily.alerts.map((alert, i) => (
                    <div key={i} className="flex items-start gap-3 rounded-lg border border-warning-200 bg-warning-50 px-4 py-3">
                      <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-warning-600" />
                      <p className="font-body text-sm text-warning-700">{alert.message}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Register — the day's entries, any deductibility */}
              {daily.transactions.length === 0 ? (
                <div className="py-6 text-center">
                  <Wallet className="mx-auto h-8 w-8 text-gray-300" />
                  <p className="mt-2 font-body text-sm text-gray-400">No expenses recorded for this day.</p>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-md border border-gray-200">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-100 text-left text-xs font-medium uppercase tracking-wider text-gray-400">
                        <th className="px-4 py-3">Date</th>
                        <th className="px-4 py-3">Description</th>
                        <th className="px-4 py-3">Category</th>
                        <th className="px-4 py-3">Tax</th>
                        <th className="px-4 py-3 text-right">Amount</th>
                        <th className="px-4 py-3"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {daily.transactions.map((t) => (
                        <tr key={t.id} className="text-sm text-gray-700 hover:bg-gray-50">
                          <td className="whitespace-nowrap px-4 py-3">{formatDate(t.expenseDate)}</td>
                          <td className="max-w-[200px] truncate px-4 py-3">{t.description || '—'}</td>
                          <td className="whitespace-nowrap px-4 py-3">
                            <span className={`inline-flex h-2.5 w-2.5 rounded-full ${CATEGORY_COLORS[t.category] || 'bg-gray-400'}`} />
                            <span className="ml-2 capitalize">{t.category}</span>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3">
                            {t.isDeductible ? (
                              <span className="text-xs font-medium text-green-600">Deductible</span>
                            ) : (
                              <span className="text-xs text-gray-400">Exempt</span>
                            )}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-right font-medium">
                            {renderExpenseAmount(Number(t.amount), t.quantity, t.unitPrice)}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => {
                                  if (blockIfNeeded()) return;
                                  openEdit(t as unknown as Expense);
                                }}
                                disabled={writesBlocked}
                                className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
                                title={writesBlocked ? 'Upgrade your plan to enable this action' : 'Edit Expense'}
                              >
                                <Pencil className="h-4 w-4" />
                              </button>
                              {/* Delete button disabled — expense entries are permanent
                              <button
                                onClick={() => handleDelete(t.id)}
                                className="rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-500"
                                title="Delete Expense"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                              */}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </Card>
      )}

      {/* Add/Edit Expense modal — mounted once per page, state resets on open */}
      {biz && (
        <AddExpenseModal
          isOpen={showAddModal}
          businessId={biz.id}
          editExpense={editExpense}
          onClose={() => setShowAddModal(false)}
          onSaved={handleSaveComplete}
        />
      )}

      {/* Expense PDF Report Export Modal */}
      {biz && (
        <ReportExportModal
          isOpen={showReportModal}
          onClose={() => setShowReportModal(false)}
          type="expense"
          businessId={biz.id}
          businessName={biz.businessName}
        />
      )}
    </div>
  );
}
