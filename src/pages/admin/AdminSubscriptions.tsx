import { useState, useEffect, useCallback } from 'react';
import {
  CreditCard,
  Search,
  CheckCircle2,
  XCircle,
  ExternalLink,
  RefreshCw,
  AlertCircle,
  Clock,
  Eye,
  X,
  Phone,
  Building2,
  Mail,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api, { getErrorMessage } from '@/lib/axios.ts';
import { useAdminStatsStore } from '@/stores/admin.stats.store.ts';
import type { SubscriptionSubmission } from '@/types/index.ts';

type StatusTab = 'all' | 'pending' | 'approved' | 'rejected';

export default function AdminSubscriptions() {
  const [submissions, setSubmissions] = useState<SubscriptionSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<StatusTab>('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [counts, setCounts] = useState({
    pending: 0,
    approved: 0,
    rejected: 0,
    totalRevenueApproved: 0,
  });

  // Selected submission for Receipt Inspector modal
  const [inspectingSub, setInspectingSub] = useState<SubscriptionSubmission | null>(null);

  // Approval / Rejection action state
  const [actionLoading, setActionLoading] = useState(false);
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');

  const fetchSubmissions = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, any> = {
        page,
        limit: 20,
      };
      if (activeTab !== 'all') {
        params.status = activeTab;
      }
      if (search.trim()) {
        params.search = search.trim();
      }

      const res = await api.get('/admin/subscriptions', { params });
      if (res.data.success) {
        setSubmissions(res.data.data);
        setTotalPages(res.data.pagination?.totalPages || 1);
        if (res.data.counts) {
          setCounts(res.data.counts);
        }
      }
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to load subscription submissions'));
    } finally {
      setLoading(false);
    }
  }, [activeTab, page, search]);

  useEffect(() => {
    fetchSubmissions();
  }, [fetchSubmissions]);

  const handleApprove = async (sub: SubscriptionSubmission) => {
    if (!window.confirm(`Are you sure you want to approve and activate the ${sub.plan} plan for ${sub.customerName}?`)) {
      return;
    }
    setActionLoading(true);
    try {
      await api.post(`/admin/subscriptions/${sub.id}/approve`, {});
      toast.success(`Subscription activated for ${sub.customerName}!`);
      setInspectingSub(null);
      useAdminStatsStore.getState().fetchStats({ force: true });
      fetchSubmissions();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to approve subscription'));
    } finally {
      setActionLoading(false);
    }
  };

  const handleRejectSubmit = async () => {
    if (!inspectingSub) return;
    if (!rejectionReason.trim() || rejectionReason.trim().length < 3) {
      toast.error('Please enter a clear reason for rejecting this payment proof');
      return;
    }

    setActionLoading(true);
    try {
      await api.post(`/admin/subscriptions/${inspectingSub.id}/reject`, {
        reason: rejectionReason.trim(),
      });
      toast.success('Subscription rejected and user notified.');
      setRejectModalOpen(false);
      setRejectionReason('');
      setInspectingSub(null);
      useAdminStatsStore.getState().fetchStats({ force: true });
      fetchSubmissions();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to reject subscription'));
    } finally {
      setActionLoading(false);
    }
  };

  const isPdf = inspectingSub?.receiptMime?.includes('pdf') ||
    inspectingSub?.receiptFileName?.toLowerCase().endsWith('.pdf');

  const receiptStreamUrl = inspectingSub
    ? `${api.defaults.baseURL || '/api/v1'}/admin/subscriptions/${inspectingSub.id}/receipt`
    : '';

  return (
    <div className='space-y-6'>
      {/* Header */}
      <div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
        <div>
          <div className='flex items-center gap-2'>
            <h1 className='text-xl sm:text-2xl font-bold tracking-tight text-ink'>
              Subscriptions Desk
            </h1>
            <span className='rounded-full bg-primary-100 px-2.5 py-0.5 text-xs font-semibold text-primary-800'>
              Zenith Bank Direct
            </span>
          </div>
          <p className='text-xs sm:text-sm text-ink-muted mt-1'>
            Review user payment proof receipts, verify transfers to Zenith Bank Plc (1214382269), and 1-click activate plans.
          </p>
        </div>

        <button
          onClick={() => {
            fetchSubmissions();
            useAdminStatsStore.getState().fetchStats({ force: true });
          }}
          disabled={loading}
          className='inline-flex items-center gap-1.5 self-start sm:self-auto rounded-lg border border-hairline bg-panel px-3.5 py-2 text-xs font-semibold text-ink shadow-2xs hover:bg-panel-subtle transition-colors'
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Summary KPI Cards */}
      <div className='grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4'>
        <div className='rounded-xl border border-hairline bg-panel p-4 shadow-2xs'>
          <div className='flex items-center justify-between text-ink-subtle'>
            <span className='text-xs font-medium'>Pending Verification</span>
            <Clock className='h-4 w-4 text-amber-500' />
          </div>
          <p className='mt-2 text-2xl font-bold text-amber-600 tabular-nums'>
            {counts.pending}
          </p>
          <p className='text-[11px] text-ink-subtle mt-0.5'>Awaiting admin verification</p>
        </div>

        <div className='rounded-xl border border-hairline bg-panel p-4 shadow-2xs'>
          <div className='flex items-center justify-between text-ink-subtle'>
            <span className='text-xs font-medium'>Approved & Active</span>
            <CheckCircle2 className='h-4 w-4 text-emerald-500' />
          </div>
          <p className='mt-2 text-2xl font-bold text-emerald-600 tabular-nums'>
            {counts.approved}
          </p>
          <p className='text-[11px] text-ink-subtle mt-0.5'>Paid subscriptions active</p>
        </div>

        <div className='rounded-xl border border-hairline bg-panel p-4 shadow-2xs'>
          <div className='flex items-center justify-between text-ink-subtle'>
            <span className='text-xs font-medium'>Rejected Submissions</span>
            <XCircle className='h-4 w-4 text-rose-500' />
          </div>
          <p className='mt-2 text-2xl font-bold text-rose-600 tabular-nums'>
            {counts.rejected}
          </p>
          <p className='text-[11px] text-ink-subtle mt-0.5'>Invalid/unconfirmed proofs</p>
        </div>

        <div className='rounded-xl border border-hairline bg-panel p-4 shadow-2xs'>
          <div className='flex items-center justify-between text-ink-subtle'>
            <span className='text-xs font-medium'>Total Collected</span>
            <CreditCard className='h-4 w-4 text-primary-500' />
          </div>
          <p className='mt-2 text-2xl font-bold text-primary-700 tabular-nums'>
            ₦{counts.totalRevenueApproved.toLocaleString()}
          </p>
          <p className='text-[11px] text-ink-subtle mt-0.5'>Cumulative subscription volume</p>
        </div>
      </div>

      {/* Filter Tabs & Search */}
      <div className='flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-hairline pb-4'>
        <div className='flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0'>
          {(
            [
              { id: 'all', label: 'All Submissions' },
              { id: 'pending', label: `Pending (${counts.pending})` },
              { id: 'approved', label: `Approved (${counts.approved})` },
              { id: 'rejected', label: `Rejected (${counts.rejected})` },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id);
                setPage(1);
              }}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors ${
                activeTab === tab.id
                  ? 'bg-primary-600 text-white shadow-2xs'
                  : 'text-ink-muted hover:bg-panel-subtle hover:text-ink'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className='relative w-full sm:w-72'>
          <Search className='absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-ink-subtle' />
          <input
            type='text'
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder='Search customer, email, business…'
            className='w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-hairline bg-panel text-ink placeholder:text-ink-subtle focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500'
          />
        </div>
      </div>

      {/* Submissions Table */}
      <div className='overflow-hidden rounded-xl border border-hairline bg-panel shadow-2xs'>
        <div className='overflow-x-auto'>
          <table className='w-full text-left text-xs'>
            <thead className='border-b border-hairline bg-panel-subtle text-ink-muted uppercase tracking-wider font-semibold text-[10px]'>
              <tr>
                <th className='py-3 px-4'>Customer / Business</th>
                <th className='py-3 px-4'>Plan & Cycle</th>
                <th className='py-3 px-4'>Amount Paid</th>
                <th className='py-3 px-4'>Status</th>
                <th className='py-3 px-4'>Submitted At</th>
                <th className='py-3 px-4 text-right'>Action</th>
              </tr>
            </thead>
            <tbody className='divide-y divide-hairline'>
              {loading ? (
                <tr>
                  <td colSpan={6} className='py-12 text-center text-ink-subtle'>
                    <RefreshCw className='mx-auto h-6 w-6 animate-spin mb-2 text-primary-600' />
                    Loading submissions queue…
                  </td>
                </tr>
              ) : submissions.length === 0 ? (
                <tr>
                  <td colSpan={6} className='py-12 text-center text-ink-subtle'>
                    <AlertCircle className='mx-auto h-8 w-8 mb-2 text-ink-subtle opacity-40' />
                    <p className='font-semibold text-ink'>No subscription submissions found</p>
                    <p className='text-[11px] mt-0.5'>
                      {search ? 'Try clearing your search query.' : 'New transfers will appear here.'}
                    </p>
                  </td>
                </tr>
              ) : (
                submissions.map((sub) => {
                  const statusColors: Record<string, string> = {
                    pending: 'bg-amber-50 text-amber-800 border-amber-200',
                    approved: 'bg-emerald-50 text-emerald-800 border-emerald-200',
                    rejected: 'bg-rose-50 text-rose-800 border-rose-200',
                  };

                  return (
                    <tr
                      key={sub.id}
                      className='hover:bg-panel-subtle/50 transition-colors cursor-pointer'
                      onClick={() => setInspectingSub(sub)}
                    >
                      <td className='py-3.5 px-4'>
                        <div className='flex items-center gap-2.5'>
                          <div className='h-8 w-8 rounded-full bg-primary-100 text-primary-700 font-bold flex items-center justify-center shrink-0'>
                            {sub.customerName.charAt(0).toUpperCase()}
                          </div>
                          <div className='min-w-0'>
                            <p className='font-bold text-ink truncate'>{sub.customerName}</p>
                            <p className='text-[11px] text-ink-muted truncate'>{sub.email}</p>
                            {sub.businessName && (
                              <p className='text-[10px] text-ink-subtle truncate flex items-center gap-1 mt-0.5'>
                                <Building2 className='h-3 w-3 shrink-0' />
                                <span>{sub.businessName}</span>
                              </p>
                            )}
                          </div>
                        </div>
                      </td>

                      <td className='py-3.5 px-4'>
                        <div className='font-semibold text-ink'>{sub.plan}</div>
                        <span className='inline-block rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-canvas text-ink-subtle border border-hairline mt-0.5'>
                          {sub.billingCycle}
                        </span>
                      </td>

                      <td className='py-3.5 px-4'>
                        <span className='font-bold text-ink tabular-nums text-sm'>
                          ₦{Number(sub.amount).toLocaleString()}
                        </span>
                      </td>

                      <td className='py-3.5 px-4'>
                        <span
                          className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-bold capitalize ${
                            statusColors[sub.status] || 'bg-gray-100 text-gray-700'
                          }`}
                        >
                          {sub.status === 'pending' && <Clock className='h-3 w-3' />}
                          {sub.status === 'approved' && <CheckCircle2 className='h-3 w-3' />}
                          {sub.status === 'rejected' && <XCircle className='h-3 w-3' />}
                          <span>{sub.status}</span>
                        </span>
                      </td>

                      <td className='py-3.5 px-4 text-ink-muted whitespace-nowrap text-[11px]'>
                        {new Date(sub.createdAt).toLocaleDateString('en-NG', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </td>

                      <td className='py-3.5 px-4 text-right'>
                        <button
                          type='button'
                          onClick={(e) => {
                            e.stopPropagation();
                            setInspectingSub(sub);
                          }}
                          className='inline-flex items-center gap-1.5 rounded-lg border border-hairline bg-panel px-3 py-1.5 text-xs font-semibold text-primary-700 hover:bg-primary-50 transition-colors shadow-2xs'
                        >
                          <Eye className='h-3.5 w-3.5' />
                          <span>View Proof</span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className='flex items-center justify-between border-t border-hairline px-4 py-3 bg-panel-subtle text-xs'>
            <span className='text-ink-subtle'>
              Page {page} of {totalPages}
            </span>
            <div className='flex items-center gap-2'>
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className='rounded border border-hairline bg-panel px-2.5 py-1 text-xs font-semibold disabled:opacity-40'
              >
                Previous
              </button>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className='rounded border border-hairline bg-panel px-2.5 py-1 text-xs font-semibold disabled:opacity-40'
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Receipt Inspector Modal ── */}
      {inspectingSub && (
        <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150'>
          <div className='relative w-full max-w-4xl max-h-[90vh] overflow-hidden rounded-2xl bg-panel border border-hairline shadow-2xl flex flex-col md:flex-row'>
            {/* Left: Document View (Image or PDF) */}
            <div className='md:w-3/5 bg-gray-900 flex flex-col items-center justify-center p-4 min-h-[320px] md:min-h-[500px] border-b md:border-b-0 md:border-r border-hairline overflow-auto'>
              {isPdf ? (
                <iframe
                  src={receiptStreamUrl}
                  title='Receipt PDF Preview'
                  className='w-full h-full min-h-[420px] rounded-lg bg-white border-0'
                />
              ) : (
                <div className='relative max-w-full max-h-full flex items-center justify-center'>
                  <img
                    src={receiptStreamUrl}
                    alt='Payment proof receipt'
                    className='max-w-full max-h-[480px] object-contain rounded-lg shadow-md'
                  />
                </div>
              )}

              <div className='mt-3 flex items-center gap-2'>
                <a
                  href={receiptStreamUrl}
                  target='_blank'
                  rel='noopener noreferrer'
                  className='inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white text-xs font-semibold transition-colors'
                >
                  <ExternalLink className='h-3.5 w-3.5' />
                  <span>Open Full Size</span>
                </a>
              </div>
            </div>

            {/* Right: Customer & Action Panel */}
            <div className='md:w-2/5 p-6 flex flex-col justify-between overflow-y-auto max-h-[85vh]'>
              <div className='space-y-5'>
                <div className='flex items-start justify-between'>
                  <div>
                    <span className='rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-primary-100 text-primary-800'>
                      Submission Details
                    </span>
                    <h3 className='text-lg font-bold text-ink mt-1'>
                      {inspectingSub.customerName}
                    </h3>
                  </div>
                  <button
                    onClick={() => setInspectingSub(null)}
                    className='rounded-full p-1.5 text-ink-subtle hover:bg-panel-subtle hover:text-ink'
                  >
                    <X className='h-4 w-4' />
                  </button>
                </div>

                {/* Details list */}
                <div className='rounded-xl border border-hairline bg-panel-subtle/50 p-3.5 space-y-2 text-xs'>
                  <div className='flex items-center justify-between'>
                    <span className='text-ink-muted flex items-center gap-1'>
                      <Mail className='h-3 w-3' /> Email:
                    </span>
                    <a
                      href={`mailto:${inspectingSub.email}`}
                      className='font-semibold text-primary-700 hover:underline'
                    >
                      {inspectingSub.email}
                    </a>
                  </div>

                  {inspectingSub.phone && (
                    <div className='flex items-center justify-between'>
                      <span className='text-ink-muted flex items-center gap-1'>
                        <Phone className='h-3 w-3' /> Phone:
                      </span>
                      <a
                        href={`https://wa.me/${inspectingSub.phone.replace(/[^0-9]/g, '')}`}
                        target='_blank'
                        rel='noopener noreferrer'
                        className='font-semibold text-emerald-700 hover:underline'
                      >
                        {inspectingSub.phone}
                      </a>
                    </div>
                  )}

                  {inspectingSub.businessName && (
                    <div className='flex items-center justify-between'>
                      <span className='text-ink-muted flex items-center gap-1'>
                        <Building2 className='h-3 w-3' /> Business:
                      </span>
                      <span className='font-semibold text-ink'>
                        {inspectingSub.businessName}
                      </span>
                    </div>
                  )}

                  <div className='flex items-center justify-between border-t border-hairline pt-2'>
                    <span className='text-ink-muted'>Plan Requested:</span>
                    <span className='font-bold text-ink'>
                      {inspectingSub.plan} ({inspectingSub.billingCycle})
                    </span>
                  </div>

                  <div className='flex items-center justify-between'>
                    <span className='text-ink-muted'>Claimed Amount:</span>
                    <span className='font-extrabold text-primary-700 text-sm'>
                      ₦{Number(inspectingSub.amount).toLocaleString()}
                    </span>
                  </div>

                  {inspectingSub.notes && (
                    <div className='border-t border-hairline pt-2'>
                      <span className='text-ink-muted block text-[11px] mb-0.5'>Notes / Session Ref:</span>
                      <p className='text-ink italic bg-panel p-2 rounded border border-hairline'>
                        "{inspectingSub.notes}"
                      </p>
                    </div>
                  )}

                  {inspectingSub.rejectionReason && (
                    <div className='border-t border-hairline pt-2'>
                      <span className='text-rose-600 block text-[11px] font-semibold mb-0.5'>Rejection Reason:</span>
                      <p className='text-rose-700 bg-rose-50 p-2 rounded border border-rose-200'>
                        {inspectingSub.rejectionReason}
                      </p>
                    </div>
                  )}
                </div>

                {/* Receiving Bank verification alert */}
                <div className='rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-xs text-emerald-800'>
                  <p className='font-bold flex items-center gap-1'>
                    <CheckCircle2 className='h-3.5 w-3.5 text-emerald-600' />
                    Zenith Bank Plc Verification
                  </p>
                  <p className='text-[11px] text-emerald-700 mt-0.5'>
                    Please confirm credit in Zenith Bank: <strong>1214382269</strong> (WallX Africa Limited) before approving.
                  </p>
                </div>
              </div>

              {/* Actions Footer */}
              <div className='pt-5 border-t border-hairline mt-4 space-y-2'>
                {inspectingSub.status === 'pending' ? (
                  <>
                    <button
                      type='button'
                      disabled={actionLoading}
                      onClick={() => handleApprove(inspectingSub)}
                      className='w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50'
                    >
                      <CheckCircle2 className='h-4 w-4' />
                      <span>{actionLoading ? 'Activating…' : 'Approve & Activate Plan'}</span>
                    </button>

                    <button
                      type='button'
                      disabled={actionLoading}
                      onClick={() => setRejectModalOpen(true)}
                      className='w-full py-2 px-4 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 font-semibold text-xs transition-colors disabled:opacity-50'
                    >
                      Reject Submission
                    </button>
                  </>
                ) : (
                  <div className='text-center py-2'>
                    <span className='text-xs font-semibold text-ink-muted capitalize'>
                      This submission has been {inspectingSub.status}.
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Rejection Reason Modal ── */}
      {rejectModalOpen && inspectingSub && (
        <div className='fixed inset-0 z-60 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150'>
          <div className='w-full max-w-md rounded-2xl bg-panel border border-hairline p-6 shadow-2xl space-y-4'>
            <div className='flex items-start justify-between'>
              <div>
                <h3 className='text-base font-bold text-ink'>Reject Payment Proof</h3>
                <p className='text-xs text-ink-muted mt-0.5'>
                  Provide an explanation. This reason will be emailed directly to {inspectingSub.customerName}.
                </p>
              </div>
              <button
                onClick={() => setRejectModalOpen(false)}
                className='rounded-full p-1 text-ink-subtle hover:bg-panel-subtle'
              >
                <X className='h-4 w-4' />
              </button>
            </div>

            <textarea
              rows={3}
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder='e.g. Transfer receipt did not match our Zenith Bank statement credit, or the transaction reference was illegible.'
              className='w-full p-3 text-xs rounded-xl border border-hairline bg-panel text-ink focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500'
            />

            <div className='flex items-center justify-end gap-2 pt-2'>
              <button
                type='button'
                onClick={() => setRejectModalOpen(false)}
                className='px-3.5 py-1.5 rounded-lg border border-hairline text-xs font-semibold text-ink hover:bg-panel-subtle'
              >
                Cancel
              </button>
              <button
                type='button'
                disabled={actionLoading || !rejectionReason.trim()}
                onClick={handleRejectSubmit}
                className='px-4 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold disabled:opacity-50'
              >
                {actionLoading ? 'Rejecting…' : 'Confirm Rejection'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
