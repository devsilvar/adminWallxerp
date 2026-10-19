import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import { Skeleton, TableSkeleton } from '@/components/ui/Skeleton.tsx';
import AdminTransferDetailModal from '@/components/admin/AdminTransferDetailModal.tsx';
import { useAdminStatsStore } from '@/stores/admin.stats.store.ts';
import AdminTabBar, { tabPanelId } from './dashboard/AdminTabBar';
import FeeSettingsTab from './dashboard/FeeSettingsTab';
import OverviewTab from './dashboard/OverviewTab';
import TaxComplianceTab from './dashboard/TaxComplianceTab';
import TreasuryTab from './dashboard/TreasuryTab';
import useTreasuryAnalytics from './dashboard/useTreasuryAnalytics';
import { getSSEClient } from '@/lib/sse-client';

export default function AdminDashboard() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') || 'overview';

  const stats = useAdminStatsStore((s) => s.stats);
  const isStatsLoading = useAdminStatsStore((s) => s.loading && !s.stats);
  const isRefreshingStats = useAdminStatsStore((s) => s.loading);

  const treasury = useTreasuryAnalytics(activeTab === 'treasury');

  const [selectedTransferId, setSelectedTransferId] = useState<string | null>(null);
  const [selectedTransferType, setSelectedTransferType] = useState<'inflow' | 'outflow' | undefined>(undefined);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  const fetchOverviewStats = useCallback((showToast = false) => {
    useAdminStatsStore
      .getState()
      .fetchStats({ force: true })
      .then((result) => {
        if (showToast) {
          if (result) toast.success('Platform metrics refreshed');
          else toast.error('Failed to load platform stats');
        }
      });
  }, []);

  const { refresh: refreshTreasury } = treasury;

  useEffect(() => {
    fetchOverviewStats();
  }, [fetchOverviewStats]);

  // SSE Realtime Listeners for all 8 admin events
  useEffect(() => {
    const client = getSSEClient();

    const handleUpdate = () => {
      fetchOverviewStats();
      if (activeTab === 'treasury') {
        refreshTreasury();
      }
    };

    const events = [
      'broadcast_email_progress',
      'broadcast_email_completed',
      'withdrawal_created',
      'withdrawal_status_changed',
      'unverified_inflow_created',
      'unverified_inflow_verified',
      'subscription_submitted',
      'subscription_status_changed',
    ];

    events.forEach((evt) => client.on(evt, handleUpdate));

    return () => {
      events.forEach((evt) => client.off(evt, handleUpdate));
    };
  }, [fetchOverviewStats, activeTab, refreshTreasury]);

  // Fallback 7s polling while actionable metrics are non-zero
  useEffect(() => {
    const hasActionable =
      (stats?.withdrawalSla?.pendingCount ?? 0) > 0 ||
      (stats?.unverifiedInflows?.count ?? 0) > 0 ||
      (stats?.pendingSubscriptionsCount ?? 0) > 0;

    if (!hasActionable) return;

    const interval = setInterval(() => {
      fetchOverviewStats();
      if (activeTab === 'treasury') {
        refreshTreasury();
      }
    }, 7000);

    return () => clearInterval(interval);
  }, [
    stats?.withdrawalSla?.pendingCount,
    stats?.unverifiedInflows?.count,
    stats?.pendingSubscriptionsCount,
    activeTab,
    fetchOverviewStats,
    refreshTreasury,
  ]);

  function handleTabChange(tab: string) {
    const next = new URLSearchParams(searchParams);
    if (tab === 'overview') {
      next.delete('tab');
    } else {
      next.set('tab', tab);
    }
    setSearchParams(next);
  }

  function handleOpenDetail(id: string, type: 'inflow' | 'outflow') {
    setSelectedTransferId(id);
    setSelectedTransferType(type);
    setIsDetailOpen(true);
  }

  function handleRefresh() {
    if (activeTab === 'overview') fetchOverviewStats(true);
    else if (activeTab === 'treasury') treasury.refresh();
  }

  if (isStatsLoading && !stats) {
    return (
      <div className='space-y-4'>
        <div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
          <div className='space-y-2'>
            <Skeleton width={220} height={28} rounded='lg' />
            <Skeleton width={340} height={14} />
          </div>
        </div>
        <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4'>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className='space-y-2.5 rounded-panel border border-hairline bg-panel p-3'>
              <Skeleton width='40%' height={12} />
              <Skeleton width='70%' height={22} />
              <Skeleton width='50%' height={10} />
            </div>
          ))}
        </div>
        <div className='rounded-panel border border-hairline bg-panel p-3'>
          <Skeleton width={160} height={16} />
          <div className='mt-3'>
            <TableSkeleton rows={5} columns={3} showHeader={false} />
          </div>
        </div>
      </div>
    );
  }

  const busy = isRefreshingStats || treasury.isLoading;

  return (
    <div className='space-y-6 pb-12'>
      <div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
        <div>
          <div className='flex items-center gap-2'>
            <h1 className='text-xl font-bold tracking-tight text-ink sm:text-2xl'>
              Operations Dashboard
            </h1>
            <span className='rounded-full bg-primary-100 px-2.5 py-0.5 text-xs font-semibold text-primary-800'>
              Live
            </span>
          </div>
          <p className='mt-1 text-xs text-ink-muted sm:text-sm'>
            Platform overview, user activity, treasury P&amp;L, and compliance controls.
          </p>
        </div>

        <div className='flex items-center gap-2 self-start sm:self-auto'>
          <button
            type='button'
            onClick={handleRefresh}
            disabled={busy}
            aria-label='Refresh dashboard data'
            title='Refresh current view'
            className='inline-flex items-center gap-1.5 rounded-lg border border-hairline bg-panel px-3.5 py-2 text-xs font-semibold text-ink shadow-2xs transition-colors hover:bg-panel-subtle disabled:opacity-50'
          >
            <RefreshCw className={`h-3.5 w-3.5 ${busy ? 'animate-spin text-primary-600' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      <div className='flex items-center gap-1.5 overflow-x-auto border-b border-hairline pb-1'>
        <AdminTabBar activeTab={activeTab} onChange={handleTabChange} />
      </div>

      <div
        role='tabpanel'
        id={tabPanelId(activeTab)}
        aria-label={activeTab}
        className='pt-4'
      >
        {activeTab === 'overview' && stats && <OverviewTab stats={stats} />}
        {activeTab === 'treasury' && (
          <TreasuryTab
            data={treasury.data}
            isLoading={treasury.isLoading}
            isPageLoading={treasury.isPageLoading}
            pendingPage={treasury.pendingPage}
            filters={treasury.pagination}
            onInspect={handleOpenDetail}
          />
        )}
        {activeTab === 'fee-settings' && (
          <FeeSettingsTab onSweepCompleted={() => fetchOverviewStats()} />
        )}
        {activeTab === 'tax-compliance' && <TaxComplianceTab />}
      </div>

      <AdminTransferDetailModal
        transferId={selectedTransferId}
        transferType={selectedTransferType}
        isOpen={isDetailOpen}
        onClose={() => {
          setIsDetailOpen(false);
          setSelectedTransferId(null);
        }}
      />
    </div>
  );
}