import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Landmark, CheckCircle2, AlertCircle, RefreshCw, Search, ShieldCheck } from 'lucide-react';
import Button from '@/components/ui/Button.tsx';
import { useInvoiceStore } from '@/stores/invoice.store.ts';
import api, { getErrorMessage } from '@/lib/axios.ts';
import type { Invoice, SalesTransaction } from '@/types/index.ts';
import toast from 'react-hot-toast';
import { formatNaira } from '@/lib/format';
import { useDisplayCurrency } from '@/hooks/useDisplayCurrency';
import { formatInvoiceMoney } from '@/lib/currency';

interface LinkDvaInvoiceModalProps {
  businessId: string;
  invoice: Invoice | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function LinkDvaInvoiceModal({
  businessId,
  invoice,
  isOpen,
  onClose,
  onSuccess,
}: LinkDvaInvoiceModalProps) {
  useDisplayCurrency();
  const reconcileDva = useInvoiceStore((s) => s.reconcileDva);

  const [unverifiedSales, setUnverifiedSales] = useState<SalesTransaction[]>([]);
  const [selectedSaleId, setSelectedSaleId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch] = useState('');

  // Lock background scroll & handle ESC
  useEffect(() => {
    if (!isOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) onClose();
    };
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, submitting, onClose]);

  useEffect(() => {
    if (isOpen && invoice) {
      fetchUnverified();
      setSelectedSaleId(null);
      setSearch('');
    }
  }, [isOpen, invoice]);

  const fetchUnverified = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/businesses/${businessId}/sales/unverified`, {
        params: { limit: 50 },
      });
      setUnverifiedSales(res.data?.data ?? []);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to fetch unverified transfers'));
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen || !invoice) return null;

  const invoiceTotal = Number(invoice.total);

  // Filter and sort: Exact matches first
  const filteredSales = unverifiedSales
    .filter((s) => {
      if (!search.trim()) return true;
      const term = search.toLowerCase();
      return (
        (s.customerName && s.customerName.toLowerCase().includes(term)) ||
        (s.description && s.description.toLowerCase().includes(term)) ||
        (s.referenceId && s.referenceId.toLowerCase().includes(term)) ||
        String(s.amount).includes(term)
      );
    })
    .sort((a, b) => {
      const aExact = Math.abs(Number(a.amount) - invoiceTotal) < 0.01 ? 1 : 0;
      const bExact = Math.abs(Number(b.amount) - invoiceTotal) < 0.01 ? 1 : 0;
      return bExact - aExact;
    });

  const selectedSale = unverifiedSales.find((s) => s.id === selectedSaleId);
  const isExactMatch =
    selectedSale !== undefined &&
    Math.abs(Number(selectedSale.amount) - invoiceTotal) < 0.01;

  const handleReconcile = async () => {
    if (!selectedSaleId || !selectedSale) {
      toast.error('Please select an incoming bank transfer to match');
      return;
    }

    if (!isExactMatch) {
      toast.error(
        `Transfer amount (${formatNaira(Number(selectedSale.amount))}) does not match invoice total (${formatInvoiceMoney(invoice, invoiceTotal)})`,
      );
      return;
    }

    setSubmitting(true);
    try {
      await reconcileDva(businessId, invoice.id, selectedSaleId);
      toast.success(
        `Invoice ${invoice.invoiceNumber} successfully matched with ${formatNaira(Number(selectedSale.amount))} DVA transfer`,
      );
      onSuccess?.();
      onClose();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to match transfer to invoice'));
    } finally {
      setSubmitting(false);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] w-screen h-screen flex items-center justify-center p-3 sm:p-4 bg-slate-950/60 backdrop-blur-xs overflow-hidden animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose();
      }}
    >
      <div className="relative z-10 w-full max-w-xl max-h-[88vh] flex flex-col rounded-none bg-white shadow-2xl border border-gray-300 my-auto pointer-events-auto animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="shrink-0 flex items-center justify-between border-b border-gray-200 px-5 py-3.5 bg-gray-50">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-none bg-blue-50 text-blue-700 border border-blue-200 shrink-0">
              <Landmark className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-gray-900">Match Bank Transfer (DVA)</h2>
              <p className="text-[11px] text-blue-800">
                Reconcile incoming direct bank deposit to invoice <span className="font-semibold text-gray-900">{invoice.invoiceNumber}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={submitting}
            className="rounded-none p-1.5 text-gray-400 hover:bg-gray-200 hover:text-gray-700 transition-colors disabled:opacity-40"
            title="Close modal"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Target Invoice Card */}
          <div className="rounded-none bg-gray-50 p-4 border border-gray-200 flex items-center justify-between text-xs">
            <div>
              <span className="font-bold text-gray-900 text-sm">{invoice.invoiceNumber}</span>
              <p className="text-gray-600 text-xs mt-0.5">{invoice.customerName}</p>
            </div>
            <div className="text-right">
              <span className="text-gray-500 text-[11px] block">Invoice Total (Amount Due)</span>
              <span className="font-bold text-gray-900 text-base tabular-nums text-blue-900">
                {formatInvoiceMoney(invoice, invoiceTotal)}
              </span>
            </div>
          </div>

          {/* Search bar & Refresh */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search by amount, narration or reference..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-none border border-gray-300 pl-9 pr-3 py-2 text-xs outline-none focus:border-gray-900 transition-all"
              />
            </div>
            <button
              type="button"
              onClick={fetchUnverified}
              disabled={loading}
              className="p-2 rounded-none border border-gray-300 hover:bg-gray-50 text-gray-600 transition-colors disabled:opacity-50 cursor-pointer"
              title="Refresh transfers"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin text-blue-600' : ''}`} />
            </button>
          </div>

          {/* Transfer List */}
          <div className="max-h-64 overflow-y-auto space-y-2 pr-1">
            {loading ? (
              <div className="py-10 text-center space-y-2">
                <RefreshCw className="h-5 w-5 animate-spin text-blue-600 mx-auto" />
                <p className="text-xs text-gray-400">Loading incoming bank transfers...</p>
              </div>
            ) : filteredSales.length === 0 ? (
              <div className="py-10 text-center rounded-none border border-dashed border-gray-300 bg-gray-50 p-6">
                <Landmark className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                <p className="text-xs font-bold text-gray-700">No unverified bank transfers found</p>
                <p className="text-[11px] text-gray-500 max-w-xs mx-auto mt-1 leading-relaxed">
                  When a customer makes a direct transfer into your Dedicated Virtual Account, it will appear here for instant 1-click reconciliation.
                </p>
              </div>
            ) : (
              filteredSales.map((sale) => {
                const isSelected = selectedSaleId === sale.id;
                const saleAmount = Number(sale.amount);
                const isItemExact = Math.abs(saleAmount - invoiceTotal) < 0.01;

                return (
                  <div
                    key={sale.id}
                    onClick={() => setSelectedSaleId(sale.id)}
                    className={`cursor-pointer rounded-none p-3 border transition-all flex items-center justify-between ${
                      isSelected
                        ? isItemExact
                          ? 'border-blue-600 bg-blue-50/60 ring-1 ring-blue-600'
                          : 'border-amber-500 bg-amber-50/60 ring-1 ring-amber-500'
                        : isItemExact
                          ? 'border-emerald-300 bg-emerald-50/30 hover:border-emerald-400'
                          : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`h-4 w-4 rounded-none border flex items-center justify-center shrink-0 ${
                          isSelected
                            ? isItemExact
                              ? 'border-blue-600 bg-blue-600 text-white'
                              : 'border-amber-500 bg-amber-500 text-white'
                            : 'border-gray-300'
                        }`}
                      >
                        {isSelected && <div className="h-1.5 w-1.5 rounded-none bg-white" />}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-gray-900 tabular-nums">
                            {formatNaira(saleAmount)}
                          </span>
                          <span className="text-[10px] px-1.5 py-0.5 bg-gray-100 font-semibold text-gray-600 rounded-none border border-gray-200">
                            {formatDate(sale.transactionDate)}
                          </span>
                          {isItemExact && (
                            <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 bg-emerald-100 text-emerald-800 font-semibold rounded-none border border-emerald-300">
                              <ShieldCheck className="h-3 w-3" /> Exact match
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-gray-500 truncate mt-0.5">
                          {sale.description || sale.referenceId || 'Direct bank transfer'}
                        </p>
                      </div>
                    </div>

                    {isSelected && (
                      <span className={`text-xs font-bold flex items-center gap-1 shrink-0 ml-2 ${
                        isItemExact ? 'text-blue-700' : 'text-amber-700'
                      }`}>
                        Selected <CheckCircle2 className="h-4 w-4" />
                      </span>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Amount mismatch warning if selected is not exact */}
          {selectedSale && !isExactMatch && (
            <div className="rounded-none bg-amber-50 p-3 border border-amber-300 flex items-start gap-2.5">
              <AlertCircle className="h-4 w-4 text-amber-700 shrink-0 mt-0.5" />
              <div className="text-[11px] text-amber-900 leading-relaxed">
                <span className="font-bold">Amount Mismatch:</span> Selected transfer is{' '}
                <span className="font-semibold">{formatNaira(Number(selectedSale.amount))}</span>, but invoice requires{' '}
                <span className="font-semibold">{formatInvoiceMoney(invoice, invoiceTotal)}</span>. Reconciliation requires an exact match to prevent tax miscalculation.
              </div>
            </div>
          )}

          {/* Info note */}
          <div className="rounded-none bg-blue-50/60 p-3 border border-blue-200 flex items-start gap-2.5">
            <AlertCircle className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
            <div className="text-[11px] text-blue-900 leading-relaxed">
              Linking this transfer will mark invoice <span className="font-bold text-blue-950">{invoice.invoiceNumber}</span> as paid, verify the incoming deposit, and reuse the existing sale transaction to prevent double-counting.
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="shrink-0 flex items-center justify-end gap-2.5 border-t border-gray-200 px-5 py-3 bg-gray-50">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onClose}
            disabled={submitting}
            className="rounded-none border-gray-300 text-xs"
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={handleReconcile}
            disabled={submitting || !selectedSaleId || !isExactMatch}
            className="rounded-none bg-blue-600 hover:bg-blue-700 text-white shadow-sm text-xs"
          >
            {submitting ? 'Matching...' : 'Confirm Reconciliation'}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
