import { useEffect, useState } from 'react';
import { Building2 } from 'lucide-react';
import { TableSkeleton } from '@/components/ui/Skeleton.tsx';
import api from '@/lib/axios.ts';
import type { AdminBusiness, Pagination } from '@/types/index.ts';
import PageHeader from './shared/PageHeader';
import PaginationBar from './shared/Pagination';
import { Panel, PanelEmpty } from './shared/Panel';
import { formatDate } from './shared/format';

export default function AdminBusinesses() {
  const [businesses, setBusinesses] = useState<AdminBusiness[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setIsLoading(true);
    api.get('/admin/businesses', { params: { page, limit: 15 } })
      .then((r) => { setBusinesses(r.data.data); setPagination(r.data.pagination); })
      .finally(() => setIsLoading(false));
  }, [page]);

  return (
    <div className='space-y-4'>
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

      {isLoading ? (
        <TableSkeleton rows={8} columns={6} />
      ) : businesses.length === 0 ? (
        <Panel>
          <PanelEmpty
            icon={Building2}
            title='No businesses found'
            hint='No business entities registered on the platform.'
          />
        </Panel>
      ) : (
        <Panel className='overflow-hidden'>
          <div className='overflow-x-auto'>
            <table className='w-full min-w-[820px] text-left text-xs'>
              <thead className='border-b border-hairline-strong bg-panel-subtle text-[10px] font-semibold uppercase tracking-wider text-ink-muted'>
                <tr>
                  <th scope='col' className='px-3 py-1.5'>Business</th>
                  <th scope='col' className='px-3 py-1.5'>Owner</th>
                  <th scope='col' className='px-3 py-1.5'>Type</th>
                  <th scope='col' className='px-3 py-1.5'>Location</th>
                  <th scope='col' className='px-3 py-1.5'>User</th>
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
                    <td className='px-3 py-1.5 text-ink-muted'>
                      {[b.city, b.state].filter(Boolean).join(', ') || '—'}
                    </td>
                    <td className='px-3 py-1.5 text-ink-muted'>{b.user.email}</td>
                    <td className='px-3 py-1.5 whitespace-nowrap text-ink-muted'>{formatDate(b.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {pagination && <PaginationBar pagination={pagination} onPageChange={setPage} noun='businesses' />}
        </Panel>
      )}
    </div>
  );
}