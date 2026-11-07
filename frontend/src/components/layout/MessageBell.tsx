import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, CheckCheck } from 'lucide-react';
import { useMessageStore } from '@/stores/message.store.ts';
import type { UserMessage } from '@/types/index.ts';

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '';
  const diffMs = Date.now() - then;
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return new Date(iso).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' });
}

export default function MessageBell() {
  const navigate = useNavigate();

  const messages = useMessageStore((s) => s.messages);
  const unreadCount = useMessageStore((s) => s.unreadCount);
  const loading = useMessageStore((s) => s.loading);
  const lastFetchedAt = useMessageStore((s) => s.lastFetchedAt);
  const fetch = useMessageStore((s) => s.fetch);
  const fetchUnreadCount = useMessageStore((s) => s.fetchUnreadCount);
  const markRead = useMessageStore((s) => s.markRead);
  const markAllRead = useMessageStore((s) => s.markAllRead);

  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  // Fetch count on mount
  useEffect(() => {
    fetchUnreadCount();
  }, [fetchUnreadCount]);

  // On-open refresh: if stale (older than 60s) or empty, refetch
  useEffect(() => {
    if (!open) return;
    const stale = !lastFetchedAt || Date.now() - lastFetchedAt > 60_000;
    if (stale || messages.length === 0) {
      fetch({ page: 1, limit: 5 });
      fetchUnreadCount();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Outside-click + Escape to close
  useEffect(() => {
    if (!open) return;

    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node | null;
      if (!t) return;
      if (panelRef.current?.contains(t)) return;
      if (buttonRef.current?.contains(t)) return;
      setOpen(false);
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const handleMessageClick = async (m: UserMessage) => {
    if (!m.isRead) {
      await markRead(m.id);
    }
    setOpen(false);
    navigate('/messages');
  };

  const handleMarkAll = async () => {
    await markAllRead();
  };

  const handleViewAll = () => {
    setOpen(false);
    navigate('/messages');
  };

  const badge = unreadCount > 0 ? (unreadCount > 9 ? '9+' : String(unreadCount)) : null;

  return (
    <div className='relative'>
      <button
        ref={buttonRef}
        type='button'
        onClick={() => setOpen((v) => !v)}
        aria-label='View inbox messages'
        aria-haspopup='menu'
        aria-expanded={open}
        aria-controls='message-bell-panel'
        className='relative flex h-9 w-9 items-center justify-center rounded-md border border-gray-200 bg-white hover:bg-gray-50 transition-all'
      >
        <Mail className='h-4 w-4 text-gray-500' />
        {badge && (
          <span
            aria-label={`${unreadCount} unread messages`}
            className='absolute -top-1 -right-1 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-primary-600 px-1 text-[10px] font-semibold text-white ring-2 ring-white'
          >
            {badge}
          </span>
        )}
      </button>

      {open && (
        <div
          ref={panelRef}
          id='message-bell-panel'
          role='menu'
          className='absolute right-0 mt-2 z-50 w-80 sm:w-96 rounded-xl border border-gray-200 bg-white shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-100'
        >
          {/* Header */}
          <div className='flex items-center justify-between border-b border-gray-100 bg-gray-50/70 px-4 py-2.5'>
            <div className='flex items-center gap-2'>
              <span className='text-xs font-semibold text-gray-900'>Inbox</span>
              {unreadCount > 0 && (
                <span className='rounded-full bg-primary-100 px-2 py-0.5 text-[10px] font-bold text-primary-700'>
                  {unreadCount} new
                </span>
              )}
            </div>

            {unreadCount > 0 && (
              <button
                type='button'
                onClick={handleMarkAll}
                className='inline-flex items-center gap-1 text-[11px] font-medium text-primary-600 hover:text-primary-700'
              >
                <CheckCheck className='h-3.5 w-3.5' />
                <span>Mark all read</span>
              </button>
            )}
          </div>

          {/* List Content */}
          <div className='max-h-80 overflow-y-auto divide-y divide-gray-100'>
            {loading && messages.length === 0 ? (
              <div className='p-6 text-center text-xs text-gray-400'>Loading messages...</div>
            ) : messages.length === 0 ? (
              <div className='p-8 text-center'>
                <Mail className='mx-auto mb-2 h-7 w-7 text-gray-300' />
                <p className='text-xs font-semibold text-gray-700'>No messages</p>
                <p className='text-[11px] text-gray-400 mt-0.5'>
                  Platform announcements from WallX will appear here.
                </p>
              </div>
            ) : (
              messages.slice(0, 5).map((m) => (
                <button
                  key={m.id}
                  type='button'
                  onClick={() => handleMessageClick(m)}
                  className={`w-full px-4 py-3 text-left transition-colors flex items-start gap-2.5 hover:bg-gray-50 ${
                    !m.isRead ? 'bg-primary-50/30' : ''
                  }`}
                >
                  <span
                    className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                      !m.isRead ? 'bg-primary-600' : 'bg-transparent'
                    }`}
                    aria-hidden='true'
                  />
                  <div className='min-w-0 flex-1'>
                    <div className='flex items-center justify-between gap-1'>
                      <p
                        className={`text-xs truncate ${
                          !m.isRead ? 'font-bold text-gray-900' : 'font-medium text-gray-700'
                        }`}
                      >
                        {m.title}
                      </p>
                      <span className='text-[10px] text-gray-400 shrink-0'>
                        {formatRelative(m.createdAt)}
                      </span>
                    </div>
                    <p className='text-[11px] text-gray-500 line-clamp-2 mt-0.5 leading-snug'>
                      {m.body}
                    </p>
                  </div>
                </button>
              ))
            )}
          </div>

          {/* Footer */}
          <div className='border-t border-gray-100 bg-gray-50/50 p-2 text-center'>
            <button
              type='button'
              onClick={handleViewAll}
              className='text-xs font-semibold text-primary-600 hover:text-primary-700 transition-colors py-1'
            >
              View all messages &rarr;
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
