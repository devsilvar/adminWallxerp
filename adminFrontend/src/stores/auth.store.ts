import { create } from 'zustand';
import api from '@/lib/axios.ts';
import { useAdminStatsStore } from '@/stores/admin.stats.store.ts';
import type { User } from '@/types/index.ts';

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;

  login: (email: string, password: string) => Promise<void>;
  register: (
    email: string,
    phone: string,
    password: string,
    requestedPlan?: string
  ) => Promise<{ email: string; verificationLink?: string }>;
  setAuthSession: (user: User, accessToken: string, refreshToken: string) => void;
  logout: () => void;
  fetchMe: () => Promise<void>;
  setLoading: (loading: boolean) => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isAuthenticated: !!localStorage.getItem('accessToken'),
  isLoading: false,

  login: async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password });
    localStorage.setItem('accessToken', data.data.accessToken);
    localStorage.setItem('refreshToken', data.data.refreshToken);
    set({ isAuthenticated: true });
  },

  register: async (email, phone, password, requestedPlan) => {
    const { data } = await api.post('/auth/register', {
      email,
      phone,
      password,
      ...(requestedPlan ? { requestedPlan } : {}),
    });
    return {
      email: data.data?.user?.email || email,
      verificationLink: data.data?.verificationLink,
    };
  },

  setAuthSession: (user, accessToken, refreshToken) => {
    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('refreshToken', refreshToken);
    set({ user, isAuthenticated: true });
  },


  // Logout must wipe every cache that holds the previous user's data.
  // Zustand stores are module singletons — clearing localStorage alone
  // doesn't touch them, so each domain store exposes a clear() that
  // resets it to its initial state. Without this, the next user logging
  // in on the same tab sees the previous user's businesses/invoices/
  // reminders flash in the sidebar before the refetch completes.
  logout: () => {
    // ─── Clear Axios Default Auth Header (prevent zombie token) ──
    // api.defaults.headers holds the last refreshed token in-memory.
    // Clearing localStorage alone leaves it there, so the next
    // request still sends `Authorization: Bearer <old>` and can
    // trigger a refresh that resurrects the session.
    try {
      delete (api.defaults.headers.common as Record<string, unknown>).Authorization;
      delete (api.defaults.headers as Record<string, unknown>).Authorization;
    } catch {
      // no-op — defensive for test env where api may be mocked
    }

    // ─── Clear Authentication Tokens ───────────────────────────────
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');

    // ─── Clear Business & User Context ────────────────────────────
    localStorage.removeItem('activeBusinessId');
    localStorage.removeItem('signupPlan');

    // ─── Clear Trial & Subscription Data ──────────────────────────
    localStorage.removeItem('wallx_trial_started_at');
    localStorage.removeItem('hasSeenTrialWelcome');

    // ─── Clear AI Chat History (Per-Business) ────────────────────
    // AI chats are stored with business-specific keys like:
    // - ai_chats_v2_{businessId}
    // - ai_active_chat_{businessId}
    // - ai_chat_{businessId} (legacy)
    // We'll iterate through all localStorage keys to remove them
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (
        key.startsWith('ai_chats_v2_') ||
        key.startsWith('ai_active_chat_') ||
        key.startsWith('ai_chat_')
      )) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(key => localStorage.removeItem(key));

    // ─── Clear Review Prompt State ────────────────────────────────
    localStorage.removeItem('wallx_review_prompt_dismissed');
    localStorage.removeItem('wallx_review_prompt_snoozed_until');
    localStorage.removeItem('wallx_review_submitted');
    localStorage.removeItem('wallx_test_review');

    // ─── Clear SessionStorage Items ───────────────────────────────
    sessionStorage.removeItem('pendingVerificationEmail');
    sessionStorage.removeItem('businessCreatedAt');
    sessionStorage.removeItem('businessCreatedName');
    sessionStorage.removeItem('justCreatedFirstBiz');

    // ─── Clear Zustand Store State ────────────────────────────────
    // adminFrontend owns this cache — clear it so the next login doesn't flash stale SLA badges
    useAdminStatsStore.getState().clear();

    // ─── Reset Auth State ──────────────────────────────────────────
    set({ user: null, isAuthenticated: false });
  },

  fetchMe: async () => {
    const tokenAtStart = localStorage.getItem('accessToken');
    if (!tokenAtStart) return;
    try {
      const { data } = await api.get('/auth/me');
      // Guard: don't resurrect a session that was explicitly logged out
      // while this request was in-flight (the classic "have to click
      // logout 3 times" race). Token cleared/rotated mid-flight means
      // the caller already invalidated the session — ignore the stale
      // 200 and let the logout stand.
      const currentToken = localStorage.getItem('accessToken');
      if (currentToken !== tokenAtStart || !currentToken) return;
      if (!get().isAuthenticated && !currentToken) return;
      set({ user: data.data, isAuthenticated: true });
    } catch {
      // Only run the full wipe if this fetchMe was still the active
      // session. If an explicit logout already cleared the token,
      // the 401 is expected — don't double-fire logout/redirect.
      if (localStorage.getItem('accessToken') === tokenAtStart) {
        get().logout();
      }
    }
  },

  setLoading: (isLoading) => set({ isLoading }),
}));
