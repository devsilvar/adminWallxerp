import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowUpRight,
  Landmark,
  RefreshCw,
  ShieldAlert,
  Zap,
} from 'lucide-react';
import Button from '@/components/ui/Button.tsx';
import { Skeleton } from '@/components/ui/Skeleton.tsx';
import PayoutWithdrawalModal from '@/components/PayoutWithdrawalModal.tsx';
import { formatLagosDate, formatNaira } from '@/lib/format';
import { useDisplayCurrency } from '@/hooks/useDisplayCurrency';
import { useAuthStore } from '@/stores/auth.store.ts';
import { useBusinessStore } from '@/stores/business.store.ts';
import { useSettlementStore } from '@/stores/settlement.store.ts';
import { hasPerm } from '@/components/auth/PermissionGate.tsx';
import type { SettlementInflow } from '@/types';

/**
 * Mirrors SETTLED_SALE_STATUSES (backend/src/shared/helpers/settled-status.ts:9).
 * A DVA inflow in one of these statuses is counted in the settlement buckets;
 * anything else is still awaiting verification and is not money the merchant
 * can take out yet.
 */
const SETTLED_SALE_STATUSES = ['confirmed', 'completed'];

type InflowState = 'settling' | 'withdrawable' | 'unverified';

const INFLOW_STATE_META: Record<
  InflowState,
  { label: string; chip: string; dot: string }
> = {
  settling: {
    label: 'In settlement',
    chip: 'bg-amber-50 border-amber-200 text-amber-800',
    dot: 'bg-amber-500',
  },
  withdrawable: {
    label: 'Withdrawable',
    chip: 'bg-emerald-50 border-emerald-200 text-emerald-800',
    dot: 'bg-emerald-500',
  },
  unverified: {
    label: 'Awaiting verification',
    chip: 'bg-gray-100 border-gray-200 text-gray-600',
    dot: 'bg-gray-400',
  },
};

function inflowState(inflow: SettlementInflow, _now: number): InflowState {
  if (inflow.status === 'reversed' || inflow.status === 'disputed') return 'unverified';
  if (!inflow.releasedAt && !inflow.released) {
    return SETTLED_SALE_STATUSES.includes(inflow.status)
      ? 'settling'
      : 'unverified';
  }
  return 'withdrawable';
}

export default function Settlement() {
  useDisplayCurrency();
  const biz = useBusinessStore((s) => s.activeBusiness);
  const businesses = useBusinessStore((s) => s.businesses);
  const user = useAuthStore((s) => s.user);

  const preview = useSettlementStore((s) => s.preview);
  const loadingPreview = useSettlementStore((s) => s.loadingPreview);
  const inflows = useSettlementStore((s) => s.inflows);
  const loadingInflows = useSettlementStore((s) => s.loadingInflows);
  const inflowPagination = useSettlementStore((s) => s.inflowPagination);
  const fetchPreview = useSettlementStore((s) => s.fetchPreview);
  const fetchInflows = useSettlementStore((s) => s.fetchInflows);

  const [showPayoutModal, setShowPayoutModal] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const isOwner = Boolean(
    biz ? (biz.myRole === 'owner' || biz.userId === user?.id) : user?.isOwnerAccount !== false
  );
  const canView = Boolean(
    isOwner ||
      hasPerm('wallet.read', biz, user?.id) ||
      biz?.myRole === 'manager' ||
      biz?.myRole === 'accountant'
  );

  // The wallet is one per USER and pools every business that user owns, so the
  // headline figures are always pooled. The timeline below is per business —
  // the page says so explicitly rather than letting the two be confused.
  const isPooled = businesses.length > 1;
  const businessId = biz?.id;

  useEffect(() => {
    if (!businessId || !canView) return;
    void fetchPreview(businessId);
    void fetchInflows(businessId, 1);
  }, [businessId, canView, fetchPreview, fetchInflows]);

  // Refresh clock every 60 seconds so settlement status updates when time crosses boundary
  useEffect(() => {
    const interval = setInterval(() => {
      setNow(Date.now());
    }, 60000); // 60 seconds

    return () => clearInterval(interval);
  }, []);

  const handleRefresh = async () => {
    if (!businessId) return;
    setIsRefreshing(true);
    setNow(Date.now()); // Update now on manual refresh
    try {
      await Promise.allSettled([
        fetchPreview(businessId),
        fetchInflows(businessId, 1),
      ]);
    } finally {
      setIsRefreshing(false);
    }
  };

  if (!biz) {
    return (
      <div className='flex items-center justify-center h-[60vh]'>
        <p className='text-sm text-gray-500'>
          Select a business to view its settlement
        </p>
      </div>
    );
  }

  if (!canView) {
    return (
      <div className='mx-auto max-w-md py-16 px-4 text-center animate-fade-in'>
        <div className='mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 border border-amber-200 text-amber-600 mb-4 shadow-xs'>
          <ShieldAlert className='h-7 w-7' />
        </div>
        <h2 className='text-base font-bold text-gray-900'>
          Settlement Access Restricted
        </h2>
        <p className='mt-2 text-xs text-gray-600 leading-relaxed'>
          You do not have permission to view settlement details for{' '}
          <strong>{biz.businessName}</strong>. Access is restricted to the Business Owner,
          Manager, and Accountant.
        </p>
        <div className='mt-6 flex justify-center'>
          <Button
            variant='secondary'
            size='sm'
            subscriptionExempt={true}
            onClick={() => window.history.back()}
            className='text-xs'
          >
            Go back
          </Button>
        </div>
      </div>
    );
  }

  const available = preview?.availableForWithdrawal ?? 0;
  const inSettlement = preview?.pooledPendingSettlement ?? preview?.pendingSettlement ?? 0;
  const withdrawn = preview?.pooledTotalWithdrawn ?? preview?.totalWithdrawn ?? 0;
  const totalReceived = preview?.pooledInflows ?? preview?.totalInflows ?? 0;
  const dailyLimit = preview?.dailyPayoutLimit ?? 0;
  const dailyPaidOut = preview?.dailyPaidOut ?? 0;
  const dailyRemaining = preview?.dailyRemaining ?? null;
  const autoPayoutEnabled = Boolean(preview?.autoPayoutEnabled);
  const bankName = preview?.settlementAccount?.bankName ?? 'Not connected';
  const accountNumber = preview?.settlementAccount?.accountNumber ?? null;

  const scopeLabel = isPooled
    ? `Across all ${businesses.length} businesses`
    : 'This business';

  return (
    <div className='mx-auto max-w-6xl space-y-6 animate-fade-in pb-16'>
      {/* Header */}
      <div className='flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between'>
        <div>
          <h1 className='text-xl font-bold text-gray-900'>Settlement</h1>
          <p className='text-xs text-gray-500 mt-0.5'>
            Your money, and when you can withdraw it ·{' '}
            <Link to='/account?tab=withdrawals' className='text-primary-700 hover:text-primary-900 font-medium'>
              Withdrawal history →
            </Link>
          </p>
        </div>
        <div className='flex items-center gap-2'>
          <Button
            variant='secondary'
            size='sm'
            onClick={handleRefresh}
            isLoading={isRefreshing}
            className='text-xs'
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1 ${isRefreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          {isOwner && (
            <Button
              size='sm'
              onClick={() => setShowPayoutModal(true)}
              className='text-xs'
            >
              <ArrowUpRight className='h-3.5 w-3.5 mr-1' />
              Withdraw
            </Button>
          )}
        </div>
      </div>

      {isPooled && (
        <p className='rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-900'>
          <strong>Pooled wallet —</strong> your {businesses.length} businesses share one wallet,
          so the figures above reflect your combined balance. Withdrawals draw from this
          shared pot. The payment timeline below shows only{' '}
          <strong>{biz.businessName}</strong>'s incoming payments.
        </p>
      )}

      {/* KPI strip */}
      <div className='grid grid-cols-2 lg:grid-cols-5 gap-px bg-gray-200 rounded-xl overflow-hidden'>
        <div className='bg-white p-4'>
          <p className='text-[10px] font-medium text-gray-400 uppercase tracking-wide'>
            In settlement
          </p>
          {loadingPreview && !preview ? (
            <Skeleton width={90} height={24} className='mt-1' />
          ) : (
            <p className='text-lg font-bold text-amber-600 tabular-nums mt-1'>
              {formatNaira(inSettlement)}
            </p>
          )}
          <p className='text-[10px] text-gray-400 mt-1'>Held until next business day</p>
        </div>

        <div className='bg-white p-4'>
          <p className='text-[10px] font-medium text-gray-400 uppercase tracking-wide'>
            Daily limit left
          </p>
          {loadingPreview && !preview ? (
            <Skeleton width={90} height={24} className='mt-1' />
          ) : (
            <p className='text-lg font-bold text-gray-900 tabular-nums mt-1'>
              {dailyRemaining === null
                ? 'No limit'
                : formatNaira(dailyRemaining)}
            </p>
          )}
          <p className='text-[10px] text-gray-400 mt-1'>
            {dailyLimit > 0
              ? `${formatNaira(dailyPaidOut)} of ${formatNaira(dailyLimit)} used today`
              : 'Unlimited daily payouts'}
          </p>
        </div>

        <div className='bg-white p-4'>
          <p className='text-[10px] font-medium text-gray-400 uppercase tracking-wide'>
            Withdrawn
          </p>
          {loadingPreview && !preview ? (
            <Skeleton width={90} height={24} className='mt-1' />
          ) : (
            <p className='text-lg font-bold text-purple-700 tabular-nums mt-1'>
              {formatNaira(withdrawn)}
            </p>
          )}
          <p className='text-[10px] text-gray-400 mt-1'>Sent to your bank</p>
        </div>

        <div className='bg-white p-4'>
          <p className='text-[10px] font-medium text-gray-400 uppercase tracking-wide'>
            Total received
          </p>
          {loadingPreview && !preview ? (
            <Skeleton width={90} height={24} className='mt-1' />
          ) : (
            <p className='text-lg font-bold text-gray-900 tabular-nums mt-1'>
              {formatNaira(totalReceived)}
            </p>
          )}
          <p className='text-[10px] text-gray-400 mt-1'>{scopeLabel}</p>
        </div>

        <div className='bg-gray-900 p-4 text-white'>
          <p className='text-[10px] font-medium text-gray-400 uppercase tracking-wide'>
            Available to withdraw
          </p>
          {loadingPreview && !preview ? (
            <Skeleton width={110} height={24} className='mt-1 bg-white/20' />
          ) : (
            <p className='text-lg font-bold text-emerald-400 tabular-nums mt-1'>
              {formatNaira(available)}
            </p>
          )}
          <p className='text-[10px] text-gray-500 mt-1'>Ready to send to your bank</p>
        </div>
      </div>

      {/* Advance Callout */}
      {inSettlement > 0 && isOwner && (
        <div className='rounded-xl border border-purple-200/80 bg-gradient-to-r from-purple-50/80 via-white to-purple-50/30 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shadow-sm'>
          <div className='flex items-start gap-3'>
            <div className='flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-purple-900 text-purple-100'>
              <Zap className='h-4 w-4 fill-purple-300 stroke-purple-900' />
            </div>
            <div>
              <div className='flex items-center gap-2'>
                <h3 className='text-xs font-bold text-gray-900'>
                  Need funds before next business day?
                </h3>
                <span className='inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-900 border border-purple-200'>
                  30% Advance Available
                </span>
              </div>
              <p className='text-xs text-gray-600 mt-0.5'>
                Access up to {formatNaira(Math.floor(inSettlement * 0.3))} instantly in your wallet ahead of the T+1 settlement cycle.
              </p>
            </div>
          </div>
          <Link
            to='/account#settlement-advance'
            className='inline-flex items-center justify-center rounded-lg bg-purple-900 px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-purple-800 transition shrink-0'
          >
            Get Advance →
          </Link>
        </div>
      )}

      {/* Payout mode — read-only. The toggle lives on /account. */}
      <div className='rounded-xl border border-gray-200/80 bg-white p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4'>
        <div className='min-w-0'>
          <p className='text-[10px] font-medium text-gray-400 uppercase tracking-wide'>
            Payout mode
          </p>
          <div className='flex items-center gap-2 mt-1'>
            <p className='text-sm font-bold text-gray-900'>
              {autoPayoutEnabled ? 'Automatic (T+1)' : 'Manual (On-Demand)'}
            </p>
            <span
              className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                autoPayoutEnabled
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                  : 'bg-gray-100 border-gray-200 text-gray-600'
              }`}
            >
              {autoPayoutEnabled ? 'Automatic' : 'Manual'}
            </span>
          </div>
          <p className='text-[11px] text-gray-500 mt-1'>
            {autoPayoutEnabled
              ? 'Your balance is automatically paid out to your bank the next business day. No PIN required.'
              : 'Withdraw anytime with your 4-digit PIN. You control when money moves to your bank.'}
          </p>
        </div>
        <div className='sm:text-right shrink-0'>
          <p className='text-[10px] font-medium text-gray-400 uppercase tracking-wide'>
            Payout bank
          </p>
          <p className='text-xs font-semibold text-gray-900 mt-0.5'>
            {accountNumber
              ? `${bankName} ····${accountNumber.slice(-4)}`
              : 'No bank account connected'}
          </p>
          <Link
            to='/account'
            className='inline-flex items-center gap-1 text-[11px] font-semibold text-primary-700 hover:text-primary-900 mt-1'
          >
            <Landmark className='h-3 w-3' />
            Manage payout account
          </Link>
        </div>
      </div>

      {/* Settlement timeline */}
      <div className='rounded-xl border border-gray-200/80 bg-white overflow-hidden'>
        <div className='p-4 sm:p-5 border-b border-gray-100'>
          <h2 className='text-sm font-bold text-gray-900'>Settlement timeline</h2>
          <p className='text-xs text-gray-500 mt-0.5'>
            Money received is available on the next business day — weekends are excluded, so a Friday payment is available on Monday.
          </p>
        </div>

        {loadingInflows && inflows.length === 0 ? (
          <div className='p-5 space-y-3'>
            <Skeleton width={140} height={16} />
            <Skeleton width='100%' height={64} rounded='xl' />
            <Skeleton width='100%' height={64} rounded='xl' />
            <Skeleton width='100%' height={64} rounded='xl' />
          </div>
        ) : inflows.length === 0 ? (
          <div className='flex flex-col items-center py-14 text-center px-6'>
            <div className='flex h-12 w-12 items-center justify-center rounded-full bg-primary-50 text-primary-700 mb-3 border border-primary-100'>
              <Landmark className='h-5 w-5 stroke-[2]' />
            </div>
            <p className='text-sm font-semibold text-gray-900'>No payments received yet</p>
            <p className='text-xs text-gray-500 mt-1 max-w-xs'>
              Payments made into your dedicated virtual account will appear here, along with
              the date each one becomes available to withdraw.
            </p>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <table className='hidden md:table w-full text-left'>
              <thead>
                <tr className='border-b border-gray-100 bg-gray-50/60'>
                  <th className='px-5 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400'>
                    Received
                  </th>
                  <th className='px-5 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400'>
                    Payer
                  </th>
                  <th className='px-5 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 text-right'>
                    Amount
                  </th>
                  <th className='px-5 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400'>
                    Settles on
                  </th>
                  <th className='px-5 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400'>
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className='divide-y divide-gray-100'>
                {inflows.map((inflow) => {
                  const state = inflowState(inflow, now);
                  const meta = INFLOW_STATE_META[state];
                  return (
                    <tr key={inflow.id} className='hover:bg-gray-50/50'>
                      <td className='px-5 py-3 text-xs text-gray-600 whitespace-nowrap'>
                        {formatLagosDate(inflow.transactionDate)}
                      </td>
                      <td className='px-5 py-3 text-xs text-gray-800'>
                        {inflow.customerName || inflow.customerHint || 'Customer'}
                      </td>
                      <td className='px-5 py-3 text-xs font-mono font-semibold text-gray-900 text-right tabular-nums whitespace-nowrap'>
                        {formatNaira(inflow.amount)}
                      </td>
                      <td className='px-5 py-3 text-xs text-gray-600 whitespace-nowrap'>
                        {inflow.settledAt ? formatLagosDate(inflow.settledAt) : '—'}
                      </td>
                      <td className='px-5 py-3'>
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-bold ${meta.chip}`}
                        >
                          <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
                          {meta.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Mobile cards */}
            <div className='md:hidden p-3 space-y-2'>
              {inflows.map((inflow) => {
                const state = inflowState(inflow, now);
                const meta = INFLOW_STATE_META[state];
                return (
                  <div
                    key={inflow.id}
                    className='rounded-xl border border-gray-150 bg-white p-3.5'
                  >
                    <div className='flex items-start justify-between gap-3'>
                      <div className='min-w-0'>
                        <p className='text-xs font-bold text-gray-900 truncate'>
                          {inflow.customerName || inflow.customerHint || 'Customer'}
                        </p>
                        <p className='text-[11px] text-gray-500 mt-0.5'>
                          Received {formatLagosDate(inflow.transactionDate)}
                        </p>
                      </div>
                      <p className='text-sm font-bold font-mono text-gray-950 tabular-nums shrink-0'>
                        {formatNaira(inflow.amount)}
                      </p>
                    </div>
                    <div className='mt-3 pt-2.5 border-t border-gray-100 flex items-center justify-between gap-2'>
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-bold ${meta.chip}`}
                      >
                        <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
                        {meta.label}
                      </span>
                      {inflow.settledAt && (
                        <span className='text-[11px] text-gray-500'>
                          Available {formatLagosDate(inflow.settledAt)}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {inflowPagination.totalPages > 1 && (
              <div className='p-3 border-t border-gray-100 bg-gray-50/60 flex items-center justify-between text-xs text-gray-500'>
                <span>
                  Page {inflowPagination.page} of {inflowPagination.totalPages} (
                  {inflowPagination.total} total)
                </span>
                <div className='flex gap-1.5'>
                  <button
                    type='button'
                    disabled={inflowPagination.page <= 1}
                    onClick={() => businessId && fetchInflows(businessId, inflowPagination.page - 1)}
                    className='px-2.5 py-1 bg-white border border-gray-200 rounded font-medium disabled:opacity-40 cursor-pointer hover:bg-gray-50'
                  >
                    Previous
                  </button>
                  <button
                    type='button'
                    disabled={inflowPagination.page >= inflowPagination.totalPages}
                    onClick={() => businessId && fetchInflows(businessId, inflowPagination.page + 1)}
                    className='px-2.5 py-1 bg-white border border-gray-200 rounded font-medium disabled:opacity-40 cursor-pointer hover:bg-gray-50'
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <PayoutWithdrawalModal
        isOpen={showPayoutModal}
        onClose={() => setShowPayoutModal(false)}
        businessId={biz.id}
        onSuccess={() => {
          setShowPayoutModal(false);
          void handleRefresh();
        }}
      />
    </div>
  );
}
