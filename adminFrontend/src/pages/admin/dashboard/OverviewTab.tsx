import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  FileText,
  TrendingUp,
  Users,
  CreditCard,
} from 'lucide-react';
import type { AdminDashboardStats } from '@/types/index.ts';
import { HairlineGrid, Panel, PanelHeader } from '../shared/Panel';
import StatusPill from '../shared/StatusPill';
import StatCell from './StatCell';
import {
  formatCount,
  formatNaira,
  formatSignupDate,
  timeAgo,
} from '../shared/format';

const STATS = [
  {
    key: 'totalUsers' as const,
    label: 'Registered Users',
    sublabel: 'Active platform accounts',
    icon: Users,
    route: '/admin/users',
    isCurrency: false,
  },
  {
    key: 'totalBusinesses' as const,
    label: 'Registered Businesses',
    sublabel: 'Entities on platform',
    icon: Building2,
    route: '/admin/businesses',
    isCurrency: false,
  },
  {
    key: 'totalTaxReports' as const,
    label: 'Tax Reports Filed',
    sublabel: 'NRS compliance filings',
    icon: FileText,
    route: '/admin/businesses',
    isCurrency: false,
  },
  {
    key: 'totalRevenueProcessed' as const,
    label: 'Gross Volume (GMV)',
    sublabel: 'Cumulative sales processed',
    icon: TrendingUp,
    route: '/admin/withdrawals',
    isCurrency: true,
  },
];

export default function OverviewTab({ stats }: { stats: AdminDashboardStats }) {
  // Dates are formatted once per dataset instead of on every render.
  const signups = useMemo(
    () =>
      (stats.recentSignups || []).map((u) => ({
        ...u,
        initial: u.email.charAt(0).toUpperCase(),
        dateLabel: formatSignupDate(u.createdAt),
        agoLabel: timeAgo(u.createdAt),
      })),
    [stats.recentSignups],
  );

  const sla = stats.withdrawalSla;
  const hasSla = !!sla && sla.pendingCount > 0;
  const breached = hasSla && sla.breachedCount > 0;

  return (
    <div className='space-y-4'>
      {hasSla && (
        <div
          role='status'
          aria-live='polite'
          className={`flex flex-col items-start justify-between gap-2 rounded-panel border px-3 py-2 sm:flex-row sm:items-center ${
            breached
              ? 'border-danger-300 bg-danger-50'
              : 'border-warning-200 bg-warning-50'
          }`}
        >
          <div className='flex items-center gap-2.5'>
            <AlertTriangle
              className={`h-4 w-4 shrink-0 ${breached ? 'text-danger-600' : 'text-warning-600'}`}
              aria-hidden='true'
            />
            <div>
              <p className='flex flex-wrap items-center gap-2 text-xs font-semibold text-ink'>
                {sla.pendingCount} withdrawal{sla.pendingCount === 1 ? '' : 's'}{' '}
                awaiting approval
                {sla.breachedCount > 0 && (
                  <StatusPill tone='danger'>
                    SLA breach ({sla.breachedCount})
                  </StatusPill>
                )}
              </p>
              <p className='mt-0.5 text-[11px] text-ink-muted'>
                {breached
                  ? `${sla.breachedCount} transfer(s) pending over 24h. Immediate review required.`
                  : 'Pending review within normal 24h SLA window.'}
              </p>
            </div>
          </div>
          <Link
            to='/admin/withdrawals?status=pending'
            className='shrink-0 self-start rounded border border-hairline-strong bg-panel px-2.5 py-1 text-xs font-medium text-ink transition-colors hover:bg-panel-subtle focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 focus-visible:outline-none sm:self-auto'
          >
            Review queue &rarr;
          </Link>
        </div>
      )}

      {stats.pendingSubscriptionsCount ? (
        <div
          role='status'
          className='flex flex-col items-start justify-between gap-2 rounded-panel border border-primary-200 bg-primary-50 px-3 py-2 sm:flex-row sm:items-center'
        >
          <div className='flex items-center gap-2.5'>
            <CreditCard className='h-4 w-4 shrink-0 text-primary-700' aria-hidden='true' />
            <div>
              <p className='flex flex-wrap items-center gap-2 text-xs font-semibold text-ink'>
                {stats.pendingSubscriptionsCount} subscription payment{stats.pendingSubscriptionsCount === 1 ? '' : 's'} awaiting verification
              </p>
              <p className='mt-0.5 text-[11px] text-ink-muted'>
                Bank transfer proof submitted to Zenith Bank. Review and activate user plans.
              </p>
            </div>
          </div>
          <Link
            to='/admin/subscriptions?status=pending'
            className='shrink-0 self-start rounded border border-hairline-strong bg-panel px-2.5 py-1 text-xs font-medium text-ink transition-colors hover:bg-panel-subtle sm:self-auto'
          >
            Review subscriptions &rarr;
          </Link>
        </div>
      ) : null}

      <HairlineGrid columns={4}>
        {STATS.map(({ key, label, sublabel, icon, route, isCurrency }) => {
          const raw = stats[key];
          return (
            <StatCell
              key={key}
              label={label}
              sublabel={sublabel}
              icon={icon}
              to={route}
              value={
                isCurrency
                  ? formatNaira(raw as number)
                  : formatCount(raw as number)
              }
            />
          );
        })}
      </HairlineGrid>

      <Panel>
        <PanelHeader
          title='Recent Signups'
          hint='Latest accounts registered on the platform'
          actions={
            <Link
              to='/admin/users'
              className='flex items-center gap-1 text-xs font-medium text-primary-600 hover:text-primary-700 hover:underline focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 focus-visible:outline-none'
            >
              View all users{' '}
              <ArrowRight className='h-3 w-3' aria-hidden='true' />
            </Link>
          }
        />
        {signups.length === 0 ? (
          <p className='px-3 py-10 text-center text-xs text-ink-subtle'>
            No recent signups recorded.
          </p>
        ) : (
          <div className='divide-y divide-hairline'>
            {signups.map((u) => (
              <div
                key={u.id}
                className='flex h-9 items-center justify-between gap-3 px-3'
              >
                <div className='flex min-w-0 items-center gap-2.5'>
                  <span className='flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-panel-subtle text-[10px] font-semibold text-ink-muted'>
                    {u.initial}
                  </span>
                  <div className='min-w-0'>
                    <p className='truncate text-xs font-medium text-ink'>
                      {u.email}
                    </p>
                    <p className='text-[10px] text-ink-subtle'>
                      Registered {u.dateLabel}
                    </p>
                  </div>
                </div>
                <div className='flex shrink-0 items-center gap-2.5'>
                  <span className='hidden text-[10px] text-ink-subtle sm:inline'>
                    {u.agoLabel}
                  </span>
                  <Link
                    to={`/admin/users/${u.id}`}
                    className='text-xs font-medium text-primary-600 hover:text-primary-700 hover:underline focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 focus-visible:outline-none'
                  >
                    Inspect
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}
