import { useEffect, useState } from 'react';
import api from '@/lib/axios';
import { formatNaira } from '@/lib/format';
import { useDisplayCurrency } from '@/hooks/useDisplayCurrency';
import { Banknote, Building2, SlidersHorizontal, RefreshCw } from 'lucide-react';

interface CrmTotals {
  date: string;
  topUpBySource: Record<string, { count: number; amount: number }>;
  adjustments: { count: number; netAmount: number };
  totalCollected: number;
}

interface CrmDailyTotalsProps {
  businessId: string;
}

export function CrmDailyTotals({ businessId }: CrmDailyTotalsProps) {
  useDisplayCurrency();
  const [totals, setTotals] = useState<CrmTotals | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let cancelled = false;

    const fetchTotals = async () => {
      try {
        const { data } = await api.get(`/businesses/${businessId}/crm/totals`);
        if (!cancelled && data?.data) {
          setTotals(data.data);
        }
      } catch {
        // Silently swallow background polling errors
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchTotals();
    const id = setInterval(fetchTotals, 60_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [businessId]);

  if (loading && !totals) {
    return (
      <div className="rounded-xl border border-zinc-200 bg-white p-3.5 shadow-sm animate-pulse space-y-2">
        <div className="h-4 w-36 bg-zinc-200 rounded" />
        <div className="h-8 bg-zinc-100 rounded" />
      </div>
    );
  }

  if (!totals) return null;

  const cash = totals.topUpBySource['cash'] ?? { count: 0, amount: 0 };
  const bankTransfer = totals.topUpBySource['bank_transfer'] ?? { count: 0, amount: 0 };

  // Other sources (e.g. legacy 'crm' rows)
  const otherSources = Object.entries(totals.topUpBySource).filter(
    ([k]) => k !== 'cash' && k !== 'bank_transfer'
  );

  return (
    <div className="rounded-xl border border-zinc-200 bg-gradient-to-r from-zinc-50/80 to-white p-3.5 shadow-sm">
      <div className="flex items-center justify-between mb-2.5">
        <div className="flex items-center space-x-1.5">
          <span className="text-xs font-bold text-zinc-800 uppercase tracking-wider">
            Today's Voucher Collections
          </span>
          <span className="text-[10px] text-zinc-400 font-mono">({totals.date})</span>
        </div>
        <div className="flex items-center space-x-1 text-[11px] text-zinc-500">
          <RefreshCw className="w-3 h-3 text-zinc-400" />
          <span>Live 60s</span>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
        {/* Cash */}
        <div className="rounded-lg bg-white border border-zinc-200/80 p-2 shadow-2xs">
          <div className="flex items-center space-x-1 text-zinc-500 mb-0.5">
            <Banknote className="w-3.5 h-3.5 text-emerald-600" />
            <span className="font-medium text-[11px]">Cash</span>
            <span className="text-[10px] text-zinc-400">({cash.count})</span>
          </div>
          <div className="font-bold text-zinc-900 text-sm">
            {formatNaira(cash.amount)}
          </div>
        </div>

        {/* Bank Transfer */}
        <div className="rounded-lg bg-white border border-zinc-200/80 p-2 shadow-2xs">
          <div className="flex items-center space-x-1 text-zinc-500 mb-0.5">
            <Building2 className="w-3.5 h-3.5 text-blue-600" />
            <span className="font-medium text-[11px]">Bank Transfer</span>
            <span className="text-[10px] text-zinc-400">({bankTransfer.count})</span>
          </div>
          <div className="font-bold text-zinc-900 text-sm">
            {formatNaira(bankTransfer.amount)}
          </div>
        </div>

        {/* Adjustments */}
        <div className="rounded-lg bg-white border border-zinc-200/80 p-2 shadow-2xs">
          <div className="flex items-center space-x-1 text-zinc-500 mb-0.5">
            <SlidersHorizontal className="w-3.5 h-3.5 text-amber-600" />
            <span className="font-medium text-[11px]">Adjustments</span>
            <span className="text-[10px] text-zinc-400">({totals.adjustments.count})</span>
          </div>
          <div className="font-bold text-zinc-900 text-sm">
            {formatNaira(totals.adjustments.netAmount)}
          </div>
        </div>

        {/* Total Collected Today (Top-ups only) */}
        <div className="rounded-lg bg-emerald-50/70 border border-emerald-200 p-2 shadow-2xs">
          <div className="text-[11px] font-semibold text-emerald-800 mb-0.5">
            Total Collected Today
          </div>
          <div className="font-extrabold text-emerald-700 text-sm">
            {formatNaira(totals.totalCollected)}
          </div>
        </div>
      </div>

      {otherSources.length > 0 && (
        <div className="mt-2 pt-2 border-t border-zinc-100 flex flex-wrap gap-2 text-[11px] text-zinc-500">
          {otherSources.map(([src, val]) => (
            <span key={src} className="inline-flex items-center gap-1">
              <span className="capitalize">{src}</span>: {formatNaira(val.amount)} ({val.count})
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export default CrmDailyTotals;
