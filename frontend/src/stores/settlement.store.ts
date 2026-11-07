import { create } from 'zustand';
import api from '@/lib/axios';
import toast from 'react-hot-toast';
import type { PaystackFeeSchedule } from '@/lib/fees';
import type { DvaTransactionRow, RegulatoryMeta, SettlementInflow } from '@/types';

function getErrorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'response' in err) {
    const res = (err as any).response;
    if (res?.data?.error?.message) return res.data.error.message;
    if (res?.data?.message) return res.data.message;
  }
  if (err instanceof Error) return err.message;
  return fallback;
}

export interface SettlementAccountInfo {
  isConnected: boolean;
  bankName: string | null;
  bankCode: string | null;
  accountNumber: string | null;
  accountName: string | null;
  connectedAt: string | null;
}

export interface AutoSplitInfo {
  enabled: boolean;
  taxSplitPercentage: number;
  subaccountCode: string | null;
}

export interface SecurityInfo {
  hasPin: boolean;
  isPinLocked: boolean;
  remainingAttempts: number;
}

export interface PayoutPreviewData {
  businessId: string;
  businessName: string;
  walletBalance?: number;
  totalInflows: number;
  businessInflows?: number;
  pooledInflows?: number;
  pendingSettlement?: number;
  pooledPendingSettlement?: number;
  totalSplitSettled?: number;
  totalWithdrawn: number;
  businessWithdrawn?: number;
  pooledTotalWithdrawn?: number;
  pendingWithdrawn?: number;
  pooledPendingWithdrawn?: number;
  completedWithdrawn?: number;
  pooledCompletedWithdrawn?: number;
  taxReserve: number;
  availableForWithdrawal: number;
  businessBalance?: number;
  isPooled?: boolean;
  dailyPayoutLimit?: number;
  dailyPaidOut?: number;
  dailyRemaining?: number | null;
  /**
   * What Paystack has already deducted from these inflows (1% per DVA
   * transfer, capped at ₦300). Already subtracted from
   * availableForWithdrawal — shown in the UI as "where the money went".
   */
  estimatedProcessingFees?: number;
  /**
   * Published Paystack fee schedule straight from the backend, so the UI can
   * preview withdrawal fees without hardcoding a naira figure.
   */
  fees?: PaystackFeeSchedule;
  settlementAccount: SettlementAccountInfo;
  autoSplit: AutoSplitInfo;
  autoPayoutEnabled?: boolean;
  security: SecurityInfo;
}

export interface AdvancePreviewData {
  businessId?: string;
  businessName?: string;
  isPooled?: boolean;
  pendingSettlement?: number;
  pooledPendingSettlement: number;
  maxAdvance: number;
  maxAdvancePct?: number;
  minAdvanceAmount?: number;
  remainingPending: number;
  /** Gross advance already credited to the wallet and not yet recovered. */
  outstandingAdvance?: number;
  hasOutstandingAdvance: boolean;
  batchStartDate: string | null;
  fees: {
    advance: {
      pct: number;
      cap: number;
      maxPct: number;
      minAmount: number;
    };
  };
  settlementAccount: {
    isConnected: boolean;
    bankName: string | null;
    bankCode: string | null;
    accountNumber: string | null;
    accountName: string | null;
  };
  security: {
    hasPin: boolean;
    isPinLocked: boolean;
    remainingAttempts: number;
  };
  dailyPayout?: {
    dailyLimit: number;
    dailyUsed: number;
    dailyRemaining: number;
  };
}

export interface SettlementPayoutItem {
  id: string;
  isAdvance?: boolean;
  amount: number;
  fee: number;
  netAmount: number;
  destinationBankName: string;
  destinationAccountNum: string;
  destinationAccountName: string;
  transferReference: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  initiatedAt: string;
  completedAt: string | null;
  narration: string | null;
  failureReason: string | null;
}

interface SettlementStore {
  preview: PayoutPreviewData | null;
  regulatory: RegulatoryMeta | null;
  history: SettlementPayoutItem[];
  loadingPreview: boolean;
  loadingHistory: boolean;
  /** DVA inflows with their settlement instant — the settlement timeline. */
  inflows: SettlementInflow[];
  loadingInflows: boolean;
  inflowPagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  withdrawing: boolean;
  updatingAutoPayout: boolean;
  advancePreview: AdvancePreviewData | null;
  loadingAdvancePreview: boolean;
  requestingAdvance: boolean;
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };

  fetchPreview: (businessId: string) => Promise<void>;
  fetchHistory: (businessId: string, page?: number, status?: string, search?: string, isAdvance?: boolean) => Promise<void>;
  fetchAdvancePreview: (businessId: string) => Promise<AdvancePreviewData | null>;
  requestAdvance: (
    businessId: string,
    input: { amount: number; pin?: string; stepUpToken?: string; narration?: string; acceptCharge: boolean }
  ) => Promise<SettlementPayoutItem | null>;
  fetchInflows: (businessId: string, page?: number) => Promise<void>;
  withdrawBalance: (
    businessId: string,
    input: { amount: number; pin?: string; stepUpToken?: string; narration?: string }
  ) => Promise<SettlementPayoutItem | null>;
  toggleAutoPayout: (
    businessId: string,
    input: { enabled: boolean; pin?: string; stepUpToken?: string }
  ) => Promise<boolean>;
  resolveAccount: (
    input: { bankCode: string; accountNumber: string },
    businessId?: string
  ) => Promise<{ accountName: string; accountNumber: string; bankCode: string } | null>;
  clear: () => void;
}

let fetchPreviewSeq = 0;
let fetchHistorySeq = 0;
let fetchInflowsSeq = 0;

export const useSettlementStore = create<SettlementStore>((set, get) => ({
  preview: null,
  regulatory: null,
  history: [],
  loadingPreview: false,
  loadingHistory: false,
  inflows: [],
  loadingInflows: false,
  inflowPagination: {
    page: 1,
    limit: 25,
    total: 0,
    totalPages: 1,
  },
  withdrawing: false,
  updatingAutoPayout: false,
  advancePreview: null,
  loadingAdvancePreview: false,
  requestingAdvance: false,
  pagination: {
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 1,
  },

  fetchPreview: async (businessId: string) => {
    const seq = ++fetchPreviewSeq;
    set({ loadingPreview: true });
    try {
      const res = await api.get(`/businesses/${businessId}/settlement/preview`);
      if (seq !== fetchPreviewSeq) return; // a newer fetchPreview call superseded this one
      set({
        preview: res.data.data,
        regulatory: res.data.meta?.regulatory ?? null,
      });
    } catch (err) {
      if (seq !== fetchPreviewSeq) return;
      toast.error(getErrorMessage(err, 'Failed to fetch settlement details'));
    } finally {
      // loadingPreview must always drop to false for the CURRENT request,
      // even if this call was superseded — otherwise a stale in-flight
      // request that finishes after being superseded could leave loading
      // stuck true forever. Only skip if a newer call already flipped it.
      if (seq === fetchPreviewSeq) set({ loadingPreview: false });
    }
  },

  fetchHistory: async (businessId: string, page = 1, status?: string, search?: string, isAdvance?: boolean) => {
    const seq = ++fetchHistorySeq;
    set({ loadingHistory: true });
    try {
      const res = await api.get(`/businesses/${businessId}/settlement/history`, {
        params: {
          page,
          limit: 10,
          ...(status && status !== 'all' ? { status } : {}),
          ...(search && search.trim() ? { search: search.trim() } : {}),
          ...(isAdvance !== undefined ? { isAdvance } : {}),
        },
      });
      if (seq !== fetchHistorySeq) return; // a newer fetchHistory call superseded this one
      set({
        history: res.data.data,
        pagination: res.data.pagination || { page, limit: 10, total: res.data.data.length, totalPages: 1 },
      });
    } catch (err) {
      if (seq !== fetchHistorySeq) return;
      toast.error(getErrorMessage(err, 'Failed to fetch payout history'));
    } finally {
      if (seq === fetchHistorySeq) set({ loadingHistory: false });
    }
  },

  fetchInflows: async (businessId, page = 1) => {
    const seq = ++fetchInflowsSeq;
    set({ loadingInflows: true });
    try {
      const res = await api.get(`/businesses/${businessId}/dva/transactions`, {
        params: { page, limit: 25 },
      });
      if (seq !== fetchInflowsSeq) return; // a newer fetchInflows call superseded this one
      const rows: SettlementInflow[] = (res.data.data || []).map((t: DvaTransactionRow) => ({
        id: t.id,
        amount: Number(t.amount),
        status: t.status,
        referenceId: t.referenceId ?? null,
        customerName: t.customerName ?? null,
        customerHint: t.customerHint ?? null,
        transactionDate: t.transactionDate,
        createdAt: t.createdAt,
        settledAt: t.settledAt ?? null,
        needsVerification: Boolean(t.needsVerification),
        released: Boolean(t.released),
        releasedAt: t.releasedAt ?? null,
      }));
      set({
        inflows: rows,
        inflowPagination: res.data.pagination || {
          page,
          limit: 25,
          total: rows.length,
          totalPages: 1,
        },
      });
    } catch (err) {
      if (seq !== fetchInflowsSeq) return;
      toast.error(getErrorMessage(err, 'Failed to load settlement inflows'));
    } finally {
      // Same rule as fetchPreview: only the current request may clear the flag.
      if (seq === fetchInflowsSeq) set({ loadingInflows: false });
    }
  },

  withdrawBalance: async (businessId, input) => {
    set({ withdrawing: true });
    const toastId = toast.loading('Submitting withdrawal request…');
    try {
      const res = await api.post(`/businesses/${businessId}/settlement/withdraw`, input);
      
      // Handle pending status (awaiting funding) vs processing/completed
      if (res.data.data.status === 'pending') {
        toast.success("Queued — we'll transfer as soon as our gateway is funded.", { id: toastId });
      } else {
        // Use the message from the executor (accurate per-outcome text)
        const message = res.data.message || 'Withdrawal initiated successfully';
        toast.success(message, { id: toastId });
      }
      
      // Refresh preview and history
      get().fetchPreview(businessId);
      get().fetchHistory(businessId, 1);
      return res.data.data;
    } catch (err: any) {
      const errorCode = err?.response?.data?.error?.code;
      const errorMessage = err?.response?.data?.error?.message;
      
      // Handle specific error codes
      if (errorCode === 'DUPLICATE_WITHDRAWAL_REQUEST') {
        toast.error("You already have a withdrawal request for this amount that's in flight. Check its status or wait for it to be processed.", { id: toastId });
      } else if (errorCode === 'WITHDRAWAL_IN_PROGRESS') {
        toast.error('A withdrawal request is already being processed. Please wait a few seconds and try again.', { id: toastId });
      } else if (errorCode === 'INSUFFICIENT_FUNDS') {
        toast.error(errorMessage || 'Insufficient funds available for withdrawal', { id: toastId, duration: 6000 });
      } else {
        toast.error(errorMessage || getErrorMessage(err, 'Withdrawal failed'), { id: toastId });
      }
      
      // Refresh preview to update PIN attempts count
      get().fetchPreview(businessId);
      return null;
    } finally {
      set({ withdrawing: false });
    }
  },

  // Note: businessId is a route parameter segment; the setting is persisted at user-account scope
  toggleAutoPayout: async (businessId, input) => {
    set({ updatingAutoPayout: true });
    const toastId = toast.loading(
      input.enabled ? 'Enabling instant payouts…' : 'Switching to manual payouts…'
    );
    try {
      const res = await api.patch(`/businesses/${businessId}/settlement/auto-payout`, input);
      toast.success(res.data.message || 'Payout mode updated successfully', { id: toastId });
      get().fetchPreview(businessId);
      return true;
    } catch (err: any) {
      const code = err?.response?.data?.error?.code;
      const errorMessage = err?.response?.data?.error?.message;
      if (code === 'SETTLEMENT_ACCOUNT_REQUIRED') {
        toast.error('Connect your settlement bank account first before enabling instant payouts', { id: toastId });
      } else {
        toast.error(errorMessage || getErrorMessage(err, 'Failed to update payout mode'), { id: toastId });
      }
      get().fetchPreview(businessId);
      return false;
    } finally {
      set({ updatingAutoPayout: false });
    }
  },

  fetchAdvancePreview: async (businessId: string) => {
    set({ loadingAdvancePreview: true });
    try {
      const res = await api.get(`/businesses/${businessId}/settlement/advance/preview`);
      set({ advancePreview: res.data.data });
      return res.data.data;
    } catch (err: any) {
      toast.error(getErrorMessage(err, 'Failed to fetch advance preview'));
      return null;
    } finally {
      set({ loadingAdvancePreview: false });
    }
  },

  requestAdvance: async (businessId: string, input) => {
    set({ requestingAdvance: true });
    const toastId = toast.loading('Submitting settlement advance request...');
    try {
      const res = await api.post(`/businesses/${businessId}/settlement/advance`, input);
      toast.success(res.data.message || 'Settlement advance credited to your wallet', { id: toastId });
      void get().fetchAdvancePreview(businessId);
      void get().fetchHistory(businessId);
      return res.data.data;
    } catch (err: any) {
      const msg = getErrorMessage(err, 'Failed to process settlement advance');
      toast.error(msg, { id: toastId });
      throw err;
    } finally {
      set({ requestingAdvance: false });
    }
  },

  resolveAccount: async (input, businessId?: string) => {
    try {
      const bid = businessId || (JSON.parse(localStorage.getItem('activeBusinessId') || 'null') as string | null);
      if (!bid) {
        toast.error('Select a business first');
        return null;
      }
      const res = await api.post(`/businesses/${bid}/settlement/resolve`, input);
      return res.data.data;
    } catch (err) {
      toast.error(getErrorMessage(err, 'Account name resolution failed'));
      return null;
    }
  },

  clear: () =>
    set({
      preview: null,
      regulatory: null,
      history: [],
      loadingPreview: false,
      loadingHistory: false,
      inflows: [],
      loadingInflows: false,
      inflowPagination: {
        page: 1,
        limit: 25,
        total: 0,
        totalPages: 1,
      },
      withdrawing: false,
      updatingAutoPayout: false,
      pagination: {
        page: 1,
        limit: 10,
        total: 0,
        totalPages: 1,
      },
    }),
}));
