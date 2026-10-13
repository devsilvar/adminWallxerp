import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Users } from 'lucide-react';
import { TableSkeleton } from '@/components/ui/Skeleton';
import api from '@/lib/axios';
import type { AdminUser, Pagination } from '@/types/index';
import PageHeader from './shared/PageHeader';
import PaginationBar from './shared/Pagination';
import { Panel, PanelEmpty } from './shared/Panel';
import StatusPill from './shared/StatusPill';
import { formatDate } from './shared/format';

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
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);

  const fetchUsers = useCallback(() => {
    setIsLoading(true);
    api.get('/admin/users', { params: { page, limit: 15 } })
      .then((r) => {
        setUsers(r.data.data);
        setPagination(r.data.pagination);
      })
      .finally(() => setIsLoading(false));
  }, [page]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  return (
    <div className='space-y-4'>
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

      {isLoading ? (
        <TableSkeleton rows={8} columns={9} />
      ) : users.length === 0 ? (
        <Panel>
          <PanelEmpty
            icon={Users}
            title='No users found'
            hint='No user accounts are registered matching the criteria.'
          />
        </Panel>
      ) : (
        <Panel className='overflow-hidden'>
          <div className='overflow-x-auto'>
            <table className='w-full min-w-[760px] text-left text-xs'>
              <thead className='border-b border-hairline-strong bg-panel-subtle text-[10px] font-semibold uppercase tracking-wider text-ink-muted'>
                <tr>
                  <th scope='col' className='px-3 py-2'>User</th>
                  <th scope='col' className='px-3 py-2'>Role</th>
                  <th scope='col' className='w-[70px] px-3 py-2 text-right'>Biz.</th>
                  <th scope='col' className='px-3 py-2'>Plan</th>
                  <th scope='col' className='px-3 py-2'>Payout Mode</th>
                  <th scope='col' className='px-3 py-2'>Verified</th>
                  <th scope='col' className='px-3 py-2'>Status</th>
                  <th scope='col' className='px-3 py-2'>Joined</th>
                  <th scope='col' className='w-[90px] px-3 py-2 text-right'>Actions</th>
                </tr>
              </thead>
              <tbody className='divide-y divide-hairline'>
                {users.map((u) => (
                  <tr key={u.id} className='transition-colors hover:bg-panel-subtle'>
                    <td className='px-3 py-2.5'>
                      <Link
                        to={`/admin/users/${u.id}`}
                        className='font-semibold text-ink hover:text-primary-600 hover:underline text-left focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:outline-none'
                      >
                        {u.email}
                      </Link>
                      {u.phone && (
                        <div className='font-mono text-[10px] text-ink-subtle mt-0.5'>{u.phone}</div>
                      )}
                    </td>
                    <td className='px-3 py-2.5'>
                      {u.role === 'admin' ? (
                        <StatusPill tone='neutral'>Admin</StatusPill>
                      ) : (
                        <span className='text-ink-muted'>User</span>
                      )}
                    </td>
                    <td className='px-3 py-2.5 text-right font-mono tabular-nums text-ink-muted'>
                      {u._count.businesses}
                    </td>
                    <td className='px-3 py-2.5'>
                      <StatusPill tone={getPlanBadge(u).tone}>
                        {getPlanBadge(u).label}
                      </StatusPill>
                    </td>
                    <td className='px-3 py-2.5'>
                      <StatusPill tone={u.autoPayoutEnabled ? 'success' : 'neutral'}>
                        {u.autoPayoutEnabled ? '⚡ Automatic' : '🔒 Manual'}
                      </StatusPill>
                    </td>
                    <td className='px-3 py-2.5'>
                      <StatusPill tone={u.isVerified ? 'success' : 'warning'}>
                        {u.isVerified ? 'Verified' : 'Unverified'}
                      </StatusPill>
                    </td>
                    <td className='px-3 py-2.5'>
                      <StatusPill tone={u.isActive ? 'success' : 'danger'}>
                        {u.isActive ? 'Active' : 'Inactive'}
                      </StatusPill>
                    </td>
                    <td className='px-3 py-2.5 whitespace-nowrap text-ink-muted'>{formatDate(u.createdAt)}</td>
                    <td className='px-3 py-2.5 text-right whitespace-nowrap'>
                      <Link
                        to={`/admin/users/${u.id}`}
                        className='inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors text-xs text-ink-muted hover:text-ink hover:bg-panel-subtle px-2.5 py-1.5 border border-hairline'
                      >
                        Details
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {pagination && <PaginationBar pagination={pagination} onPageChange={setPage} noun='users' />}
        </Panel>
      )}
    </div>
  );
}