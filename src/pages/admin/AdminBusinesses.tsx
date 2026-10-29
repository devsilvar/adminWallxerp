import { useEffect, useState } from 'react';
import { Building2, CheckCircle2, TrendingUp } from 'lucide-react';
import { TableSkeleton } from '@/components/ui/Skeleton.tsx';
import api from '@/lib/axios.ts';
import toast from 'react-hot-toast';
import type { AdminBusiness, Pagination } from '@/types/index.ts';
import PageHeader from './shared/PageHeader';
import PaginationBar from './shared/Pagination';
import { Panel, PanelEmpty } from './shared/Panel';
import { formatDate } from './shared/format';
import StatusPill from './shared/StatusPill';
import { usePaginationTransition } from '@/hooks/usePaginationTransition';

type BusinessFilter = 'all' | 'active' | 'inactive';

type ExtendedBusiness = AdminBusiness & {
  isActive?: boolean;
  merchantId?: string;
  _count?: { sales: number; invoices: number };
};

export default function AdminBusinesses() {
  const [businesses, setBusinesses] = useState<ExtendedBusiness[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [page, setPage] = useState(1);
  const [filterStatus, setFilterStatus] = useState<BusinessFilter>('all');
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const { isPageLoading, pendingPage, start, finish } = usePaginationTransition();

  useEffect(() => {
    let cancelled = false;
    if (hasLoadedOnce) start(page);
    const params: Record<string, unknown> = { page, limit: 15 };
    if (filterStatus !== 'all') {
      params.isActive = filterStatus === 'active';
    }
    api.get('/admin/businesses', { params })
      .then((r) => {
        if (cancelled) return;
        setBusinesses(r.data.data as ExtendedBusiness[]);
        setPagination(r.data.pagination);
      })
      .catch((err: any) => {
        if (cancelled) return;
        toast.error(err?.response?.data?.error?.message || 'Failed to load businesses');
      })
      .finally(() => {
        if (cancelled) return;
        finish();
        setHasLoadedOnce(true);
      });
    return () => { cancelled = true; };
  }, [page, filterStatus]);

  const handleFilterChange = (next: BusinessFilter) => {
    if (next === filterStatus) return;
    setFilterStatus(next);
    setPage(1);
  };

  const handlePageChange = (next: number) => {
    if (next === page || isPageLoading) return;
    start(next);
    setPage(next);
  };

  const activeCount = businesses.filter(b => b.isActive !== false).length;
  const totalSales = businesses.reduce((sum, b) => sum + (b._count?.sales ?? 0), 0);
  const totalInvoices = businesses.reduce((sum, b) => sum + (b._count?.invoices ?? 0), 0);

  return (
    <div className='space-y-6'>
      {/* KPI Summary Cards */}
      <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4'>
        <Panel className='p-4'>
          <div className='flex items-center justify-between text-ink-muted text-xs'>
            <span className='font-medium'>Total Businesses</span>
            <Building2 className='h-4 w-4 text-primary-600' />
          </div>
          <div className='mt-2 text-2xl font-bold tabular-nums text-ink'>{businesses.length}</div>
          <div className='text-xs text-ink-subtle mt-1'>Entities registered</div>
        </Panel>

        <Panel className='p-4'>
          <div className='flex items-center justify-between text-ink-muted text-xs'>
            <span className='font-medium'>Active Businesses</span>
            <CheckCircle2 className='h-4 w-4 text-emerald-600' />
          </div>
          <div className='mt-2 text-2xl font-bold tabular-nums text-emerald-600'>{activeCount}</div>
          <div className='text-xs text-ink-subtle mt-1'>
            {businesses.length > 0 ? Math.round((activeCount / businesses.length) * 100) : 0}% active
          </div>
        </Panel>

        <Panel className='p-4'>
          <div className='flex items-center justify-between text-ink-muted text-xs'>
            <span className='font-medium'>Total Sales</span>
            <TrendingUp className='h-4 w-4 text-emerald-600' />
          </div>
          <div className='mt-2 text-2xl font-bold font-mono text-ink'>₦{totalSales.toLocaleString()}</div>
          <div className='text-xs text-ink-subtle mt-1'>All transactions</div>
        </Panel>

        <Panel className='p-4'>
          <div className='flex items-center justify-between text-ink-muted text-xs'>
            <span className='font-medium'>Total Invoices</span>
            <CheckCircle2 className='h-4 w-4 text-amber-500' />
          </div>
          <div className='mt-2 text-2xl font-bold tabular-nums text-ink'>{totalInvoices}</div>
          <div className='text-xs text-ink-subtle mt-1'>Invoices created</div>
        </Panel>
      </div>

      <PageHeader
        title='Business Entities'
        hint='All registered businesses filing taxes and holding dedicated virtual accounts.'
        actions={
          pagination && (
            <span className='text-[11px] text-ink-muted'>
              {pagination.total} registered {pagination.total === 1 ? 'entity' : 'entities'}
            </span>
          )
        }
      />

      {/* Filter Tabs */}
      <div className='flex items-center gap-2 border-b border-hairline pb-4'>
        <button
          onClick={() => handleFilterChange('all')}
          className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
            filterStatus === 'all' ? 'bg-primary-600 text-white' : 'text-ink-muted hover:bg-panel-subtle hover:text-ink border border-hairline'
          }`}
        >
          All
        </button>
        <button
          onClick={() => handleFilterChange('active')}
          className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
            filterStatus === 'active' ? 'bg-emerald-600 text-white' : 'text-ink-muted hover:bg-panel-subtle hover:text-ink border border-hairline'
          }`}
        >
          Active
        </button>
        <button
          onClick={() => handleFilterChange('inactive')}
          className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
            filterStatus === 'inactive' ? 'bg-rose-600 text-white' : 'text-ink-muted hover:bg-panel-subtle hover:text-ink border border-hairline'
          }`}
        >
          Inactive
        </button>
      </div>

      {!hasLoadedOnce ? (
        <TableSkeleton rows={8} columns={5} />
      ) : businesses.length === 0 ? (
        <Panel>
          <PanelEmpty icon={Building2} title='No businesses found' hint='No business entities registered on the platform.' />
        </Panel>
      ) : (
        <Panel className='overflow-hidden'>
          <div className={`overflow-x-auto transition-opacity ${isPageLoading ? 'opacity-60 pointer-events-none' : 'opacity-100'}`} aria-busy={isPageLoading}>
            <table className='w-full min-w-[720px] text-left text-xs'>
              <thead className='border-b border-hairline-strong bg-panel-subtle text-[10px] font-semibold uppercase tracking-wider text-ink-muted'>
                <tr>
                  <th scope='col' className='px-3 py-1.5'>Business</th>
                  <th scope='col' className='px-3 py-1.5'>Owner</th>
                  <th scope='col' className='px-3 py-1.5'>Type</th>
                  <th scope='col' className='px-3 py-1.5'>Merchant ID</th>
                  <th scope='col' className='px-3 py-1.5'>Location</th>
                  <th scope='col' className='px-3 py-1.5'>Status</th>
                  <th scope='col' className='px-3 py-1.5'>Registered</th>
                </tr>
              </thead>
              <tbody className='divide-y divide-hairline'>
                {businesses.map((b) => (
                  <tr key={b.id} className='transition-colors hover:bg-panel-subtle'>
                    <td className='px-3 py-1.5'>
                      <p className='font-medium text-ink'>{b.businessName}</p>
                      {b.taxId && <p className='font-mono text-[10px] text-ink-subtle'>TIN {b.taxId}</p>}
                    </td>
                    <td className='px-3 py-1.5 text-ink'>{b.ownerName}</td>
                    <td className='px-3 py-1.5 text-ink-muted'>{b.businessType}</td>
                    <td className='px-3 py-1.5 font-mono text-ink-muted whitespace-nowrap'>{b.merchantId || '—'}</td>
                    <td className='px-3 py-1.5 text-ink-muted'>
                      {[b.city, b.state].filter(Boolean).join(', ') || '—'}
                    </td>
                    <td className='px-3 py-1.5'>
                      {typeof b.isActive === 'boolean' ? (
                        <StatusPill tone={b.isActive ? 'success' : 'danger'}>{b.isActive ? 'Active' : 'Inactive'}</StatusPill>
                      ) : (
                        <StatusPill tone='success'>Active</StatusPill>
                      )}
                    </td>
                    <td className='px-3 py-1.5 whitespace-nowrap text-ink-muted'>{formatDate(b.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {pagination && <PaginationBar pagination={pagination} onPageChange={handlePageChange} noun='businesses' isLoading={isPageLoading} pendingPage={pendingPage} />}
        </Panel>
      )}
    </div>
  );
}