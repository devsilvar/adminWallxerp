/**
 * SalesImportModal — three-step wizard for importing sales from Excel/CSV.
 *
 *   Step 1: Upload        pick/drop a file, download the template
 *   Step 2: Preview       row-by-row status, summary chips, confirm to commit
 *   Step 3: Result        "Imported N" with skipped breakdown, close or import more
 *
 * Why a modal (not a full page)?
 *   - The user is on /sales, expects to come back to /sales after importing.
 *     A modal keeps the context. A page would force a redirect flow.
 *   - The interaction is transactional — upload → confirm → done.
 *
 * Why in-component styling for the overlay (not a shared Modal component)?
 *   - There isn't one in the design system yet (InvoiceDetail inlines its
 *     own too). Keeping consistent with that for now; extract when we have
 *     a third caller.
 */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Upload,
  FileSpreadsheet,
  Download,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Copy,
  Lock,
  ArrowLeft,
} from 'lucide-react';
import Button from '@/components/ui/Button.tsx';
import api from '@/lib/axios.ts';
import { useDashboardEvents } from '@/stores/dashboard.store.ts';
import toast from 'react-hot-toast';
import { formatNaira } from '@/lib/format';
import { useDisplayCurrency } from '@/hooks/useDisplayCurrency';
import type {
  SalesImportPreview,
  SalesImportPreviewRow,
  SalesImportCommitResult,
  SalesImportRowStatus,
} from '@/types/index.ts';

interface Props {
  isOpen: boolean;
  businessId: string;
  onClose: () => void;
  /** Called after a successful commit so the parent can refetch sales + summary. */
  onImported: () => void;
}

type Step = 'upload' | 'preview' | 'result';

const MAX_FILE_BYTES = 2 * 1024 * 1024; // 2 MB — keep in sync with backend
const MAX_ROWS = 100;

const STATUS_COPY: Record<SalesImportRowStatus, { label: string; className: string; icon: React.ReactNode }> = {
  valid: {
    label: 'Valid',
    className: 'bg-green-100 text-green-700',
    icon: <CheckCircle2 className="h-3.5 w-3.5" />,
  },
  invalid: {
    label: 'Invalid',
    className: 'bg-red-100 text-red-700',
    icon: <AlertTriangle className="h-3.5 w-3.5" />,
  },
  duplicate_in_file: {
    label: 'Dup in file',
    className: 'bg-amber-100 text-amber-700',
    icon: <Copy className="h-3.5 w-3.5" />,
  },
  duplicate_in_db: {
    label: 'Already imported',
    className: 'bg-orange-100 text-orange-700',
    icon: <Copy className="h-3.5 w-3.5" />,
  },
  locked: {
    label: 'Locked month',
    className: 'bg-gray-200 text-gray-700',
    icon: <Lock className="h-3.5 w-3.5" />,
  },
};

export default function SalesImportModal({ isOpen, businessId, onClose, onImported }: Props) {
  useDisplayCurrency();
  const [step, setStep] = useState<Step>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<SalesImportPreview | null>(null);
  const [committing, setCommitting] = useState(false);
  const [result, setResult] = useState<SalesImportCommitResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset whenever the modal opens/closes
  useEffect(() => {
    if (!isOpen) return;
    setStep('upload');
    setFile(null);
    setPreview(null);
    setResult(null);
  }, [isOpen]);

  if (!isOpen) return null;

  const basePath = `/businesses/${businessId}/sales/import`;

  // ─── Step 1: Upload ────────────────────────────────────────

  const downloadTemplate = async () => {
    try {
      const res = await api.get(`${basePath}/template`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'paymytax-sales-import-template.xlsx';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      toast.error('Could not download the template. Try again.');
    }
  };

  const validateLocalFile = (f: File): string | null => {
    const ext = f.name.toLowerCase().split('.').pop() ?? '';
    if (ext !== 'xlsx' && ext !== 'csv') {
      return 'Only .xlsx and .csv files are accepted.';
    }
    if (f.size > MAX_FILE_BYTES) {
      return 'File is too large. Maximum 2 MB.';
    }
    if (f.size === 0) {
      return 'File is empty.';
    }
    return null;
  };

  const handleFile = (f: File) => {
    const err = validateLocalFile(f);
    if (err) {
      toast.error(err);
      return;
    }
    setFile(f);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  };

  const uploadForPreview = async () => {
    if (!file) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await api.post<{ data: SalesImportPreview }>(`${basePath}/preview`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setPreview(res.data.data);
      setStep('preview');
    } catch (err: unknown) {
      const apiErr = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error;
      toast.error(apiErr?.message || 'Could not read your file.');
    } finally {
      setUploading(false);
    }
  };

  // ─── Step 2: Preview → commit ──────────────────────────────

  const commit = async () => {
    if (!preview) return;
    setCommitting(true);
    try {
      const res = await api.post<{ data: SalesImportCommitResult }>(`${basePath}/commit`, {
        fileToken: preview.fileToken,
      });
      setResult(res.data.data);
      setStep('result');
      toast.success(`Imported ${res.data.data.imported} sales`);
      // Imported rows are real sales — the dashboard must refresh its totals
      useDashboardEvents.getState().invalidateDashboard('sales_imported');
      onImported();
    } catch (err: unknown) {
      const apiErr = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error;
      toast.error(apiErr?.message || 'Import failed.');
    } finally {
      setCommitting(false);
    }
  };

  // ─── Step 3: Reset for another import ──────────────────────

  const startOver = () => {
    setStep('upload');
    setFile(null);
    setPreview(null);
    setResult(null);
  };

  // ─── Render ────────────────────────────────────────────────

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] w-screen h-screen min-h-screen flex items-center justify-center p-3 sm:p-4 bg-slate-950/60 backdrop-blur-xs overflow-hidden animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget && !uploading && !committing) onClose();
      }}
    >
      <div className="relative z-10 w-full max-w-3xl max-h-[88vh] overflow-hidden rounded-none bg-white shadow-2xl border border-gray-300 flex flex-col my-auto pointer-events-auto animate-in zoom-in-95 duration-150">
        {/* Pinned Straight Header */}
        <div className="shrink-0 flex items-center justify-between border-b border-gray-200 px-5 py-3.5 bg-gray-50">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-none bg-primary-50 text-primary-600 border border-primary-200 shrink-0">
              <FileSpreadsheet className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-gray-900 leading-tight">Import sales from Excel</h2>
              <p className="text-[11px] text-gray-500 mt-0.5">
                Step {step === 'upload' ? 1 : step === 'preview' ? 2 : 3} of 3
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={uploading || committing}
            className="rounded-none p-1.5 text-gray-400 hover:bg-gray-200 hover:text-gray-700 transition-colors disabled:opacity-40"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {step === 'upload' && (
            <UploadStep
              file={file}
              dragActive={dragActive}
              setDragActive={setDragActive}
              onPick={handleFile}
              onDrop={handleDrop}
              onRemove={() => setFile(null)}
              onDownloadTemplate={downloadTemplate}
              inputRef={inputRef}
            />
          )}

          {step === 'preview' && preview && (
            <PreviewStep preview={preview} fileName={file?.name ?? 'upload'} />
          )}

          {step === 'result' && result && <ResultStep result={result} />}
        </div>

        {/* Pinned Straight Footer */}
        <div className="shrink-0 flex items-center justify-between gap-3 border-t border-gray-200 bg-gray-50 px-5 py-3">
          {step === 'upload' && (
            <>
              <Button variant="secondary" onClick={onClose} className="rounded-none border-gray-300">
                Cancel
              </Button>
              <Button onClick={uploadForPreview} isLoading={uploading} disabled={!file} className="rounded-none">
                <Upload className="h-4 w-4" /> Preview import
              </Button>
            </>
          )}

          {step === 'preview' && preview && (
            <>
              <Button variant="secondary" onClick={() => setStep('upload')} className="rounded-none border-gray-300">
                <ArrowLeft className="h-4 w-4" /> Back
              </Button>
              <Button onClick={commit} isLoading={committing} disabled={preview.summary.valid === 0} className="rounded-none">
                Import {preview.summary.valid} row{preview.summary.valid === 1 ? '' : 's'}
              </Button>
            </>
          )}

          {step === 'result' && (
            <>
              <Button variant="secondary" onClick={startOver} className="rounded-none border-gray-300">
                <RefreshCw className="h-4 w-4" /> Import more
              </Button>
              <Button onClick={onClose} className="rounded-none">Close</Button>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

// ─── Step 1 UI ────────────────────────────────────────────────

function UploadStep(props: {
  file: File | null;
  dragActive: boolean;
  setDragActive: (v: boolean) => void;
  onPick: (f: File) => void;
  onDrop: (e: React.DragEvent) => void;
  onRemove: () => void;
  onDownloadTemplate: () => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
}) {
  const { file, dragActive, setDragActive, onPick, onDrop, onRemove, onDownloadTemplate, inputRef } = props;

  return (
    <div className="space-y-4">
      <div className="rounded-none border border-primary-200 bg-primary-50 p-4">
        <div className="flex items-start gap-3">
          <FileSpreadsheet className="mt-0.5 h-5 w-5 shrink-0 text-primary-600" />
          <div className="flex-1 text-sm">
            <p className="font-medium text-primary-900">Start with our template</p>
            <p className="mt-1 text-primary-800">
              Download the .xlsx template, fill in your sales (the 3 grey example rows show the format),
              then upload it here.
            </p>
            <button
              type="button"
              onClick={onDownloadTemplate}
              className="mt-2 inline-flex items-center gap-1.5 rounded-none border border-primary-300 bg-white px-3 py-1.5 text-xs font-medium text-primary-700 shadow-sm hover:bg-primary-100 transition-colors"
            >
              <Download className="h-3.5 w-3.5" /> Download template
            </button>
          </div>
        </div>
      </div>

      {file ? (
        <div className="flex items-center gap-3 rounded-none border border-gray-200 bg-white p-4">
          <FileSpreadsheet className="h-8 w-8 text-green-600" />
          <div className="flex-1 min-w-0">
            <p className="truncate font-medium text-gray-900">{file.name}</p>
            <p className="text-xs text-gray-500">{(file.size / 1024).toFixed(1)} KB</p>
          </div>
          <button
            onClick={onRemove}
            className="rounded-none p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          className={`cursor-pointer rounded-none border-2 border-dashed p-10 text-center transition-colors ${
            dragActive ? 'border-primary-500 bg-primary-50' : 'border-gray-300 bg-gray-50 hover:border-gray-400'
          }`}
        >
          <Upload className="mx-auto h-10 w-10 text-gray-400" />
          <p className="mt-3 font-medium text-gray-700">Drop your .xlsx or .csv here</p>
          <p className="mt-1 text-sm text-gray-500">or click to browse · max 2 MB · up to {MAX_ROWS} rows</p>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onPick(f);
              // reset so picking the same file again re-triggers change
              e.target.value = '';
            }}
          />
        </div>
      )}
    </div>
  );
}

// ─── Step 2 UI ────────────────────────────────────────────────

function PreviewStep({ preview, fileName }: { preview: SalesImportPreview; fileName: string }) {
  const { summary, rows } = preview;

  const chips: Array<{ label: string; count: number; className: string }> = [
    { label: 'Valid', count: summary.valid, className: 'bg-green-50 text-green-700 border-green-200' },
    { label: 'Invalid', count: summary.invalid, className: 'bg-red-50 text-red-700 border-red-200' },
    { label: 'Dup in file', count: summary.duplicateInFile, className: 'bg-amber-50 text-amber-700 border-amber-200' },
    { label: 'Already imported', count: summary.duplicateInDb, className: 'bg-orange-50 text-orange-700 border-orange-200' },
    { label: 'Locked month', count: summary.locked, className: 'bg-gray-100 text-gray-700 border-gray-200' },
  ];

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm text-gray-600">
          Parsed <span className="font-semibold text-gray-900">{fileName}</span> —{' '}
          <span className="font-semibold text-gray-900">{summary.total}</span> data row
          {summary.total === 1 ? '' : 's'}. Only valid rows will be imported.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {chips.map((c) => (
          <span
            key={c.label}
            className={`inline-flex items-center gap-1.5 rounded-none border px-2.5 py-1 text-xs font-medium ${
              c.count === 0 ? 'bg-gray-50 text-gray-400 border-gray-200' : c.className
            }`}
          >
            {c.label}: <span className="font-bold">{c.count}</span>
          </span>
        ))}
      </div>

      <div className="rounded-none border border-gray-200 overflow-hidden">
        <div className="max-h-80 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-gray-50 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
              <tr>
                <th className="px-3 py-2 w-12">Row</th>
                <th className="px-3 py-2 w-32">Status</th>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2 text-right">Amount</th>
                <th className="px-3 py-2">Source</th>
                <th className="px-3 py-2">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((r) => (
                <PreviewRowDisplay key={r.rowNumber} row={r} />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {summary.invalid > 0 && (
        <p className="text-xs text-gray-500">
          Invalid rows will be skipped. Fix them in your spreadsheet and re-upload if you need them.
        </p>
      )}
      {summary.duplicateInDb > 0 && (
        <p className="text-xs text-gray-500">
          Rows with a reference that already exists in your sales will be skipped (no overwriting).
        </p>
      )}
      {summary.locked > 0 && (
        <p className="text-xs text-gray-500">
          Rows in finalized/paid months will be skipped — un-finalize the month if you need to add them.
        </p>
      )}
    </div>
  );
}

function PreviewRowDisplay({ row }: { row: SalesImportPreviewRow }) {
  const badge = STATUS_COPY[row.status];

  return (
    <tr className="hover:bg-gray-50">
      <td className="px-3 py-2 text-gray-500">{row.rowNumber}</td>
      <td className="px-3 py-2">
        <span
          className={`inline-flex items-center gap-1 rounded-none border px-2 py-0.5 text-xs font-medium ${badge.className}`}
        >
          {badge.icon}
          {badge.label}
        </span>
      </td>
      <td className="px-3 py-2 text-gray-600">{row.data?.transactionDate ?? '—'}</td>
      <td className="px-3 py-2 text-right font-medium text-gray-900">
        {row.data ? formatNaira(row.data.amount) : '—'}
      </td>
      <td className="px-3 py-2 capitalize text-gray-600">
        {row.data?.source ? row.data.source.replace(/_/g, ' ') : '—'}
      </td>
      <td className="px-3 py-2 text-xs text-gray-500">
        {row.status === 'invalid' && row.errors ? (
          <ul className="space-y-0.5">
            {row.errors.map((e, i) => (
              <li key={i} className="text-red-600">
                <span className="font-medium">{e.field}:</span> {e.message}
              </li>
            ))}
          </ul>
        ) : (
          <span className="text-gray-500">
            {[row.data?.customerName, row.data?.description, row.data?.referenceId]
              .filter(Boolean)
              .join(' · ') || '—'}
          </span>
        )}
      </td>
    </tr>
  );
}

// ─── Step 3 UI ────────────────────────────────────────────────

function ResultStep({ result }: { result: SalesImportCommitResult }) {
  const skipped =
    result.invalidCount +
    result.duplicateInFileCount +
    result.duplicateInDbCount +
    result.lockedMonthCount +
    result.skippedRaceDuplicates +
    result.skippedLockedAtCommit;

  return (
    <div className="space-y-5">
      <div className="rounded-none border border-green-200 bg-green-50 p-5 text-center">
        <CheckCircle2 className="mx-auto h-10 w-10 text-green-600" />
        <p className="mt-3 text-2xl font-bold text-green-700">
          Imported {result.imported} sale{result.imported === 1 ? '' : 's'}
        </p>
        {skipped > 0 && (
          <p className="mt-1 text-sm text-green-800">
            {skipped} row{skipped === 1 ? '' : 's'} skipped
          </p>
        )}
      </div>

      {skipped > 0 && (
        <div className="rounded-none border border-gray-200 bg-white p-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-gray-500">Skipped breakdown</p>
          <dl className="space-y-1 text-sm">
            <SkipRow label="Invalid rows" value={result.invalidCount} />
            <SkipRow label="Duplicate in file" value={result.duplicateInFileCount} />
            <SkipRow label="Already imported" value={result.duplicateInDbCount} />
            <SkipRow label="Locked month (preview)" value={result.lockedMonthCount} />
            <SkipRow label="Locked month (at commit)" value={result.skippedLockedAtCommit} />
            <SkipRow label="Race duplicates" value={result.skippedRaceDuplicates} />
          </dl>
        </div>
      )}
    </div>
  );
}

function SkipRow({ label, value }: { label: string; value: number }) {
  if (value === 0) return null;
  return (
    <div className="flex items-center justify-between">
      <dt className="text-gray-600">{label}</dt>
      <dd className="font-medium text-gray-900">{value}</dd>
    </div>
  );
}
