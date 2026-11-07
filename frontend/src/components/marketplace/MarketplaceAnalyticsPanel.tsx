import { useState } from 'react';
import {
  Eye,
  MessageSquare,
  TrendingUp,
  Sparkles,
  BarChart3,
  Calendar,
  Award,
} from 'lucide-react';
import type { MarketplaceAnalyticsResponse } from '@/types/index.ts';

interface MarketplaceAnalyticsPanelProps {
  analytics: MarketplaceAnalyticsResponse | null;
  loading: boolean;
  periodDays: number;
  onPeriodChange: (days: number) => void;
}

export default function MarketplaceAnalyticsPanel({
  analytics,
  loading,
  periodDays,
  onPeriodChange,
}: MarketplaceAnalyticsPanelProps) {
  const [activeMetric, setActiveMetric] = useState<'all' | 'views' | 'contacts'>('all');

  if (loading && !analytics) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm animate-pulse space-y-4">
        <div className="h-5 bg-gray-200 rounded w-48" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="h-20 bg-gray-100 rounded-lg" />
          <div className="h-20 bg-gray-100 rounded-lg" />
          <div className="h-20 bg-gray-100 rounded-lg" />
          <div className="h-20 bg-gray-100 rounded-lg" />
        </div>
      </div>
    );
  }

  const summary = analytics?.summary ?? {
    totalProducts: 0,
    liveProducts: 0,
    totalViews: 0,
    totalContacts: 0,
    totalImpressions: 0,
    conversionRate: 0,
  };

  const timeseries = analytics?.timeseries ?? [];
  const maxViews = Math.max(...timeseries.map((t) => t.views), 1);
  const maxContacts = Math.max(...timeseries.map((t) => t.contacts), 1);

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm space-y-6">
      {/* Header and 7d/30d Period Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-100 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-purple-100 rounded-md text-purple-700">
              <BarChart3 className="w-4 h-4" />
            </div>
            <h3 className="font-bold text-gray-900 text-base">
              Marketplace Performance &amp; Demand
            </h3>
          </div>
          <p className="text-xs text-gray-500 mt-0.5">
            Real buyer traffic, WhatsApp contacts, and category placement derived from verified marketplace events.
          </p>
        </div>

        {/* 7d vs 30d Toggle */}
        <div className="flex items-center bg-gray-100 rounded-lg p-1 text-xs self-start sm:self-auto">
          <button
            type="button"
            onClick={() => onPeriodChange(7)}
            className={`px-3 py-1 font-semibold rounded-md transition-all ${
              periodDays === 7
                ? 'bg-white text-purple-700 shadow-xs'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Last 7 Days
          </button>
          <button
            type="button"
            onClick={() => onPeriodChange(30)}
            className={`px-3 py-1 font-semibold rounded-md transition-all ${
              periodDays === 30
                ? 'bg-white text-purple-700 shadow-xs'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Last 30 Days
          </button>
        </div>
      </div>

      {/* 4 Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Views */}
        <div className="bg-purple-50/60 border border-purple-100 rounded-xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-purple-900 uppercase tracking-wide">
              Listing Views
            </span>
            <div className="p-1.5 bg-purple-100 rounded-lg text-purple-700">
              <Eye className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <p className="text-2xl font-extrabold text-purple-950">
              {summary.totalViews.toLocaleString()}
            </p>
            <p className="text-[11px] text-purple-700 mt-0.5">
              Unique buyer visits
            </p>
          </div>
        </div>

        {/* Total Contacts */}
        <div className="bg-emerald-50/60 border border-emerald-100 rounded-xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-emerald-900 uppercase tracking-wide">
              Buyer Contacts
            </span>
            <div className="p-1.5 bg-emerald-100 rounded-lg text-emerald-700">
              <MessageSquare className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <p className="text-2xl font-extrabold text-emerald-950">
              {summary.totalContacts.toLocaleString()}
            </p>
            <p className="text-[11px] text-emerald-700 mt-0.5">
              WhatsApp &amp; phone inquiries
            </p>
          </div>
        </div>

        {/* Conversion Rate */}
        <div className="bg-blue-50/60 border border-blue-100 rounded-xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-blue-900 uppercase tracking-wide">
              Inquiry Rate
            </span>
            <div className="p-1.5 bg-blue-100 rounded-lg text-blue-700">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <p className="text-2xl font-extrabold text-blue-950">
              {summary.conversionRate}%
            </p>
            <p className="text-[11px] text-blue-700 mt-0.5">
              Views to direct contact
            </p>
          </div>
        </div>

        {/* Boost Impressions */}
        <div className="bg-amber-50/60 border border-amber-100 rounded-xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-amber-900 uppercase tracking-wide">
              Promoted Reach
            </span>
            <div className="p-1.5 bg-amber-100 rounded-lg text-amber-700">
              <Sparkles className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <p className="text-2xl font-extrabold text-amber-950">
              {summary.totalImpressions.toLocaleString()}
            </p>
            <p className="text-[11px] text-amber-700 mt-0.5">
              Delivered page-1 impressions
            </p>
          </div>
        </div>
      </div>

      {/* Timeseries Trend Visualization (Gap-filled, Pure SVG/CSS, 0-skipped days) */}
      <div className="border border-gray-100 rounded-xl p-4 bg-gray-50/50">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-gray-500" />
            <h4 className="text-xs font-bold text-gray-800 uppercase tracking-wide">
              Daily Activity Trend ({periodDays} Days)
            </h4>
          </div>

          <div className="flex items-center gap-3 text-xs">
            <button
              type="button"
              onClick={() => setActiveMetric('all')}
              className={`flex items-center gap-1.5 ${
                activeMetric === 'all' ? 'font-bold text-gray-900' : 'text-gray-500'
              }`}
            >
              <span className="w-2.5 h-2.5 rounded-full bg-purple-600" />
              <span>Views</span>
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 ml-1" />
              <span>Contacts</span>
            </button>
          </div>
        </div>

        {timeseries.length > 0 ? (
          <div className="space-y-2">
            <div className="h-32 flex items-end gap-1 sm:gap-2 pt-4 px-1">
              {timeseries.map((point) => {
                const viewHeightPct = Math.max(4, Math.round((point.views / maxViews) * 100));
                const contactHeightPct = Math.max(4, Math.round((point.contacts / maxContacts) * 100));
                const dayLabel = point.date.slice(8); // DD

                return (
                  <div
                    key={point.date}
                    className="flex-1 flex flex-col items-center gap-1 h-full justify-end group relative"
                  >
                    {/* Tooltip on hover */}
                    <div className="absolute bottom-full mb-2 hidden group-hover:flex flex-col bg-gray-900 text-white text-[10px] rounded px-2 py-1 shadow-md z-10 whitespace-nowrap pointer-events-none">
                      <span className="font-bold">{point.date}</span>
                      <span>{point.views} views</span>
                      <span>{point.contacts} contacts</span>
                    </div>

                    {/* Bars container */}
                    <div className="w-full flex items-end justify-center gap-0.5 h-full">
                      {(activeMetric === 'all' || activeMetric === 'views') && (
                        <div
                          className="w-1.5 sm:w-2.5 bg-purple-500/80 hover:bg-purple-600 rounded-t transition-all"
                          style={{ height: `${viewHeightPct}%` }}
                          title={`${point.date}: ${point.views} views`}
                        />
                      )}
                      {(activeMetric === 'all' || activeMetric === 'contacts') && (
                        <div
                          className="w-1.5 sm:w-2.5 bg-emerald-500/80 hover:bg-emerald-600 rounded-t transition-all"
                          style={{ height: `${contactHeightPct}%` }}
                          title={`${point.date}: ${point.contacts} contacts`}
                        />
                      )}
                    </div>

                    {/* Day label */}
                    <span className="text-[10px] text-gray-400 font-medium">
                      {dayLabel}
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="flex justify-between text-[11px] text-gray-400 px-1 pt-1 border-t border-gray-200">
              <span>{timeseries[0]?.date}</span>
              <span>{timeseries[timeseries.length - 1]?.date}</span>
            </div>
          </div>
        ) : (
          <div className="py-8 text-center text-xs text-gray-400">
            No listing interaction data recorded for this period yet.
          </div>
        )}
      </div>

      {/* Per-Product Ranking & Placement Badges */}
      {analytics && analytics.products && analytics.products.length > 0 && (
        <div className="space-y-3 pt-2">
          <h4 className="text-xs font-bold text-gray-800 uppercase tracking-wide flex items-center gap-1.5">
            <Award className="w-4 h-4 text-purple-600" />
            Category Marketplace Rank
          </h4>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {analytics.products.map((prod) => (
              <div
                key={prod.id}
                className="p-3 bg-gray-50 border border-gray-100 rounded-lg flex items-center justify-between"
              >
                <div className="min-w-0 pr-2">
                  <p className="text-xs font-semibold text-gray-900 truncate">
                    {prod.name}
                  </p>
                  <p className="text-[11px] text-gray-500 capitalize">
                    {prod.category}
                  </p>
                </div>

                {prod.status === 'approved' && prod.rankInCategory !== null ? (
                  <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-bold bg-purple-100 text-purple-800 shrink-0">
                    #{prod.rankInCategory} of {prod.categoryTotalApproved}
                  </span>
                ) : (
                  <span className="text-[11px] text-gray-400 font-medium shrink-0">
                    Not live
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
