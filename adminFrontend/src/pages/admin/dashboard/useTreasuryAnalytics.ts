import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import api from '@/lib/axios.ts';
import type { TreasuryAnalyticsData } from '@/types/index.ts';

export type TreasuryType = 'all' | 'inflow' | 'outflow';
export type TreasuryOutcome = 'all' | 'profit' | 'loss';

/**
 * Treasury fetch lives here (not in TreasuryTab) because the page header owns
 * the Refresh button.
 *
 * `searchInput` is bound to the box; `search` is what the request uses. The
 * previous version read `treasurySearch` inside the fetch effect while
 * omitting it from the deps — so Apply/Enter dispatched against a stale
 * closure, and typing alone fetched nothing while Apply fetched twice.
 */
export default function useTreasuryAnalytics(enabled: boolean) {
  const [data, setData] = useState<TreasuryAnalyticsData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [type, setType] = useState<TreasuryType>('all');
  const [outcome, setOutcome] = useState<TreasuryOutcome>('all');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');

  const fetchTreasury = useCallback(async () => {
    setIsLoading(true);
    const params = new URLSearchParams({
      page: String(page),
      limit: '20',
      type,
      outcome,
    });
    const q = search.trim();
    if (q) params.set('search', q);

    try {
      const res = await api.get(`/admin/treasury/analytics?${params.toString()}`);
      setData(res.data.data);
    } catch (err: any) {
      toast.error(err.response?.data?.error?.message || 'Failed to fetch treasury data');
    } finally {
      setIsLoading(false);
    }
  }, [page, type, outcome, search]);

  useEffect(() => {
    if (enabled) fetchTreasury();
  }, [enabled, fetchTreasury]);

  function applySearch() {
    setSearch(searchInput.trim());
    setPage(1);
  }

  function clearSearch() {
    setSearchInput('');
    setSearch('');
    setPage(1);
  }

  return {
    data,
    isLoading,
    refresh: fetchTreasury,
    pagination: {
      page,
      setPage,
      type,
      setType: (t: TreasuryType) => {
        setType(t);
        setPage(1);
      },
      outcome,
      setOutcome: (o: TreasuryOutcome) => {
        setOutcome(o);
        setPage(1);
      },
      searchInput,
      setSearchInput,
      applySearch,
      clearSearch,
      hasActiveSearch: searchInput.length > 0,
    },
  };
}

export type TreasuryFilters = ReturnType<typeof useTreasuryAnalytics>['pagination'];