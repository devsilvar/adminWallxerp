import { useState, useEffect } from 'react';
import { ShieldCheck, Info, Check, X } from 'lucide-react';
import { useBusinessStore } from '@/stores/business.store';
import { formatNaira } from '@/lib/format';
import { useDisplayCurrency } from '@/hooks/useDisplayCurrency';
import toast from 'react-hot-toast';

interface Props {
  businessId: string;
  initialThreshold?: number;
  isManagerOrOwner: boolean;
  onSaved?: (newThreshold: number) => void;
}

export default function VoucherThresholdCard({
  businessId,
  initialThreshold = 50000,
  isManagerOrOwner,
  onSaved,
}: Props) {
  useDisplayCurrency();
  const [threshold, setThreshold] = useState<number>(initialThreshold);
  const [saving, setSaving] = useState(false);
  const [hasChanged, setHasChanged] = useState(false);

  useEffect(() => {
    setThreshold(initialThreshold);
    setHasChanged(false);
  }, [initialThreshold]);

  const handleChange = (valStr: string) => {
    const val = valStr === '' ? 0 : Number(valStr);
    if (!isNaN(val)) {
      setThreshold(val);
      setHasChanged(val !== initialThreshold);
    }
  };

  const handleCancel = () => {
    setThreshold(initialThreshold);
    setHasChanged(false);
  };

  const handleSave = async () => {
    if (threshold < 0 || threshold > 10_000_000) {
      toast.error('Threshold must be between ₦0 and ₦10,000,000');
      return;
    }

    setSaving(true);
    try {
      await useBusinessStore.getState().updateVoucherAdjustmentThreshold(businessId, threshold);
      toast.success(`Deduction threshold set to ${formatNaira(threshold)}`);
      setHasChanged(false);
      onSaved?.(threshold);
    } catch (err: any) {
      const msg = err.response?.data?.error?.message || err.message || 'Could not update threshold';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="relative overflow-hidden rounded-[18px] border border-blue-200/70 bg-white">
      {/* Subtle texture */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.4'/%3E%3C/svg%3E")`,
        }}
      />

      <div className="relative p-6 space-y-5">
        <div className="flex items-start gap-3">
          <div className="hidden sm:flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] border border-blue-200 bg-blue-50">
            <ShieldCheck className="h-5 w-5 text-blue-700" strokeWidth={1.8} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <h3
                style={{ fontFamily: 'Georgia, ui-serif, serif' }}
                className="text-[18px] font-semibold tracking-tight text-zinc-900 leading-tight"
              >
                Voucher Adjustment Threshold
              </h3>
              <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-0.5 text-[11px] font-semibold text-blue-800 border border-blue-200">
                Current: {formatNaira(initialThreshold)}
              </span>
            </div>
            <p className="mt-1.5 text-[13px] leading-relaxed text-zinc-600">
              When a voucher deduction exceeds this amount, only an Owner can approve it. Positive top-ups always require manager authorization and customer verification. Set to 0 to require Owner approval for every deduction.
            </p>
          </div>
        </div>

        {/* Input & live rule preview */}
        <div className="rounded-xl border border-zinc-200 bg-zinc-50/70 p-4 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <label className="text-[12px] font-medium text-zinc-700">
              Manager can approve deductions up to:
            </label>
            <div className="relative max-w-[200px] w-full">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-zinc-500">
                ₦
              </span>
              <input
                type="number"
                min={0}
                max={10000000}
                step={1000}
                disabled={!isManagerOrOwner || saving}
                value={threshold}
                onChange={(e) => handleChange(e.target.value)}
                title={!isManagerOrOwner ? 'Only managers and owners can change this' : undefined}
                className="w-full pl-8 pr-3 py-2 text-sm font-semibold tabular-nums text-zinc-900 bg-white border border-zinc-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 disabled:bg-zinc-100 disabled:text-zinc-400 disabled:cursor-not-allowed transition-colors"
              />
            </div>
          </div>

          {!isManagerOrOwner && (
            <p className="text-[11px] text-amber-600 flex items-center gap-1.5 font-medium">
              <Info className="h-3.5 w-3.5 shrink-0" />
              Only managers and owners can change this setting.
            </p>
          )}

          {/* Live Preview badge */}
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-zinc-200/80 text-[12px]">
            <span className="text-zinc-500 font-medium">Rule breakdown:</span>
            {threshold > 0 ? (
              <>
                <span className="inline-flex items-center px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 font-medium">
                  Manager: ≤{formatNaira(threshold)}
                </span>
                <span className="inline-flex items-center px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 font-medium">
                  Owner: &gt;{formatNaira(threshold)}
                </span>
              </>
            ) : (
              <span className="inline-flex items-center px-2 py-0.5 rounded bg-red-50 text-red-800 border border-red-200 font-medium">
                Every deduction requires Owner approval
              </span>
            )}
          </div>
        </div>

        {/* Action buttons (only show when changed) */}
        {hasChanged && isManagerOrOwner && (
          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={handleCancel}
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-zinc-600 hover:text-zinc-900 bg-white border border-zinc-300 rounded-lg transition-colors hover:bg-zinc-50 disabled:opacity-50"
            >
              <X className="h-3.5 w-3.5" /> Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition-colors disabled:opacity-50"
            >
              <Check className="h-3.5 w-3.5" />
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
