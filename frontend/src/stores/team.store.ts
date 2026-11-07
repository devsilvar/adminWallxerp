import { create } from 'zustand';
import api from '@/lib/axios.ts';
import { useBusinessStore } from '@/stores/business.store.ts';
import { useAuthStore } from '@/stores/auth.store.ts';
import type {
  BusinessMember,
  TeamInvitation,
  TeamCap,
  BusinessRole,
  ValidateInviteResponse,
  AcceptOnboardingPayload,
} from '@/types/index.ts';

interface TeamState {
  members: BusinessMember[];
  pendingInvitations: TeamInvitation[];
  cap: TeamCap | null;
  myInvitations: TeamInvitation[];
  roleDefaults: Record<string, Record<string, boolean>> | null;
  isLoading: boolean;
  error: string | null;

  fetchTeam: (businessId: string) => Promise<void>;
  fetchRoleDefaults: (businessId: string) => Promise<Record<string, Record<string, boolean>>>;
  inviteMember: (
    businessId: string,
    data: { email: string; role: BusinessRole; permissions?: Record<string, boolean>; fullName?: string }
  ) => Promise<void>;
  updateMember: (
    businessId: string,
    memberId: string,
    data: { fullName?: string; role?: BusinessRole; permissions?: Record<string, boolean> }
  ) => Promise<void>;
  removeMember: (businessId: string, memberId: string) => Promise<void>;
  revokeInvitation: (businessId: string, invitationId: string) => Promise<void>;
  resendInvitation: (businessId: string, invitationId: string) => Promise<void>;

  validateInviteToken: (token: string) => Promise<ValidateInviteResponse>;
  acceptOnboarding: (
    payload: AcceptOnboardingPayload
  ) => Promise<{ user: any; accessToken: string; refreshToken: string; business: any }>;

  fetchMyInvitations: () => Promise<void>;
  acceptInvitation: (
    tokenOrPayload: string | { token?: string; invitationId?: string }
  ) => Promise<{ business: { id: string; businessName: string } }>;
  declineInvitation: (
    tokenOrPayload: string | { token?: string; invitationId?: string }
  ) => Promise<void>;

  clear: () => void;
}

const initialState = {
  members: [],
  pendingInvitations: [],
  cap: null,
  myInvitations: [],
  roleDefaults: null,
  isLoading: false,
  error: null,
};

export const useTeamStore = create<TeamState>((set, get) => ({
  ...initialState,

  fetchTeam: async (businessId: string) => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await api.get(`/businesses/${businessId}/team`);
      set({
        members: data.data.members || [],
        pendingInvitations: data.data.pendingInvitations || [],
        cap: data.data.cap || null,
        isLoading: false,
      });
    } catch (err: any) {
      set({
        error: err.response?.data?.error?.message || 'Failed to load team',
        isLoading: false,
      });
      throw err;
    }
  },

  fetchRoleDefaults: async (businessId: string) => {
    try {
      const { data } = await api.get(`/businesses/${businessId}/team/role-defaults`);
      const defaults = data.data;
      set({ roleDefaults: defaults });
      return defaults;
    } catch (err: any) {
      if (import.meta.env.DEV) {
        console.error('[TeamStore] Failed to fetch role defaults', err);
      }
      return get().roleDefaults || {};
    }
  },

  inviteMember: async (businessId, inviteData) => {
    set({ isLoading: true, error: null });
    try {
      await api.post(`/businesses/${businessId}/team/invite`, inviteData);
      await get().fetchTeam(businessId);
      await useBusinessStore.getState().fetchBusinesses(true);
    } catch (err: any) {
      set({ isLoading: false, error: err.response?.data?.error?.message });
      throw err;
    }
  },

  updateMember: async (businessId, memberId, updateData) => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await api.patch(`/businesses/${businessId}/team/members/${memberId}`, updateData);
      const currentUser = useAuthStore.getState().user;
      if (
        currentUser &&
        updateData.fullName &&
        (data?.data?.userId === currentUser.id || data?.data?.user?.id === currentUser.id)
      ) {
        useAuthStore.setState((state) => ({
          user: state.user ? { ...state.user, fullName: updateData.fullName } : null,
        }));
      }
      await get().fetchTeam(businessId);
      await useBusinessStore.getState().fetchBusinesses(true);
    } catch (err: any) {
      set({ isLoading: false, error: err.response?.data?.error?.message });
      throw err;
    }
  },

  removeMember: async (businessId, memberId) => {
    set({ isLoading: true, error: null });
    try {
      await api.delete(`/businesses/${businessId}/team/members/${memberId}`);
      await get().fetchTeam(businessId);
      await useBusinessStore.getState().fetchBusinesses(true);
    } catch (err: any) {
      set({ isLoading: false, error: err.response?.data?.error?.message });
      throw err;
    }
  },

  revokeInvitation: async (businessId, invitationId) => {
    set({ isLoading: true, error: null });
    try {
      await api.post(`/businesses/${businessId}/team/invitations/${invitationId}/revoke`);
      await get().fetchTeam(businessId);
    } catch (err: any) {
      set({ isLoading: false, error: err.response?.data?.error?.message });
      throw err;
    }
  },

  resendInvitation: async (businessId: string, invitationId: string) => {
    set({ isLoading: true, error: null });
    try {
      await api.post(`/businesses/${businessId}/team/invitations/${invitationId}/resend`);
      await get().fetchTeam(businessId);
    } catch (err: any) {
      set({ isLoading: false, error: err.response?.data?.error?.message });
      throw err;
    }
  },

  validateInviteToken: async (token: string) => {
    const { data } = await api.get('/invitations/validate', { params: { token } });
    return data.data;
  },

  acceptOnboarding: async (payload: AcceptOnboardingPayload) => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await api.post('/invitations/accept-onboarding', payload);
      set({ isLoading: false });
      return data.data;
    } catch (err: any) {
      set({ isLoading: false, error: err.response?.data?.error?.message });
      throw err;
    }
  },

  fetchMyInvitations: async () => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await api.get('/invitations');
      set({ myInvitations: data.data || [], isLoading: false });
    } catch (err: any) {
      set({
        error: err.response?.data?.error?.message || 'Failed to load invitations',
        isLoading: false,
      });
    }
  },

  acceptInvitation: async (tokenOrPayload: string | { token?: string; invitationId?: string }) => {
    set({ isLoading: true, error: null });
    try {
      const payload = typeof tokenOrPayload === 'string' ? { token: tokenOrPayload } : tokenOrPayload;
      const { data } = await api.post('/invitations/accept', payload);
      set({ isLoading: false });
      return data.data;
    } catch (err: any) {
      set({ isLoading: false, error: err.response?.data?.error?.message });
      throw err;
    }
  },

  declineInvitation: async (tokenOrPayload: string | { token?: string; invitationId?: string }) => {
    set({ isLoading: true, error: null });
    try {
      const payload = typeof tokenOrPayload === 'string' ? { token: tokenOrPayload } : tokenOrPayload;
      await api.post('/invitations/decline', payload);
      await get().fetchMyInvitations();
    } catch (err: any) {
      set({ isLoading: false, error: err.response?.data?.error?.message });
      throw err;
    }
  },

  clear: () => {
    set({ ...initialState });
  },
}));
