import React from 'react';
import { ArrowDownLeft, ArrowUpRight, Building2, CheckCheck, Clock, Landmark } from 'lucide-react';
import { formatNaira } from '@/lib/format';
import { useDisplayCurrency } from '@/hooks/useDisplayCurrency';

export interface AccountMetricStripProps {
  totalInflows: number;
  completedTransfersCount: number;
  totalWithdrawn: number;
  pendingWithdrawn: number;
  receivedThisMonth?: number;
  businessBalance?: number;
  businessName?: string;
  isPooled?: boolean;
  payoutBankName: string;
  payoutAccountNumber?: string;
}

export const AccountMetricStrip: React.FC<AccountMetricStripProps> = ({
  totalInflows,
  completedTransfersCount,
  totalWithdrawn,
  pendingWithdrawn,
  receivedThisMonth: _receivedThisMonth = 0,
  businessBalance,
  businessName,
  isPooled = false,
  payoutBankName,
  payoutAccountNumber,
}) => {
  useDisplayCurrency();
  return (
    <div data-testid="account-metric-strip" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* Card 1: Total Inflows */}
      <div className="rounded-xl border border-gray-200/80 bg-white p-5 shadow-xs">
        <div className="flex items-center justify-between text-xs text-gray-500 mb-2">
          <span className="font-medium">Total Inflows</span>
          <ArrowDownLeft className="h-4 w-4 text-emerald-600 stroke-[2]" />
        </div>
        <p className="text-xl font-bold text-gray-900 tracking-tight tabular-nums font-mono">
          {formatNaira(totalInflows)}
        </p>
        <div className="mt-2 text-xs text-emerald-700 font-medium flex items-center gap-1">
          <CheckCheck className="h-3.5 w-3.5" />
          <span>{completedTransfersCount} completed transfers</span>
        </div>
      </div>

      {/* Card 2: Total Withdrawn */}
      <div className="rounded-xl border border-gray-200/80 bg-white p-5 shadow-xs">
        <div className="flex items-center justify-between text-xs text-gray-500 mb-2">
          <span className="font-medium">Total Withdrawn</span>
          <ArrowUpRight className="h-4 w-4 text-purple-600 stroke-[2]" />
        </div>
        <p className="text-xl font-bold text-gray-900 tracking-tight tabular-nums font-mono">
          {formatNaira(totalWithdrawn)}
        </p>
        <div className="mt-2 text-xs text-gray-500">
          {pendingWithdrawn > 0 ? (
            <span className="text-amber-700 font-semibold inline-flex items-center gap-1">
              <Clock className="h-3 w-3" /> {formatNaira(pendingWithdrawn)} in flight
            </span>
          ) : (
            'Transferred to payout bank'
          )}
        </div>
      </div>

      {/* Card 3: Business Balance */}
      <div className="rounded-xl border border-gray-200/80 bg-white p-5 shadow-xs">
        <div className="flex items-center justify-between text-xs text-gray-500 mb-2">
          <span className="font-medium">{isPooled ? 'Business Balance' : 'Current Balance'}</span>
          <Landmark className="h-4 w-4 text-indigo-600 stroke-[2]" />
        </div>
        <p className="text-xl font-bold text-gray-900 tracking-tight tabular-nums font-mono">
          {formatNaira(businessBalance ?? 0)}
        </p>
        <div
          className="mt-2 text-xs text-gray-500 truncate"
          title={isPooled && businessName ? `Share for ${businessName}` : 'Available for this business'}
        >
          {isPooled && businessName ? `Share for ${businessName}` : 'Available for this business'}
        </div>
      </div>

      {/* Card 4: Payout Bank */}
      <div className="rounded-xl border border-gray-200/80 bg-white p-5 shadow-xs">
        <div className="flex items-center justify-between text-xs text-gray-500 mb-2">
          <span className="font-medium">Payout Bank</span>
          <Building2 className="h-4 w-4 text-gray-500 stroke-[2]" />
        </div>
        <p className="text-base font-bold text-gray-900 truncate">{payoutBankName}</p>
        <div className="mt-2 text-xs text-gray-500 font-mono">
          {payoutAccountNumber ? `•••• ${payoutAccountNumber.slice(-4)}` : 'Connect bank for payouts'}
        </div>
      </div>
    </div>
  );
};

export default AccountMetricStrip;
