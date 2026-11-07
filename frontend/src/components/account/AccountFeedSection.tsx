import React from 'react';
import DvaTransactionsTable, { type DvaTransactionItem } from './DvaTransactionsTable.tsx';
import WithdrawalsTable, { type PayoutItem, type PayoutPagination } from './WithdrawalsTable.tsx';

export interface AccountFeedSectionProps {
  activeTab: 'inflows' | 'withdrawals';
  onTabChange: (tab: 'inflows' | 'withdrawals') => void;
  hasPendingPayout: boolean;
  transactions: DvaTransactionItem[];
  isTxnsLoading: boolean;
  onSelectTransaction: (txn: DvaTransactionItem) => void;
  payouts: PayoutItem[];
  isPayoutsLoading: boolean;
  payoutPagination: PayoutPagination;
  payoutStatusFilter: 'all' | 'completed' | 'pending' | 'failed' | 'advance';
  payoutSearch: string;
  onStatusFilterChange: (status: 'all' | 'completed' | 'pending' | 'failed' | 'advance') => void;
  onSearchChange: (search: string) => void;
  onPageChange: (page: number) => void;
  onRequestWithdrawal?: () => void;
  onSelectPayout?: (payout: PayoutItem) => void;
}

export const AccountFeedSection: React.FC<AccountFeedSectionProps> = ({
  activeTab,
  onTabChange,
  hasPendingPayout,
  transactions,
  isTxnsLoading,
  onSelectTransaction,
  payouts,
  isPayoutsLoading,
  payoutPagination,
  payoutStatusFilter,
  payoutSearch,
  onStatusFilterChange,
  onSearchChange,
  onPageChange,
  onRequestWithdrawal,
  onSelectPayout,
}) => {
  return (
    <div data-testid="account-feed-section" className="lg:col-span-2 rounded-xl border border-gray-200/80 bg-white shadow-xs overflow-hidden">
      <div className="p-4 border-b border-gray-100 flex items-center gap-3">
        <button
          type="button"
          onClick={() => onTabChange('inflows')}
          className={`text-sm font-bold pb-1 border-b-2 cursor-pointer ${
            activeTab === 'inflows'
              ? 'border-purple-900 text-gray-900 font-extrabold'
              : 'border-transparent text-gray-400 hover:text-gray-700'
          }`}
        >
          Customer Inflows
        </button>
        <span className="text-gray-300">/</span>
        <button
          type="button"
          onClick={() => onTabChange('withdrawals')}
          className={`text-sm font-bold pb-1 border-b-2 cursor-pointer flex items-center gap-1.5 ${
            activeTab === 'withdrawals'
              ? 'border-purple-900 text-gray-900 font-extrabold'
              : 'border-transparent text-gray-400 hover:text-gray-700'
          }`}
        >
          <span>Withdrawals</span>
          {hasPendingPayout && (
            <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
          )}
        </button>
      </div>

      {activeTab === 'inflows' ? (
        <DvaTransactionsTable
          transactions={transactions}
          isLoading={isTxnsLoading}
          onSelectTransaction={onSelectTransaction}
        />
      ) : (
        <WithdrawalsTable
          payouts={payouts}
          isLoading={isPayoutsLoading}
          pagination={payoutPagination}
          statusFilter={payoutStatusFilter}
          searchQuery={payoutSearch}
          onStatusFilterChange={onStatusFilterChange}
          onSearchChange={onSearchChange}
          onPageChange={onPageChange}
          onRequestWithdrawal={onRequestWithdrawal}
          onSelectPayout={onSelectPayout}
        />
      )}
    </div>
  );
};

export default AccountFeedSection;
