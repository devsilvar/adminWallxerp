import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Landmark, CheckCircle2, AlertCircle, RefreshCw, Search } from 'lucide-react';
import Button from '@/components/ui/Button.tsx';
import { useCreditStore } from '@/stores/credit.store.ts';
import api from '@/lib/axios.ts';
import type { CustomerCredit, SalesTransaction } from '@/types/index.ts';
import toast from 'react-hot-toast';
import { getErrorMessage } from '@/lib/axios.ts';
import { formatNaira } from '@/lib/format';
import { useDisplayCurrency } from '@/hooks/useDisplayCurrency';

interface LinkDvaCreditModalProps {
  businessId: string;
  credit: CustomerCredit | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function LinkDvaCreditModal({
  businessId,
  credit,
  isOpen,
  onClose,
  onSuccess,
}: LinkDvaCreditModalProps) {
  useDisplayCurrency();
  const reconcileDva = useCreditStore((s) => s.reconcileDva);

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
    if (isOpen && credit) {
      fetchUnverified();
      setSelectedSaleId(null);
    }
  }, [isOpen, credit]);

  const fetchUnverified = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/businesses/${businessId}/sales/unverified`, {
        params: { limit: 50 },
      });
      setUnverifiedSales(res.data?.data ?? []);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen || !credit) return null;

  const filteredSales = unverifiedSales.filter((s) => {
    if (!search.trim()) return true;
    const term = search.toLowerCase();
    return (
      (s.customerName && s.customerName.toLowerCase().includes(term)) ||
      (s.description && s.description.toLowerCase().includes(term)) ||
      (s.referenceId && s.referenceId.toLowerCase().includes(term)) ||
      String(s.amount).includes(term)
    );
  });

  const selectedSale = unverifiedSales.find((s) => s.id === selectedSaleId);

  const handleReconcile = async () => {
    if (!selectedSaleId) {
      toast.error('Please select an incoming bank transfer to reconcile');
      return;
    }

    setSubmitting(true);
    try {
      await reconcileDva(businessId, credit.id, selectedSaleId);
      toast.success(
        `Reconciled ${formatNaira(Number(selectedSale?.amount || 0))} DVA transfer to ${credit.customerName}`
      );
      onSuccess?.();
      onClose();
    } catch (err) {
      toast.error(getErrorMessage(err));
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
      {/* Straight-Edged Modal Dialog */}
      <div className="relative z-10 w-full max-w-xl max-h-[88vh] flex flex-col rounded-none bg-white shadow-2xl border border-gray-300 my-auto pointer-events-auto animate-in zoom-in-95 duration-150">
        {/* Pinned Straight Header */}
        <div className="shrink-0 flex items-center justify-between border-b border-gray-200 px-5 py-3.5 bg-gray-50">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-none bg-indigo-50 text-indigo-700 border border-indigo-200 shrink-0">
              <Landmark className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-gray-900">Match Bank Transfer (DVA)</h2>
              <p className="text-[11px] text-indigo-800">
                Reconcile direct bank deposits to debtor <span className="font-semibold text-gray-900">{credit.customerName}</span>
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

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Target Debtor Card */}
          <div className="rounded-none bg-gray-50 p-4 border border-gray-200 flex items-center justify-between text-xs">
            <div>
              <span className="font-bold text-gray-900 text-sm">{credit.customerName}</span>
              <p className="text-gray-500 text-[11px] mt-0.5">{credit.description}</p>
            </div>
            <div className="text-right">
              <span className="text-gray-400 text-[11px] block">Outstanding Balance</span>
              <span className="font-bold text-gray-900 text-sm tabular-nums">{formatNaira(credit.balance)}</span>
            </div>
          </div>

          {/* Search / Filter */}
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
              className="p-2 rounded-none border border-gray-300 hover:bg-gray-50 text-gray-600 transition-colors disabled:opacity-50"
              title="Refresh transfers"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin text-indigo-600' : ''}`} />
            </button>
          </div>

          {/* Transfer List */}
          <div className="max-h-64 overflow-y-auto space-y-2 pr-1">
            {loading ? (
              <div className="py-10 text-center space-y-2">
                <RefreshCw className="h-5 w-5 animate-spin text-indigo-600 mx-auto" />
                <p className="text-xs text-gray-400">Loading incoming bank transfers...</p>
              </div>
            ) : filteredSales.length === 0 ? (
              <div className="py-10 text-center rounded-none border border-dashed border-gray-300 bg-gray-50 p-6">
                <Landmark className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                <p className="text-xs font-bold text-gray-700">No unverified bank transfers found</p>
                <p className="text-[11px] text-gray-400 max-w-xs mx-auto mt-1 leading-relaxed">
                  When a customer makes a direct transfer into your Dedicated Virtual Account, it will appear here for instant 1-click reconciliation.
                </p>
              </div>
            ) : (
              filteredSales.map((sale) => {
                const isSelected = selectedSaleId === sale.id;
                const saleAmount = Number(sale.amount);
                return (
                  <div
                    key={sale.id}
                    onClick={() => setSelectedSaleId(sale.id)}
                    className={`cursor-pointer rounded-none p-3 border transition-all flex items-center justify-between ${
                      isSelected
                        ? 'border-indigo-600 bg-indigo-50/60 ring-1 ring-indigo-600'
                        : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`h-4 w-4 rounded-none border flex items-center justify-center shrink-0 ${
                          isSelected ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-gray-300'
                        }`}
                      >
                        {isSelected && <div className="h-1.5 w-1.5 rounded-none bg-white" />}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-gray-900 tabular-nums">
                            {formatNaira(saleAmount)}
                          </span>
                          <span className="text-[10px] px-2 py-0.5 bg-gray-100 font-semibold text-gray-600 rounded-none border border-gray-200">
                            {formatDate(sale.transactionDate)}
                          </span>
                        </div>
                        <p className="text-[11px] text-gray-500 truncate mt-0.5">
                          {sale.description || sale.referenceId || 'Direct bank transfer'}
                        </p>
                      </div>
                    </div>

                    {isSelected && (
                      <span className="text-xs font-bold text-indigo-700 flex items-center gap-1 shrink-0 ml-2">
                        Selected <CheckCircle2 className="h-4 w-4 text-indigo-600" />
                      </span>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Invariant Note */}
          <div className="rounded-none bg-indigo-50/60 p-3 border border-indigo-200 flex items-start gap-2.5">
            <AlertCircle className="h-4 w-4 text-indigo-600 shrink-0 mt-0.5" />
            <div className="text-[11px] text-indigo-900 leading-relaxed">
              Linking this transfer will match the DVA bank receipt to <span className="font-bold text-indigo-950">{credit.customerName}</span>, update their outstanding balance, and prevent double-counting.
            </div>
          </div>
        </div>

        {/* Pinned Footer */}
        <div className="shrink-0 flex items-center justify-end gap-2.5 border-t border-gray-200 px-5 py-3 bg-gray-50">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onClose}
            disabled={submitting}
            className="rounded-none border-gray-300"
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={handleReconcile}
            disabled={submitting || !selectedSaleId}
            className="rounded-none bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm"
          >
            {submitting ? 'Reconciling...' : 'Confirm Reconciliation'}
          </Button>
        </div>
      </div>
    </div>,
    document.body
  );
}
