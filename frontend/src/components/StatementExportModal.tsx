import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Download, Mail, FileText, CheckCircle2, X } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import api from '@/lib/axios';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/stores/auth.store';

interface StatementExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  businessId: string;
  businessName: string;
}

type StatementScope = 'dva_bank' | 'all_income';
type DatePreset = '30d' | 'this_month' | 'this_quarter' | 'ytd' | 'custom';

export default function StatementExportModal({
  isOpen,
  onClose,
  businessId,
  businessName,
}: StatementExportModalProps) {
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen]);

  const user = useAuthStore((s) => s.user);

  const [scope, setScope] = useState<StatementScope>('dva_bank');
  const [preset, setPreset] = useState<DatePreset>('30d');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [recipientEmail, setRecipientEmail] = useState(user?.email || '');
  const [showEmailInput, setShowEmailInput] = useState(false);

  const [downloading, setDownloading] = useState(false);
  const [emailing, setEmailing] = useState(false);

  if (!isOpen) return null;

  function getDateRange(): { from?: string; to?: string } {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const toIso = (d: Date) =>
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

    if (preset === 'custom') {
      return {
        from: customFrom || undefined,
        to: customTo || undefined,
      };
    }

    if (preset === 'this_month') {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from: toIso(start), to: toIso(now) };
    }

    if (preset === 'this_quarter') {
      const qMonth = Math.floor(now.getMonth() / 3) * 3;
      const start = new Date(now.getFullYear(), qMonth, 1);
      return { from: toIso(start), to: toIso(now) };
    }

    if (preset === 'ytd') {
      const start = new Date(now.getFullYear(), 0, 1);
      return { from: toIso(start), to: toIso(now) };
    }

    // 30d default
    const start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    return { from: toIso(start), to: toIso(now) };
  }

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const { from, to } = getDateRange();
      const params: Record<string, string> = { scope };
      if (from) params.from = from;
      if (to) params.to = to;

      const res = await api.get(
        `/businesses/${businessId}/tax/statements/ledger`,
        {
          params,
          responseType: 'blob',
        },
      );

      const blob = new Blob([res.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute(
        'download',
        `${scope === 'dva_bank' ? 'Bank-Statement' : 'Sales-Statement'}-${businessName.replace(/\s+/g, '_')}.pdf`,
      );
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      toast.success('Official financial statement downloaded');
    } catch (err: any) {
      toast.error(
        err.response?.data?.error?.message || 'Failed to download statement',
      );
    } finally {
      setDownloading(false);
    }
  };

  const handleEmailStatement = async () => {
    if (!recipientEmail || !recipientEmail.includes('@')) {
      toast.error('Please provide a valid recipient email address');
      return;
    }

    setEmailing(true);
    try {
      const { from, to } = getDateRange();
      const payload: Record<string, string> = {
        scope,
        recipientEmail: recipientEmail.trim(),
      };
      if (from) payload.from = from;
      if (to) payload.to = to;

      const res = await api.post(
        `/businesses/${businessId}/tax/statements/ledger/email`,
        payload,
      );
      toast.success(res.data.message || 'Statement sent successfully');
      setShowEmailInput(false);
    } catch (err: any) {
      toast.error(
        err.response?.data?.error?.message || 'Failed to email statement',
      );
    } finally {
      setEmailing(false);
    }
  };

  return createPortal(
    <div className='fixed inset-0 z-[9999] w-screen h-screen min-h-screen flex items-center justify-center p-3 sm:p-4 bg-slate-950/60 backdrop-blur-xs overflow-hidden'>
      {/* Backdrop */}
      <div className='absolute inset-0 cursor-default' onClick={onClose} />

      {/* Modal Dialog */}
      <div className='relative z-10 w-full max-w-lg max-h-[88vh] flex flex-col rounded-none bg-white shadow-2xl border border-gray-300 animate-in fade-in zoom-in-95 duration-150'>
        {/* Pinned Header */}
        <div className='flex items-center justify-between border-b border-gray-200 px-5 py-4 shrink-0 bg-gray-50/50'>
          <div className='flex items-center gap-2.5'>
            <div className='flex h-8 w-8 items-center justify-center rounded-none bg-gray-900 text-white'>
              <FileText className='h-4 w-4' />
            </div>
            <div>
              <h2 className='text-sm font-semibold tracking-tight text-gray-900'>
                Export Official Statement
              </h2>
              <p className='text-xs text-gray-500'>
                Authenticated PDF financial statement for{' '}
                <span className='font-medium text-gray-900'>
                  {businessName}
                </span>
              </p>
            </div>
          </div>
          <button
            type='button'
            onClick={onClose}
            className='rounded-none border border-transparent p-1.5 text-gray-400 hover:border-gray-300 hover:bg-gray-100 hover:text-gray-700 transition-colors'
            aria-label='Close'
          >
            <X className='h-4 w-4' />
          </button>
        </div>

        {/* Scrollable Content Body */}
        <div className='flex-1 overflow-y-auto px-5 py-4 space-y-4'>
          {/* Statement Scope Selector */}
          <div>
            <label className='block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-2'>
              Statement Type &amp; Scope
            </label>
            <div className='grid grid-cols-2 gap-2.5'>
              <button
                type='button'
                onClick={() => setScope('dva_bank')}
                className={`p-3 rounded-none border text-left transition-all cursor-pointer ${
                  scope === 'dva_bank'
                    ? 'border-gray-950 bg-gray-50 ring-1 ring-gray-950'
                    : 'border-gray-200 hover:border-gray-400 bg-white'
                }`}
              >
                <div className='flex items-center gap-1.5 font-bold text-xs text-gray-900'>
                  <span>🏦 Digital Bank Statement</span>
                </div>
                <p className='text-[11px] text-gray-500 mt-1 leading-normal'>
                  Dedicated Wema NUBAN inflows, tax debits &amp; running
                  balance.
                </p>
              </button>

              <button
                type='button'
                onClick={() => setScope('all_income')}
                className={`p-3 rounded-none border text-left transition-all cursor-pointer ${
                  scope === 'all_income'
                    ? 'border-gray-950 bg-gray-50 ring-1 ring-gray-950'
                    : 'border-gray-200 hover:border-gray-400 bg-white'
                }`}
              >
                <div className='flex items-center gap-1.5 font-bold text-xs text-gray-900'>
                  <span>📊 Business Sales Statement</span>
                </div>
                <p className='text-[11px] text-gray-500 mt-1 leading-normal'>
                  All revenue channels (POS, Cash, Invoices, DVA transfers).
                </p>
              </button>
            </div>
          </div>

          {/* Date Preset Selection */}
          <div>
            <label className='block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-2'>
              Statement Period
            </label>
            <div className='flex flex-wrap gap-1.5'>
              {[
                { key: '30d', label: 'Last 30 Days' },
                { key: 'this_month', label: 'This Month' },
                { key: 'this_quarter', label: 'This Quarter' },
                { key: 'ytd', label: 'Year to Date' },
                { key: 'custom', label: 'Custom Dates' },
              ].map((item) => (
                <button
                  key={item.key}
                  type='button'
                  onClick={() => setPreset(item.key as DatePreset)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-none border transition-all cursor-pointer ${
                    preset === item.key
                      ? 'border-gray-900 bg-gray-900 text-white'
                      : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>

            {/* Custom Date Pickers */}
            {preset === 'custom' && (
              <div className='grid grid-cols-2 gap-3 mt-3 p-3 bg-gray-50 rounded-none border border-gray-200'>
                <div>
                  <label className='block text-[11px] font-semibold text-gray-600 mb-1'>
                    From Date
                  </label>
                  <Input
                    type='date'
                    value={customFrom}
                    onChange={(e) => setCustomFrom(e.target.value)}
                    className='rounded-none text-xs'
                  />
                </div>
                <div>
                  <label className='block text-[11px] font-semibold text-gray-600 mb-1'>
                    To Date
                  </label>
                  <Input
                    type='date'
                    value={customTo}
                    onChange={(e) => setCustomTo(e.target.value)}
                    className='rounded-none text-xs'
                  />
                </div>
              </div>
            )}
          </div>

          {/* Email Expansion Option */}
          {showEmailInput ? (
            <div className='p-3.5 bg-gray-50 rounded-none border border-gray-300 space-y-2.5'>
              <div className='flex items-center justify-between'>
                <label className='text-xs font-semibold text-gray-900'>
                  Recipient Email Address
                </label>
                <button
                  type='button'
                  onClick={() => setShowEmailInput(false)}
                  className='text-xs text-gray-600 hover:text-gray-900 hover:underline'
                >
                  Cancel
                </button>
              </div>
              <Input
                type='email'
                placeholder='e.g. accountant@company.com'
                value={recipientEmail}
                onChange={(e) => setRecipientEmail(e.target.value)}
                className='rounded-none text-xs'
              />
              <Button
                onClick={handleEmailStatement}
                isLoading={emailing}
                className='w-full rounded-none text-xs'
              >
                <Mail className='h-3.5 w-3.5' /> Send Statement PDF Now
              </Button>
            </div>
          ) : null}

          {/* Compliance Badge */}
          <div className='rounded-none bg-emerald-50 border border-emerald-200 p-2.5 flex items-center gap-2'>
            <CheckCircle2 className='h-4 w-4 text-emerald-600 shrink-0' />
            <p className='text-[11px] text-emerald-900'>
              Includes certified merchant verification stamp, running balances,
              and NRS compliance hash.
            </p>
          </div>
        </div>

        {/* Pinned Action Footer */}
        <div className='flex items-center justify-between gap-3 border-t border-gray-200 bg-gray-50/80 px-5 py-3 shrink-0'>
          {!showEmailInput && (
            <Button
              variant='outline'
              size='sm'
              onClick={() => setShowEmailInput(true)}
              className='rounded-none text-xs'
            >
              <Mail className='h-3.5 w-3.5' /> Email to Accountant
            </Button>
          )}

          <div className='flex items-center gap-2 ml-auto'>
            <Button
              variant='ghost'
              size='sm'
              onClick={onClose}
              className='rounded-none text-xs'
            >
              Close
            </Button>
            <Button
              size='sm'
              onClick={handleDownload}
              isLoading={downloading}
              className='rounded-none text-xs'
            >
              <Download className='h-3.5 w-3.5' /> Download Official PDF
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
