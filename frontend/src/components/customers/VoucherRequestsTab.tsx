import { useEffect, useState } from 'react';
import {
  Clock,
  Search,
  RefreshCw,
  CheckCircle,
  XCircle,
  Send,
  Gift,
  ShieldAlert,
  Loader2,
  Copy,
  Check,
} from 'lucide-react';
import toast from 'react-hot-toast';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import Modal from '@/components/ui/Modal';
import { TableSkeleton } from '@/components/ui/Skeleton';
import EmptyState from '@/components/ui/EmptyState';
import { useCustomerStore } from '@/stores/customer.store';
import { formatNaira } from '@/lib/format';
import { useDisplayCurrency } from '@/hooks/useDisplayCurrency';
import type { VoucherLedgerRequest, VoucherRequestStatus } from '@/types';

interface Props {
  businessId: string;
  isManagerOrOwner: boolean;
  isOwner: boolean;
  threshold?: number;
}

export default function VoucherRequestsTab({
  businessId,
  isManagerOrOwner,
  isOwner,
  threshold = 50000,
}: Props) {
  useDisplayCurrency();
  const {
    voucherRequests,
    voucherRequestsPagination,
    voucherRequestsLoading,
    listVoucherRequests,
    authorizeVoucherRequest,
    rejectVoucherRequest,
    resendVerification,
  } = useCustomerStore();

  const [statusFilter, setStatusFilter] = useState<string>('');
  const [kindFilter, setKindFilter] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(1);

  // Reject modal state
  const [rejectingRequest, setRejectingRequest] = useState<VoucherLedgerRequest | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [isSubmittingReject, setIsSubmittingReject] = useState(false);

  // Link copy modal state
  const [activeLink, setActiveLink] = useState<{ url: string; customerName: string } | null>(null);
  const [copied, setCopied] = useState(false);

  // Action loading IDs
  const [processingId, setProcessingId] = useState<string | null>(null);

  const loadRequests = async (p = page) => {
    try {
      await listVoucherRequests(businessId, {
        page: p,
        limit: 15,
        status: statusFilter || undefined,
        kind: kindFilter || undefined,
        search: searchTerm || undefined,
      });
    } catch (err: any) {
      toast.error(err.response?.data?.error?.message || 'Failed to load voucher requests');
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      setPage(1);
      loadRequests(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [statusFilter, kindFilter, searchTerm]);

  const handleAuthorize = async (req: VoucherLedgerRequest) => {
    setProcessingId(req.id);
    try {
      const res = await authorizeVoucherRequest(businessId, req.id);
      if (res.verifyUrl) {
        toast.success('Authorized — customer verification link generated');
        setActiveLink({ url: res.verifyUrl, customerName: req.customerName });
      } else {
        toast.success(res.message || 'Voucher adjustment approved and applied');
      }
      await loadRequests();
    } catch (err: any) {
      toast.error(err.response?.data?.error?.message || err.message || 'Failed to authorize request');
    } finally {
      setProcessingId(null);
    }
  };

  const handleResend = async (req: VoucherLedgerRequest) => {
    setProcessingId(req.id);
    try {
      const res = await resendVerification(businessId, req.id);
      toast.success('Verification link resent');
      if (res.verifyUrl) {
        setActiveLink({ url: res.verifyUrl, customerName: req.customerName });
      }
      await loadRequests();
    } catch (err: any) {
      toast.error(err.response?.data?.error?.message || 'Failed to resend verification link');
    } finally {
      setProcessingId(null);
    }
  };

  const submitReject = async () => {
    if (!rejectingRequest) return;
    if (!rejectReason.trim()) {
      toast.error('Please provide a reason for rejection');
      return;
    }

    setIsSubmittingReject(true);
    try {
      await rejectVoucherRequest(businessId, rejectingRequest.id, rejectReason.trim());
      toast.success('Voucher request rejected');
      setRejectingRequest(null);
      setRejectReason('');
      await loadRequests();
    } catch (err: any) {
      toast.error(err.response?.data?.error?.message || 'Failed to reject request');
    } finally {
      setIsSubmittingReject(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success('Verification link copied to clipboard');
    setTimeout(() => setCopied(false), 2000);
  };

  const renderStatusBadge = (status: VoucherRequestStatus, rejectReason?: string | null) => {
    switch (status) {
      case 'pending':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">
            <Clock className="w-3 h-3" /> Pending Authorization
          </span>
        );
      case 'awaiting_customer':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-blue-50 text-blue-800 border border-blue-200">
            <Send className="w-3 h-3" /> Awaiting Customer
          </span>
        );
      case 'verified':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
            <CheckCircle className="w-3 h-3" /> Verified & Credited
          </span>
        );
      case 'applied':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
            <CheckCircle className="w-3 h-3" /> Applied
          </span>
        );
      case 'rejected':
        return (
          <span
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-red-50 text-red-800 border border-red-200"
            title={rejectReason || undefined}
          >
            <XCircle className="w-3 h-3" /> Rejected
          </span>
        );
      case 'expired':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-gray-100 text-gray-600 border border-gray-200">
            Expired
          </span>
        );
      default:
        return <span className="text-xs text-gray-500">{status}</span>;
    }
  };

  return (
    <div className="space-y-4">
      {/* Banner for sales staff */}
      {!isManagerOrOwner && (
        <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-3.5 text-xs text-blue-900 flex items-start gap-3">
          <Clock className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold">Voucher Request Queue</span>
            <p className="mt-0.5 text-blue-800">
              Your top-ups and adjustments are safely queued here for manager authorization. Once approved, the customer verifies via their magic link before balance is credited.
            </p>
          </div>
        </div>
      )}

      {/* Filter Toolbar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white p-3 rounded-xl border border-gray-200">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search by customer, phone, or notes..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
          />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="text-xs py-1.5 px-2.5 rounded-lg border border-gray-200 bg-white text-gray-700 focus:outline-none focus:border-primary-500"
          >
            <option value="">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="awaiting_customer">Awaiting Customer</option>
            <option value="applied">Applied</option>
            <option value="verified">Verified</option>
            <option value="rejected">Rejected</option>
            <option value="expired">Expired</option>
          </select>

          <select
            value={kindFilter}
            onChange={(e) => setKindFilter(e.target.value)}
            className="text-xs py-1.5 px-2.5 rounded-lg border border-gray-200 bg-white text-gray-700 focus:outline-none focus:border-primary-500"
          >
            <option value="">All Types</option>
            <option value="top_up">Top-Up</option>
            <option value="adjustment">Adjustment</option>
          </select>

          <Button
            variant="secondary"
            size="sm"
            onClick={() => loadRequests()}
            disabled={voucherRequestsLoading}
            className="text-xs py-1.5 px-2.5"
            title="Refresh requests"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${voucherRequestsLoading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* Requests Table */}
      <Card className="overflow-hidden border border-gray-200">
        {voucherRequestsLoading && voucherRequests.length === 0 ? (
          <TableSkeleton rows={5} />
        ) : voucherRequests.length === 0 ? (
          <EmptyState
            icon={Clock}
            message="No voucher requests found. When voucher balance changes or top-ups are requested, they will appear here for review."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50/75 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                  <th className="py-2.5 px-4">Customer</th>
                  <th className="py-2.5 px-4">Type</th>
                  <th className="py-2.5 px-4">Amount</th>
                  <th className="py-2.5 px-4">Status</th>
                  <th className="py-2.5 px-4">Notes / Reason</th>
                  <th className="py-2.5 px-4">Date</th>
                  <th className="py-2.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-xs">
                {voucherRequests.map((req) => {
                  const isPositive = req.amount > 0;
                  const absAmount = Math.abs(req.amount);
                  const isProcessing = processingId === req.id;
                  const requiresOwnerForDeduction =
                    req.kind === 'adjustment' && !isPositive && absAmount > threshold;

                  return (
                    <tr key={req.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="py-3 px-4 font-medium text-gray-900">
                        <div>{req.customerName}</div>
                        <div className="text-[11px] text-gray-500">
                          {req.customerPhone || req.customerEmail || 'No contact on file'}
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        <span className="capitalize font-medium text-gray-700">
                          {req.kind === 'top_up' ? 'Top-Up' : 'Adjustment'}
                        </span>
                      </td>

                      <td className="py-3 px-4">
                        <div className="font-semibold text-gray-900">
                          {isPositive ? `+${formatNaira(absAmount)}` : `-${formatNaira(absAmount)}`}
                        </div>
                        {req.bonusAmount && req.bonusAmount > 0 && (
                          <div className="inline-flex items-center gap-1 text-[10px] text-amber-700 font-medium">
                            <Gift className="w-3 h-3" /> +{formatNaira(req.bonusAmount)} ({req.bonusPct}%)
                          </div>
                        )}
                      </td>

                      <td className="py-3 px-4">
                        {renderStatusBadge(req.status, req.rejectReason)}
                      </td>

                      <td className="py-3 px-4 max-w-[200px]">
                        <p className="text-gray-600 truncate" title={req.notes || ''}>
                          {req.notes || '—'}
                        </p>
                        {req.rejectReason && (
                          <p className="text-[11px] text-red-600 truncate" title={req.rejectReason}>
                            Reason: {req.rejectReason}
                          </p>
                        )}
                      </td>

                      <td className="py-3 px-4 text-gray-500 whitespace-nowrap">
                        {new Date(req.createdAt).toLocaleDateString('en-NG', {
                          day: 'numeric',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>

                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5 flex-wrap">
                          {/* Pending Actions */}
                          {req.status === 'pending' && isManagerOrOwner && (
                            <>
                              {isPositive ? (
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  disabled={isProcessing}
                                  onClick={() => handleAuthorize(req)}
                                  className="text-xs py-1 px-2.5 bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100"
                                >
                                  {isProcessing ? (
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                  ) : (
                                    'Authorize & Send Link'
                                  )}
                                </Button>
                              ) : requiresOwnerForDeduction && !isOwner ? (
                                <span
                                  className="inline-flex items-center gap-1 text-[11px] text-amber-700 font-medium px-2 py-1 rounded bg-amber-50 border border-amber-200"
                                  title={`Deductions over ${formatNaira(threshold)} require Owner approval`}
                                >
                                  <ShieldAlert className="w-3 h-3" /> Owner Required
                                </span>
                              ) : (
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  disabled={isProcessing}
                                  onClick={() => handleAuthorize(req)}
                                  className="text-xs py-1 px-2.5 bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
                                >
                                  {isProcessing ? (
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                  ) : (
                                    'Approve & Apply'
                                  )}
                                </Button>
                              )}

                              <Button
                                variant="secondary"
                                size="sm"
                                disabled={isProcessing}
                                onClick={() => setRejectingRequest(req)}
                                className="text-xs py-1 px-2 text-red-600 hover:bg-red-50 hover:text-red-700 border-red-200"
                              >
                                Reject
                              </Button>
                            </>
                          )}

                          {/* Awaiting Customer Actions */}
                          {req.status === 'awaiting_customer' && isManagerOrOwner && (
                            <>
                              <Button
                                variant="secondary"
                                size="sm"
                                disabled={isProcessing}
                                onClick={() => handleResend(req)}
                                className="text-xs py-1 px-2.5 text-blue-700 hover:bg-blue-50 border-blue-200"
                              >
                                {isProcessing ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  'Resend Link'
                                )}
                              </Button>
                              <Button
                                variant="secondary"
                                size="sm"
                                disabled={isProcessing}
                                onClick={() => setRejectingRequest(req)}
                                className="text-xs py-1 px-2 text-red-600 hover:bg-red-50"
                              >
                                Reject
                              </Button>
                            </>
                          )}

                          {/* Applied / Ledger link */}
                          {req.ledgerId && (
                            <span className="text-[11px] text-gray-500 font-mono">
                              Ledger #{req.ledgerId.slice(0, 8)}
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Pagination Controls */}
            {voucherRequestsPagination && voucherRequestsPagination.totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 bg-white border-t border-gray-200">
                <div className="text-xs text-gray-500">
                  Page <span className="font-semibold text-gray-900">{page}</span> of{' '}
                  <span className="font-semibold text-gray-900">
                    {voucherRequestsPagination.totalPages}
                  </span>{' '}
                  ({voucherRequestsPagination.total} requests)
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={page <= 1 || voucherRequestsLoading}
                    onClick={() => {
                      const next = Math.max(1, page - 1);
                      setPage(next);
                      loadRequests(next);
                    }}
                    className="text-xs py-1 px-2.5"
                  >
                    Previous
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={
                      page >= voucherRequestsPagination.totalPages || voucherRequestsLoading
                    }
                    onClick={() => {
                      const next = page + 1;
                      setPage(next);
                      loadRequests(next);
                    }}
                    className="text-xs py-1 px-2.5"
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Reject Modal */}
      <Modal
        isOpen={!!rejectingRequest}
        onClose={() => {
          setRejectingRequest(null);
          setRejectReason('');
        }}
        title="Reject Voucher Request"
      >
        <div className="space-y-4">
          <p className="text-xs text-gray-600">
            Please enter a reason for rejecting the{' '}
            <span className="font-semibold">{rejectingRequest?.kind}</span> request of{' '}
            <span className="font-semibold">
              {formatNaira(Math.abs(rejectingRequest?.amount || 0))}
            </span>{' '}
            for <span className="font-semibold">{rejectingRequest?.customerName}</span>.
          </p>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              Rejection Reason *
            </label>
            <textarea
              rows={3}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="e.g. Unverified payment entry, incorrect customer account..."
              className="w-full text-xs p-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={isSubmittingReject}
              onClick={() => {
                setRejectingRequest(null);
                setRejectReason('');
              }}
            >
              Cancel
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={isSubmittingReject || !rejectReason.trim()}
              onClick={submitReject}
              className="bg-red-600 hover:bg-red-700 text-white border-transparent"
            >
              {isSubmittingReject ? 'Rejecting...' : 'Confirm Rejection'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Verification Link Modal */}
      <Modal
        isOpen={!!activeLink}
        onClose={() => setActiveLink(null)}
        title="Customer Verification Link"
      >
        <div className="space-y-4">
          <p className="text-xs text-gray-600">
            A verification email was dispatched. You can also copy and forward this magic link directly to{' '}
            <span className="font-semibold">{activeLink?.customerName}</span> via WhatsApp or SMS:
          </p>

          <div className="p-2.5 bg-gray-50 rounded-lg border border-gray-200 text-xs font-mono break-all text-gray-800 flex items-center justify-between gap-2">
            <span className="truncate">{activeLink?.url}</span>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => activeLink && copyToClipboard(activeLink.url)}
              className="shrink-0 text-xs py-1 px-2"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
            </Button>
          </div>

          <div className="flex justify-end pt-2">
            <Button variant="secondary" size="sm" onClick={() => setActiveLink(null)}>
              Done
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
