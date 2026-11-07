import { useState, useEffect } from 'react';
import { Gift, Sparkles, Info, Check, Store } from 'lucide-react';
import api from '@/lib/axios';
import toast from 'react-hot-toast';

type Props = {
  businessId: string;
  initialPct?: number;
  onSaved?: (newPct: number) => void;
};

export default function VoucherBonusCard({ businessId, initialPct = 0, onSaved }: Props) {
  const [pct, setPct] = useState(initialPct);
  const [saving, setSaving] = useState(false);
  const [hasChanged, setHasChanged] = useState(false);

  useEffect(() => setPct(initialPct), [initialPct]);
  useEffect(() => setHasChanged(pct !== initialPct), [pct, initialPct]);

  const previewCash = 10000;
  const previewBonus = Math.round((previewCash * pct) / 100);
  const previewCredited = previewCash + previewBonus;

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await api.put(`/businesses/${businessId}/settings/voucher-bonus`, {
        voucherBonusPct: pct,
      });
      const saved = res.data?.data?.voucherBonusPct ?? pct;
      toast.success(pct === 0 ? 'Bonus turned off' : `Bonus set to ${pct}%${pct > 0 ? ' — customers will love this' : ''}`);
      onSaved?.(Number(saved));
      setHasChanged(false);
    } catch (e: any) {
      toast.error(e.response?.data?.error?.message || 'Could not save bonus');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="relative overflow-hidden rounded-[18px] border border-amber-200/60 bg-white">
      {/* paper texture — not a flat AI card */}
      <div className="pointer-events-none absolute inset-0 opacity-[0.035]" style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.4'/%3E%3C/svg%3E")` }} />

      {/* top perforation — like a real voucher booklet */}
      <div className="relative flex items-center gap-1.5 px-5 pt-4 pb-3">
        <div className="flex gap-[6px]">
          {Array.from({ length: 18 }).map((_, i) => (
            <span key={i} className="h-1.5 w-1.5 rounded-full bg-amber-200/80" />
          ))}
        </div>
        <span className="ml-auto text-[10px] font-bold tracking-[0.14em] text-amber-700/70 uppercase">Keeper&apos;s Extra — Store Voucher Bonus</span>
      </div>

      <div className="relative grid gap-6 p-6 lg:grid-cols-[1.15fr_0.85fr]">
        {/* Left: story + control */}
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <div className="hidden sm:flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] border border-amber-200 bg-amber-50">
              <Gift className="h-5 w-5 text-amber-700" strokeWidth={1.7} />
            </div>
            <div className="min-w-0">
              <h3 style={{ fontFamily: 'Georgia, ui-serif, serif' }} className="text-[18px] font-semibold tracking-tight text-zinc-900 leading-tight">
                Make them want to keep money with you
              </h3>
              <p className="mt-1.5 text-[13px] leading-relaxed text-zinc-600">
                When someone loads <span className="font-semibold text-zinc-800">₦10,000</span> to their voucher, give them a little thank-you on top — <span className="font-semibold text-amber-700">1–3% extra</span>. They pay 10k, their voucher reads 10,300. That ₦300 costs you less than a new customer, and they&apos;ll come back to spend it.
              </p>
            </div>
          </div>

          {/* Slider — wooden ruler, not a generic range */}
          <div className="rounded-xl border border-zinc-200 bg-zinc-50/70 p-4">
            <div className="flex items-baseline justify-between">
              <div className="flex items-baseline gap-2">
                <span className="text-[11px] font-bold tracking-[0.1em] text-zinc-500 uppercase">Default extra for every new top-up</span>
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800 border border-amber-200">
                  <Sparkles className="h-3 w-3" /> all customers
                </span>
              </div>
              <span className="tabular-nums text-[13px] font-bold text-zinc-900">{pct === 0 ? 'Off' : `${pct}%`}</span>
            </div>

            <div className="mt-3">
              <div className="relative h-[42px] rounded-lg border border-amber-900/10 bg-[#fdfaf5] px-3 pt-2 pb-1">
                {/* ruler ticks */}
                <div className="flex justify-between px-1">
                  {[0, 2, 4, 6, 8, 10].map((n) => (
                    <div key={n} className="flex flex-col items-center">
                      <span className={`block h-3 w-px ${pct === n ? 'bg-amber-700' : 'bg-zinc-300'}`} />
                      <span className={`mt-1 text-[10px] font-bold tabular-nums ${pct === n ? 'text-amber-700' : 'text-zinc-400'}`}>{n}%</span>
                    </div>
                  ))}
                </div>
                <input
                  type="range"
                  min={0}
                  max={10}
                  step={0.5}
                  value={pct}
                  onChange={(e) => setPct(Number(e.target.value))}
                  className="absolute left-3 right-3 top-[22px] h-2 w-[calc(100%-24px)] appearance-none bg-transparent accent-amber-700"
                  aria-label="Voucher bonus percent"
                />
              </div>
              <div className="mt-2 flex items-center gap-2 text-[11px] leading-relaxed text-zinc-500">
                <Info className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
                <span>0% = no bonus. 10% max — keeps it honest. You can still override per-customer or per top-up.</span>
              </div>
            </div>

            <div className="mt-4 flex items-center gap-2">
              <button
                onClick={handleSave}
                disabled={!hasChanged || saving}
                className="inline-flex items-center gap-1.5 rounded-full bg-zinc-900 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-black disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {saving ? 'Saving…' : hasChanged ? (
                  <>
                    <Check className="h-3.5 w-3.5" /> Save bonus
                  </>
                ) : (
                  'Saved'
                )}
              </button>
              {hasChanged && (
                <button onClick={() => setPct(initialPct)} className="text-xs font-medium text-zinc-600 hover:text-zinc-900 underline decoration-zinc-300 underline-offset-4">
                  Reset
                </button>
              )}
              <span className="ml-auto hidden sm:inline text-[11px] text-zinc-400">Applies to next top-up only — old ledgers stay untouched.</span>
            </div>
          </div>
        </div>

        {/* Right: tactile voucher preview — not a dashboard stat card */}
        <div className="relative">
          <div className="rounded-[14px] border border-zinc-900/10 bg-white p-4 shadow-[0_6px_20px_rgba(0,0,0,0.06)]">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 text-[10px] font-bold tracking-[0.12em] text-zinc-500 uppercase">
                <Store className="h-3.5 w-3.5" /> Live preview
              </span>
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold border ${pct > 0 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-zinc-50 text-zinc-500 border-zinc-200'}`}>
                {pct === 0 ? 'No bonus' : `${pct}% extra`}
              </span>
            </div>

            {/* voucher slip — perforated, slightly rotated */}
            <div className="mt-3 rounded-xl border border-dashed border-amber-300 bg-amber-50/40 p-3 [transform:rotate(-0.3deg)]">
              <div className="flex items-baseline justify-between">
                <span className="text-[11px] font-semibold tracking-[0.08em] text-zinc-500 uppercase">Customer pays</span>
                <span className="tabular-nums text-sm font-bold text-zinc-900">₦{previewCash.toLocaleString('en-NG')}</span>
              </div>
              <div className={`mt-2 flex items-baseline justify-between rounded-lg px-2.5 py-2 ${pct > 0 ? 'bg-emerald-50 border border-emerald-200' : 'bg-white border border-zinc-200'}`}>
                <span className="text-[11px] font-bold tracking-[0.08em] text-zinc-600 uppercase">Voucher gets</span>
                <span className={`tabular-nums text-[15px] font-extrabold ${pct > 0 ? 'text-emerald-700' : 'text-zinc-900'}`}>
                  ₦{previewCredited.toLocaleString('en-NG')}
                </span>
              </div>
              {pct > 0 ? (
                <div className="mt-2 text-center text-[11px] leading-relaxed text-emerald-700">
                  That&apos;s <span className="font-bold">+₦{previewBonus.toLocaleString('en-NG')} bonus</span> — your thank-you for keeping balance with you.
                </div>
              ) : (
                <div className="mt-2 text-center text-[11px] text-zinc-500">No bonus — customer gets exactly what they paid.</div>
              )}
              <div className="mt-2 flex justify-center gap-1">
                {Array.from({ length: 12 }).map((_, i) => (
                  <span key={i} className="h-1 w-6 rounded-full bg-amber-200/60" />
                ))}
              </div>
            </div>

            <p className="mt-3 text-[11px] leading-relaxed text-zinc-500">
              <span className="font-semibold text-zinc-700">How to use it:</span> Tell a customer — <span className="font-semibold text-zinc-900">&quot;Load ₦10k today, I&apos;ll add {pct === 0 ? 'a little extra' : `${pct}% extra`} — you&apos;ll have ₦{previewCredited.toLocaleString('en-NG')} to shop.&quot;</span> Works because it&apos;s personal, not a flyer.
            </p>
          </div>

          {/* subtle stamp */}
          <div className="pointer-events-none absolute -right-2 -top-2 hidden sm:block">
            <div className="rounded-full border-[1.5px] border-amber-800/15 bg-white/90 px-2.5 py-1 text-[10px] font-black tracking-[0.14em] text-amber-800/60 uppercase [transform:rotate(6deg)]">
              WallX • Keeper&apos;s Cut
            </div>
          </div>
        </div>
      </div>

      {/* bottom helper — hides on mobile to keep tight */}
      <div className="hidden lg:flex items-center gap-2 border-t border-amber-100 bg-amber-50/30 px-6 py-2.5 text-[11px] text-zinc-600">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
        Bonus is voucher liability, not expense — it never hits tax. Tech: single ledger row with <span className="font-mono text-[11px]">bonusAmount</span> so finance can audit.
      </div>
    </div>
  );
}
