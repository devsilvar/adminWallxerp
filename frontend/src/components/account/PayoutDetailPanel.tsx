import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Copy,
  Check,
  Building2,
  Clock,
  CheckCheck,
  XCircle,
  Loader2,
  AlertTriangle,
  ArrowUpRight,
  ShieldCheck,
  Receipt,
  Share2,
} from 'lucide-react';
import toast from 'react-hot-toast';

import type { PayoutItem } from './WithdrawalsTable';
import { formatNaira } from '@/lib/format';
import { useDisplayCurrency } from '@/hooks/useDisplayCurrency';

export interface PayoutDetailPanelProps {
  isOpen: boolean;
  onClose: () => void;
  payout: PayoutItem | null;
}

function formatDate(dateStr: string | undefined | null): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-NG', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export const PayoutDetailPanel: React.FC<PayoutDetailPanelProps> = ({
  isOpen,
  onClose,
  payout,
}) => {
  const [copiedRef, setCopiedRef] = useState(false);
  const [copiedAcct, setCopiedAcct] = useState(false);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
  useDisplayCurrency();
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !payout) return null;

  const isCompleted = payout.status === 'completed';
  const isProcessing = payout.status === 'processing';
  const isPending = payout.status === 'pending';
  const isFailed = payout.status === 'failed';

  const handleCopyRef = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(payout.transferReference);
      setCopiedRef(true);
      toast.success('Transfer reference copied');
      setTimeout(() => setCopiedRef(false), 2000);
    }
  };

  const handleCopyAcct = () => {
    if (navigator.clipboard && payout.destinationAccountNum) {
      navigator.clipboard.writeText(payout.destinationAccountNum);
      setCopiedAcct(true);
      toast.success('Account number copied');
      setTimeout(() => setCopiedAcct(false), 2000);
    }
  };

  const handleShareSummary = async () => {
    const text = `Withdrawal Details\nAmount: ${formatNaira(payout.amount)}\nDestination: ${payout.destinationBankName} (${payout.destinationAccountNum})\nReference: ${payout.transferReference}\nStatus: ${payout.status.toUpperCase()}\nDate: ${formatDate(payout.initiatedAt)}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Withdrawal Receipt', text });
        return;
      } catch {}
    }
    navigator.clipboard?.writeText(text);
    toast.success('Withdrawal summary copied to clipboard');
  };

  return createPortal(
    <div
      data-testid="payout-detail-panel"
      className="fixed inset-0 z-50 overflow-hidden bg-black/40 backdrop-blur-xs flex justify-end animate-fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-white h-full shadow-2xl flex flex-col justify-between animate-slide-left overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white z-10">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-50 text-purple-900 border border-purple-100">
              <Receipt className="h-4.5 w-4.5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-gray-900">Withdrawal Details</h3>
              <p className="text-[11px] text-gray-500 font-mono">{payout.transferReference}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer"
            aria-label="Close details"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 space-y-5 flex-1">
          {/* Main Hero Amount Card */}
          <div className="rounded-2xl border border-gray-200/80 bg-linear-to-b from-gray-50/80 to-white p-5 text-center shadow-xs">
            <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-purple-100 text-purple-900 mb-3 border border-purple-200">
              <ArrowUpRight className="h-6 w-6 stroke-[2.2]" />
            </div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Gross Outflow</p>
            <p className="text-2xl sm:text-3xl font-extrabold text-gray-950 font-mono tracking-tight mt-1">
              −{formatNaira(payout.amount)}
            </p>

            <div className="mt-3 flex items-center justify-center gap-2">
              {isCompleted && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200 px-3 py-1 text-xs font-bold text-emerald-800">
                  <CheckCheck className="h-3.5 w-3.5" /> Sent to Commercial Bank
                </span>
              )}
              {isProcessing && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 border border-blue-200 px-3 py-1 text-xs font-bold text-blue-800">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Processing Transfer
                </span>
              )}
              {isPending && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 border border-amber-200 px-3 py-1 text-xs font-bold text-amber-800">
                  <Clock className="h-3.5 w-3.5" /> Queued
                </span>
              )}
              {isFailed && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 border border-rose-200 px-3 py-1 text-xs font-bold text-rose-800">
                  <XCircle className="h-3.5 w-3.5" /> Transfer Failed
                </span>
              )}
            </div>

            <p className="text-[11px] text-gray-500 mt-2">
              Initiated on {formatDate(payout.initiatedAt)}
            </p>
          </div>

          {/* Failure Alert (if failed) */}
          {isFailed && payout.failureReason && (
            <div className="rounded-xl bg-rose-50 border border-rose-200 p-3.5 text-xs text-rose-900 space-y-1">
              <div className="flex items-center gap-1.5 font-bold text-rose-800">
                <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600" />
                <span>Bank Rejection Details</span>
              </div>
              <p className="text-[11px] text-rose-700 leading-relaxed pl-5.5">
                {payout.failureReason}
              </p>
            </div>
          )}

          {/* Financial Breakdown Card */}
          <div className="rounded-xl border border-gray-200/80 bg-white p-4 space-y-2.5">
            <h4 className="text-xs font-bold text-gray-900 uppercase tracking-wider mb-2">
              Financial Breakdown
            </h4>

            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-500">Gross Withdrawal:</span>
              <span className="font-mono font-medium text-gray-900">{formatNaira(payout.amount)}</span>
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-500">Platform Processing Fee:</span>
              <span className="font-mono font-medium text-gray-600">
                {payout.fee > 0 ? `−${formatNaira(payout.fee)}` : '₦0.00 (Free)'}
              </span>
            </div>

            <div className="pt-2 border-t border-gray-100 flex items-center justify-between text-xs">
              <span className="font-bold text-gray-900">Net Remitted to Bank:</span>
              <span className="font-mono font-bold text-purple-950 text-sm">
                {formatNaira(payout.netAmount)}
              </span>
            </div>
          </div>

          {/* Destination Commercial Bank Details */}
          <div className="rounded-xl border border-gray-200/80 bg-white p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-gray-900 uppercase tracking-wider">
                Payout Destination
              </h4>
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">
                <ShieldCheck className="h-3 w-3" /> Commercial NUBAN
              </span>
            </div>

            <div className="flex items-start gap-3 rounded-lg bg-gray-50/80 p-3 border border-gray-100">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white border border-gray-200 text-gray-700 shadow-2xs">
                <Building2 className="h-4.5 w-4.5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-gray-900 truncate">
                  {payout.destinationAccountName || 'Connected Business Account'}
                </p>
                <p className="text-xs text-gray-600 font-medium mt-0.5">
                  {payout.destinationBankName}
                </p>
                <div className="flex items-center gap-2 mt-1.5">
                  <span className="font-mono text-xs font-bold text-gray-800 bg-white px-2 py-0.5 rounded border border-gray-200">
                    {payout.destinationAccountNum}
                  </span>
                  <button
                    type="button"
                    onClick={handleCopyAcct}
                    className="text-[11px] text-purple-900 hover:text-purple-950 font-semibold inline-flex items-center gap-1 cursor-pointer"
                  >
                    {copiedAcct ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                    <span>{copiedAcct ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Transaction Metadata & Timeline */}
          <div className="rounded-xl border border-gray-200/80 bg-white p-4 space-y-2.5 text-xs">
            <h4 className="text-xs font-bold text-gray-900 uppercase tracking-wider mb-2">
              Transfer Metadata
            </h4>

            <div className="flex items-center justify-between">
              <span className="text-gray-500">Transfer Reference:</span>
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-xs text-gray-800 bg-gray-100 px-1.5 py-0.5 rounded">
                  {payout.transferReference}
                </span>
                <button
                  type="button"
                  onClick={handleCopyRef}
                  className="text-gray-400 hover:text-gray-700 cursor-pointer"
                  title="Copy Reference"
                >
                  {copiedRef ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
              </div>
            </div>

            {payout.narration && (
              <div className="flex items-start justify-between gap-2 pt-1 border-t border-gray-100">
                <span className="text-gray-500 shrink-0">Narration / Note:</span>
                <span className="text-right text-gray-800 font-medium truncate">
                  {payout.narration}
                </span>
              </div>
            )}

            <div className="flex items-center justify-between pt-1 border-t border-gray-100">
              <span className="text-gray-500">Initiated At:</span>
              <span className="text-gray-800">{formatDate(payout.initiatedAt)}</span>
            </div>

            {payout.completedAt && (
              <div className="flex items-center justify-between pt-1 border-t border-gray-100">
                <span className="text-gray-500">Completed At:</span>
                <span className="text-gray-800 font-medium">{formatDate(payout.completedAt)}</span>
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-gray-100 bg-gray-50/80 flex items-center gap-2.5">
          <button
            type="button"
            onClick={handleShareSummary}
            className="flex-1 py-2.5 px-3 bg-white hover:bg-gray-100 border border-gray-200 text-gray-800 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
          >
            <Share2 className="h-3.5 w-3.5" />
            <span>Share Details</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 px-3 bg-purple-900 hover:bg-purple-950 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 shadow-xs transition-colors cursor-pointer"
          >
            Close Panel
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default PayoutDetailPanel;
