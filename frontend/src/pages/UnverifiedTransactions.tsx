import { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircle2, ChevronLeft, ChevronRight, AlertCircle, X, Gift, TrendingUp, Clock, ArrowRight, ShoppingBag, HelpCircle, Wallet, CircleDollarSign, Building2, BookOpen, FileText, Search, RefreshCw, ShieldCheck } from 'lucide-react';
import Button from '@/components/ui/Button';
import { useBusinessStore } from '@/stores/business.store';
import { useDashboardEvents } from '@/stores/dashboard.store';
import { useInvoiceStore } from '@/stores/invoice.store';
import { useCreditStore } from '@/stores/credit.store';
import api from '@/lib/axios';
import toast from 'react-hot-toast';
import type { SalesTransaction, Pagination, Invoice, CustomerCredit } from '@/types';
import NoBusinessPrompt from '@/components/NoBusinessPrompt';
import { useSubscriptionWriteGate } from '@/hooks/useSubscriptionWriteGate';
import { formatNaira } from '@/lib/format';
import { useDisplayCurrency } from '@/hooks/useDisplayCurrency';

interface TransactionClassification {
  id: string;
  name: string;
  category: string;
  taxTreatment: 'taxable' | 'non_taxable' | 'review_required';
  isRevenue: boolean;
  description: string | null;
}

type WizardStep = 'primary' | 'revenue' | 'non_revenue' | 'all' | 'match_invoice' | 'match_credit';
type PrimaryChoice = 'business_sale' | 'not_sale' | 'not_sure' | 'invoice_payment' | 'credit_payment';

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-NG', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

interface UnverifiedTransactionsProps {
  embedded?: boolean;
}

export default function UnverifiedTransactions({ embedded = false }: UnverifiedTransactionsProps = {}) {
  useDisplayCurrency();
  const biz = useBusinessStore((s) => s.activeBusiness);
  const businesses = useBusinessStore((s) => s.businesses);
  const invalidateDashboard = useDashboardEvents((s) => s.invalidateDashboard);
  const { blockIfNeeded } = useSubscriptionWriteGate();
  
  const [searchParams] = useSearchParams();
  const targetTxnId = searchParams.get('txnId') || searchParams.get('highlightId');
  const autoOpenedRef = useRef<string | null>(null);

  const [transactions, setTransactions] = useState<SalesTransaction[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [actioningId, setActioningId] = useState<string | null>(null);
  
  // Wizard modal state
  const [verifyModal, setVerifyModal] = useState<{ transaction: SalesTransaction } | null>(null);
  const [targetBusinessId, setTargetBusinessId] = useState<string>('');
  const [wizardStep, setWizardStep] = useState<WizardStep>('primary');
  const [, setPrimaryChoice] = useState<PrimaryChoice | null>(null);
  const [selectedClassification, setSelectedClassification] = useState<string>('');
  const [customerName, setCustomerName] = useState('');
  const [description, setDescription] = useState('');

  // Invoice matching state
  const [outstandingInvoices, setOutstandingInvoices] = useState<Invoice[]>([]);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
  const [loadingInvoices, setLoadingInvoices] = useState(false);
  const [invoiceSearch, setInvoiceSearch] = useState('');

  // Credit/debtor matching state
  const [outstandingCredits, setOutstandingCredits] = useState<CustomerCredit[]>([]);
  const [selectedCreditId, setSelectedCreditId] = useState<string | null>(null);
  const [loadingCredits, setLoadingCredits] = useState(false);
  const [creditSearch, setCreditSearch] = useState('');
  
  const [classifications, setClassifications] = useState<TransactionClassification[]>([]);
  const [loadingClassifications, setLoadingClassifications] = useState(false);

  useEffect(() => {
    if (biz) {
      fetchUnverified();
      fetchClassifications();
    }
  }, [biz, page]);

  // If navigated with ?txnId=..., auto-open the classification wizard and scroll to row
  useEffect(() => {
    if (!targetTxnId || transactions.length === 0) return;
    if (autoOpenedRef.current === targetTxnId) return;

    const match = transactions.find((t) => t.id === targetTxnId);
    if (match) {
      autoOpenedRef.current = targetTxnId;
      setVerifyModal({ transaction: match });
      setTimeout(() => {
        const el = document.getElementById(`unverified-row-${targetTxnId}`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 100);
    }
  }, [targetTxnId, transactions]);

  useEffect(() => {
    if (!verifyModal) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [verifyModal]);

  async function fetchClassifications() {
    setLoadingClassifications(true);
    try {
      const res = await api.get('/transaction-classifications');
      if (res.data.data && Array.isArray(res.data.data)) {
        setClassifications(res.data.data);
      } else {
        toast.error('Invalid classifications data');
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to load transaction types');
    } finally {
      setLoadingClassifications(false);
    }
  }

  async function fetchUnverified() {
    if (!biz) return;
    setLoading(true);
    try {
      const res = await api.get(`/businesses/${biz.id}/sales/unverified`, {
        params: { page, limit: 15 },
      });
      setTransactions(res.data.data);
      setPagination(res.data.pagination);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to load unverified transactions');
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify() {
    if (blockIfNeeded()) return;
    if (!biz || !verifyModal || !selectedClassification) {
      toast.error('Please select a classification');
      return;
    }

    setActioningId(verifyModal.transaction.id);
    try {
      // Determine revenue from the API-loaded classification (never hardcoded
      // slugs). Legacy slug fallback kept for robustness if classifications
      // haven't loaded yet — the backend also resolves those aliases.
      const selected = classifications.find((c) => c.name === selectedClassification);
      const isRevenue = selected
        ? selected.isRevenue
        : ['sales_revenue', 'service_revenue'].includes(selectedClassification);
      
      const isReassigning =
        !verifyModal.transaction.accrualLinked &&
        Boolean(targetBusinessId) &&
        targetBusinessId !== biz.id;
      const targetBizName = businesses.find((b) => b.id === targetBusinessId)?.businessName || 'target business';

      const payload = {
        classification: selectedClassification,
        customerName: customerName || undefined,
        description: description || undefined,
        targetBusinessId: isReassigning ? targetBusinessId : undefined,
      };

      if (isRevenue) {
        await api.post(`/businesses/${biz.id}/sales/${verifyModal.transaction.id}/verify`, payload);
        toast.success(
          isReassigning
            ? `Transaction verified and assigned to ${targetBizName}`
            : 'Transaction verified as business income'
        );
      } else {
        await api.post(`/businesses/${biz.id}/sales/${verifyModal.transaction.id}/reclassify`, payload);
        toast.success(
          isReassigning
            ? `Transaction reclassified and assigned to ${targetBizName}`
            : 'Transaction reclassified successfully'
        );
      }
      closeModal();
      invalidateDashboard('transaction_verified');
      fetchUnverified();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to process transaction');
    } finally {
      setActioningId(null);
    }
  }

  async function fetchOutstandingInvoices() {
    if (!biz) return;
    setLoadingInvoices(true);
    try {
      const [sentRes, overdueRes] = await Promise.all([
        api.get(`/businesses/${biz.id}/invoices`, { params: { status: 'sent', limit: 50 } }),
        api.get(`/businesses/${biz.id}/invoices`, { params: { status: 'overdue', limit: 50 } }),
      ]);
      const combined = [
        ...(sentRes.data?.data ?? []),
        ...(overdueRes.data?.data ?? []),
      ];
      setOutstandingInvoices(combined);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to load outstanding invoices');
    } finally {
      setLoadingInvoices(false);
    }
  }

  async function handleInvoiceReconcile() {
    if (blockIfNeeded()) return;
    if (!biz || !verifyModal || !selectedInvoiceId) {
      toast.error('Please select an invoice to match');
      return;
    }

    const targetInvoice = outstandingInvoices.find((i) => i.id === selectedInvoiceId);
    const transferAmount = Number(verifyModal.transaction.amount);
    const invoiceTotal = targetInvoice ? Number(targetInvoice.total) : 0;

    if (Math.abs(transferAmount - invoiceTotal) > 0.01) {
      toast.error(
        `Transfer amount (${formatNaira(transferAmount)}) does not match invoice total (${formatNaira(invoiceTotal)})`,
      );
      return;
    }

    setActioningId(verifyModal.transaction.id);
    try {
      const reconcileDva = useInvoiceStore.getState().reconcileDva;
      await reconcileDva(biz.id, selectedInvoiceId, verifyModal.transaction.id);
      toast.success(
        `Transfer matched to invoice ${targetInvoice?.invoiceNumber || ''} — invoice marked as paid`,
      );
      closeModal();
      invalidateDashboard('invoice_dva_reconciled');
      fetchUnverified();
    } catch (err: any) {
      toast.error(err.response?.data?.error?.message || err.response?.data?.message || 'Failed to match transfer to invoice');
    } finally {
      setActioningId(null);
    }
  }

  async function fetchOutstandingCredits() {
    if (!biz) return;
    setLoadingCredits(true);
    try {
      const [unpaidRes, partialRes, overdueRes] = await Promise.all([
        api.get(`/businesses/${biz.id}/credits`, { params: { status: 'unpaid', limit: 50 } }),
        api.get(`/businesses/${biz.id}/credits`, { params: { status: 'partially_paid', limit: 50 } }),
        api.get(`/businesses/${biz.id}/credits`, { params: { status: 'overdue', limit: 50 } }),
      ]);
      const combined = [
        ...(unpaidRes.data?.data ?? []),
        ...(partialRes.data?.data ?? []),
        ...(overdueRes.data?.data ?? []),
      ];
      setOutstandingCredits(combined);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to load outstanding debts');
    } finally {
      setLoadingCredits(false);
    }
  }

  async function handleCreditReconcile() {
    if (blockIfNeeded()) return;
    if (!biz || !verifyModal || !selectedCreditId) {
      toast.error('Please select a debtor to match');
      return;
    }

    const targetCredit = outstandingCredits.find((c) => c.id === selectedCreditId);
    const transferAmount = Number(verifyModal.transaction.amount);
    const creditBalance = targetCredit ? Number(targetCredit.balance) : 0;

    if (Math.abs(transferAmount - creditBalance) > 0.01) {
      toast.error(
        `Transfer amount (${formatNaira(transferAmount)}) does not match debtor balance (${formatNaira(creditBalance)})`,
      );
      return;
    }

    setActioningId(verifyModal.transaction.id);
    try {
      const reconcileDva = useCreditStore.getState().reconcileDva;
      await reconcileDva(biz.id, selectedCreditId, verifyModal.transaction.id);
      toast.success(
        `Transfer matched to ${targetCredit?.customerName || 'debtor'} — debt ${creditBalance <= transferAmount ? 'settled in full' : 'partially settled'}`,
      );
      closeModal();
      invalidateDashboard('debt_reconciled');
      fetchUnverified();
    } catch (err: any) {
      toast.error(err.response?.data?.error?.message || err.response?.data?.message || 'Failed to match transfer to debtor');
    } finally {
      setActioningId(null);
    }
  }

  function openVerifyModal(transaction: SalesTransaction) {
    if (blockIfNeeded()) return;
    setVerifyModal({ transaction });
    setTargetBusinessId(biz?.id || '');
    setWizardStep('primary');
    setPrimaryChoice(null);
    setSelectedClassification('');
    setSelectedInvoiceId(null);
    setInvoiceSearch('');
    setOutstandingInvoices([]);
    setSelectedCreditId(null);
    setCreditSearch('');
    setOutstandingCredits([]);
    setCustomerName(transaction.customerName || '');
    setDescription('');
  }

  function closeModal() {
    setVerifyModal(null);
    setTargetBusinessId('');
    setWizardStep('primary');
    setPrimaryChoice(null);
    setSelectedClassification('');
    setSelectedInvoiceId(null);
    setInvoiceSearch('');
    setOutstandingInvoices([]);
    setSelectedCreditId(null);
    setCreditSearch('');
    setOutstandingCredits([]);
    setCustomerName('');
    setDescription('');
  }

  function handlePrimaryChoice(choice: PrimaryChoice) {
    setPrimaryChoice(choice);
    if (choice === 'invoice_payment') {
      setWizardStep('match_invoice');
      setSelectedInvoiceId(null);
      setInvoiceSearch('');
      fetchOutstandingInvoices();
    } else if (choice === 'credit_payment') {
      setWizardStep('match_credit');
      setSelectedCreditId(null);
      setCreditSearch('');
      fetchOutstandingCredits();
    } else if (choice === 'business_sale') {
      setWizardStep('revenue');
      // Default to the first revenue classification from the API — radio
      // values are real DB names ("Product Sale"), never hardcoded slugs.
      const firstRevenue = classifications.find((c) => c.isRevenue);
      setSelectedClassification(firstRevenue?.name ?? '');
    } else if (choice === 'not_sale') {
      setWizardStep('non_revenue');
    } else {
      setWizardStep('all');
    }
  }

  function goBackToPrimary() {
    setWizardStep('primary');
    setPrimaryChoice(null);
    setSelectedClassification('');
    setSelectedInvoiceId(null);
    setInvoiceSearch('');
    setSelectedCreditId(null);
    setCreditSearch('');
  }

  if (!biz) return <NoBusinessPrompt />;

  // Calculate stats
  const total = pagination?.total || 0;
  const oldestTx = transactions.length > 0 ? transactions[transactions.length - 1] : null;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      {!embedded && (
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <AlertCircle className="h-6 w-6 text-amber-500" />
            Unverified Transactions
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Review and classify incoming payments to ensure accurate tax reporting
          </p>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        <div className="rounded-xl border border-gray-200/80 bg-white p-4 shadow-xs hover:border-gray-300 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-500">Pending Review</span>
            <Clock className="h-4 w-4 text-amber-500" />
          </div>
          <p className="mt-2 text-2xl font-bold text-gray-900 tabular-nums">{total}</p>
          <p className="mt-1 text-[11px] text-gray-400 font-body">
            {total === 0 ? 'All caught up!' : 'Awaiting classification'}
          </p>
        </div>

        <div className="rounded-xl border border-gray-200/80 bg-white p-4 shadow-xs hover:border-gray-300 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-500">Oldest Pending</span>
            <TrendingUp className="h-4 w-4 text-blue-500" />
          </div>
          <p className="mt-2 text-base font-semibold text-gray-900">
            {oldestTx ? formatDate(oldestTx.transactionDate) : '—'}
          </p>
          <p className="mt-1 text-[11px] text-gray-400 font-body">
            {oldestTx ? 'First in queue' : 'No pending transactions'}
          </p>
        </div>

        <div className="rounded-xl border border-primary-100 bg-gradient-to-br from-primary-50 to-white p-4 shadow-xs hover:border-primary-200 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-primary-700">Action Needed</span>
            <CheckCircle2 className="h-4 w-4 text-primary-600" />
          </div>
          <p className="mt-2 text-base font-semibold text-primary-900">
            {total > 0 ? 'Review Now' : 'All Clear'}
          </p>
          <p className="mt-1 text-[11px] text-primary-600/70 font-body">
            {total > 0 ? 'Verify to update tax calculations' : 'No action required'}
          </p>
        </div>
      </div>

      {/* Info Alert */}
      {total > 0 && (
        <div className="rounded-xl border border-blue-200/50 bg-gradient-to-r from-blue-50 via-cyan-50/30 to-blue-50 px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-blue-900">
              <p className="font-medium mb-0.5">Why verify transactions?</p>
              <p className="text-blue-700 text-xs leading-relaxed">
                Not all money received is taxable income. Gifts, loans, refunds, and capital injections shouldn't count toward your tax liability. Classify each payment correctly to ensure accurate tax reporting.
              </p>
            </div>
          </div>
          <Link
            to="/debtors"
            className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-100 hover:bg-blue-200 text-blue-900 text-xs font-semibold shrink-0 transition-colors self-start sm:self-auto"
          >
            <BookOpen className="h-3.5 w-3.5" /> Reconcile Debtor
          </Link>
        </div>
      )}

      {/* Transactions List */}
      {loading && transactions.length === 0 ? (
        <div className="grid gap-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-xl border border-gray-200 bg-white p-4 animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-1/3 mb-3"></div>
              <div className="h-6 bg-gray-200 rounded w-1/2"></div>
            </div>
          ))}
        </div>
      ) : transactions.length === 0 ? (
        <div className="rounded-xl border border-gray-200/80 bg-white shadow-xs">
          <div className="flex flex-col items-center justify-center py-16 px-4">
            <div className="h-16 w-16 rounded-full bg-green-100 flex items-center justify-center mb-4">
              <CheckCircle2 className="h-8 w-8 text-green-600" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-1">All Caught Up!</h3>
            <p className="text-sm text-gray-500 text-center max-w-md">
              All transactions have been verified. New payments from your virtual account will appear here for review.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {transactions.map((tx) => (
            <div
              key={tx.id}
              id={`unverified-row-${tx.id}`}
              className={`rounded-xl border p-4 shadow-xs hover:shadow-sm transition-all group ${
                targetTxnId === tx.id
                  ? 'border-amber-400 bg-amber-50/70 ring-2 ring-amber-300 shadow-md'
                  : 'border-gray-200/80 bg-white hover:border-gray-300'
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-primary-100 to-primary-50 flex items-center justify-center flex-shrink-0">
                      <Wallet className="h-5 w-5 text-primary-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-lg font-bold text-gray-900 tabular-nums">
                        {formatNaira(Number(tx.amount))}
                      </p>
                      <div className="flex items-center gap-2">
                        <p className="text-xs text-gray-500">
                          {formatDate(tx.transactionDate)}
                        </p>
                        {targetTxnId === tx.id && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-200 text-amber-900 border border-amber-300">
                            Selected Inflow
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  <div className="space-y-1.5 ml-13">
                    {tx.customerName && (
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-gray-500 text-xs">From:</span>
                        <span className="font-medium text-gray-900">{tx.customerName}</span>
                      </div>
                    )}
                    {tx.customerHint && (
                      <div className="flex items-start gap-2 text-sm">
                        <span className="text-gray-500 text-xs flex-shrink-0">Note:</span>
                        <span className="text-gray-600 text-xs leading-relaxed">{tx.customerHint}</span>
                      </div>
                    )}
                    {!tx.customerName && !tx.customerHint && (
                      <p className="text-xs text-gray-400 italic">No additional details</p>
                    )}
                  </div>
                </div>

                <Button
                  size="sm"
                  onClick={() => openVerifyModal(tx)}
                  disabled={actioningId === tx.id}
                  className="flex items-center gap-1.5 flex-shrink-0 group-hover:scale-[1.02] transition-transform"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  Verify
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between rounded-xl border border-gray-200/80 bg-white px-4 py-3 shadow-xs">
          <div className="text-sm text-gray-600 font-body">
            Page {pagination.page} of {pagination.totalPages} ({pagination.total} total)
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="secondary"
              subscriptionExempt={true}
              onClick={() => setPage(page - 1)}
              disabled={!pagination.hasPrev || loading}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant="secondary"
              subscriptionExempt={true}
              onClick={() => setPage(page + 1)}
              disabled={!pagination.hasNext || loading}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Two-Step Wizard Modal */}
      {verifyModal && createPortal(
        <div className="fixed inset-0 z-[9999] w-screen h-screen min-h-screen flex items-center justify-center p-3 sm:p-4 bg-slate-950/60 backdrop-blur-xs overflow-hidden">
          {/* Backdrop */}
          <div className="absolute inset-0 cursor-default" onClick={closeModal} />

          {/* Dialog Container */}
          <div className="relative z-10 w-full max-w-2xl max-h-[88vh] flex flex-col rounded-none bg-white shadow-2xl border border-gray-300 animate-in fade-in zoom-in-95 duration-150">
            {/* Pinned Header */}
            <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4 shrink-0 bg-gray-50/50">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-none bg-gray-900 text-white">
                  <CircleDollarSign className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold tracking-tight text-gray-900">Verify Transaction</h3>
                  <p className="text-xs text-gray-500 font-mono">
                    {formatNaira(Number(verifyModal.transaction.amount))} • {formatDate(verifyModal.transaction.transactionDate)}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={closeModal}
                className="rounded-none border border-transparent p-1.5 text-gray-400 hover:border-gray-300 hover:bg-gray-100 hover:text-gray-700 transition-colors cursor-pointer"
                disabled={actioningId === verifyModal.transaction.id}
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Scrollable Body */}
            <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4">
              {/* Business Assignment Selector (if user has multiple businesses) */}
              {businesses.length > 1 && (
                <div className="p-3.5 bg-gray-50 border border-gray-200 rounded-none">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-900 mb-1.5 uppercase tracking-wider">
                    <Building2 className="h-3.5 w-3.5 text-gray-700" />
                    <span>Business Paid Into</span>
                  </div>
                  {verifyModal.transaction.accrualLinked ? (
                    <p className="text-[11px] text-gray-500 leading-relaxed">
                      This revenue was recognised when the invoice or credit was issued, so it stays
                      with <span className="font-semibold text-gray-700">{biz?.businessName}</span>.
                      Cancel and re-issue the invoice against the correct business instead.
                    </p>
                  ) : (
                    <>
                      <select
                        value={targetBusinessId}
                        onChange={(e) => setTargetBusinessId(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-none text-xs font-medium text-gray-900 bg-white focus:outline-none focus:border-gray-900 focus:ring-0"
                      >
                        {businesses.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.businessName} {b.id === biz.id ? '(Current Active Business)' : ''}
                          </option>
                        ))}
                      </select>
                      <p className="mt-1.5 text-[11px] text-gray-500">
                        {targetBusinessId === biz.id
                          ? 'This revenue will be credited to this business’s sales and tax reports.'
                          : `This revenue will be moved and credited to ${businesses.find((b) => b.id === targetBusinessId)?.businessName || 'the selected business'}.`}
                      </p>
                    </>
                  )}
                </div>
              )}

              {/* Step 1: Primary Choice */}
              {wizardStep === 'primary' && (
                <div className="space-y-3">
                  <div className="text-center mb-4">
                    <h4 className="text-sm font-semibold text-gray-900 mb-1">
                      What is this payment for?
                    </h4>
                    <p className="text-xs text-gray-500">
                      Choose the option that best describes this transaction
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => handlePrimaryChoice('business_sale')}
                    className="w-full text-left p-4 rounded-none border border-gray-300 hover:border-gray-900 bg-white hover:bg-gray-50/80 transition-all cursor-pointer group"
                  >
                    <div className="flex items-start gap-3">
                      <div className="h-10 w-10 rounded-none bg-emerald-50 border border-emerald-200 flex items-center justify-center shrink-0">
                        <ShoppingBag className="h-5 w-5 text-emerald-700" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h5 className="font-semibold text-gray-900 text-sm mb-0.5 flex items-center gap-1.5">
                          Business Sale or Service
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                        </h5>
                        <p className="text-xs text-gray-600 mb-1.5">
                          Customer paid for goods or services you provided
                        </p>
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded-none text-[10px] bg-emerald-100 text-emerald-800 border border-emerald-300 font-medium">
                          ✓ Taxable Income
                        </span>
                      </div>
                      <ArrowRight className="h-4 w-4 text-gray-400 group-hover:text-gray-900 transition-colors shrink-0 mt-1" />
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handlePrimaryChoice('invoice_payment')}
                    className="w-full text-left p-4 rounded-none border border-gray-300 hover:border-blue-600 bg-white hover:bg-blue-50/40 transition-all cursor-pointer group"
                  >
                    <div className="flex items-start gap-3">
                      <div className="h-10 w-10 rounded-none bg-blue-50 border border-blue-200 flex items-center justify-center shrink-0">
                        <FileText className="h-5 w-5 text-blue-700" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h5 className="font-semibold text-gray-900 text-sm mb-0.5 flex items-center gap-1.5">
                          Invoice Payment
                          <CheckCircle2 className="h-3.5 w-3.5 text-blue-600" />
                        </h5>
                        <p className="text-xs text-gray-600 mb-1.5">
                          Customer transferred money to settle an outstanding invoice
                        </p>
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded-none text-[10px] bg-blue-100 text-blue-800 border border-blue-300 font-medium">
                          ✓ Matches Invoice + Taxable
                        </span>
                      </div>
                      <ArrowRight className="h-4 w-4 text-gray-400 group-hover:text-blue-900 transition-colors shrink-0 mt-1" />
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handlePrimaryChoice('credit_payment')}
                    className="w-full text-left p-4 rounded-none border border-gray-300 hover:border-violet-600 bg-white hover:bg-violet-50/40 transition-all cursor-pointer group"
                  >
                    <div className="flex items-start gap-3">
                      <div className="h-10 w-10 rounded-none bg-violet-50 border border-violet-200 flex items-center justify-center shrink-0">
                        <BookOpen className="h-5 w-5 text-violet-700" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h5 className="font-semibold text-gray-900 text-sm mb-0.5 flex items-center gap-1.5">
                          Customer Debt Payment
                          <CheckCircle2 className="h-3.5 w-3.5 text-violet-600" />
                        </h5>
                        <p className="text-xs text-gray-600 mb-1.5">
                          Customer transferred money to settle an outstanding credit/debt
                        </p>
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded-none text-[10px] bg-violet-100 text-violet-800 border border-violet-300 font-medium">
                          ✓ Matches Debtor + Taxable
                        </span>
                      </div>
                      <ArrowRight className="h-4 w-4 text-gray-400 group-hover:text-violet-900 transition-colors shrink-0 mt-1" />
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handlePrimaryChoice('not_sale')}
                    className="w-full text-left p-4 rounded-none border border-gray-300 hover:border-gray-900 bg-white hover:bg-gray-50/80 transition-all cursor-pointer group"
                  >
                    <div className="flex items-start gap-3">
                      <div className="h-10 w-10 rounded-none bg-amber-50 border border-amber-200 flex items-center justify-center shrink-0">
                        <Gift className="h-5 w-5 text-amber-700" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h5 className="font-semibold text-gray-900 text-sm mb-0.5 flex items-center gap-1.5">
                          Gift, Loan, or Refund
                          <X className="h-3.5 w-3.5 text-amber-700" />
                        </h5>
                        <p className="text-xs text-gray-600 mb-1.5">
                          Money received but not earned through business operations
                        </p>
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded-none text-[10px] bg-amber-100 text-amber-800 border border-amber-300 font-medium">
                          ✗ NOT Taxable
                        </span>
                      </div>
                      <ArrowRight className="h-4 w-4 text-gray-400 group-hover:text-gray-900 transition-colors shrink-0 mt-1" />
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handlePrimaryChoice('not_sure')}
                    className="w-full text-left p-4 rounded-none border border-gray-300 hover:border-gray-900 bg-white hover:bg-gray-50/80 transition-all cursor-pointer group"
                  >
                    <div className="flex items-start gap-3">
                      <div className="h-10 w-10 rounded-none bg-gray-100 border border-gray-200 flex items-center justify-center shrink-0">
                        <HelpCircle className="h-5 w-5 text-gray-700" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h5 className="font-semibold text-gray-900 text-sm mb-0.5">
                          Not Sure / Other
                        </h5>
                        <p className="text-xs text-gray-600">
                          Show me all classification options with examples
                        </p>
                      </div>
                      <ArrowRight className="h-4 w-4 text-gray-400 group-hover:text-gray-900 transition-colors shrink-0 mt-1" />
                    </div>
                  </button>
                </div>
              )}

              {/* Step 2: Business Sale Sub-categories */}
              {wizardStep === 'revenue' && (
                <div className="space-y-4">
                  <button
                    type="button"
                    onClick={goBackToPrimary}
                    className="flex items-center gap-1.5 text-xs text-gray-600 hover:text-gray-900 font-medium transition-colors cursor-pointer"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Back
                  </button>

                  <div className="bg-emerald-50 border border-emerald-200 rounded-none p-3">
                    <div className="flex items-start gap-2.5">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                      <div className="text-xs">
                        <p className="font-semibold text-emerald-950 mb-0.5">Business Income (Taxable)</p>
                        <p className="text-emerald-800 text-[11px]">This transaction will count toward your tax calculation</p>
                      </div>
                    </div>
                  </div>

                  <h4 className="text-xs font-semibold text-gray-900 uppercase tracking-wider">What type of business income?</h4>
                  
                  <div className="space-y-2">
                    {loadingClassifications ? (
                      <div className="text-center py-6 text-gray-500 text-xs">Loading transaction types...</div>
                    ) : (
                      classifications
                        .filter((c) => c.isRevenue)
                        .map((classification) => (
                          <label
                            key={classification.id}
                            className={`flex items-start gap-3 p-3.5 rounded-none border cursor-pointer transition-all ${
                              selectedClassification === classification.name
                                ? 'border-gray-950 bg-gray-50 ring-1 ring-gray-950'
                                : 'border-gray-200 hover:border-gray-400 bg-white'
                            }`}
                          >
                            <input
                              type="radio"
                              name="revenue-type"
                              value={classification.name}
                              checked={selectedClassification === classification.name}
                              onChange={(e) => setSelectedClassification(e.target.value)}
                              className="mt-0.5 h-4 w-4 text-gray-900 focus:ring-0"
                            />
                            <div className="flex-1">
                              <div className="font-medium text-gray-900 text-xs">{classification.name}</div>
                              {classification.description && (
                                <div className="text-[11px] text-gray-500 mt-0.5">{classification.description}</div>
                              )}
                            </div>
                          </label>
                        ))
                    )}
                  </div>

                  <div className="mt-4 space-y-3 pt-3 border-t border-gray-200">
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                        Customer Name <span className="text-gray-400 lowercase font-normal">(Optional)</span>
                      </label>
                      <input
                        type="text"
                        value={customerName}
                        onChange={(e) => setCustomerName(e.target.value)}
                        placeholder="e.g., Chukwuma Okafor"
                        className="w-full px-3 py-2 border border-gray-300 rounded-none focus:outline-none focus:border-gray-900 focus:ring-0 text-xs"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                        Description <span className="text-gray-400 lowercase font-normal">(Optional)</span>
                      </label>
                      <input
                        type="text"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="e.g., Payment for goods supplied"
                        className="w-full px-3 py-2 border border-gray-300 rounded-none focus:outline-none focus:border-gray-900 focus:ring-0 text-xs"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Step 2: Non-Sale Sub-categories */}
              {wizardStep === 'non_revenue' && (
                <div className="space-y-4">
                  <button
                    type="button"
                    onClick={goBackToPrimary}
                    className="flex items-center gap-1.5 text-xs text-gray-600 hover:text-gray-900 font-medium transition-colors cursor-pointer"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Back
                  </button>

                  <div className="bg-amber-50 border border-amber-200 rounded-none p-3">
                    <div className="flex items-start gap-2.5">
                      <X className="h-4 w-4 text-amber-700 shrink-0 mt-0.5" />
                      <div className="text-xs">
                        <p className="font-semibold text-amber-950 mb-0.5">Non-Taxable Receipt</p>
                        <p className="text-amber-800 text-[11px]">This won't count toward your tax calculation</p>
                      </div>
                    </div>
                  </div>

                  <h4 className="text-xs font-semibold text-gray-900 uppercase tracking-wider">What type of receipt?</h4>

                  <div className="space-y-2">
                    {classifications
                      .filter((c) => c.taxTreatment === 'non_taxable')
                      .map((classification) => (
                        <label
                          key={classification.id}
                          className={`flex items-start gap-3 p-3.5 rounded-none border cursor-pointer transition-all ${
                            selectedClassification === classification.name
                              ? 'border-gray-950 bg-gray-50 ring-1 ring-gray-950'
                              : 'border-gray-200 hover:border-gray-400 bg-white'
                          }`}
                        >
                          <input
                            type="radio"
                            name="non-revenue-type"
                            value={classification.name}
                            checked={selectedClassification === classification.name}
                            onChange={(e) => setSelectedClassification(e.target.value)}
                            className="mt-0.5 h-4 w-4 text-gray-900 focus:ring-0"
                          />
                          <div className="flex-1">
                            <div className="font-medium text-gray-900 text-xs">{classification.name}</div>
                            {classification.description && (
                              <div className="text-[11px] text-gray-500 mt-0.5">{classification.description}</div>
                            )}
                          </div>
                        </label>
                      ))}
                  </div>
                </div>
              )}

              {/* Step 2: All Classifications */}
              {wizardStep === 'all' && (
                <div className="space-y-4">
                  <button
                    type="button"
                    onClick={goBackToPrimary}
                    className="flex items-center gap-1.5 text-xs text-gray-600 hover:text-gray-900 font-medium transition-colors cursor-pointer"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Back
                  </button>

                  <h4 className="text-xs font-semibold text-gray-900 uppercase tracking-wider">Select classification</h4>

                  {loadingClassifications ? (
                    <div className="text-center py-8 text-gray-500 text-xs">Loading classifications...</div>
                  ) : (
                    <div className="space-y-3">
                      {/* Group Taxable */}
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                          <h5 className="text-[11px] font-semibold text-emerald-800 uppercase tracking-wider">Taxable Income</h5>
                        </div>
                        <div className="space-y-1.5">
                          {classifications
                            .filter((c) => c.taxTreatment === 'taxable')
                            .map((c) => (
                              <label
                                key={c.id}
                                className={`flex items-start gap-3 p-3 rounded-none border cursor-pointer transition-all ${
                                  selectedClassification === c.name
                                    ? 'border-gray-950 bg-gray-50 ring-1 ring-gray-950'
                                    : 'border-gray-200 hover:border-gray-400 bg-white text-xs'
                                }`}
                              >
                                <input
                                  type="radio"
                                  name="classification"
                                  value={c.name}
                                  checked={selectedClassification === c.name}
                                  onChange={(e) => setSelectedClassification(e.target.value)}
                                  className="mt-0.5 h-4 w-4 text-gray-900 focus:ring-0"
                                />
                                <div className="flex-1">
                                  <div className="font-medium text-gray-900 text-xs">{c.name}</div>
                                  {c.description && (
                                    <div className="text-[11px] text-gray-500 mt-0.5">{c.description}</div>
                                  )}
                                </div>
                              </label>
                            ))}
                        </div>
                      </div>

                      {/* Group Non-Taxable */}
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <X className="h-3.5 w-3.5 text-amber-700" />
                          <h5 className="text-[11px] font-semibold text-amber-800 uppercase tracking-wider">Non-Taxable</h5>
                        </div>
                        <div className="space-y-1.5">
                          {classifications
                            .filter((c) => c.taxTreatment === 'non_taxable')
                            .map((c) => (
                              <label
                                key={c.id}
                                className={`flex items-start gap-3 p-3 rounded-none border cursor-pointer transition-all ${
                                  selectedClassification === c.name
                                    ? 'border-gray-950 bg-gray-50 ring-1 ring-gray-950'
                                    : 'border-gray-200 hover:border-gray-400 bg-white text-xs'
                                }`}
                              >
                                <input
                                  type="radio"
                                  name="classification"
                                  value={c.name}
                                  checked={selectedClassification === c.name}
                                  onChange={(e) => setSelectedClassification(e.target.value)}
                                  className="mt-0.5 h-4 w-4 text-gray-900 focus:ring-0"
                                />
                                <div className="flex-1">
                                  <div className="font-medium text-gray-900 text-xs">{c.name}</div>
                                  {c.description && (
                                    <div className="text-[11px] text-gray-500 mt-0.5">{c.description}</div>
                                  )}
                                </div>
                              </label>
                            ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Step: Match Invoice */}
              {wizardStep === 'match_invoice' && (
                <div className="space-y-4">
                  <button
                    type="button"
                    onClick={goBackToPrimary}
                    className="flex items-center gap-1.5 text-xs text-gray-600 hover:text-gray-900 font-medium transition-colors cursor-pointer"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Back
                  </button>

                  {/* Transfer Summary Card */}
                  <div className="bg-blue-50 border border-blue-200 rounded-none p-3.5 flex items-center justify-between text-xs">
                    <div>
                      <span className="font-semibold text-blue-950 block">Incoming Transfer Amount</span>
                      <p className="text-[11px] text-blue-700 mt-0.5">
                        {formatDate(verifyModal.transaction.transactionDate)} • {verifyModal.transaction.customerName || 'Direct bank deposit'}
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="font-bold text-base text-blue-900 tabular-nums">
                        {formatNaira(Number(verifyModal.transaction.amount))}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-semibold text-gray-900 uppercase tracking-wider">
                      Select open invoice to match
                    </h4>
                    <span className="text-[11px] text-gray-500">
                      Must match exact amount
                    </span>
                  </div>

                  {/* Search and Refresh */}
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <input
                        type="text"
                        placeholder="Search invoices by number or customer..."
                        value={invoiceSearch}
                        onChange={(e) => setInvoiceSearch(e.target.value)}
                        className="w-full rounded-none border border-gray-300 pl-9 pr-3 py-2 text-xs outline-none focus:border-gray-900 transition-all"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={fetchOutstandingInvoices}
                      disabled={loadingInvoices}
                      className="p-2 rounded-none border border-gray-300 hover:bg-gray-50 text-gray-600 transition-colors disabled:opacity-50 cursor-pointer"
                      title="Refresh invoices"
                    >
                      <RefreshCw className={`h-4 w-4 ${loadingInvoices ? 'animate-spin text-blue-600' : ''}`} />
                    </button>
                  </div>

                  {/* Invoice List */}
                  <div className="max-h-64 overflow-y-auto space-y-2 pr-1">
                    {loadingInvoices ? (
                      <div className="py-10 text-center space-y-2">
                        <RefreshCw className="h-5 w-5 animate-spin text-blue-600 mx-auto" />
                        <p className="text-xs text-gray-400">Loading open invoices...</p>
                      </div>
                    ) : outstandingInvoices.length === 0 ? (
                      <div className="py-8 text-center rounded-none border border-dashed border-gray-300 bg-gray-50 p-4">
                        <FileText className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                        <p className="text-xs font-bold text-gray-700">No sent or overdue invoices found</p>
                        <p className="text-[11px] text-gray-500 max-w-xs mx-auto mt-1">
                          Create and send an invoice first, or verify this transaction as a regular business sale.
                        </p>
                      </div>
                    ) : (
                      outstandingInvoices
                        .filter((inv) => {
                          if (!invoiceSearch.trim()) return true;
                          const term = invoiceSearch.toLowerCase();
                          return (
                            inv.invoiceNumber.toLowerCase().includes(term) ||
                            inv.customerName.toLowerCase().includes(term) ||
                            String(inv.total).includes(term)
                          );
                        })
                        .sort((a, b) => {
                          const transferAmt = Number(verifyModal.transaction.amount);
                          const aExact = Math.abs(Number(a.total) - transferAmt) < 0.01 ? 1 : 0;
                          const bExact = Math.abs(Number(b.total) - transferAmt) < 0.01 ? 1 : 0;
                          return bExact - aExact;
                        })
                        .map((inv) => {
                          const isSelected = selectedInvoiceId === inv.id;
                          const invTotal = Number(inv.total);
                          const transferAmt = Number(verifyModal.transaction.amount);
                          const isExact = Math.abs(invTotal - transferAmt) < 0.01;

                          return (
                            <div
                              key={inv.id}
                              onClick={() => setSelectedInvoiceId(inv.id)}
                              className={`cursor-pointer rounded-none p-3 border transition-all flex items-center justify-between ${
                                isSelected
                                  ? isExact
                                    ? 'border-blue-600 bg-blue-50/60 ring-1 ring-blue-600'
                                    : 'border-amber-500 bg-amber-50/60 ring-1 ring-amber-500'
                                  : isExact
                                    ? 'border-emerald-300 bg-emerald-50/30 hover:border-emerald-400'
                                    : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                              }`}
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                <div
                                  className={`h-4 w-4 rounded-none border flex items-center justify-center shrink-0 ${
                                    isSelected
                                      ? isExact
                                        ? 'border-blue-600 bg-blue-600 text-white'
                                        : 'border-amber-500 bg-amber-500 text-white'
                                      : 'border-gray-300'
                                  }`}
                                >
                                  {isSelected && <div className="h-1.5 w-1.5 rounded-none bg-white" />}
                                </div>
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs font-bold text-gray-900">
                                      {inv.invoiceNumber}
                                    </span>
                                    <span className="text-xs font-semibold text-gray-700 tabular-nums">
                                      {formatNaira(invTotal)}
                                    </span>
                                    {isExact && (
                                      <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 bg-emerald-100 text-emerald-800 font-semibold rounded-none border border-emerald-300">
                                        <ShieldCheck className="h-3 w-3" /> Exact match
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-[11px] text-gray-500 truncate mt-0.5">
                                    {inv.customerName} • Due {formatDate(inv.dueDate)}
                                  </p>
                                </div>
                              </div>

                              {isSelected && (
                                <span className={`text-xs font-bold flex items-center gap-1 shrink-0 ml-2 ${
                                  isExact ? 'text-blue-700' : 'text-amber-700'
                                }`}>
                                  Selected <CheckCircle2 className="h-4 w-4" />
                                </span>
                              )}
                            </div>
                          );
                        })
                    )}
                  </div>

                  {/* Warning on amount mismatch if an invoice is selected */}
                  {selectedInvoiceId &&
                    outstandingInvoices.find((i) => i.id === selectedInvoiceId) &&
                    Math.abs(
                      Number(outstandingInvoices.find((i) => i.id === selectedInvoiceId)!.total) -
                        Number(verifyModal.transaction.amount),
                    ) > 0.01 && (
                      <div className="rounded-none bg-amber-50 p-3 border border-amber-300 flex items-start gap-2.5">
                        <AlertCircle className="h-4 w-4 text-amber-700 shrink-0 mt-0.5" />
                        <div className="text-[11px] text-amber-900 leading-relaxed">
                          <span className="font-bold">Amount Mismatch:</span> Selected invoice total is{' '}
                          <span className="font-semibold">
                            {formatNaira(Number(outstandingInvoices.find((i) => i.id === selectedInvoiceId)!.total))}
                          </span>
                          , but transfer is{' '}
                          <span className="font-semibold">
                            {formatNaira(Number(verifyModal.transaction.amount))}
                          </span>
                          . Matching requires an exact amount.
                        </div>
                      </div>
                    )}

                  <div className="rounded-none bg-blue-50/60 p-3 border border-blue-200 flex items-start gap-2.5">
                    <AlertCircle className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
                    <div className="text-[11px] text-blue-900 leading-relaxed">
                      Matching this transfer will mark the invoice as paid, verify the incoming deposit, and reuse the existing sale transaction to prevent double-counting.
                    </div>
                  </div>
                </div>
              )}

              {/* Step: Match Debtor Credit */}
              {wizardStep === 'match_credit' && (
                <div className="space-y-4">
                  <button
                    type="button"
                    onClick={goBackToPrimary}
                    className="flex items-center gap-1.5 text-xs text-gray-600 hover:text-gray-900 font-medium transition-colors cursor-pointer"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Back
                  </button>

                  {/* Transfer Summary Card */}
                  <div className="bg-violet-50 border border-violet-200 rounded-none p-3.5 flex items-center justify-between text-xs">
                    <div>
                      <span className="font-semibold text-violet-950 block">Incoming Transfer Amount</span>
                      <p className="text-[11px] text-violet-700 mt-0.5">
                        {formatDate(verifyModal.transaction.transactionDate)} • {verifyModal.transaction.customerName || 'Direct bank deposit'}
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="font-bold text-base text-violet-900 tabular-nums">
                        {formatNaira(Number(verifyModal.transaction.amount))}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-semibold text-gray-900 uppercase tracking-wider">
                      Select debtor to match
                    </h4>
                    <span className="text-[11px] text-gray-500">
                      Must match exact balance
                    </span>
                  </div>

                  {/* Search and Refresh */}
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <input
                        type="text"
                        placeholder="Search debtors by name, phone, or description..."
                        value={creditSearch}
                        onChange={(e) => setCreditSearch(e.target.value)}
                        className="w-full rounded-none border border-gray-300 pl-9 pr-3 py-2 text-xs outline-none focus:border-gray-900 transition-all"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={fetchOutstandingCredits}
                      disabled={loadingCredits}
                      className="p-2 rounded-none border border-gray-300 hover:bg-gray-50 text-gray-600 transition-colors disabled:opacity-50 cursor-pointer"
                      title="Refresh debts"
                    >
                      <RefreshCw className={`h-4 w-4 ${loadingCredits ? 'animate-spin text-violet-600' : ''}`} />
                    </button>
                  </div>

                  {/* Debtor List */}
                  <div className="max-h-64 overflow-y-auto space-y-2 pr-1">
                    {loadingCredits ? (
                      <div className="py-10 text-center space-y-2">
                        <RefreshCw className="h-5 w-5 animate-spin text-violet-600 mx-auto" />
                        <p className="text-xs text-gray-400">Loading open debtor records...</p>
                      </div>
                    ) : outstandingCredits.length === 0 ? (
                      <div className="py-8 text-center rounded-none border border-dashed border-gray-300 bg-gray-50 p-4">
                        <BookOpen className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                        <p className="text-xs font-bold text-gray-700">No open debtor records found</p>
                        <p className="text-[11px] text-gray-500 max-w-xs mx-auto mt-1">
                          No unpaid or partially paid debts found for this business.
                        </p>
                      </div>
                    ) : (
                      outstandingCredits
                        .filter((credit) => {
                          if (!creditSearch.trim()) return true;
                          const term = creditSearch.toLowerCase();
                          return (
                            credit.customerName.toLowerCase().includes(term) ||
                            (credit.customerPhone && credit.customerPhone.toLowerCase().includes(term)) ||
                            (credit.description && credit.description.toLowerCase().includes(term)) ||
                            String(credit.balance).includes(term)
                          );
                        })
                        .sort((a, b) => {
                          const transferAmt = Number(verifyModal.transaction.amount);
                          const aExact = Math.abs(Number(a.balance) - transferAmt) < 0.01 ? 1 : 0;
                          const bExact = Math.abs(Number(b.balance) - transferAmt) < 0.01 ? 1 : 0;
                          return bExact - aExact;
                        })
                        .map((credit) => {
                          const isSelected = selectedCreditId === credit.id;
                          const creditBal = Number(credit.balance);
                          const transferAmt = Number(verifyModal.transaction.amount);
                          const isExact = Math.abs(creditBal - transferAmt) < 0.01;

                          return (
                            <div
                              key={credit.id}
                              onClick={() => setSelectedCreditId(credit.id)}
                              className={`cursor-pointer rounded-none p-3 border transition-all flex items-center justify-between ${
                                isSelected
                                  ? isExact
                                    ? 'border-violet-600 bg-violet-50/60 ring-1 ring-violet-600'
                                    : 'border-amber-500 bg-amber-50/60 ring-1 ring-amber-500'
                                  : isExact
                                    ? 'border-emerald-300 bg-emerald-50/30 hover:border-emerald-400'
                                    : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                              }`}
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                <div
                                  className={`h-4 w-4 rounded-none border flex items-center justify-center shrink-0 ${
                                    isSelected
                                      ? isExact
                                        ? 'border-violet-600 bg-violet-600 text-white'
                                        : 'border-amber-500 bg-amber-500 text-white'
                                      : 'border-gray-300'
                                  }`}
                                >
                                  {isSelected && <div className="h-1.5 w-1.5 rounded-none bg-white" />}
                                </div>
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs font-bold text-gray-900">
                                      {credit.customerName}
                                    </span>
                                    <span className="text-xs font-semibold text-gray-700 tabular-nums">
                                      {formatNaira(creditBal)}
                                    </span>
                                    {isExact && (
                                      <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 bg-emerald-100 text-emerald-800 font-semibold rounded-none border border-emerald-300">
                                        <ShieldCheck className="h-3 w-3" /> Exact match
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-[11px] text-gray-500 truncate mt-0.5">
                                    {credit.description || 'Credit debt'} • Due {formatDate(credit.dueDate)}
                                  </p>
                                </div>
                              </div>

                              {isSelected && (
                                <span className={`text-xs font-bold flex items-center gap-1 shrink-0 ml-2 ${
                                  isExact ? 'text-violet-700' : 'text-amber-700'
                                }`}>
                                  Selected <CheckCircle2 className="h-4 w-4" />
                                </span>
                              )}
                            </div>
                          );
                        })
                    )}
                  </div>

                  {/* Warning on amount mismatch if a debtor is selected */}
                  {selectedCreditId &&
                    outstandingCredits.find((c) => c.id === selectedCreditId) &&
                    Math.abs(
                      Number(outstandingCredits.find((c) => c.id === selectedCreditId)!.balance) -
                        Number(verifyModal.transaction.amount),
                    ) > 0.01 && (
                      <div className="rounded-none bg-amber-50 p-3 border border-amber-300 flex items-start gap-2.5">
                        <AlertCircle className="h-4 w-4 text-amber-700 shrink-0 mt-0.5" />
                        <div className="text-[11px] text-amber-900 leading-relaxed">
                          <span className="font-bold">Amount Mismatch:</span> Selected debt balance is{' '}
                          <span className="font-semibold">
                            {formatNaira(Number(outstandingCredits.find((c) => c.id === selectedCreditId)!.balance))}
                          </span>
                          , but transfer is{' '}
                          <span className="font-semibold">
                            {formatNaira(Number(verifyModal.transaction.amount))}
                          </span>
                          . Matching requires an exact amount.
                        </div>
                      </div>
                    )}

                  <div className="rounded-none bg-violet-50/60 p-3 border border-violet-200 flex items-start gap-2.5">
                    <AlertCircle className="h-4 w-4 text-violet-600 shrink-0 mt-0.5" />
                    <div className="text-[11px] text-violet-900 leading-relaxed">
                      Matching this transfer will record a credit settlement payment, update the debtor's balance, verify the incoming deposit, and mark it as confirmed taxable revenue.
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Pinned Footer */}
            <div className="flex items-center justify-end gap-2.5 border-t border-gray-200 bg-gray-50/80 px-5 py-3 shrink-0">
              <Button
                variant="outline"
                onClick={closeModal}
                disabled={actioningId === verifyModal.transaction.id}
                className="rounded-none text-xs"
              >
                Cancel
              </Button>
              {wizardStep !== 'primary' && (
                <Button
                  onClick={
                    wizardStep === 'match_invoice'
                      ? handleInvoiceReconcile
                      : wizardStep === 'match_credit'
                      ? handleCreditReconcile
                      : handleVerify
                  }
                  disabled={
                    wizardStep === 'match_invoice'
                      ? !selectedInvoiceId ||
                        actioningId === verifyModal.transaction.id ||
                        Math.abs(
                          Number(outstandingInvoices.find((i) => i.id === selectedInvoiceId)?.total || 0) -
                            Number(verifyModal.transaction.amount),
                        ) > 0.01
                      : wizardStep === 'match_credit'
                      ? !selectedCreditId ||
                        actioningId === verifyModal.transaction.id ||
                        Math.abs(
                          Number(outstandingCredits.find((c) => c.id === selectedCreditId)?.balance || 0) -
                            Number(verifyModal.transaction.amount),
                        ) > 0.01
                      : !selectedClassification || actioningId === verifyModal.transaction.id
                  }
                  isLoading={actioningId === verifyModal.transaction.id}
                  className="rounded-none text-xs min-w-[120px]"
                >
                  {wizardStep === 'match_invoice'
                    ? 'Match to Invoice'
                    : wizardStep === 'match_credit'
                    ? 'Match to Debtor'
                    : 'Confirm'}
                </Button>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
