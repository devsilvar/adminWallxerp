import { create } from 'zustand';
import api from '@/lib/axios';
import type {
  UnifiedLedgerRow,
  UnifiedLedgerSummary,
  UnifiedLedgerResponse,
} from '@/types';

interface LedgerState {
  items: UnifiedLedgerRow[];
  summary: UnifiedLedgerSummary;
  scope: 'dva_bank' | 'all_income';
  typeFilter: 'all' | 'credit' | 'debit';
  searchQuery: string;
  fromDate?: string;
  toDate?: string;
  loading: boolean;
  error: string | null;
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };

  // Actions
  fetchLedger: (businessId: string, pageOverride?: number) => Promise<void>;
  setScope: (businessId: string, scope: 'dva_bank' | 'all_income') => void;
  setTypeFilter: (businessId: string, type: 'all' | 'credit' | 'debit') => void;
  setDateRange: (businessId: string, from?: string, to?: string) => void;
  setSearchQuery: (businessId: string, search: string) => void;
  setPage: (businessId: string, page: number) => void;
  clear: () => void;
}

export const useLedgerStore = create<LedgerState>((set, get) => ({
  items: [],
  summary: {
    openingBalance: 0,
    totalCredits: 0,
    totalDebits: 0,
    closingBalance: 0,
  },
  scope: 'dva_bank',
  typeFilter: 'all',
  searchQuery: '',
  fromDate: undefined,
  toDate: undefined,
  loading: false,
  error: null,
  pagination: {
    page: 1,
    limit: 50,
    total: 0,
    totalPages: 1,
    hasNext: false,
    hasPrev: false,
  },

  fetchLedger: async (businessId: string, pageOverride?: number) => {
    if (!businessId) return;
    const { scope, typeFilter, searchQuery, fromDate, toDate, pagination } = get();
    const page = pageOverride !== undefined ? pageOverride : pagination.page;

    set({ loading: true, error: null });

    try {
      const params: Record<string, any> = {
        scope,
        page,
        limit: pagination.limit,
      };

      if (typeFilter !== 'all') params.type = typeFilter;
      if (searchQuery.trim()) params.search = searchQuery.trim();
      if (fromDate) params.from = fromDate;
      if (toDate) params.to = toDate;

      const res = await api.get<UnifiedLedgerResponse>(
        `/businesses/${businessId}/ledger`,
        { params }
      );

      set({
        items: res.data.data,
        summary: res.data.summary,
        pagination: res.data.pagination,
        loading: false,
      });
    } catch (err: any) {
      set({
        error: err.response?.data?.error?.message || 'Failed to fetch financial ledger',
        loading: false,
      });
    }
  },

  setScope: (businessId, scope) => {
    set({ scope, pagination: { ...get().pagination, page: 1 } });
    get().fetchLedger(businessId, 1);
  },

  setTypeFilter: (businessId, typeFilter) => {
    set({ typeFilter, pagination: { ...get().pagination, page: 1 } });
    get().fetchLedger(businessId, 1);
  },

  setDateRange: (businessId, fromDate, toDate) => {
    set({ fromDate, toDate, pagination: { ...get().pagination, page: 1 } });
    get().fetchLedger(businessId, 1);
  },

  setSearchQuery: (businessId, searchQuery) => {
    set({ searchQuery, pagination: { ...get().pagination, page: 1 } });
    get().fetchLedger(businessId, 1);
  },

  setPage: (businessId, page) => {
    set({ pagination: { ...get().pagination, page } });
    get().fetchLedger(businessId, page);
  },

  clear: () =>
    set({
      items: [],
      summary: {
        openingBalance: 0,
        totalCredits: 0,
        totalDebits: 0,
        closingBalance: 0,
      },
      scope: 'dva_bank',
      typeFilter: 'all',
      searchQuery: '',
      fromDate: undefined,
      toDate: undefined,
      loading: false,
      error: null,
      pagination: {
        page: 1,
        limit: 50,
        total: 0,
        totalPages: 1,
        hasNext: false,
        hasPrev: false,
      },
    }),
}));
