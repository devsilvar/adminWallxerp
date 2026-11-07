import React from 'react';
import { Skeleton, TableSkeleton } from '@/components/ui/Skeleton.tsx';

export const AccountSkeleton: React.FC = () => {
  return (
    <div data-testid="account-skeleton" className="space-y-6 animate-fade-in py-2">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-gray-200/80">
        <div>
          <Skeleton width={180} height={28} className="mb-2" />
          <Skeleton width={260} height={14} />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton width={90} height={32} rounded="lg" />
          <Skeleton width={140} height={32} rounded="lg" />
        </div>
      </div>
      <div className="rounded-2xl bg-gradient-to-r from-purple-950 via-indigo-950 to-slate-950 p-6 sm:p-7 border border-purple-800/40 shadow-xl h-44" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-gray-200/80 bg-white p-5 shadow-xs space-y-3">
            <Skeleton width={80} height={12} />
            <Skeleton width={130} height={24} />
            <Skeleton width={100} height={12} />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 rounded-xl border border-gray-200/80 bg-white p-5 shadow-xs">
          <TableSkeleton rows={5} columns={4} showHeader={false} />
        </div>
        <div className="rounded-xl border border-gray-200/80 bg-white p-5 shadow-xs space-y-4">
          <Skeleton width="100%" height={100} rounded="xl" />
        </div>
      </div>
    </div>
  );
};

export default AccountSkeleton;
