import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, ShieldCheck, Ban } from 'lucide-react';
import Button from '@/components/ui/Button.tsx';
import { useCreditStore } from '@/stores/credit.store.ts';
import type { CustomerCredit } from '@/types/index.ts';
import toast from 'react-hot-toast';
import { getErrorMessage } from '@/lib/axios.ts';
import { formatNaira } from '@/lib/format';
import { useDisplayCurrency } from '@/hooks/useDisplayCurrency';

interface WriteOffModalProps {
  businessId: string;
  credit: CustomerCredit | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export default function WriteOffModal({
  businessId,
  credit,
  isOpen,
  onClose,
  onSuccess,
}: WriteOffModalProps) {
  useDisplayCurrency();
  const writeOffCredit = useCreditStore((s) => s.writeOffCredit);

  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);

  // Lock background scroll & handle ESC
  useEffect(() => {
    if (!isOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !loading) onClose();
    };
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, loading, onClose]);

  if (!isOpen || !credit) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim() || reason.trim().length < 5) {
      toast.error('Please enter a clear reason for the write-off (at least 5 characters)');
      return;
    }

    setLoading(true);
    try {
      await writeOffCredit(businessId, credit.id, { reason: reason.trim() });
      toast.success(`Bad debt written off for ${credit.customerName}. A tax deduction of ${formatNaira(credit.balance)} has been auto-created.`);
      onSuccess?.();
      onClose();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] w-screen h-screen flex items-center justify-center p-3 sm:p-4 bg-slate-950/60 backdrop-blur-xs overflow-hidden animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget && !loading) onClose();
      }}
    >
      <div className="relative w-full max-w-md max-h-[88vh] flex flex-col rounded-none bg-white shadow-2xl my-auto border border-gray-300 animate-in zoom-in-95 duration-150">
        {/* Pinned Header */}
        <div className="shrink-0 flex items-center justify-between border-b border-gray-200 px-5 py-3.5 bg-gray-50">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-none bg-rose-50 text-rose-700 border border-rose-200 shrink-0">
              <Ban className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-gray-900">Write Off Bad Debt</h2>
              <p className="text-[11px] text-rose-800">
                Remove uncollectible debt from active tracking
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={loading}
            className="rounded-none p-1.5 text-gray-400 hover:bg-gray-200 hover:text-gray-700 transition-colors disabled:opacity-40"
            title="Close modal"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Scrollable Body */}
        <form id="writeoff-form" onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-3.5">
          <div className="rounded-none bg-gray-50 p-3.5 border border-gray-200 space-y-1">
            <span className="text-[10px] font-semibold uppercase text-gray-400">Account to Write Off</span>
            <p className="text-xs font-bold text-gray-900">{credit.customerName}</p>
            <p className="text-base font-bold text-rose-600 tabular-nums">{formatNaira(credit.balance)}</p>
          </div>

          <div className="rounded-none bg-emerald-50/80 p-3 border border-emerald-200 text-xs text-emerald-900 leading-relaxed space-y-1">
            <div className="flex items-center gap-1.5 font-bold text-emerald-950 text-[11px]">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-700 shrink-0" />
              Automatic Tax Deduction (CITA §25)
            </div>
            <p className="text-[11px] text-emerald-800">
              A deductible expense of <span className="font-bold">{formatNaira(credit.balance)}</span> will
              be automatically created for this month. This reduces your taxable gross profit — you
              won't pay tax on money you never collected.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 mb-1">
              Reason for Write-Off <span className="text-rose-500">*</span>
            </label>
            <textarea
              rows={3}
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Customer untraceable after 90 days; bankruptcy confirmed..."
              className="w-full rounded-none border border-gray-300 p-2.5 text-xs focus:border-rose-500 focus:ring-0 outline-none transition-all resize-none"
            />
          </div>
        </form>

        {/* Pinned Footer */}
        <div className="shrink-0 flex items-center justify-end gap-2.5 border-t border-gray-200 px-5 py-3 bg-gray-50">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onClose}
            disabled={loading}
            className="rounded-none border-gray-300"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form="writeoff-form"
            size="sm"
            disabled={loading}
            className="rounded-none bg-rose-600 hover:bg-rose-700 text-white shadow-sm flex items-center gap-1.5"
          >
            {loading ? (
              'Writing off...'
            ) : (
              <>
                <Ban className="h-4 w-4" /> Confirm Write-Off
              </>
            )}
          </Button>
        </div>
      </div>
    </div>,
    document.body
  );
}
