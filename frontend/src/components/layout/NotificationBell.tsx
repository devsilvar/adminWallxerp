import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Bell, Check, Trash2, X, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import Button from '@/components/ui/Button.tsx';
import { useBusinessStore } from '@/stores/business.store.ts';
import { useReminderStore, selectUnreadCount } from '@/stores/reminder.store.ts';
import type { Reminder, ReminderType } from '@/types/index.ts';

/**
 * Top-bar notification center. Owns:
 *   - a bell button with an unread-count badge
 *   - a dropdown listing up to 10 active (unsent) reminders
 *   - an inline modal (ReminderDetailModal) for the full message
 *
 * Data comes from GET /businesses/:id/reminders/active via useReminderStore.
 * No polling — fetch on mount, on active-business change, and on dropdown open
 * (with a 60s cooldown to avoid spamming if the user rapidly toggles).
 */

const TYPE_COLOR: Record<ReminderType, string> = {
  tax_deadline: 'bg-red-100 text-red-700',
  unfiled_tax: 'bg-yellow-100 text-yellow-700',
  unfinalized_report: 'bg-blue-100 text-blue-700',
  unpaid_tax: 'bg-orange-100 text-orange-700',
  margin_warning: 'bg-purple-100 text-purple-700',
  invoice_overdue: 'bg-rose-100 text-rose-700',
  payment_successful: 'bg-emerald-100 text-emerald-700',
  payment_refunded: 'bg-amber-100 text-amber-700',
  dva_received: 'bg-cyan-100 text-cyan-700',
  dva_validation_failed: 'bg-red-100 text-red-700',
  transaction_needs_verification: 'bg-yellow-100 text-yellow-700',
  payout_change_permitted: 'bg-indigo-100 text-indigo-700',
  payout_requested: 'bg-amber-100 text-amber-700',
  payout_approved: 'bg-blue-100 text-blue-700',
  payout_rejected: 'bg-rose-100 text-rose-700',
  payout_completed: 'bg-emerald-100 text-emerald-700',
  payout_failed: 'bg-red-100 text-red-700',
  credit_overdue: 'bg-rose-100 text-rose-700',
  pnl_statement_ready: 'bg-purple-100 text-purple-700',
};

/** Where each reminder type deep-links to. Kept as a map (not a hard-coded
 *  `/tax`) so destinations can diverge per type without touching the modal. */
const ROUTE_FOR_REMINDER: Record<ReminderType, string> = {
  tax_deadline: '/tax',
  unfiled_tax: '/tax',
  unfinalized_report: '/tax',
  unpaid_tax: '/tax',
  margin_warning: '/tax',
  invoice_overdue: '/invoices',
  payment_successful: '/payments',
  payment_refunded: '/payments',
  dva_received: '/sales',
  dva_validation_failed: '/account',
  transaction_needs_verification: '/sales',
  payout_change_permitted: '/account',
  payout_requested: '/account?tab=withdrawals',
  payout_approved: '/account?tab=withdrawals',
  payout_rejected: '/account?tab=withdrawals',
  payout_completed: '/account?tab=withdrawals',
  payout_failed: '/account?tab=withdrawals',
  credit_overdue: '/debtors',
  pnl_statement_ready: '/tax',
};

const ACTION_LABEL_FOR_REMINDER: Record<ReminderType, string> = {
  tax_deadline: 'Go to Tax Reports',
  unfiled_tax: 'Go to Tax Reports',
  unfinalized_report: 'Go to Tax Reports',
  unpaid_tax: 'Go to Tax Reports',
  margin_warning: 'Go to Tax Reports',
  invoice_overdue: 'View Invoices',
  payment_successful: 'View Payments',
  payment_refunded: 'View Payments',
  dva_received: 'View Sales',
  dva_validation_failed: 'View Account',
  transaction_needs_verification: 'Verify Sale',
  payout_change_permitted: 'View Account',
  payout_requested: 'View Withdrawals',
  payout_approved: 'View Withdrawals',
  payout_rejected: 'View Withdrawals',
  payout_completed: 'View Withdrawals',
  payout_failed: 'View Withdrawals',
  credit_overdue: 'View Debtors Book',
  pnl_statement_ready: 'Download P&L Statement',
};

function typeLabel(t: ReminderType) {
  return t.replace(/_/g, ' ');
}

function relativeTime(iso: string): string {
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

function formatScheduled(iso: string): string {
  return new Date(iso).toLocaleDateString('en-NG', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export default function NotificationBell() {
  const navigate = useNavigate();
  const activeBusiness = useBusinessStore((s) => s.activeBusiness);

  const activeReminders = useReminderStore((s) => s.activeReminders);
  const loading = useReminderStore((s) => s.loading);
  const error = useReminderStore((s) => s.error);
  const lastFetchedBusinessId = useReminderStore((s) => s.lastFetchedBusinessId);
  const lastFetchedAt = useReminderStore((s) => s.lastFetchedAt);
  const fetchActive = useReminderStore((s) => s.fetchActive);
  const dismiss = useReminderStore((s) => s.dismiss);
  const unreadCount = useReminderStore(selectUnreadCount);

  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Reminder | null>(null);

  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  // Fetch when the active business changes (incl. first mount).
  useEffect(() => {
    if (!activeBusiness) return;
    fetchActive(activeBusiness.id);
  }, [activeBusiness?.id, fetchActive]);

  // On-open refresh: if stale (different business or older than 60s), refetch.
  useEffect(() => {
    if (!open || !activeBusiness) return;
    const stale =
      lastFetchedBusinessId !== activeBusiness.id ||
      !lastFetchedAt ||
      Date.now() - lastFetchedAt > 60_000;
    if (stale) fetchActive(activeBusiness.id);
    // We intentionally don't depend on lastFetched* — we want this to run
    // once per "open" transition, not every time those stamps change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Outside-click + Escape to close the dropdown.
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

  const handleSelect = (r: Reminder) => {
    setSelected(r);
    setOpen(false);
  };

  const handleDismiss = async (r: Reminder) => {
    if (!activeBusiness) return;
    setSelected(null);
    await dismiss(activeBusiness.id, r.id);
    toast.success('Reminder dismissed');
  };

  const handleNavigate = (r: Reminder) => {
    setSelected(null);
    setOpen(false);
    // Prefer per-entity deep-link when the reminder carries a reference
    // (e.g. invoice_overdue → /invoices/:id). Fallback to the type map
    // and finally to /dashboard for unknown future types.
    if (r.referenceType === 'invoice' && r.referenceId) {
      navigate(`/invoices/${r.referenceId}`);
      return;
    }
    if (r.referenceType === 'customer_credit' && r.referenceId) {
      navigate(`/debtors/${r.referenceId}`);
      return;
    }
    if (r.referenceType === 'payment' && r.referenceId) {
      navigate('/payments');
      return;
    }
    navigate(ROUTE_FOR_REMINDER[r.reminderType] ?? '/dashboard');
  };

  const handleRetry = () => {
    if (activeBusiness) fetchActive(activeBusiness.id);
  };

  const handleViewAll = () => {
    setOpen(false);
    navigate('/reminders');
  };

  const badge = unreadCount > 0 ? (unreadCount > 9 ? '9+' : String(unreadCount)) : null;

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="View notifications"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls="notification-panel"
        className="relative flex h-9 w-9 items-center justify-center rounded-md border border-gray-200 bg-white hover:bg-gray-50 transition-all"
      >
        <Bell className="h-4 w-4 text-gray-500" />
        {badge && (
          <span
            aria-label={`${unreadCount} unread notifications`}
            className="absolute -top-1 -right-1 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white ring-2 ring-white"
          >
            {badge}
          </span>
        )}
      </button>

      {open && (
        <div
          id="notification-panel"
          ref={panelRef}
          role="menu"
          className="absolute right-0 mt-2 w-80 sm:w-96 rounded-none border border-gray-300 bg-white shadow-2xl z-40"
        >
          <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 bg-gray-50/50">
            <h3 className="text-sm font-semibold text-gray-900">Notifications</h3>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close notifications"
              className="rounded-none border border-transparent p-1 text-gray-400 hover:border-gray-300 hover:bg-gray-100 hover:text-gray-700 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="max-h-96 overflow-y-auto">
            {loading && activeReminders.length === 0 ? (
              <div className="py-10 text-center text-xs text-gray-400">Loading...</div>
            ) : error && activeReminders.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-8 px-4 text-center">
                <AlertCircle className="h-6 w-6 text-gray-300" />
                <p className="text-xs text-gray-500">Couldn't load reminders</p>
                <button
                  type="button"
                  onClick={handleRetry}
                  className="text-xs font-medium text-primary-600 hover:text-primary-700"
                >
                  Retry
                </button>
              </div>
            ) : activeReminders.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-10 text-center">
                <Bell className="h-6 w-6 text-gray-300" />
                <p className="text-xs text-gray-400">You're all caught up!</p>
              </div>
            ) : (
              <ul className="divide-y divide-gray-100">
                {activeReminders.slice(0, 10).map((r) => (
                  <li key={r.id}>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => handleSelect(r)}
                      className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-gray-50 ${
                        !r.isSent ? 'bg-primary-50/30' : ''
                      }`}
                    >
                      <span
                        className={`mt-0.5 inline-flex shrink-0 items-center rounded-none px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider ${
                          TYPE_COLOR[r.reminderType] ?? 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {typeLabel(r.reminderType)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-2 text-xs text-gray-700">{r.message}</p>
                        <p className="mt-1 text-[11px] text-gray-400">{relativeTime(r.createdAt)}</p>
                      </div>
                      {!r.isSent && (
                        <span
                          aria-label="Unread"
                          className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-none bg-primary-600"
                        />
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="border-t border-gray-200 bg-gray-50/50 px-4 py-2 text-center">
            <button
              type="button"
              onClick={handleViewAll}
              className="text-xs font-medium text-gray-700 hover:text-gray-900"
            >
              View all reminders
            </button>
          </div>
        </div>
      )}

      {selected && (
        <ReminderDetailModal
          reminder={selected}
          onClose={() => setSelected(null)}
          onDismiss={handleDismiss}
          onNavigate={handleNavigate}
        />
      )}
    </div>
  );
}

// ─── Inline detail modal ─────────────────────────────────────

interface ReminderDetailModalProps {
  reminder: Reminder;
  onClose: () => void;
  onDismiss: (r: Reminder) => void;
  onNavigate: (r: Reminder) => void;
}

function ReminderDetailModal({ reminder, onClose, onDismiss, onNavigate }: ReminderDetailModalProps) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const activeBusiness = useBusinessStore((s) => s.activeBusiness);
  const markRead = useReminderStore((s) => s.markRead);
  const firedRef = useRef(false);

  // Auto mark-as-read on open. Guarded against StrictMode double-invoke
  // and against re-running if the reminder prop stays the same.
  useEffect(() => {
    if (firedRef.current) return;
    if (reminder.isSent) return;
    if (!activeBusiness) return;
    firedRef.current = true;
    // Fire-and-forget; store handles error/revert + toast.
    markRead(activeBusiness.id, reminder.id);
  }, [reminder.id, reminder.isSent, activeBusiness?.id, markRead]);

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] w-screen h-screen min-h-screen flex items-center justify-center p-3 sm:p-4 bg-slate-950/60 backdrop-blur-xs overflow-hidden"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="reminder-detail-title"
    >
      <div
        className="relative z-10 w-full max-w-md max-h-[88vh] flex flex-col rounded-none bg-white shadow-2xl border border-gray-300 animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Pinned Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3.5 bg-gray-50/50 shrink-0">
          <div className="flex items-center gap-2">
            <span
              id="reminder-detail-title"
              className={`inline-flex items-center rounded-none px-2 py-0.5 text-xs font-semibold uppercase tracking-wider ${TYPE_COLOR[reminder.reminderType] ?? 'bg-gray-100 text-gray-600'}`}
            >
              {typeLabel(reminder.reminderType)}
            </span>
            <span className="text-xs text-gray-400 font-mono">
              {formatScheduled(reminder.scheduledDate)}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-none border border-transparent p-1.5 text-gray-400 hover:border-gray-300 hover:bg-gray-100 hover:text-gray-700 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <p className="whitespace-pre-line text-xs leading-relaxed text-gray-700">
            {reminder.message}
          </p>
        </div>

        {/* Pinned Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-gray-200 bg-gray-50/80 px-5 py-3 shrink-0">
          <Button variant="outline" size="sm" onClick={() => onDismiss(reminder)} className="rounded-none text-xs">
            <Trash2 className="h-3.5 w-3.5 mr-1" /> Dismiss
          </Button>
          <Button variant="ghost" size="sm" onClick={onClose} className="rounded-none text-xs">
            <Check className="h-3.5 w-3.5 mr-1" /> Close
          </Button>
          <Button size="sm" onClick={() => onNavigate(reminder)} className="rounded-none text-xs">
            {ACTION_LABEL_FOR_REMINDER[reminder.reminderType] ?? 'View Details'}
          </Button>
        </div>
      </div>
    </div>,
    document.body
  );
}
