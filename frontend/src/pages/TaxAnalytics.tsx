import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ResponsiveContainer,
  ComposedChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  Bar,
  Line,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
} from 'recharts';
import {
  ArrowUpRight,
  ArrowDownRight,
  Calculator,
  CircleDollarSign,
  Clock,
  FileText,
  BarChart3,
  TrendingUp,
} from 'lucide-react';
import Card from '@/components/ui/Card.tsx';
import Button from '@/components/ui/Button.tsx';
import { useBusinessStore } from '@/stores/business.store.ts';
import api from '@/lib/axios.ts';
import toast from 'react-hot-toast';
import type { TaxAnalyticsResponse, TaxAnalyticsSeriesPoint } from '@/types/index.ts';
import { formatNaira } from '@/lib/format';
import { useDisplayCurrency } from '@/hooks/useDisplayCurrency';

// ─── Helpers ────────────────────────────────────────────────

// "2026-04" → "Apr 26"
function formatMonthShort(key: string) {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(Date.UTC(y, (m ?? 1) - 1, 1));
  return `${d.toLocaleString('en', { month: 'short', timeZone: 'UTC' })} ${String(y).slice(-2)}`;
}

function monthName(m: number) {
  return new Date(Date.UTC(2000, m - 1, 1)).toLocaleString('en', { month: 'short', timeZone: 'UTC' });
}

type RangeKey = '6m' | '12m' | '24m' | 'all' | 'custom';
const RANGE_OPTIONS: { key: RangeKey; label: string }[] = [
  { key: '6m', label: '6M' },
  { key: '12m', label: '12M' },
  { key: '24m', label: '24M' },
  { key: 'all', label: 'All' },
  { key: 'custom', label: 'Custom' },
];

// ─── Page ───────────────────────────────────────────────────

export default function TaxAnalytics() {
  useDisplayCurrency();
  const biz = useBusinessStore((s) => s.activeBusiness);
  const navigate = useNavigate();
  const [params] = useSearchParams();

  // Range state. Default is 12m — matches the backend default and is what
  // most SMEs want to see first.
  const [range, setRange] = useState<RangeKey>('12m');

  // Custom-range state — only used when range === 'custom'. Month pickers
  // are plain `<input type="month">`, which produce "YYYY-MM" natively.
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  const [data, setData] = useState<TaxAnalyticsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAnalytics = useCallback(async () => {
    if (!biz) return;
    setIsLoading(true);
    setError(null);
    try {
      const q: Record<string, string> = {};
      if (range !== 'custom') {
        q.range = range;
      } else {
        if (!customFrom || !customTo) {
          setIsLoading(false);
          return; // wait for both bounds
        }
        q.range = 'custom';
        q.from = customFrom;
        q.to = customTo;
      }
      const res = await api.get<{ success: boolean; data: TaxAnalyticsResponse }>(
        `/businesses/${biz.id}/tax/analytics`,
        { params: q }
      );
      setData(res.data.data);
    } catch (err: any) {
      const code = err.response?.data?.error?.code;
      const msg = err.response?.data?.error?.message || 'Failed to load analytics';
      setError(msg);
      if (code === 'RANGE_TOO_WIDE') {
        toast.error('That range is too wide (5 year max). Narrow it down.');
      } else {
        toast.error(msg);
      }
    } finally {
      setIsLoading(false);
    }
  }, [biz, range, customFrom, customTo]);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  const hasAnyReport = useMemo(
    () => (data?.series ?? []).some((p) => p.reportId !== null),
    [data]
  );

  if (!biz) return <p className="py-20 text-center text-gray-400">Select a business first.</p>;

  return (
    <div className="space-y-6">
      {/* Range selector */}
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {RANGE_OPTIONS.map((opt) => {
              const active = range === opt.key;
              return (
                <button
                  key={opt.key}
                  onClick={() => setRange(opt.key)}
                  className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 ${
                    active
                      ? 'bg-primary-600 text-white shadow-sm'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>

          {data && (
            <span className="font-body text-xs text-gray-500">
              {formatMonthShort(data.window.from)} – {formatMonthShort(data.window.to)} · {data.window.monthsInRange} months
            </span>
          )}
        </div>

        {range === 'custom' && (
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600">From</label>
              <input
                type="month"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="mt-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600">To</label>
              <input
                type="month"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="mt-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
            {(!customFrom || !customTo) && (
              <span className="pb-2 text-xs text-gray-400">Pick both months to load</span>
            )}
          </div>
        )}
      </Card>

      {/* KPI strip — always renders (zeros are meaningful) */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard
          label="Tax Paid"
          value={formatNaira(data?.kpis.totalTaxPaid ?? 0)}
          delta={data?.kpis.deltas.totalTaxPaidPct ?? null}
          icon={<CircleDollarSign className="h-5 w-5" />}
          tone="emerald"
        />
        <KpiCard
          label="Tax Owed"
          value={formatNaira(data?.kpis.totalTaxOwed ?? 0)}
          delta={data?.kpis.deltas.totalTaxOwedPct ?? null}
          icon={<Clock className="h-5 w-5" />}
          tone="amber"
          invertDelta /* owed going UP is bad, DOWN is good */
        />
        <KpiCard
          label="Reports Filed"
          value={String(data?.kpis.reportsFiled ?? 0)}
          delta={data?.kpis.deltas.reportsFiledPct ?? null}
          icon={<FileText className="h-5 w-5" />}
          tone="blue"
        />
        <KpiCard
          label="Avg Monthly Tax"
          value={formatNaira(data?.kpis.averageMonthlyTax ?? 0)}
          delta={null}
          icon={<BarChart3 className="h-5 w-5" />}
          tone="gray"
        />
      </div>

      {/* Main chart */}
      <Card>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Monthly Breakdown</h2>
            <p className="font-body text-xs text-gray-500">
              Sales vs Expenses vs Tax, with profit margin overlay. Click a bar to open that month's report.
            </p>
          </div>
        </div>

        {isLoading && !data ? (
          <div className="flex h-80 items-center justify-center text-gray-400">Loading…</div>
        ) : error ? (
          <div className="flex h-80 items-center justify-center text-red-500">{error}</div>
        ) : !hasAnyReport ? (
          <EmptyChart
            title="No tax reports in this range yet"
            cta="Calculate your first tax report"
            onCta={() => {
              // Jump back to Reports tab; the Calculate button lives there.
              const p = new URLSearchParams(params);
              p.delete('tab');
              p.delete('highlight');
              navigate({ search: p.toString() });
            }}
          />
        ) : (
          <MonthlyBreakdownChart
            data={data!.series}
            onBarClick={(p) => {
              if (!p.reportId) return;
              const next = new URLSearchParams(params);
              next.delete('tab'); // reports is the default tab
              next.set('highlight', p.reportId);
              navigate({ search: next.toString() });
            }}
          />
        )}
      </Card>

      {/* Two-column row */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Donut — hidden when no reports */}
        {data && data.kpis.reportsFiled > 0 && (
          <Card>
            <h2 className="text-lg font-semibold text-gray-900">Payment Status</h2>
            <p className="mb-4 font-body text-xs text-gray-500">
              Distribution of reports in this window by payment state.
            </p>
            <StatusDonut
              paid={data.statusDistribution.paid}
              pending={data.statusDistribution.pending}
              failed={data.statusDistribution.failed}
              total={data.kpis.reportsFiled}
            />
          </Card>
        )}

        {/* YoY — only when backend returns it */}
        {data?.yoy && (
          <Card>
            <h2 className="text-lg font-semibold text-gray-900">Year-over-Year</h2>
            <p className="mb-4 font-body text-xs text-gray-500">
              Monthly tax payable, {data.yoy.currentYear} vs {data.yoy.priorYear}.
            </p>
            <YoYTable yoy={data.yoy} />
          </Card>
        )}
      </div>

      {/* Cumulative Tax Paid — hidden when nothing paid */}
      {data && data.kpis.totalTaxPaid > 0 && (
        <Card>
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Cumulative Tax Paid</h2>
            <p className="font-body text-xs text-gray-500">
              Running total of tax locked-in (paid) across the window.
            </p>
          </div>
          <CumulativeChart data={data.series} />
        </Card>
      )}
    </div>
  );
}

// ─── KPI Card ───────────────────────────────────────────────

const TONE_MAP = {
  emerald: { bg: 'bg-emerald-50', text: 'text-emerald-600', ring: 'ring-emerald-100' },
  amber: { bg: 'bg-amber-50', text: 'text-amber-600', ring: 'ring-amber-100' },
  blue: { bg: 'bg-blue-50', text: 'text-blue-600', ring: 'ring-blue-100' },
  gray: { bg: 'bg-gray-100', text: 'text-gray-600', ring: 'ring-gray-200' },
} as const;

type Tone = keyof typeof TONE_MAP;

function KpiCard({
  label,
  value,
  delta,
  icon,
  tone,
  invertDelta,
}: {
  label: string;
  value: string;
  delta: number | null;
  icon: ReactNode;
  tone: Tone;
  invertDelta?: boolean;
}) {
  const t = TONE_MAP[tone];
  // delta coloring: positive = green unless inverted (for "owed" / bad metrics).
  const deltaPositive = delta !== null && delta > 0;
  const isGood = invertDelta ? !deltaPositive : deltaPositive;
  const deltaColor = delta === null || delta === 0
    ? 'text-gray-400 bg-gray-50'
    : isGood
    ? 'text-emerald-600 bg-emerald-50'
    : 'text-red-500 bg-red-50';

  return (
    <Card>
      <div className="flex items-start justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</span>
        <div className={`flex h-9 w-9 items-center justify-center rounded-lg ring-1 ${t.bg} ${t.text} ${t.ring}`}>
          {icon}
        </div>
      </div>
      <p className="mt-3 font-heading text-2xl font-bold tabular-nums text-gray-900">{value}</p>
      <div className="mt-2 flex items-center gap-2">
        {delta === null ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-gray-50 px-2 py-0.5 text-[11px] font-medium text-gray-400">
            — no prior data
          </span>
        ) : (
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${deltaColor}`}>
            {delta > 0 ? <ArrowUpRight className="h-3 w-3" /> : delta < 0 ? <ArrowDownRight className="h-3 w-3" /> : null}
            {delta > 0 ? '+' : ''}{delta.toFixed(1)}% vs prior
          </span>
        )}
      </div>
    </Card>
  );
}

// ─── Monthly Breakdown (Composed: stacked bars + line) ──────

function MonthlyBreakdownChart({
  data,
  onBarClick,
}: {
  data: TaxAnalyticsSeriesPoint[];
  onBarClick: (p: TaxAnalyticsSeriesPoint) => void;
}) {
  // Recharts expects a plain array. We pre-format the x-axis label here
  // to keep the tick renderer cheap.
  const rows = useMemo(
    () => data.map((p) => ({ ...p, _label: formatMonthShort(p.taxMonth) })),
    [data]
  );

  return (
    <div className="h-[320px] w-full">
      <ResponsiveContainer>
        <ComposedChart
          data={rows}
          margin={{ top: 10, right: 20, left: 0, bottom: 0 }}
          onClick={(e: any) => {
            // Recharts 3.x narrows this type but the shape still exposes
            // `activePayload` at runtime. Cast defensively and pick safely.
            const payload = (e?.activePayload?.[0]?.payload ?? null) as TaxAnalyticsSeriesPoint | null;
            if (payload) onBarClick(payload);
          }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
          <XAxis dataKey="_label" tick={{ fontSize: 12, fill: '#6b7280' }} />
          <YAxis
            yAxisId="left"
            tick={{ fontSize: 12, fill: '#6b7280' }}
            tickFormatter={(v: number) => formatNaira(v, true)}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            tick={{ fontSize: 12, fill: '#6b7280' }}
            tickFormatter={(v: number) => `${v.toFixed(0)}%`}
            domain={[0, 100]}
          />
          <Tooltip content={<MonthlyTooltip />} cursor={{ fill: 'rgba(99,102,241,0.06)' }} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar yAxisId="left" dataKey="totalSales" name="Sales" stackId="a" fill="#10b981" />
          <Bar yAxisId="left" dataKey="totalExpenses" name="Expenses" stackId="a" fill="#f59e0b" />
          <Bar yAxisId="left" dataKey="taxPayable" name="Tax" stackId="a" fill="#ef4444" />
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="profitMargin"
            name="Profit Margin %"
            stroke="#8b5cf6"
            strokeWidth={2}
            dot={{ r: 3 }}
            activeDot={{ r: 5 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

function MonthlyTooltip({ active, payload }: any) {
  if (!active || !payload || payload.length === 0) return null;
  const p = payload[0]?.payload as TaxAnalyticsSeriesPoint | undefined;
  if (!p) return null;

  const statusLabel =
    p.paymentStatus === 'none' ? 'No report' :
    p.isLocked ? 'Paid' :
    p.isFinalized ? 'Finalized · unpaid' :
    p.paymentStatus === 'failed' ? 'Failed' : 'Pending';
  const statusColor =
    p.paymentStatus === 'none' ? 'bg-gray-100 text-gray-500' :
    p.isLocked ? 'bg-emerald-50 text-emerald-700' :
    p.paymentStatus === 'failed' ? 'bg-red-50 text-red-600' :
    'bg-amber-50 text-amber-700';

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3 text-xs shadow-lg">
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="font-semibold text-gray-900">{formatMonthShort(p.taxMonth)}</span>
        <span className={`rounded-full px-2 py-0.5 font-medium ${statusColor}`}>{statusLabel}</span>
      </div>
      <dl className="space-y-1 tabular-nums">
        <Row label="Sales" value={formatNaira(p.totalSales)} swatch="#10b981" />
        <Row label="Expenses" value={formatNaira(p.totalExpenses)} swatch="#f59e0b" />
        <Row label="Tax" value={formatNaira(p.taxPayable)} swatch="#ef4444" />
        <Row label="Profit" value={formatNaira(p.grossProfit)} />
        <Row label="Margin" value={`${p.profitMargin.toFixed(1)}%`} swatch="#8b5cf6" />
      </dl>
      {p.reportId && (
        <p className="mt-2 text-[11px] text-primary-600">Click to open this report</p>
      )}
    </div>
  );
}

function Row({ label, value, swatch }: { label: string; value: string; swatch?: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="flex items-center gap-1.5 text-gray-500">
        {swatch && <span className="h-2 w-2 rounded-sm" style={{ background: swatch }} />}
        {label}
      </span>
      <span className="font-medium text-gray-900">{value}</span>
    </div>
  );
}

// ─── Status Donut ───────────────────────────────────────────

function StatusDonut({
  paid,
  pending,
  failed,
  total,
}: {
  paid: number;
  pending: number;
  failed: number;
  total: number;
}) {
  const rows = [
    { name: 'Paid', value: paid, fill: '#10b981' },
    { name: 'Pending', value: pending, fill: '#f59e0b' },
    { name: 'Failed', value: failed, fill: '#ef4444' },
  ].filter((r) => r.value > 0);

  return (
    <div className="relative h-64 w-full">
      <ResponsiveContainer>
        <PieChart>
          <Pie
            data={rows}
            dataKey="value"
            nameKey="name"
            innerRadius={60}
            outerRadius={90}
            paddingAngle={2}
            stroke="#fff"
          >
            {rows.map((r) => (
              <Cell key={r.name} fill={r.fill} />
            ))}
          </Pie>
          <Tooltip
            formatter={(v, name) => {
              const n = Number(v ?? 0);
              return [`${n} report${n === 1 ? '' : 's'}`, String(name)];
            }}
          />
          <Legend verticalAlign="bottom" height={24} iconType="circle" wrapperStyle={{ fontSize: 12 }} />
        </PieChart>
      </ResponsiveContainer>
      {/* Center label */}
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center pb-6">
        <span className="font-heading text-2xl font-bold text-gray-900">{total}</span>
        <span className="text-xs text-gray-500">report{total === 1 ? '' : 's'}</span>
      </div>
    </div>
  );
}

// ─── YoY Table ──────────────────────────────────────────────

function YoYTable({
  yoy,
}: {
  yoy: NonNullable<TaxAnalyticsResponse['yoy']>;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
            <th className="py-2 pr-4 font-medium">Month</th>
            <th className="py-2 pr-4 text-right font-medium">{yoy.currentYear}</th>
            <th className="py-2 pr-4 text-right font-medium">{yoy.priorYear}</th>
            <th className="py-2 text-right font-medium">Δ</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {yoy.months.map((m) => {
            const deltaColor =
              m.deltaPct === null ? 'text-gray-400' :
              m.deltaPct > 0 ? 'text-emerald-600' :
              m.deltaPct < 0 ? 'text-red-500' : 'text-gray-500';
            return (
              <tr key={m.month}>
                <td className="py-2 pr-4 font-medium text-gray-700">{monthName(m.month)}</td>
                <td className="py-2 pr-4 text-right tabular-nums text-gray-900">
                  {m.current === null ? <span className="text-gray-300">—</span> : formatNaira(m.current, true)}
                </td>
                <td className="py-2 pr-4 text-right tabular-nums text-gray-600">
                  {m.prior === null ? <span className="text-gray-300">—</span> : formatNaira(m.prior, true)}
                </td>
                <td className={`py-2 text-right tabular-nums ${deltaColor}`}>
                  {m.deltaPct === null ? (
                    <span className="text-gray-300">—</span>
                  ) : (
                    <span className="inline-flex items-center gap-0.5">
                      {m.deltaPct > 0 ? <ArrowUpRight className="h-3 w-3" /> : m.deltaPct < 0 ? <ArrowDownRight className="h-3 w-3" /> : null}
                      {m.deltaPct > 0 ? '+' : ''}{m.deltaPct.toFixed(1)}%
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Cumulative Area Chart ──────────────────────────────────

function CumulativeChart({ data }: { data: TaxAnalyticsSeriesPoint[] }) {
  // Running-sum over locked reports. Non-locked months contribute 0 so the
  // line is flat across unpaid gaps — visually honest.
  const rows = useMemo(() => {
    let running = 0;
    return data.map((p) => {
      if (p.isLocked) running += p.taxPayable;
      return {
        _label: formatMonthShort(p.taxMonth),
        cumulative: parseFloat(running.toFixed(2)),
      };
    });
  }, [data]);

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer>
        <AreaChart data={rows} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="cumulativeFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.4} />
              <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
          <XAxis dataKey="_label" tick={{ fontSize: 12, fill: '#6b7280' }} />
          <YAxis
            tick={{ fontSize: 12, fill: '#6b7280' }}
            tickFormatter={(v: number) => formatNaira(v, true)}
          />
          <Tooltip
            formatter={(v) => [formatNaira(Number(v ?? 0)), 'Cumulative Tax Paid']}
            labelStyle={{ color: '#374151' }}
          />
          <Area
            type="monotone"
            dataKey="cumulative"
            stroke="#3b82f6"
            strokeWidth={2}
            fill="url(#cumulativeFill)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Empty state ────────────────────────────────────────────

function EmptyChart({
  title,
  cta,
  onCta,
}: {
  title: string;
  cta: string;
  onCta: () => void;
}) {
  return (
    <div className="flex h-80 flex-col items-center justify-center gap-4 rounded-lg border border-dashed border-gray-200 bg-gray-50 text-center">
      <TrendingUp className="h-10 w-10 text-gray-300" />
      <p className="font-body text-sm text-gray-500">{title}</p>
      <Button size="sm" variant="secondary" onClick={onCta}>
        <Calculator className="h-4 w-4" /> {cta}
      </Button>
    </div>
  );
}
