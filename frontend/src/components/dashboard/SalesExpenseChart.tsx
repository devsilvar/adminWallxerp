import { useState, useEffect, useCallback } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  AreaChart,
  Area,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import {
  BarChart3,
  Layers,
  Calendar,
  SlidersHorizontal,
  RefreshCw,
  Lock,
} from 'lucide-react';
import { formatNaira } from '@/lib/format';
import { useDisplayCurrency } from '@/hooks/useDisplayCurrency';
import Card from '@/components/ui/Card.tsx';
import Button from '@/components/ui/Button.tsx';
import { useBusinessStore } from '@/stores/business.store.ts';
import { hasPerm } from '@/components/auth/PermissionGate.tsx';
import api from '@/lib/axios.ts';
import toast from 'react-hot-toast';
import type {
  OverviewPeriodKey,
  SalesOverviewResponse,
  SalesOverviewTimelinePoint,
} from '@/types/index.ts';

// ─── Helpers ────────────────────────────────────────────────

const PERIOD_OPTIONS: Array<{ key: OverviewPeriodKey; label: string }> = [
  { key: '7d', label: '7D' },
  { key: '30d', label: '30D' },
  { key: '3m', label: '3M' },
  { key: '6m', label: '6M' },
  { key: '12m', label: '12M' },
  { key: 'ytd', label: 'YTD' },
  { key: 'all', label: 'All' },
  { key: 'custom', label: 'Custom' },
];

// ─── Custom Tooltip ─────────────────────────────────────────

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{
    name: string;
    value: number;
    color: string;
    dataKey: string;
  }>;
  label?: string;
  timelinePoint?: SalesOverviewTimelinePoint;
}

function FinancialTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload || !payload.length) return null;

  const sales = payload.find((p) => p.dataKey === 'sales')?.value ?? 0;
  const expenses = payload.find((p) => p.dataKey === 'expenses')?.value ?? 0;
  const netProfit =
    payload.find((p) => p.dataKey === 'netProfit')?.value ?? sales - expenses;
  const profitMargin =
    sales > 0 ? ((netProfit / sales) * 100).toFixed(1) : '0.0';

  return (
    <div className='rounded-xl border border-gray-100 bg-white/95 p-3.5 shadow-xl backdrop-blur-md min-w-[200px] text-xs font-body'>
      <p className='font-semibold text-gray-900 border-b border-gray-100 pb-1.5 mb-2'>
        {label}
      </p>
      <div className='space-y-1.5'>
        <div className='flex items-center justify-between gap-4'>
          <span className='flex items-center gap-1.5 text-gray-600'>
            <span className='h-2.5 w-2.5 rounded-xs bg-emerald-500 inline-block' />
            Sales
          </span>
          <span className='font-semibold text-emerald-700 tabular-nums'>
            {formatNaira(sales)}
          </span>
        </div>
        <div className='flex items-center justify-between gap-4'>
          <span className='flex items-center gap-1.5 text-gray-600'>
            <span className='h-2.5 w-2.5 rounded-xs bg-amber-500 inline-block' />
            Expenses
          </span>
          <span className='font-semibold text-amber-700 tabular-nums'>
            {formatNaira(expenses)}
          </span>
        </div>
        <div className='border-t border-gray-100 pt-1.5 mt-1.5 flex items-center justify-between gap-4'>
          <span className='flex items-center gap-1.5 font-medium text-gray-700'>
            <span className='h-2.5 w-2.5 rounded-full bg-indigo-500 inline-block' />
            Net Profit
          </span>
          <span
            className={`font-bold tabular-nums ${
              netProfit >= 0 ? 'text-indigo-600' : 'text-rose-500'
            }`}
          >
            {formatNaira(netProfit)}
          </span>
        </div>
        <div className='flex items-center justify-between gap-4 text-[11px] text-gray-400'>
          <span>Profit Margin</span>
          <span className='font-semibold text-gray-700 tabular-nums'>
            {profitMargin}%
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────

export default function SalesExpenseChart({
  className = '',
  defaultPeriod = '12m',
}: {
  className?: string;
  defaultPeriod?: OverviewPeriodKey;
}) {
  useDisplayCurrency();
  const biz = useBusinessStore((s) => s.activeBusiness);
  // This endpoint is sales data. Without the gate, a team member whose role
  // excludes sales.read got a 403 on every dashboard visit, surfaced as an
  // error toast — and an empty chart that looked like a quiet month.
  const canReadSales = hasPerm('sales.read', biz);
  const [period, setPeriod] = useState<OverviewPeriodKey>(defaultPeriod);
  const [chartMode, setChartMode] = useState<'bars' | 'area'>('bars');
  const [showBreakdown, setShowBreakdown] = useState(false);

  // Custom date range state
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [showCustomPicker, setShowCustomPicker] = useState(false);

  const [data, setData] = useState<SalesOverviewResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchOverview = useCallback(async () => {
    if (!biz || !canReadSales) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const q: Record<string, string> = { period };
      if (period === 'custom') {
        if (!customFrom || !customTo) {
          setIsLoading(false);
          return;
        }
        q.from = customFrom;
        q.to = customTo;
      }
      const res = await api.get(`/businesses/${biz.id}/sales/overview`, {
        params: q,
      });
      setData(res.data.data);
    } catch (err: any) {
      const msg =
        err.response?.data?.error?.message ||
        'Failed to load financial overview';
      setError(msg);
      toast.error(msg);
    } finally {
      setIsLoading(false);
    }
  }, [biz, canReadSales, period, customFrom, customTo]);

  useEffect(() => {
    fetchOverview();
  }, [fetchOverview]);

  const handlePresetCustom = (days: number) => {
    const end = new Date();
    const start = new Date(end.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
    setCustomFrom(start.toISOString().split('T')[0]);
    setCustomTo(end.toISOString().split('T')[0]);
    setPeriod('custom');
  };

  const handlePeriodChange = (p: OverviewPeriodKey) => {
    setPeriod(p);
    if (p === 'custom') {
      setShowCustomPicker(true);
      if (!customFrom || !customTo) {
        const end = new Date();
        const start = new Date(end.getTime() - 29 * 24 * 60 * 60 * 1000);
        setCustomFrom(start.toISOString().split('T')[0]);
        setCustomTo(end.toISOString().split('T')[0]);
      }
    } else {
      setShowCustomPicker(false);
    }
  };

  const kpis = data?.kpis;
  const timeline = data?.timeline || [];
  const hasData = timeline.some((t) => t.sales > 0 || t.expenses > 0);

  // Restricted role — don't fetch, and don't dress the absence up as "no
  // transactions recorded". Period controls are meaningless without data, so
  // they aren't rendered either.
  if (!canReadSales) {
    return (
      <Card
        noPadding
        className={`overflow-hidden rounded-t-none rounded-b-xl border-gray-200/80 bg-white shadow-xs ${className}`}
      >
        <div className='flex items-center gap-2 border-b border-purple-800/40 bg-gradient-to-r from-purple-900 via-indigo-900 to-purple-950 px-4 py-3 text-white'>
          <BarChart3 className='h-4 w-4 text-purple-200 stroke-[2]' />
          <h2 className='text-sm font-semibold text-white tracking-wide'>
            Sales &amp; Expenses Overview
          </h2>
        </div>
        <div className='flex h-48 flex-col items-center justify-center px-5 py-5 text-center'>
          <Lock className='h-7 w-7 text-gray-300' />
          <p className='mt-2 text-sm font-semibold text-gray-700'>
            Sales analytics unavailable
          </p>
          <p className='mt-1 max-w-sm text-xs text-gray-400 font-body'>
            Your role on this business doesn&apos;t include permission to view
            sales data, so this overview is hidden.
          </p>
        </div>
      </Card>
    );
  }

  return (
    <Card
      noPadding
      className={`overflow-hidden rounded-t-none rounded-b-xl border-gray-200/80 bg-white shadow-xs ${className}`}
    >
      {/* ── Header ────────────────────────────────────────── */}
      <div className='flex flex-col gap-3 border-b border-purple-800/40 bg-gradient-to-r from-purple-900 via-indigo-900 to-purple-950 px-4 py-3 sm:flex-row sm:items-center sm:justify-between text-white'>
        <div className='flex items-center gap-2'>
          <BarChart3 className='h-4 w-4 text-purple-200 stroke-[2]' />
          <div className='flex items-center gap-2'>
            <h2 className='text-sm font-semibold text-white tracking-wide'>
              Sales &amp; Expenses Overview
            </h2>
            {data?.period && (
              <span className='font-mono text-[11px] text-purple-200/80 font-normal hidden sm:inline'>
                ({data.period.from} – {data.period.to})
              </span>
            )}
          </div>
        </div>

        {/* ── Controls: Period pills & Chart Mode ─────────── */}
        <div className='flex flex-wrap items-center gap-2'>
          {/* Period Selector Pills */}
          <div className='inline-flex rounded-lg bg-white/10 backdrop-blur-sm border border-white/15 p-0.5'>
            {PERIOD_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                type='button'
                onClick={() => handlePeriodChange(opt.key)}
                className={`rounded-md px-2 py-1 text-xs transition-all ${
                  period === opt.key
                    ? 'bg-white text-purple-950 shadow-xs font-semibold'
                    : 'text-purple-200 hover:text-white hover:bg-white/10 font-medium'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Mode Toggle */}
          <div className='inline-flex rounded-lg bg-white/10 backdrop-blur-sm border border-white/15 p-0.5'>
            <button
              type='button'
              onClick={() => setChartMode('bars')}
              className={`rounded-md p-1.5 transition-all ${
                chartMode === 'bars'
                  ? 'bg-white text-purple-950 shadow-xs'
                  : 'text-purple-200 hover:text-white hover:bg-white/10'
              }`}
              title='Side-by-side comparison bars'
            >
              <BarChart3 className='h-3.5 w-3.5' />
            </button>
            <button
              type='button'
              onClick={() => setChartMode('area')}
              className={`rounded-md p-1.5 transition-all ${
                chartMode === 'area'
                  ? 'bg-white text-purple-950 shadow-xs'
                  : 'text-purple-200 hover:text-white hover:bg-white/10'
              }`}
              title='Cashflow trend wave'
            >
              <Layers className='h-3.5 w-3.5' />
            </button>
          </div>

          {/* Breakdown Toggle */}
          <button
            type='button'
            onClick={() => setShowBreakdown(!showBreakdown)}
            className={`flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-medium transition-all ${
              showBreakdown
                ? 'border-white bg-white text-purple-950 shadow-xs font-semibold'
                : 'border-white/20 bg-white/10 text-purple-200 hover:bg-white/20 hover:text-white'
            }`}
          >
            <SlidersHorizontal className='h-3.5 w-3.5' />
            <span className='hidden sm:inline'>Breakdown</span>
          </button>
        </div>
      </div>

      {/* ── Custom Range Subpanel ─────────────────────────── */}
      {showCustomPicker && (
        <div className='flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 bg-gray-50/50 px-5 py-2.5 text-xs'>
          <div className='flex flex-wrap items-center gap-2'>
            <span className='font-medium text-gray-600 flex items-center gap-1'>
              <Calendar className='h-3.5 w-3.5 text-gray-400' /> Custom Range:
            </span>
            <input
              type='date'
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              className='rounded-md border border-gray-200 bg-white px-2 py-1 text-xs font-medium text-gray-700 focus:border-gray-400 focus:outline-hidden'
            />
            <span className='text-gray-400'>to</span>
            <input
              type='date'
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              className='rounded-md border border-gray-200 bg-white px-2 py-1 text-xs font-medium text-gray-700 focus:border-gray-400 focus:outline-hidden'
            />
            <Button
              size='sm'
              onClick={fetchOverview}
              isLoading={isLoading}
              className='px-2.5 py-1 text-xs rounded-md'
            >
              Apply
            </Button>
          </div>
          <div className='flex items-center gap-1.5 text-xs text-gray-500'>
            <span className='text-gray-400 font-body'>Quick:</span>
            <button
              onClick={() => handlePresetCustom(14)}
              className='rounded px-1.5 py-0.5 text-gray-600 hover:bg-gray-200/60 font-medium'
            >
              14D
            </button>
            <button
              onClick={() => handlePresetCustom(60)}
              className='rounded px-1.5 py-0.5 text-gray-600 hover:bg-gray-200/60 font-medium'
            >
              60D
            </button>
            <button
              onClick={() => handlePresetCustom(90)}
              className='rounded px-1.5 py-0.5 text-gray-600 hover:bg-gray-200/60 font-medium'
            >
              90D
            </button>
          </div>
        </div>
      )}

      {/* ── KPI Summary Strip (Minimalist 4-Column Row) ────── */}
      <div className='grid grid-cols-2 gap-3 sm:grid-cols-4 border-b border-gray-100 px-4 py-3 bg-white divide-y sm:divide-y-0 sm:divide-x divide-gray-100'>
        {/* Total Sales */}
        <div className='pt-2 sm:pt-0 sm:px-2.5 first:pl-0'>
          <p className='text-xs font-medium text-gray-500'>Total Sales</p>
          <p className='mt-1 text-lg sm:text-xl font-semibold text-gray-900 tabular-nums'>
            {formatNaira(kpis?.totalSales ?? 0)}
          </p>
          <div className='mt-0.5 flex items-center gap-2 text-xs'>
            <span className='text-gray-400 font-body'>
              {kpis?.salesCount ?? 0} txn
              {(kpis?.salesCount ?? 0) === 1 ? '' : 's'}
            </span>
            {kpis?.deltas.salesPct !== null &&
              kpis?.deltas.salesPct !== undefined && (
                <span
                  className={`font-medium tabular-nums ${
                    kpis.deltas.salesPct >= 0
                      ? 'text-emerald-600'
                      : 'text-rose-500'
                  }`}
                >
                  {kpis.deltas.salesPct >= 0 ? '+' : ''}
                  {kpis.deltas.salesPct}%
                </span>
              )}
          </div>
        </div>

        {/* Total Expenses */}
        <div className='pt-2 sm:pt-0 sm:px-2.5'>
          <p className='text-xs font-medium text-gray-500'>Total Expenses</p>
          <p className='mt-1 text-lg sm:text-xl font-semibold text-gray-900 tabular-nums'>
            {formatNaira(kpis?.totalExpenses ?? 0)}
          </p>
          <div className='mt-0.5 flex items-center gap-2 text-xs'>
            <span className='text-gray-400 font-body'>
              {kpis?.expensesCount ?? 0} expense
              {(kpis?.expensesCount ?? 0) === 1 ? '' : 's'}
            </span>
            {kpis?.deltas.expensesPct !== null &&
              kpis?.deltas.expensesPct !== undefined && (
                <span
                  className={`font-medium tabular-nums ${
                    kpis.deltas.expensesPct <= 0
                      ? 'text-emerald-600'
                      : 'text-amber-600'
                  }`}
                >
                  {kpis.deltas.expensesPct >= 0 ? '+' : ''}
                  {kpis.deltas.expensesPct}%
                </span>
              )}
          </div>
        </div>

        {/* Net Profit */}
        <div className='pt-2 sm:pt-0 sm:px-2.5'>
          <p className='text-xs font-medium text-gray-500'>Net Profit</p>
          <p
            className={`mt-1 text-lg sm:text-xl font-semibold tabular-nums ${
              (kpis?.netProfit ?? 0) >= 0 ? 'text-gray-900' : 'text-rose-600'
            }`}
          >
            {formatNaira(kpis?.netProfit ?? 0)}
          </p>
          <div className='mt-0.5 flex items-center gap-2 text-xs'>
            <span className='text-gray-400 font-body'>
              {(kpis?.netProfit ?? 0) >= 0 ? 'Profitable' : 'Loss'}
            </span>
            {kpis?.deltas.netProfitPct !== null &&
              kpis?.deltas.netProfitPct !== undefined && (
                <span
                  className={`font-medium tabular-nums ${
                    kpis.deltas.netProfitPct >= 0
                      ? 'text-emerald-600'
                      : 'text-rose-500'
                  }`}
                >
                  {kpis.deltas.netProfitPct >= 0 ? '+' : ''}
                  {kpis.deltas.netProfitPct}%
                </span>
              )}
          </div>
        </div>

        {/* Profit Margin */}
        <div className='pt-2 sm:pt-0 sm:px-2.5 last:pr-0'>
          <p className='text-xs font-medium text-gray-500'>Profit Margin</p>
          <div className='mt-1 flex items-baseline gap-2'>
            <p className='text-lg sm:text-xl font-semibold text-gray-900 tabular-nums'>
              {(kpis?.profitMargin ?? 0).toFixed(1)}%
            </p>
            <span
              className={`h-2 w-2 rounded-full inline-block ${
                (kpis?.profitMargin ?? 0) >= 30
                  ? 'bg-emerald-500'
                  : (kpis?.profitMargin ?? 0) >= 15
                    ? 'bg-amber-500'
                    : 'bg-rose-500'
              }`}
            />
          </div>
          <p className='mt-0.5 text-xs text-gray-400 font-body'>
            {(kpis?.profitMargin ?? 0) >= 20 ? 'Healthy' : 'Low'}
          </p>
        </div>
      </div>

      {/* ── Chart Body ────────────────────────────────────── */}
      <div className='p-5'>
        {isLoading ? (
          <div className='flex h-72 items-center justify-center'>
            <RefreshCw className='h-6 w-6 animate-spin text-gray-400' />
          </div>
        ) : error ? (
          <div className='flex h-72 flex-col items-center justify-center text-center'>
            <p className='text-sm text-red-500 font-medium'>{error}</p>
            <Button
              size='sm'
              variant='secondary'
              onClick={fetchOverview}
              className='mt-3'
            >
              Retry
            </Button>
          </div>
        ) : !hasData ? (
          <div className='flex h-72 flex-col items-center justify-center text-center'>
            <BarChart3 className='h-7 w-7 text-gray-300' />
            <p className='mt-2 text-sm font-semibold text-gray-700'>
              No transactions recorded in this period
            </p>
            <p className='mt-1 text-xs text-gray-400 font-body max-w-sm'>
              Select a wider date range or record sales and business expenses.
            </p>
          </div>
        ) : (
          <div className='h-72 w-full'>
            <ResponsiveContainer width='100%' height='100%'>
              {chartMode === 'bars' ? (
                <ComposedChart
                  data={timeline}
                  margin={{ top: 10, right: 10, left: -15, bottom: 0 }}
                >
                  <CartesianGrid
                    strokeDasharray='3 3'
                    stroke='#f1f5f9'
                    vertical={false}
                  />
                  <XAxis
                    dataKey='label'
                    stroke='#94a3b8'
                    fontSize={11}
                    tickLine={false}
                    axisLine={{ stroke: '#e2e8f0' }}
                  />
                  <YAxis
                    stroke='#94a3b8'
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => formatNaira(v, true)}
                  />
                  <Tooltip content={<FinancialTooltip />} />
                  <Legend
                    verticalAlign='top'
                    align='right'
                    wrapperStyle={{ paddingBottom: '12px', fontSize: '12px' }}
                  />
                  <Bar
                    dataKey='sales'
                    name='Sales'
                    fill='#10b981'
                    radius={[3, 3, 0, 0]}
                    maxBarSize={36}
                  />
                  <Bar
                    dataKey='expenses'
                    name='Expenses'
                    fill='#f59e0b'
                    radius={[3, 3, 0, 0]}
                    maxBarSize={36}
                  />
                  <Line
                    type='monotone'
                    dataKey='netProfit'
                    name='Net Profit'
                    stroke='#6366f1'
                    strokeWidth={2}
                    dot={{ fill: '#6366f1', r: 2.5 }}
                    activeDot={{ r: 4 }}
                  />
                </ComposedChart>
              ) : (
                <AreaChart
                  data={timeline}
                  margin={{ top: 10, right: 10, left: -15, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id='colorSales' x1='0' y1='0' x2='0' y2='1'>
                      <stop
                        offset='5%'
                        stopColor='#10b981'
                        stopOpacity={0.35}
                      />
                      <stop
                        offset='95%'
                        stopColor='#10b981'
                        stopOpacity={0.0}
                      />
                    </linearGradient>
                    <linearGradient
                      id='colorExpenses'
                      x1='0'
                      y1='0'
                      x2='0'
                      y2='1'
                    >
                      <stop offset='5%' stopColor='#f59e0b' stopOpacity={0.3} />
                      <stop
                        offset='95%'
                        stopColor='#f59e0b'
                        stopOpacity={0.0}
                      />
                    </linearGradient>
                    <linearGradient
                      id='colorProfit'
                      x1='0'
                      y1='0'
                      x2='0'
                      y2='1'
                    >
                      <stop
                        offset='5%'
                        stopColor='#6366f1'
                        stopOpacity={0.25}
                      />
                      <stop
                        offset='95%'
                        stopColor='#6366f1'
                        stopOpacity={0.0}
                      />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray='3 3'
                    stroke='#f1f5f9'
                    vertical={false}
                  />
                  <XAxis
                    dataKey='label'
                    stroke='#94a3b8'
                    fontSize={11}
                    tickLine={false}
                    axisLine={{ stroke: '#e2e8f0' }}
                  />
                  <YAxis
                    stroke='#94a3b8'
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => formatNaira(v, true)}
                  />
                  <Tooltip content={<FinancialTooltip />} />
                  <Legend
                    verticalAlign='top'
                    align='right'
                    wrapperStyle={{ paddingBottom: '12px', fontSize: '12px' }}
                  />
                  <Area
                    type='monotone'
                    dataKey='sales'
                    name='Sales'
                    stroke='#10b981'
                    strokeWidth={2}
                    fillOpacity={1}
                    fill='url(#colorSales)'
                  />
                  <Area
                    type='monotone'
                    dataKey='expenses'
                    name='Expenses'
                    stroke='#f59e0b'
                    strokeWidth={2}
                    fillOpacity={1}
                    fill='url(#colorExpenses)'
                  />
                  <Area
                    type='monotone'
                    dataKey='netProfit'
                    name='Net Profit'
                    stroke='#6366f1'
                    strokeWidth={2}
                    fillOpacity={1}
                    fill='url(#colorProfit)'
                  />
                </AreaChart>
              )}
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* ── Category & Source Breakdown Panel (Expandable) ─── */}
      {showBreakdown && data?.breakdown && (
        <div className='border-t border-gray-100 bg-gray-50/40 p-5'>
          <h3 className='text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3'>
            Period Breakdown
          </h3>
          <div className='grid grid-cols-1 gap-4 md:grid-cols-2'>
            {/* Sales by Source */}
            <div className='rounded-xl border border-gray-200/70 bg-white p-3.5 shadow-xs'>
              <p className='text-xs font-semibold text-gray-900 mb-2.5'>
                Sales by Channel
              </p>
              {data.breakdown.salesBySource.length > 0 ? (
                <div className='space-y-2'>
                  {data.breakdown.salesBySource.map((s) => (
                    <div key={s.source} className='space-y-1'>
                      <div className='flex justify-between text-xs'>
                        <span className='capitalize text-gray-700 font-medium'>
                          {s.source.replace(/_/g, ' ')}
                        </span>
                        <span className='font-semibold text-gray-900 tabular-nums'>
                          {formatNaira(s.amount)} ({s.percentage}%)
                        </span>
                      </div>
                      <div className='h-1.5 w-full rounded-full bg-gray-100 overflow-hidden'>
                        <div
                          className='h-full rounded-full bg-emerald-500'
                          style={{ width: `${Math.min(s.percentage, 100)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className='text-xs text-gray-400 font-body'>
                  No sales in period
                </p>
              )}
            </div>

            {/* Expenses by Category */}
            <div className='rounded-xl border border-gray-200/70 bg-white p-3.5 shadow-xs'>
              <p className='text-xs font-semibold text-gray-900 mb-2.5'>
                Top Expenses
              </p>
              {data.breakdown.expensesByCategory.length > 0 ? (
                <div className='space-y-2'>
                  {data.breakdown.expensesByCategory.slice(0, 5).map((e) => (
                    <div key={e.category} className='space-y-1'>
                      <div className='flex justify-between text-xs'>
                        <span className='capitalize text-gray-700 font-medium'>
                          {e.category.replace(/_/g, ' ')}
                        </span>
                        <span className='font-semibold text-gray-900 tabular-nums'>
                          {formatNaira(e.amount)} ({e.percentage}%)
                        </span>
                      </div>
                      <div className='h-1.5 w-full rounded-full bg-gray-100 overflow-hidden'>
                        <div
                          className='h-full rounded-full bg-amber-500'
                          style={{ width: `${Math.min(e.percentage, 100)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className='text-xs text-gray-400 font-body'>
                  No expenses in period
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
