import {
  Suspense,
  lazy,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  Calculator,
  CheckCircle2,
  Clock,
  CreditCard,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  BarChart3,
  ListChecks,
  Download,
  Copy,
  Check,
  ShieldCheck,
  Filter,
  Lock,
  RotateCcw,
} from 'lucide-react';
import Card from '@/components/ui/Card.tsx';
import Button from '@/components/ui/Button.tsx';
import Input from '@/components/ui/Input.tsx';
import ErrorState from '@/components/ui/ErrorState.tsx';
import EmptyState from '@/components/ui/EmptyState.tsx';
import PaymentConfirmationModal from '@/components/PaymentConfirmationModal.tsx';
import FinalizeConfirmationModal from '@/components/FinalizeConfirmationModal.tsx';
import TaxProfileCard from '@/components/TaxProfileCard.tsx';
import { useBusinessStore } from '@/stores/business.store.ts';
import { useDashboardEvents } from '@/stores/dashboard.store.ts';
import api, { getErrorMessage } from '@/lib/axios.ts';
import toast from 'react-hot-toast';
import type {
  TaxReport,
  TaxCalculationResult,
  Pagination,
} from '@/types/index.ts';
import { formatNaira } from '@/lib/format';
import { useDisplayCurrency } from '@/hooks/useDisplayCurrency';

// Lazy-load the Analytics tab so Recharts (~150kB gz) only ships when needed.
const LazyTaxAnalytics = lazy(() => import('./TaxAnalytics.tsx'));
const LazyPayments = lazy(() => import('./Payments.tsx'));

function formatMonth(d: string) {
  return new Date(d).toLocaleDateString('en-NG', {
    month: 'long',
    year: 'numeric',
  });
}
function getDueDate(taxMonthStr: string) {
  const d = new Date(taxMonthStr);
  const due = new Date(d.getFullYear(), d.getMonth() + 1, 21);
  return due.toLocaleDateString('en-NG', { day: 'numeric', month: 'short' });
}
function formatShortDate(d: string | Date | undefined | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-NG', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}
function isMonthConcluded(taxMonthStr: string): boolean {
  const d = new Date(taxMonthStr);
  const firstDayOfNextMonth = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  const now = new Date();
  const todayOnly = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return todayOnly >= firstDayOfNextMonth;
}
function getFinalizeOpensLabel(taxMonthStr: string): string {
  const d = new Date(taxMonthStr);
  const firstDayOfNextMonth = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  return firstDayOfNextMonth.toLocaleDateString('en-NG', {
    day: 'numeric',
    month: 'short',
  });
}

// ─── Shell ──────────────────────────────────────────────────
// Owns the header + tab switcher. Tab state is URL-backed (?tab=analytics),
// so bookmarking, back-button, and bar-click-to-jump all "just work".

type TabKey = 'reports' | 'analytics' | 'payments';

// Tax remittance stays hidden until the NRS payment integration is granted.
// Flip VITE_ENABLE_TAX_PAYMENTS=true to restore the Pay flow.
const TAX_PAYMENTS_ENABLED =
  import.meta.env.VITE_ENABLE_TAX_PAYMENTS === 'true';

export default function TaxReports() {
  useDisplayCurrency();
  const [params, setParams] = useSearchParams();
  const rawTab = params.get('tab');
  const tab: TabKey =
    rawTab === 'analytics' || rawTab === 'payments' ? rawTab : 'reports';
  const highlight = params.get('highlight');

  const setTab = (next: TabKey) => {
    const p = new URLSearchParams(params);
    if (next !== 'reports') p.set('tab', next);
    else p.delete('tab');
    p.delete('highlight'); // manual tab change clears any drill-through highlight
    setParams(p, { replace: true });
  };

  return (
    <div className='space-y-6'>
      <div>
        <h1 className='text-2xl font-bold text-gray-900'>Tax Reports</h1>
        <p className='mt-1 font-body text-sm text-gray-500'>
          {TAX_PAYMENTS_ENABLED
            ? 'Calculate, finalize, and pay your monthly tax — with a visual history view.'
            : 'Calculate and finalize your monthly tax — with a visual history view.'}
        </p>
      </div>

      <Tabs value={tab} onChange={setTab} />

      {tab === 'reports' ? (
        <TaxReportsList highlightedReportId={highlight} />
      ) : tab === 'analytics' ? (
        <Suspense fallback={<ChartSkeleton />}>
          <LazyTaxAnalytics />
        </Suspense>
      ) : (
        <Suspense
          fallback={
            <div className='py-12 text-center text-gray-400 font-body text-sm'>
              Loading payment receipts...
            </div>
          }
        >
          <LazyPayments embedded={true} />
        </Suspense>
      )}
    </div>
  );
}

// ─── Tabs ───────────────────────────────────────────────────

function Tabs({
  value,
  onChange,
}: {
  value: TabKey;
  onChange: (t: TabKey) => void;
}) {
  const base =
    'inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2';
  const active = 'bg-primary-600 text-white shadow-sm';
  const inactive =
    'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50';

  return (
    <div role='tablist' aria-label='Tax views' className='flex flex-wrap gap-2'>
      <button
        role='tab'
        aria-selected={value === 'reports'}
        className={`${base} ${value === 'reports' ? active : inactive}`}
        onClick={() => onChange('reports')}
      >
        <ListChecks className='h-4 w-4' /> Reports
      </button>
      <button
        role='tab'
        aria-selected={value === 'analytics'}
        className={`${base} ${value === 'analytics' ? active : inactive}`}
        onClick={() => onChange('analytics')}
      >
        <BarChart3 className='h-4 w-4' /> Analytics
      </button>
      <button
        role='tab'
        aria-selected={value === 'payments'}
        className={`${base} ${value === 'payments' ? active : inactive}`}
        onClick={() => onChange('payments')}
      >
        <CreditCard className='h-4 w-4' /> Receipts &amp; Payments
      </button>
    </div>
  );
}

function ChartSkeleton() {
  return (
    <div className='space-y-4'>
      <div className='h-24 animate-pulse rounded-lg bg-gray-100' />
      <div className='h-80 animate-pulse rounded-lg bg-gray-100' />
    </div>
  );
}

// ─── Reports List (previously the whole page) ───────────────

function TaxReportsList({
  highlightedReportId,
}: {
  highlightedReportId: string | null;
}) {
  const fetchReportsSeqRef = useRef(0);
  const biz = useBusinessStore((s) => s.activeBusiness);
  const invalidateDashboard = useDashboardEvents((s) => s.invalidateDashboard);
  const [reports, setReports] = useState<TaxReport[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterYear, setFilterYear] = useState<string>('all');

  // Expanded rows
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [copiedRef, setCopiedRef] = useState<string | null>(null);

  // Calculate form
  const [showCalc, setShowCalc] = useState(false);
  const [calcMonth, setCalcMonth] = useState(String(new Date().getMonth() + 1));
  const [calcYear, setCalcYear] = useState(String(new Date().getFullYear()));
  const [calculating, setCalculating] = useState(false);

  // Warnings from calculation
  const [warnings, setWarnings] = useState<{ type: string; message: string }[]>(
    [],
  );

  // Full calculation response — carries the VAT split and annual provisions
  const [calcResult, setCalcResult] = useState<TaxCalculationResult | null>(
    null,
  );

  // Pre-Payment Confirmation Bill Modal
  const [paymentModalReport, setPaymentModalReport] =
    useState<TaxReport | null>(null);

  // Pre-Finalize Confirmation Modal
  const [finalizeModalReport, setFinalizeModalReport] =
    useState<TaxReport | null>(null);

  // Tax Slip & P&L Statement download state
  const [downloadingSlipId, setDownloadingSlipId] = useState<string | null>(
    null,
  );
  const [downloadingPnlId, setDownloadingPnlId] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const autoPnlTriggeredRef = useRef(false);

  // Highlight-on-scroll ref map
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [flashId, setFlashId] = useState<string | null>(null);

  const taxPath = biz ? `/businesses/${biz.id}/tax` : '';

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const copyToClipboard = (text: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    navigator.clipboard.writeText(text);
    setCopiedRef(text);
    setTimeout(() => setCopiedRef(null), 2000);
    toast.success('Transaction reference copied to clipboard');
  };

  const handleDownloadTaxSlip = async (
    report: TaxReport,
    e?: React.MouseEvent,
  ) => {
    if (e) e.stopPropagation();
    if (!biz) return;
    try {
      setDownloadingSlipId(report.id);
      const res = await api.get(`${taxPath}/reports/${report.id}/slip`, {
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(
        new Blob([res.data], { type: 'application/pdf' }),
      );
      const link = document.createElement('a');
      link.href = url;
      const monthStr = new Date(report.taxMonth)
        .toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
        .replace(/\s+/g, '-');
      const safeBizName = biz.businessName.replace(/[^a-zA-Z0-9]/g, '_');
      link.setAttribute('download', `Tax-Slip-${safeBizName}-${monthStr}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success('Tax slip downloaded successfully');
    } catch (err: any) {
      toast.error(
        err.response?.data?.error?.message || 'Failed to download tax slip',
      );
    } finally {
      setDownloadingSlipId(null);
    }
  };

  const handleDownloadPnlStatement = async (
    month: number,
    year: number,
    idKey: string,
    e?: React.MouseEvent,
  ) => {
    if (e) e.stopPropagation();
    if (!biz) return;
    try {
      setDownloadingPnlId(idKey);
      const res = await api.get(`${taxPath}/statements/pnl`, {
        params: { month, year },
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(
        new Blob([res.data], { type: 'application/pdf' }),
      );
      const link = document.createElement('a');
      link.href = url;
      const monthStr = new Date(year, month - 1, 1)
        .toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
        .replace(/\s+/g, '-');
      const safeBizName = biz.businessName.replace(/[^a-zA-Z0-9]/g, '_');
      link.setAttribute(
        'download',
        `PnL-Statement-${safeBizName}-${monthStr}.pdf`,
      );
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success('Profit & Loss statement downloaded successfully');
    } catch (err: any) {
      toast.error(
        err.response?.data?.error?.message ||
          'Failed to download P&L statement',
      );
    } finally {
      setDownloadingPnlId(null);
    }
  };

  // Auto-download P&L statement when linked from email (?pnlMonth=M&pnlYear=Y)
  useEffect(() => {
    if (!biz || autoPnlTriggeredRef.current) return;
    const pnlMonth = Number(searchParams.get('pnlMonth'));
    const pnlYear = Number(searchParams.get('pnlYear'));
    if (pnlMonth >= 1 && pnlMonth <= 12 && pnlYear >= 2020) {
      autoPnlTriggeredRef.current = true;
      void handleDownloadPnlStatement(
        pnlMonth,
        pnlYear,
        `auto-${pnlYear}-${pnlMonth}`,
      );
      const next = new URLSearchParams(searchParams);
      next.delete('pnlMonth');
      next.delete('pnlYear');
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [biz, searchParams]);

  const fetchReports = () => {
    if (!biz) return;
    const seq = ++fetchReportsSeqRef.current;
    setIsLoading(true);
    setError(null);
    const params: Record<string, any> = { page, limit: 12 };
    if (filterStatus && filterStatus !== 'all') params.status = filterStatus;
    if (filterYear && filterYear !== 'all') params.year = Number(filterYear);

    api
      .get(`${taxPath}/reports`, { params })
      .then((r) => {
        if (seq !== fetchReportsSeqRef.current) return; // a newer fetchReports call superseded this one
        setReports(r.data.data);
        setPagination(r.data.pagination);
      })
      .catch((e) => {
        if (seq !== fetchReportsSeqRef.current) return;
        setError(getErrorMessage(e, 'Failed to load tax reports.'));
      })
      .finally(() => {
        if (seq === fetchReportsSeqRef.current) setIsLoading(false);
      });
  };

  useEffect(() => {
    fetchReports();
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [biz, page, filterStatus, filterYear]);

  // A calculation result belongs to the business it was run against.
  useEffect(() => {
    setCalcResult(null);
    setWarnings([]);
  }, [biz?.id]);

  // When a report ID is passed in via `?highlight=`, auto-expand it, scroll to it, and flash ring
  useEffect(() => {
    if (!highlightedReportId || isLoading) return;
    const el = cardRefs.current[highlightedReportId];
    if (!el) return;

    setExpandedIds((prev) => new Set([...prev, highlightedReportId]));
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setFlashId(highlightedReportId);
    const timer = setTimeout(() => setFlashId(null), 2000);
    return () => clearTimeout(timer);
  }, [highlightedReportId, reports, isLoading]);

  const handleCalculate = async (e: FormEvent) => {
    e.preventDefault();
    setCalculating(true);
    try {
      const res = await api.post(`${taxPath}/calculate`, {
        month: Number(calcMonth),
        year: Number(calcYear),
      });
      toast.success('Tax calculated');
      invalidateDashboard('tax_calculated');
      setWarnings(res.data.warnings || []);
      setCalcResult(res.data.data ?? null);
      setShowCalc(false);
      fetchReports();
    } catch (err: any) {
      toast.error(err.response?.data?.error?.message || 'Calculation failed');
    } finally {
      setCalculating(false);
    }
  };

  const openFinalizeConfirm = (report: TaxReport, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setFinalizeModalReport(report);
  };

  const handleFinalize = async () => {
    if (!finalizeModalReport) return;
    try {
      await api.post(`${taxPath}/reports/${finalizeModalReport.id}/finalize`);
      toast.success('Report finalized with verified live numbers');
      invalidateDashboard('tax_finalized');
      fetchReports();
    } catch (err: any) {
      toast.error(
        err.response?.data?.error?.message || 'Failed to finalize report',
      );
      throw err;
    }
  };

  const handleUnfinalize = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      await api.post(`${taxPath}/reports/${id}/unfinalize`);
      toast.success('Report un-finalized');
      fetchReports();
    } catch (err: any) {
      toast.error(err.response?.data?.error?.message || 'Failed');
    }
  };

  const handleReset = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (
      !window.confirm(
        'Are you sure you want to reset this tax report back to draft? Any recorded test payments for this month will be cleared.',
      )
    ) {
      return;
    }
    try {
      await api.post(`${taxPath}/reports/${id}/reset`);
      toast.success('Report reset to draft successfully');
      invalidateDashboard('tax_finalized');
      fetchReports();
    } catch (err: any) {
      toast.error(
        err.response?.data?.error?.message || 'Failed to reset report',
      );
    }
  };

  if (!biz)
    return (
      <p className='py-20 text-center text-gray-400'>
        Select a business first.
      </p>
    );

  const currentYear = new Date().getFullYear();
  const yearOptions = [
    'all',
    String(currentYear),
    String(currentYear - 1),
    String(currentYear - 2),
  ];

  return (
    <div className='space-y-5'>
      {biz && <TaxProfileCard businessId={biz.id} businessName={biz.businessName} />}
      {/* Top Filter & Action Bar */}
      <div className='flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white p-3.5 rounded-xl border border-gray-200/80 shadow-2xs'>
        <div className='flex flex-wrap items-center gap-2'>
          {/* Status Filter Pills */}
          <div className='inline-flex rounded-lg bg-gray-100 p-0.5 text-xs font-medium'>
            {[
              { key: 'all', label: 'All' },
              { key: 'completed', label: 'Paid' },
              { key: 'pending', label: 'Pending' },
            ].map((tab) => (
              <button
                key={tab.key}
                type='button'
                onClick={() => {
                  setFilterStatus(tab.key);
                  setPage(1);
                }}
                className={`px-3 py-1 rounded-md transition-all ${
                  filterStatus === tab.key
                    ? 'bg-white text-gray-900 shadow-2xs font-semibold'
                    : 'text-gray-500 hover:text-gray-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Year Filter Dropdown */}
          <div className='flex items-center gap-1.5 text-xs text-gray-500 pl-1'>
            <Filter className='h-3.5 w-3.5 text-gray-400' />
            <select
              value={filterYear}
              onChange={(e) => {
                setFilterYear(e.target.value);
                setPage(1);
              }}
              className='rounded-md border border-gray-200 bg-white py-1 px-2 text-xs font-medium text-gray-700 focus:outline-none focus:ring-1 focus:ring-primary-500'
            >
              <option value='all'>All Years</option>
              {yearOptions
                .filter((y) => y !== 'all')
                .map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
            </select>
          </div>
        </div>

        <div className='flex flex-wrap items-center gap-2'>
          <Button
            variant='outline'
            size='sm'
            onClick={() =>
              handleDownloadPnlStatement(
                Number(calcMonth),
                Number(calcYear),
                `toolbar-${calcYear}-${calcMonth}`,
              )
            }
            isLoading={downloadingPnlId === `toolbar-${calcYear}-${calcMonth}`}
            className='border-purple-200 text-purple-900 hover:bg-purple-50 text-xs font-semibold'
            title='Download Profit & Loss Statement PDF for the selected month'
          >
            <Download className='h-3.5 w-3.5 mr-1.5 text-purple-700' />
            Download P&amp;L Statement (PDF)
          </Button>
          <Button onClick={() => setShowCalc(!showCalc)} size='sm'>
            <Calculator className='h-4 w-4 mr-1.5' /> Calculate Tax
          </Button>
        </div>
      </div>

      {showCalc && (
        <Card>
          <h2 className='mb-4 text-lg font-semibold text-gray-900'>
            Calculate Monthly Tax
          </h2>
          <form
            onSubmit={handleCalculate}
            className='flex flex-wrap items-end gap-4'
          >
            <div className='space-y-1'>
              <label className='block text-sm font-medium text-gray-700'>
                Month
              </label>
              <select
                value={calcMonth}
                onChange={(e) => setCalcMonth(e.target.value)}
                className='block rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500'
              >
                {Array.from({ length: 12 }, (_, i) => (
                  <option key={i + 1} value={i + 1}>
                    {new Date(2000, i).toLocaleString('en', { month: 'long' })}
                  </option>
                ))}
              </select>
            </div>
            <Input
              label='Year'
              type='number'
              min='2020'
              max='2100'
              value={calcYear}
              onChange={(e) => setCalcYear(e.target.value)}
              required
            />
            <Button type='submit' isLoading={calculating}>
              Calculate
            </Button>
            <Button
              type='button'
              variant='outline'
              isLoading={downloadingPnlId === `calc-${calcYear}-${calcMonth}`}
              onClick={() =>
                handleDownloadPnlStatement(
                  Number(calcMonth),
                  Number(calcYear),
                  `calc-${calcYear}-${calcMonth}`,
                )
              }
            >
              <Download className='h-4 w-4 mr-1.5' /> P&amp;L Statement (PDF)
            </Button>
            <Button
              type='button'
              variant='secondary'
              onClick={() => setShowCalc(false)}
            >
              Cancel
            </Button>
          </form>
        </Card>
      )}

      {warnings.length > 0 && (
        <div className='space-y-2'>
          {warnings.map((w, i) => (
            <div
              key={i}
              className='flex items-start gap-3 rounded-lg border border-yellow-300 bg-yellow-50 px-4 py-3'
            >
              <AlertCircle className='mt-0.5 h-5 w-5 text-yellow-600 shrink-0' />
              <p className='text-sm text-yellow-800'>{w.message}</p>
            </div>
          ))}
        </div>
      )}

      {calcResult && (
        <Card className='border-primary-200 bg-primary-50/40'>
          <div className='flex items-start justify-between gap-4'>
            <div>
              <h3 className='text-sm font-semibold text-gray-900'>
                {formatMonth(calcResult.taxMonth)} — statutory assessment
              </h3>
              <p className='mt-1 text-xs leading-relaxed text-gray-600'>
                {calcResult.advisory?.note ?? 'Calculation complete.'}
              </p>
            </div>
            <button
              type='button'
              onClick={() => setCalcResult(null)}
              className='shrink-0 text-xs font-medium text-gray-500 hover:text-gray-800'
              aria-label='Dismiss calculation result'
            >
              Dismiss
            </button>
          </div>

          <dl className='mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4'>
            {calcResult.strategyUsed === 'REVIEW_REQUIRED' ? (
              <div className='col-span-2 sm:col-span-4'>
                <dt className='text-[10px] font-semibold uppercase tracking-wider text-gray-500'>
                  Status
                </dt>
                <dd className='mt-0.5 text-sm font-bold text-amber-700'>
                  Pending review — no statutory rate applied
                </dd>
              </div>
            ) : (
              <div>
                <dt className='text-[10px] font-semibold uppercase tracking-wider text-gray-500'>
                  {calcResult.taxBasis === 'vat'
                    ? 'Net VAT payable'
                    : 'Monthly remittance'}
                </dt>
                <dd className='mt-0.5 text-sm font-bold text-primary-800 tabular-nums'>
                  {formatNaira(Number(calcResult.taxPayable))}
                </dd>
              </div>
            )}
            {calcResult.advisory?.outputVat !== undefined && (
              <div>
                <dt className='text-[10px] font-semibold uppercase tracking-wider text-gray-500'>
                  Output VAT
                </dt>
                <dd className='mt-0.5 text-sm font-semibold text-gray-800 tabular-nums'>
                  {formatNaira(Number(calcResult.advisory.outputVat))}
                </dd>
              </div>
            )}
            {calcResult.advisory?.inputVat !== undefined && (
              <div>
                <dt className='text-[10px] font-semibold uppercase tracking-wider text-gray-500'>
                  Input VAT
                </dt>
                <dd className='mt-0.5 text-sm font-semibold text-gray-800 tabular-nums'>
                  {formatNaira(Number(calcResult.advisory.inputVat))}
                </dd>
              </div>
            )}
            {calcResult.advisory?.annualCitEstimate !== undefined && (
              <div>
                <dt className='text-[10px] font-semibold uppercase tracking-wider text-gray-500'>
                  Annual CIT provision
                </dt>
                <dd className='mt-0.5 text-sm font-semibold text-gray-800 tabular-nums'>
                  {formatNaira(Number(calcResult.advisory.annualCitEstimate))}
                </dd>
              </div>
            )}
            {calcResult.advisory?.annualDevLevyEstimate !== undefined && (
              <div>
                <dt className='text-[10px] font-semibold uppercase tracking-wider text-gray-500'>
                  Annual dev levy
                </dt>
                <dd className='mt-0.5 text-sm font-semibold text-gray-800 tabular-nums'>
                  {formatNaira(Number(calcResult.advisory.annualDevLevyEstimate))}
                </dd>
              </div>
            )}
            {calcResult.advisory?.annualPitEstimate !== undefined && (
              <div>
                <dt className='text-[10px] font-semibold uppercase tracking-wider text-gray-500'>
                  Annual PIT estimate
                </dt>
                <dd className='mt-0.5 text-sm font-semibold text-gray-800 tabular-nums'>
                  {formatNaira(Number(calcResult.advisory.annualPitEstimate))}
                </dd>
              </div>
            )}
          </dl>

          {(calcResult.advisory?.annualCitEstimate !== undefined ||
            calcResult.advisory?.annualPitEstimate !== undefined) && (
            <p className='mt-3 text-[11px] text-gray-500'>
              Annual income-tax provisions are advisory — they are not collected
              monthly. Only the monthly figure above is remitted.
            </p>
          )}
        </Card>
      )}

      {error ? (
        <ErrorState message={error} onRetry={fetchReports} />
      ) : isLoading ? (
        <div className='py-16 text-center text-gray-400'>
          Loading tax reports...
        </div>
      ) : reports.length === 0 ? (
        <EmptyState
          icon={Calculator}
          message='No tax reports found. Calculate your first tax report above.'
        />
      ) : (
        <div className='space-y-2.5'>
          {reports.map((r) => {
            const isFlashing = flashId === r.id;
            const isExpanded = expandedIds.has(r.id);
            const isPaid = r.paymentStatus === 'completed' || r.isLocked;
            const ref = r.latestPayment?.transactionReference;

            return (
              <div
                key={r.id}
                ref={(el) => {
                  cardRefs.current[r.id] = el;
                }}
                className={`rounded-xl border transition-all duration-200 overflow-hidden bg-white ${
                  isFlashing
                    ? 'ring-2 ring-primary-500 shadow-md border-primary-300'
                    : isExpanded
                      ? 'border-gray-300 shadow-xs'
                      : 'border-gray-200/90 hover:border-gray-300 hover:shadow-2xs'
                }`}
              >
                {/* ── Compact Master Row (~72px) ── */}
                <div
                  onClick={() => toggleExpand(r.id)}
                  className='p-3.5 sm:p-4 cursor-pointer select-none flex flex-col md:flex-row md:items-center justify-between gap-3'
                >
                  {/* Left: Period & Status */}
                  <div className='flex items-center gap-3 min-w-[220px]'>
                    <div className='p-1 rounded-md text-gray-400 hover:text-gray-700 transition-colors'>
                      {isExpanded ? (
                        <ChevronUp className='h-4 w-4 text-gray-700' />
                      ) : (
                        <ChevronDown className='h-4 w-4 text-gray-400' />
                      )}
                    </div>

                    <div>
                      <div className='flex items-center gap-2 flex-wrap'>
                        <span className='font-bold text-gray-900 text-sm sm:text-base'>
                          {formatMonth(r.taxMonth)}
                        </span>
                        {r.isNilReturn ? (
                          <span className='inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700 border border-blue-200'>
                            <CheckCircle2 className='h-3 w-3 text-blue-600' />{' '}
                            Nil Return (₦0 Tax)
                          </span>
                        ) : isPaid ? (
                          <span className='inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 border border-emerald-200/70'>
                            <CheckCircle2 className='h-3 w-3 text-emerald-600' />{' '}
                            Paid &amp; Remitted
                          </span>
                        ) : r.isFinalized ? (
                          <span className='inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 border border-amber-200/70'>
                            <Clock className='h-3 w-3 text-amber-600' />{' '}
                            Awaiting Payment
                          </span>
                        ) : isMonthConcluded(r.taxMonth) ? (
                          <span className='inline-flex items-center gap-1 rounded-full bg-purple-50 px-2 py-0.5 text-[11px] font-semibold text-purple-700 border border-purple-200'>
                            Ready to Finalize
                          </span>
                        ) : (
                          <span className='inline-flex items-center gap-1 rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-700 border border-sky-200'>
                            Live Estimate (In Progress)
                          </span>
                        )}
                      </div>

                      {/* Payment Ref or Due Date */}
                      <div className='flex items-center gap-1.5 text-xs text-gray-500 mt-0.5'>
                        {isPaid ? (
                          <span className='inline-flex items-center gap-1 font-mono text-[11px] text-gray-600'>
                            <span className='bg-gray-100 px-1.5 py-0.5 rounded text-gray-700 font-semibold'>
                              {ref ? `${ref.slice(0, 18)}...` : 'Confirmed'}
                            </span>
                            {ref && (
                              <button
                                type='button'
                                onClick={(e) => copyToClipboard(ref, e)}
                                title='Copy reference'
                                className='text-gray-400 hover:text-gray-700 p-0.5 transition-colors'
                              >
                                {copiedRef === ref ? (
                                  <Check className='h-3 w-3 text-emerald-600' />
                                ) : (
                                  <Copy className='h-3 w-3' />
                                )}
                              </button>
                            )}
                            {r.latestPayment?.paymentDate && (
                              <span className='text-[11px] text-gray-400 hidden sm:inline'>
                                • Paid{' '}
                                {formatShortDate(r.latestPayment.paymentDate)}
                              </span>
                            )}
                          </span>
                        ) : isMonthConcluded(r.taxMonth) ? (
                          <span className='text-[11px] text-purple-700 font-medium'>
                            Period closed • Due by {getDueDate(r.taxMonth)}
                          </span>
                        ) : (
                          <span className='text-[11px] text-sky-700 font-medium'>
                            Period active • Finalization opens{' '}
                            {getFinalizeOpensLabel(r.taxMonth)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Middle: Financial Turnover Summary */}
                  <div className='hidden lg:flex items-center gap-3 text-xs bg-slate-50/80 px-3.5 py-1.5 rounded-lg border border-gray-100'>
                    <div>
                      <span className='text-gray-400 text-[10px] uppercase tracking-wider block'>
                        Sales
                      </span>
                      <span className='font-semibold text-gray-800 tabular-nums'>
                        {formatNaira(Number(r.totalSales))}
                      </span>
                    </div>
                    <span className='text-gray-300'>−</span>
                    <div>
                      <span className='text-gray-400 text-[10px] uppercase tracking-wider block'>
                        Expenses
                      </span>
                      <span className='font-semibold text-gray-800 tabular-nums'>
                        {formatNaira(Number(r.totalExpenses))}
                      </span>
                    </div>
                    <span className='text-gray-300'>=</span>
                    <div>
                      <span className='text-purple-600 text-[10px] uppercase tracking-wider block font-medium'>
                        Gross Profit
                      </span>
                      <span className='font-bold text-purple-950 tabular-nums'>
                        {formatNaira(Number(r.grossProfit))}
                      </span>
                    </div>
                  </div>

                  {/* Right: Tax Payable & Actions */}
                  <div className='flex items-center justify-between md:justify-end gap-3 shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-gray-100'>
                    <div className='text-left md:text-right'>
                      <span className='text-[10px] text-gray-400 uppercase tracking-wider block'>
                        {r.needsManualReview
                          ? 'Assessment pending'
                          : r.taxBasis === 'vat'
                          ? 'Net VAT payable'
                          : 'Monthly remittance'}
                      </span>
                      <span className='text-base font-extrabold text-gray-900 tabular-nums'>
                        {formatNaira(Number(r.taxPayable))}
                      </span>
                    </div>

                    <div className='flex items-center gap-1.5'>
                      {!isExpanded && (
                        <>
                          <Button
                            size='sm'
                            variant='outline'
                            subscriptionExempt={true}
                            onClick={(e) => {
                              const d = new Date(r.taxMonth);
                              handleDownloadPnlStatement(
                                d.getUTCMonth() + 1,
                                d.getUTCFullYear(),
                                r.id,
                                e,
                              );
                            }}
                            isLoading={downloadingPnlId === r.id}
                            className='h-8 px-2.5 text-xs border-gray-200 text-gray-700 hover:bg-gray-50 font-medium'
                            title='Download Profit & Loss Statement PDF'
                          >
                            <Download className='h-3.5 w-3.5 sm:mr-1' />
                            <span className='hidden sm:inline'>P&amp;L</span>
                          </Button>
                          <Button
                            size='sm'
                            variant='outline'
                            subscriptionExempt={true}
                            onClick={(e) => handleDownloadTaxSlip(r, e)}
                            isLoading={downloadingSlipId === r.id}
                            className='h-8 px-2.5 text-xs border-purple-200 text-purple-900 hover:bg-purple-50 font-medium'
                            title='Download official NRS assessment slip'
                          >
                            <Download className='h-3.5 w-3.5 sm:mr-1' />
                            <span className='hidden sm:inline'>Slip</span>
                          </Button>
                        </>
                      )}

                      {!r.isLocked &&
                        !r.isFinalized &&
                        (isMonthConcluded(r.taxMonth) ? (
                          <Button
                            size='sm'
                            variant='secondary'
                            onClick={(e) => openFinalizeConfirm(r, e)}
                            title='Finalize tax report'
                          >
                            <CheckCircle2 className='h-3.5 w-3.5 mr-1 text-emerald-600' />
                            Finalize
                          </Button>
                        ) : (
                          <Button
                            size='sm'
                            variant='outline'
                            disabled={true}
                            className='h-8 px-3 text-xs text-gray-400 border-gray-200 cursor-not-allowed opacity-60 font-medium'
                            title={`Finalization opens on the first day of the following month (${getFinalizeOpensLabel(r.taxMonth)}). Transactions can still be recorded throughout the active month.`}
                          >
                            <Lock className='h-3.5 w-3.5 mr-1 text-gray-400' />
                            Finalize (Opens {getFinalizeOpensLabel(r.taxMonth)})
                          </Button>
                        ))}

                      {r.isFinalized &&
                        !r.isLocked &&
                        !r.isNilReturn &&
                        (TAX_PAYMENTS_ENABLED ? (
                          <Button
                            size='sm'
                            className='h-8 px-3 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-semibold shadow-2xs'
                            onClick={(e) => {
                              e.stopPropagation();
                              setPaymentModalReport(r);
                            }}
                          >
                            <CreditCard className='h-3.5 w-3.5 mr-1' />
                            Pay
                          </Button>
                        ) : (
                          <span
                            title='NRS payment integration in progress'
                            className='inline-flex h-8 items-center gap-1 rounded-lg border border-gray-200 bg-gray-50 px-2.5 text-xs font-medium text-gray-400'
                          >
                            <Clock className='h-3.5 w-3.5' />
                            Remittance coming soon
                          </span>
                        ))}

                      <button
                        type='button'
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleExpand(r.id);
                        }}
                        className='text-xs font-semibold text-primary-600 hover:text-primary-800 px-2 py-1'
                      >
                        {isExpanded ? 'Close' : 'View'}
                      </button>
                    </div>
                  </div>
                </div>

                {/* ── Expanded Master-Detail Drawer ── */}
                {isExpanded && (
                  <div className='border-t border-gray-100 bg-slate-50/70 p-4 sm:p-5 space-y-4 animate-in fade-in duration-150'>
                    {/* 4 Core Tax Slip Metrics Grid */}
                    <div className='grid grid-cols-2 gap-2.5 sm:grid-cols-4'>
                      <div className='rounded-lg bg-white p-3 border border-gray-200/80 shadow-2xs'>
                        <span className='text-[10px] font-semibold text-gray-500 uppercase tracking-wider block'>
                          Total Sales
                        </span>
                        <p className='mt-1 text-sm font-bold text-gray-900 tabular-nums'>
                          {formatNaira(Number(r.totalSales))}
                        </p>
                        <span className='text-[10px] text-gray-400'>
                          Turnover collected
                        </span>
                      </div>

                      <div className='rounded-lg bg-white p-3 border border-gray-200/80 shadow-2xs'>
                        <span className='text-[10px] font-semibold text-gray-500 uppercase tracking-wider block'>
                          Total Expenses
                        </span>
                        <p className='mt-1 text-sm font-bold text-gray-700 tabular-nums'>
                          {formatNaira(Number(r.totalExpenses))}
                        </p>
                        <span className='text-[10px] text-gray-400'>
                          Allowable deductions
                        </span>
                      </div>

                      <div className='rounded-lg bg-white p-3 border border-gray-200/80 shadow-2xs'>
                        <span className='text-[10px] font-semibold text-purple-900 uppercase tracking-wider block'>
                          Gross Profit
                        </span>
                        <p className='mt-1 text-sm font-bold text-purple-950 tabular-nums'>
                          {formatNaira(Number(r.grossProfit))}
                        </p>
                        <span className='text-[10px] text-purple-600'>
                          Sales − Expenses
                        </span>
                      </div>

                      <div className='rounded-lg bg-gradient-to-br from-purple-900 via-indigo-900 to-purple-950 text-white p-3 border border-purple-800 shadow-2xs'>
                        <div className='flex items-center justify-between'>
                          <span className='text-[10px] font-semibold text-purple-200 uppercase tracking-wider'>
                            {r.needsManualReview
                              ? 'Assessment Pending'
                              : r.taxBasis === 'vat'
                              ? 'Net VAT Payable'
                              : 'Monthly Remittance'}
                          </span>
                          <span className='text-[9px] font-bold text-purple-200 bg-purple-800/80 px-1 py-0.5 rounded'>
                            {r.needsManualReview
                              ? '—'
                              : r.taxBasis === 'vat'
                              ? `${Number(r.taxRate)}%`
                              : 'EXEMPT'}
                          </span>
                        </div>
                        <p className='mt-1 text-base font-extrabold text-white tabular-nums tracking-tight'>
                          {formatNaira(Number(r.taxPayable))}
                        </p>
                        <span className='text-[10px] text-purple-200/90'>
                          {r.needsManualReview
                            ? 'Complete your tax profile to determine statutory rates'
                            : r.taxBasis === 'vat'
                            ? `Net VAT at ${Number(r.taxRate)}% (output − input)`
                            : r.taxBasis === 'pit-provision'
                            ? 'VAT not chargeable — PIT is assessed annually with your State IRS'
                            : 'VAT not chargeable — CIT is assessed annually'}
                        </span>
                      </div>
                    </div>

                    {/* Dedicated Payment & Settlement Details Box */}
                    {isPaid ? (
                      <div className='rounded-xl border border-emerald-200 bg-emerald-50/70 p-3.5 sm:p-4 text-xs'>
                        <div className='flex items-center justify-between pb-2.5 border-b border-emerald-200/70'>
                          <div className='flex items-center gap-2'>
                            <ShieldCheck className='h-4 w-4 text-emerald-700' />
                            <span className='font-bold text-emerald-950 uppercase tracking-wider text-[11px]'>
                              NRS Statutory Settlement Confirmation
                            </span>
                          </div>
                          <span className='font-semibold text-emerald-800 bg-emerald-100/90 px-2 py-0.5 rounded-full text-[10px]'>
                            Compliant &amp; Locked
                          </span>
                        </div>

                        <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-3'>
                          <div>
                            <span className='text-gray-500 text-[10px] uppercase tracking-wider block'>
                              Transaction Reference
                            </span>
                            <div className='flex items-center gap-1.5 mt-0.5'>
                              <span className='font-mono font-semibold text-gray-900 break-all text-[11px]'>
                                {ref || 'STATUTORY-CONFIRMED'}
                              </span>
                              {ref && (
                                <button
                                  type='button'
                                  onClick={(e) => copyToClipboard(ref, e)}
                                  title='Copy reference'
                                  className='text-gray-400 hover:text-gray-800 p-0.5'
                                >
                                  {copiedRef === ref ? (
                                    <Check className='h-3.5 w-3.5 text-emerald-600' />
                                  ) : (
                                    <Copy className='h-3.5 w-3.5' />
                                  )}
                                </button>
                              )}
                            </div>
                          </div>

                          <div>
                            <span className='text-gray-500 text-[10px] uppercase tracking-wider block'>
                              Payment Channel
                            </span>
                            <span className='font-medium text-gray-800 capitalize mt-0.5 block'>
                              {r.latestPayment?.paymentMethod ||
                                'Online Checkout'}
                            </span>
                          </div>

                          <div>
                            <span className='text-gray-500 text-[10px] uppercase tracking-wider block'>
                              Date Settled
                            </span>
                            <span className='font-medium text-gray-800 mt-0.5 block'>
                              {formatShortDate(
                                r.latestPayment?.paymentDate || r.lockedAt,
                              )}
                            </span>
                          </div>

                          <div>
                            <span className='text-gray-500 text-[10px] uppercase tracking-wider block'>
                              Remittance Status
                            </span>
                            <span className='inline-flex items-center gap-1 text-emerald-800 font-semibold mt-0.5'>
                              <CheckCircle2 className='h-3.5 w-3.5 text-emerald-600' />
                              NRS Direct Verified
                            </span>
                          </div>
                        </div>
                      </div>
                    ) : r.isNilReturn ? (
                      <div className='rounded-xl border border-blue-200 bg-blue-50/60 p-3.5 text-xs text-blue-900 flex items-start gap-2.5'>
                        <CheckCircle2 className='h-4 w-4 text-blue-600 shrink-0 mt-0.5' />
                        <div>
                          <p className='font-semibold text-blue-950'>
                            Statutory Nil Tax Return
                          </p>
                          <p className='text-blue-800/90 text-[11px] mt-0.5'>
                            This report represents an official NRS Nil Return
                            for a trading period with ₦0 taxable sales. No tax
                            remittance is required. Download your official
                            certified slip for compliance records.
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className='rounded-xl border border-amber-200 bg-amber-50/60 p-3.5 text-xs text-amber-900 flex items-start gap-2.5'>
                        <Clock className='h-4 w-4 text-amber-600 shrink-0 mt-0.5' />
                        <div>
                          <p className='font-semibold text-amber-950'>
                            Assessment Awaiting Remittance
                          </p>
                          <p className='text-amber-800/90 text-[11px] mt-0.5'>
                            Statutory payable tax of{' '}
                            {formatNaira(Number(r.taxPayable))} is due by{' '}
                            {getDueDate(r.taxMonth)}. Remit to generate your
                            official certified NRS Tax Slip.
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Action Toolbar */}
                    <div className='flex flex-wrap items-center justify-between gap-2.5 pt-1'>
                      <div className='flex flex-wrap items-center gap-2'>
                        <Button
                          size='sm'
                          variant='outline'
                          subscriptionExempt={true}
                          onClick={(e) => handleDownloadTaxSlip(r, e)}
                          isLoading={downloadingSlipId === r.id}
                          className='border-gray-300 text-gray-700 hover:bg-white text-xs font-semibold'
                        >
                          <Download className='h-3.5 w-3.5 mr-1 text-purple-700' />
                          Download Assessment Slip (PDF)
                        </Button>
                        <Button
                          size='sm'
                          variant='outline'
                          subscriptionExempt={true}
                          onClick={(e) => {
                            const d = new Date(r.taxMonth);
                            handleDownloadPnlStatement(
                              d.getUTCMonth() + 1,
                              d.getUTCFullYear(),
                              r.id,
                              e,
                            );
                          }}
                          isLoading={downloadingPnlId === r.id}
                          className='border-purple-200 text-purple-900 hover:bg-purple-50 text-xs font-semibold'
                        >
                          <Download className='h-3.5 w-3.5 mr-1 text-purple-700' />
                          Download P&amp;L Statement (PDF)
                        </Button>
                      </div>

                      <div className='flex items-center gap-2'>
                        {r.isFinalized && !r.isLocked && (
                          <>
                            <Button
                              size='sm'
                              variant='ghost'
                              onClick={(e) => handleUnfinalize(r.id, e)}
                              className='text-xs text-gray-500 hover:text-gray-800'
                            >
                              <Clock className='h-3.5 w-3.5 mr-1' />
                              Un-finalize
                            </Button>
                            {!r.isNilReturn && (
                              <Button
                                size='sm'
                                className='bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs'
                                onClick={() => setPaymentModalReport(r)}
                              >
                                <CreditCard className='h-3.5 w-3.5 mr-1' />
                                Pay Now ({formatNaira(Number(r.taxPayable))})
                              </Button>
                            )}
                          </>
                        )}

                        {!r.isFinalized &&
                          !r.isLocked &&
                          (isMonthConcluded(r.taxMonth) ? (
                            <Button
                              size='sm'
                              variant='secondary'
                              onClick={(e) => openFinalizeConfirm(r, e)}
                              className='text-xs'
                              title='Finalize tax report'
                            >
                              <CheckCircle2 className='h-3.5 w-3.5 mr-1 text-emerald-600' />
                              Finalize Report
                            </Button>
                          ) : (
                            <Button
                              size='sm'
                              variant='outline'
                              disabled={true}
                              className='text-xs text-gray-400 border-gray-200 cursor-not-allowed opacity-60 font-medium'
                              title={`Finalization opens on the first day of the following month (${getFinalizeOpensLabel(r.taxMonth)}). Transactions can still be recorded throughout the active month.`}
                            >
                              <Lock className='h-3.5 w-3.5 mr-1 text-gray-400' />
                              Finalize (Opens{' '}
                              {getFinalizeOpensLabel(r.taxMonth)})
                            </Button>
                          ))}

                        {import.meta.env.DEV && isPaid && (
                          <Button
                            size='sm'
                            variant='ghost'
                            onClick={(e) => handleReset(r.id, e)}
                            className='text-xs text-rose-600 hover:text-rose-800 hover:bg-rose-50 font-medium'
                            title='Reset this report back to draft for testing (Dev Only)'
                          >
                            <RotateCcw className='h-3.5 w-3.5 mr-1' />
                            Reset to Draft
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Pre-Payment Assessment & PIN Confirmation Modal */}
      <PaymentConfirmationModal
        isOpen={Boolean(paymentModalReport)}
        onClose={() => setPaymentModalReport(null)}
        report={paymentModalReport}
        business={biz}
        onSuccess={() => {
          fetchReports();
        }}
      />

      {/* Pre-Finalize Confirmation Modal */}
      <FinalizeConfirmationModal
        isOpen={Boolean(finalizeModalReport)}
        onClose={() => setFinalizeModalReport(null)}
        report={finalizeModalReport}
        taxPath={taxPath}
        onConfirm={handleFinalize}
      />

      {pagination && pagination.totalPages > 1 && (
        <div className='flex items-center justify-between pt-2'>
          <span className='font-body text-xs text-gray-400'>
            Page {pagination.page} of {pagination.totalPages}
          </span>
          <div className='flex gap-2'>
            <Button
              variant='secondary'
              size='sm'
              disabled={!pagination.hasPrev}
              onClick={() => setPage(page - 1)}
            >
              <ChevronLeft className='h-4 w-4' />
            </Button>
            <Button
              variant='secondary'
              size='sm'
              disabled={!pagination.hasNext}
              onClick={() => setPage(page + 1)}
            >
              <ChevronRight className='h-4 w-4' />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
