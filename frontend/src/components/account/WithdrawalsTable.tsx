import React, { useState } from 'react';
import {
  ArrowUpRight,
  Clock,
  Loader2,
  CheckCheck,
  XCircle,
  AlertTriangle,
  ArrowRight,
  Search,
  ChevronRight,
} from 'lucide-react';
import Button from '@/components/ui/Button.tsx';
import { Skeleton } from '@/components/ui/Skeleton.tsx';
import { formatNaira } from '@/lib/format';
import { useDisplayCurrency } from '@/hooks/useDisplayCurrency';

export interface PayoutItem {
  id: string;
  isAdvance?: boolean;
  amount: number;
  fee: number;
  netAmount: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  initiatedAt: string;
  transferReference: string;
  destinationBankName: string;
  destinationAccountNum: string;
  destinationAccountName?: string | null;
  completedAt?: string | null;
  narration?: string | null;
  failureReason?: string | null;
}

export interface PayoutPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface WithdrawalsTableProps {
  payouts: PayoutItem[];
  isLoading?: boolean;
  pagination?: PayoutPagination;
  onPageChange?: (page: number) => void;
  onSearchChange?: (search: string) => void;
  onStatusFilterChange?: (status: 'all' | 'completed' | 'pending' | 'failed' | 'advance') => void;
  onRequestWithdrawal?: () => void;
  onSelectPayout?: (payout: PayoutItem) => void;
  statusFilter?: 'all' | 'completed' | 'pending' | 'failed' | 'advance';
  searchQuery?: string;
  className?: string;
}

function formatDate(date: string): string {
  return new Date(date).toLocaleDateString('en-NG', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export const WithdrawalsTable: React.FC<WithdrawalsTableProps> = ({
  payouts,
  isLoading = false,
  pagination,
  onPageChange,
  onSearchChange,
  onStatusFilterChange,
  onRequestWithdrawal,
  onSelectPayout,
  statusFilter = 'all',
  searchQuery = '',
  className = '',
}) => {
  useDisplayCurrency();
  const [internalSearch, setInternalSearch] = useState(searchQuery);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (onSearchChange) {
      onSearchChange(internalSearch);
    }
  };

  return (
    <div
      data-testid="withdrawals-table"
      className={`divide-y divide-gray-100 ${className}`}
    >
      {/* Header & Filter Controls */}
      <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white">
        <div>
          <h4 className="text-sm font-bold text-gray-900">Withdrawals History</h4>
          <p className="text-xs text-gray-500 mt-0.5">
            Transfers sent to your commercial bank
          </p>
        </div>

        <div className="flex items-center gap-1.5 self-start sm:self-auto bg-gray-100/80 p-1 rounded-lg">
          {(['all', 'completed', 'pending', 'failed', 'advance'] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onStatusFilterChange && onStatusFilterChange(s)}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer capitalize ${
                statusFilter === s
                  ? 'bg-white text-gray-900 shadow-xs font-semibold'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {s === 'completed' ? 'Sent' : s === 'advance' ? 'Advances (ADV)' : s}
            </button>
          ))}
        </div>
      </div>

      {/* Search Input */}
      <form
        onSubmit={handleSearchSubmit}
        className="px-4 sm:px-5 py-2.5 bg-gray-50/50 border-b border-gray-100 flex items-center gap-2"
      >
        <Search className="h-3.5 w-3.5 text-gray-400 shrink-0" />
        <input
          type="text"
          value={internalSearch}
          onChange={(e) => {
            setInternalSearch(e.target.value);
            if (onSearchChange) onSearchChange(e.target.value);
          }}
          placeholder="Search by reference, bank, account, or narration…"
          className="w-full bg-transparent text-xs text-gray-800 placeholder-gray-400 focus:outline-none"
          aria-label="Search withdrawals"
        />
        {internalSearch && (
          <button
            type="button"
            onClick={() => {
              setInternalSearch('');
              if (onSearchChange) onSearchChange('');
            }}
            className="text-xs text-gray-400 hover:text-gray-600 cursor-pointer"
          >
            Clear
          </button>
        )}
      </form>

      {/* Payout Feed Content */}
      <div className="divide-y divide-gray-100">
        {isLoading ? (
          <div className="p-5 space-y-3" data-testid="withdrawals-loading">
            <div className="flex items-center justify-between mb-1">
              <Skeleton width={140} height={16} />
              <Skeleton width={80} height={16} />
            </div>
            <Skeleton width="100%" height={74} rounded="xl" />
            <Skeleton width="100%" height={74} rounded="xl" />
            <Skeleton width="100%" height={74} rounded="xl" />
          </div>
        ) : payouts.length === 0 ? (
          <div
            data-testid="withdrawals-empty-state"
            className="flex flex-col items-center py-14 text-center px-6"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-purple-50 text-purple-900 mb-3 border border-purple-100">
              <ArrowUpRight className="h-5 w-5 stroke-[2]" />
            </div>
            <p className="text-sm font-semibold text-gray-900">
              {internalSearch ? 'No matching withdrawals' : 'No withdrawals yet'}
            </p>
            <p className="text-xs text-gray-500 mt-1 max-w-xs">
              {internalSearch
                ? 'Try different keywords or reference numbers.'
                : 'When you transfer your wallet balance to your bank, your payout history will appear here.'}
            </p>
            {!internalSearch && onRequestWithdrawal && (
              <Button
                variant="primary"
                size="sm"
                subscriptionExempt={true}
                onClick={onRequestWithdrawal}
                className="mt-4 text-xs bg-purple-900 hover:bg-purple-950 text-white cursor-pointer"
              >
                Withdraw Funds <ArrowRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            )}
          </div>
        ) : (
          <div className="p-2 sm:p-3 space-y-2">
            {payouts.map((payout) => {
              const isPending = payout.status === 'pending';
              const isProcessing = payout.status === 'processing';
              const isCompleted = payout.status === 'completed';
              const isFailed = payout.status === 'failed';
              const isAdvance = Boolean(payout.isAdvance || payout.transferReference?.startsWith('ADV-'));

              return (
                <div
                  key={payout.id}
                  data-testid={`payout-row-${payout.id}`}
                  onClick={() => onSelectPayout?.(payout)}
                  className="p-3.5 sm:p-4 rounded-xl border border-gray-150 bg-white hover:border-purple-200 hover:bg-purple-50/20 transition-all cursor-pointer group shadow-2xs"
                >
                  {/* Top: Destination narration + Amount */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2.5 min-w-0">
                      <div
                        className={`flex h-8.5 w-8.5 shrink-0 items-center justify-center rounded-xl border mt-0.5 ${
                          isCompleted
                            ? 'bg-emerald-50 border-emerald-200/80 text-emerald-700'
                            : isFailed
                            ? 'bg-rose-50 border-rose-200/80 text-rose-700'
                            : isProcessing
                            ? 'bg-blue-50 border-blue-200/80 text-blue-700'
                            : 'bg-amber-50 border-amber-200/80 text-amber-700'
                        }`}
                      >
                        <ArrowUpRight className="h-4 w-4 stroke-[2.2]" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p className="text-xs font-bold text-gray-900 truncate group-hover:text-purple-950 transition-colors">
                            {payout.narration || (isAdvance ? 'Settlement Advance → Wallet' : `Payout to ${payout.destinationBankName}`)}
                          </p>
                          {isAdvance && (
                            <span
                              data-testid="advance-badge"
                              className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-extrabold bg-purple-100 text-purple-900 border border-purple-200"
                            >
                              ADV
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-gray-500 truncate mt-0.5 font-medium">
                          {isAdvance
                            ? 'Credited to WallX Wallet'
                            : `${payout.destinationBankName} · •••• ${payout.destinationAccountNum?.slice(-4)}`}
                        </p>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold tabular-nums font-mono text-gray-950">
                        −{formatNaira(payout.amount)}
                      </p>
                      <div className="text-[10px] text-gray-500 font-medium mt-0.5">
                        <span>Net: {formatNaira(payout.netAmount)}</span>
                        {payout.fee > 0 && (
                          <span className="text-gray-400 ml-1">({formatNaira(payout.fee)} fee)</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Bottom: Status Pill, Date, and Details Indicator */}
                  <div className="mt-3 pt-2.5 border-t border-gray-100 flex items-center justify-between gap-2 text-[11px] text-gray-500">
                    <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                      {isPending && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                          <Clock className="h-3 w-3" /> Queued
                        </span>
                      )}
                      {isProcessing && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 border border-blue-200 px-2 py-0.5 text-[10px] font-bold text-blue-800">
                          <Loader2 className="h-3 w-3 animate-spin" /> Processing
                        </span>
                      )}
                      {isCompleted && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                          <CheckCheck className="h-3 w-3" /> {isAdvance ? 'Credited to Wallet' : 'Sent to Bank'}
                        </span>
                      )}
                      {isFailed && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 border border-rose-200 px-2 py-0.5 text-[10px] font-bold text-rose-800">
                          <XCircle className="h-3 w-3" /> Failed
                        </span>
                      )}
                      <span className="text-[10px] text-gray-300">·</span>
                      <span className="text-[11px] text-gray-500 font-medium">{formatDate(payout.initiatedAt)}</span>
                    </div>

                    <span className="text-[11px] text-purple-900 group-hover:text-purple-950 font-semibold inline-flex items-center gap-0.5 shrink-0">
                      View Details <ChevronRight className="h-3.5 w-3.5" />
                    </span>
                  </div>

                  {/* Failure Callout (if failed) */}
                  {isFailed && payout.failureReason && (
                    <div className="mt-2 rounded-lg bg-rose-50 border border-rose-200/80 p-2 text-xs text-rose-800 flex items-start gap-1.5">
                      <AlertTriangle className="h-3.5 w-3.5 text-rose-600 shrink-0 mt-0.5" />
                      <span className="text-[11px] font-medium">{payout.failureReason}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Pagination Footer */}
      {pagination && pagination.totalPages > 1 && (
        <div className="p-3 border-t border-gray-100 bg-gray-50/60 flex items-center justify-between text-xs text-gray-500">
          <span>
            Page {pagination.page} of {pagination.totalPages} ({pagination.total} total)
          </span>
          <div className="flex gap-1.5">
            <button
              type="button"
              disabled={pagination.page <= 1}
              onClick={() => onPageChange && onPageChange(pagination.page - 1)}
              className="px-2.5 py-1 bg-white border border-gray-200 rounded font-medium disabled:opacity-40 cursor-pointer hover:bg-gray-50"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={pagination.page >= pagination.totalPages}
              onClick={() => onPageChange && onPageChange(pagination.page + 1)}
              className="px-2.5 py-1 bg-white border border-gray-200 rounded font-medium disabled:opacity-40 cursor-pointer hover:bg-gray-50"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default WithdrawalsTable;
