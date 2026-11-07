import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  CreditCard,
  Landmark,
  MessageCircle,
  Ban,
  Shield,
  Phone,
  Mail,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Pencil,
  Loader2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import Button from '@/components/ui/Button.tsx';
import { useBusinessStore } from '@/stores/business.store.ts';
import { useCreditStore } from '@/stores/credit.store.ts';
import type { CreditStatus } from '@/types/index.ts';
import { getErrorMessage } from '@/lib/axios.ts';
import { useSubscriptionWriteGate } from '@/hooks/useSubscriptionWriteGate';

import RecordCreditPaymentModal from '@/components/debtors/RecordCreditPaymentModal.tsx';
import LinkDvaCreditModal from '@/components/debtors/LinkDvaCreditModal.tsx';
import WriteOffModal from '@/components/debtors/WriteOffModal.tsx';
import EditCreditModal from '@/components/debtors/EditCreditModal.tsx';
import { formatNaira } from '@/lib/format';
import { useDisplayCurrency } from '@/hooks/useDisplayCurrency';

/* ─── Helpers ──────────────────────────────────────────────── */

function formatDate(d: string | null | undefined) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-NG', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function getInitials(name: string) {
  return (
    name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0].toUpperCase())
      .join('') || 'C'
  );
}

function getDueBadge(dueDateStr: string, status: CreditStatus) {
  if (status === 'paid')
    return { label: 'Settled', cls: 'text-emerald-700 bg-emerald-50' };
  if (status === 'written_off')
    return { label: 'Written Off', cls: 'text-gray-500 bg-gray-100' };

  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const due = new Date(dueDateStr);
  due.setHours(0, 0, 0, 0);
  const diff = Math.ceil((due.getTime() - now.getTime()) / 86400000);

  if (diff < 0)
    return {
      label: `${Math.abs(diff)}d overdue`,
      cls: 'text-rose-700 bg-rose-50',
    };
  if (diff === 0)
    return { label: 'Due today', cls: 'text-amber-700 bg-amber-50' };
  return { label: `${diff}d left`, cls: 'text-gray-600 bg-gray-100' };
}

const STATUS_STYLES: Record<CreditStatus, { label: string; cls: string }> = {
  unpaid: {
    label: 'Unpaid',
    cls: 'text-amber-700 bg-amber-50 border-amber-200',
  },
  partially_paid: {
    label: 'Partial',
    cls: 'text-blue-700 bg-blue-50 border-blue-200',
  },
  overdue: {
    label: 'Overdue',
    cls: 'text-rose-700 bg-rose-50 border-rose-200',
  },
  paid: {
    label: 'Settled',
    cls: 'text-emerald-700 bg-emerald-50 border-emerald-200',
  },
  written_off: {
    label: 'Written Off',
    cls: 'text-gray-600 bg-gray-100 border-gray-200',
  },
};

/* ─── Component ────────────────────────────────────────────── */

export default function DebtorDetail() {
  useDisplayCurrency();
  const { id } = useParams<{ id: string }>();
  const biz = useBusinessStore((s) => s.activeBusiness);
  const activeCredit = useCreditStore((s) => s.activeCredit);
  const detailLoading = useCreditStore((s) => s.detailLoading);
  const detailError = useCreditStore((s) => s.detailError);
  const fetchCredit = useCreditStore((s) => s.fetchCredit);
  const clearActive = useCreditStore((s) => s.clearActive);
  const sendWhatsApp = useCreditStore((s) => s.sendWhatsApp);
  const sendDebtorEmail = useCreditStore((s) => s.sendDebtorEmail);
  const { blockIfNeeded, writesBlocked } = useSubscriptionWriteGate();

  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [dvaModalOpen, setDvaModalOpen] = useState(false);
  const [writeOffModalOpen, setWriteOffModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [isSendingWhatsApp, setIsSendingWhatsApp] = useState(false);
  const [isSendingEmail, setIsSendingEmail] = useState(false);

  useEffect(() => {
    if (biz && id) fetchCredit(biz.id, id);
    return () => {
      clearActive();
    };
  }, [biz, id, fetchCredit, clearActive]);

  const reloadData = () => {
    if (biz && id) fetchCredit(biz.id, id);
  };

  const handleWhatsApp = async () => {
    if (!biz || !activeCredit) return;
    if (!activeCredit.customerPhone) {
      toast.error(`No phone number for ${activeCredit.customerName}`);
      return;
    }
    setIsSendingWhatsApp(true);
    try {
      const meta = await sendWhatsApp(biz.id, activeCredit.id);
      if (meta?.waUrl) {
        window.open(meta.waUrl, '_blank', 'noopener,noreferrer');
        toast.success('WhatsApp reminder ready');
      }
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setIsSendingWhatsApp(false);
    }
  };

  const handleSendEmail = async () => {
    if (!biz || !activeCredit) return;
    if (!activeCredit.customerEmail) {
      toast.error(`No email address recorded for ${activeCredit.customerName}`);
      return;
    }
    setIsSendingEmail(true);
    try {
      const r = await sendDebtorEmail(biz.id, activeCredit.id);
      toast.success(
        r.delivered
          ? `Debt information sent to ${r.to} — includes your wallet account for direct transfer`
          : `Debt email queued (dev mode) for ${r.to}`
      );
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setIsSendingEmail(false);
    }
  };

  /* ── Guards ── */
  if (!biz)
    return (
      <div className='py-20 text-center text-gray-400 text-sm'>
        Select a business first.
      </div>
    );

  if (detailLoading && !activeCredit) {
    return (
      <div className='flex items-center justify-center py-28 gap-3 text-gray-500'>
        <Loader2 className='h-5 w-5 animate-spin' />
        <span className='text-sm'>Loading…</span>
      </div>
    );
  }

  if (detailError || !activeCredit) {
    return (
      <div className='max-w-md mx-auto py-20 px-4 text-center'>
        <AlertTriangle className='h-8 w-8 text-gray-300 mx-auto mb-3' />
        <p className='text-sm font-medium text-gray-700'>Record not found</p>
        <p className='text-xs text-gray-400 mt-1'>
          {detailError || 'This debtor may have been deleted.'}
        </p>
        <Link
          to='/debtors'
          className='mt-5 inline-flex items-center gap-1.5 text-xs font-semibold text-primary-600 hover:underline'
        >
          <ArrowLeft className='h-3.5 w-3.5' /> Back to Debtors
        </Link>
      </div>
    );
  }

  const c = activeCredit;
  const initials = getInitials(c.customerName);
  const paidPct =
    c.totalAmount > 0
      ? Math.min(100, Math.round((c.amountPaid / c.totalAmount) * 100))
      : 0;
  const isSettled = c.status === 'paid';
  const isWrittenOff = c.status === 'written_off';
  const canAct = !isSettled && !isWrittenOff;
  const dueBadge = getDueBadge(c.dueDate, c.status);
  const statusStyle = STATUS_STYLES[c.status] || STATUS_STYLES.unpaid;

  return (
    <div className='pb-16 animate-in fade-in duration-200'>
      {/* ── Top Bar ─────────────────────────────────────────── */}
      <div className='flex items-center justify-between mb-8'>
        <Link
          to='/debtors'
          className='inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-900 transition-colors'
        >
          <ArrowLeft className='h-3.5 w-3.5' /> Debtors
        </Link>
        <span className='text-[10px] font-mono text-gray-400'>
          {c.id.slice(0, 8).toUpperCase()}
        </span>
      </div>

      {/* ── Hero ────────────────────────────────────────────── */}
      <div className='flex flex-col md:flex-row md:items-start justify-between gap-6 mb-8'>
        <div className='flex items-start gap-4'>
          {/* Avatar */}
          <div className='h-12 w-12 rounded-full bg-gray-900 text-white flex items-center justify-center text-sm font-bold shrink-0 select-none'>
            {initials}
          </div>
          <div className='min-w-0'>
            <div className='flex flex-wrap items-center gap-2.5'>
              <h1 className='text-xl font-bold text-gray-900 tracking-tight truncate'>
                {c.customerName}
              </h1>
              <span
                className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${statusStyle.cls}`}
              >
                {statusStyle.label}
              </span>
            </div>
            {/* Contact chips — minimal */}
            <div className='flex flex-wrap items-center gap-3 mt-2 text-xs text-gray-500'>
              {c.customerPhone && (
                <a
                  href={`tel:${c.customerPhone}`}
                  className='inline-flex items-center gap-1 hover:text-gray-900 transition-colors'
                >
                  <Phone className='h-3 w-3' /> {c.customerPhone}
                </a>
              )}
              {c.customerEmail && (
                <a
                  href={`mailto:${c.customerEmail}`}
                  className='inline-flex items-center gap-1 hover:text-gray-900 transition-colors'
                >
                  <Mail className='h-3 w-3' /> {c.customerEmail}
                </a>
              )}
              <span className='inline-flex items-center gap-1 text-gray-400'>
                <Clock className='h-3 w-3' /> {formatDate(c.issueDate)}
              </span>
            </div>
          </div>
        </div>

        {/* Actions — clean pill buttons */}
        {canAct && (
          <div className='flex flex-wrap items-center gap-1.5 shrink-0'>
            <Button
              onClick={() => {
                if (blockIfNeeded()) return;
                setPaymentModalOpen(true);
              }}
              className='text-xs font-semibold px-3 py-2 rounded-lg gap-1.5'
            >
              <CreditCard className='h-3.5 w-3.5' /> Record Payment
            </Button>
            <button
              onClick={() => {
                if (blockIfNeeded()) return;
                setDvaModalOpen(true);
              }}
              disabled={writesBlocked}
              className='text-xs font-medium px-3 py-2 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed'
            >
              <Landmark className='h-3.5 w-3.5 inline -mt-px mr-1' />
              DVA
            </button>
            {c.customerPhone && (
              <button
                onClick={() => {
                  if (blockIfNeeded()) return;
                  handleWhatsApp();
                }}
                disabled={isSendingWhatsApp || writesBlocked}
                className='text-xs font-medium px-3 py-2 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed'
              >
                <MessageCircle className='h-3.5 w-3.5 inline -mt-px mr-1' />
                WhatsApp
              </button>
            )}
            <button
              onClick={() => {
                if (blockIfNeeded()) return;
                handleSendEmail();
              }}
              disabled={!c.customerEmail || isSendingEmail || writesBlocked}
              title={
                c.customerEmail
                  ? `Email debt info to ${c.customerEmail}`
                  : 'Add an email address to send debt information'
              }
              className='text-xs font-medium px-3 py-2 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed'
            >
              {isSendingEmail ? (
                <Loader2 className='h-3.5 w-3.5 inline animate-spin -mt-px mr-1' />
              ) : (
                <Mail className='h-3.5 w-3.5 inline -mt-px mr-1' />
              )}
              Email
            </button>
            <button
              onClick={() => {
                if (blockIfNeeded()) return;
                setEditModalOpen(true);
              }}
              disabled={writesBlocked}
              className='text-xs font-medium px-3 py-2 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed'
            >
              <Pencil className='h-3.5 w-3.5 inline -mt-px mr-1' />
              Edit
            </button>
            <button
              onClick={() => {
                if (blockIfNeeded()) return;
                setWriteOffModalOpen(true);
              }}
              disabled={writesBlocked}
              className='text-xs font-medium px-2.5 py-2 rounded-lg border border-gray-200 text-gray-400 hover:text-rose-600 hover:border-rose-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed'
              title='Write off'
            >
              <Ban className='h-3.5 w-3.5' />
            </button>
          </div>
        )}
      </div>

      {/* ── Numbers Strip ───────────────────────────────────── */}
      <div className='grid grid-cols-2 lg:grid-cols-4 gap-px bg-gray-200 rounded-xl overflow-hidden mb-8'>
        {/* Balance */}
        <div className='bg-white p-4'>
          <p className='text-[10px] font-medium text-gray-400 uppercase tracking-wide'>
            Balance
          </p>
          <p
            className={`text-lg font-bold tabular-nums mt-1 ${c.balance === 0 ? 'text-emerald-600' : c.status === 'overdue' ? 'text-rose-600' : 'text-gray-900'}`}
          >
            {formatNaira(c.balance)}
          </p>
          <p className='text-[10px] text-gray-400 mt-1'>
            {c.balance === 0 ? 'Fully settled' : `${100 - paidPct}% remaining`}
          </p>
        </div>
        {/* Original */}
        <div className='bg-white p-4'>
          <p className='text-[10px] font-medium text-gray-400 uppercase tracking-wide'>
            Original
          </p>
          <p className='text-lg font-bold text-gray-900 tabular-nums mt-1'>
            {formatNaira(c.totalAmount)}
          </p>
          <p className='text-[10px] text-gray-400 mt-1'>
            {formatDate(c.issueDate)}
          </p>
        </div>
        {/* Recovered */}
        <div className='bg-white p-4'>
          <p className='text-[10px] font-medium text-gray-400 uppercase tracking-wide'>
            Recovered
          </p>
          <p className='text-lg font-bold text-emerald-600 tabular-nums mt-1'>
            {formatNaira(c.amountPaid)}
          </p>
          <div className='mt-2'>
            <div className='h-1 w-full bg-gray-100 rounded-full overflow-hidden'>
              <div
                className={`h-full rounded-full transition-all duration-500 ${isSettled ? 'bg-emerald-500' : 'bg-gray-900'}`}
                style={{ width: `${paidPct}%` }}
              />
            </div>
            <p className='text-[10px] text-gray-400 mt-1'>{paidPct}%</p>
          </div>
        </div>
        {/* Due */}
        <div className='bg-white p-4'>
          <p className='text-[10px] font-medium text-gray-400 uppercase tracking-wide'>
            Due Date
          </p>
          <p className='text-sm font-bold text-gray-900 mt-1'>
            {formatDate(c.dueDate)}
          </p>
          <span
            className={`inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded mt-1.5 ${dueBadge.cls}`}
          >
            {dueBadge.label}
          </span>
        </div>
      </div>

      {/* ── Main Content ────────────────────────────────────── */}
      <div className='grid grid-cols-1 lg:grid-cols-3 gap-6'>
        {/* ── Left 2/3: Payments + Items ── */}
        <div className='lg:col-span-2 space-y-6'>
          {/* Payment History */}
          <div className='bg-white rounded-xl border border-gray-200/80 overflow-hidden'>
            <div className='flex items-center justify-between px-5 py-3.5 border-b border-gray-100'>
              <h2 className='text-xs font-bold text-gray-800 uppercase tracking-wide'>
                Payment History
              </h2>
              <span className='text-[10px] font-medium text-gray-400 bg-gray-50 px-2 py-0.5 rounded-full'>
                {c.payments?.length || 0}{' '}
                {c.payments?.length === 1 ? 'entry' : 'entries'}
              </span>
            </div>

            {!c.payments || c.payments.length === 0 ? (
              <div className='py-12 text-center'>
                <div className='h-10 w-10 rounded-full bg-gray-50 flex items-center justify-center mx-auto mb-3'>
                  <CreditCard className='h-4.5 w-4.5 text-gray-300' />
                </div>
                <p className='text-xs font-medium text-gray-500'>
                  No payments recorded yet
                </p>
                <p className='text-[11px] text-gray-400 mt-0.5'>
                  Payments will appear here as the debtor settles
                </p>
                {canAct && (
                  <button
                    onClick={() => {
                      if (blockIfNeeded()) return;
                      setPaymentModalOpen(true);
                    }}
                    disabled={writesBlocked}
                    className='mt-4 text-xs font-semibold text-primary-600 hover:text-primary-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed'
                  >
                    Record first payment →
                  </button>
                )}
              </div>
            ) : (
              <div className='divide-y divide-gray-100'>
                {c.payments.map((p, idx) => (
                  <div
                    key={p.id || idx}
                    className='flex items-center justify-between gap-4 px-5 py-3.5 hover:bg-gray-50/50 transition-colors'
                  >
                    <div className='flex items-center gap-3 min-w-0'>
                      <div className='h-8 w-8 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0'>
                        <CheckCircle2 className='h-3.5 w-3.5' />
                      </div>
                      <div className='min-w-0'>
                        <div className='flex items-center gap-2'>
                          <span className='text-sm font-bold text-gray-900 tabular-nums'>
                            {formatNaira(p.amount)}
                          </span>
                          <span className='text-[10px] font-medium text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded uppercase'>
                            {p.paymentType.replace('_', ' ')}
                          </span>
                          {p.linkedSaleId && (
                            <span className='text-[10px] font-semibold text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded'>
                              Legacy
                            </span>
                          )}
                        </div>
                        {p.notes && (
                          <p className='text-[11px] text-gray-500 truncate mt-0.5'>
                            {p.notes}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className='text-right shrink-0'>
                      <p className='text-xs font-medium text-gray-700'>
                        {formatDate(p.paymentDate)}
                      </p>
                      {p.linkedSaleId && (
                        <p
                          className='text-[10px] font-mono text-gray-400 mt-0.5'
                          title='Legacy sale ref'
                        >
                          {p.linkedSaleId.slice(0, 8)}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Items / Agreement */}
          <div className='bg-white rounded-xl border border-gray-200/80 overflow-hidden'>
            <div className='px-5 py-3.5 border-b border-gray-100'>
              <h2 className='text-xs font-bold text-gray-800 uppercase tracking-wide'>
                {c.items && c.items.length > 0
                  ? `Items on Credit`
                  : `Agreement Details`}
              </h2>
            </div>

            {c.items && c.items.length > 0 ? (
              <>
                <table className='w-full text-xs'>
                  <thead>
                    <tr className='border-b border-gray-100 bg-gray-50/50 text-left'>
                      <th className='px-5 py-2.5 text-[10px] font-semibold text-gray-500 uppercase'>
                        Item
                      </th>
                      <th className='px-5 py-2.5 text-[10px] font-semibold text-gray-500 uppercase text-right'>
                        Qty
                      </th>
                      <th className='px-5 py-2.5 text-[10px] font-semibold text-gray-500 uppercase text-right'>
                        Price
                      </th>
                      <th className='px-5 py-2.5 text-[10px] font-semibold text-gray-500 uppercase text-right'>
                        Total
                      </th>
                    </tr>
                  </thead>
                  <tbody className='divide-y divide-gray-50'>
                    {c.items.map((item, idx) => (
                      <tr
                        key={item.id || idx}
                        className='hover:bg-gray-50/40 transition-colors'
                      >
                        <td className='px-5 py-2.5 font-medium text-gray-900'>
                          {item.name}
                        </td>
                        <td className='px-5 py-2.5 text-right text-gray-600 tabular-nums'>
                          {Number(item.quantity)}
                        </td>
                        <td className='px-5 py-2.5 text-right text-gray-600 tabular-nums'>
                          {formatNaira(Number(item.unitPrice))}
                        </td>
                        <td className='px-5 py-2.5 text-right font-semibold text-gray-900 tabular-nums'>
                          {formatNaira(
                            Number(
                              item.lineTotal ?? item.quantity * item.unitPrice,
                            ),
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className='border-t border-gray-200 bg-gray-50/30'>
                      <td
                        className='px-5 py-3 font-semibold text-gray-700'
                        colSpan={3}
                      >
                        Total
                      </td>
                      <td className='px-5 py-3 text-right font-bold text-gray-900 tabular-nums'>
                        {formatNaira(c.totalAmount)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
                {c.description && (
                  <div className='px-5 py-3 border-t border-gray-100 text-[11px] text-gray-500 italic'>
                    {c.description}
                  </div>
                )}
              </>
            ) : (
              <div className='px-5 py-4'>
                <p className='text-sm text-gray-800 leading-relaxed'>
                  {c.description}
                </p>
              </div>
            )}

            {/* Dates row inside the card */}
            <div className='flex flex-wrap items-center gap-6 px-5 py-3.5 border-t border-gray-100 bg-gray-50/30'>
              <div>
                <span className='text-[10px] font-medium text-gray-400 uppercase'>
                  Issued
                </span>
                <p className='text-xs font-semibold text-gray-800 mt-0.5'>
                  {formatDate(c.issueDate)}
                </p>
              </div>
              <div>
                <span className='text-[10px] font-medium text-gray-400 uppercase'>
                  Due
                </span>
                <p className='text-xs font-semibold text-gray-800 mt-0.5'>
                  {formatDate(c.dueDate)}
                </p>
              </div>
              {c.reminderDate && (
                <div>
                  <span className='text-[10px] font-medium text-gray-400 uppercase'>
                    Reminder
                  </span>
                  <p className='text-xs font-semibold text-gray-800 mt-0.5'>
                    {formatDate(c.reminderDate)}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Notes — only if exists */}
          {c.notes && (
            <div className='bg-white rounded-xl border border-gray-200/80 overflow-hidden'>
              <div className='px-5 py-3.5 border-b border-gray-100'>
                <h2 className='text-xs font-bold text-gray-800 uppercase tracking-wide'>
                  Notes
                </h2>
              </div>
              <div className='px-5 py-4 text-xs text-gray-600 leading-relaxed whitespace-pre-line'>
                {c.notes}
              </div>
            </div>
          )}
        </div>

        {/* ── Right 1/3: Contact + Guarantor + NRS ── */}
        <div className='space-y-6'>
          {/* Debtor Contact */}
          <div className='bg-white rounded-xl border border-gray-200/80 overflow-hidden'>
            <div className='flex items-center justify-between px-5 py-3.5 border-b border-gray-100'>
              <h3 className='text-xs font-bold text-gray-800 uppercase tracking-wide'>
                Contact
              </h3>
              {canAct && (
                <button
                  onClick={() => setEditModalOpen(true)}
                  className='text-[11px] font-medium text-gray-400 hover:text-gray-700 transition-colors'
                >
                  Edit
                </button>
              )}
            </div>

            <div className='px-5 py-4 space-y-4 text-xs'>
              <div>
                <span className='text-[10px] font-medium text-gray-400 uppercase'>
                  Name
                </span>
                <p className='font-semibold text-gray-900 mt-0.5'>
                  {c.customerName}
                </p>
              </div>

              <div>
                <span className='text-[10px] font-medium text-gray-400 uppercase'>
                  Phone
                </span>
                {c.customerPhone ? (
                  <div className='flex items-center justify-between mt-1.5 p-2.5 bg-gray-50 rounded-lg'>
                    <span className='font-mono text-gray-800'>
                      {c.customerPhone}
                    </span>
                    <div className='flex gap-1.5'>
                      <a
                        href={`tel:${c.customerPhone}`}
                        className='text-[10px] font-semibold text-gray-600 hover:text-gray-900 px-2 py-1 rounded-md bg-white border border-gray-200 transition-colors'
                      >
                        Call
                      </a>
                      <button
                        onClick={handleWhatsApp}
                        className='text-[10px] font-semibold text-emerald-700 hover:text-emerald-800 px-2 py-1 rounded-md bg-emerald-50 border border-emerald-200 transition-colors'
                      >
                        WA
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className='text-gray-400 italic mt-0.5'>Not recorded</p>
                )}
              </div>

              <div>
                <span className='text-[10px] font-medium text-gray-400 uppercase'>
                  Email
                </span>
                {c.customerEmail ? (
                  <div className='flex items-center justify-between mt-1.5 p-2.5 bg-gray-50 rounded-lg'>
                    <a
                      href={`mailto:${c.customerEmail}`}
                      className='font-medium text-gray-800 hover:text-primary-600 transition-colors truncate mr-2 text-xs'
                    >
                      {c.customerEmail}
                    </a>
                    {canAct && (
                      <button
                        onClick={() => {
                          if (blockIfNeeded()) return;
                          handleSendEmail();
                        }}
                        disabled={isSendingEmail || writesBlocked}
                        className='text-[10px] font-semibold text-primary-700 hover:text-primary-800 px-2 py-1 rounded-md bg-white border border-primary-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0'
                      >
                        {isSendingEmail ? 'Sending...' : 'Send Info'}
                      </button>
                    )}
                  </div>
                ) : (
                  <p className='text-gray-400 italic mt-0.5'>Not recorded</p>
                )}
              </div>
            </div>
          </div>

          {/* Guarantor */}
          <div className='bg-white rounded-xl border border-gray-200/80 overflow-hidden'>
            <div className='flex items-center justify-between px-5 py-3.5 border-b border-gray-100'>
              <h3 className='text-xs font-bold text-gray-800 uppercase tracking-wide'>
                Guarantor
              </h3>
              {canAct && (
                <button
                  onClick={() => setEditModalOpen(true)}
                  className='text-[11px] font-medium text-gray-400 hover:text-gray-700 transition-colors'
                >
                  Edit
                </button>
              )}
            </div>

            {c.guarantorName ? (
              <div className='px-5 py-4 space-y-4 text-xs'>
                <div>
                  <span className='text-[10px] font-medium text-gray-400 uppercase'>
                    Name
                  </span>
                  <div className='flex items-center gap-1.5 mt-0.5'>
                    <Shield className='h-3 w-3 text-gray-400' />
                    <span className='font-semibold text-gray-900'>
                      {c.guarantorName}
                    </span>
                  </div>
                </div>
                {c.guarantorPhone && (
                  <div>
                    <span className='text-[10px] font-medium text-gray-400 uppercase'>
                      Phone
                    </span>
                    <div className='flex items-center justify-between mt-1.5 p-2.5 bg-gray-50 rounded-lg'>
                      <span className='font-mono text-gray-800'>
                        {c.guarantorPhone}
                      </span>
                      <a
                        href={`tel:${c.guarantorPhone}`}
                        className='text-[10px] font-semibold text-gray-600 hover:text-gray-900 px-2 py-1 rounded-md bg-white border border-gray-200 transition-colors'
                      >
                        Call
                      </a>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className='px-5 py-6 text-center'>
                <Shield className='h-5 w-5 text-gray-200 mx-auto mb-1.5' />
                <p className='text-xs text-gray-400'>No guarantor on file</p>
              </div>
            )}
          </div>

          {/* How Debtor Pays Mini-Card */}
          <div className='bg-white rounded-xl border border-gray-200/80 overflow-hidden'>
            <div className='px-5 py-3.5 border-b border-gray-100 flex items-center justify-between'>
              <h3 className='text-xs font-bold text-gray-800 uppercase tracking-wide flex items-center gap-1.5'>
                <Landmark className='h-3.5 w-3.5 text-gray-400' />
                How Debtor Pays
              </h3>
            </div>
            <div className='px-5 py-4 text-xs space-y-2'>
              {biz?.virtualAccountNumber ? (
                <div>
                  <p className='text-gray-500 text-[11px] mb-1.5'>Direct Wallet Transfer (DVA):</p>
                  <div className='p-2.5 bg-gray-50 border border-gray-200 rounded-lg space-y-1.5'>
                    <div className='flex justify-between items-center'>
                      <span className='text-gray-500'>Bank</span>
                      <span className='font-semibold text-gray-900'>{biz.virtualAccountBank || 'Dedicated Virtual Account'}</span>
                    </div>
                    <div className='flex justify-between items-center'>
                      <span className='text-gray-500'>Account Number</span>
                      <span className='font-mono font-bold text-primary-700 text-sm'>{biz.virtualAccountNumber}</span>
                    </div>
                    <div className='flex justify-between items-center'>
                      <span className='text-gray-500'>Account Name</span>
                      <span className='font-medium text-gray-800'>{biz.businessName}</span>
                    </div>
                  </div>
                  <p className='text-[10px] text-gray-400 mt-2'>
                    These details are automatically included in debtor email reminders for direct settlement.
                  </p>
                </div>
              ) : (
                <div className='p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 space-y-1.5'>
                  <p className='font-medium text-[11px]'>No wallet account on file</p>
                  <p className='text-[10px] text-amber-700 leading-relaxed'>
                    Set up your dedicated virtual account in{' '}
                    <Link to='/account?tab=wallet' className='font-semibold underline hover:text-amber-900'>
                      Account &rarr; Wallet
                    </Link>{' '}
                    to enable direct bank transfer instructions in debtor emails.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Accounting Info Banner */}
          <div className='rounded-xl bg-gray-900 p-5 text-white space-y-2.5'>
            <div className='flex items-center gap-2'>
              <div className='h-5 w-5 rounded-md bg-emerald-500/20 flex items-center justify-center'>
                <CheckCircle2 className='h-3 w-3 text-emerald-400' />
              </div>
              <h4 className='text-[10px] font-bold uppercase tracking-wide text-gray-300'>
                Accrual-Basis Accounting
              </h4>
            </div>
            <p className='text-[11px] text-gray-400 leading-relaxed'>
              Revenue was counted when this credit sale was created. Repayments
              only reduce the outstanding debt — they don't create new taxable
              sales.
            </p>
          </div>
        </div>
      </div>

      {/* ── Modals ──────────────────────────────────────────── */}
      <RecordCreditPaymentModal
        businessId={biz.id}
        credit={activeCredit}
        isOpen={paymentModalOpen}
        onClose={() => setPaymentModalOpen(false)}
        onSuccess={reloadData}
      />
      <LinkDvaCreditModal
        businessId={biz.id}
        credit={activeCredit}
        isOpen={dvaModalOpen}
        onClose={() => setDvaModalOpen(false)}
        onSuccess={reloadData}
      />
      <WriteOffModal
        businessId={biz.id}
        credit={activeCredit}
        isOpen={writeOffModalOpen}
        onClose={() => setWriteOffModalOpen(false)}
        onSuccess={reloadData}
      />
      <EditCreditModal
        businessId={biz.id}
        credit={activeCredit}
        isOpen={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        onUpdated={reloadData}
      />
    </div>
  );
}
