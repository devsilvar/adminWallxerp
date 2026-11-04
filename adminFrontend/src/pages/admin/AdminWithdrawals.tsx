import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  Building2,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Loader2,
  Search,
  Wallet,
  X,
  XCircle,
} from 'lucide-react';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import { TableSkeleton } from '@/components/ui/Skeleton.tsx';
import api from '@/lib/axios';
import toast from 'react-hot-toast';
import PaginationBar from './shared/Pagination';
import { Panel, PanelEmpty } from './shared/Panel';
import StatusPill, { type Tone } from './shared/StatusPill';
import { formatNaira, formatStamp, formatTransferStamp } from './shared/format';
import { useAdminStatsStore } from '@/stores/admin.stats.store.ts';
import { usePaginationTransition } from '@/hooks/usePaginationTransition';
import { getSSEClient } from '@/lib/sse-client';

interface WithdrawalRequest {
  id: string;
  businessId: string;
  businessName: string;
  amount: number;
  fee: number;
  netAmount: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  isStale?: boolean;
  needsReconciliation?: boolean;
  reconciliationReason?: string | null;
  destinationBankName: string;
  destinationAccountNum: string;
  destinationAccountName: string;
  transferReference: string;
  narration: string | null;
  failureReason: string | null;
  initiatedAt: string;
  completedAt: string | null;
  adminApprovedBy: string | null;
  adminApprovedAt: string | null;
  autoPayoutEnabled?: boolean;
}

type StatusFilter = 'all' | 'pending' | 'processing' | 'completed' | 'failed' | 'reconciliation';

const STATUS_OPTIONS: ReadonlyArray<{ value: StatusFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Awaiting Funding' },
  { value: 'processing', label: 'Processing' },
  { value: 'completed', label: 'Completed' },
  { value: 'failed', label: 'Failed' },
  { value: 'reconciliation', label: 'Needs Reconciliation' },
];

const STATUS_META: Record<
  WithdrawalRequest['status'],
  { tone: Tone; label: string; icon: typeof Clock }
> = {
  pending: { tone: 'warning', label: 'Awaiting funding', icon: Clock },
  processing: { tone: 'info', label: 'Transfer in progress', icon: Loader2 },
  completed: { tone: 'success', label: 'Completed', icon: CheckCircle2 },
  failed: { tone: 'danger', label: 'Failed', icon: XCircle },
};

export default function AdminWithdrawals() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialStatus = searchParams.get('status') as StatusFilter | null;

  const [withdrawals, setWithdrawals] = useState<WithdrawalRequest[]>([]);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(
    initialStatus && STATUS_OPTIONS.some((o) => o.value === initialStatus) ? initialStatus : 'all'
  );
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const slaStats = useAdminStatsStore((s) => s.stats?.withdrawalSla ?? null);
  const disputeStats = useAdminStatsStore((s) => s.stats?.withdrawalDisputes ?? null);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 1,
    hasNext: false,
    hasPrev: false,
  });
  const { isPageLoading, pendingPage, start, finish } = usePaginationTransition();

  // Modal states
  const [selectedWithdrawal, setSelectedWithdrawal] = useState<WithdrawalRequest | null>(null);
  const [showApproveModal, setShowApproveModal] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [showManualSettleModal, setShowManualSettleModal] = useState(false);
  const [manualSessionRef, setManualSessionRef] = useState('');
  const [manualNotes, setManualNotes] = useState('');
  const [processing, setProcessing] = useState(false);
  const [detailWithdrawal, setDetailWithdrawal] = useState<WithdrawalRequest | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const handleCopy = (text: string, fieldName: string) => {
    navigator.clipboard?.writeText(text);
    setCopiedField(fieldName);
    toast.success(`${fieldName} copied to clipboard`);
    setTimeout(() => setCopiedField(null), 2000);
  };

  // `searchQuery` used to sit directly in the fetch effect's deps, so every
  // keystroke fired a request and swapped the whole list for a spinner.
  // Debounced to match the Invoices list.
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput.trim());
      setPagination((prev) => (prev.page === 1 ? prev : { ...prev, page: 1 }));
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const fetchWithdrawals = useCallback(async () => {
    const isPaging = hasLoadedOnce;
    if (isPaging) start(pagination.page);
    const params = new URLSearchParams({
      page: String(pagination.page),
      limit: String(pagination.limit),
    });

    if (statusFilter === 'reconciliation') {
      params.append('needsReconciliation', 'true');
    } else if (statusFilter !== 'all') {
      params.append('status', statusFilter);
    }
    if (search) params.append('search', search);

    try {
      const res = await api.get(`/admin/settlement/withdrawals?${params.toString()}`);
      const list = res.data?.data || res.data?.items || [];
      setWithdrawals(Array.isArray(list) ? list : []);
      if (res.data?.pagination) setPagination(res.data.pagination);
    } catch (err: any) {
      toast.error(err?.response?.data?.error?.message || 'Failed to load withdrawal requests');
      setWithdrawals([]);
    } finally {
      finish();
      setHasLoadedOnce(true);
    }

    // The SLA banner lives on this page but its counts come from
    // /admin/dashboard â€” shared with the sidebar so only one fires.
    useAdminStatsStore.getState().fetchStats();
  }, [pagination.page, pagination.limit, statusFilter, search, hasLoadedOnce, start, finish]);

  useEffect(() => {
    fetchWithdrawals();
  }, [fetchWithdrawals]);

  // Real-time SSE updates for withdrawal events
  useEffect(() => {
    const client = getSSEClient();
    const handleRealtimeUpdate = () => {
      fetchWithdrawals();
      useAdminStatsStore.getState().fetchStats({ force: true });
    };

    client.on('withdrawal_created', handleRealtimeUpdate);
    client.on('withdrawal_status_changed', handleRealtimeUpdate);

    return () => {
      client.off('withdrawal_created', handleRealtimeUpdate);
      client.off('withdrawal_status_changed', handleRealtimeUpdate);
    };
  }, [fetchWithdrawals]);

  // Fallback 5s polling while any withdrawal is in actionable state ('pending' | 'processing')
  useEffect(() => {
    const hasActionable = withdrawals.some(
      (w) => w.status === 'pending' || w.status === 'processing'
    );
    if (!hasActionable) return;

    const interval = setInterval(() => {
      fetchWithdrawals();
    }, 5000);

    return () => clearInterval(interval);
  }, [withdrawals, fetchWithdrawals]);

  const handlePageChange = (next: number) => {
    if (next === pagination.page || isPageLoading) return;
    start(next);
    setPagination((prev) => ({ ...prev, page: next }));
  };

  /**
   * Approving, rejecting or settling moves a withdrawal out of `pending`, which
   * is exactly what the sidebar badge and the SLA banner above both read. Force
   * the shared stats so neither goes stale behind the list refresh.
   */
  const refreshAfterMutation = () => {
    fetchWithdrawals();
    useAdminStatsStore.getState().fetchStats({ force: true });
  };

  useEffect(() => {
    const urlStatus = searchParams.get('status') as StatusFilter | null;
    if (urlStatus && STATUS_OPTIONS.some((o) => o.value === urlStatus)) setStatusFilter(urlStatus);
  }, [searchParams]);

  const applyStatusFilter = (status: StatusFilter) => {
    setStatusFilter(status);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (status === 'all') next.delete('status');
      else next.set('status', status);
      return next;
    });
    setPagination((prev) => ({ ...prev, page: 1 }));
  };

  const handleRequery = async (withdrawal: WithdrawalRequest) => {
    setProcessing(true);
    try {
      const res = await api.post(`/admin/settlement/withdrawals/${withdrawal.id}/requery`);
      toast.success(res.data?.message || 'Status updated from Paystack');
      refreshAfterMutation();
    } catch (err: any) {
      toast.error(err?.response?.data?.error?.message || 'Failed to re-query Paystack');
    } finally {
      setProcessing(false);
    }
  };

  const handleApprove = async () => {
    if (!selectedWithdrawal) return;

    setProcessing(true);
    try {
      await api.post(`/admin/settlement/withdrawals/${selectedWithdrawal.id}/approve`);
      toast.success('Withdrawal approved successfully. Transfer initiated.');
      setShowApproveModal(false);
      setSelectedWithdrawal(null);
      refreshAfterMutation();
    } catch (err: any) {
      const errorCode = err?.response?.data?.error?.code;
      const errorMessage = err?.response?.data?.error?.message;

      if (errorCode === 'ALREADY_PROCESSED') {
        toast.error('This withdrawal has already been processed');
      } else if (errorCode === 'INSUFFICIENT_FUNDS_AT_APPROVAL') {
        toast.error('Insufficient funds available. Business balance may have changed.');
      } else {
        toast.error(errorMessage || 'Failed to approve withdrawal');
      }
    } finally {
      setProcessing(false);
    }
  };

  const handleReject = async () => {
    if (!selectedWithdrawal || !rejectReason.trim()) {
      toast.error('Please provide a reason for rejection');
      return;
    }

    if (rejectReason.trim().length < 3 || rejectReason.trim().length > 500) {
      toast.error('Rejection reason must be between 3 and 500 characters');
      return;
    }

    setProcessing(true);
    try {
      const wasProcessing = selectedWithdrawal.status === 'processing';
      await api.post(`/admin/settlement/withdrawals/${selectedWithdrawal.id}/reject`, {
        reason: rejectReason.trim(),
      });
      toast.success(
        wasProcessing
          ? 'Withdrawal cancelled and funds returned to merchant wallet'
          : 'Withdrawal request rejected'
      );
      setShowRejectModal(false);
      setSelectedWithdrawal(null);
      setRejectReason('');
      refreshAfterMutation();
    } catch (err: any) {
      const errorCode = err?.response?.data?.error?.code;
      const errorMessage = err?.response?.data?.error?.message;

      if (errorCode === 'PAYOUT_IN_FLIGHT') {
        toast.error(
          errorMessage ||
            'This withdrawal is already in flight with the bank and cannot be cancelled. Use Re-query to retrieve its final status.',
          { duration: 6000 }
        );
      } else if (errorCode === 'ALREADY_PROCESSED') {
        toast.error('This withdrawal has already been processed');
      } else {
        toast.error(errorMessage || 'Failed to reject withdrawal');
      }
    } finally {
      setProcessing(false);
    }
  };

  const openApproveModal = (withdrawal: WithdrawalRequest) => {
    setSelectedWithdrawal(withdrawal);
    setShowApproveModal(true);
  };

  const openRejectModal = (withdrawal: WithdrawalRequest) => {
    setSelectedWithdrawal(withdrawal);
    setRejectReason('');
    setShowRejectModal(true);
  };

  const openManualSettleModal = (withdrawal: WithdrawalRequest, prefilledNotes?: string) => {
    setSelectedWithdrawal(withdrawal);
    setManualSessionRef('');
    setManualNotes(prefilledNotes || '');
    setShowManualSettleModal(true);
  };

  const handleManualSettle = async () => {
    if (!selectedWithdrawal) return;
    if (!manualSessionRef.trim()) {
      toast.error('Please enter the bank transfer session ID or reference');
      return;
    }

    setProcessing(true);
    try {
      await api.post(`/admin/settlement/withdrawals/${selectedWithdrawal.id}/manual-settle`, {
        sessionReference: manualSessionRef.trim(),
        notes: manualNotes.trim() || undefined,
      });
      toast.success('Withdrawal marked as settled via manual bank transfer!');
      setShowManualSettleModal(false);
      setSelectedWithdrawal(null);
      setManualSessionRef('');
      setManualNotes('');
      refreshAfterMutation();
    } catch (err: any) {
      const errorCode = err?.response?.data?.error?.code;
      const errorMessage = err?.response?.data?.error?.message;

      if (errorCode === 'PAYOUT_IN_FLIGHT') {
        toast.error(
          errorMessage ||
            'This withdrawal is already in flight with the gateway and cannot be settled manually. Use Re-query to retrieve its final status.',
          { duration: 6000 }
        );
      } else {
        toast.error(errorMessage || 'Failed to settle withdrawal manually');
      }
    } finally {
      setProcessing(false);
    }
  };

  const isStale = (w: WithdrawalRequest) => w.status === 'processing' && w.isStale;

  const WithdrawalStatus = ({ withdrawal }: { withdrawal: WithdrawalRequest }) => {
    if (withdrawal.needsReconciliation) {
      return (
        <StatusPill tone='danger' icon={<AlertTriangle className='h-3 w-3' />}>
          Needs reconciliation
        </StatusPill>
      );
    }
    if (isStale(withdrawal)) {
      return (
        <StatusPill tone='warning' icon={<AlertTriangle className='h-3 w-3' />}>
          Stale â€” re-query pending
        </StatusPill>
      );
    }
    const meta = STATUS_META[withdrawal.status] ?? STATUS_META.pending;
    const Icon = meta.icon;
    return (
      <StatusPill
        tone={meta.tone}
        icon={<Icon className={`h-3 w-3 ${withdrawal.status === 'processing' ? 'animate-spin' : ''}`} />}
      >
        {meta.label}
      </StatusPill>
    );
  };

  const PayoutModeBadge = ({ withdrawal }: { withdrawal: WithdrawalRequest }) => (
    <StatusPill tone={withdrawal.autoPayoutEnabled ? 'success' : 'neutral'}>
      {withdrawal.autoPayoutEnabled ? 'Auto-Payout' : 'Manual Review'}
    </StatusPill>
  );

  const goToDetail = (w: WithdrawalRequest) => setDetailWithdrawal(w);
  const fromDetail = (open: (w: WithdrawalRequest) => void) => (w: WithdrawalRequest) => {
    setDetailWithdrawal(null);
    open(w);
  };

  const pendingCount = withdrawals.filter((w) => w.status === 'pending').length;
  const reconciliationCount = withdrawals.filter((w) => w.needsReconciliation).length;
  const isFiltered = Boolean(search) || statusFilter !== 'all';
  const net = (w: WithdrawalRequest) => w.netAmount || w.amount;

  const processingCount = withdrawals.filter((w) => w.status === 'processing').length;
  const completedCount = withdrawals.filter((w) => w.status === 'completed').length;

  return (
    <div className='space-y-6'>
      {/* Header â€” Subscriptions desk pattern */}
      <div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
        <div>
          <div className='flex items-center gap-2'>
            <h1 className='text-xl font-bold tracking-tight text-ink sm:text-2xl'>
              Withdrawals Desk
            </h1>
            <span className='rounded-full bg-primary-100 px-2.5 py-0.5 text-xs font-semibold text-primary-800'>
              Bank Payouts
            </span>
          </div>
          <p className='mt-1 text-xs text-ink-muted sm:text-sm'>
            Review SME withdrawal requests, approve Paystack transfers, and settle offline payouts.
          </p>
        </div>

        <div className='flex items-center gap-2 self-start sm:self-auto'>
          {pendingCount > 0 && statusFilter === 'all' ? (
            <Button size='sm' onClick={() => applyStatusFilter('pending')}>
              <Clock className='h-3.5 w-3.5' />
              {pendingCount} Awaiting Funding
            </Button>
          ) : (
            <span className='text-[11px] text-ink-muted'>
              {pagination.total} {pagination.total === 1 ? 'request' : 'requests'}
            </span>
          )}
          <button
            onClick={() => refreshAfterMutation()}
            className='inline-flex items-center gap-1.5 rounded-lg border border-hairline bg-panel px-3.5 py-2 text-xs font-semibold text-ink shadow-2xs transition-colors hover:bg-panel-subtle'
          >
            <Clock className='h-3.5 w-3.5' />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* SLA Alert Banner */}
      {((disputeStats && disputeStats.count > 0) || (slaStats && slaStats.breachedCount > 0)) && (
        <div
          role='status'
          aria-live='polite'
          className='flex flex-col items-start justify-between gap-2 rounded-xl border border-danger-300 bg-danger-50 px-4 py-3 sm:flex-row sm:items-center'
        >
          <div className='flex items-center gap-2.5'>
            <AlertTriangle className='h-5 w-5 shrink-0 text-danger-600' aria-hidden='true' />
            <div>
              {disputeStats && disputeStats.count > 0 ? (
                <>
                  <p className='text-xs font-semibold text-ink'>
                    <span>{disputeStats.count}</span> failed withdrawal
                    {disputeStats.count === 1 ? ' is' : 's are'} waiting for a dispute decision â€” oldest at{' '}
                    {disputeStats.oldestHours}h. The money is held; the merchant has not been refunded.
                  </p>
                  {slaStats && slaStats.breachedCount > 0 && (
                    <p className='mt-0.5 text-[11px] text-ink-muted'>
                      Additionally, {slaStats.breachedCount} funding-shortfall request
                      {slaStats.breachedCount === 1 ? ' has' : 's have'} been pending over 24 hours.
                    </p>
                  )}
                </>
              ) : slaStats ? (
                <>
                  <p className='text-xs font-semibold text-ink'>
                    <span>{slaStats.breachedCount}</span> withdrawal
                    {slaStats.breachedCount === 1 ? ' has' : 's have'} been pending over 24 hours â€” oldest at{' '}
                    {slaStats.oldestPendingHours}h.
                  </p>
                  <p className='mt-0.5 text-[11px] text-ink-muted'>
                    Immediate review required. Approve, reject, or re-query the transfer status.
                  </p>
                </>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {/* Summary KPI Cards */}
      <div className='grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4'>
        <div className='rounded-xl border border-hairline bg-panel p-4 shadow-2xs'>
          <div className='flex items-center justify-between text-ink-subtle'>
            <span className='text-xs font-medium'>Awaiting Funding</span>
            <Clock className='h-4 w-4 text-amber-500' />
          </div>
          <p className='mt-2 text-2xl font-bold tabular-nums text-amber-600'>
            {slaStats?.pendingCount ?? pendingCount}
          </p>
          <p className='mt-0.5 text-[11px] text-ink-subtle'>Gateway short â€” fund and release</p>
        </div>

        <div className='rounded-xl border border-hairline bg-panel p-4 shadow-2xs'>
          <div className='flex items-center justify-between text-ink-subtle'>
            <span className='text-xs font-medium'>In Flight</span>
            <Loader2 className='h-4 w-4 text-primary-500' />
          </div>
          <p className='mt-2 text-2xl font-bold tabular-nums text-ink'>
            {processingCount}
          </p>
          <p className='mt-0.5 text-[11px] text-ink-subtle'>Transfers processing</p>
        </div>

        <div className='rounded-xl border border-hairline bg-panel p-4 shadow-2xs'>
          <div className='flex items-center justify-between text-ink-subtle'>
            <span className='text-xs font-medium'>Needs Dispute</span>
            <AlertTriangle className='h-4 w-4 text-danger-500' />
          </div>
          <p className='mt-2 text-2xl font-bold tabular-nums text-danger-600'>
            {disputeStats?.count ?? 0}
          </p>
          <p className='mt-0.5 text-[11px] text-ink-subtle'>
            {disputeStats && disputeStats.count > 0 
              ? `â‚¦${disputeStats.valueNaira.toLocaleString()} held â€” oldest ${disputeStats.oldestHours}h` 
              : 'No active disputes'}
          </p>
        </div>

        <div className='rounded-xl border border-hairline bg-panel p-4 shadow-2xs'>
          <div className='flex items-center justify-between text-ink-subtle'>
            <span className='text-xs font-medium'>Completed</span>
            <CheckCircle2 className='h-4 w-4 text-emerald-500' />
          </div>
          <p className='mt-2 text-2xl font-bold tabular-nums text-emerald-600'>
            {completedCount}
          </p>
          <p className='mt-0.5 text-[11px] text-ink-subtle'>Settled to banks</p>
        </div>
      </div>

      {/* Filter Tabs & Search â€” Subscriptions desk pattern */}
      <div className='flex flex-col justify-between gap-3 border-b border-hairline pb-4 sm:flex-row sm:items-center'>
        <div className='flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0'>
          {STATUS_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type='button'
              onClick={() => applyStatusFilter(opt.value)}
              className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                statusFilter === opt.value
                  ? 'bg-primary-600 text-white shadow-2xs'
                  : 'text-ink-muted hover:bg-panel-subtle hover:text-ink'
              }`}
            >
              {opt.label}
              {opt.value === 'pending' && pendingCount > 0 ? ` (${pendingCount})` : ''}
              {opt.value === 'reconciliation' && reconciliationCount > 0 ? ` (${reconciliationCount})` : ''}
            </button>
          ))}
        </div>
        <div className='flex flex-col gap-2 sm:flex-row sm:items-center'>
          <div className='relative w-full sm:w-72'>
            <Search
              className='absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-subtle'
              aria-hidden='true'
            />
            <input
              type='search'
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder='Search business name, reference...'
              aria-label='Search withdrawals by business name or reference'
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

      {!hasLoadedOnce ? (
        <TableSkeleton rows={6} columns={4} />
      ) : withdrawals.length === 0 ? (
        <Panel>
          <PanelEmpty
            icon={Wallet}
            title={isFiltered ? 'No matching requests' : 'No withdrawal requests yet'}
            hint={
              isFiltered
                ? 'Try adjusting your filters.'
                : 'Withdrawal requests from SMEs will appear here.'
            }
          />
        </Panel>
      ) : (
        <div className='overflow-hidden rounded-xl border border-hairline bg-panel shadow-2xs'>
          <div className={`overflow-x-auto transition-opacity ${isPageLoading ? 'opacity-60 pointer-events-none' : 'opacity-100'}`} aria-busy={isPageLoading}>
            <table className='w-full text-left text-xs'>
              <thead className='border-b border-hairline bg-panel-subtle text-[10px] font-semibold uppercase tracking-wider text-ink-muted'>
                <tr>
                  <th className='px-4 py-3'>Customer / Business</th>
                  <th className='px-4 py-3'>Destination</th>
                  <th className='px-4 py-3 text-right'>Amount</th>
                  <th className='px-4 py-3'>Status</th>
                  <th className='px-4 py-3'>Requested</th>
                  <th className='px-4 py-3 text-right'>Action</th>
                </tr>
              </thead>
              <tbody className='divide-y divide-hairline'>
                {withdrawals.map((w) => (
                  <tr
                    key={w.id}
                    className='group cursor-pointer transition-colors hover:bg-panel-subtle/50'
                    onClick={() => goToDetail(w)}
                  >
                    <td className='px-4 py-3.5'>
                      <div className='flex items-center gap-2.5'>
                        <div className='flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-100 font-bold text-primary-700'>
                          {w.businessName.charAt(0).toUpperCase()}
                        </div>
                        <div className='min-w-0'>
                          <p className='truncate font-bold text-ink'>{w.businessName}</p>
                          <button
                            type='button'
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCopy(w.transferReference, 'Transfer reference');
                            }}
                            title='Copy transfer reference'
                            className='mt-0.5 flex items-center gap-1.5 font-mono text-[10px] text-ink-subtle transition-colors hover:text-primary-500 focus-visible:text-primary-500 focus-visible:outline-none'
                          >
                            {w.transferReference}
                            {copiedField === 'Transfer reference' ? (
                              <Check className='h-3 w-3 text-success-600' />
                            ) : (
                              <Copy className='h-3 w-3 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100' />
                            )}
                          </button>
                        </div>
                      </div>
                    </td>

                    <td className='whitespace-nowrap px-4 py-3.5'>
                      <span className='font-medium text-ink'>{w.destinationBankName}</span>
                      <span className='ml-2 font-mono text-[10px] text-ink-subtle'>
                        â€¢â€¢â€¢â€¢ {w.destinationAccountNum.slice(-4)}
                      </span>
                    </td>

                    <td className='whitespace-nowrap px-4 py-3.5 text-right'>
                      <span className='font-bold tabular-nums text-sm text-ink'>
                        {formatNaira(w.amount)}
                      </span>
                      {w.fee > 0 && (
                        <div className='text-[10px] text-ink-subtle'>
                          less {formatNaira(w.fee)} fee
                        </div>
                      )}
                    </td>

                    <td className='whitespace-nowrap px-4 py-3.5'>
                      <WithdrawalStatus withdrawal={w} />
                    </td>

                    <td className='whitespace-nowrap px-4 py-3.5 text-[11px] text-ink-muted'>
                      {formatTransferStamp(w.initiatedAt)}
                    </td>

                    <td className='whitespace-nowrap px-4 py-3.5 text-right' onClick={(e) => e.stopPropagation()}>
                      <div className='flex items-center justify-end gap-2'>
                        <Button variant='ghost' size='sm' onClick={() => goToDetail(w)}>
                          Details
                        </Button>

                        {w.status === 'pending' && (
                          <>
                            <Button size='sm' onClick={() => openApproveModal(w)}>
                              Approve
                            </Button>
                            <Button variant='secondary' size='sm' onClick={() => openRejectModal(w)}>
                              Reject
                            </Button>
                          </>
                        )}

                        {w.status === 'processing' && (
                          <Button
                            variant='secondary'
                            size='sm'
                            disabled={processing}
                            isLoading={processing}
                            onClick={() => handleRequery(w)}
                          >
                            Re-query
                          </Button>
                        )}

                        {w.status === 'failed' && w.needsReconciliation && (
                          <Button
                            variant='danger'
                            size='sm'
                            onClick={() => openRejectModal(w)}
                          >
                            Dispute
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <PaginationBar
            pagination={pagination}
            onPageChange={handlePageChange}
            noun='requests'
            isLoading={isPageLoading}
            pendingPage={pendingPage}
          />
        </div>
      )}

      {/* Approve */}
      <Modal
        isOpen={showApproveModal && Boolean(selectedWithdrawal)}
        onClose={() => setShowApproveModal(false)}
        title='Approve Withdrawal'
        subtitle='Review and confirm'
        icon={<CheckCircle2 className='h-4 w-4' />}
        size='sm'
        footer={
          <>
            <Button variant='secondary' size='sm' onClick={() => setShowApproveModal(false)} disabled={processing}>
              Cancel
            </Button>
            <Button size='sm' onClick={handleApprove} isLoading={processing}>
              <CheckCircle2 className='h-3.5 w-3.5' />
              Approve &amp; Transfer
            </Button>
          </>
        }
      >
        {selectedWithdrawal && (
          <div className='space-y-3'>
            <dl className='divide-y divide-hairline rounded border border-hairline bg-panel-subtle px-3'>
              <div className='flex items-center justify-between py-2'>
                <dt className='text-[11px] text-ink-muted'>Business</dt>
                <dd className='text-xs font-medium text-ink'>{selectedWithdrawal.businessName}</dd>
              </div>
              <div className='flex items-center justify-between py-2'>
                <dt className='text-[11px] text-ink-muted'>Requested (gross)</dt>
                <dd className='font-mono text-sm font-semibold text-ink'>
                  {formatNaira(selectedWithdrawal.amount)}
                </dd>
              </div>
              {selectedWithdrawal.fee > 0 && (
                <div className='flex items-center justify-between py-2'>
                  <dt className='text-[11px] text-ink-muted'>Paystack transfer fee</dt>
                  <dd className='font-mono text-xs text-ink-muted'>
                    âˆ’{formatNaira(selectedWithdrawal.fee)}
                  </dd>
                </div>
              )}
              <div className='flex items-center justify-between py-2'>
                <dt className='text-[11px] font-semibold text-ink'>Transfer to bank (net)</dt>
                <dd className='font-mono text-sm font-semibold text-success-700'>
                  {formatNaira(net(selectedWithdrawal))}
                </dd>
              </div>
              <div className='py-2'>
                <dt className='text-[11px] text-ink-muted'>Destination</dt>
                <dd className='mt-0.5 text-xs font-medium text-ink'>
                  {selectedWithdrawal.destinationBankName}
                </dd>
                <dd className='font-mono text-[11px] text-ink-muted'>
                  â€¢â€¢â€¢â€¢ {selectedWithdrawal.destinationAccountNum.slice(-4)} Â·{' '}
                  {selectedWithdrawal.destinationAccountName}
                </dd>
              </div>
            </dl>

            <p className='flex items-start gap-2 rounded border border-warning-200 bg-warning-50 px-3 py-2 text-[11px] text-warning-900'>
              <AlertTriangle className='mt-0.5 h-3.5 w-3.5 shrink-0 text-warning-600' aria-hidden='true' />
              <span>
                Initiates a Paystack transfer of <strong>{formatNaira(net(selectedWithdrawal))}</strong> to
                the destination bank. Paystack debits <strong>{formatNaira(selectedWithdrawal.amount)}</strong>{' '}
                from the platform balance.
              </span>
            </p>
          </div>
        )}
      </Modal>

      {/* Reject / Cancel & refund / Dispute failed withdrawal */}
      <Modal
        isOpen={showRejectModal && Boolean(selectedWithdrawal)}
        onClose={() => {
          setShowRejectModal(false);
          setRejectReason('');
        }}
        title={
          selectedWithdrawal?.status === 'failed' && selectedWithdrawal?.needsReconciliation
            ? 'Dispute failed withdrawal'
            : selectedWithdrawal?.status === 'processing'
              ? 'Cancel & Refund Withdrawal'
              : 'Reject Withdrawal'
        }
        subtitle={
          selectedWithdrawal?.status === 'failed' && selectedWithdrawal?.needsReconciliation
            ? `The transfer failed. â‚¦${selectedWithdrawal.amount.toLocaleString()} is held in the merchant's wallet and has NOT been returned to them. Decide what happens next.`
            : selectedWithdrawal?.status === 'processing'
              ? 'Cancel transfer and return funds to merchant wallet balance'
              : 'Provide a reason for rejection'
        }
        icon={<XCircle className='h-4 w-4' />}
        size='sm'
        footer={
          <>
            <Button
              variant='secondary'
              size='sm'
              onClick={() => {
                setShowRejectModal(false);
                setRejectReason('');
              }}
              disabled={processing}
            >
              Cancel
            </Button>
            {selectedWithdrawal?.status === 'failed' && selectedWithdrawal?.needsReconciliation && (
              <Button
                variant='secondary'
                size='sm'
                onClick={() => {
                  setShowRejectModal(false);
                  openManualSettleModal(selectedWithdrawal, rejectReason.trim());
                }}
                disabled={processing}
              >
                Mark settled offline
              </Button>
            )}
            <Button
              variant='danger'
              size='sm'
              onClick={handleReject}
              isLoading={processing}
              disabled={rejectReason.trim().length < 3}
            >
              <XCircle className='h-3.5 w-3.5' />
              {selectedWithdrawal?.status === 'processing'
                ? 'Cancel & Return Funds'
                : selectedWithdrawal?.status === 'failed' && selectedWithdrawal?.needsReconciliation
                  ? 'Release funds'
                  : 'Reject Request'}
            </Button>
          </>
        }
      >
        {selectedWithdrawal && (
          <div className='space-y-3'>
            <div className='rounded border border-hairline bg-panel-subtle px-3 py-2'>
              <p className='text-[11px] text-ink-muted'>Business</p>
              <p className='text-xs font-medium text-ink'>{selectedWithdrawal.businessName}</p>
              <p className='font-mono text-xs text-ink-muted'>
                {formatNaira(selectedWithdrawal.amount)}
              </p>
              {selectedWithdrawal.transferReference && (
                <p className='font-mono text-[10px] text-ink-subtle mt-0.5'>
                  Ref: {selectedWithdrawal.transferReference}
                </p>
              )}
              {selectedWithdrawal.failureReason && (
                <p className='text-[10px] text-danger-700 mt-0.5'>
                  Failure: {selectedWithdrawal.failureReason}
                </p>
              )}
            </div>

            {selectedWithdrawal.status === 'processing' && (
              <p className='rounded border border-warning-200 bg-warning-50 px-3 py-2 text-[11px] text-warning-900'>
                The withdrawal is marked failed and{' '}
                <strong>{formatNaira(selectedWithdrawal.amount)}</strong> is returned to the
                business wallet balance.
              </p>
            )}

            {selectedWithdrawal.status === 'failed' && selectedWithdrawal.needsReconciliation && (
              <p className='rounded border border-danger-200 bg-danger-50 px-3 py-2 text-[11px] text-danger-900'>
                The transfer failed. <strong>{formatNaira(selectedWithdrawal.amount)}</strong> is held in
                the merchant's wallet and has NOT been returned to them. Choose: <strong>Release funds</strong> to
                return the amount to their available balance, or <strong>Mark settled offline</strong> if you
                paid them out-of-band.
              </p>
            )}

            {selectedWithdrawal.needsReconciliation && selectedWithdrawal.status !== 'failed' && (
              <p className='rounded border border-warning-200 bg-warning-50 px-3 py-2 text-[11px] text-warning-900'>
                The payout will be marked resolved and{' '}
                <strong>{formatNaira(selectedWithdrawal.amount)}</strong> will be unlocked and returned
                to the business available wallet balance.
              </p>
            )}

            <div>
              <label
                htmlFor='reject-reason'
                className='mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-ink-muted'
              >
                {selectedWithdrawal.status === 'failed' && selectedWithdrawal.needsReconciliation 
                  ? 'Reason for your decision'
                  : selectedWithdrawal.status === 'processing' 
                    ? 'Cancellation reason' 
                    : 'Rejection reason'}{' '}
                <span className='text-danger-600'>*</span>
              </label>
              <textarea
                id='reject-reason'
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder={
                  selectedWithdrawal.status === 'failed' && selectedWithdrawal.needsReconciliation
                    ? 'e.g. NIBSS switch down, merchant confirmed offline payment received, genuine gateway failureâ€¦'
                    : selectedWithdrawal.status === 'processing'
                      ? 'e.g. Transfer not found on Paystack, gateway timeout, cancelled at merchant requestâ€¦'
                      : 'e.g. Insufficient verification documents, suspicious activityâ€¦'
                }
                rows={4}
                maxLength={500}
                required
                className='w-full resize-none rounded border border-hairline-strong bg-panel p-2.5 text-xs text-ink placeholder:text-ink-subtle focus:border-primary-500 focus:ring-1 focus:ring-primary-500/30 focus:outline-none'
              />
              <p className='mt-1 text-[10px] text-ink-subtle'>
                {rejectReason.length}/500 characters (minimum 3)
              </p>
            </div>
          </div>
        )}
      </Modal>

      {/* Manual / offline settlement */}
      <Modal
        isOpen={showManualSettleModal && Boolean(selectedWithdrawal)}
        onClose={() => setShowManualSettleModal(false)}
        title='Settle Manually (Offline)'
        subtitle='Direct bank transfer dispatch'
        icon={<Building2 className='h-4 w-4' />}
        size='sm'
        footer={
          <>
            <Button
              variant='secondary'
              size='sm'
              onClick={() => setShowManualSettleModal(false)}
              disabled={processing}
            >
              Cancel
            </Button>
            <Button
              size='sm'
              onClick={handleManualSettle}
              isLoading={processing}
              disabled={!manualSessionRef.trim()}
            >
              <CheckCircle2 className='h-3.5 w-3.5' />
              Confirm Settle
            </Button>
          </>
        }
      >
        {selectedWithdrawal && (
          <div className='space-y-3'>
            <dl className='divide-y divide-hairline rounded border border-hairline bg-panel-subtle px-3'>
              <div className='flex items-center justify-between py-2'>
                <dt className='text-[11px] text-ink-muted'>Business</dt>
                <dd className='text-xs font-medium text-ink'>{selectedWithdrawal.businessName}</dd>
              </div>
              <div className='flex items-center justify-between py-2'>
                <dt className='text-[11px] text-ink-muted'>Total deducted (wallet)</dt>
                <dd className='font-mono text-xs font-semibold text-ink'>
                  {formatNaira(selectedWithdrawal.amount)}
                </dd>
              </div>
              <div className='flex items-center justify-between py-2'>
                <dt className='text-[11px] font-semibold text-ink'>Amount to transfer to user</dt>
                <dd className='font-mono text-sm font-semibold text-success-700'>
                  {formatNaira(net(selectedWithdrawal))}
                </dd>
              </div>
              <div className='py-2'>
                <dt className='text-[11px] text-ink-muted'>Beneficiary bank details</dt>
                <dd className='mt-0.5 text-xs font-medium text-ink'>
                  {selectedWithdrawal.destinationBankName}
                </dd>
                <dd className='font-mono text-[11px] font-semibold text-ink'>
                  {selectedWithdrawal.destinationAccountNum}
                </dd>
                <dd className='text-[10px] text-ink-muted'>
                  Account name: {selectedWithdrawal.destinationAccountName}
                </dd>
              </div>
            </dl>

            <p className='rounded border border-info-200 bg-info-50 px-3 py-2 text-[11px] text-info-700'>
              Transfer <strong>{formatNaira(net(selectedWithdrawal))}</strong> directly from your company
              bank app to the beneficiary details above. Once dispatched, paste the transaction
              reference or session ID below.
            </p>

            <div>
              <label
                htmlFor='manual-ref'
                className='mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-ink-muted'
              >
                Bank reference / session ID <span className='text-danger-600'>*</span>
              </label>
              <input
                id='manual-ref'
                type='text'
                value={manualSessionRef}
                onChange={(e) => setManualSessionRef(e.target.value)}
                placeholder='e.g. 000013260910123456789012345678 or GTB-TXN-â€¦'
                required
                className='h-8 w-full rounded border border-hairline-strong bg-panel px-2.5 font-mono text-xs text-ink placeholder:text-ink-subtle focus:border-primary-500 focus:ring-1 focus:ring-primary-500/30 focus:outline-none'
              />
            </div>

            <div>
              <label
                htmlFor='manual-notes'
                className='mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-ink-muted'
              >
                Internal notes <span className='font-normal normal-case text-ink-subtle'>(optional)</span>
              </label>
              <input
                id='manual-notes'
                type='text'
                value={manualNotes}
                onChange={(e) => setManualNotes(e.target.value)}
                placeholder='e.g. Dispatched via Access Bank Corporate Portal'
                className='h-8 w-full rounded border border-hairline-strong bg-panel px-2.5 text-xs text-ink placeholder:text-ink-subtle focus:border-primary-500 focus:ring-1 focus:ring-primary-500/30 focus:outline-none'
              />
            </div>
          </div>
        )}
      </Modal>

      {/* Detail */}
      <Modal
        isOpen={Boolean(detailWithdrawal)}
        onClose={() => setDetailWithdrawal(null)}
        title='Withdrawal Details'
        subtitle={detailWithdrawal?.transferReference}
        icon={<Building2 className='h-4 w-4' />}
        size='lg'
        footer={
          <>
            <Button variant='secondary' size='sm' onClick={() => setDetailWithdrawal(null)}>
              Close
            </Button>
            {detailWithdrawal?.status === 'pending' && (
              <>
                <Button variant='secondary' size='sm' onClick={() => fromDetail(openRejectModal)(detailWithdrawal)}>
                  <XCircle className='h-3.5 w-3.5' />
                  Reject
                </Button>
                <Button
                  variant='secondary'
                  size='sm'
                  onClick={() => fromDetail(openManualSettleModal)(detailWithdrawal)}
                >
                  <Building2 className='h-3.5 w-3.5' />
                  Settle Offline
                </Button>
                <Button onClick={() => fromDetail(openApproveModal)(detailWithdrawal)}>
                  <CheckCircle2 className='h-3.5 w-3.5' />
                  Approve &amp; Transfer
                </Button>
              </>
            )}
            {detailWithdrawal?.status === 'processing' && (
              <Button
                size='sm'
                disabled={processing}
                onClick={async () => {
                  await handleRequery(detailWithdrawal);
                  setDetailWithdrawal(null);
                }}
              >
                <Loader2 className={`h-3.5 w-3.5 ${processing ? 'animate-spin' : ''}`} />
                Re-query Paystack
              </Button>
            )}
            {detailWithdrawal?.status === 'failed' && detailWithdrawal.needsReconciliation && (
              <Button
                variant='danger'
                size='sm'
                onClick={() => fromDetail(openRejectModal)(detailWithdrawal)}
              >
                <AlertTriangle className='h-3.5 w-3.5' />
                Dispute
              </Button>
            )}
          </>
        }
      >
        {detailWithdrawal && (
          <div className='space-y-3'>
            <div className='flex flex-wrap items-center justify-between gap-2'>
              <WithdrawalStatus withdrawal={detailWithdrawal} />
              <PayoutModeBadge withdrawal={detailWithdrawal} />
            </div>

            <section className='rounded border border-hairline px-3 py-2.5'>
              <h3 className='text-[10px] font-semibold uppercase tracking-wider text-ink-muted'>
                Financial Breakdown
              </h3>
              <dl className='mt-1.5 space-y-1.5'>
                <div className='flex items-center justify-between'>
                  <dt className='text-[11px] text-ink-muted'>Requested amount (gross)</dt>
                  <dd className='font-mono text-sm font-semibold text-ink'>
                    {formatNaira(detailWithdrawal.amount)}
                  </dd>
                </div>
                {detailWithdrawal.fee > 0 && (
                  <div className='flex items-center justify-between'>
                    <dt className='text-[11px] text-ink-muted'>Paystack transfer fee</dt>
                    <dd className='font-mono text-xs text-ink-muted'>
                      âˆ’{formatNaira(detailWithdrawal.fee)}
                    </dd>
                  </div>
                )}
                <div className='flex items-center justify-between border-t border-hairline pt-1.5'>
                  <dt className='text-[11px] font-semibold text-ink'>Net remitted to bank</dt>
                  <dd className='font-mono text-sm font-semibold text-success-700'>
                    {formatNaira(net(detailWithdrawal))}
                  </dd>
                </div>
              </dl>
            </section>

            <section className='rounded border border-hairline px-3 py-2.5'>
              <h3 className='text-[10px] font-semibold uppercase tracking-wider text-ink-muted'>
                Destination Bank Details
              </h3>
              <dl className='mt-1.5 grid grid-cols-1 gap-3 sm:grid-cols-2'>
                <div>
                  <dt className='text-[11px] text-ink-muted'>Bank name</dt>
                  <dd className='mt-0.5 text-xs font-medium text-ink'>
                    {detailWithdrawal.destinationBankName}
                  </dd>
                </div>
                <div>
                  <dt className='text-[11px] text-ink-muted'>Account number</dt>
                  <dd className='mt-0.5 flex items-center gap-1.5'>
                    <span className='font-mono text-xs font-medium text-ink'>
                      {detailWithdrawal.destinationAccountNum}
                    </span>
                    <button
                      type='button'
                      onClick={() => handleCopy(detailWithdrawal.destinationAccountNum, 'Account number')}
                      aria-label='Copy account number'
                      title='Copy account number'
                      className='rounded p-1 text-ink-subtle transition-colors hover:bg-panel-subtle hover:text-ink focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:outline-none'
                    >
                      {copiedField === 'Account number' ? (
                        <Check className='h-3.5 w-3.5 text-success-600' />
                      ) : (
                        <Copy className='h-3.5 w-3.5' />
                      )}
                    </button>
                  </dd>
                </div>
                <div className='sm:col-span-2'>
                  <dt className='text-[11px] text-ink-muted'>Account holder name</dt>
                  <dd className='mt-0.5 text-xs font-medium text-ink'>
                    {detailWithdrawal.destinationAccountName || 'Merchant Connected Account'}
                  </dd>
                </div>
              </dl>
            </section>

            <section className='rounded border border-hairline px-3 py-2.5'>
              <h3 className='text-[10px] font-semibold uppercase tracking-wider text-ink-muted'>
                Audit &amp; Reference
              </h3>
              <dl className='mt-1.5 space-y-1.5'>
                <div className='flex items-center justify-between gap-3'>
                  <dt className='shrink-0 text-[11px] text-ink-muted'>Transfer reference</dt>
                  <dd className='flex min-w-0 items-center gap-1.5'>
                    <span className='truncate font-mono text-xs font-medium text-ink'>
                      {detailWithdrawal.transferReference}
                    </span>
                    <button
                      type='button'
                      onClick={() => handleCopy(detailWithdrawal.transferReference, 'Transfer reference')}
                      aria-label='Copy transfer reference'
                      title='Copy reference'
                      className='shrink-0 rounded p-1 text-ink-subtle transition-colors hover:bg-panel-subtle hover:text-ink focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:outline-none'
                    >
                      {copiedField === 'Transfer reference' ? (
                        <Check className='h-3.5 w-3.5 text-success-600' />
                      ) : (
                        <Copy className='h-3.5 w-3.5' />
                      )}
                    </button>
                  </dd>
                </div>
                <div className='flex items-center justify-between gap-3'>
                  <dt className='text-[11px] text-ink-muted'>Requested at</dt>
                  <dd className='text-[11px] text-ink'>{formatStamp(detailWithdrawal.initiatedAt)}</dd>
                </div>
                {detailWithdrawal.adminApprovedBy && (
                  <div className='flex items-center justify-between gap-3'>
                    <dt className='text-[11px] text-ink-muted'>Approved by</dt>
                    <dd className='text-[11px] text-ink'>
                      {detailWithdrawal.adminApprovedBy}
                      {detailWithdrawal.adminApprovedAt && ` (${formatStamp(detailWithdrawal.adminApprovedAt)})`}
                    </dd>
                  </div>
                )}
                {detailWithdrawal.completedAt && (
                  <div className='flex items-center justify-between gap-3'>
                    <dt className='text-[11px] text-ink-muted'>Completed at</dt>
                    <dd className='text-[11px] text-ink'>{formatStamp(detailWithdrawal.completedAt)}</dd>
                  </div>
                )}
                {detailWithdrawal.narration && (
                  <div className='flex items-center justify-between gap-3'>
                    <dt className='text-[11px] text-ink-muted'>Narration</dt>
                    <dd className='text-[11px] text-ink'>{detailWithdrawal.narration}</dd>
                  </div>
                )}
              </dl>

              {detailWithdrawal.needsReconciliation && (
                <div className='mt-2 rounded border border-danger-200 bg-danger-50 px-2.5 py-2 text-[11px] text-danger-700'>
                  <span className='flex items-center gap-1 font-semibold'>
                    <AlertTriangle className='h-3.5 w-3.5' aria-hidden='true' />
                    Reconciliation Required
                  </span>
                  <span className='mt-0.5 block'>
                    {detailWithdrawal.reconciliationReason ||
                      'Payout failed at gateway. Funds remain securely locked in the business wallet until an administrator releases them or confirms offline settlement.'}
                  </span>
                </div>
              )}

              {detailWithdrawal.failureReason && (
                <p className='mt-2 rounded border border-danger-200 bg-danger-50 px-2.5 py-2 text-[11px] text-danger-700'>
                  <span className='flex items-center gap-1 font-semibold'>
                    <XCircle className='h-3.5 w-3.5' aria-hidden='true' />
                    Failure reason
                  </span>
                  <span className='mt-0.5 block'>{detailWithdrawal.failureReason}</span>
                </p>
              )}
            </section>
          </div>
        )}
      </Modal>
    </div>
  );
}
