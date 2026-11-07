import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  ShieldAlert,
  X,
  Lock,
  ArrowRight,
  CheckCircle2,
  RefreshCw,
  AlertTriangle,
  Sparkles,
} from 'lucide-react';
import Button from '@/components/ui/Button';
import { formatNgn } from '@/lib/format';
import api from '@/lib/axios';
import type { TaxReport } from '@/types';

interface FinalizeConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  report: TaxReport | null;
  taxPath?: string;
  onConfirm: () => Promise<void> | void;
}

export default function FinalizeConfirmationModal({
  isOpen,
  onClose,
  report,
  taxPath,
  onConfirm,
}: FinalizeConfirmationModalProps) {
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen]);

  const [isLoading, setIsLoading] = useState(false);
  const [isRecalculating, setIsRecalculating] = useState(false);
  const [recalcError, setRecalcError] = useState<string | null>(null);
  const [liveData, setLiveData] = useState<{
    totalSales: number | string;
    totalExpenses: number | string;
    grossProfit: number | string;
    taxPayable: number | string;
    taxRate: number | string;
  } | null>(null);
  const [userConfirmedReview, setUserConfirmedReview] = useState(false);

  // Trigger mandatory pre-finalization live recalculation whenever modal opens
  const runLiveRecalculation = async () => {
    if (!report) return;
    const path = taxPath || `/businesses/${report.businessId}/tax`;
    const d = new Date(report.taxMonth);
    const month = d.getUTCMonth() + 1;
    const year = d.getUTCFullYear();

    setIsRecalculating(true);
    setRecalcError(null);
    try {
      const res = await api.post(`${path}/calculate`, { month, year });
      setLiveData(res.data.data);
    } catch (err: any) {
      setRecalcError(
        err.response?.data?.error?.message ||
          'Failed to perform live pre-finalization recalculation. Please try again.',
      );
    } finally {
      setIsRecalculating(false);
    }
  };

  useEffect(() => {
    if (!isOpen || !report) {
      setLiveData(null);
      setRecalcError(null);
      setUserConfirmedReview(false);
      return;
    }
    runLiveRecalculation();
  }, [isOpen, report?.id]);

  if (!isOpen || !report) return null;

  const monthName = new Date(report.taxMonth).toLocaleDateString('en-NG', {
    month: 'long',
    year: 'numeric',
  });

  const displaySales = liveData
    ? Number(liveData.totalSales)
    : Number(report.totalSales);
  const displayExpenses = liveData
    ? Number(liveData.totalExpenses)
    : Number(report.totalExpenses);
  const displayGrossProfit = liveData
    ? Number(liveData.grossProfit)
    : Number(report.grossProfit);
  const displayTaxPayable = liveData
    ? Number(liveData.taxPayable)
    : Number(report.taxPayable);
  const displayTaxRate = liveData
    ? Number(liveData.taxRate)
    : Number(report.taxRate);

  // The monthly charge settles net VAT (or nothing, for VAT-exempt profiles) —
  // gross profit is the annual CIT/PIT base, not the monthly assessment base.
  const needsReview = Boolean(report.needsManualReview);
  const basis = report.taxBasis;
  const payableLabel = needsReview
    ? 'Assessment Pending'
    : basis === 'vat'
    ? 'Net VAT Payable'
    : 'Monthly Remittance';
  const grossProfitLabel =
    needsReview || basis === 'vat'
      ? 'Gross Profit (Reference)'
      : 'Annual Income-Tax Base (Gross Profit)';
  const payableCaption = needsReview
    ? 'Complete your Tax Profile Quiz before finalizing'
    : basis === 'vat'
    ? `Net VAT at ${displayTaxRate}% — output VAT minus input VAT`
    : basis === 'pit-provision'
    ? 'VAT-exempt — PIT is assessed annually with your State IRS'
    : 'VAT-exempt — CIT is assessed annually';

  const salesDelta = liveData
    ? Number(liveData.totalSales) - Number(report.totalSales)
    : 0;
  const expensesDelta = liveData
    ? Number(liveData.totalExpenses) - Number(report.totalExpenses)
    : 0;
  const taxDelta = liveData
    ? Number(liveData.taxPayable) - Number(report.taxPayable)
    : 0;
  const hasVariance =
    Math.abs(salesDelta) > 0.01 ||
    Math.abs(expensesDelta) > 0.01 ||
    Math.abs(taxDelta) > 0.01;

  const handleConfirm = async () => {
    setIsLoading(true);
    try {
      await onConfirm();
      onClose();
    } finally {
      setIsLoading(false);
    }
  };

  return createPortal(
    <div className='fixed inset-0 z-[9999] w-screen h-screen min-h-screen flex items-center justify-center p-3 sm:p-4 bg-slate-950/60 backdrop-blur-xs overflow-hidden'>
      {/* Backdrop */}
      <div
        className='absolute inset-0 cursor-default'
        onClick={isLoading ? undefined : onClose}
      />

      {/* Dialog Container */}
      <div
        className='relative z-10 w-full max-w-lg flex flex-col rounded-2xl bg-white shadow-2xl border border-gray-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150'
        role='dialog'
        aria-modal='true'
      >
        {/* Pinned Header */}
        <div className='flex items-center justify-between border-b border-gray-100 px-6 py-4 shrink-0 bg-slate-50/70'>
          <div className='flex items-center gap-3'>
            <div className='flex h-9 w-9 items-center justify-center rounded-xl bg-purple-100 text-purple-700'>
              <ShieldAlert className='h-5 w-5' />
            </div>
            <div>
              <h2 className='text-base font-bold tracking-tight text-gray-900'>
                Finalize Tax Report
              </h2>
              <p className='text-xs text-gray-500 font-medium'>
                {monthName} • Zero-Deficit Live Verification
              </p>
            </div>
          </div>
          <button
            type='button'
            onClick={onClose}
            disabled={isLoading}
            className='rounded-lg border border-transparent p-1.5 text-gray-400 hover:border-gray-200 hover:bg-gray-100 hover:text-gray-700 transition-colors'
            aria-label='Close'
          >
            <X className='h-4 w-4' />
          </button>
        </div>

        {/* Content Body */}
        <div className='px-6 py-5 space-y-4 max-h-[75vh] overflow-y-auto'>
          {/* Statutory Context Banner */}
          <div className='flex items-start gap-2.5 rounded-xl border border-blue-200 bg-blue-50/60 p-3.5 text-xs text-blue-950'>
            <Lock className='h-4 w-4 text-blue-700 shrink-0 mt-0.5' />
            <p className='leading-relaxed'>
              Trading for <strong>{monthName}</strong> has concluded. Finalizing
              locks the month's sales and allowable expenses to generate your
              NRS assessment slip. You may un-finalize at any time before tax
              payment if further corrections are needed.
            </p>
          </div>

          {/* Mandatory Live Recalculation Status Indicator */}
          {isRecalculating ? (
            <div className='flex items-center gap-3 rounded-xl border border-purple-200 bg-purple-50/70 p-4 text-xs text-purple-900 animate-pulse'>
              <RefreshCw className='h-5 w-5 text-purple-600 animate-spin shrink-0' />
              <div>
                <p className='font-bold text-purple-950'>
                  Recalculating Live Ledger...
                </p>
                <p className='text-purple-800 text-[11px] mt-0.5'>
                  Scanning all sales transactions and allowable expenses to
                  guarantee zero tax deficit.
                </p>
              </div>
            </div>
          ) : recalcError ? (
            <div className='flex items-start justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-950'>
              <div className='flex items-start gap-2.5'>
                <AlertTriangle className='h-5 w-5 text-rose-600 shrink-0 mt-0.5' />
                <div>
                  <p className='font-bold text-rose-900'>
                    Pre-Finalization Recalculation Error
                  </p>
                  <p className='text-rose-800 text-[11px] mt-0.5'>
                    {recalcError}
                  </p>
                </div>
              </div>
              <Button
                size='sm'
                variant='outline'
                onClick={runLiveRecalculation}
                className='shrink-0 text-xs border-rose-300 text-rose-800 hover:bg-rose-100'
              >
                <RefreshCw className='h-3.5 w-3.5 mr-1' /> Retry
              </Button>
            </div>
          ) : hasVariance ? (
            <div className='rounded-xl border border-amber-300 bg-amber-50/80 p-3.5 text-xs text-amber-950 space-y-1.5'>
              <div className='flex items-center gap-2'>
                <Sparkles className='h-4 w-4 text-amber-600 shrink-0' />
                <p className='font-bold text-amber-900'>
                  Ledger Updates Detected &amp; Captured!
                </p>
              </div>
              <p className='text-amber-800 text-[11px] leading-relaxed'>
                New transactions were recorded since this draft was last
                calculated. The figures below have been updated to capture all
                live transactions:
              </p>
              <div className='flex flex-wrap gap-3 pt-1 font-mono text-[11px]'>
                {Math.abs(salesDelta) > 0.01 && (
                  <span className='bg-amber-100/90 text-amber-900 px-2 py-0.5 rounded border border-amber-300'>
                    Sales: {salesDelta > 0 ? '+' : ''}
                    {formatNgn(salesDelta)}
                  </span>
                )}
                {Math.abs(expensesDelta) > 0.01 && (
                  <span className='bg-amber-100/90 text-amber-900 px-2 py-0.5 rounded border border-amber-300'>
                    Expenses: {expensesDelta > 0 ? '+' : ''}
                    {formatNgn(expensesDelta)}
                  </span>
                )}
                {Math.abs(taxDelta) > 0.01 && (
                  <span className='bg-amber-100/90 text-amber-950 font-bold px-2 py-0.5 rounded border border-amber-400'>
                    Tax Payable: {taxDelta > 0 ? '+' : ''}
                    {formatNgn(taxDelta)}
                  </span>
                )}
              </div>
            </div>
          ) : (
            <div className='flex items-center gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50/70 p-3.5 text-xs text-emerald-950'>
              <CheckCircle2 className='h-4 w-4 text-emerald-600 shrink-0' />
              <div>
                <p className='font-bold text-emerald-950'>
                  Live Ledger Verified — Zero Tax Deficit
                </p>
                <p className='text-emerald-800 text-[11px] mt-0.5'>
                  All turnover and allowable deductible expenses for {monthName}{' '}
                  are fully reconciled.
                </p>
              </div>
            </div>
          )}

          {needsReview && (
            <div className='flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-xs'>
              <AlertTriangle className='mt-0.5 h-4 w-4 shrink-0 text-amber-600' />
              <p className='font-medium text-amber-900'>
                No completed Tax Profile Quiz exists for this business, so no
                statutory rate applies. Complete the quiz before finalizing —
                the server will reject this finalization.
              </p>
            </div>
          )}

          {/* Breakdown Table */}
          <div className='rounded-xl border border-gray-200 overflow-hidden text-xs bg-white shadow-2xs'>
            <div className='divide-y divide-gray-100 px-4 py-1.5'>
              <div className='flex justify-between py-2 text-gray-600'>
                <span className='font-medium'>Total Turnover (Sales)</span>
                <span className='font-bold text-gray-900 font-mono'>
                  {formatNgn(displaySales)}
                </span>
              </div>
              <div className='flex justify-between py-2 text-gray-600'>
                <span className='font-medium'>
                  Allowable Expenses (Deductible)
                </span>
                <span className='font-bold text-gray-900 font-mono'>
                  {formatNgn(displayExpenses)}
                </span>
              </div>
              <div className='flex justify-between py-2 text-gray-700'>
                <span className='font-semibold text-purple-900'>
                  {grossProfitLabel}
                </span>
                <span className='font-bold text-purple-950 font-mono'>
                  {formatNgn(displayGrossProfit)}
                </span>
              </div>
            </div>
            <div className='bg-purple-50/80 px-4 py-3 border-t border-purple-200 flex items-center justify-between'>
              <div>
                <span className='text-xs font-bold text-purple-950 uppercase tracking-wider block'>
                  {payableLabel}
                </span>
                <span className='text-[10px] text-purple-700 font-medium'>
                  {payableCaption}
                </span>
              </div>
              <span className='text-lg font-extrabold text-purple-950 font-mono'>
                {formatNgn(displayTaxPayable)}
              </span>
            </div>
          </div>

          {/* Acknowledgment Checkbox */}
          <label className='flex items-start gap-2.5 pt-2 cursor-pointer select-none'>
            <input
              type='checkbox'
              checked={userConfirmedReview}
              onChange={(e) => setUserConfirmedReview(e.target.checked)}
              disabled={isRecalculating || Boolean(recalcError)}
              className='mt-0.5 rounded border-gray-300 text-purple-600 focus:ring-purple-500 disabled:opacity-50'
            />
            <span className='text-xs text-gray-700 font-medium leading-relaxed'>
              I have verified these recalculated figures and confirm they
              capture all sales and allowable expenses for{' '}
              <strong>{monthName}</strong> without deficit.
            </span>
          </label>
        </div>

        {/* Pinned Action Footer */}
        <div className='flex items-center justify-between gap-2.5 border-t border-gray-100 bg-slate-50/80 px-6 py-3.5 shrink-0'>
          <Button
            type='button'
            variant='outline'
            className='text-xs'
            onClick={onClose}
            disabled={isLoading}
          >
            Cancel
          </Button>

          <Button
            type='button'
            className='text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-semibold disabled:opacity-50 disabled:cursor-not-allowed shadow-xs'
            onClick={handleConfirm}
            isLoading={isLoading}
            disabled={
              isLoading ||
              isRecalculating ||
              Boolean(recalcError) ||
              needsReview ||
              !userConfirmedReview
            }
          >
            <CheckCircle2 className='h-3.5 w-3.5 mr-1.5' />
            Yes, Finalize {monthName}
            <ArrowRight className='h-3.5 w-3.5 ml-1.5' />
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
