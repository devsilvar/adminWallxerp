import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Copy,
  Check,
  Building2,
  AlertCircle,
  ArrowDownLeft,
  ArrowUpRight,
  TrendingDown,
  TrendingUp,
  Loader2,
  FolderSync,
} from 'lucide-react';
import api, { getErrorMessage } from '@/lib/axios';
import toast from 'react-hot-toast';
import type { TransferDetailBreakdown } from '@/types/index.ts';

interface AdminTransferDetailModalProps {
  transferId: string | null;
  transferType?: 'inflow' | 'outflow';
  isOpen: boolean;
  onClose: () => void;
}

function formatNaira(n: number) {
  return `₦${Number(n).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function AdminTransferDetailModal({
  transferId,
  transferType,
  isOpen,
  onClose,
}: AdminTransferDetailModalProps) {
  const [data, setData] = useState<TransferDetailBreakdown | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [selectedSiblingId, setSelectedSiblingId] = useState('');
  const [reallocating, setReallocating] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !transferId) {
      setData(null);
      setError(null);
      setSelectedSiblingId('');
      return;
    }

    setLoading(true);
    setError(null);

    const query = transferType ? `?type=${transferType}` : '';
    api.get(`/admin/treasury/transactions/${transferId}${query}`)
      .then((res) => {
        setData(res.data.data);
        if (res.data.data?.siblingBusinesses?.[0]) {
          setSelectedSiblingId(res.data.data.siblingBusinesses[0].id);
        }
      })
      .catch((err) => {
        setError(err.response?.data?.error?.message || 'Failed to load transaction details.');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [isOpen, transferId, transferType]);

  const handleReassign = async () => {
    const targetId = selectedSiblingId || data?.siblingBusinesses?.[0]?.id;
    if (!data || !targetId) return;

    try {
      setReallocating(true);
      const res = await api.patch(`/admin/sales/${data.id}/reassign`, {
        targetBusinessId: targetId,
      });

      toast.success(res.data?.message || 'Transaction successfully reallocated');

      // Refresh the modal payload to reflect new assigned business
      const query = transferType ? `?type=${transferType}` : '';
      const refreshed = await api.get(`/admin/treasury/transactions/${data.id}${query}`);
      setData(refreshed.data.data);
      if (refreshed.data.data?.siblingBusinesses?.[0]) {
        setSelectedSiblingId(refreshed.data.data.siblingBusinesses[0].id);
      }
    } catch (err: any) {
      toast.error(getErrorMessage(err, 'Failed to reallocate transaction'));
    } finally {
      setReallocating(false);
    }
  };

  if (!isOpen) return null;

  const copyReference = () => {
    if (!data?.reference) return;
    navigator.clipboard.writeText(data.reference);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isInflow = data?.type === 'inflow';
  const isLoss = (data?.financials.netMargin ?? 0) < 0;

  return createPortal(
    <div className="fixed inset-0 z-[9999] w-screen h-screen min-h-screen flex items-center justify-center p-3 sm:p-4 bg-slate-950/60 backdrop-blur-xs overflow-hidden">
      {/* Backdrop */}
      <div className="absolute inset-0 cursor-default" onClick={onClose} />

      {/* Modal Dialog */}
      <div className="relative z-10 w-full max-w-lg max-h-[88vh] flex flex-col rounded-none bg-white shadow-2xl border border-gray-300 animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4 bg-gray-50/50 shrink-0">
          <div className="flex items-center gap-2.5">
            {isInflow ? (
              <div className="flex h-8 w-8 items-center justify-center rounded-none bg-blue-100 text-blue-800">
                <ArrowDownLeft className="h-4 w-4" />
              </div>
            ) : (
              <div className="flex h-8 w-8 items-center justify-center rounded-none bg-purple-100 text-purple-800">
                <ArrowUpRight className="h-4 w-4" />
              </div>
            )}
            <div>
              <h3 className="text-sm font-bold text-gray-900 leading-tight">
                {isInflow ? 'DVA Deposit Breakdown' : 'Withdrawal Payout Breakdown'}
              </h3>
              <p className="text-xs text-gray-500 font-mono">
                {data ? data.reference : 'Loading...'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-none border border-transparent p-1.5 text-gray-400 hover:border-gray-300 hover:bg-gray-100 hover:text-gray-700 transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="max-h-[75vh] overflow-y-auto px-6 py-5 space-y-5">
          {loading && (
            <div className="flex flex-col items-center justify-center py-14 text-gray-400 space-y-3">
              <Loader2 className="h-8 w-8 animate-spin text-primary-600" />
              <p className="text-xs font-medium">Fetching transaction economics...</p>
            </div>
          )}

          {error && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-center text-sm text-rose-800 space-y-2">
              <AlertCircle className="h-5 w-5 text-rose-600 mx-auto" />
              <p>{error}</p>
            </div>
          )}

          {!loading && !error && data && (
            <>
              {/* Net Margin Callout */}
              <div
                className={`rounded-xl border p-4 transition-all ${
                  isLoss
                    ? 'border-rose-200 bg-rose-50/70 text-rose-950'
                    : 'border-emerald-200 bg-emerald-50/70 text-emerald-950'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-gray-600 flex items-center gap-1.5">
                    {isLoss ? (
                      <TrendingDown className="h-4 w-4 text-rose-600" />
                    ) : (
                      <TrendingUp className="h-4 w-4 text-emerald-600" />
                    )}
                    Platform Net Margin
                  </span>
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ${
                      isLoss
                        ? 'bg-rose-100 text-rose-800'
                        : 'bg-emerald-100 text-emerald-800'
                    }`}
                  >
                    {isLoss ? 'Operational Loss' : 'Profitable'}
                  </span>
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span
                    className={`text-2xl font-black font-mono tracking-tight ${
                      isLoss ? 'text-rose-600' : 'text-emerald-700'
                    }`}
                  >
                    {isLoss
                      ? `−${formatNaira(Math.abs(data.financials.netMargin))}`
                      : `+${formatNaira(data.financials.netMargin)}`}
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-gray-500">
                  {isInflow
                    ? 'WallX absorbed Paystack 1% DVA processing fee so customer was credited 100% in full.'
                    : isLoss
                    ? 'Disbursement transfer and stamp duty gateway costs exceeded withdrawal fee earned.'
                    : 'Withdrawal fee collected exceeded Paystack disbursement gateway costs.'}
                </p>
              </div>

              {/* Economic Breakdown Table */}
              <div className="rounded-xl border border-gray-200 overflow-hidden text-xs">
                <div className="bg-gray-50 px-4 py-2.5 font-semibold text-gray-700 border-b border-gray-200">
                  Unit Economics Breakdown
                </div>
                <div className="divide-y divide-gray-100 bg-white">
                  <div className="flex justify-between px-4 py-2.5">
                    <span className="text-gray-500">Gross Transfer Volume</span>
                    <span className="font-mono font-medium text-gray-900">
                      {formatNaira(data.financials.grossAmount)}
                    </span>
                  </div>

                  {isInflow ? (
                    <>
                      <div className="flex justify-between px-4 py-2.5 bg-emerald-50/30">
                        <span className="text-emerald-950 font-medium">Customer Wallet Credited (100%)</span>
                        <span className="font-mono font-bold text-emerald-700">
                          {formatNaira(data.financials.customerCredit ?? data.financials.grossAmount)}
                        </span>
                      </div>
                      <div className="flex justify-between px-4 py-2.5">
                        <span className="text-gray-500">Platform Fee Charged to SME</span>
                        <span className="font-mono font-medium text-gray-600">
                          ₦0.00
                        </span>
                      </div>
                      <div className="flex justify-between px-4 py-2.5 bg-rose-50/40">
                        <span className="text-rose-900">Paystack Inflow Gateway Fee (1%, max ₦300)</span>
                        <span className="font-mono font-bold text-rose-600">
                          −{formatNaira(data.financials.paystackInflowFeeAbsorbed ?? data.financials.totalGatewayCost)}
                        </span>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex justify-between px-4 py-2.5 bg-purple-50/30">
                        <span className="text-purple-950 font-medium">Customer Balance Debited</span>
                        <span className="font-mono font-bold text-purple-700">
                          {formatNaira(data.financials.customerDebit ?? data.financials.grossAmount)}
                        </span>
                      </div>
                      <div className="flex justify-between px-4 py-2.5 bg-emerald-50/30">
                        <span className="text-emerald-950 font-medium">Withdrawal Fee Collected</span>
                        <span className="font-mono font-bold text-emerald-700">
                          +{formatNaira(data.financials.platformFeeCollected)}
                        </span>
                      </div>
                      <div className="flex justify-between px-4 py-2.5">
                        <span className="text-gray-500">Amount Sent to Bank</span>
                        <span className="font-mono font-medium text-gray-900">
                          {formatNaira(data.financials.amountDisbursed ?? data.financials.grossAmount)}
                        </span>
                      </div>
                      <div className="flex justify-between px-4 py-2.5">
                        <span className="text-gray-500">Paystack Banded Transfer Fee</span>
                        <span className="font-mono font-medium text-red-600">
                          −{formatNaira(data.financials.paystackTransferFee ?? 0)}
                        </span>
                      </div>
                      {data.financials.federalStampDuty > 0 && (
                        <div className="flex justify-between px-4 py-2.5">
                          <span className="text-gray-500">Federal EMTL / Stamp Duty (≥ ₦10k)</span>
                          <span className="font-mono font-medium text-red-600">
                            −{formatNaira(data.financials.federalStampDuty)}
                          </span>
                        </div>
                      )}
                      <div className="flex justify-between px-4 py-2.5 bg-rose-50/40 font-semibold">
                        <span className="text-rose-900">Total Gateway Outflow Cost</span>
                        <span className="font-mono font-bold text-rose-600">
                          −{formatNaira(data.financials.totalGatewayCost)}
                        </span>
                      </div>
                    </>
                  )}

                  <div className="flex justify-between px-4 py-3 bg-gray-50/80 font-bold">
                    <span className="text-gray-800">Net Platform Result</span>
                    <span
                      className={`font-mono ${
                        isLoss ? 'text-rose-600' : 'text-emerald-700'
                      }`}
                    >
                      {isLoss
                        ? `−${formatNaira(Math.abs(data.financials.netMargin))}`
                        : `+${formatNaira(data.financials.netMargin)}`}
                    </span>
                  </div>
                </div>
              </div>

              {/* Visually Distinct "Assigned to" Card for Inflows */}
              {data.type === 'inflow' && (
                <div className="rounded-xl border border-primary-200 bg-primary-50/50 p-4 space-y-3 text-xs">
                  <div className="flex items-center justify-between pb-2 border-b border-primary-100">
                    <div className="flex items-center gap-1.5 font-semibold text-primary-900">
                      <Building2 className="h-4 w-4 text-primary-600" />
                      <span>Assigned to</span>
                    </div>
                    <span className="font-semibold text-primary-950">
                      {data.assignedBusiness?.businessName || data.business.name}
                    </span>
                  </div>

                  <div className="flex justify-between text-primary-800">
                    <span>Merchant ID:</span>
                    <span className="font-mono font-medium">
                      {data.assignedBusiness?.merchantId || 'N/A'}
                    </span>
                  </div>

                  <div className="flex justify-between text-primary-800">
                    <span>Owner / Email:</span>
                    <span className="font-medium">
                      {data.business.owner} ({data.business.email})
                    </span>
                  </div>

                  {/* Reallocation Control for Inflows with Siblings */}
                  {data.siblingBusinesses && data.siblingBusinesses.length > 0 && (
                    <div className="pt-2 border-t border-primary-100 space-y-2.5">
                      <div className="font-semibold text-primary-900">
                        Reallocate Inflow to Sibling Business
                      </div>
                      {data.accrualLinked ? (
                        <p className="text-[11px] leading-relaxed text-primary-700">
                          Revenue for this inflow was recognised when the invoice or credit was
                          issued, so it cannot be moved. Cancel and re-issue the invoice against the
                          correct business instead.
                        </p>
                      ) : (
                        <>
                          <div className="flex gap-2 items-center">
                            <select
                              value={selectedSiblingId || data.siblingBusinesses[0]?.id}
                              onChange={(e) => setSelectedSiblingId(e.target.value)}
                              className="flex-1 rounded border border-gray-300 bg-white px-2.5 py-1.5 text-xs text-gray-900 focus:border-primary-500 focus:outline-none"
                            >
                              {data.siblingBusinesses.map((b) => (
                                <option key={b.id} value={b.id}>
                                  {b.businessName} ({b.merchantId})
                                </option>
                              ))}
                            </select>
                            <button
                              onClick={handleReassign}
                              disabled={reallocating || (!selectedSiblingId && !data.siblingBusinesses[0]?.id)}
                              className="flex items-center gap-1 rounded bg-primary-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary-700 transition-colors disabled:opacity-50 cursor-pointer"
                            >
                              {reallocating ? (
                                <>
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  Moving...
                                </>
                              ) : (
                                <>
                                  <FolderSync className="h-3.5 w-3.5" />
                                  Reallocate
                                </>
                              )}
                            </button>
                          </div>
                          <p className="text-[11px] leading-relaxed text-primary-700">
                            <strong>Note:</strong> Reallocating changes which business this inflow
                            counts toward, including in periods already reported.
                          </p>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Merchant & Routing Info */}
              <div className="rounded-xl border border-gray-200 bg-gray-50/40 p-4 space-y-2.5 text-xs">
                <div className="flex items-center justify-between pb-2 border-b border-gray-200">
                  <div className="flex items-center gap-1.5 text-gray-600 font-semibold">
                    <Building2 className="h-4 w-4 text-gray-500" />
                    <span>Merchant Details</span>
                  </div>
                  <span className="font-semibold text-gray-900">{data.business.name}</span>
                </div>

                <div className="flex justify-between text-gray-600">
                  <span>Merchant Owner:</span>
                  <span className="font-medium text-gray-800">{data.business.owner}</span>
                </div>

                <div className="flex justify-between text-gray-600">
                  <span>Channel:</span>
                  <span className="font-medium text-gray-800">{data.routing.channel}</span>
                </div>

                {data.routing.destinationBank && (
                  <div className="flex justify-between text-gray-600">
                    <span>Destination Bank:</span>
                    <span className="font-medium text-gray-800">
                      {data.routing.destinationBank} ({data.routing.destinationAccountNum})
                    </span>
                  </div>
                )}

                <div className="flex justify-between text-gray-600">
                  <span>Reference:</span>
                  <div className="flex items-center gap-1.5 font-mono text-gray-800">
                    <span>{data.reference}</span>
                    <button
                      onClick={copyReference}
                      className="p-0.5 text-gray-400 hover:text-gray-600 transition-colors"
                      title="Copy reference"
                    >
                      {copied ? (
                        <Check className="h-3.5 w-3.5 text-emerald-600" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                </div>

                <div className="flex justify-between text-gray-600">
                  <span>Timestamp:</span>
                  <span className="font-mono text-gray-700">
                    {new Date(data.date).toLocaleString('en-NG', {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })}
                  </span>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 bg-gray-50/80 px-5 py-3 shrink-0 flex justify-end">
          <button
            onClick={onClose}
            className="rounded-none bg-white border border-gray-300 px-4 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
