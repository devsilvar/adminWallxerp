import { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import {
  Plus,
  Search,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  MessageCircle,
  Mail,
  Loader2,
  CreditCard,
  RefreshCw,
  X,
  AlertCircle,
} from 'lucide-react';
import toast from 'react-hot-toast';
import Card from '@/components/ui/Card.tsx';
import Button from '@/components/ui/Button.tsx';
import ErrorState from '@/components/ui/ErrorState.tsx';
import { useBusinessStore } from '@/stores/business.store.ts';
import { useCreditStore } from '@/stores/credit.store.ts';
import type { CustomerCredit, CreditStatus } from '@/types/index.ts';
import { getErrorMessage } from '@/lib/axios.ts';
import { useSubscriptionWriteGate } from '@/hooks/useSubscriptionWriteGate';
import { useSubscriptionStatus } from '@/hooks/useSubscriptionStatus';
import { getPlanLimits } from '@/config/subscription';

import CreateCreditModal from '@/components/debtors/CreateCreditModal.tsx';
import RecordCreditPaymentModal from '@/components/debtors/RecordCreditPaymentModal.tsx';
import LinkDvaCreditModal from '@/components/debtors/LinkDvaCreditModal.tsx';
import WriteOffModal from '@/components/debtors/WriteOffModal.tsx';
import { formatNaira } from '@/lib/format';
import { useDisplayCurrency } from '@/hooks/useDisplayCurrency';

const PAGE_SIZE = 15;

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' });
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
 * Urgency replaces status as the row's primary signal. `rail` drives the 3px
 * left edge, `pill` the compact badge — a settled or written-off account
 * short-circuits the day math since the schedule is no longer meaningful.
 */
function urgencyMeta(dueDateStr: string, status: CreditStatus) {
  if (status === 'paid') {
    return { label: 'Settled', pill: 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/20', rail: 'bg-emerald-500' };
  }
  if (status === 'written_off') {
    return { label: 'Written off', pill: 'bg-gray-100 text-gray-500 ring-1 ring-inset ring-gray-500/20', rail: 'bg-gray-300' };
  }

  const diffDays = daysUntil(dueDateStr);
  if (diffDays < 0) {
    return {
      label: `${Math.abs(diffDays)}d overdue`,
      pill: 'bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-600/20',
      rail: 'bg-rose-500',
    };
  }
  if (diffDays === 0) {
    return { label: 'Due today', pill: 'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-600/20', rail: 'bg-amber-500' };
  }
  if (diffDays <= 7) {
    return { label: `Due in ${diffDays}d`, pill: 'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-600/20', rail: 'bg-amber-400' };
  }
  return { label: `Due in ${diffDays}d`, pill: 'bg-gray-100 text-gray-600 ring-1 ring-inset ring-gray-500/15', rail: 'bg-gray-200' };
}

function progressColor(status: CreditStatus) {
  if (status === 'paid') return 'bg-emerald-500';
  if (status === 'written_off') return 'bg-gray-300';
  if (status === 'overdue') return 'bg-rose-500';
  return 'bg-gray-900';
}

function amountColor(status: CreditStatus) {
  if (status === 'paid') return 'text-emerald-600';
  if (status === 'written_off') return 'text-gray-400';
  if (status === 'overdue') return 'text-rose-600';
  return 'text-gray-900';
}

function isOpen(status: CreditStatus) {
  return status !== 'paid' && status !== 'written_off';
}

const STATUS_TABS = [
  { key: '', label: 'All' },
  { key: 'unpaid', label: 'Unpaid', dot: 'bg-amber-500' },
  { key: 'partially_paid', label: 'Part paid', dot: 'bg-blue-500' },
  { key: 'overdue', label: 'Overdue', dot: 'bg-rose-500' },
  { key: 'paid', label: 'Settled', dot: 'bg-emerald-500' },
  { key: 'written_off', label: 'Written off', dot: 'bg-gray-400' },
];

export default function Debtors() {
  useDisplayCurrency();
  const biz = useBusinessStore((s) => s.activeBusiness);
  const credits = useCreditStore((s) => s.credits);
  const summary = useCreditStore((s) => s.summary);
  const pagination = useCreditStore((s) => s.pagination);
  const listLoading = useCreditStore((s) => s.listLoading);
  const listError = useCreditStore((s) => s.listError);
  const fetchCredits = useCreditStore((s) => s.fetchCredits);
  const fetchSummary = useCreditStore((s) => s.fetchSummary);
  const sendWhatsApp = useCreditStore((s) => s.sendWhatsApp);
  const sendDebtorEmail = useCreditStore((s) => s.sendDebtorEmail);

  const [searchParams] = useSearchParams();
  const initialStatus = (searchParams.get('status') as CreditStatus) || '';
  const initialNew = searchParams.get('new') === 'true';

  const [statusFilter, setStatusFilter] = useState<CreditStatus | ''>(initialStatus);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [sendingEmailId, setSendingEmailId] = useState<string | null>(null);
  const { blockIfNeeded, writesBlocked } = useSubscriptionWriteGate();
  const subStatus = useSubscriptionStatus();
  const planLimits = getPlanLimits(subStatus.tier);
  const isBnplAllowed = planLimits.bnplCredits;

  const [createModalOpen, setCreateModalOpen] = useState(initialNew);
  const [paymentModalCredit, setPaymentModalCredit] = useState<CustomerCredit | null>(null);
  const [dvaModalCredit, setDvaModalCredit] = useState<CustomerCredit | null>(null);
  const [writeOffModalCredit, setWriteOffModalCredit] = useState<CustomerCredit | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const query = {
    page,
    limit: PAGE_SIZE,
    status: statusFilter || undefined,
    search: debouncedSearch || undefined,
  };

  const loadCredits = () => {
    if (!biz) return;
    fetchCredits(biz.id, query);
    fetchSummary(biz.id);
  };

  useEffect(() => {
    loadCredits();
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [biz, page, statusFilter, debouncedSearch, fetchCredits, fetchSummary]);

  const handleWhatsAppClick = async (credit: CustomerCredit) => {
    if (!biz) return;
    if (!credit.customerPhone) {
      toast.error(`No phone number recorded for ${credit.customerName}`);
      return;
    }
    try {
      const meta = await sendWhatsApp(biz.id, credit.id);
      if (meta?.waUrl) {
        window.open(meta.waUrl, '_blank', 'noopener,noreferrer');
        toast.success(`WhatsApp reminder opened for ${credit.customerName}`);
      }
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  const handleSendDebtorEmail = async (credit: CustomerCredit) => {
    if (blockIfNeeded()) return;
    if (!credit.customerEmail) {
      toast.error('Add an email address to send debt information');
      return;
    }
    if (!biz) return;
    setSendingEmailId(credit.id);
    try {
      const r = await sendDebtorEmail(biz.id, credit.id);
      toast.success(
        r.delivered
          ? `Debt information sent to ${r.to} — includes your wallet account for direct transfer`
          : `Debt email queued (dev mode) for ${r.to}`
      );
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setSendingEmailId(null);
    }
  };

  const handleRefresh = async () => {
    if (!biz) return;
    setIsRefreshing(true);
    try {
      await Promise.all([fetchCredits(biz.id, query), fetchSummary(biz.id)]);
      toast.success('Debtors book refreshed');
    } catch {
      toast.error('Failed to refresh debtors book');
    } finally {
      setIsRefreshing(false);
    }
  };

  if (!biz) {
    return <div className="py-20 text-center text-gray-400">Select a business first.</div>;
  }

  const recovered = summary?.recoveredThisMonth ?? 0;
  const outstanding = summary?.totalOutstanding ?? 0;
  const overdue = summary?.overdueAmount ?? 0;
  const totalBook = recovered + outstanding;
  const recoveryRate = totalBook > 0 ? Math.round((recovered / totalBook) * 100) : 0;
  const overduePct = outstanding > 0 ? Math.round((overdue / outstanding) * 100) : 0;

  const hasFilters = Boolean(search || statusFilter);

  return (
    <div className="space-y-5 animate-in fade-in duration-200">
      {/* ── Header ───────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 tracking-tight">Debtors</h1>
          <p className="font-body text-xs sm:text-sm text-gray-500 mt-0.5">
            {summary?.activeDebtors || 0} active {summary?.activeDebtors === 1 ? 'account' : 'accounts'} · send reminders and
            track recovery
          </p>
        </div>
        <div className="flex items-center gap-2 self-start">
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-400 hover:text-gray-900 hover:bg-gray-100 transition-colors disabled:opacity-50"
            title="Refresh records"
            aria-label="Refresh records"
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>
          <Button
            onClick={() => {
              if (!isBnplAllowed) {
                toast.error('Customer Credit (BNPL) is available on Business Plan and above. Please upgrade.');
                return;
              }
              if (blockIfNeeded()) return;
              setCreateModalOpen(true);
            }}
            disabled={!isBnplAllowed}
            className="shadow-sm disabled:opacity-50"
            title={!isBnplAllowed ? 'Customer Credit (BNPL) requires Business Plan or above — upgrade to issue new credits' : undefined}
          >
            <Plus className="h-4 w-4" /> Record Debt
          </Button>
        </div>
      </div>

      {/* ── Over-limit / Feature Downgrade Banner ── */}
      {!isBnplAllowed && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-xs text-amber-900">
          <div className="flex items-start gap-2.5">
            <AlertCircle className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
            <div>
              <span className="font-semibold block">Customer Credit (BNPL) is Business+</span>
              <p className="text-amber-800 mt-0.5">
                Your {summary?.activeDebtors || credits.length || 0} existing credit{(summary?.activeDebtors === 1 || credits.length === 1) ? '' : 's'} remain visible; new credits are blocked on your current plan. Upgrade to resume creating credits.
              </p>
            </div>
          </div>
          <Link
            to="/subscription"
            className="inline-flex shrink-0 items-center rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 transition-colors"
          >
            Upgrade Plan
          </Link>
        </div>
      )}

      {/* ── Portfolio Strip ──────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-gray-200 rounded-xl overflow-hidden ring-1 ring-gray-200">
        <div className="bg-white p-3.5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Outstanding</p>
          <p className="text-lg sm:text-xl font-bold text-gray-900 tabular-nums mt-1">{formatNaira(outstanding)}</p>
        </div>
        <div className="bg-white p-3.5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-rose-500">Overdue</p>
          <p className="text-lg sm:text-xl font-bold text-rose-600 tabular-nums mt-1">{formatNaira(overdue)}</p>
          <p className="text-[10px] text-gray-400 mt-0.5">{overduePct}% of book</p>
        </div>
        <div className="bg-white p-3.5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-600">Recovered</p>
          <p className="text-lg sm:text-xl font-bold text-emerald-600 tabular-nums mt-1">{formatNaira(recovered)}</p>
          <p className="text-[10px] text-gray-400 mt-0.5">this month</p>
        </div>
        <div className="bg-white p-3.5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Recovery rate</p>
          <div className="flex items-baseline gap-1.5 mt-1">
            <p className="text-lg sm:text-xl font-bold text-gray-900 tabular-nums">{recoveryRate}%</p>
          </div>
          <div className="h-1 w-full bg-gray-100 rounded-full overflow-hidden mt-2">
            <div
              className="h-full bg-gray-900 rounded-full transition-all duration-500"
              style={{ width: `${Math.min(100, Math.max(0, recoveryRate))}%` }}
            />
          </div>
        </div>
      </div>

      {/* ── Filters ──────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0">
          {STATUS_TABS.map((tab) => {
            const active = statusFilter === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => {
                  setStatusFilter(tab.key as CreditStatus | '');
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

        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
          <input
            type="text"
            placeholder="Search name, phone, guarantor…"
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
      </div>

      {/* ── Debtor Rows ──────────────────────────────────────────── */}
      <Card noPadding className="overflow-hidden ring-1 ring-gray-200">
        {listError ? (
          <ErrorState message={listError} onRetry={loadCredits} className="border-0 shadow-none" />
        ) : listLoading ? (
          <div className="divide-y divide-gray-100">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3.5 animate-pulse">
                <div className="h-9 w-9 rounded-lg bg-gray-100 shrink-0" />
                <div className="flex-1 space-y-1.5 min-w-0">
                  <div className="h-3 bg-gray-100 rounded w-1/3" />
                  <div className="h-2.5 bg-gray-100 rounded w-1/2" />
                </div>
                <div className="h-5 w-16 rounded-full bg-gray-100 shrink-0" />
                <div className="h-3.5 w-24 rounded bg-gray-100 shrink-0" />
              </div>
            ))}
          </div>
        ) : credits.length === 0 ? (
          <div className="py-16 px-6 text-center">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gray-50 text-gray-300 border border-gray-200 mx-auto mb-3">
              <BookOpen className="h-5 w-5" />
            </div>
            <h3 className="text-sm font-semibold text-gray-900">
              {hasFilters ? 'No matching debtors' : 'No debts recorded'}
            </h3>
            <p className="text-xs text-gray-500 max-w-xs mx-auto mt-1 leading-relaxed">
              {hasFilters
                ? 'Try a different search term or status filter.'
                : 'Track who owes your business money, remind them on WhatsApp, and recognise the sale when they pay.'}
            </p>
            {hasFilters ? (
              <button
                onClick={() => {
                  setSearch('');
                  setStatusFilter('');
                }}
                className="mt-4 text-xs font-semibold text-primary-600 hover:text-primary-800 transition-colors"
              >
                Clear filters
              </button>
            ) : (
              <Button onClick={() => {
                if (blockIfNeeded()) return;
                setCreateModalOpen(true);
              }} size="sm" className="mt-4">
                <Plus className="h-3.5 w-3.5" /> Record first debt
              </Button>
            )}
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {credits.map((c) => {
              const urgency = urgencyMeta(c.dueDate, c.status);
              const open = isOpen(c.status);
              const paidPct = c.totalAmount > 0 ? Math.min(100, Math.round((c.amountPaid / c.totalAmount) * 100)) : 0;

              return (
                <li key={c.id} className="group relative">
                  {/* ── Desktop row ── */}
                  <div className="hidden md:flex items-center gap-3 py-2.5 pl-[15px] pr-3 transition-colors group-hover:bg-gray-50">
                    {/* Urgency rail */}
                    <span className={`absolute left-0 top-0 h-full w-[3px] ${urgency.rail}`} aria-hidden />

                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gray-100 text-gray-500 text-xs font-semibold shrink-0">
                      {getInitials(c.customerName)}
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-gray-900 truncate leading-tight">{c.customerName}</p>
                      <p className="text-xs text-gray-400 truncate leading-tight mt-0.5">
                        {c.description || 'Customer credit'}
                      </p>
                    </div>

                    <span
                      title={`Due ${formatDate(c.dueDate)}`}
                      className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap ${urgency.pill}`}
                    >
                      {urgency.label}
                    </span>

                    <div className="w-32 shrink-0 text-right">
                      <p className={`text-sm font-semibold tabular-nums leading-tight ${amountColor(c.status)}`}>
                        {formatNaira(c.balance)}
                      </p>
                      <div className="h-[3px] w-full bg-gray-100 rounded-full overflow-hidden mt-1.5">
                        <div
                          className={`h-full rounded-full transition-all duration-300 ${progressColor(c.status)}`}
                          style={{ width: `${paidPct}%` }}
                        />
                      </div>
                    </div>

                    {open && c.customerPhone && (
                      <button
                        onClick={() => {
                          if (blockIfNeeded()) return;
                          handleWhatsAppClick(c);
                        }}
                        disabled={writesBlocked}
                        title={`WhatsApp reminder to ${c.customerPhone}`}
                        aria-label={`Send WhatsApp reminder to ${c.customerName}`}
                        className="relative z-20 flex h-8 w-8 items-center justify-center rounded-lg text-gray-300 hover:text-emerald-600 hover:bg-emerald-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <MessageCircle className="h-4 w-4" />
                      </button>
                    )}
                    {open && (
                      <button
                        onClick={() => handleSendDebtorEmail(c)}
                        disabled={!c.customerEmail || writesBlocked || sendingEmailId === c.id}
                        title={
                          c.customerEmail
                            ? `Email debt info to ${c.customerEmail}`
                            : 'Add an email address to send debt information'
                        }
                        aria-label={`Email debt info to ${c.customerName}`}
                        className="relative z-20 flex h-8 w-8 items-center justify-center rounded-lg text-gray-300 hover:text-primary-600 hover:bg-primary-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        {sendingEmailId === c.id ? (
                          <Loader2 className="h-4 w-4 animate-spin text-primary-600" />
                        ) : (
                          <Mail className="h-4 w-4" />
                        )}
                      </button>
                    )}
                    {open && (
                      <button
                        onClick={() => {
                          if (blockIfNeeded()) return;
                          setPaymentModalCredit(c);
                        }}
                        disabled={writesBlocked}
                        title="Record payment"
                        aria-label={`Record payment from ${c.customerName}`}
                        className="relative z-20 flex h-8 w-8 items-center justify-center rounded-lg text-gray-300 hover:text-gray-900 hover:bg-gray-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <CreditCard className="h-4 w-4" />
                      </button>
                    )}
                  </div>

                  {/* ── Mobile card ── */}
                  <div className="md:hidden px-3.5 py-3 pl-4 transition-colors group-hover:bg-gray-50">
                    <span className={`absolute left-0 top-0 h-full w-[3px] ${urgency.rail}`} aria-hidden />
                    <div className="flex items-start gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gray-100 text-gray-500 text-xs font-semibold shrink-0">
                        {getInitials(c.customerName)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-semibold text-gray-900 truncate">{c.customerName}</p>
                          <p className={`text-sm font-semibold tabular-nums shrink-0 ${amountColor(c.status)}`}>
                            {formatNaira(c.balance)}
                          </p>
                        </div>
                        <div className="flex items-center justify-between gap-2 mt-1">
                          <p className="text-xs text-gray-400 truncate">{c.description || 'Customer credit'}</p>
                          <span
                            title={`Due ${formatDate(c.dueDate)}`}
                            className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap ${urgency.pill}`}
                          >
                            {urgency.label}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-2 mt-2">
                          <div className="h-[3px] flex-1 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${progressColor(c.status)}`}
                              style={{ width: `${paidPct}%` }}
                            />
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            {open && c.customerPhone && (
                              <button
                                onClick={() => {
                                  if (blockIfNeeded()) return;
                                  handleWhatsAppClick(c);
                                }}
                                disabled={writesBlocked}
                                aria-label={`Send WhatsApp reminder to ${c.customerName}`}
                                className="relative z-20 flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                              >
                                <MessageCircle className="h-3.5 w-3.5" />
                              </button>
                            )}
                            {open && (
                              <button
                                onClick={() => handleSendDebtorEmail(c)}
                                disabled={!c.customerEmail || writesBlocked || sendingEmailId === c.id}
                                title={
                                  c.customerEmail
                                    ? `Email debt info to ${c.customerEmail}`
                                    : 'Add an email address to send debt information'
                                }
                                aria-label={`Email debt info to ${c.customerName}`}
                                className="relative z-20 flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 hover:text-primary-600 hover:bg-primary-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                              >
                                {sendingEmailId === c.id ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin text-primary-600" />
                                ) : (
                                  <Mail className="h-3.5 w-3.5" />
                                )}
                              </button>
                            )}
                            {open && (
                              <button
                                onClick={() => {
                                  if (blockIfNeeded()) return;
                                  setPaymentModalCredit(c);
                                }}
                                disabled={writesBlocked}
                                aria-label={`Record payment from ${c.customerName}`}
                                className="relative z-20 flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 hover:text-gray-900 hover:bg-gray-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                              >
                                <CreditCard className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Full-row hit target, above content but below the action buttons */}
                  <Link
                    to={`/debtors/${c.id}`}
                    onClick={(e) => e.stopPropagation()}
                    className="absolute inset-0 z-10 rounded-none focus:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-500"
                  >
                    <span className="sr-only">View {c.customerName}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}

        {pagination && pagination.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-2.5 border-t border-gray-100 bg-gray-50/60 text-xs">
            <span className="text-gray-500">
              {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, pagination.total)} of {pagination.total}
            </span>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" subscriptionExempt={true} disabled={!pagination.hasPrev} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <span className="text-gray-400 tabular-nums">
                {page} / {pagination.totalPages}
              </span>
              <Button variant="ghost" size="sm" subscriptionExempt={true} disabled={!pagination.hasNext} onClick={() => setPage((p) => p + 1)}>
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* ── Modals ───────────────────────────────────────────────── */}
      <CreateCreditModal
        businessId={biz.id}
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onCreated={loadCredits}
      />
      <RecordCreditPaymentModal
        businessId={biz.id}
        credit={paymentModalCredit}
        isOpen={!!paymentModalCredit}
        onClose={() => setPaymentModalCredit(null)}
        onSuccess={loadCredits}
      />
      <LinkDvaCreditModal
        businessId={biz.id}
        credit={dvaModalCredit}
        isOpen={!!dvaModalCredit}
        onClose={() => setDvaModalCredit(null)}
        onSuccess={loadCredits}
      />
      <WriteOffModal
        businessId={biz.id}
        credit={writeOffModalCredit}
        isOpen={!!writeOffModalCredit}
        onClose={() => setWriteOffModalCredit(null)}
        onSuccess={loadCredits}
      />
    </div>
  );
}