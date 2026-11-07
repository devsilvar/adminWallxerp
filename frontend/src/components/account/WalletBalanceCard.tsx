import React, { useState } from 'react';
import { Wallet, Eye, EyeOff, RefreshCw, Download, Share2 } from 'lucide-react';
import { Skeleton } from '@/components/ui/Skeleton.tsx';
import DvaDetailsCard from './DvaDetailsCard.tsx';
import { formatNaira } from '@/lib/format';
import { useDisplayCurrency } from '@/hooks/useDisplayCurrency';

export interface WalletBalanceCardProps {
  availableBalance: number;
  totalInflows?: number;
  pendingSettlement?: number;
  isLoading?: boolean;
  isRefreshing?: boolean;
  onRefresh?: () => void;
  onWithdraw?: () => void;
  onExportStatement?: () => void;
  onShareDetails?: () => void;
  settlementConnected?: boolean;
  dvaAccountNumber?: string;
  dvaBankName?: string;
  accountName?: string;
  onShowQR?: () => void;
}

export const WalletBalanceCard: React.FC<WalletBalanceCardProps> = ({
  availableBalance,
  pendingSettlement = 0,
  isLoading = false,
  isRefreshing = false,
  onRefresh,
  onExportStatement,
  onShareDetails,
  dvaAccountNumber,
  dvaBankName = 'Wema Bank',
  accountName,
  onShowQR,
}) => {
  useDisplayCurrency();
  const [hideBalance, setHideBalance] = useState(false);

  return (
    <div
      data-testid="wallet-balance-card"
      className="animate-slide-up relative overflow-hidden rounded-2xl bg-gradient-to-r from-purple-950 via-indigo-950 to-slate-950 p-6 sm:p-7 text-white shadow-xl shadow-purple-950/25 border border-purple-800/40"
    >
      {/* Ambient Glows */}
      <div className="absolute -right-12 -top-12 h-52 w-52 rounded-full bg-purple-500/20 blur-3xl pointer-events-none" />
      <div className="absolute left-1/3 -bottom-10 h-40 w-40 rounded-full bg-indigo-500/15 blur-2xl pointer-events-none" />

      <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        {/* Left: Wallet Balance Display */}
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs font-medium text-purple-200/80">
            <Wallet className="h-4 w-4 text-purple-300" />
            <span>Wallet Balance</span>
            <button
              type="button"
              onClick={() => setHideBalance(!hideBalance)}
              className="p-1 hover:text-white transition-colors cursor-pointer"
              title={hideBalance ? 'Show balance' : 'Hide balance'}
              aria-label={hideBalance ? 'Show balance' : 'Hide balance'}
            >
              {hideBalance ? (
                <EyeOff className="h-3.5 w-3.5" data-testid="eye-off-icon" />
              ) : (
                <Eye className="h-3.5 w-3.5" data-testid="eye-icon" />
              )}
            </button>
            {onRefresh && (
              <button
                type="button"
                onClick={onRefresh}
                className={`p-1 hover:text-white transition-colors cursor-pointer ${
                  isRefreshing ? 'animate-spin text-white' : ''
                }`}
                title="Refresh balance"
                aria-label="Refresh balance"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Big Bold Balance */}
          <div className="mt-2 flex items-baseline gap-3">
            {isLoading ? (
              <div className="h-10 flex items-center" data-testid="balance-loading">
                <Skeleton width={180} height={36} rounded="lg" className="bg-white/20" />
              </div>
            ) : (
              <span
                data-testid="balance-amount"
                className="font-mono text-3xl sm:text-4xl font-bold tracking-tight text-white tabular-nums"
              >
                {hideBalance ? '₦ ••••••••' : formatNaira(availableBalance)}
              </span>
            )}
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-400/20 border border-emerald-400/30 px-2 py-0.5 text-[11px] font-bold text-emerald-300">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" /> Active
            </span>
          </div>

          {pendingSettlement > 0 ? (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
              <span className="text-purple-200/60">Available for withdrawal.</span>
              <span
                className="inline-flex items-center gap-1 rounded-md bg-amber-400/20 border border-amber-400/30 px-2 py-0.5 text-[11px] font-semibold text-amber-300"
                title="Funds received today are held in settlement and unlock next business day (T+1)"
              >
                In settlement: {hideBalance ? '₦ •••••' : formatNaira(pendingSettlement)} (T+1)
              </span>
            </div>
          ) : (
            <p className="text-xs text-purple-200/60 mt-2">
              Available balance for instant withdrawal to your payout bank.
            </p>
          )}
        </div>

        {/* Right: Stacked Actions + Embedded Virtual NUBAN Card */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 shrink-0">
          {(onExportStatement || onShareDetails) && (
            <div className="order-2 sm:order-1 flex flex-col items-stretch gap-2">
              {onExportStatement && (
                <button
                  type="button"
                  onClick={onExportStatement}
                  className="flex w-full items-center justify-center gap-1.5 whitespace-nowrap rounded-xl bg-white/10 backdrop-blur-md border border-white/15 px-3.5 py-2.5 text-xs font-semibold text-white hover:bg-white/20 transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer shadow-xs"
                >
                  <Download className="h-3.5 w-3.5 text-purple-200" /> Statement
                </button>
              )}
              {onShareDetails && (
                <button
                  type="button"
                  onClick={onShareDetails}
                  className="flex w-full items-center justify-center gap-1.5 whitespace-nowrap rounded-xl bg-white px-4 py-2.5 text-xs font-bold text-purple-950 hover:bg-purple-50 transition-all shadow-md hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
                >
                  <Share2 className="h-3.5 w-3.5 text-purple-700" /> Share Details
                </button>
              )}
            </div>
          )}

          {dvaAccountNumber && (
            <DvaDetailsCard
              accountNumber={dvaAccountNumber}
              bankName={dvaBankName}
              accountName={accountName}
              onShowQR={onShowQR}
              onShare={onShareDetails}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default WalletBalanceCard;
