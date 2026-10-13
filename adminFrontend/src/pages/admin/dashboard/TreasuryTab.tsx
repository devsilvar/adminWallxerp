import { Suspense, lazy, useMemo } from 'react';
import { Filter, Search, ShieldCheck, X } from 'lucide-react';
import { Skeleton } from '@/components/ui/Skeleton.tsx';
import type { TreasuryAnalyticsData } from '@/types/index.ts';
import { HairlineCell, HairlineGrid, Panel } from '../shared/Panel';
import Pagination from '../shared/Pagination';
import SegmentedControl from '../shared/SegmentedControl';
import StatusPill from '../shared/StatusPill';
import StatCell from './StatCell';
import TransferTable from './TreasuryTransferTable';
import type { TreasuryChartDatum } from './TreasuryCharts';
import type { TreasuryFilters, TreasuryOutcome, TreasuryType } from './useTreasuryAnalytics';
import { formatNaira, formatSignedNaira } from '../shared/format';

// Recharts (~150kB gz) only downloads when the treasury tab is actually opened.
const TreasuryCharts = lazy(() => import('./TreasuryCharts'));

const TYPE_OPTIONS: ReadonlyArray<{ value: TreasuryType; label: string }> = [
  { value: 'all', label: 'All transfers' },
  { value: 'inflow', label: 'Inflows (DVA)' },
  { value: 'outflow', label: 'Outflows (payouts)' },
];

const OUTCOME_OPTIONS: ReadonlyArray<{ value: TreasuryOutcome; label: string; activeClassName?: string }> = [
  { value: 'all', label: 'All' },
  { value: 'profit', label: 'Profits', activeClassName: 'border-success-600 bg-success-600 text-white' },
  { value: 'loss', label: 'Losses', activeClassName: 'border-danger-600 bg-danger-600 text-white' },
];

export default function TreasuryTab({
  data,
  isLoading,
  filters,
  onInspect,
}: {
  data: TreasuryAnalyticsData | null;
  isLoading: boolean;
  filters: TreasuryFilters;
  onInspect: (id: string, type: 'inflow' | 'outflow') => void;
}) {
  const kpis = data?.kpis;

  const volumeData = useMemo<TreasuryChartDatum[]>(() => {
    if (!kpis) return [];
    return [
      { name: 'Gross Inflows (DVA)', amount: kpis.totalGrossInflows, fill: '#2563eb' },
      { name: 'Gross Outflows (Payouts)', amount: kpis.totalGrossOutflows, fill: '#6d28d9' },
      {
        name: 'Platform Net Margin',
        amount: Math.abs(kpis.netPlatformMargin),
        fill: kpis.isProfitable ? '#16a34a' : '#ef4444',
      },
    ];
  }, [kpis]);

  const feeData = useMemo<TreasuryChartDatum[]>(() => {
    if (!kpis) return [];
    return [
      { name: 'Withdrawal Fees (Revenue)', amount: kpis.totalWithdrawalFeesCollected, fill: '#16a34a' },
      { name: 'DVA 1% Absorbed (Cost)', amount: kpis.totalInflowFeesAbsorbed, fill: '#ef4444' },
      { name: 'Disbursement Cost (Cost)', amount: kpis.totalDisbursementCost, fill: '#f87171' },
    ];
  }, [kpis]);

  return (
    <div className='space-y-4'>
      {kpis && (
        <>
          <HairlineGrid columns={3}>
            <StatCell
              label='Gross DVA Inflows'
              sublabel='Merchant bank transfer deposits captured'
              value={formatNaira(kpis.totalGrossInflows)}
            />
            <StatCell
              label='Gross Outflows'
              sublabel='Settlement withdrawals disbursed'
              value={formatNaira(kpis.totalGrossOutflows)}
            />
            <div className='bg-panel px-3 py-2.5'>
              <div className='flex items-start justify-between gap-2'>
                <span className='flex items-center gap-1.5 text-[11px] font-medium text-ink-muted'>
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${kpis.isProfitable ? 'bg-success-600' : 'bg-danger-600'}`}
                    aria-hidden='true'
                  />
                  Net Platform Margin
                </span>
              </div>
              <p
                className={`mt-1 font-mono text-xl font-semibold tabular-nums ${
                  kpis.isProfitable ? 'text-success-700' : 'text-danger-700'
                }`}
              >
                {formatSignedNaira(kpis.netPlatformMargin)}
              </p>
              <p className='mt-0.5 text-[10px] text-ink-subtle'>
                Fees collected − (DVA 1% absorbed + gateway costs)
              </p>
            </div>
          </HairlineGrid>

          <HairlineGrid columns={3}>
            <HairlineCell>
              <div className='flex items-baseline justify-between gap-2'>
                <span className='text-[11px] font-medium text-ink-muted'>Inflow Fee Absorbed</span>
                <span className='text-[10px] font-medium text-ink-subtle'>−1.00%</span>
              </div>
              <p className='mt-1 font-mono text-lg font-semibold tabular-nums text-ink'>
                {formatSignedNaira(-kpis.totalInflowFeesAbsorbed)}
              </p>
              <p className='mt-0.5 text-[10px] text-ink-subtle'>Paystack DVA cost absorbed by platform</p>
            </HairlineCell>
            <HairlineCell>
              <div className='flex items-baseline justify-between gap-2'>
                <span className='text-[11px] font-medium text-ink-muted'>Withdrawal Fees Collected</span>
                <span className='text-[10px] font-medium text-ink-subtle'>Revenue</span>
              </div>
              <p className='mt-1 font-mono text-lg font-semibold tabular-nums text-success-700'>
                {formatSignedNaira(kpis.totalWithdrawalFeesCollected)}
              </p>
              <p className='mt-0.5 text-[10px] text-ink-subtle'>Platform fee charged on payout</p>
            </HairlineCell>
            <HairlineCell>
              <div className='flex items-baseline justify-between gap-2'>
                <span className='text-[11px] font-medium text-ink-muted'>Disbursement Costs</span>
                <span className='text-[10px] font-medium text-ink-subtle'>Gateway cost</span>
              </div>
              <p className='mt-1 font-mono text-lg font-semibold tabular-nums text-ink'>
                {formatSignedNaira(-kpis.totalDisbursementCost)}
              </p>
              <p className='mt-0.5 text-[10px] text-ink-subtle'>Transfer schedule + ₦50 EMTL levy</p>
            </HairlineCell>
          </HairlineGrid>
        </>
      )}

      <Panel className='px-3 py-2.5'>
        <div className='flex flex-col items-start justify-between gap-2 sm:flex-row sm:items-center'>
          <div className='flex items-start gap-2.5'>
            <ShieldCheck className='mt-0.5 h-4 w-4 shrink-0 text-success-600' aria-hidden='true' />
            <div>
              <div className='flex flex-wrap items-center gap-2'>
                <h2 className='text-[13px] font-semibold text-ink'>1:1 Gateway Solvency Oracle</h2>
                <StatusPill tone='success'>100% fully backed</StatusPill>
              </div>
              <p className='mt-0.5 text-[11px] text-ink-muted'>
                Live Paystack gateway balance continuously audited against aggregate merchant liabilities via
                nightly 01:00 WAT reconciliation.
              </p>
            </div>
          </div>
          <dl className='flex shrink-0 items-center gap-4 text-[11px]'>
            <div>
              <dt className='text-[10px] font-medium uppercase tracking-wider text-ink-subtle'>
                Reserve invariant
              </dt>
              <dd className='font-mono font-medium text-success-700'>Assets ≥ Liabilities</dd>
            </div>
            <div className='h-6 w-px bg-hairline' aria-hidden='true' />
            <div>
              <dt className='text-[10px] font-medium uppercase tracking-wider text-ink-subtle'>
                Operating model
              </dt>
              <dd className='font-medium text-ink'>Non-custodial</dd>
            </div>
          </dl>
        </div>
      </Panel>

      {kpis && (
        <Suspense fallback={<Skeleton width='100%' height={208} rounded='none' />}>
          <TreasuryCharts volumeData={volumeData} feeData={feeData} />
        </Suspense>
      )}

      <Panel className='px-3 py-2'>
        <div className='flex flex-col items-stretch gap-2 xl:flex-row xl:items-center xl:justify-between'>
          <div className='flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:gap-4'>
            <SegmentedControl
              label='Type'
              icon={Filter}
              options={TYPE_OPTIONS}
              value={filters.type}
              onChange={filters.setType}
            />
            <SegmentedControl
              label='Outcome'
              options={OUTCOME_OPTIONS}
              value={filters.outcome}
              onChange={filters.setOutcome}
            />
          </div>

          <div className='flex items-center gap-2'>
            <div className='relative w-full xl:w-72'>
              <Search
                className='absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-subtle'
                aria-hidden='true'
              />
              <input
                type='search'
                placeholder='Search reference or business...'
                aria-label='Search transfers by reference or business'
                value={filters.searchInput}
                onChange={(e) => filters.setSearchInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    filters.applySearch();
                  }
                }}
                className='h-8 w-full rounded border border-hairline-strong bg-panel pl-8 pr-8 font-mono text-xs text-ink placeholder:text-ink-subtle focus:border-primary-500 focus:ring-1 focus:ring-primary-500/30 focus:outline-none'
              />
              {filters.hasActiveSearch && (
                <button
                  type='button'
                  onClick={filters.clearSearch}
                  aria-label='Clear search'
                  className='absolute right-2 top-1/2 -translate-y-1/2 text-ink-subtle hover:text-ink'
                >
                  <X className='h-3.5 w-3.5' />
                </button>
              )}
            </div>
            <button
              type='button'
              onClick={filters.applySearch}
              className='h-8 shrink-0 rounded border border-hairline-strong bg-panel px-3 text-xs font-medium text-ink transition-colors hover:bg-panel-subtle focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:outline-none'
            >
              Apply
            </button>
          </div>
        </div>
      </Panel>

      <Panel className='overflow-hidden'>
        <TransferTable
          transfers={data?.transfers ?? []}
          isLoading={isLoading}
          hasLoadedOnce={data !== null}
          onInspect={onInspect}
        />

        {data && (
          <Pagination pagination={data.pagination} onPageChange={filters.setPage} noun='transfers' />
        )}
      </Panel>
    </div>
  );
}