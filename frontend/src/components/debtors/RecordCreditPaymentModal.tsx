import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, CheckCircle2, CreditCard, Calendar, FileText, ShieldCheck } from 'lucide-react';
import Button from '@/components/ui/Button.tsx';
import { useCreditStore } from '@/stores/credit.store.ts';
import type { CustomerCredit } from '@/types/index.ts';
import toast from 'react-hot-toast';
import { getErrorMessage } from '@/lib/axios.ts';
import { formatNaira } from '@/lib/format';
import { useDisplayCurrency } from '@/hooks/useDisplayCurrency';

interface RecordCreditPaymentModalProps {
  businessId: string;
  credit: CustomerCredit | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export default function RecordCreditPaymentModal({
  businessId,
  credit,
  isOpen,
  onClose,
  onSuccess,
}: RecordCreditPaymentModalProps) {
  useDisplayCurrency();
  const recordPayment = useCreditStore((s) => s.recordPayment);

  const todayStr = new Date().toISOString().slice(0, 10);
  const [amount, setAmount] = useState<number | ''>('');
  const [paymentDate, setPaymentDate] = useState(todayStr);
  const [paymentType, setPaymentType] = useState<'cash' | 'bank_transfer' | 'pos' | 'manual'>('cash');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (credit) {
      setAmount(credit.balance);
      setPaymentDate(todayStr);
      setNotes('');
    }
  }, [credit]);

  // Lock background scroll & listen for ESC
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
    const numAmount = Number(amount);
    if (!numAmount || numAmount <= 0) {
      toast.error('Please enter a valid payment amount');
      return;
    }
    if (numAmount > credit.balance) {
      toast.error(`Payment amount cannot exceed current balance (${formatNaira(credit.balance)})`);
      return;
    }

    setLoading(true);
    try {
      await recordPayment(businessId, credit.id, {
        amount: numAmount,
        paymentDate,
        paymentType,
        notes: notes.trim() || undefined,
      });

      toast.success(
        numAmount >= credit.balance
          ? 'Debt fully settled! Balance cleared.'
          : 'Partial payment recorded — debt balance updated.'
      );
      onSuccess?.();
      onClose();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const isFullPayment = Number(amount) >= credit.balance;

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] w-screen h-screen flex items-center justify-center p-3 sm:p-4 bg-slate-950/60 backdrop-blur-xs overflow-hidden animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget && !loading) onClose();
      }}
    >
      {/* Straight-Edged Modal Dialog */}
      <div className="relative z-10 w-full max-w-md max-h-[88vh] flex flex-col rounded-none bg-white shadow-2xl border border-gray-300 my-auto pointer-events-auto animate-in zoom-in-95 duration-150">
        {/* Pinned Straight Header */}
        <div className="shrink-0 flex items-center justify-between border-b border-gray-200 px-5 py-3.5 bg-gray-50">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-none bg-emerald-50 text-emerald-700 border border-emerald-300 shrink-0">
              <CreditCard className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-gray-900">Record Debt Repayment</h2>
              <p className="text-[11px] text-emerald-800">
                Settling: <span className="font-semibold text-gray-900">{credit.customerName}</span>
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

        {/* Scrollable Form Body */}
        <form id="record-payment-form" onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-3.5">
          {/* Outstanding Balance Summary Card */}
          <div className="rounded-none bg-gray-50 p-4 border border-gray-200 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Current Outstanding</span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-none bg-amber-50 text-amber-800 border border-amber-300">
                Awaiting Collection
              </span>
            </div>
            <p className="text-2xl font-bold text-gray-900 tabular-nums">{formatNaira(credit.balance)}</p>
            <div className="flex items-center justify-between text-xs text-gray-400 pt-1 border-t border-gray-200">
              <span>Original: {formatNaira(credit.totalAmount)}</span>
              <span>Already Paid: {formatNaira(credit.amountPaid)}</span>
            </div>
          </div>

          {/* Amount to Record */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-semibold text-gray-700 uppercase tracking-wider">
                Payment Amount (₦) <span className="text-rose-500">*</span>
              </label>
              {/* Quick Percentage Chips */}
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setAmount(credit.balance)}
                  className="text-[10px] font-bold px-2 py-0.5 rounded-none bg-emerald-50 text-emerald-800 border border-emerald-300 hover:bg-emerald-100 transition-colors"
                >
                  Full (100%)
                </button>
                <button
                  type="button"
                  onClick={() => setAmount(Math.round(credit.balance / 2))}
                  className="text-[10px] font-semibold px-2 py-0.5 rounded-none bg-gray-100 text-gray-700 border border-gray-300 hover:bg-gray-200 transition-colors"
                >
                  50%
                </button>
              </div>
            </div>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-bold text-gray-500 text-base">₦</span>
              <input
                type="number"
                step="any"
                min="1"
                max={credit.balance}
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value === '' ? '' : Number(e.target.value))}
                placeholder="0.00"
                className="w-full rounded-none border border-gray-300 pl-9 pr-4 py-2.5 text-base font-bold text-gray-900 focus:border-gray-900 focus:ring-0 outline-none transition-all tabular-nums"
              />
            </div>
          </div>

          {/* Payment Method Selector */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5">
              Payment Channel / Method
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { id: 'cash', label: 'Cash' },
                { id: 'bank_transfer', label: 'Transfer' },
                { id: 'pos', label: 'POS' },
                { id: 'manual', label: 'Other' },
              ].map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setPaymentType(m.id as any)}
                  className={`py-2 px-2 text-xs font-semibold rounded-none border transition-all text-center ${
                    paymentType === m.id
                      ? 'bg-emerald-600 text-white border-emerald-600'
                      : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {/* Payment Date */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
              Payment Date
            </label>
            <div className="relative">
              <Calendar className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                className="w-full rounded-none border border-gray-300 pl-10 pr-3 py-2 text-xs focus:border-gray-900 outline-none transition-all"
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
              Payment Reference / Notes (Optional)
            </label>
            <div className="relative">
              <FileText className="absolute left-3.5 top-2.5 h-4 w-4 text-gray-400" />
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Bank reference, receipt number, teller info..."
                className="w-full rounded-none border border-gray-300 pl-10 pr-3 py-2 text-xs focus:border-gray-900 outline-none transition-all resize-none"
              />
            </div>
          </div>

          {/* Debt Payment Info */}
          <div className="rounded-none bg-slate-50/70 border border-slate-200 p-3 flex items-start gap-2.5">
            <ShieldCheck className="h-4 w-4 text-slate-600 shrink-0 mt-0.5" />
            <p className="text-[11px] text-slate-700 leading-relaxed">
              This payment reduces the outstanding debt. Revenue was already counted when the credit sale was recorded.
            </p>
          </div>
        </form>

        {/* Pinned Footer — Always accessible without scrolling */}
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
            form="record-payment-form"
            size="sm"
            disabled={loading}
            className="rounded-none bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm flex items-center gap-1.5"
          >
            {loading ? (
              'Processing Settlement...'
            ) : (
              <>
                <CheckCircle2 className="h-4 w-4" />
                {isFullPayment ? 'Settle Debt in Full' : 'Record Partial Payment'}
              </>
            )}
          </Button>
        </div>
      </div>
    </div>,
    document.body
  );
}
