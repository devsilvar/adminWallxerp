import React, { useState, useEffect, useMemo } from 'react';
import {
  Zap,
  Lock,
  Clock,
  ArrowRight,
  ShieldCheck,
  Loader2,
  Eye,
  EyeOff,
} from 'lucide-react';
import Button from '@/components/ui/Button.tsx';
import { formatNaira } from '@/lib/format';
import { useSettlementStore } from '@/stores/settlement.store.ts';
import toast from 'react-hot-toast';
import { useDisplayCurrency } from '@/hooks/useDisplayCurrency';

export interface SettlementAdvanceCardProps {
  businessId?: string;
  isOwner?: boolean;
  isLinked?: boolean;
  onSuccess?: () => void;
  className?: string;
}

export const SettlementAdvanceCard: React.FC<SettlementAdvanceCardProps> = ({
  businessId,
  isOwner = false,
  isLinked = true,
  onSuccess,
  className = '',
}) => {
  useDisplayCurrency();
  const advancePreview = useSettlementStore((s) => s.advancePreview);
  const loadingAdvancePreview = useSettlementStore((s) => s.loadingAdvancePreview);
  const requestingAdvance = useSettlementStore((s) => s.requestingAdvance);
  const fetchAdvancePreview = useSettlementStore((s) => s.fetchAdvancePreview);
  const requestAdvance = useSettlementStore((s) => s.requestAdvance);

  const [amountStr, setAmountStr] = useState('');
  const [narration, setNarration] = useState('');
  const [acceptCharge, setAcceptCharge] = useState(false);
  const [pin, setPin] = useState('');
  const [showPin, setShowPin] = useState(false);

  useEffect(() => {
    if (businessId) {
      void fetchAdvancePreview(businessId);
    }
  }, [businessId, fetchAdvancePreview]);

  const preview = advancePreview;
  const maxAdvance = preview?.maxAdvance ?? 0;
  const pooledPending =
    preview?.pooledPendingSettlement ??
    (preview as any)?.pooledPending ??
    preview?.pendingSettlement ??
    0;
  const remainingPending = preview?.remainingPending ?? 0;
  const hasOutstandingAdvance = Boolean(preview?.hasOutstandingAdvance);

  const feePct = preview?.fees?.advance?.pct ?? 1.0;
  const feeCap = preview?.fees?.advance?.cap ?? 500;
  const minAmount = preview?.fees?.advance?.minAmount ?? 1000;

  const numAmount = useMemo(() => {
    const val = parseFloat(amountStr.replace(/,/g, ''));
    return Number.isFinite(val) ? val : 0;
  }, [amountStr]);

  const liveFee = useMemo(() => {
    if (numAmount <= 0) return 0;
    const rawFee = (numAmount * feePct) / 100;
    return Math.round(Math.min(rawFee, feeCap) * 100) / 100;
  }, [numAmount, feePct, feeCap]);

  const totalDebit = useMemo(() => {
    return Math.round((numAmount + liveFee) * 100) / 100;
  }, [numAmount, liveFee]);

  const isAmountValid = numAmount >= minAmount && numAmount <= maxAdvance;
  const canSubmit =
    isOwner &&
    isLinked &&
    !hasOutstandingAdvance &&
    isAmountValid &&
    acceptCharge &&
    pin.trim().length === 4 &&
    !requestingAdvance;

  const handleApplyPreset = (value: number) => {
    setAmountStr(String(Math.floor(value)));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!businessId || !canSubmit) return;

    try {
      await requestAdvance(businessId, {
        amount: numAmount,
        pin: pin.trim(),
        narration: narration.trim() || undefined,
        acceptCharge: true,
      });

      // Clear state on success
      setAmountStr('');
      setNarration('');
      setPin('');
      setAcceptCharge(false);

      if (onSuccess) {
        onSuccess();
      }
    } catch (err: any) {
      const errorCode = err?.response?.data?.error?.code || err?.response?.data?.code;
      if (errorCode === 'ADVANCE_ALREADY_TAKEN') {
        toast.error('An advance has already been taken for this unsettled batch.');
      }
    }
  };

  return (
    <div
      id="settlement-advance"
      data-testid="settlement-advance-card"
      className={`rounded-2xl border border-purple-200/80 bg-linear-to-b from-purple-50/40 to-white p-5 shadow-xs transition-all ${className}`}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-purple-900 text-purple-100 shadow-xs">
            <Zap className="h-5 w-5 fill-purple-300 stroke-purple-900" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-bold text-gray-900">Settlement Advance</h3>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-purple-100 text-purple-900 border border-purple-200">
                30% One-Shot
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              Access up to 30% of unsettled customer transfers instantly in your wallet
            </p>
          </div>
        </div>

        {loadingAdvancePreview && (
          <Loader2 className="h-4 w-4 animate-spin text-purple-900 shrink-0" />
        )}
      </div>

      {/* Metrics Strip */}
      <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-2.5 rounded-xl bg-purple-50/60 border border-purple-100 p-3 text-xs">
        <div>
          <span className="text-[11px] font-medium text-gray-500">Unsettled Inflows</span>
          <p className="text-sm font-bold font-mono text-gray-950 mt-0.5">
            {formatNaira(pooledPending)}
          </p>
        </div>
        <div>
          <span className="text-[11px] font-medium text-purple-900 font-semibold">Max Advance (30%)</span>
          <p className="text-sm font-bold font-mono text-purple-900 mt-0.5">
            {formatNaira(maxAdvance)}
          </p>
        </div>
        <div>
          <span className="text-[11px] font-medium text-gray-500">Normal Settlement</span>
          <p className="text-sm font-bold font-mono text-gray-700 mt-0.5">
            {formatNaira(remainingPending)}
          </p>
          <span className="text-[10px] text-gray-400">settles normally</span>
        </div>
      </div>

      {/* State A: Advance already taken for current batch */}
      {hasOutstandingAdvance ? (
        <div
          data-testid="advance-already-taken-banner"
          className="mt-4 rounded-xl border border-amber-200 bg-amber-50/70 p-3.5 text-xs text-amber-900"
        >
          <div className="flex items-start gap-2.5">
            <Lock className="h-4 w-4 shrink-0 text-amber-700 mt-0.5" />
            <div className="space-y-1">
              <p className="font-bold text-amber-950">
                Advance already taken for this batch
              </p>
              <p className="text-amber-800 leading-relaxed text-[11px]">
                Remaining <strong>{formatNaira(remainingPending)}</strong> settles on schedule. Next advance unlocks after this batch completes settlement.
              </p>
            </div>
          </div>
        </div>
      ) : pooledPending <= 0 || maxAdvance <= 0 ? (
        /* State B: No unsettled DVA inflows */
        <div className="mt-4 rounded-xl border border-gray-150 bg-gray-50/60 p-3.5 text-center text-xs text-gray-500">
          <Clock className="h-4 w-4 mx-auto text-gray-400 mb-1" />
          <p className="font-medium text-gray-700">No unsettled balance available</p>
          <p className="text-[11px] text-gray-400 mt-0.5">
            30% advance unlocks as soon as inbound DVA customer bank transfers arrive.
          </p>
        </div>
      ) : (
        /* State C: Active Advance Form */
        <form onSubmit={handleSubmit} className="mt-4 space-y-3.5">
          {/* Amount input & Quick preset buttons */}
          <div>
            <div className="flex items-center justify-between text-xs mb-1.5">
              <label htmlFor="advance-amount" className="font-semibold text-gray-800">
                Advance Amount
              </label>
              <span className="text-[11px] text-gray-500">
                Limit: <strong>{formatNaira(maxAdvance)}</strong>
              </span>
            </div>

            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-bold font-mono text-sm">
                ₦
              </span>
              <input
                id="advance-amount"
                data-testid="advance-amount-input"
                type="number"
                min={minAmount}
                max={maxAdvance}
                step="any"
                value={amountStr}
                onChange={(e) => setAmountStr(e.target.value)}
                placeholder={`Min ${formatNaira(minAmount)}`}
                className="w-full rounded-xl border border-gray-300 pl-8 pr-3 py-2 text-sm font-mono text-gray-900 placeholder:text-gray-400 focus:border-purple-600 focus:ring-1 focus:ring-purple-600 outline-hidden"
              />
            </div>

            {/* Presets */}
            <div className="mt-2 flex items-center gap-1.5 flex-wrap">
              <button
                type="button"
                onClick={() => handleApplyPreset(maxAdvance)}
                className="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-purple-100 hover:bg-purple-200 text-purple-900 border border-purple-200 transition-colors cursor-pointer"
              >
                Max (30%): {formatNaira(maxAdvance)}
              </button>
              {maxAdvance >= 2000 && (
                <button
                  type="button"
                  onClick={() => handleApplyPreset(Math.floor(maxAdvance * 0.5))}
                  className="px-2.5 py-1 text-[11px] font-medium rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors cursor-pointer"
                >
                  50%: {formatNaira(Math.floor(maxAdvance * 0.5))}
                </button>
              )}
            </div>
          </div>

          {/* Realtime Fee & Debit Breakdown Box */}
          {numAmount > 0 && (
            <div
              data-testid="advance-quote-box"
              className="rounded-xl border border-purple-100 bg-purple-50/50 p-3 text-xs space-y-1.5"
            >
              <div className="flex justify-between items-center text-gray-600">
                <span>Credited to Wallet:</span>
                <span className="font-bold font-mono text-gray-900">{formatNaira(numAmount)}</span>
              </div>
              <div className="flex justify-between items-center text-gray-600">
                <span>Advance Fee ({feePct}% capped {formatNaira(feeCap)}):</span>
                <span className="font-bold font-mono text-purple-900">+{formatNaira(liveFee)}</span>
              </div>
              <div className="pt-1.5 border-t border-purple-200 flex justify-between items-center text-gray-950 font-bold">
                <span>Total Advance Cost:</span>
                <span className="font-mono text-sm text-purple-950">{formatNaira(totalDebit)}</span>
              </div>
            </div>
          )}

          {/* Optional Narration */}
          <div>
            <label htmlFor="advance-narration" className="block text-xs font-semibold text-gray-700 mb-1">
              Transfer Narration (Optional)
            </label>
            <input
              id="advance-narration"
              data-testid="advance-narration-input"
              type="text"
              maxLength={60}
              value={narration}
              onChange={(e) => setNarration(e.target.value)}
              placeholder="e.g. Supplier inventory advance"
              className="w-full rounded-xl border border-gray-300 px-3 py-1.5 text-xs text-gray-900 placeholder:text-gray-400 focus:border-purple-600 focus:ring-1 focus:ring-purple-600 outline-hidden"
            />
          </div>

          {/* Consent Checkbox */}
          <div className="pt-1">
            <label className="flex items-start gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                data-testid="advance-accept-charge-checkbox"
                checked={acceptCharge}
                onChange={(e) => setAcceptCharge(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-purple-900 focus:ring-purple-600 mt-0.5 cursor-pointer"
              />
              <span className="text-xs text-gray-700 leading-snug">
                I accept the <strong>{formatNaira(liveFee)}</strong> advance fee (1% capped at ₦500).
                I understand this is a one-shot advance for this batch, and the remaining <strong>{formatNaira(remainingPending)}</strong> will settle normally into my wallet on schedule.
              </span>
            </label>
          </div>

          {/* 4-digit PIN Authorization */}
          <div>
            <div className="flex items-center justify-between text-xs mb-1">
              <label htmlFor="advance-pin" className="font-semibold text-gray-800">
                Transaction PIN (4 Digits)
              </label>
              <button
                type="button"
                onClick={() => setShowPin(!showPin)}
                className="text-[11px] text-purple-900 hover:text-purple-950 font-medium flex items-center gap-1 cursor-pointer"
              >
                {showPin ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                {showPin ? 'Hide' : 'Show'}
              </button>
            </div>
            <input
              id="advance-pin"
              data-testid="advance-pin-input"
              type={showPin ? 'text' : 'password'}
              maxLength={4}
              pattern="\d{4}"
              inputMode="numeric"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
              placeholder="••••"
              className="w-full text-center tracking-widest font-mono text-base rounded-xl border border-gray-300 py-1.5 text-gray-900 focus:border-purple-600 focus:ring-1 focus:ring-purple-600 outline-hidden"
            />
          </div>

          {/* Submit Action */}
          <Button
            type="submit"
            variant="primary"
            size="sm"
            disabled={!canSubmit}
            data-testid="advance-submit-btn"
            className="w-full text-xs font-bold bg-purple-900 hover:bg-purple-950 text-white cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-xs"
          >
            {requestingAdvance ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                Processing Advance...
              </>
            ) : (
              <>
                Request Advance of {numAmount > 0 ? formatNaira(numAmount) : 'Funds'}
                <ArrowRight className="h-3.5 w-3.5 ml-1" />
              </>
            )}
          </Button>
        </form>
      )}

      {/* Security & Regulatory footer note */}
      <div className="mt-4 pt-3 border-t border-purple-100 flex items-center justify-between text-[11px] text-gray-500">
        <span className="flex items-center gap-1">
          <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
          Single-wallet ledger · Sales neutral
        </span>
        <span>Next normal settlement on schedule</span>
      </div>
    </div>
  );
};

export default SettlementAdvanceCard;
