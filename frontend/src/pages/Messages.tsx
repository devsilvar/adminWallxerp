import { useEffect, useState, useMemo, useCallback } from 'react';
import {
  Search,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  Inbox,
  MailOpen,
  ArrowLeft,
  Copy,
  Check,
  RefreshCw,
  X,
  Printer,
  ArrowUpRight,
  ShieldCheck,
  Clock,
  Building2,
  Send,
  Hash,
  Tag,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useMessageStore } from '@/stores/message.store.ts';
import { useAuthStore } from '@/stores/auth.store.ts';
import { useBusinessStore } from '@/stores/business.store.ts';
import Button from '@/components/ui/Button.tsx';
import { Skeleton } from '@/components/ui/Skeleton.tsx';
import type { UserMessage } from '@/types/index.ts';

type FilterTab = 'all' | 'unread';

interface MessageCategory {
  label: string;
  badgeClass: string;
  dotClass: string;
}

/**
 * Intelligent categorization tags for the list view and detail view.
 */
function getMessageCategory(title: string, body: string): MessageCategory {
  const text = `${title} ${body}`.toLowerCase();

  if (text.includes('tax') || text.includes('vat') || text.includes('firs') || text.includes('cit') || text.includes('remit')) {
    return {
      label: 'Tax',
      badgeClass: 'bg-amber-50 text-amber-800 border-amber-200/80',
      dotClass: 'bg-amber-500',
    };
  }

  if (text.includes('settlement') || text.includes('payout') || text.includes('wallet') || text.includes('transfer') || text.includes('bank') || text.includes('withdraw')) {
    return {
      label: 'Treasury',
      badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200/80',
      dotClass: 'bg-emerald-500',
    };
  }

  if (text.includes('security') || text.includes('pin') || text.includes('password') || text.includes('login') || text.includes('bvn') || text.includes('verification')) {
    return {
      label: 'Security',
      badgeClass: 'bg-purple-50 text-purple-800 border-purple-200/80',
      dotClass: 'bg-purple-500',
    };
  }

  if (text.includes('invoice') || text.includes('debtor') || text.includes('credit') || text.includes('receipt') || text.includes('billing')) {
    return {
      label: 'Billing',
      badgeClass: 'bg-blue-50 text-blue-800 border-blue-200/80',
      dotClass: 'bg-blue-500',
    };
  }

  return {
    label: 'Update',
    badgeClass: 'bg-gray-100 text-gray-700 border-gray-200/80',
    dotClass: 'bg-gray-500',
  };
}

function formatStamp(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-NG', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatShortDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return d.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' });
  } else if (diffDays === 1) {
    return 'Yesterday';
  } else if (diffDays < 7) {
    return d.toLocaleDateString('en-NG', { weekday: 'short' });
  } else {
    return d.toLocaleDateString('en-NG', { day: 'numeric', month: 'short' });
  }
}

/**
 * Editorial formatted text renderer:
 * Clean, breathable paragraph flow with auto-detected links.
 */
function NeatFormattedText({ text }: { text: string }) {
  const paragraphs = useMemo(() => {
    return text.split(/\n\n+/).filter(Boolean);
  }, [text]);

  const renderWithLinks = (line: string) => {
    const urlPattern = /(https?:\/\/[^\s]+)/g;
    const parts = line.split(urlPattern);

    return parts.map((part, idx) => {
      if (part.match(urlPattern)) {
        return (
          <a
            key={idx}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary-700 underline font-medium hover:text-primary-900 transition-colors inline-flex items-center gap-0.5"
          >
            <span>{part}</span>
            <ArrowUpRight className="h-3 w-3 inline" />
          </a>
        );
      }
      return part;
    });
  };

  return (
    <div className="space-y-4 text-gray-800 text-[15px] sm:text-base leading-[1.8] font-normal font-sans">
      {paragraphs.map((p, idx) => (
        <p key={idx} className="whitespace-pre-line">
          {renderWithLinks(p)}
        </p>
      ))}
    </div>
  );
}

export default function Messages() {
  const user = useAuthStore((s) => s.user);
  const biz = useBusinessStore((s) => s.activeBusiness);

  const messages = useMessageStore((s) => s.messages);
  const pagination = useMessageStore((s) => s.pagination);
  const unreadCount = useMessageStore((s) => s.unreadCount);
  const loading = useMessageStore((s) => s.loading);
  const fetch = useMessageStore((s) => s.fetch);
  const fetchUnreadCount = useMessageStore((s) => s.fetchUnreadCount);
  const markRead = useMessageStore((s) => s.markRead);
  const markAllRead = useMessageStore((s) => s.markAllRead);

  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selectedMessage, setSelectedMessage] = useState<UserMessage | null>(null);
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Fetch messages when tab, page, or search changes
  useEffect(() => {
    fetch({
      page,
      limit: 15,
      unread: activeTab === 'unread' ? true : undefined,
      search: debouncedSearch || undefined,
    });
    fetchUnreadCount();
  }, [activeTab, page, debouncedSearch, fetch, fetchUnreadCount]);

  // Auto-select first message on desktop if none selected
  useEffect(() => {
    if (messages.length > 0 && !selectedMessage) {
      setSelectedMessage(messages[0]);
    }
  }, [messages, selectedMessage]);

  const handleSelectMessage = useCallback(async (message: UserMessage) => {
    setSelectedMessage(message);
    setMobileDetailOpen(true);
    if (!message.isRead) {
      await markRead(message.id);
    }
  }, [markRead]);

  const handleMarkAll = async () => {
    await markAllRead();
    toast.success('All messages marked as read');
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await Promise.allSettled([
        fetch({
          page,
          limit: 15,
          unread: activeTab === 'unread' ? true : undefined,
          search: debouncedSearch || undefined,
        }),
        fetchUnreadCount(),
      ]);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleCopyBody = () => {
    if (!selectedMessage) return;
    navigator.clipboard.writeText(`${selectedMessage.title}\n\n${selectedMessage.body}`);
    setCopied(true);
    toast.success('Copied to clipboard');
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePrint = () => {
    window.print();
  };

  // Keyboard navigation: j/k or ArrowDown/ArrowUp
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) return;

      if (e.key === 'ArrowDown' || e.key === 'j') {
        e.preventDefault();
        if (!selectedMessage) {
          if (messages[0]) handleSelectMessage(messages[0]);
          return;
        }
        const currentIndex = messages.findIndex((m) => m.id === selectedMessage.id);
        if (currentIndex < messages.length - 1) {
          handleSelectMessage(messages[currentIndex + 1]);
        }
      } else if (e.key === 'ArrowUp' || e.key === 'k') {
        e.preventDefault();
        if (!selectedMessage) return;
        const currentIndex = messages.findIndex((m) => m.id === selectedMessage.id);
        if (currentIndex > 0) {
          handleSelectMessage(messages[currentIndex - 1]);
        }
      } else if (e.key === 'Escape') {
        setMobileDetailOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [messages, selectedMessage, handleSelectMessage]);

  const selectedCategory = useMemo(() => {
    if (!selectedMessage) return null;
    return getMessageCategory(selectedMessage.title, selectedMessage.body);
  }, [selectedMessage]);

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      {/* ── Page Header ── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-gray-200/80 pb-5">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-gray-900">
              Messages
            </h1>
            {unreadCount > 0 ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-50 px-2.5 py-0.5 text-xs font-semibold text-primary-700 border border-primary-200/80">
                <span className="h-1.5 w-1.5 rounded-full bg-primary-600 animate-pulse" />
                {unreadCount} unread
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700 border border-emerald-200/60">
                <Check className="h-3 w-3 text-emerald-600" />
                All caught up
              </span>
            )}
          </div>
          <p className="text-xs sm:text-sm text-gray-500 mt-1">
            Official announcements, FIRS tax compliance advisories, and system notices
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <Button
            variant="secondary"
            size="sm"
            onClick={handleRefresh}
            isLoading={isRefreshing}
            className="text-xs font-medium border-gray-200"
            title="Refresh messages"
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>

          {unreadCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleMarkAll}
              className="text-xs font-medium text-gray-700 hover:text-gray-900 border-gray-200 hover:bg-gray-50"
            >
              <CheckCheck className="h-3.5 w-3.5 mr-1.5 text-primary-600" />
              Mark all read
            </Button>
          )}
        </div>
      </div>

      {/* ── Main Studio Container (Master-Detail) ── */}
      <div className="rounded-2xl border border-gray-200/80 bg-white shadow-xs overflow-hidden flex flex-col lg:flex-row h-auto lg:h-[720px] xl:h-[760px]">
        {/* ── Left Column: Clean List (Only Tag, Date, Title - No Description) ── */}
        <div
          className={`w-full lg:w-[360px] xl:w-[390px] flex-shrink-0 flex flex-col border-b lg:border-b-0 lg:border-r border-gray-200/80 bg-gray-50/40 ${
            mobileDetailOpen ? 'hidden lg:flex' : 'flex'
          }`}
        >
          {/* Controls Bar: Tabs + Search */}
          <div className="p-3.5 sm:p-4 border-b border-gray-200/80 space-y-3 bg-white">
            {/* Search Input */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search messages..."
                aria-label="Search messages"
                className="w-full rounded-lg border border-gray-200 bg-gray-50/60 pl-9 pr-8 py-1.5 text-xs sm:text-sm text-gray-900 placeholder:text-gray-400 focus:bg-white focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/15 transition-all"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  aria-label="Clear search"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-0.5 cursor-pointer"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Segmented Filter Pills */}
            <div className="flex items-center gap-1.5 bg-gray-100/80 p-1 rounded-lg">
              <button
                type="button"
                onClick={() => {
                  setActiveTab('all');
                  setPage(1);
                }}
                className={`flex-1 flex items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-semibold transition-all cursor-pointer ${
                  activeTab === 'all'
                    ? 'bg-white text-gray-900 shadow-xs'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <span>All Messages</span>
                {pagination?.total !== undefined && pagination.total > 0 && (
                  <span className="text-[10px] text-gray-400 font-mono">
                    ({pagination.total})
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  setActiveTab('unread');
                  setPage(1);
                }}
                aria-label={`Unread ${unreadCount > 0 ? `(${unreadCount})` : ''}`}
                className={`flex-1 flex items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-semibold transition-all cursor-pointer ${
                  activeTab === 'unread'
                    ? 'bg-white text-gray-900 shadow-xs'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <span>Unread</span>
                {unreadCount > 0 && (
                  <span
                    className={`rounded-full px-1.5 py-0.2 text-[10px] font-bold ${
                      activeTab === 'unread'
                        ? 'bg-primary-100 text-primary-800'
                        : 'bg-primary-50 text-primary-700 border border-primary-200/60'
                    }`}
                  >
                    {unreadCount}
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* Scrollable Message List: Tag, Date, Title only */}
          <div className="flex-1 overflow-y-auto divide-y divide-gray-100/80 scrollbar-thin">
            {loading && messages.length === 0 ? (
              <div className="p-4 space-y-3">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="p-3 bg-white rounded-xl border border-gray-100 space-y-2">
                    <div className="flex items-center justify-between">
                      <Skeleton width={60} height={14} rounded="full" />
                      <Skeleton width={40} height={12} />
                    </div>
                    <Skeleton width="90%" height={16} />
                  </div>
                ))}
              </div>
            ) : messages.length === 0 ? (
              <div className="py-16 px-6 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-gray-100/80 text-gray-400 mb-3.5">
                  <Inbox className="h-6 w-6 stroke-[1.75]" />
                </div>
                <h3 className="text-sm font-semibold text-gray-900">
                  {activeTab === 'unread' ? 'No unread messages' : 'Inbox is empty'}
                </h3>
                <p className="text-xs text-gray-500 mt-1 max-w-xs mx-auto leading-relaxed">
                  {debouncedSearch
                    ? 'No messages matched your search query. Try searching with different terms.'
                    : activeTab === 'unread'
                    ? 'You are all caught up! When new notices arrive, they will appear here.'
                    : 'System notices and compliance announcements will be delivered to this inbox.'}
                </p>
                {debouncedSearch && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setSearch('')}
                    className="mt-4 text-xs"
                  >
                    Clear search filter
                  </Button>
                )}
              </div>
            ) : (
              <div>
                {messages.map((m) => {
                  const isSelected = selectedMessage?.id === m.id;
                  const cat = getMessageCategory(m.title, m.body);

                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => handleSelectMessage(m)}
                      className={`w-full text-left px-4 py-3.5 transition-all relative border-l-3 cursor-pointer ${
                        isSelected
                          ? 'bg-white border-primary-600 shadow-xs'
                          : !m.isRead
                          ? 'bg-primary-50/25 hover:bg-white border-primary-400/80'
                          : 'bg-transparent hover:bg-white/80 border-transparent'
                      }`}
                    >
                      {/* Top Row: Tag (e.g. Update) & Date (e.g. Sun) */}
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${cat.badgeClass}`}
                        >
                          <span className={`h-1.5 w-1.5 rounded-full ${cat.dotClass}`} />
                          {cat.label}
                        </span>

                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] text-gray-400 font-medium whitespace-nowrap">
                            {formatShortDate(m.createdAt)}
                          </span>
                          {!m.isRead && (
                            <span
                              className="h-2 w-2 rounded-full bg-primary-600 ring-2 ring-primary-100"
                              title="Unread message"
                            />
                          )}
                        </div>
                      </div>

                      {/* Main Title Only (Description snippet omitted per instructions) */}
                      <h3
                        className={`text-xs sm:text-sm line-clamp-2 leading-snug ${
                          !m.isRead ? 'font-bold text-gray-950' : 'font-medium text-gray-800'
                        }`}
                      >
                        {m.title}
                      </h3>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* List Footer: Compact Pagination */}
          {pagination && pagination.totalPages > 1 && (
            <div className="p-3 border-t border-gray-200/80 bg-white flex items-center justify-between text-xs text-gray-500">
              <span className="text-[11px] font-medium text-gray-600">
                Page {pagination.page} of {pagination.totalPages}
              </span>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={!pagination.hasPrev}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="p-1 rounded-md hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-gray-600 cursor-pointer"
                  aria-label="Previous page"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>

                <button
                  type="button"
                  disabled={!pagination.hasNext}
                  onClick={() => setPage((p) => p + 1)}
                  className="p-1 rounded-md hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-gray-600 cursor-pointer"
                  aria-label="Next page"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── Right Column: Informative, Unboxed, Editorial Reading Canvas ── */}
        <div
          className={`flex-1 flex flex-col bg-white overflow-hidden ${
            !mobileDetailOpen ? 'hidden lg:flex' : 'flex'
          }`}
        >
          {selectedMessage ? (
            <div className="flex-1 flex flex-col h-full overflow-hidden">
              {/* Minimal Top Control Bar */}
              <div className="flex items-center justify-between px-6 sm:px-10 py-3.5 border-b border-gray-100 bg-white">
                {/* Mobile Back Button */}
                <button
                  type="button"
                  onClick={() => setMobileDetailOpen(false)}
                  className="lg:hidden inline-flex items-center gap-1.5 text-xs font-semibold text-gray-700 hover:text-gray-900 cursor-pointer"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  <span>Back to inbox</span>
                </button>

                {/* Desktop Source Pill */}
                <div className="hidden lg:flex items-center gap-2 text-xs text-gray-500">
                  <ShieldCheck className="h-4 w-4 text-emerald-600" />
                  <span className="font-semibold text-gray-900">WallX Official Dispatch</span>
                  <span className="text-gray-300">·</span>
                  <span className="text-gray-500">Direct In-App Notification</span>
                </div>

                {/* Right Utility Buttons (Copy & Print) */}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleCopyBody}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-600 hover:text-gray-900 py-1.5 px-2.5 rounded-md hover:bg-gray-50 border border-gray-200/80 transition-all cursor-pointer shadow-2xs"
                    title="Copy message content"
                  >
                    {copied ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-emerald-600" />
                        <span className="text-emerald-700 font-semibold">Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5 text-gray-400" />
                        <span>Copy</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={handlePrint}
                    className="hidden sm:inline-flex items-center gap-1.5 text-xs font-medium text-gray-600 hover:text-gray-900 py-1.5 px-2.5 rounded-md hover:bg-gray-50 border border-gray-200/80 transition-all cursor-pointer shadow-2xs"
                    title="Print advisory"
                  >
                    <Printer className="h-3.5 w-3.5 text-gray-400" />
                    <span>Print</span>
                  </button>
                </div>
              </div>

              {/* Distraction-Free Reading Canvas With Rich Details (No Ugly Boxes) */}
              <div className="flex-1 overflow-y-auto px-6 sm:px-12 lg:px-16 py-8 sm:py-10 scrollbar-thin">
                <article className="max-w-2xl mx-auto space-y-6">
                  {/* Subject Headline */}
                  <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-gray-950 font-sans leading-tight">
                    {selectedMessage.title}
                  </h2>

                  {/* Informative Dispatch Metadata Strip (Clean Typography, No Heavy Box) */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2.5 text-xs text-gray-500 pt-1 pb-4">
                    <div className="flex items-center gap-2">
                      <Send className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                      <span className="text-gray-400">From:</span>
                      <span className="font-semibold text-gray-800">
                        WallX Platform & Regulatory Desk
                      </span>
                    </div>

                    <div className="flex items-center gap-2 sm:justify-end">
                      <Clock className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                      <span className="text-gray-400">Sent:</span>
                      <span className="font-medium text-gray-700">
                        {formatStamp(selectedMessage.createdAt)}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <Building2 className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                      <span className="text-gray-400">Recipient:</span>
                      <span className="font-medium text-gray-800 truncate">
                        {biz?.businessName || user?.fullName || 'Active Business Account'}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 sm:justify-end">
                      <Hash className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                      <span className="text-gray-400">Reference:</span>
                      <span className="font-mono text-gray-600">
                        {selectedMessage.broadcastId
                          ? `BC-${selectedMessage.broadcastId.slice(0, 8).toUpperCase()}`
                          : `MSG-${selectedMessage.id.slice(0, 8).toUpperCase()}`}
                      </span>
                    </div>

                    {selectedCategory && (
                      <div className="flex items-center gap-2 sm:col-span-2 pt-1">
                        <Tag className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                        <span className="text-gray-400">Classification:</span>
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${selectedCategory.badgeClass}`}
                        >
                          <span className={`h-1.5 w-1.5 rounded-full ${selectedCategory.dotClass}`} />
                          {selectedCategory.label} Advisory
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Subtle Hairline Divider */}
                  <hr className="border-gray-200/80 my-4" />

                  {/* Neatly Formatted Message Body */}
                  <div className="py-2">
                    <NeatFormattedText text={selectedMessage.body} />
                  </div>

                  {/* Clean Signature / Footnote Line (No Clunky Boxes) */}
                  <div className="pt-8 border-t border-gray-150 mt-10 space-y-2 text-xs text-gray-400">
                    <p className="font-medium text-gray-700">
                      WallX Compliance & Platform Communications
                    </p>
                    <p className="text-[11px] leading-relaxed">
                      This advisory was securely delivered to your registered merchant profile.
                      Transactions, tax filing deadlines, and settlements referenced herein are logged
                      in your authoritative audit trail.
                    </p>
                  </div>
                </article>
              </div>
            </div>
          ) : (
            /* Minimalist Empty State */
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-white">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gray-50 text-gray-300 mb-3 border border-gray-100">
                <MailOpen className="h-6 w-6 stroke-[1.5]" />
              </div>
              <h3 className="text-sm font-semibold text-gray-800">
                No message selected
              </h3>
              <p className="text-xs text-gray-400 max-w-xs mt-1 leading-relaxed">
                Select an item from the list on the left to read its full details.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
