import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  ShieldCheck,
  X,
  CreditCard,
  Building2,
  Calendar,
  Lock,
  ArrowRight,
} from 'lucide-react';
import Button from '@/components/ui/Button';
import PinModal from '@/components/PinModal';
import { formatNgn } from '@/lib/format';
import { usePinStore } from '@/stores/pin.store';
import { useDashboardEvents } from '@/stores/dashboard.store';
import api from '@/lib/axios';
import toast from 'react-hot-toast';
import type { Business, TaxReport } from '@/types';

interface PaymentConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  report: TaxReport | null;
  business: Business | null;
  onSuccess?: () => void;
}

export default function PaymentConfirmationModal({
  isOpen,
  onClose,
  report,
  business,
  onSuccess,
}: PaymentConfirmationModalProps) {
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen]);

  const [isPinModalOpen, setIsPinModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const hasPin = usePinStore((s) => s.hasPin);
  const invalidateDashboard = useDashboardEvents((s) => s.invalidateDashboard);

  if (!isOpen || !report || !business) return null;

  const monthName = new Date(report.taxMonth).toLocaleDateString('en-NG', {
    month: 'long',
    year: 'numeric',
  });

  const obligationLabel =
    report.taxBasis === 'vat'
      ? 'Value Added Tax'
      : report.taxBasis === 'cit-provision'
      ? 'Companies Income Tax (provision)'
      : report.taxBasis === 'pit-provision'
      ? 'Personal Income Tax (provision)'
      : null;

  const handleAuthorizeClick = () => {
    if (hasPin) {
      setIsPinModalOpen(true);
    } else {
      // Proceed directly if no PIN configured yet
      executePayment();
    }
  };

  const executePayment = async () => {
    setIsLoading(true);
    try {
      const res = await api.post(`/businesses/${business.id}/tax/pay`, {
        taxReportId: report.id,
      });

      const { authorizationUrl } = res.data.data;
      if (authorizationUrl) {
        toast.success('Redirecting to Paystack secured checkout...');
        invalidateDashboard('tax_paid');
        if (onSuccess) onSuccess();
        onClose();
        // Redirect to Paystack
        window.location.href = authorizationUrl;
      } else {
        toast.error('Could not obtain payment checkout URL');
      }
    } catch (err: any) {
      toast.error(
        err.response?.data?.error?.message ||
          err.response?.data?.message ||
          'Failed to initiate payment. Please try again.',
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handlePinSuccess = (_token: string) => {
    setIsPinModalOpen(false);
    executePayment();
  };

  return (
    <>
      {createPortal(
        <div className='fixed inset-0 z-[9999] w-screen h-screen min-h-screen flex items-center justify-center p-3 sm:p-4 bg-slate-950/60 backdrop-blur-xs overflow-hidden'>
          {/* Backdrop */}
          <div
            className='absolute inset-0 cursor-default'
            onClick={isLoading ? undefined : onClose}
          />

          {/* Dialog Container */}
          <div
            className='relative z-10 w-full max-w-lg max-h-[88vh] flex flex-col rounded-none bg-white shadow-2xl border border-gray-300 animate-in fade-in zoom-in-95 duration-150'
            role='dialog'
            aria-modal='true'
          >
            {/* Pinned Header */}
            <div className='flex items-center justify-between border-b border-gray-200 px-5 py-4 shrink-0 bg-gray-50/50'>
              <div className='flex items-center gap-2.5'>
                <div className='flex h-8 w-8 items-center justify-center rounded-none bg-gray-900 text-white'>
                  <ShieldCheck className='h-4 w-4' />
                </div>
                <div>
                  <h2 className='text-sm font-semibold tracking-tight text-gray-900'>
                    Tax Remittance Assessment
                  </h2>
                  <p className='text-xs text-gray-500'>
                    Official NRS SME Compliance Bill
                  </p>
                </div>
              </div>
              <button
                type='button'
                onClick={onClose}
                disabled={isLoading}
                className='rounded-none border border-transparent p-1.5 text-gray-400 hover:border-gray-300 hover:bg-gray-100 hover:text-gray-700 transition-colors'
                aria-label='Close'
              >
                <X className='h-4 w-4' />
              </button>
            </div>

            {/* Scrollable Content Body */}
            <div className='flex-1 overflow-y-auto px-5 py-4 space-y-4'>
              {/* Taxpayer Meta */}
              <div className='flex items-center justify-between p-3 rounded-none bg-gray-50 border border-gray-200 text-xs text-gray-600'>
                <div className='flex items-center gap-2'>
                  <Building2 className='h-4 w-4 text-gray-500' />
                  <span className='font-semibold text-gray-900'>
                    {business.businessName}
                  </span>
                  {business.taxId && (
                    <span className='rounded-none bg-gray-200 px-1.5 py-0.5 text-[10px] text-gray-700 font-mono'>
                      TIN: {business.taxId}
                    </span>
                  )}
                </div>
                <div className='flex items-center gap-1.5 font-medium text-gray-700'>
                  <Calendar className='h-3.5 w-3.5 text-gray-600' />
                  <span>{monthName}</span>
                </div>
              </div>

              {/* Assessment Breakdown Table */}
              <div className='rounded-none border border-gray-200 overflow-hidden text-xs'>
                <div className='bg-gray-100/70 px-4 py-2 border-b border-gray-200 font-semibold text-gray-700 flex justify-between uppercase tracking-wider text-[11px]'>
                  <span>Assessment Line</span>
                  <span>Amount (NGN)</span>
                </div>
                <div className='divide-y divide-gray-100 px-4 py-1.5 bg-white'>
                  <div className='flex justify-between py-2 text-gray-600'>
                    <span>Total Sales Revenue</span>
                    <span className='font-medium text-gray-900'>
                      {formatNgn(report.totalSales)}
                    </span>
                  </div>
                  <div className='flex justify-between py-2 text-gray-600'>
                    <span>Allowable Deductible Expenses</span>
                    <span className='font-medium text-red-600'>
                      - {formatNgn(report.totalExpenses)}
                    </span>
                  </div>
                  <div className='flex justify-between py-2 text-gray-700 font-medium'>
                    <span>Net Assessable Gross Profit</span>
                    <span className='text-gray-900'>
                      {formatNgn(report.grossProfit)}
                    </span>
                  </div>
                  <div className='flex justify-between py-2 text-gray-600'>
                    <span>Applied SME Statutory Tax Rate</span>
                    <span className='font-mono font-medium text-gray-900'>
                      {Number(report.taxRate).toFixed(2)}%
                    </span>
                  </div>
                  {obligationLabel && (
                    <div className='flex justify-between py-2 text-gray-600'>
                      <span>Obligation</span>
                      <span className='font-medium text-gray-900'>
                        {obligationLabel}
                      </span>
                    </div>
                  )}
                </div>

                {/* Total Due Pill */}
                <div className='bg-emerald-50 px-4 py-3 border-t border-emerald-200 flex items-center justify-between'>
                  <div>
                    <span className='block text-xs font-semibold text-emerald-900 uppercase tracking-wider'>
                      Total Tax Remittance Due
                    </span>
                    <span className='text-[11px] text-emerald-700'>
                      Directly remitted to NRS
                    </span>
                  </div>
                  <span className='text-lg font-bold text-emerald-900 font-mono'>
                    {formatNgn(report.taxPayable)}
                  </span>
                </div>
              </div>

              {/* Payment Channel Guarantee */}
              <div className='flex items-start gap-3 rounded-none border border-blue-200 bg-blue-50/60 p-3 text-xs text-blue-950'>
                <CreditCard className='h-4 w-4 text-blue-700 shrink-0 mt-0.5' />
                <div>
                  <p className='font-semibold'>
                    Paystack Secured Payment Gateway
                  </p>
                  <p className='text-blue-900/80 mt-0.5 text-[11px] leading-relaxed'>
                    Supports Nigerian Debit Cards (Mastercard, Visa, Verve),
                    Direct Bank Transfer, and USSD. Official NRS payment
                    receipts are generated automatically.
                  </p>
                </div>
              </div>
            </div>

            {/* Pinned Action Footer */}
            <div className='flex items-center justify-end gap-2.5 border-t border-gray-200 bg-gray-50/80 px-5 py-3 shrink-0'>
              <Button
                type='button'
                variant='outline'
                className='rounded-none text-xs'
                onClick={onClose}
                disabled={isLoading}
              >
                Cancel
              </Button>
              <Button
                type='button'
                className='rounded-none text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-medium'
                onClick={handleAuthorizeClick}
                isLoading={isLoading}
              >
                {hasPin ? <Lock className='h-3.5 w-3.5 mr-1.5' /> : null}
                Authorize &amp; Pay {formatNgn(report.taxPayable)}
                <ArrowRight className='h-3.5 w-3.5 ml-1.5' />
              </Button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {/* 4-Digit PIN Verification Step-Up */}
      <PinModal
        isOpen={isPinModalOpen}
        onClose={() => setIsPinModalOpen(false)}
        onSuccess={handlePinSuccess}
        title='Authorize Tax Remittance'
        subtitle={`Enter your 4-digit PIN to authorize payment of ${formatNgn(report.taxPayable)} for ${monthName}.`}
      />
    </>
  );
}
