import { useEffect, useState, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  CheckCircle2,
  AlertCircle,
  Clock,
  Download,
  RefreshCw,
  FileCheck,
} from 'lucide-react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { useBusinessStore } from '@/stores/business.store';
import { useDashboardEvents } from '@/stores/dashboard.store';
import { formatNgn } from '@/lib/format';
import { mapPaystackError } from '@/lib/paystack-errors';
import api from '@/lib/axios';
import toast from 'react-hot-toast';
import type { TaxPayment } from '@/types';

type CallbackStatus = 'verifying' | 'completed' | 'pending' | 'failed';

export default function PaymentCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const activeBiz = useBusinessStore((s) => s.activeBusiness);
  const invalidateDashboard = useDashboardEvents((s) => s.invalidateDashboard);

  const reference = searchParams.get('reference') || searchParams.get('trxref');
  const paymentId = searchParams.get('paymentId');
  const businessId = searchParams.get('businessId') || activeBiz?.id;

  const [status, setStatus] = useState<CallbackStatus>('verifying');
  const [paymentData, setPaymentData] = useState<TaxPayment | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [retryCount, setRetryCount] = useState(0);
  const [downloadingReceipt, setDownloadingReceipt] = useState(false);

  const hasExecutedRef = useRef(false);

  const performVerification = async (currentAttempt = 0) => {
    if (!businessId) {
      setStatus('failed');
      setErrorMessage(
        'Missing business identifier. Please select your active business.',
      );
      return;
    }

    try {
      let payment: TaxPayment | null = null;

      if (paymentId) {
        const res = await api.get(
          `/businesses/${businessId}/tax/payments/${paymentId}/verify`,
        );
        payment = res.data.data;
      } else if (reference) {
        // Fallback search by reference if paymentId is not present
        const listRes = await api.get(
          `/businesses/${businessId}/tax/payments?limit=20`,
        );
        const matching = (listRes.data.data || []).find(
          (p: TaxPayment) => p.transactionReference === reference,
        );
        if (matching) {
          const verifyRes = await api.get(
            `/businesses/${businessId}/tax/payments/${matching.id}/verify`,
          );
          payment = verifyRes.data.data;
        }
      }

      if (payment) {
        setPaymentData(payment);

        if (payment.paymentStatus === 'completed') {
          setStatus('completed');
          invalidateDashboard('tax_paid');
          toast.success('Payment successfully verified!');
          return;
        } else if (payment.paymentStatus === 'failed') {
          setStatus('failed');
          setErrorMessage(
            'The transaction was declined or failed at the bank.',
          );
          return;
        }
      }

      // If status is still pending and we have retries left, backoff and retry
      if (currentAttempt < 3) {
        const delays = [2000, 3500, 5000];
        const nextAttempt = currentAttempt + 1;
        setRetryCount(nextAttempt);
        setTimeout(() => {
          performVerification(nextAttempt);
        }, delays[currentAttempt]);
      } else {
        setStatus('pending');
      }
    } catch (err: any) {
      if (currentAttempt < 2) {
        const nextAttempt = currentAttempt + 1;
        setRetryCount(nextAttempt);
        setTimeout(() => {
          performVerification(nextAttempt);
        }, 3000);
      } else {
        const mapped = mapPaystackError(err);
        setStatus('failed');
        setErrorMessage(mapped.body || 'Could not verify transaction status.');
      }
    }
  };

  useEffect(() => {
    if (!hasExecutedRef.current) {
      hasExecutedRef.current = true;
      performVerification(0);
    }
  }, [businessId, reference, paymentId]);

  const handleDownloadReceipt = async () => {
    if (!businessId || !paymentData) return;
    setDownloadingReceipt(true);
    try {
      const response = await api.get(
        `/businesses/${businessId}/receipts/payment/${paymentData.id}/pdf`,
        { responseType: 'blob' },
      );
      const url = window.URL.createObjectURL(
        new Blob([response.data], { type: 'application/pdf' }),
      );
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute(
        'download',
        `WallXERP_Receipt_${paymentData.transactionReference}.pdf`,
      );
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success('Receipt downloaded');
    } catch {
      toast.error('Failed to download receipt');
    } finally {
      setDownloadingReceipt(false);
    }
  };

  return (
    <div className='min-h-[80vh] flex items-center justify-center p-4 sm:p-6'>
      <div className='w-full max-w-lg animate-in fade-in zoom-in-95 duration-200'>
        {/* State: Verifying */}
        {status === 'verifying' && (
          <Card className='text-center py-12 px-6 shadow-xl border border-gray-100'>
            <div className='relative mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-50 text-emerald-600'>
              <RefreshCw className='h-10 w-10 animate-spin text-emerald-600' />
            </div>
            <h2 className='text-xl font-bold text-gray-900'>
              Verifying Payment Settlement
            </h2>
            <p className='mt-2 text-sm text-gray-500 max-w-sm mx-auto'>
              Please wait while we confirm your tax remittance with Paystack and
              update your NRS compliance record.
            </p>
            {retryCount > 0 && (
              <div className='mt-4 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-medium'>
                <Clock className='h-3.5 w-3.5' />
                Synchronizing gateway state (attempt {retryCount + 1} of 4)...
              </div>
            )}
          </Card>
        )}

        {/* State: Completed */}
        {status === 'completed' && (
          <Card className='p-0 overflow-hidden shadow-2xl border border-emerald-100'>
            {/* Header Banner */}
            <div className='bg-gradient-to-r from-emerald-600 to-teal-700 p-6 text-center text-white'>
              <div className='mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-white/20 backdrop-blur-xs border border-white/30 text-white shadow-inner'>
                <CheckCircle2 className='h-10 w-10 text-white' />
              </div>
              <h2 className='text-2xl font-black'>Payment Confirmed!</h2>
              <p className='text-xs text-emerald-100 mt-1'>
                Your SME statutory tax remittance has been securely processed.
              </p>
            </div>

            {/* Content Details */}
            <div className='p-6 space-y-5'>
              <div className='rounded-xl border border-gray-100 bg-gray-50 p-4 divide-y divide-gray-200/60 text-sm'>
                <div className='flex justify-between pb-3'>
                  <span className='text-gray-500 text-xs'>Amount Remitted</span>
                  <span className='font-bold text-emerald-700 text-base'>
                    {paymentData
                      ? formatNgn(Number(paymentData.amountPaid))
                      : '—'}
                  </span>
                </div>
                <div className='flex justify-between py-2.5'>
                  <span className='text-gray-500 text-xs'>
                    Transaction Reference
                  </span>
                  <span className='font-mono text-xs font-semibold text-gray-800'>
                    {paymentData?.transactionReference || reference || '—'}
                  </span>
                </div>
                <div className='flex justify-between py-2.5'>
                  <span className='text-gray-500 text-xs'>Payment Channel</span>
                  <span className='capitalize text-xs font-medium text-gray-700'>
                    {paymentData?.paymentMethod || 'Online Checkout'}
                  </span>
                </div>
                <div className='flex justify-between pt-2.5'>
                  <span className='text-gray-500 text-xs'>
                    Remittance Status
                  </span>
                  <span className='inline-flex items-center gap-1 text-xs font-medium text-emerald-700'>
                    <FileCheck className='h-3.5 w-3.5' /> NRS Direct Remittance
                    Ready
                  </span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className='space-y-3 pt-2'>
                <Button
                  className='w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2.5 shadow-sm'
                  onClick={handleDownloadReceipt}
                  isLoading={downloadingReceipt}
                >
                  <Download className='h-4 w-4 mr-2' />
                  Download Official Payment Receipt (PDF)
                </Button>

                <div className='grid grid-cols-2 gap-3'>
                  <Button
                    variant='secondary'
                    className='w-full'
                    onClick={() => navigate('/tax')}
                  >
                    View Tax Reports
                  </Button>
                  <Button
                    variant='secondary'
                    className='w-full'
                    onClick={() => navigate('/tax?tab=payments')}
                  >
                    View Receipts & Payments
                  </Button>
                </div>
              </div>
            </div>
          </Card>
        )}

        {/* State: Pending / Processing */}
        {status === 'pending' && (
          <Card className='text-center py-10 px-6 shadow-xl border border-amber-100'>
            <div className='mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-amber-50 text-amber-600'>
              <Clock className='h-8 w-8 text-amber-600' />
            </div>
            <h2 className='text-xl font-bold text-gray-900'>
              Payment Processing with Bank
            </h2>
            <p className='mt-2 text-sm text-gray-600 max-w-sm mx-auto'>
              Your transaction was received by the payment processor and is
              awaiting inter-bank settlement. We will update your tax report as
              soon as the bank confirms settlement.
            </p>
            {reference && (
              <div className='mt-4 p-2.5 bg-gray-50 rounded-lg text-xs font-mono text-gray-600 border border-gray-200'>
                Ref: {reference}
              </div>
            )}
            <div className='mt-6 flex justify-center gap-3'>
              <Button
                variant='secondary'
                onClick={() => {
                  setStatus('verifying');
                  performVerification(0);
                }}
              >
                <RefreshCw className='h-4 w-4 mr-1.5' /> Re-Check Status
              </Button>
              <Button onClick={() => navigate('/tax?tab=payments')}>
                Go to Payments Tracker
              </Button>
            </div>
          </Card>
        )}

        {/* State: Failed */}
        {status === 'failed' && (
          <Card className='text-center py-10 px-6 shadow-xl border border-red-100'>
            <div className='mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-red-50 text-red-600'>
              <AlertCircle className='h-8 w-8 text-red-600' />
            </div>
            <h2 className='text-xl font-bold text-gray-900'>
              Payment Verification Failed
            </h2>
            <p className='mt-2 text-sm text-gray-600 max-w-sm mx-auto'>
              {errorMessage ||
                'The payment was not completed or could not be verified by the gateway.'}
            </p>
            {reference && (
              <div className='mt-4 p-2.5 bg-gray-50 rounded-lg text-xs font-mono text-gray-500 border border-gray-200'>
                Ref: {reference}
              </div>
            )}
            <div className='mt-6 flex justify-center gap-3'>
              <Button
                variant='secondary'
                onClick={() => {
                  setStatus('verifying');
                  performVerification(0);
                }}
              >
                <RefreshCw className='h-4 w-4 mr-1.5' /> Retry Verification
              </Button>
              <Button
                className='bg-emerald-600 hover:bg-emerald-700 text-white'
                onClick={() => navigate('/tax')}
              >
                Return to Tax Reports
              </Button>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
