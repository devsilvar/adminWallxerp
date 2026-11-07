import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CreditCard,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  FileText,
  RotateCcw,
} from 'lucide-react';
import Card from '@/components/ui/Card.tsx';
import Button from '@/components/ui/Button.tsx';
import { TableSkeleton } from '@/components/ui/Skeleton.tsx';
import ErrorState from '@/components/ui/ErrorState.tsx';
import EmptyState from '@/components/ui/EmptyState.tsx';
import { useBusinessStore } from '@/stores/business.store.ts';
import api, { getErrorMessage } from '@/lib/axios.ts';
import toast from 'react-hot-toast';
import type { TaxPayment, Pagination } from '@/types/index.ts';
import { mapPaystackError } from '@/lib/paystack-errors';
import TransactionDetailPanel, {
  type TransactionDetailData,
} from '@/components/TransactionDetailPanel';

const STATUSES = [
  'pending',
  'processing',
  'completed',
  'failed',
  'refunded',
] as const;

function formatNaira(n: number) {
  return `₦${Number(n).toLocaleString('en-NG', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}
function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-NG', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
function statusBadge(s: string) {
  const m: Record<string, string> = {
    pending: 'bg-yellow-100 text-yellow-700',
    processing: 'bg-blue-100 text-blue-700',
    completed: 'bg-green-100 text-green-700',
    failed: 'bg-red-100 text-red-700',
    refunded: 'bg-purple-100 text-purple-700',
  };
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${m[s] || 'bg-gray-100 text-gray-600'}`}
    >
      {s}
    </span>
  );
}

// NRS remittance status — only meaningful once a payment is completed. Tells
// the SME whether the tax they paid has been forwarded to NRS yet.
function remittanceBadge(p: TaxPayment) {
  if (p.paymentStatus !== 'completed' || !p.remittanceStatus) {
    return <span className='text-xs text-gray-300'>—</span>;
  }
  const map: Record<string, { cls: string; label: string }> = {
    collected: {
      cls: 'bg-amber-100 text-amber-700',
      label: 'Collected — awaiting NRS',
    },
    remitting: {
      cls: 'bg-blue-100 text-blue-700',
      label: 'Remittance in progress',
    },
    remitted: { cls: 'bg-green-100 text-green-700', label: 'Remitted to NRS' },
  };
  const v = map[p.remittanceStatus] ?? {
    cls: 'bg-gray-100 text-gray-600',
    label: p.remittanceStatus,
  };
  return (
    <div className='flex flex-col gap-0.5'>
      <span
        className={`inline-block w-fit rounded-full px-2.5 py-0.5 text-xs font-medium ${v.cls}`}
      >
        {v.label}
      </span>
      {p.remittanceStatus === 'remitted' && p.firsRemittanceRef && (
        <span className='font-mono text-[10px] text-gray-400'>
          Ref: {p.firsRemittanceRef}
          {p.firsReceiptUrl && (
            <>
              {' · '}
              <a
                href={p.firsReceiptUrl}
                target='_blank'
                rel='noopener noreferrer'
                className='text-primary-600 hover:underline'
              >
                Receipt
              </a>
            </>
          )}
        </span>
      )}
    </div>
  );
}

interface PaymentsProps {
  embedded?: boolean;
}

export default function Payments({ embedded = false }: PaymentsProps = {}) {
  const navigate = useNavigate();
  const biz = useBusinessStore((s) => s.activeBusiness);
  const [payments, setPayments] = useState<TaxPayment[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [page, setPage] = useState(1);
  const [filterStatus, setFilterStatus] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState<string | null>(null);
  const [abandoning, setAbandoning] = useState<string | null>(null);
  const [selectedPayment, setSelectedPayment] =
    useState<TransactionDetailData | null>(null);

  const taxPath = biz ? `/businesses/${biz.id}/tax` : '';

  const fetchPayments = () => {
    if (!biz) return;
    setIsLoading(true);
    setError(null);
    const params: Record<string, any> = { page, limit: 15 };
    if (filterStatus) params.status = filterStatus;
    api
      .get(`${taxPath}/payments`, { params })
      .then((r) => {
        setPayments(r.data.data);
        setPagination(r.data.pagination);
      })
      .catch((e) => setError(getErrorMessage(e, 'Failed to load payments.')))
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    fetchPayments();
  }, [biz, page, filterStatus]);

  const handleVerify = async (id: string) => {
    setVerifying(id);
    try {
      await api.get(`${taxPath}/payments/${id}/verify`);
      toast.success('Payment verified');
      fetchPayments();
    } catch (err: unknown) {
      const mapped = mapPaystackError(err as any);
      if (mapped.intent !== 'silent') {
        toast.error(`${mapped.title}: ${mapped.body}`);
      }
    } finally {
      setVerifying(null);
    }
  };

  const handleAbandon = async (id: string) => {
    if (
      !confirm(
        'Are you sure you want to reset this pending payment session? Your monthly tax report will return to pending status so you can initiate a fresh checkout.',
      )
    )
      return;
    setAbandoning(id);
    try {
      await api.post(`${taxPath}/payments/${id}/abandon`);
      toast.success('Payment session reset');
      fetchPayments();
    } catch (err: any) {
      toast.error(
        err.response?.data?.error?.message || 'Failed to reset payment',
      );
    } finally {
      setAbandoning(null);
    }
  };

  if (!biz)
    return (
      <p className='py-20 text-center text-gray-400'>
        Select a business first.
      </p>
    );

  return (
    <div className='space-y-6'>
      {!embedded && (
        <div>
          <h1 className='text-2xl font-bold text-gray-900'>Tax Payments</h1>
          <p className='mt-1 font-body text-sm text-gray-500'>
            Your tax remittances to NRS. Money customers send you appears under
            Account &amp; Sales, not here.
          </p>
        </div>
      )}

      <div className='flex flex-col gap-3 sm:flex-row sm:items-center'>
        <select
          value={filterStatus}
          onChange={(e) => {
            setFilterStatus(e.target.value);
            setPage(1);
          }}
          className='w-full sm:w-auto rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500'
        >
          <option value=''>All Statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </option>
          ))}
        </select>
        {pagination && (
          <span className='font-body text-xs text-gray-400'>
            {pagination.total} total
          </span>
        )}
      </div>

      {error && <ErrorState message={error} onRetry={fetchPayments} />}

      {!error && isLoading && <TableSkeleton rows={5} columns={5} />}

      {!error && !isLoading && payments.length === 0 && (
        <EmptyState icon={CreditCard} message='No payments found.' />
      )}

      {!error && !isLoading && payments.length > 0 && (
        <>
          {/* Desktop table */}
          <div className='hidden md:block rounded-md border border-gray-200 bg-white shadow-sm overflow-x-auto'>
            <table className='w-full'>
              <thead>
                <tr className='border-b border-gray-100 text-left text-xs font-medium uppercase tracking-wider text-gray-400'>
                  <th className='px-4 py-3'>Date</th>
                  <th className='px-4 py-3'>Reference</th>
                  <th className='px-4 py-3'>Method</th>
                  <th className='px-4 py-3 text-right'>Amount</th>
                  <th className='px-4 py-3'>Status</th>
                  <th className='px-4 py-3'>NRS Status</th>
                  <th className='px-4 py-3 text-right'>Actions</th>
                </tr>
              </thead>
              <tbody className='font-body text-sm'>
                {payments.map((p) => (
                  <tr
                    key={p.id}
                    onClick={() =>
                      setSelectedPayment({
                        id: p.id,
                        type: 'tax_payment',
                        amount: Number(p.amountPaid),
                        status: p.paymentStatus,
                        date: p.createdAt,
                        referenceId: p.transactionReference,
                        paymentMethod: p.paymentMethod,
                        taxReportId: p.taxReportId,
                        remittanceStatus: p.remittanceStatus,
                        firsRemittanceRef: p.firsRemittanceRef,
                        firsReceiptUrl: p.firsReceiptUrl,
                        businessId: biz.id,
                      })
                    }
                    className='border-b border-gray-50 hover:bg-gray-50/80 cursor-pointer transition-colors'
                  >
                    <td className='px-4 py-3 text-gray-600'>
                      {formatDate(p.createdAt)}
                    </td>
                    <td className='px-4 py-3 font-mono text-xs text-gray-500'>
                      {p.transactionReference}
                    </td>
                    <td className='px-4 py-3 capitalize text-gray-600'>
                      {p.paymentMethod}
                    </td>
                    <td className='px-4 py-3 text-right font-semibold text-gray-900'>
                      {formatNaira(Number(p.amountPaid))}
                    </td>
                    <td className='px-4 py-3'>
                      {statusBadge(p.paymentStatus)}
                    </td>
                    <td className='px-4 py-3'>{remittanceBadge(p)}</td>
                    <td className='px-4 py-3 text-right'>
                      <div
                        className='flex items-center justify-end gap-1.5'
                        onClick={(e) => e.stopPropagation()}
                      >
                        {p.paymentStatus === 'completed' && (
                          <Button
                            size='sm'
                            variant='ghost'
                            onClick={() =>
                              setSelectedPayment({
                                id: p.id,
                                type: 'tax_payment',
                                amount: Number(p.amountPaid),
                                status: p.paymentStatus,
                                date: p.createdAt,
                                referenceId: p.transactionReference,
                                paymentMethod: p.paymentMethod,
                                taxReportId: p.taxReportId,
                                remittanceStatus: p.remittanceStatus,
                                firsRemittanceRef: p.firsRemittanceRef,
                                firsReceiptUrl: p.firsReceiptUrl,
                                businessId: biz.id,
                              })
                            }
                            className='h-8 text-xs font-semibold text-gray-700'
                          >
                            <FileText className='h-3.5 w-3.5 mr-1' /> Receipt
                          </Button>
                        )}
                        {(p.paymentStatus === 'pending' ||
                          p.paymentStatus === 'processing') && (
                          <>
                            <Button
                              size='sm'
                              variant='ghost'
                              onClick={() => handleVerify(p.id)}
                              isLoading={verifying === p.id}
                            >
                              <RefreshCw className='h-3.5 w-3.5 mr-1' /> Verify
                            </Button>
                            <Button
                              size='sm'
                              variant='ghost'
                              className='text-gray-500 hover:text-red-600'
                              onClick={() => handleAbandon(p.id)}
                              isLoading={abandoning === p.id}
                              title='Reset stale payment session'
                            >
                              <RotateCcw className='h-3.5 w-3.5 mr-1' /> Reset
                            </Button>
                          </>
                        )}
                        {p.paymentStatus === 'failed' && (
                          <Button
                            size='sm'
                            variant='secondary'
                            className='text-xs'
                            onClick={() => navigate('/tax')}
                          >
                            Retry in Tax
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile card list */}
          <div className='md:hidden space-y-3'>
            {payments.map((p) => (
              <Card
                key={p.id}
                className='p-4 cursor-pointer hover:border-gray-300 transition-colors'
                onClick={() =>
                  setSelectedPayment({
                    id: p.id,
                    type: 'tax_payment',
                    amount: Number(p.amountPaid),
                    status: p.paymentStatus,
                    date: p.createdAt,
                    referenceId: p.transactionReference,
                    paymentMethod: p.paymentMethod,
                    taxReportId: p.taxReportId,
                    remittanceStatus: p.remittanceStatus,
                    firsRemittanceRef: p.firsRemittanceRef,
                    firsReceiptUrl: p.firsReceiptUrl,
                    businessId: biz.id,
                  })
                }
              >
                <div className='flex items-start justify-between gap-3'>
                  <div className='min-w-0 flex-1'>
                    <div className='flex items-center gap-2 flex-wrap'>
                      <span className='font-semibold text-gray-900'>
                        {formatNaira(Number(p.amountPaid))}
                      </span>
                      {statusBadge(p.paymentStatus)}
                    </div>
                    <p className='mt-1.5 font-mono text-xs text-gray-400 truncate'>
                      {p.transactionReference}
                    </p>
                    <p className='mt-1 text-xs text-gray-400'>
                      {formatDate(p.createdAt)} ·{' '}
                      <span className='capitalize'>{p.paymentMethod}</span>
                    </p>
                    {p.paymentStatus === 'completed' && p.remittanceStatus && (
                      <div className='mt-2'>{remittanceBadge(p)}</div>
                    )}
                  </div>
                  <div
                    className='flex flex-col items-end gap-1 shrink-0'
                    onClick={(e) => e.stopPropagation()}
                  >
                    {p.paymentStatus === 'completed' && (
                      <Button
                        size='sm'
                        variant='ghost'
                        onClick={() =>
                          setSelectedPayment({
                            id: p.id,
                            type: 'tax_payment',
                            amount: Number(p.amountPaid),
                            status: p.paymentStatus,
                            date: p.createdAt,
                            referenceId: p.transactionReference,
                            paymentMethod: p.paymentMethod,
                            taxReportId: p.taxReportId,
                            remittanceStatus: p.remittanceStatus,
                            firsRemittanceRef: p.firsRemittanceRef,
                            firsReceiptUrl: p.firsReceiptUrl,
                            businessId: biz.id,
                          })
                        }
                        className='h-8 text-xs font-semibold text-gray-700'
                      >
                        <FileText className='h-3.5 w-3.5 mr-1' /> Receipt
                      </Button>
                    )}
                    {(p.paymentStatus === 'pending' ||
                      p.paymentStatus === 'processing') && (
                      <div className='flex items-center gap-1'>
                        <Button
                          size='sm'
                          variant='ghost'
                          onClick={() => handleVerify(p.id)}
                          isLoading={verifying === p.id}
                        >
                          <RefreshCw className='h-3.5 w-3.5' />
                        </Button>
                        <Button
                          size='sm'
                          variant='ghost'
                          className='text-gray-400 hover:text-red-600'
                          onClick={() => handleAbandon(p.id)}
                          isLoading={abandoning === p.id}
                        >
                          <RotateCcw className='h-3.5 w-3.5' />
                        </Button>
                      </div>
                    )}
                    {p.paymentStatus === 'failed' && (
                      <Button
                        size='sm'
                        variant='secondary'
                        className='text-xs'
                        onClick={() => navigate('/tax')}
                      >
                        Retry
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </>
      )}

      {pagination && pagination.totalPages > 1 && (
        <div className='flex items-center justify-between'>
          <span className='font-body text-xs text-gray-400'>
            Page {pagination.page} of {pagination.totalPages}
          </span>
          <div className='flex gap-2'>
            <Button
              variant='secondary'
              size='sm'
              disabled={!pagination.hasPrev}
              onClick={() => setPage(page - 1)}
            >
              <ChevronLeft className='h-4 w-4' />
            </Button>
            <Button
              variant='secondary'
              size='sm'
              disabled={!pagination.hasNext}
              onClick={() => setPage(page + 1)}
            >
              <ChevronRight className='h-4 w-4' />
            </Button>
          </div>
        </div>
      )}

      {/* ── Transaction Detail Slide-Over ─────────────────────── */}
      <TransactionDetailPanel
        isOpen={Boolean(selectedPayment)}
        onClose={() => setSelectedPayment(null)}
        transaction={selectedPayment}
      />
    </div>
  );
}
