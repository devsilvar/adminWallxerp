import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Users, Shield, CheckCircle2 } from 'lucide-react';
import { TableSkeleton } from '@/components/ui/Skeleton';
import api from '@/lib/axios';
import toast from 'react-hot-toast';
import type { AdminUser, Pagination } from '@/types/index';
import PageHeader from './shared/PageHeader';
import PaginationBar from './shared/Pagination';
import { Panel, PanelEmpty } from './shared/Panel';
import StatusPill from './shared/StatusPill';
import { formatDate } from './shared/format';

type UserFilter = 'all' | 'active' | 'inactive' | 'admin' | 'user';

const getPlanBadge = (u: AdminUser) => {
  const tier = (u.subscriptionTier || 'free').toLowerCase();
  if (tier === 'scale' || tier === 'scale_up') {
    return { tone: 'info' as const, label: 'Scale-Up' };
  }
  if (tier === 'business') {
    return { tone: 'success' as const, label: 'Business' };
  }
  if (tier === 'starter') {
    return { tone: 'info' as const, label: 'Starter' };
  }
  return { tone: 'warning' as const, label: 'Free Trial' };
};

export default function AdminUsers() {
  const navigate = useNavigate();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [page, setPage] = useState(1);
  const [filterStatus, setFilterStatus] = useState<UserFilter>('all');
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [isPageLoading, setIsPageLoading] = useState(false);
  const [pendingPage, setPendingPage] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    const isPaging = hasLoadedOnce;
    if (isPaging) setIsPageLoading(true);
    const params: Record<string, unknown> = { page, limit: 15 };
    if (filterStatus !== 'all') {
      if (filterStatus === 'admin') params.role = 'admin';
      if (filterStatus === 'inactive') params.isActive = false;
      if (filterStatus === 'active') params.isActive = true;
      if (filterStatus === 'user') params.role = 'user';
    }
    api.get('/admin/users', { params })
      .then((r) => {
        if (cancelled) return;
        setUsers(r.data.data);
        setPagination(r.data.pagination);
      })
      .catch((err: any) => {
        if (cancelled) return;
        toast.error(err?.response?.data?.error?.message || 'Failed to load users');
      })
      .finally(() => {
        if (cancelled) return;
        setIsPageLoading(false);
        setPendingPage(null);
        setHasLoadedOnce(true);
      });
    return () => { cancelled = true; };
  }, [page, filterStatus]);

  const handleFilterChange = (next: UserFilter) => {
    if (next === filterStatus) return;
    setFilterStatus(next);
    setPage(1);
    setPendingPage(null);
  };

  const handlePageChange = (next: number) => {
    if (next === page || isPageLoading) return;
    setPendingPage(next);
    setIsPageLoading(true);
    setPage(next);
  };

  const activeOnPage = users.filter(u => u.isActive).length;
  const verifiedOnPage = users.filter(u => u.isVerified).length;

  return (
    <div className='space-y-6'>
      {/* KPI Summary Cards */}
      <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3'>
        <Panel className='p-4'>
          <div className='flex items-center justify-between text-ink-muted text-xs'>
            <span className='font-medium'>Total Users</span>
            <Users className='h-4 w-4 text-primary-600' />
          </div>
          <div className='mt-2 text-2xl font-bold tabular-nums text-ink'>{pagination?.total ?? (hasLoadedOnce ? users.length : '—')}</div>
          <div className='text-xs text-ink-subtle mt-1'>
            {pagination ? `Page ${pagination.page} of ${pagination.totalPages} · ${pagination.total} total` : 'Platform accounts'}
          </div>
        </Panel>

        <Panel className='p-4'>
          <div className='flex items-center justify-between text-ink-muted text-xs'>
            <span className='font-medium'>Active (this page)</span>
            <CheckCircle2 className='h-4 w-4 text-emerald-600' />
          </div>
          <div className='mt-2 text-2xl font-bold tabular-nums text-emerald-600'>{hasLoadedOnce ? activeOnPage : '—'}</div>
          <div className='text-xs text-ink-subtle mt-1'>
            {users.length > 0 ? `${activeOnPage}/${users.length} on this page` : 'No rows on this page'}
          </div>
        </Panel>

        <Panel className='p-4'>
          <div className='flex items-center justify-between text-ink-muted text-xs'>
            <span className='font-medium'>Verified (this page)</span>
            <Shield className='h-4 w-4 text-emerald-600' />
          </div>
          <div className='mt-2 text-2xl font-bold tabular-nums text-ink'>{hasLoadedOnce ? verifiedOnPage : '—'}</div>
          <div className='text-xs text-ink-subtle mt-1'>
            {users.length > 0 ? `${verifiedOnPage}/${users.length} on this page` : 'No rows on this page'}
          </div>
        </Panel>
      </div>

      <PageHeader
        title='Users Directory'
        hint='Manage platform accounts, security clearance, and business associations.'
        actions={
          pagination && (
            <span className='text-[11px] text-ink-muted'>
              {pagination.total} registered {pagination.total === 1 ? 'account' : 'accounts'}
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
          All Users{pagination && filterStatus === 'all' ? ` (${pagination.total})` : ''}
        </button>
        <button
          onClick={() => handleFilterChange('active')}
          className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
            filterStatus === 'active' ? 'bg-emerald-600 text-white' : 'text-ink-muted hover:bg-panel-subtle hover:text-ink border border-hairline'
          }`}
        >
          Active{pagination && filterStatus === 'active' ? ` (${pagination.total})` : ''}
        </button>
        <button
          onClick={() => handleFilterChange('admin')}
          className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
            filterStatus === 'admin' ? 'bg-amber-600 text-white' : 'text-ink-muted hover:bg-panel-subtle hover:text-ink border border-hairline'
          }`}
        >
          Admins{pagination && filterStatus === 'admin' ? ` (${pagination.total})` : ''}
        </button>
      </div>

      {!hasLoadedOnce ? (
        <TableSkeleton rows={8} columns={9} />
      ) : users.length === 0 ? (
        <Panel>
          <PanelEmpty icon={Users} title='No users found' hint='No user accounts registered matching the criteria.' />
        </Panel>
      ) : (
        <Panel className='overflow-hidden'>
          <div className={`overflow-x-auto transition-opacity ${isPageLoading ? 'opacity-60 pointer-events-none' : 'opacity-100'}`} aria-busy={isPageLoading}>
            <table className='w-full min-w-[720px] text-left text-xs'>
              <thead className='border-b border-hairline-strong bg-panel-subtle text-[10px] font-semibold uppercase tracking-wider text-ink-muted'>
                <tr>
                  <th scope='col' className='px-3 py-1.5'>User</th>
                  <th scope='col' className='px-3 py-1.5'>Role</th>
                  <th scope='col' className='w-[70px] px-3 py-1.5 text-right'>Biz.</th>
                  <th scope='col' className='px-3 py-1.5'>Plan</th>
                  <th scope='col' className='px-3 py-1.5'>Payout Mode</th>
                  <th scope='col' className='px-3 py-1.5'>Status</th>
                  <th scope='col' className='px-3 py-1.5'>Joined</th>
                  <th scope='col' className='px-3 py-1.5 text-right'>Actions</th>
                </tr>
              </thead>
              <tbody className='divide-y divide-hairline'>
                {users.map((u) => (
                  <tr
                    key={u.id}
                    className='cursor-pointer transition-colors hover:bg-panel-subtle'
                    onClick={() => navigate(`/admin/users/${u.id}`)}
                  >
                    <td className='px-3 py-2.5'>
                      <Link
                        to={`/admin/users/${u.id}`}
                        className='font-semibold text-ink hover:text-primary-600 hover:underline text-left focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:outline-none'
                      >
                        {u.email}
                      </Link>
                      {u.phone && <div className='font-mono text-[10px] text-ink-subtle mt-0.5'>{u.phone}</div>}
                    </td>
                    <td className='px-3 py-2.5'>
                      {u.role === 'admin' ? (
                        <StatusPill tone='neutral'>Admin</StatusPill>
                      ) : (
                        <span className='text-ink-muted'>User</span>
                      )}
                    </td>
                    <td className='px-3 py-2.5 text-right font-mono tabular-nums text-ink-muted'>
                      {u._count?.businesses ?? 0}
                    </td>
                    <td className='px-3 py-2.5'>
                      <StatusPill tone={getPlanBadge(u).tone}>{getPlanBadge(u).label}</StatusPill>
                    </td>
                    <td className='px-3 py-2.5'>
                      <StatusPill tone={u.autoPayoutEnabled ? 'success' : 'neutral'}>
                        {u.autoPayoutEnabled ? '⚡ Automatic' : '🔒 Manual'}
                      </StatusPill>
                    </td>
                    <td className='px-3 py-2.5'>
                      <StatusPill tone={u.isActive ? 'success' : 'danger'}>{u.isActive ? 'Active' : 'Inactive'}</StatusPill>
                      <div className='text-[10px] text-ink-subtle mt-0.5'>{u.isVerified ? 'Verified' : 'Unverified'}</div>
                    </td>
                    <td className='px-3 py-2.5 whitespace-nowrap text-ink-muted'>{formatDate(u.createdAt)}</td>
                    <td className='px-3 py-2.5 text-right whitespace-nowrap'>
                      <Link
                        to={`/admin/users/${u.id}`}
                        className='inline-flex items-center gap-1.5 rounded-lg border border-hairline bg-panel px-3 py-1.5 text-xs font-semibold text-ink-muted hover:text-ink hover:bg-panel-subtle transition-colors'
                      >
                        Details
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {pagination && <PaginationBar pagination={pagination} onPageChange={handlePageChange} noun='users' isLoading={isPageLoading} pendingPage={pendingPage} />}
        </Panel>
      )}
    </div>
  );
}