import axios from 'axios';
import axiosRetry, { isNetworkError, exponentialDelay } from 'axios-retry';
import { touchActivity } from '@/lib/session.ts';

export interface ApiError {
  response?: {
    data?: {
      error?: {
        message?: string;
        code?: string;
        details?: unknown;
      };
    };
    status?: number;
  };
  message?: string;
  name?: string;
}

/**
 * Maps server error codes that should never be shown to end users
 * to friendly, actionable messages.
 */
const FRIENDLY_MESSAGES: Record<string, string> = {
  DATABASE_ERROR:
    "We're having trouble reaching our servers. Please check your internet connection and try again.",
  SERVICE_UNAVAILABLE:
    "Our service is temporarily unavailable. Please check your internet connection and try again shortly.",
  INTERNAL_ERROR:
    "Something went wrong on our end. Please try again in a moment.",
  INTERNAL_SERVER_ERROR:
    "Something went wrong on our end. Please try again in a moment.",
  TRIAL_EXPIRED:
    "Your 30-day free trial has ended. Existing records and money withdrawals are safe, but creating new records requires an active plan.",
  TRIAL_IN_GRACE_PERIOD:
    "Your free trial is in a 2-day grace period. Existing records and money withdrawals are safe, but creating new records requires an active plan.",
  SUBSCRIPTION_EXPIRED:
    "Your subscription has expired. Existing records and money withdrawals are safe, but creating new records requires renewing your plan.",
  SUBSCRIPTION_IN_GRACE_PERIOD:
    "Your subscription is in a grace period. Existing records and money withdrawals are safe, but creating new records requires renewing your plan.",
};

/** Patterns in raw error messages that indicate connectivity issues. */
const NETWORK_PATTERNS = [
  "can't reach database",
  'database server',
  'econnrefused',
  'econnreset',
  'enotfound',
  'etimedout',
  'network error',
  'fetch failed',
  'failed to fetch',
  'socket hang up',
  'err_network',
];

function isNetworkishMessage(msg: string): boolean {
  const lower = msg.toLowerCase();
  return NETWORK_PATTERNS.some((p) => lower.includes(p));
}

export function getErrorMessage(error: unknown, fallback?: string): string {
  if (axios.isAxiosError<{ error?: { message?: string; code?: string } }>(error)) {
    const code = error.response?.data?.error?.code;
    const serverMsg = error.response?.data?.error?.message;

    // 1. Map known technical error codes to friendly text
    if (code && FRIENDLY_MESSAGES[code]) {
      return FRIENDLY_MESSAGES[code];
    }

    // 2. Catch raw messages that leak infrastructure details
    if (serverMsg && isNetworkishMessage(serverMsg)) {
      return "We're having trouble connecting. Please check your internet and try again.";
    }

    // 3. Pure network failure (no response at all — device offline, DNS fail, etc.)
    if (!error.response) {
      return "Unable to connect. Please check your internet connection and try again.";
    }

    // 4. Server returned a message that's safe to show
    return serverMsg || error.message || fallback || "An error occurred";
  }

  if (error instanceof Error) {
    if (isNetworkishMessage(error.message)) {
      return "Unable to connect. Please check your internet connection and try again.";
    }
    return error.message || fallback || "An unexpected error occurred";
  }

  return fallback || "An unexpected error occurred";
}

// API base URL — Vite only exposes VITE_ vars to the browser.
const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL || '/api/v1'
).replace(/\/+$/, '');

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// ── Retry policy ───────────────────────────────────────────
//
// Render free tier sleeps after inactivity → first request after a cold
// start takes 2–5s and sometimes 502/503. Nigerian 4G drops packets.
// We retry idempotent reads with exponential backoff so transient
// failures never reach the user.
//
// Rules:
//   • Only retry GET / HEAD (mutations are not safe to replay)
//   • Retry on network errors + 502 / 503 / 504
//   • Skip 401 — the response interceptor below handles refresh + replay
//   • Skip all other 4xx — those won't change on retry
//   • 2 retries (3 total attempts), exponential backoff 300ms / 900ms

axiosRetry(api, {
  retries: 2,
  retryDelay: (retryCount) => exponentialDelay(retryCount, undefined, 300),
  retryCondition: (error) => {
    const method = (error.config?.method || 'get').toLowerCase();
    if (method !== 'get' && method !== 'head') return false;

    if (isNetworkError(error)) return true;

    const status = error.response?.status;
    if (status === 401) return false; // let the response interceptor handle refresh
    return status === 502 || status === 503 || status === 504;
  },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  // Inject active business ID header for backend context resolution
  try {
    const activeBizId = localStorage.getItem('activeBusinessId');
    if (activeBizId && !config.headers['X-Business-Id']) {
      config.headers['X-Business-Id'] = activeBizId;
    }
  } catch {
    // LocalStorage read error fallback
  }

  // If data is FormData, remove Content-Type so browser sets boundary automatically
  if (config.data instanceof FormData) {
    delete config.headers['Content-Type'];
  }
  return config;
});

let isRefreshing = false;
let failedQueue: Array<{
  resolve: (token: string) => void;
  reject: (error: any) => void;
}> = [];

const processQueue = (error: any, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token!);
    }
  });
  failedQueue = [];
};

function setAuthorizationHeader(req: any, token: string) {
  if (req.headers?.set && typeof req.headers.set === 'function') {
    req.headers.set('Authorization', `Bearer ${token}`);
  } else if (req.headers) {
    req.headers.Authorization = `Bearer ${token}`;
  }
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    if (!originalRequest) {
      return Promise.reject(error);
    }

    const url = originalRequest.url || '';
    // Recursive loop guard: never attempt refresh if the failing endpoint is an auth route
    if (
      url.includes('/auth/refresh') ||
      url.includes('/auth/login') ||
      url.includes('/auth/register') ||
      url.includes('/public/')
    ) {
      return Promise.reject(error);
    }

    if (error.response?.status === 401 && !originalRequest._retry) {
      // 1. Cross-tab synchronization check:
      // If another tab already refreshed the token, localStorage will have a newer token
      const storedToken = localStorage.getItem('accessToken');
      const authHeader = (
        originalRequest.headers?.Authorization ||
        originalRequest.headers?.get?.('Authorization')
      ) as string | undefined;
      const sentToken = authHeader ? authHeader.replace(/^Bearer\s+/i, '') : null;

      if (storedToken && sentToken && storedToken !== sentToken) {
        originalRequest._retry = true;
        setAuthorizationHeader(originalRequest, storedToken);
        return api(originalRequest);
      }

      // 2. Refresh mutex: if a refresh is already in flight, queue this request
      if (isRefreshing) {
        return new Promise<string>((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            originalRequest._retry = true;
            setAuthorizationHeader(originalRequest, token);
            return api(originalRequest);
          })
          .catch((err) => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      const refreshToken = localStorage.getItem('refreshToken');
      if (!refreshToken) {
        isRefreshing = false;
        return Promise.reject(error);
      }

      try {
        const { data } = await axios.post(`${API_BASE_URL}/auth/refresh`, { refreshToken });
        // Guard: logout may have fired while this refresh was in-flight.
        // If the refreshToken we sent is no longer the one in storage,
        // the session was intentionally destroyed — discard the new token
        // instead of resurrecting a zombie session (root cause of the
        // "logout bounces back to dashboard + trial modal" loop).
        if (localStorage.getItem('refreshToken') !== refreshToken) {
          processQueue(error, null);
          return Promise.reject(error);
        }
        const newToken = data.data.accessToken;
        localStorage.setItem('accessToken', newToken);
        try { touchActivity(); } catch {}
        api.defaults.headers.common.Authorization = `Bearer ${newToken}`;
        setAuthorizationHeader(originalRequest, newToken);
        processQueue(null, newToken);
        return api(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        console.error('Token refresh failed:', refreshError);
        // Lazy import — auth.store imports this module, so a top-level
        // import would create a load-time cycle. Resolving at call-time
        // is fine because by now both modules are fully evaluated.
        const { useAuthStore } = await import('@/stores/auth.store.ts');
        useAuthStore.getState().logout();
        // logout() sets isAuthenticated=false synchronously
        // (auth.store.ts logout). ProtectedRoute/GuestRoute will soft-render
        // <Navigate to="/login"/> on the next React tick.
        //
        // An IMMEDIATE window.location.replace here strips the query string
        // (?token=... for team invites) and feels like a flash. Keep it as
        // a 1.5 s safety net: fire ONLY if React hasn't redirected off a
        // protected path by then. The pathname equality check at fire time
        // guards against races — if React already navigated, the path will
        // have changed and we skip the hard replace.
        if (typeof window !== 'undefined') {
          const path = window.location.pathname;
          const isAuthPage =
            path === '/login' ||
            path === '/register' ||
            path === '/' ||
            path === '/invite' ||
            path === '/verify-email' ||
            path === '/verify-email-pending' ||
            path === '/forgot-password' ||
            path === '/reset-password';
          if (!isAuthPage) {
            setTimeout(() => {
              if (window.location.pathname === path) {
                // Use replace so back-button doesn't return to a dead session.
                window.location.replace('/login');
              }
            }, 1500);
          }
        }
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

export default api;
