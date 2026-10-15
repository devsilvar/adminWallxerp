import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Megaphone,
  Search,
  RefreshCw,
  Send,
  Users,
  User,
  Mail,
  CheckCircle2,
  XCircle,
  Eye,
  X,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api, { getErrorMessage } from '@/lib/axios.ts';
import PageHeader from './shared/PageHeader';
import PaginationBar, { type PaginationState } from './shared/Pagination';
import { Panel, PanelEmpty } from './shared/Panel';
import StatusPill from './shared/StatusPill';
import { formatStamp } from './shared/format';
import type { Broadcast, BroadcastStats, User as UserModel } from '@/types/index.ts';
import { usePaginationTransition } from '@/hooks/usePaginationTransition';

type AudienceFilterTab = 'all' | 'bulk' | 'direct';

interface SearchedUser {
  id: string;
  email: string;
  fullName?: string | null;
  businessCount?: number;
}

export default function AdminBroadcasts() {
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [activeTab, setActiveTab] = useState<AudienceFilterTab>('all');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<PaginationState>({
    page: 1,
    totalPages: 1,
    total: 0,
    hasPrev: false,
    hasNext: false,
  });
  const { isPageLoading, pendingPage, start, finish } = usePaginationTransition();

  const [stats, setStats] = useState<BroadcastStats>({
    totalBroadcasts: 0,
    totalRecipients: 0,
    sentEmailCount: 0,
    failedEmailCount: 0,
  });

  // Composer State
  const [composerOpen, setComposerOpen] = useState(true);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [audienceType, setAudienceType] = useState<'all' | 'user'>('all');
  const [selectedUser, setSelectedUser] = useState<SearchedUser | null>(null);
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [userSearchResults, setUserSearchResults] = useState<SearchedUser[]>([]);
  const [searchingUsers, setSearchingUsers] = useState(false);
  const [sending, setSending] = useState(false);

  // Detail Modal State
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [inspectingBroadcast, setInspectingBroadcast] = useState<Broadcast | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Debounce main search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Debounce user picker search
  useEffect(() => {
    if (audienceType !== 'user' || !userSearchQuery.trim()) {
      setUserSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setSearchingUsers(true);
      try {
        const res = await api.get('/admin/users', {
          params: { search: userSearchQuery.trim(), page: 1, limit: 10 },
        });
        if (res.data?.success && Array.isArray(res.data.data)) {
          const mapped: SearchedUser[] = res.data.data.map((u: UserModel & { businesses?: unknown[] }) => ({
            id: u.id,
            email: u.email,
            fullName: u.fullName,
            businessCount: Array.isArray(u.businesses) ? u.businesses.length : 0,
          }));
          setUserSearchResults(mapped);
        }
      } catch (err) {
        toast.error(getErrorMessage(err, 'Failed to search users'));
      } finally {
        setSearchingUsers(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [audienceType, userSearchQuery]);

  // Fetch broadcasts list
  const fetchBroadcasts = useCallback(async () => {
    setLoading(true);
    if (hasLoadedOnce) start(page);
    try {
      const params: Record<string, unknown> = {
        page,
        limit: 20,
      };
      if (debouncedSearch) {
        params.search = debouncedSearch;
      }

      const res = await api.get('/admin/broadcasts', { params });
      if (res.data?.success) {
        setBroadcasts(res.data.data || []);
        if (res.data.pagination) {
          const p = res.data.pagination;
          setPagination({
            page: p.page,
            totalPages: p.totalPages,
            total: p.total,
            hasPrev: p.page > 1,
            hasNext: p.page < p.totalPages,
          });
        }
        if (res.data.stats) {
          setStats(res.data.stats);
        }
      }
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to load broadcasts'));
    } finally {
      setLoading(false);
      finish();
      setHasLoadedOnce(true);
    }
  }, [page, debouncedSearch, hasLoadedOnce, start, finish]);

  useEffect(() => {
    fetchBroadcasts();
  }, [fetchBroadcasts]);

  const handlePageChange = (next: number) => {
    if (next === page || isPageLoading) return;
    start(next);
    setPage(next);
  };

  // Handle compose submit
  const handleSendBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    if (title.trim().length < 3 || body.trim().length < 10) return;
    if (audienceType === 'user' && !selectedUser) {
      toast.error('Please select a recipient user');
      return;
    }

    setSending(true);
    try {
      const payload = {
        title: title.trim(),
        body: body.trim(),
        audience:
          audienceType === 'all'
            ? { type: 'all' as const }
            : { type: 'user' as const, userId: selectedUser!.id },
      };

      await api.post('/admin/broadcasts', payload);
      toast.success(
        audienceType === 'all'
          ? 'Broadcast queued and sent to all users!'
          : `Direct message sent to ${selectedUser!.email}!`,
      );

      // Reset form
      setTitle('');
      setBody('');
      setAudienceType('all');
      setSelectedUser(null);
      setUserSearchQuery('');
      setUserSearchResults([]);

      // Refresh list
      fetchBroadcasts();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to send broadcast'));
    } finally {
      setSending(false);
    }
  };

  const [detailPage, setDetailPage] = useState(1);

  const fetchDetail = async (broadcastId: string, page: number) => {
    setLoadingDetail(true);
    try {
      const res = await api.get(`/admin/broadcasts/${broadcastId}`, { params: { page, limit: 50 } });
      if (res.data?.success) {
        setInspectingBroadcast(res.data.data);
      }
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to fetch broadcast details'));
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleInspect = async (broadcast: Broadcast) => {
    setInspectingBroadcast(broadcast as any);
    setDetailModalOpen(true);
    setDetailPage(1);
    await fetchDetail(broadcast.id, 1);
  };

  const handleDetailPageChange = (next: number) => {
    if (!inspectingBroadcast) return;
    setDetailPage(next);
    fetchDetail(inspectingBroadcast.id, next);
  };

  // Filter broadcasts locally by audience tab
  const displayedBroadcasts = useMemo(() => {
    if (activeTab === 'bulk') {
      return broadcasts.filter((b) => b.audienceType === 'all');
    }
    if (activeTab === 'direct') {
      return broadcasts.filter((b) => b.audienceType === 'user');
    }
    return broadcasts;
  }, [broadcasts, activeTab]);

  const canSubmit =
    title.trim().length >= 3 &&
    body.trim().length >= 10 &&
    (audienceType === 'all' || selectedUser !== null) &&
    !sending;

  return (
    <div className='space-y-6'>
      {/* Header */}
      <PageHeader
        title='Broadcasts Desk'
        hint='Compose and dispatch platform announcements and direct messages to SME inboxes and emails.'
        actions={
          <div className='flex items-center gap-2'>
            <span className='rounded-full bg-primary-100 px-2.5 py-0.5 text-xs font-semibold text-primary-800'>
              Bulk + Direct
            </span>
            <button
              type='button'
              onClick={() => fetchBroadcasts()}
              disabled={loading}
              className='inline-flex items-center gap-1.5 rounded-lg border border-hairline bg-panel px-3 py-1.5 text-xs font-semibold text-ink shadow-2xs hover:bg-panel-subtle transition-colors'
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
          </div>
        }
      />

      {/* KPI Cards */}
      <div className='grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4'>
        <div className='rounded-xl border border-hairline bg-panel p-4 shadow-2xs'>
          <div className='flex items-center justify-between text-ink-subtle'>
            <span className='text-xs font-medium'>Total Broadcasts</span>
            <Megaphone className='h-4 w-4 text-primary-500' />
          </div>
          <p className='mt-2 text-2xl font-bold text-ink tabular-nums'>
            {stats.totalBroadcasts}
          </p>
          <p className='text-[11px] text-ink-subtle mt-0.5'>All campaigns dispatched</p>
        </div>

        <div className='rounded-xl border border-hairline bg-panel p-4 shadow-2xs'>
          <div className='flex items-center justify-between text-ink-subtle'>
            <span className='text-xs font-medium'>Total Recipients</span>
            <Users className='h-4 w-4 text-indigo-500' />
          </div>
          <p className='mt-2 text-2xl font-bold text-indigo-600 tabular-nums'>
            {stats.totalRecipients.toLocaleString()}
          </p>
          <p className='text-[11px] text-ink-subtle mt-0.5'>Inbox messages generated</p>
        </div>

        <div className='rounded-xl border border-hairline bg-panel p-4 shadow-2xs'>
          <div className='flex items-center justify-between text-ink-subtle'>
            <span className='text-xs font-medium'>Emails Delivered</span>
            <CheckCircle2 className='h-4 w-4 text-emerald-500' />
          </div>
          <p className='mt-2 text-2xl font-bold text-emerald-600 tabular-nums'>
            {stats.sentEmailCount.toLocaleString()}
          </p>
          <p className='text-[11px] text-ink-subtle mt-0.5'>Confirmed provider deliveries</p>
        </div>

        <div className='rounded-xl border border-hairline bg-panel p-4 shadow-2xs'>
          <div className='flex items-center justify-between text-ink-subtle'>
            <span className='text-xs font-medium'>Emails Failed</span>
            <XCircle className='h-4 w-4 text-rose-500' />
          </div>
          <p className='mt-2 text-2xl font-bold text-rose-600 tabular-nums'>
            {stats.failedEmailCount.toLocaleString()}
          </p>
          <p className='text-[11px] text-ink-subtle mt-0.5'>Delivery or provider errors</p>
        </div>
      </div>

      {/* Composer Panel */}
      <Panel className='overflow-hidden shadow-2xs'>
        <div className='flex items-center justify-between border-b border-hairline bg-panel-subtle px-4 py-3'>
          <div className='flex items-center gap-2'>
            <Send className='h-4 w-4 text-primary-600' />
            <h2 className='text-sm font-semibold text-ink'>Compose New Message</h2>
          </div>
          <button
            type='button'
            onClick={() => setComposerOpen((v) => !v)}
            className='inline-flex items-center gap-1 text-xs text-ink-muted hover:text-ink transition-colors'
          >
            <span>{composerOpen ? 'Collapse' : 'Expand'}</span>
            {composerOpen ? <ChevronUp className='h-3.5 w-3.5' /> : <ChevronDown className='h-3.5 w-3.5' />}
          </button>
        </div>

        {composerOpen && (
          <form onSubmit={handleSendBroadcast} className='p-4 space-y-4'>
            <div>
              <div className='flex items-center justify-between text-xs font-medium text-ink mb-1.5'>
                <label htmlFor='broadcast-title'>Subject / Title</label>
                <span className='text-[11px] text-ink-subtle'>{title.length}/200</span>
              </div>
              <input
                id='broadcast-title'
                type='text'
                maxLength={200}
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder='e.g., Important: FIRS Annual Return Filing Deadline'
                className='w-full rounded-lg border border-hairline bg-panel px-3 py-2 text-xs text-ink placeholder:text-ink-subtle focus:border-primary-500 focus:outline-none'
              />
            </div>

            <div>
              <div className='flex items-center justify-between text-xs font-medium text-ink mb-1.5'>
                <label htmlFor='broadcast-body'>Message Body</label>
                <span className='text-[11px] text-ink-subtle'>{body.length}/5000</span>
              </div>
              <textarea
                id='broadcast-body'
                rows={4}
                maxLength={5000}
                required
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder='Enter announcement body text. Markdown or clear paragraphs are recommended.'
                className='w-full rounded-lg border border-hairline bg-panel px-3 py-2 text-xs text-ink placeholder:text-ink-subtle focus:border-primary-500 focus:outline-none'
              />
            </div>

            {/* Audience Radios */}
            <div className='rounded-lg border border-hairline bg-panel-subtle p-3 space-y-3'>
              <span className='text-xs font-semibold text-ink block'>Audience Target</span>
              <div className='flex flex-wrap items-center gap-6'>
                <label className='flex items-center gap-2 cursor-pointer text-xs text-ink'>
                  <input
                    type='radio'
                    name='audienceType'
                    checked={audienceType === 'all'}
                    onChange={() => {
                      setAudienceType('all');
                      setSelectedUser(null);
                    }}
                    className='accent-primary-600'
                  />
                  <span className='font-medium'>All Active Users (Bulk)</span>
                </label>

                <label className='flex items-center gap-2 cursor-pointer text-xs text-ink'>
                  <input
                    type='radio'
                    name='audienceType'
                    checked={audienceType === 'user'}
                    onChange={() => setAudienceType('user')}
                    className='accent-primary-600'
                  />
                  <span className='font-medium'>Single User (Direct)</span>
                </label>
              </div>

              {/* Single User Picker */}
              {audienceType === 'user' && (
                <div className='mt-3 space-y-2 pt-2 border-t border-hairline'>
                  <label htmlFor='user-picker-search' className='text-xs font-medium text-ink block'>
                    Find Target User by Email or Name
                  </label>

                  {selectedUser ? (
                    <div className='flex items-center justify-between rounded-lg border border-primary-300 bg-primary-50/50 px-3 py-2 text-xs'>
                      <div className='flex items-center gap-2'>
                        <User className='h-4 w-4 text-primary-600' />
                        <div>
                          <p className='font-semibold text-ink'>{selectedUser.email}</p>
                          {selectedUser.fullName && (
                            <p className='text-[10px] text-ink-muted'>{selectedUser.fullName}</p>
                          )}
                        </div>
                      </div>
                      <button
                        type='button'
                        onClick={() => setSelectedUser(null)}
                        className='p-1 rounded hover:bg-primary-100 text-ink-subtle hover:text-ink transition-colors'
                      >
                        <X className='h-3.5 w-3.5' />
                      </button>
                    </div>
                  ) : (
                    <div className='relative'>
                      <Search className='absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-ink-subtle' />
                      <input
                        id='user-picker-search'
                        type='text'
                        value={userSearchQuery}
                        onChange={(e) => setUserSearchQuery(e.target.value)}
                        placeholder='Type user email to search...'
                        className='w-full rounded-lg border border-hairline bg-panel pl-9 pr-3 py-2 text-xs text-ink placeholder:text-ink-subtle focus:border-primary-500 focus:outline-none'
                      />

                      {searchingUsers && (
                        <div className='absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-ink-subtle'>
                          Searching...
                        </div>
                      )}

                      {/* Dropdown Results */}
                      {userSearchResults.length > 0 && (
                        <div className='absolute z-20 left-0 right-0 mt-1 max-h-48 overflow-y-auto rounded-lg border border-hairline bg-panel shadow-md divide-y divide-hairline'>
                          {userSearchResults.map((u) => (
                            <button
                              key={u.id}
                              type='button'
                              onClick={() => {
                                setSelectedUser(u);
                                setUserSearchResults([]);
                                setUserSearchQuery('');
                              }}
                              className='w-full px-3 py-2 text-left text-xs hover:bg-panel-subtle flex items-center justify-between transition-colors'
                            >
                              <div>
                                <p className='font-semibold text-ink'>{u.email}</p>
                                {u.fullName && (
                                  <p className='text-[10px] text-ink-subtle'>{u.fullName}</p>
                                )}
                              </div>
                              <span className='text-[10px] text-ink-muted'>
                                {u.businessCount} {u.businessCount === 1 ? 'business' : 'businesses'}
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className='flex items-center justify-end gap-2 pt-2'>
              <button
                type='submit'
                disabled={!canSubmit}
                className='inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-4 py-2 text-xs font-semibold text-white shadow-2xs hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors'
              >
                <Send className='h-3.5 w-3.5' />
                <span>{sending ? 'Sending...' : 'Send Broadcast'}</span>
              </button>
            </div>
          </form>
        )}
      </Panel>

      {/* Filter Tabs & Search */}
      <div className='flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-hairline pb-4'>
        <div className='flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0'>
          {(
            [
              { id: 'all', label: 'All Messages' },
              { id: 'bulk', label: 'Bulk Only' },
              { id: 'direct', label: 'Direct Only' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
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
            onChange={(e) => setSearch(e.target.value)}
            placeholder='Search title or body...'
            className='w-full rounded-lg border border-hairline bg-panel pl-9 pr-3 py-1.5 text-xs text-ink placeholder:text-ink-subtle focus:border-primary-500 focus:outline-none'
          />
        </div>
      </div>

      {/* Broadcasts History Table */}
      <Panel className='overflow-hidden shadow-2xs'>
        {loading && !hasLoadedOnce ? (
          <div className='p-8 text-center text-xs text-ink-muted'>Loading broadcasts...</div>
        ) : displayedBroadcasts.length === 0 ? (
          <PanelEmpty
            icon={Megaphone}
            title='No broadcasts found'
            hint='Compose your first message above to announce news, updates, or contact individual users.'
          />
        ) : (
          <div className={`overflow-x-auto transition-opacity ${isPageLoading ? 'opacity-60 pointer-events-none' : 'opacity-100'}`} aria-busy={isPageLoading}>
            <table className='w-full text-left border-collapse text-xs'>
              <thead>
                <tr className='border-b border-hairline bg-panel-subtle text-[11px] font-semibold text-ink-muted uppercase tracking-wider'>
                  <th className='py-2.5 px-3'>Subject / Title</th>
                  <th className='py-2.5 px-3'>Audience</th>
                  <th className='py-2.5 px-3 text-right'>Recipients</th>
                  <th className='py-2.5 px-3 text-center'>Email Delivery</th>
                  <th className='py-2.5 px-3'>Created</th>
                  <th className='py-2.5 px-3 text-right'>Action</th>
                </tr>
              </thead>
              <tbody className='divide-y divide-hairline'>
                {displayedBroadcasts.map((b) => (
                  <tr key={b.id} className='hover:bg-panel-subtle/50 transition-colors'>
                    <td className='py-3 px-3 max-w-xs'>
                      <p className='font-semibold text-ink truncate'>{b.title}</p>
                      <p className='text-[11px] text-ink-muted truncate mt-0.5'>{b.body}</p>
                    </td>

                    <td className='py-3 px-3'>
                      {b.audienceType === 'all' ? (
                        <StatusPill tone='info'>All Users</StatusPill>
                      ) : (
                        <StatusPill tone='neutral'>Direct User</StatusPill>
                      )}
                    </td>

                    <td className='py-3 px-3 text-right tabular-nums font-medium text-ink'>
                      {b.totalRecipients.toLocaleString()}
                    </td>

                    <td className='py-3 px-3 text-center'>
                      <div className='inline-flex items-center gap-1.5 text-[11px] tabular-nums'>
                        <span className='text-emerald-600 font-medium'>{b.sentEmailCount} sent</span>
                        <span className='text-ink-subtle'>/</span>
                        <span className={b.failedEmailCount > 0 ? 'text-rose-600 font-medium' : 'text-ink-subtle'}>
                          {b.failedEmailCount} failed
                        </span>
                      </div>
                    </td>

                    <td className='py-3 px-3 text-ink-muted whitespace-nowrap text-[11px]'>
                      {formatStamp(b.createdAt)}
                    </td>

                    <td className='py-3 px-3 text-right whitespace-nowrap'>
                      <button
                        type='button'
                        onClick={() => handleInspect(b)}
                        className='inline-flex items-center gap-1 rounded border border-hairline bg-panel px-2.5 py-1 text-[11px] font-medium text-ink hover:bg-panel-subtle transition-colors'
                      >
                        <Eye className='h-3 w-3 text-ink-subtle' />
                        <span>View</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <PaginationBar
          pagination={pagination}
          onPageChange={handlePageChange}
          noun='broadcasts'
          isLoading={isPageLoading}
          pendingPage={pendingPage}
        />
      </Panel>

      {/* Broadcast Detail Inspector Modal */}
      {detailModalOpen && inspectingBroadcast && (
        <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4'>
          <div className='relative w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-xl border border-hairline bg-panel p-6 shadow-xl'>
            <button
              type='button'
              onClick={() => setDetailModalOpen(false)}
              className='absolute top-4 right-4 p-1 rounded-lg text-ink-subtle hover:bg-panel-subtle hover:text-ink transition-colors'
            >
              <X className='h-4 w-4' />
            </button>

            <div className='flex items-center gap-2 mb-4'>
              <Megaphone className='h-5 w-5 text-primary-600' />
              <h3 className='text-base font-bold text-ink'>Broadcast Details</h3>
            </div>

            <div className='space-y-4 text-xs'>
              <div className='rounded-lg bg-panel-subtle p-3 border border-hairline space-y-1.5'>
                <p className='text-[11px] text-ink-muted uppercase font-semibold tracking-wider'>
                  Subject
                </p>
                <p className='text-sm font-bold text-ink'>{inspectingBroadcast.title}</p>
                <div className='flex flex-wrap items-center gap-2 pt-1 text-[11px] text-ink-subtle'>
                  <span>Target: {inspectingBroadcast.audienceType === 'all' ? 'All Active Users' : 'Single User'}</span>
                  <span>•</span>
                  <span>Sent: {formatStamp(inspectingBroadcast.createdAt)}</span>
                  <span>•</span>
                  <span>Recipients: {inspectingBroadcast.totalRecipients}</span>
                </div>
              </div>

              <div>
                <p className='text-[11px] font-semibold text-ink-muted uppercase tracking-wider mb-1'>
                  Message Content
                </p>
                <div className='p-3 rounded-lg border border-hairline bg-panel text-ink whitespace-pre-wrap leading-relaxed'>
                  {inspectingBroadcast.body}
                </div>
              </div>

              {/* Delivery logs — senior fix: shows ALL recipients with email + inbox status */}
              <div>
                <div className='flex items-center justify-between mb-2'>
                  <p className='text-[11px] font-semibold text-ink-muted uppercase tracking-wider'>
                    Recipient Deliveries ({(inspectingBroadcast as any).deliveryStats?.total ?? inspectingBroadcast.messages?.length ?? 0}
                    {(inspectingBroadcast as any).messagesPagination ? ` · page ${(inspectingBroadcast as any).messagesPagination.page} of ${(inspectingBroadcast as any).messagesPagination.totalPages}` : ''})
                  </p>
                  {(inspectingBroadcast as any).deliveryStats && (
                    <span className='text-[10px] text-ink-subtle'>
                      {(inspectingBroadcast as any).deliveryStats.read} read · {(inspectingBroadcast as any).deliveryStats.unread} unread
                    </span>
                  )}
                </div>

                {(inspectingBroadcast as any).deliveryStats && (
                  <div className='mb-2 flex flex-wrap gap-1.5'>
                    <span className='rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[10px] font-semibold text-emerald-700'>Sent {(inspectingBroadcast as any).deliveryStats.sent}</span>
                    <span className='rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-[10px] font-semibold text-amber-700'>Skipped {(inspectingBroadcast as any).deliveryStats.skipped}</span>
                    <span className='rounded-full bg-rose-50 border border-rose-200 px-2 py-0.5 text-[10px] font-semibold text-rose-700'>Failed {(inspectingBroadcast as any).deliveryStats.failed}</span>
                    {(inspectingBroadcast as any).deliveryStats.pending > 0 && (
                      <span className='rounded-full bg-gray-50 border border-hairline px-2 py-0.5 text-[10px] font-semibold text-ink-muted'>Pending {(inspectingBroadcast as any).deliveryStats.pending}</span>
                    )}
                  </div>
                )}

                {loadingDetail ? (
                  <p className='text-ink-muted'>Loading recipient deliveries...</p>
                ) : inspectingBroadcast.messages && inspectingBroadcast.messages.length > 0 ? (
                  <>
                    <div className='max-h-64 overflow-y-auto rounded-lg border border-hairline divide-y divide-hairline'>
                      {inspectingBroadcast.messages.map((m: any) => (
                        <div key={m.id} className='px-3 py-2 flex flex-col gap-0.5'>
                          <div className='flex items-center justify-between gap-2'>
                            <div className='flex items-center gap-2 min-w-0'>
                              <Mail className='h-3.5 w-3.5 shrink-0 text-ink-subtle' />
                              <span className='font-medium text-ink truncate text-xs'>{m.user?.email || m.userId}</span>
                            </div>
                            <div className='flex items-center gap-2 shrink-0'>
                              <span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded border ${
                                m.emailStatus === 'sent' ? 'text-emerald-700 bg-emerald-50 border-emerald-200' :
                                m.emailStatus === 'failed' ? 'text-rose-700 bg-rose-50 border-rose-200' :
                                m.emailStatus === 'skipped' ? 'text-amber-700 bg-amber-50 border-amber-200' :
                                'text-ink-muted bg-gray-50 border-hairline'
                              }`}>
                                {m.emailStatus}
                              </span>
                              <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${m.isRead ? 'bg-primary-50 text-primary-700 border border-primary-200' : 'bg-gray-50 text-ink-subtle border border-hairline'}`}>
                                {m.isRead ? 'Read' : 'Unread'}
                              </span>
                            </div>
                          </div>
                          {m.emailError && (
                            <p className='text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-0.5 ml-5 truncate' title={m.emailError}>{m.emailError}</p>
                          )}
                        </div>
                      ))}
                    </div>
                    {(inspectingBroadcast as any).messagesPagination && (inspectingBroadcast as any).messagesPagination.totalPages > 1 && (
                      <div className='mt-3 flex items-center justify-between'>
                        <span className='text-[11px] text-ink-subtle'>
                          Page {detailPage} of {(inspectingBroadcast as any).messagesPagination.totalPages} · {(inspectingBroadcast as any).messagesPagination.total} recipients
                        </span>
                        <div className='flex gap-1.5'>
                          <button
                            type='button'
                            disabled={detailPage <= 1 || loadingDetail}
                            onClick={() => handleDetailPageChange(detailPage - 1)}
                            className='rounded border border-hairline bg-panel px-2.5 py-1 text-xs font-semibold disabled:opacity-40'
                          >
                            Previous
                          </button>
                          <button
                            type='button'
                            disabled={(inspectingBroadcast as any).messagesPagination && detailPage >= (inspectingBroadcast as any).messagesPagination.totalPages || loadingDetail}
                            onClick={() => handleDetailPageChange(detailPage + 1)}
                            className='rounded border border-hairline bg-panel px-2.5 py-1 text-xs font-semibold disabled:opacity-40'
                          >
                            Next
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <p className='text-ink-subtle'>No delivery rows available.</p>
                )}
              </div>
            </div>

            <div className='mt-6 flex justify-end'>
              <button
                type='button'
                onClick={() => setDetailModalOpen(false)}
                className='rounded-lg border border-hairline bg-panel px-4 py-2 text-xs font-semibold text-ink hover:bg-panel-subtle transition-colors'
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
