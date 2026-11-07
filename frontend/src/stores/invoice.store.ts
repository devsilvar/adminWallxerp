import { create } from 'zustand';
import api, { getErrorMessage } from '@/lib/axios.ts';
import { STALE, isFresh } from '@/lib/cache.ts';
import { useDashboardEvents } from '@/stores/dashboard.store.ts';
import type {
  Invoice,
  InvoiceListQuery,
  Pagination,
  CreateInvoicePayload,
  UpdateInvoicePayload,
  MarkInvoicePaidPayload,
  SendInvoiceWhatsAppResult,
  SendInvoiceEmailResult,
} from '@/types/index.ts';

/**
 * Convert base64 string to Blob
 */
function base64ToBlob(base64: string, mimeType: string): Blob {
  const byteCharacters = atob(base64);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  return new Blob([byteArray], { type: mimeType });
}

/**
 * Invoice store.
 *
 * Deliberately keeps `activeInvoice` separate from the list, because the detail
 * page needs the full `lines[]` + `linkedSale` includes that the list endpoint
 * doesn't return. We cache it by id so navigating List → Detail → List is fast
 * but always refetches on mount so lifecycle transitions (status changes from
 * another tab, background webhooks, etc.) don't show stale data.
 */
interface InvoiceState {
  // List view
  invoices: Invoice[];
  pagination: Pagination | null;
  listLoading: boolean;
  listError: string | null;
  listCacheKey: string | null;
  listFetchedAt: number | null;

  // Detail view
  activeInvoice: Invoice | null;
  detailLoading: boolean;
  detailError: string | null;

  // Actions
  fetchInvoices: (businessId: string, query: InvoiceListQuery, force?: boolean) => Promise<void>;
  fetchInvoice: (businessId: string, id: string) => Promise<Invoice | null>;
  createInvoice: (businessId: string, payload: CreateInvoicePayload) => Promise<Invoice>;
  updateInvoice: (businessId: string, id: string, payload: UpdateInvoicePayload) => Promise<Invoice>;
  deleteInvoice: (businessId: string, id: string) => Promise<void>;
  sendInvoice: (businessId: string, id: string) => Promise<Invoice>;
  sendInvoiceByEmail: (businessId: string, id: string) => Promise<SendInvoiceEmailResult>;
  sendInvoiceByWhatsApp: (businessId: string, id: string) => Promise<SendInvoiceWhatsAppResult>;
  markInvoicePaid: (businessId: string, id: string, payload: MarkInvoicePaidPayload) => Promise<Invoice>;
  reconcileDva: (businessId: string, id: string, saleId: string) => Promise<Invoice>;
  cancelInvoice: (businessId: string, id: string, reason?: string) => Promise<Invoice>;
  downloadInvoicePdf: (businessId: string, id: string, invoiceNumber: string) => Promise<void>;
  clearActive: () => void;
  /**
   * Reset to initial state. Called from auth.store.logout() to prevent the
   * previous user's invoices from bleeding into the next session.
   */
  clear: () => void;
}

function basePath(businessId: string) {
  return `/businesses/${businessId}/invoices`;
}

/** Replace the same invoice in the list cache if present. Avoids a refetch
 *  after a lifecycle action when we already have the new row from the server. */
function patchInList(invoices: Invoice[], updated: Invoice): Invoice[] {
  const idx = invoices.findIndex((i) => i.id === updated.id);
  if (idx === -1) return invoices;
  const next = invoices.slice();
  next[idx] = { ...next[idx], ...updated };
  return next;
}

export const useInvoiceStore = create<InvoiceState>((set, get) => ({
  invoices: [],
  pagination: null,
  listLoading: false,
  listError: null,
  listCacheKey: null,
  listFetchedAt: null,

  activeInvoice: null,
  detailLoading: false,
  detailError: null,

  fetchInvoices: async (businessId, query, force = false) => {
    const cacheKey = `${businessId}|${JSON.stringify(query)}`;
    const state = get();

    // Cache hit — same business + query + within TTL → skip the network.
    // Listing pages still call fetchInvoices on mount; the cache lets paginated
    // back-and-forth feel instant. Mutations pass force=true.
    if (
      !force &&
      state.listCacheKey === cacheKey &&
      isFresh(state.listFetchedAt, STALE.medium) &&
      state.invoices.length > 0
    ) {
      return;
    }

    // Stale-while-revalidate: only show the spinner if we don't have *any*
    // data to render. If the cache key changed (filter/page) we wipe and
    // show loading; if it's the same key we keep showing the old data while
    // the refetch happens in the background.
    const sameKey = state.listCacheKey === cacheKey;
    set({
      listLoading: !sameKey || state.invoices.length === 0,
      listError: null,
    });

    try {
      const params: Record<string, unknown> = {
        page: query.page ?? 1,
        limit: query.limit ?? 15,
      };
      if (query.status) params.status = query.status;
      if (query.search) params.search = query.search;
      if (query.startDate) params.startDate = query.startDate;
      if (query.endDate) params.endDate = query.endDate;

      const { data } = await api.get(basePath(businessId), { params });
      set({
        invoices: data.data,
        pagination: data.pagination ?? null,
        listCacheKey: cacheKey,
        listFetchedAt: Date.now(),
      });
    } catch (err: any) {
      set({ listError: getErrorMessage(err, 'Failed to load invoices') });
    } finally {
      set({ listLoading: false });
    }
  },

  fetchInvoice: async (businessId, id) => {
    set({ detailLoading: true, detailError: null });
    try {
      const { data } = await api.get(`${basePath(businessId)}/${id}`);
      set({ activeInvoice: data.data });
      return data.data as Invoice;
    } catch (err: any) {
      set({
        activeInvoice: null,
        detailError: err?.response?.data?.error?.message || 'Failed to load invoice',
      });
      return null;
    } finally {
      set({ detailLoading: false });
    }
  },

  createInvoice: async (businessId, payload) => {
    const { data } = await api.post(basePath(businessId), payload);
    return data.data as Invoice;
  },

  updateInvoice: async (businessId, id, payload) => {
    const { data } = await api.put(`${basePath(businessId)}/${id}`, payload);
    const updated = data.data as Invoice;
    set((s) => ({
      activeInvoice: s.activeInvoice?.id === id ? updated : s.activeInvoice,
      invoices: patchInList(s.invoices, updated),
    }));
    return updated;
  },

  deleteInvoice: async (businessId, id) => {
    await api.delete(`${basePath(businessId)}/${id}`);
    set((s) => ({
      invoices: s.invoices.filter((i) => i.id !== id),
      activeInvoice: s.activeInvoice?.id === id ? null : s.activeInvoice,
    }));
  },

  sendInvoice: async (businessId, id) => {
    const { data } = await api.post(`${basePath(businessId)}/${id}/send`);
    const updated = data.data as Invoice;
    set((s) => ({
      activeInvoice: s.activeInvoice?.id === id ? updated : s.activeInvoice,
      invoices: patchInList(s.invoices, updated),
    }));
    return updated;
  },

  sendInvoiceByEmail: async (businessId, id) => {
    const { data } = await api.post(`${basePath(businessId)}/${id}/send-email`);
    const updated = data.data as Invoice;
    const delivered = Boolean(data?.meta?.delivered);
    const to = String(data?.meta?.to ?? '');
    set((s) => ({
      activeInvoice: s.activeInvoice?.id === id ? updated : s.activeInvoice,
      invoices: updated ? patchInList(s.invoices, updated) : s.invoices,
    }));
    return { invoice: updated, delivered, to };
  },

  /**
   * Build a wa.me deep link for WhatsApp delivery and get the PDF file.
   * The backend returns JSON with base64-encoded PDF.
   */
  sendInvoiceByWhatsApp: async (businessId, id) => {
    const { data } = await api.post(`${basePath(businessId)}/${id}/send-whatsapp`);
    const updated = data.data as Invoice;
    const waUrl = String(data?.meta?.waUrl ?? '');
    const message = String(data?.meta?.message ?? '');
    const pdfUrl = String(data?.meta?.pdfUrl ?? '');
    const to = String(data?.meta?.to ?? '');
    const filename = String(data?.meta?.filename ?? 'invoice.pdf');
    const pdfBase64 = String(data?.meta?.pdfBase64 ?? '');
    
    // Convert base64 to Blob
    const pdfBlob = pdfBase64 ? base64ToBlob(pdfBase64, 'application/pdf') : null;
    
    set((s) => ({
      activeInvoice: s.activeInvoice?.id === id ? updated : s.activeInvoice,
      invoices: updated ? patchInList(s.invoices, updated) : s.invoices,
    }));
    
    return { invoice: updated, waUrl, message, pdfUrl, to, pdfBlob, filename };
  },

  markInvoicePaid: async (businessId, id, payload) => {
    const { data } = await api.post(`${basePath(businessId)}/${id}/mark-paid`, payload);
    const updated = data.data as Invoice;
    set((s) => ({
      activeInvoice: s.activeInvoice?.id === id ? updated : s.activeInvoice,
      invoices: patchInList(s.invoices, updated),
    }));
    // Marking invoice paid creates a SalesTransaction, so invalidate dashboard
    useDashboardEvents.getState().invalidateDashboard('invoice_paid');
    return updated;
  },

  reconcileDva: async (businessId, id, saleId) => {
    const { data } = await api.post(`${basePath(businessId)}/${id}/reconcile-dva/${saleId}`);
    const updated = data.data as Invoice;
    set((s) => ({
      activeInvoice: s.activeInvoice?.id === id ? updated : s.activeInvoice,
      invoices: patchInList(s.invoices, updated),
    }));
    useDashboardEvents.getState().invalidateDashboard('invoice_dva_reconciled');
    return updated;
  },

  cancelInvoice: async (businessId, id, reason) => {
    const { data } = await api.post(`${basePath(businessId)}/${id}/cancel`, { reason });
    const updated = data.data as Invoice;
    set((s) => ({
      activeInvoice: s.activeInvoice?.id === id ? updated : s.activeInvoice,
      invoices: patchInList(s.invoices, updated),
    }));
    return updated;
  },

  /**
   * PDF download. We request `responseType: 'blob'` so axios doesn't try to
   * parse the binary response as JSON, then trigger a browser download via
   * an object URL. The object URL is revoked shortly after — leaving it live
   * holds the Blob in memory for the tab lifetime.
   */
  downloadInvoicePdf: async (businessId, id, invoiceNumber) => {
    const response = await api.get(`${basePath(businessId)}/${id}/pdf`, {
      responseType: 'blob',
    });
    const blob = new Blob([response.data], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${invoiceNumber}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Give the browser a tick to kick off the download before revoking.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },

  clearActive: () => set({ activeInvoice: null, detailError: null }),

  clear: () =>
    set({
      invoices: [],
      pagination: null,
      listLoading: false,
      listError: null,
      listCacheKey: null,
      listFetchedAt: null,
      activeInvoice: null,
      detailLoading: false,
      detailError: null,
    }),
}));

// Re-export for convenience (so pages that only need the hook don't also import from types)
export type { Invoice } from '@/types/index.ts';
