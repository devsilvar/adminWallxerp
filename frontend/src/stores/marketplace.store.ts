import { create } from 'zustand';
import api, { getErrorMessage } from '@/lib/axios.ts';
import { useBusinessStore } from '@/stores/business.store.ts';
import type {
  MarketplaceProduct,
  CreateProductPayload,
  UpdateProductPayload,
  SlotPurchaseResponse,
  MarketplaceSlotPurchase,
  MarketplaceAnalyticsResponse,
} from '@/types/index.ts';

interface MarketplaceState {
  products: MarketplaceProduct[];
  loading: boolean;
  error: string | null;

  activeProduct: MarketplaceProduct | null;
  detailLoading: boolean;
  detailError: string | null;
  submitting: boolean;
  analytics: MarketplaceAnalyticsResponse | null;
  analyticsLoading: boolean;
  analyticsError: string | null;

  // Actions
  fetchAnalytics: (businessId: string, days?: number) => Promise<MarketplaceAnalyticsResponse | null>;
  fetchProducts: (businessId: string) => Promise<void>;
  fetchProduct: (businessId: string, id: string) => Promise<MarketplaceProduct | null>;
  createProduct: (businessId: string, payload: CreateProductPayload) => Promise<MarketplaceProduct>;
  updateProduct: (businessId: string, id: string, payload: UpdateProductPayload) => Promise<MarketplaceProduct>;
  submitForApproval: (businessId: string, id: string) => Promise<MarketplaceProduct>;
  archiveProduct: (businessId: string, id: string) => Promise<MarketplaceProduct>;
  markAsSold: (businessId: string, id: string) => Promise<MarketplaceProduct>;
  renewProduct: (businessId: string, id: string) => Promise<MarketplaceProduct>;
  purchaseSlotsViaWallet: (businessId: string, slots?: number) => Promise<SlotPurchaseResponse>;
  submitSlotProof: (businessId: string, slots: number, proof: File) => Promise<{ purchase: MarketplaceSlotPurchase; status: string }>;
  getWalletBalance: () => Promise<number>;
  uploadImage: (businessId: string, file: File) => Promise<{ url: string; publicId: string }>;
  deleteImage: (businessId: string, publicId: string) => Promise<void>;
  setActiveProduct: (product: MarketplaceProduct | null) => void;
  clearActive: () => void;
  clear: () => void;
}

function basePath(businessId: string) {
  return `/businesses/${businessId}/marketplace`;
}

function patchInList(products: MarketplaceProduct[], updated: MarketplaceProduct): MarketplaceProduct[] {
  const idx = products.findIndex((p) => p.id === updated.id);
  if (idx === -1) return [updated, ...products];
  const next = products.slice();
  next[idx] = { ...next[idx], ...updated };
  return next;
}

export const useMarketplaceStore = create<MarketplaceState>((set) => ({
  products: [],
  loading: false,
  error: null,

  activeProduct: null,
  detailLoading: false,
  detailError: null,
  submitting: false,
  analytics: null,
  analyticsLoading: false,
  analyticsError: null,

  fetchAnalytics: async (businessId: string, days = 30) => {
    set({ analyticsLoading: true, analyticsError: null });
    try {
      const { data } = await api.get(`${basePath(businessId)}/analytics`, {
        params: { days },
      });
      const res = data.data || null;
      set({ analytics: res });
      return res;
    } catch (err: any) {
      set({ analyticsError: getErrorMessage(err, "Failed to load marketplace analytics") });
      return null;
    } finally {
      set({ analyticsLoading: false });
    }
  },

  fetchProducts: async (businessId: string) => {
    set({ loading: true, error: null });
    try {
      const { data } = await api.get(basePath(businessId));
      set({ products: data.data || [] });
    } catch (err: any) {
      set({ error: getErrorMessage(err, 'Failed to load products') });
    } finally {
      set({ loading: false });
    }
  },

  fetchProduct: async (businessId: string, id: string) => {
    set({ detailLoading: true, detailError: null });
    try {
      const { data } = await api.get(`${basePath(businessId)}/${id}`);
      set({ activeProduct: data.data });
      return data.data;
    } catch (err: any) {
      set({ detailError: getErrorMessage(err, 'Failed to load product detail') });
      return null;
    } finally {
      set({ detailLoading: false });
    }
  },

  createProduct: async (businessId: string, payload: CreateProductPayload) => {
    set({ submitting: true, error: null });
    try {
      const { data } = await api.post(basePath(businessId), payload);
      const created = data.data;
      set((state) => ({
        products: [created, ...state.products],
      }));
      return created;
    } catch (err: any) {
      const message = getErrorMessage(err, 'Failed to create product');
      set({ error: message });
      throw new Error(message);
    } finally {
      set({ submitting: false });
    }
  },

  updateProduct: async (businessId: string, id: string, payload: UpdateProductPayload) => {
    set({ submitting: true, error: null });
    try {
      const { data } = await api.patch(`${basePath(businessId)}/${id}`, payload);
      const updated = data.data;
      set((state) => ({
        products: patchInList(state.products, updated),
        activeProduct: state.activeProduct?.id === id ? updated : state.activeProduct,
      }));
      return updated;
    } catch (err: any) {
      const message = getErrorMessage(err, 'Failed to update product');
      set({ error: message });
      throw new Error(message);
    } finally {
      set({ submitting: false });
    }
  },

  submitForApproval: async (businessId: string, id: string) => {
    set({ submitting: true, error: null });
    try {
      const { data } = await api.post(`${basePath(businessId)}/${id}/submit`);
      const updated = data.data;
      set((state) => ({
        products: patchInList(state.products, updated),
        activeProduct: state.activeProduct?.id === id ? updated : state.activeProduct,
      }));
      return updated;
    } catch (err: any) {
      const message = getErrorMessage(err, 'Failed to submit product for approval');
      set({ error: message });
      throw new Error(message);
    } finally {
      set({ submitting: false });
    }
  },

  archiveProduct: async (businessId: string, id: string) => {
    set({ submitting: true, error: null });
    try {
      const { data } = await api.post(`${basePath(businessId)}/${id}/archive`);
      const updated = data.data;
      set((state) => ({
        products: patchInList(state.products, updated),
        activeProduct: state.activeProduct?.id === id ? updated : state.activeProduct,
      }));
      return updated;
    } catch (err: any) {
      const message = getErrorMessage(err, 'Failed to archive product');
      set({ error: message });
      throw new Error(message);
    } finally {
      set({ submitting: false });
    }
  },

  markAsSold: async (businessId: string, id: string) => {
    set({ submitting: true, error: null });
    try {
      const { data } = await api.post(`${basePath(businessId)}/${id}/mark-sold`);
      const updated = data.data;
      set((state) => ({
        products: patchInList(state.products, updated),
        activeProduct: state.activeProduct?.id === id ? updated : state.activeProduct,
      }));
      return updated;
    } catch (err: unknown) {
      const message = getErrorMessage(err, 'Failed to mark product as sold');
      set({ error: message });
      throw new Error(message);
    } finally {
      set({ submitting: false });
    }
  },

  renewProduct: async (businessId: string, id: string) => {
    set({ submitting: true, error: null });
    try {
      const { data } = await api.post(`${basePath(businessId)}/${id}/renew`);
      const updated = data.data;
      set((state) => ({
        products: patchInList(state.products, updated),
        activeProduct: state.activeProduct?.id === id ? updated : state.activeProduct,
      }));
      return updated;
    } catch (err: unknown) {
      const message = getErrorMessage(err, 'Failed to renew product listing');
      set({ error: message });
      throw new Error(message);
    } finally {
      set({ submitting: false });
    }
  },

  purchaseSlotsViaWallet: async (businessId: string, slots = 1) => {
    set({ submitting: true, error: null });
    try {
      const { data } = await api.post(`${basePath(businessId)}/slots`, { slots });
      const responseData: SlotPurchaseResponse = data.data;
      if (responseData?.allowance?.current) {
        useBusinessStore.getState().updateSlotAllowance(businessId, responseData.allowance.current);
      }
      return responseData;
    } catch (err: unknown) {
      const message = getErrorMessage(err, 'Failed to purchase marketplace slot');
      set({ error: message });
      throw new Error(message);
    } finally {
      set({ submitting: false });
    }
  },

  submitSlotProof: async (businessId: string, slots: number, proof: File) => {
    set({ submitting: true, error: null });
    const formData = new FormData();
    formData.append('slots', String(slots));
    formData.append('proof', proof);
    try {
      const { data } = await api.post(`${basePath(businessId)}/slots/proof`, formData);
      return data.data;
    } catch (err: unknown) {
      const message = getErrorMessage(err, 'Failed to submit payment proof');
      set({ error: message });
      throw new Error(message);
    } finally {
      set({ submitting: false });
    }
  },

  getWalletBalance: async () => {
    try {
      const { data } = await api.get('/wallet');
      return Number(data.data?.availableBalance ?? data.data?.balance ?? 0);
    } catch {
      return 0;
    }
  },

  uploadImage: async (businessId: string, file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    try {
      const { data } = await api.post(`${basePath(businessId)}/images`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      return data.data;
    } catch (err: any) {
      const message = getErrorMessage(err, 'Failed to upload image');
      throw new Error(message);
    }
  },

  deleteImage: async (businessId: string, publicId: string) => {
    try {
      await api.delete(`${basePath(businessId)}/images`, {
        data: { publicId },
      });
    } catch {
      // Best-effort cleanup
    }
  },

  setActiveProduct: (product) => set({ activeProduct: product }),
  clearActive: () => set({ activeProduct: null, detailError: null }),
  clear: () =>
    set({
      products: [],
      loading: false,
      error: null,
      activeProduct: null,
      detailLoading: false,
      detailError: null,
      submitting: false,
    }),
}));
