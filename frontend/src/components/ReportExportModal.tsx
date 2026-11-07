import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Download, FileText, X, Loader2 } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import api from '@/lib/axios';
import toast from 'react-hot-toast';

interface ReportExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  type: 'sales' | 'expense';
  businessId: string;
  businessName: string;
}

type DatePreset = 'this_month' | '30d' | 'this_quarter' | 'ytd' | 'custom';

export default function ReportExportModal({
  isOpen,
  onClose,
  type,
  businessId,
  businessName,
}: ReportExportModalProps) {
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen]);

  const [preset, setPreset] = useState<DatePreset>('this_month');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [downloading, setDownloading] = useState(false);

  if (!isOpen) return null;

  function getDateRange(): { from: string; to: string } {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const toIso = (d: Date) =>
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

    if (preset === 'custom') {
      const from =
        customFrom || toIso(new Date(now.getFullYear(), now.getMonth(), 1));
      const to = customTo || toIso(now);
      return { from, to };
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

    // 30d
    const start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    return { from: toIso(start), to: toIso(now) };
  }

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const { from, to } = getDateRange();
      const endpoint =
        type === 'sales'
          ? `/businesses/${businessId}/sales/report/pdf`
          : `/businesses/${businessId}/expenses/report/pdf`;

      const res = await api.get(endpoint, {
        params: { from, to },
        responseType: 'blob',
      });

      const blob = new Blob([res.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const label = type === 'sales' ? 'Sales-Report' : 'Expense-Report';
      link.setAttribute(
        'download',
        `${label}-${businessName.replace(/\s+/g, '_')}-${from}-to-${to}.pdf`,
      );
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      toast.success(
        `${type === 'sales' ? 'Sales' : 'Expense'} report downloaded successfully`,
      );
      onClose();
    } catch (err: unknown) {
      const errorMsg = (
        err as { response?: { data?: { error?: { message?: string } } } }
      )?.response?.data?.error?.message;
      toast.error(errorMsg || 'Failed to download report');
    } finally {
      setDownloading(false);
    }
  };

  const isSales = type === 'sales';

  const modal = (
    <div className='fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in duration-150'>
      <div className='bg-white rounded-2xl shadow-xl border border-gray-100 w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-150'>
        {/* Header */}
        <div className='flex items-center justify-between px-6 py-4 border-b border-gray-100'>
          <div className='flex items-center gap-2.5'>
            <div
              className={`p-2 rounded-lg ${isSales ? 'bg-primary-50 text-primary-600' : 'bg-rose-50 text-rose-600'}`}
            >
              <FileText className='h-5 w-5' />
            </div>
            <div>
              <h2 className='text-base font-semibold text-gray-900'>
                Download {isSales ? 'Sales' : 'Expense'} Report
              </h2>
              <p className='text-xs text-gray-400'>
                PDF period export for {businessName}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className='p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors cursor-pointer'
          >
            <X className='h-4 w-4' />
          </button>
        </div>

        {/* Body */}
        <div className='p-6 space-y-4'>
          <div>
            <label className='block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-2'>
              Select Period
            </label>
            <div className='grid grid-cols-2 gap-2'>
              {[
                { id: 'this_month', label: 'This Month' },
                { id: '30d', label: 'Last 30 Days' },
                { id: 'this_quarter', label: 'This Quarter' },
                { id: 'ytd', label: 'This Year (YTD)' },
              ].map((p) => (
                <button
                  key={p.id}
                  type='button'
                  onClick={() => setPreset(p.id as DatePreset)}
                  className={`px-3 py-2 text-xs font-medium rounded-lg border transition-all cursor-pointer text-left ${
                    preset === p.id
                      ? isSales
                        ? 'border-primary-500 bg-primary-50/60 text-primary-900 font-semibold shadow-xs'
                        : 'border-rose-500 bg-rose-50/60 text-rose-900 font-semibold shadow-xs'
                      : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>

            {/* Custom Range button */}
            <button
              type='button'
              onClick={() => setPreset('custom')}
              className={`w-full mt-2 px-3 py-2 text-xs font-medium rounded-lg border transition-all cursor-pointer text-left ${
                preset === 'custom'
                  ? isSales
                    ? 'border-primary-500 bg-primary-50/60 text-primary-900 font-semibold shadow-xs'
                    : 'border-rose-500 bg-rose-50/60 text-rose-900 font-semibold shadow-xs'
                  : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
              }`}
            >
              Custom Date Range
            </button>
          </div>

          {/* Custom Date Pickers */}
          {preset === 'custom' && (
            <div className='grid grid-cols-2 gap-3 pt-1 animate-in fade-in duration-150'>
              <Input
                label='From Date'
                type='date'
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
              />
              <Input
                label='To Date'
                type='date'
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
              />
            </div>
          )}

          {/* Info notice */}
          <div className='rounded-lg bg-gray-50 border border-gray-100 p-3 text-[11px] text-gray-500'>
            Generates a printable A4 PDF report with itemized transactions,
            category/source breakdown, totals, and NRS compliance headers.
          </div>
        </div>

        {/* Footer */}
        <div className='flex items-center justify-end gap-2.5 px-6 py-4 bg-gray-50 border-t border-gray-100'>
          <Button
            variant='secondary'
            size='sm'
            onClick={onClose}
            disabled={downloading}
          >
            Cancel
          </Button>
          <Button size='sm' onClick={handleDownload} disabled={downloading}>
            {downloading ? (
              <>
                <Loader2 className='h-3.5 w-3.5 animate-spin' />
                Generating PDF...
              </>
            ) : (
              <>
                <Download className='h-3.5 w-3.5' />
                Download PDF
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
