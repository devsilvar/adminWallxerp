import { getAccessToken, setTokens, clearTokens } from '@/lib/session.ts';
import { create } from 'zustand';
import api from '@/lib/axios.ts';
import { useAdminStatsStore } from '@/stores/admin.stats.store.ts';
import type { User } from '@/types/index.ts';

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  hasCheckedAuth: boolean;

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

// Bumped by login(), setAuthSession() and logout(). fetchMe compares this
// before and after its request so it can tell "the session was destroyed
// while I was in flight" apart from "the interceptor rotated my token".
let sessionEpoch = 0;
let fetchMeInProgress: Promise<void> | null = null;

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isAuthenticated: !!getAccessToken(),
  isLoading: false,
  hasCheckedAuth: false,

  login: async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password });
    setTokens(data.data.accessToken, data.data.refreshToken);
    sessionEpoch += 1;
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
    setTokens(accessToken, refreshToken);
    sessionEpoch += 1;
    set({ user, isAuthenticated: true, hasCheckedAuth: true });
  },


  // Logout must wipe every cache that holds the previous user's data.
  // Zustand stores are module singletons — clearing localStorage alone
  // doesn't touch them, so each domain store exposes a clear() that
  // resets it to its initial state. Without this, the next user logging
  // in on the same tab sees the previous user's businesses/invoices/
  // reminders flash in the sidebar before the refetch completes.
  logout: () => {
    sessionEpoch += 1;

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
    clearTokens();

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
    set({ user: null, isAuthenticated: false, hasCheckedAuth: true });
  },

  fetchMe: async () => {
    if (fetchMeInProgress) return fetchMeInProgress;

    const tokenAtStart = getAccessToken();
    if (!tokenAtStart) {
      set({ hasCheckedAuth: true });
      return;
    }

    const epochAtStart = sessionEpoch;

    fetchMeInProgress = (async () => {
      try {
        const { data } = await api.get('/auth/me');
        // The session was destroyed while this request was in flight.
        if (sessionEpoch !== epochAtStart) return;
        set({ user: data.data, isAuthenticated: true });
      } catch (err) {
        // Only a 401 means the token is genuinely bad. A cold start, a 502 or
        // a dropped packet must NOT sign the admin out.
        const status = (err as { response?: { status?: number } })?.response?.status;
        if (status === 401 && sessionEpoch === epochAtStart) {
          get().logout();
        }
      } finally {
        set({ hasCheckedAuth: true });
        fetchMeInProgress = null;
      }
    })().catch((e) => {
      fetchMeInProgress = null;
      throw e;
    });

    return fetchMeInProgress;
  },

  setLoading: (isLoading) => set({ isLoading }),
}));
