import { useState } from 'react';
import { Gift, ChevronDown, Check, RotateCcw } from 'lucide-react';
import api from '@/lib/axios';
import toast from 'react-hot-toast';

type Props = {
  businessId: string;
  customerId: string;
  businessDefaultPct?: number;
  personalPct?: number | null;
  onSaved?: (newPersonal: number | null) => void;
};

export default function CustomerBonusControl({ businessId, customerId, businessDefaultPct = 0, personalPct, onSaved }: Props) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [custom, setCustom] = useState(() => (personalPct !== null && personalPct !== undefined ? String(personalPct) : ''));

  const effective = personalPct !== null && personalPct !== undefined ? personalPct : businessDefaultPct;
  const isInherited = personalPct === null || personalPct === undefined;
  const isBlocked = personalPct === 0;

  const save = async (value: number | null) => {
    setSaving(true);
    try {
      const res = await api.patch(`/businesses/${businessId}/customers/${customerId}/bonus`, {
        voucherBonusPct: value,
      });
      const saved = res.data?.data?.voucherBonusPct ?? value;
      toast.success(value === null ? `Now follows store default (${businessDefaultPct}%)` : value === 0 ? 'Bonus off for this customer' : `Personal bonus set to ${value}%`);
      onSaved?.(saved as number | null);
      setOpen(false);
    } catch (e: any) {
      toast.error(e.response?.data?.error?.message || 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold transition-colors ${
          isBlocked
            ? 'border-zinc-200 bg-zinc-50 text-zinc-500'
            : effective > 0
              ? 'border-amber-200 bg-amber-50 text-amber-800'
              : 'border-zinc-200 bg-white text-zinc-600'
        }`}
        title={isInherited ? `Inherits store default ${businessDefaultPct}% — click to give ${businessId ? 'them' : 'this customer'} a personal rate` : `Personal ${personalPct}% — click to change`}
      >
        <Gift className="h-3 w-3" />
        {effective > 0 ? `+${effective}%` : 'No bonus'}
        <span className="hidden sm:inline text-[10px] font-medium opacity-70">{isInherited ? '(store)' : isBlocked ? '(off)' : '(personal)'}</span>
        <ChevronDown className={`h-3 w-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 z-20 mt-2 w-[280px] rounded-xl border border-zinc-200 bg-white p-3 shadow-[0_12px_32px_rgba(0,0,0,0.12)]">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold tracking-[0.08em] text-zinc-500 uppercase">Personal extra for this customer</span>
            <button onClick={() => setOpen(false)} className="rounded p-1 text-zinc-400 hover:bg-zinc-100">
              <span className="text-[11px]">✕</span>
            </button>
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">Keep it personal — “Tunde, I&apos;ll add 3% for you” beats a flyer. This overrides the store&apos;s {businessDefaultPct}% default.</p>

          <div className="mt-3 grid gap-1.5">
            <button
              onClick={() => save(null)}
              disabled={saving}
              className={`flex items-center justify-between rounded-lg border px-3 py-2 text-left text-xs ${isInherited ? 'border-amber-300 bg-amber-50 text-amber-900' : 'border-zinc-200 hover:bg-zinc-50 text-zinc-700'}`}
            >
              <span>
                <span className="font-bold">Inherit store default</span>
                <span className="ml-1.5 text-[11px] text-zinc-500">({businessDefaultPct}%)</span>
              </span>
              {isInherited && <Check className="h-3.5 w-3.5 text-amber-700" />}
            </button>

            <button
              onClick={() => save(0)}
              disabled={saving}
              className={`flex items-center justify-between rounded-lg border px-3 py-2 text-left text-xs ${isBlocked ? 'border-zinc-900 bg-zinc-900 text-white' : 'border-zinc-200 hover:bg-zinc-50 text-zinc-700'}`}
            >
              <span className="font-semibold">No bonus for them</span>
              {isBlocked && <Check className="h-3.5 w-3.5" />}
            </button>

            <div className={`rounded-lg border p-2.5 ${!isInherited && !isBlocked && personalPct !== null ? 'border-amber-300 bg-amber-50/50' : 'border-zinc-200 bg-zinc-50'}`}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-zinc-800">Custom %</span>
                <span className="text-[11px] text-zinc-500">0–10, halves allowed</span>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <div className="relative flex-1">
                  <input
                    type="number"
                    min={0}
                    max={10}
                    step={0.5}
                    value={custom}
                    onChange={(e) => setCustom(e.target.value)}
                    placeholder={String(businessDefaultPct)}
                    className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 pr-8 text-sm font-semibold tabular-nums focus:border-amber-400 focus:ring-2 focus:ring-amber-100 outline-none"
                  />
                  <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-zinc-500">%</span>
                </div>
                <button
                  onClick={() => {
                    const n = Number(custom);
                    if (Number.isNaN(n) || n < 0 || n > 10) return toast.error('Enter 0–10');
                    save(n);
                  }}
                  disabled={saving || custom === ''}
                  className="rounded-full bg-zinc-900 px-3 py-2 text-xs font-bold text-white hover:bg-black disabled:opacity-40"
                >
                  Save
                </button>
              </div>
              <div className="mt-2 flex items-center gap-1 text-[11px] text-zinc-500">
                <RotateCcw className="h-3 w-3" />
                1% or 3% works best — 10% is the ceiling.
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
