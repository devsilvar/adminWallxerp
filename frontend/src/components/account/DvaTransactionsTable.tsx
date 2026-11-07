import React, { useState, useMemo } from 'react';
import {
  ArrowDownLeft,
  CheckCheck,
  Clock,
  ChevronRight,
  Search,
} from 'lucide-react';
import { Skeleton } from '@/components/ui/Skeleton.tsx';
import { formatNaira } from '@/lib/format';
import { useDisplayCurrency } from '@/hooks/useDisplayCurrency';

export interface DvaTransactionItem {
  id: string;
  amount: number;
  type: 'inbound';
  status: 'completed' | 'pending';
  description: string;
  date: string;
  referenceId?: string;
  needsVerification: boolean;
  customerHint?: string;
}

export interface DvaTransactionsTableProps {
  transactions: DvaTransactionItem[];
  isLoading?: boolean;
  onSelectTransaction: (txn: DvaTransactionItem) => void;
  className?: string;
}

function formatDate(date: string): string {
  return new Date(date).toLocaleDateString('en-NG', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export const DvaTransactionsTable: React.FC<DvaTransactionsTableProps> = ({
  transactions,
  isLoading = false,
  onSelectTransaction,
  className = '',
}) => {
  useDisplayCurrency();
  const [filter, setFilter] = useState<'all' | 'verified' | 'pending'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredTransactions = useMemo(() => {
    return transactions.filter((t) => {
      if (filter === 'verified' && t.status !== 'completed') return false;
      if (filter === 'pending' && t.status !== 'pending') return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchDesc = t.description.toLowerCase().includes(q);
        const matchRef = t.referenceId?.toLowerCase().includes(q);
        const matchAmount = String(t.amount).includes(q);
        return matchDesc || matchRef || matchAmount;
      }
      return true;
    });
  }, [transactions, filter, searchQuery]);

  const settledCount = useMemo(
    () => transactions.filter((t) => t.status === 'completed').length,
    [transactions]
  );
  const pendingCount = useMemo(
    () => transactions.filter((t) => t.status === 'pending').length,
    [transactions]
  );

  return (
    <div
      data-testid="dva-transactions-table"
      className={`divide-y divide-gray-100 ${className}`}
    >
      {/* Header filter & count strip */}
      <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white">
        <div>
          <h4 className="text-sm font-bold text-gray-900">Customer Inflows</h4>
          <p className="text-xs text-gray-500 mt-0.5">
            Direct deposits to your dedicated account
          </p>
        </div>

        <div className="flex items-center gap-1.5 self-start sm:self-auto bg-gray-100/80 p-1 rounded-lg">
          <button
            type="button"
            onClick={() => setFilter('all')}
            className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
              filter === 'all'
                ? 'bg-white text-gray-900 shadow-xs font-semibold'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            All ({transactions.length})
          </button>
          <button
            type="button"
            onClick={() => setFilter('verified')}
            className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
              filter === 'verified'
                ? 'bg-white text-gray-900 shadow-xs font-semibold'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Settled ({settledCount})
          </button>
          <button
            type="button"
            onClick={() => setFilter('pending')}
            className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
              filter === 'pending'
                ? 'bg-white text-amber-700 shadow-xs font-semibold'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Pending ({pendingCount})
          </button>
        </div>
      </div>

      {/* Search Bar */}
      {(transactions.length > 0 || searchQuery) && (
        <div className="px-5 py-2.5 bg-gray-50/50 border-b border-gray-100 flex items-center gap-2">
          <Search className="h-3.5 w-3.5 text-gray-400 shrink-0" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search transfersâ€¦"
            className="w-full bg-transparent text-xs text-gray-800 placeholder-gray-400 focus:outline-none"
            aria-label="Search transfers"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="text-xs text-gray-400 hover:text-gray-600 cursor-pointer"
            >
              Clear
            </button>
          )}
        </div>
      )}

      {/* List Rows */}
      <div className="divide-y divide-gray-100">
        {isLoading ? (
          <div className="p-6 space-y-3" data-testid="inflows-loading">
            <div className="flex items-center justify-between mb-1">
              <Skeleton width={140} height={16} />
              <Skeleton width={80} height={16} />
            </div>
            <Skeleton width="100%" height={52} rounded="lg" />
            <Skeleton width="100%" height={52} rounded="lg" />
            <Skeleton width="100%" height={52} rounded="lg" />
          </div>
        ) : filteredTransactions.length === 0 ? (
          <div
            data-testid="inflows-empty-state"
            className="flex flex-col items-center py-14 text-center px-6"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 mb-3">
              <ArrowDownLeft className="h-5 w-5 text-gray-400" />
            </div>
            <p className="text-sm font-semibold text-gray-900">
              {searchQuery ? 'No matching transfers' : 'No transfers yet'}
            </p>
            <p className="text-xs text-gray-500 mt-1 max-w-xs">
              {searchQuery
                ? 'Try different keywords.'
                : 'Deposits to your dedicated virtual account will appear here instantly.'}
            </p>
          </div>
        ) : (
          filteredTransactions.map((txn) => (
            <div
              key={txn.id}
              data-testid={`inflow-row-${txn.id}`}
              onClick={() => onSelectTransaction(txn)}
              className="flex items-center gap-4 px-5 py-3.5 hover:bg-gray-50/80 transition-colors cursor-pointer group"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-50 border border-emerald-100 text-emerald-600 group-hover:bg-emerald-100 transition-colors">
                <ArrowDownLeft className="h-4 w-4 stroke-[2]" />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-xs font-semibold text-gray-900 truncate group-hover:text-emerald-700 transition-colors">
                    {txn.description}
                  </p>
                  {txn.needsVerification && (
                    <span className="inline-flex items-center gap-1 rounded bg-amber-50 border border-amber-200/60 px-1.5 py-0.2 text-[10px] font-medium text-amber-700">
                      Review
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 text-[11px] text-gray-500 mt-0.5">
                  <span>{formatDate(txn.date)}</span>
                  {txn.referenceId && (
                    <>
                      <span>Â·</span>
                      <span className="font-mono text-[10px] text-gray-400 truncate max-w-[130px]">
                        {txn.referenceId}
                      </span>
                    </>
                  )}
                </div>
              </div>

              <div className="text-right shrink-0">
                <p className="text-sm font-bold tabular-nums font-mono text-emerald-600">
                  +{formatNaira(txn.amount)}
                </p>
                <div className="mt-0.5 flex items-center justify-end gap-1">
                  {txn.status === 'completed' ? (
                    <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600 font-medium">
                      <CheckCheck className="h-3 w-3" /> Settled
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[11px] text-amber-600 font-medium">
                      <Clock className="h-3 w-3" /> Pending
                    </span>
                  )}
                  <ChevronRight className="h-3.5 w-3.5 text-gray-400 group-hover:text-gray-600 transition-colors ml-1" />
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default DvaTransactionsTable;
