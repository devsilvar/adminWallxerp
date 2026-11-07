import { useState } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Copy,
  Check,
  Download,
  Clock,
  ArrowDownLeft,
  ArrowUpRight,
  ShieldCheck,
  Building2,
  FileText,
  AlertCircle,
  HelpCircle,
  ExternalLink,
  Loader2,
  CheckCheck,
  CheckCircle,
  ArrowLeftRight,
  Package,
} from 'lucide-react';
import api from '@/lib/axios';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { useBusinessStore } from '@/stores/business.store';
import type { SaleLineItem } from '@/types/index.ts';
import { formatNaira } from '@/lib/format';
import { useDisplayCurrency } from '@/hooks/useDisplayCurrency';

export type TransactionDetailType =
  | 'dva_inflow'
  | 'tax_payment'
  | 'invoice_payment'
  | 'sales_transaction';

export interface TransactionDetailData {
  id: string;
  type: TransactionDetailType;
  amount: number | string;
  status: string;
  date: string;
  referenceId?: string | null;
  description?: string;
  customerName?: string | null;
  customerHint?: string | null;
  paymentMethod?: string | null;
  source?: string; // Sales source: manual, cash, pos, invoice, etc.
  items?: SaleLineItem[];
  // Accrual links — a sale carrying any of these was recognised as revenue at
  // invoicing/credit issuance and cannot be moved to another business.
  invoice?: { id: string; invoiceNumber: string } | null;
  creditOrigin?: { id: string } | null;
  creditPayment?: { id: string } | null;
  accrualLinked?: boolean;
  // DVA specific
  dvaOrigin?: boolean;
  needsVerification?: boolean;
  verifiedAt?: string | null;
  // Tax payment specific
  taxReportId?: string;
  taxMonthLabel?: string;
  remittanceStatus?: 'collected' | 'remitting' | 'remitted' | string;
  firsRemittanceRef?: string | null;
  firsReceiptUrl?: string | null;
  // Business context
  businessId: string;
  virtualAccountNumber?: string;
  virtualAccountBank?: string;
}

interface TransactionDetailPanelProps {
  isOpen: boolean;
  onClose: () => void;
  transaction: TransactionDetailData | null;
  onVerifySuccess?: () => void;
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

export default function TransactionDetailPanel({
  isOpen,
  onClose,
  transaction,
  onVerifySuccess,
}: TransactionDetailPanelProps) {
  useDisplayCurrency();
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [reclassifying, setReclassifying] = useState(false);
  const navigate = useNavigate();

  const businesses = useBusinessStore((s) => s.businesses);
  const activeBusiness = useBusinessStore((s) => s.activeBusiness);
  const otherBusinesses = businesses.filter(
    (b) => b.id !== transaction?.businessId,
  );
  const [showReassign, setShowReassign] = useState(false);
  const [targetBusinessId, setTargetBusinessId] = useState('');
  const [reassigning, setReassigning] = useState(false);

  const handleReassign = async () => {
    if (!targetBusinessId) {
      toast.error('Please select a target business');
      return;
    }
    try {
      setReassigning(true);
      await api.post(
        `/businesses/${transaction!.businessId}/sales/${transaction!.id}/reassign`,
        {
          targetBusinessId,
        },
      );
      const targetBiz = businesses.find((b) => b.id === targetBusinessId);
      toast.success(
        `Transaction moved to ${targetBiz?.businessName || 'target business'}`,
      );
      onVerifySuccess?.();
      onClose();
    } catch (err: any) {
      toast.error(
        err.response?.data?.error?.message || 'Failed to reassign transaction',
      );
    } finally {
      setReassigning(false);
    }
  };

  if (!isOpen || !transaction) return null;

  const isDva = transaction.type === 'dva_inflow';
  const isTax = transaction.type === 'tax_payment';
  const isSale = transaction.type === 'sales_transaction';
  // Prefer the server's derived flag; fall back to the relations for payloads
  // (detail endpoint) that ship them without it.
  const isCreditLinked = Boolean(
    transaction.creditOrigin ||
    transaction.creditPayment,
  );
  const isInvoiceLinked = Boolean(
    transaction.invoice ||
    transaction.source === 'invoice',
  );

  const copyReference = () => {
    const ref = transaction.referenceId || transaction.id;
    navigator.clipboard.writeText(ref);
    setCopied(true);
    toast.success('Reference copied to clipboard');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadReceipt = async () => {
    try {
      setDownloading(true);

      // Determine the correct endpoint based on transaction type
      let endpoint: string;
      if (isTax) {
        endpoint = `/businesses/${transaction.businessId}/receipts/tax-payments/${transaction.id}`;
      } else if (isDva) {
        // Dedicated Bank Transfer Credit Advice receipt
        endpoint = `/businesses/${transaction.businessId}/receipts/dva-transfers/${transaction.id}`;
      } else {
        // Universal itemized sales receipt
        endpoint = `/businesses/${transaction.businessId}/receipts/sales/${transaction.id}`;
      }

      const res = await api.get(endpoint, { responseType: 'blob' });
      const url = window.URL.createObjectURL(
        new Blob([res.data], { type: 'application/pdf' }),
      );
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute(
        'download',
        `Receipt-${transaction.referenceId || transaction.id.slice(-8)}.pdf`,
      );
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success('Receipt downloaded successfully');
    } catch (err: any) {
      toast.error(
        err.response?.data?.error?.message || 'Failed to download receipt',
      );
    } finally {
      setDownloading(false);
    }
  };

  const handleVerifyAsSales = async () => {
    const bizId = transaction.businessId || activeBusiness?.id;
    if (!bizId || !transaction.id) {
      toast.error('Unable to verify: missing business or transaction ID');
      return;
    }

    try {
      setVerifying(true);
      await api.post(`/businesses/${bizId}/sales/${transaction.id}/verify`, {
        classification: 'Product Sale',
      });
      toast.success('Confirmed as taxable sales revenue');
      onVerifySuccess?.();
      onClose();
    } catch (err: any) {
      const errorMsg =
        err.response?.data?.error?.message ||
        err.response?.data?.message ||
        'Failed to verify transaction';
      toast.error(errorMsg);
    } finally {
      setVerifying(false);
    }
  };

  const handleReclassify = async () => {
    const bizId = transaction.businessId || activeBusiness?.id;
    if (!bizId || !transaction.id) {
      toast.error('Unable to reclassify: missing business or transaction ID');
      return;
    }

    try {
      setReclassifying(true);
      await api.post(
        `/businesses/${bizId}/sales/${transaction.id}/reclassify`,
        {
          classification: 'Transfer Between Accounts',
          category: 'transfer',
          isTaxable: false,
          reason: 'Internal transfer / Non-revenue funds',
        },
      );
      toast.success('Reclassified as non-taxable funds');
      onVerifySuccess?.();
      onClose();
    } catch (err: any) {
      const errorMsg =
        err.response?.data?.error?.message ||
        err.response?.data?.message ||
        'Failed to reclassify transaction';
      toast.error(errorMsg);
    } finally {
      setReclassifying(false);
    }
  };

  return createPortal(
    <div className='fixed inset-0 z-[9999] w-screen h-screen min-h-screen bg-slate-950/60 backdrop-blur-sm overflow-hidden animate-in fade-in duration-150'>
      {/* Full Screen Backdrop - covers entire viewport */}
      <div
        className='absolute inset-0 w-full h-full'
        onClick={onClose}
        aria-hidden='true'
      />

      {/* Drawer - positioned above backdrop */}
      <div className='fixed inset-y-0 right-0 max-w-lg w-full bg-white shadow-2xl flex flex-col z-10 pointer-events-auto animate-slide-in-right'>
        {/* Header */}
        <div className='px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50'>
          <div className='flex items-center gap-2'>
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-full ${
                isTax
                  ? 'bg-red-50 text-red-600 border border-red-100'
                  : 'bg-emerald-50 text-emerald-600 border border-emerald-100'
              }`}
            >
              {isTax ? (
                <ArrowUpRight className='h-4 w-4 stroke-[2.5]' />
              ) : (
                <ArrowDownLeft className='h-4 w-4 stroke-[2.5]' />
              )}
            </div>
            <div>
              <h3 className='text-sm font-bold text-gray-900'>
                {isTax
                  ? 'Tax Payment Details'
                  : isSale
                    ? 'Sales Transaction Details'
                    : 'Bank Transfer Details'}
              </h3>
              <p className='text-[11px] text-gray-500 font-mono'>
                {transaction.referenceId || transaction.id}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className='p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors'
          >
            <X className='h-5 w-5' />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className='flex-1 overflow-y-auto p-6 space-y-6'>
          {/* Main Amount Card */}
          <div className='rounded-2xl border border-gray-100 bg-gradient-to-b from-gray-50/80 to-white p-5 text-center shadow-xs'>
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wider mb-2 ${
                transaction.status === 'completed' ||
                transaction.status === 'confirmed' ||
                transaction.status === 'settled'
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/60'
                  : transaction.status === 'failed'
                    ? 'bg-red-50 text-red-700 border border-red-200/60'
                    : 'bg-amber-50 text-amber-700 border border-amber-200/60'
              }`}
            >
              {transaction.status === 'completed' ||
              transaction.status === 'confirmed' ||
              transaction.status === 'settled' ? (
                <CheckCheck className='h-3 w-3' />
              ) : (
                <Clock className='h-3 w-3' />
              )}
              {transaction.status}
            </span>

            {transaction.needsVerification && (
              <div className='mb-2'>
                <span className='inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-900 border border-amber-300 shadow-xs'>
                  <AlertCircle className='h-3.5 w-3.5 text-amber-600' />
                  Unverified Inflow — Review Required
                </span>
              </div>
            )}

            <div
              className={`text-3xl font-extrabold tracking-tight font-mono ${
                isTax ? 'text-red-600' : 'text-emerald-600'
              }`}
            >
              {isTax ? '-' : '+'}
              {formatNaira(transaction.amount)}
            </div>

            <p className='text-xs text-gray-500 mt-1'>
              {transaction.description ||
                (isTax
                  ? 'NRS SME Tax Remittance'
                  : isSale
                    ? 'Sales Transaction'
                    : 'Inbound Virtual Account Transfer')}
            </p>
          </div>

          {/* Review Banner for unverified transfers & sales (Direct Link to Sales Unverified Inflows) */}
          {transaction.needsVerification && (
            <div className='rounded-xl border border-amber-300 bg-amber-50/90 p-4 shadow-xs'>
              <div className='flex items-start gap-3'>
                <div className='h-8 w-8 rounded-lg bg-amber-100 flex items-center justify-center text-amber-700 shrink-0 mt-0.5'>
                  <AlertCircle className='h-5 w-5' />
                </div>
                <div className='flex-1 min-w-0'>
                  <div className='flex items-center justify-between gap-2 flex-wrap'>
                    <h4 className='text-xs font-bold text-amber-950 uppercase tracking-wide'>
                      {isDva ? 'Verification Required' : 'Tax Revenue Review Required'}
                    </h4>
                    <span className='px-2 py-0.5 rounded text-[10px] font-bold bg-amber-200 text-amber-900 border border-amber-300'>
                      Action Required
                    </span>
                  </div>
                  <p className='text-xs text-amber-800 mt-1 leading-relaxed'>
                    {isDva
                      ? 'This transfer was captured automatically. Verify and attach it to a sale when ready. The advance (if any) does not affect sales classification.'
                      : 'This transfer was captured automatically. Confirm if this is taxable sales income or non-taxable funds (loan, capital injection, or debtor repayment).'}
                  </p>
                  <div className='mt-3 flex flex-wrap items-center gap-2'>
                    <button
                      type='button'
                      onClick={() => {
                        onClose();
                        navigate(`/sales?tab=unverified&txnId=${transaction.id}`);
                      }}
                      className='px-3.5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold shadow-xs flex items-center gap-1.5 transition-colors cursor-pointer hover:shadow-sm'
                      title='Open directly in Sales Unverified Inflows'
                    >
                      <ExternalLink className='h-3.5 w-3.5' />
                      Go to Unverified Inflow &rarr;
                    </button>
                    {transaction.status !== 'pending' && (
                      <>
                        <button
                          type='button'
                          onClick={handleVerifyAsSales}
                          disabled={verifying}
                          className='px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-xs flex items-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer'
                        >
                          {verifying ? (
                            <Loader2 className='h-3.5 w-3.5 animate-spin' />
                          ) : (
                            <Check className='h-3.5 w-3.5' />
                          )}
                          Quick Confirm Sale
                        </button>
                        <button
                          type='button'
                          onClick={handleReclassify}
                          disabled={reclassifying}
                          className='px-3 py-1.5 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 rounded-lg text-xs font-semibold shadow-xs flex items-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer'
                        >
                          {reclassifying ? (
                            <Loader2 className='h-3.5 w-3.5 animate-spin' />
                          ) : (
                            <HelpCircle className='h-3.5 w-3.5' />
                          )}
                          Reclassify Non-Taxable
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Pending Transfer Notice (Awaiting Settlement) */}
          {transaction.status === 'pending' && (
            <div className='rounded-xl border border-amber-200/70 bg-amber-50/40 p-4'>
              <div className='flex items-start gap-3'>
                <Clock className='h-5 w-5 text-amber-600 shrink-0 mt-0.5' />
                <div className='flex-1'>
                  <h4 className='text-xs font-bold text-amber-900'>
                    Transfer Pending Confirmation
                  </h4>
                  <p className='text-xs text-amber-700 mt-0.5 leading-relaxed'>
                    This transfer is currently awaiting settlement confirmation
                    from the banking network. Tax revenue classification will
                    become available once confirmed.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* NRS Stage Remittance Banner (for Tax Payments) */}
          {isTax && (
            <div className='rounded-xl border border-blue-100 bg-blue-50/50 p-4'>
              <div className='flex items-start gap-3'>
                <ShieldCheck className='h-5 w-5 text-blue-600 shrink-0 mt-0.5' />
                <div className='flex-1'>
                  <div className='flex items-center justify-between'>
                    <h4 className='text-xs font-bold text-blue-900'>
                      NRS Compliance Status
                    </h4>
                    <span className='text-[10px] font-mono px-2 py-0.5 rounded bg-blue-100 text-blue-800 font-bold uppercase'>
                      {transaction.remittanceStatus || 'Collected'}
                    </span>
                  </div>
                  <p className='text-xs text-blue-700 mt-1 leading-relaxed'>
                    {transaction.remittanceStatus === 'remitted'
                      ? `Remitted in official NRS batch. Ref: ${transaction.firsRemittanceRef || 'VERIFIED'}`
                      : 'Funds collected and locked in custody pool. Scheduled for batch remittance to NRS.'}
                  </p>
                  {transaction.firsReceiptUrl && (
                    <a
                      href={transaction.firsReceiptUrl}
                      target='_blank'
                      rel='noreferrer'
                      className='mt-2 inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:underline'
                    >
                      View Government NRS Receipt{' '}
                      <ExternalLink className='h-3 w-3' />
                    </a>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Key Value Details List */}
          <div className='rounded-xl border border-gray-100 divide-y divide-gray-100 overflow-hidden text-xs'>
            <div className='px-4 py-3 bg-gray-50/50 font-bold text-gray-700 flex items-center gap-1.5'>
              <FileText className='h-3.5 w-3.5 text-gray-500' />
              Transaction Breakdown
            </div>

            <div className='px-4 py-3 flex items-center justify-between'>
              <span className='text-gray-500'>Transaction Reference</span>
              <div className='flex items-center gap-1.5'>
                <span className='font-mono text-gray-800 font-semibold text-[11px]'>
                  {transaction.referenceId || transaction.id}
                </span>
                <button
                  onClick={copyReference}
                  className='p-1 text-gray-400 hover:text-gray-700 rounded transition-colors'
                  title='Copy Reference'
                >
                  {copied ? (
                    <Check className='h-3.5 w-3.5 text-emerald-600' />
                  ) : (
                    <Copy className='h-3.5 w-3.5' />
                  )}
                </button>
              </div>
            </div>

            <div className='px-4 py-3 flex items-center justify-between'>
              <span className='text-gray-500'>Transaction Date & Time</span>
              <span className='text-gray-800 font-medium'>
                {formatDate(transaction.date)}
              </span>
            </div>

            {isDva && (
              <>
                <div className='px-4 py-3 flex items-center justify-between'>
                  <span className='text-gray-500'>Sender / Customer Hint</span>
                  <span className='text-gray-800 font-semibold'>
                    {transaction.customerName ||
                      transaction.customerHint ||
                      'Direct Bank Customer'}
                  </span>
                </div>
                <div className='px-4 py-3 flex items-center justify-between'>
                  <span className='text-gray-500'>Destination Account</span>
                  <span className='text-gray-800 font-medium'>
                    {transaction.virtualAccountBank || 'Wema Bank'} ••••{' '}
                    {(transaction.virtualAccountNumber || '0000').slice(-4)}
                  </span>
                </div>
                <div className='px-4 py-3 flex items-center justify-between'>
                  <span className='text-gray-500'>Capture Channel</span>
                  <span className='inline-flex items-center gap-1 text-emerald-700 font-medium'>
                    <Building2 className='h-3 w-3' /> Dedicated Virtual NUBAN
                  </span>
                </div>
                {(() => {
                  const gross = Number(transaction.amount);
                  return (
                    <>
                      <div className='px-4 py-3 flex items-center justify-between bg-gray-50/50'>
                        <span className='text-gray-500'>Gross Transfer</span>
                        <span className='font-mono font-medium text-gray-800'>
                          {formatNaira(gross)}
                        </span>
                      </div>
                      {transaction.status === 'pending' ? (
                        <div className='px-4 py-3 flex items-center justify-between bg-amber-50/40'>
                          <span className='font-semibold text-amber-950 flex items-center gap-1.5'>
                            <Clock className='h-4 w-4 text-amber-600 inline' />
                            Pending Settlement Credit
                          </span>
                          <span className='font-mono font-bold text-amber-700'>
                            {formatNaira(gross)}
                          </span>
                        </div>
                      ) : (
                        <div className='px-4 py-3 flex items-center justify-between bg-emerald-50/40'>
                          <span className='font-semibold text-emerald-950 flex items-center gap-1.5'>
                            <CheckCircle className='h-4 w-4 text-emerald-600 inline' />
                            Net Added to Wallet (100%)
                          </span>
                          <span className='font-mono font-bold text-emerald-700'>
                            {formatNaira(gross)}
                          </span>
                        </div>
                      )}
                    </>
                  );
                })()}
              </>
            )}

            {isTax && (
              <>
                <div className='px-4 py-3 flex items-center justify-between'>
                  <span className='text-gray-500'>Tax Obligation Month</span>
                  <span className='text-gray-800 font-bold'>
                    {transaction.taxMonthLabel || 'Current Period'}
                  </span>
                </div>
                <div className='px-4 py-3 flex items-center justify-between'>
                  <span className='text-gray-500'>Payment Gateway Method</span>
                  <span className='text-gray-800 font-medium uppercase'>
                    {transaction.paymentMethod || 'Card / Transfer'}
                  </span>
                </div>
              </>
            )}

            {isSale && (
              <>
                {transaction.customerName && (
                  <div className='px-4 py-3 flex items-center justify-between'>
                    <span className='text-gray-500'>Customer Name</span>
                    <span className='text-gray-800 font-semibold'>
                      {transaction.customerName}
                    </span>
                  </div>
                )}
                {transaction.source && (
                  <div className='px-4 py-3 flex items-center justify-between'>
                    <span className='text-gray-500'>Payment Method</span>
                    <span className='text-gray-800 font-medium capitalize'>
                      {transaction.source.replace(/_/g, ' ')}
                    </span>
                  </div>
                )}
                {transaction.paymentMethod && (
                  <div className='px-4 py-3 flex items-center justify-between'>
                    <span className='text-gray-500'>Payment Channel</span>
                    <span className='text-gray-800 font-medium'>
                      {transaction.paymentMethod}
                    </span>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Items Breakdown */}
          {isSale && transaction.items && transaction.items.length > 0 && (
            <div className='rounded-xl border border-gray-100 overflow-hidden text-xs'>
              <div className='px-4 py-3 bg-gray-50/50 font-bold text-gray-700 flex items-center justify-between'>
                <span className='flex items-center gap-1.5'>
                  <Package className='h-3.5 w-3.5 text-primary-500' />
                  Items Breakdown ({transaction.items.length})
                </span>
                <span className='text-gray-500 text-[11px] font-normal'>
                  Qty × Unit Price
                </span>
              </div>
              <div className='divide-y divide-gray-100'>
                {transaction.items.map((item, idx) => {
                  const lineTotal = Number(
                    item.lineTotal ?? item.quantity * item.unitPrice,
                  );
                  return (
                    <div
                      key={item.id || idx}
                      className='px-4 py-2.5 flex items-center justify-between'
                    >
                      <div>
                        <p className='font-semibold text-gray-800'>
                          {item.name}
                        </p>
                        <p className='text-[11px] text-gray-500'>
                          {item.quantity} × {formatNaira(item.unitPrice)}
                        </p>
                      </div>
                      <span className='font-semibold text-gray-900'>
                        {formatNaira(lineTotal)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Reassign Business Section for Multi-Business Owners */}
          {(isSale || isDva) && otherBusinesses.length > 0 && (
            <div className='rounded-xl border border-purple-100 bg-purple-50/40 p-4 space-y-3 text-xs'>
              <div className='flex items-center justify-between'>
                <div className='flex items-center gap-2 text-purple-950 font-bold'>
                  <ArrowLeftRight className='h-4 w-4 text-purple-700' />
                  <span>Reassign to Another Business</span>
                </div>
                <button
                  type='button'
                  onClick={() => setShowReassign(!showReassign)}
                  disabled={isCreditLinked}
                  title={
                    isCreditLinked
                      ? "Credit transactions cannot be moved to another business because customer debt obligations are non-transferable."
                      : undefined
                  }
                  className='text-[11px] font-semibold text-purple-700 hover:text-purple-900 cursor-pointer disabled:text-gray-400 disabled:hover:text-gray-400 disabled:cursor-not-allowed'
                >
                  {showReassign ? 'Cancel' : 'Move Sale'}
                </button>
              </div>
              <p className='text-gray-600 text-[11px]'>
                {isCreditLinked ? (
                  <span className='flex items-start gap-1.5'>
                    <HelpCircle className='h-3.5 w-3.5 shrink-0 mt-px text-gray-400' />
                    <span>
                      Credit transactions cannot be moved to another business
                      because customer debt obligations are non-transferable.
                    </span>
                  </span>
                ) : isInvoiceLinked ? (
                  <span className='flex items-start gap-1.5'>
                    <HelpCircle className='h-3.5 w-3.5 shrink-0 mt-px text-purple-600' />
                    <span>
                      This transaction is linked to an invoice. Moving this sale will
                      automatically reassign the invoice and its line items to the target business as well.
                    </span>
                  </span>
                ) : (
                  'Under Nigerian tax law, sales and tax obligations belong to the assigned business entity. Move misattributed transfers to keep ledgers accurate.'
                )}
              </p>
              {showReassign && !isCreditLinked && (
                <div className='space-y-2.5 pt-1'>
                  <select
                    value={targetBusinessId}
                    onChange={(e) => setTargetBusinessId(e.target.value)}
                    className='w-full text-xs rounded-lg border border-purple-200 bg-white px-3 py-2 text-gray-800 focus:outline-none focus:ring-2 focus:ring-purple-600'
                  >
                    <option value=''>Select target business…</option>
                    {otherBusinesses.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.businessName} ({b.merchantId || b.id.slice(0, 8)})
                      </option>
                    ))}
                  </select>
                  <button
                    type='button'
                    onClick={handleReassign}
                    disabled={!targetBusinessId || reassigning}
                    className='w-full py-2 px-3 bg-purple-900 hover:bg-purple-950 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer'
                  >
                    {reassigning ? (
                      <>
                        <Loader2 className='h-3.5 w-3.5 animate-spin' /> Moving
                        Sale…
                      </>
                    ) : (
                      <>
                        <ArrowLeftRight className='h-3.5 w-3.5' /> Confirm Move
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Action Footer */}
        <div className='p-4 border-t border-gray-100 bg-gray-50/80 flex items-center gap-3'>
          <button
            onClick={handleDownloadReceipt}
            disabled={
              downloading ||
              (transaction.status !== 'completed' &&
                transaction.status !== 'confirmed' &&
                transaction.status !== 'settled')
            }
            className='flex-1 py-2.5 px-4 bg-gray-900 hover:bg-black text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-2 shadow-xs transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
          >
            {downloading ? (
              <>
                <Loader2 className='h-4 w-4 animate-spin' /> Generating Receipt…
              </>
            ) : transaction.status === 'pending' ? (
              <>
                <Clock className='h-4 w-4' /> Receipt Available Once Confirmed
              </>
            ) : (
              <>
                <Download className='h-4 w-4' /> Download Official Receipt (PDF)
              </>
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
