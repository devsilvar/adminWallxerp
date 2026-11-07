import { useEffect, useState } from 'react';
import { Bell, Trash2, Check, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import Card from '@/components/ui/Card.tsx';
import Button from '@/components/ui/Button.tsx';
import { CardListSkeleton } from '@/components/ui/Skeleton.tsx';
import ErrorState from '@/components/ui/ErrorState.tsx';
import EmptyState from '@/components/ui/EmptyState.tsx';
import { useBusinessStore } from '@/stores/business.store.ts';
import api, { getErrorMessage } from '@/lib/axios.ts';
import toast from 'react-hot-toast';
import type { Pagination, Reminder } from '@/types/index.ts';

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' });
}

function typeBadge(t: string) {
  const m: Record<string, string> = {
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
  };
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${m[t] || 'bg-gray-100 text-gray-600'}`}>{t.replace(/_/g, ' ')}</span>;
}

export default function Reminders() {
  const biz = useBusinessStore((s) => s.activeBusiness);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  const basePath = biz ? `/businesses/${biz.id}/reminders` : '';

  const fetchReminders = () => {
    if (!biz) return;
    setIsLoading(true);
    setError(null);
    api.get(basePath, { params: { page, limit: 15 } })
      .then((r) => { setReminders(r.data.data); setPagination(r.data.pagination); })
      .catch((e) => setError(getErrorMessage(e, 'Failed to load reminders.')))
      .finally(() => setIsLoading(false));
  };

  useEffect(() => { fetchReminders(); }, [biz, page]);

  const handleGenerate = async () => {
    setGenerating(true);
    const now = new Date();
    try {
      const r = await api.post(`${basePath}/generate`, {
        month: now.getMonth() + 1,
        year: now.getFullYear(),
      });
      const d = r.data?.data ?? {};
      const parts: string[] = [];
      if (d.taxReminderCreated && d.taxReminderType) {
        parts.push(`${d.taxReminderType.replace(/_/g, ' ')} reminder`);
      }
      if (d.deadlineCreated) parts.push('tax deadline reminder');
      if (d.invoiceRemindersCreated > 0) {
        parts.push(
          `${d.invoiceRemindersCreated} overdue invoice reminder${d.invoiceRemindersCreated === 1 ? '' : 's'}`
        );
      }
      if (parts.length === 0) {
        toast.success(d.message || 'You are all caught up — no new reminders.');
      } else {
        toast.success(`Created ${parts.join(' + ')}.`);
      }
      fetchReminders();
    } catch (err: any) {
      toast.error(err.response?.data?.error?.message || 'Failed');
    } finally { setGenerating(false); }
  };

  const handleMarkSent = async (id: string) => {
    try {
      await api.patch(`${basePath}/${id}/mark-sent`);
      toast.success('Marked as read');
      fetchReminders();
    } catch (err: any) { toast.error(err.response?.data?.error?.message || 'Failed'); }
  };

  const handleDismiss = async (id: string) => {
    if (!confirm('Dismiss this reminder?')) return;
    try {
      await api.delete(`${basePath}/${id}`);
      toast.success('Reminder dismissed');
      fetchReminders();
    } catch (err: any) { toast.error(err.response?.data?.error?.message || 'Failed'); }
  };

  if (!biz) return <p className="py-20 text-center text-gray-400">Select a business first.</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Reminders</h1>
          <p className="mt-1 font-body text-sm text-gray-500">Tax filing reminders and alerts.</p>
        </div>
        <Button onClick={handleGenerate} isLoading={generating}>
          <RefreshCw className="h-4 w-4" /> Generate Reminders
        </Button>
      </div>

      {error ? (
        <ErrorState message={error} onRetry={fetchReminders} />
      ) : isLoading ? (
        <CardListSkeleton rows={5} />
      ) : reminders.length === 0 ? (
        <EmptyState icon={Bell} message="No reminders. You're all caught up!" />
      ) : (
        <div className="space-y-3">
          {reminders.map((r) => (
            <Card key={r.id} className={r.isSent ? 'opacity-60' : ''}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${r.isSent ? 'bg-gray-100 text-gray-400' : 'bg-primary-50 text-primary-600'}`}>
                    <Bell className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      {typeBadge(r.reminderType)}
                      <span className="font-body text-xs text-gray-400">{formatDate(r.scheduledDate)}</span>
                      {r.isSent && <span className="text-xs text-gray-400">· Read</span>}
                    </div>
                    <p className="mt-1 font-body text-sm text-gray-700">{r.message}</p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {!r.isSent && (
                    <button onClick={() => handleMarkSent(r.id)} className="rounded p-1.5 text-gray-400 hover:bg-green-50 hover:text-green-600" title="Mark as read">
                      <Check className="h-4 w-4" />
                    </button>
                  )}
                  <button onClick={() => handleDismiss(r.id)} className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500" title="Dismiss">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="font-body text-xs text-gray-400">Page {pagination.page} of {pagination.totalPages}</span>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" disabled={!pagination.hasPrev} onClick={() => setPage(page - 1)}><ChevronLeft className="h-4 w-4" /></Button>
            <Button variant="secondary" size="sm" disabled={!pagination.hasNext} onClick={() => setPage(page + 1)}><ChevronRight className="h-4 w-4" /></Button>
          </div>
        </div>
      )}
    </div>
  );
}
