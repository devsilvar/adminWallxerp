import { create } from 'zustand';
import api from '@/lib/axios';
import toast from 'react-hot-toast';

export interface PinStatus {
  hasPin: boolean;
  isLocked: boolean;
  lockedUntil?: string;
  remainingAttempts: number;
  attemptsResetAt?: string;
  pinSetAt?: string;
}

export interface UserSession {
  id: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  deviceInfo?: string | null;
  lastActiveAt: string;
  createdAt: string;
  isCurrent: boolean;
}

interface PinState {
  hasPin: boolean;
  isLocked: boolean;
  lockedUntil?: string;
  remainingAttempts: number;
  attemptsResetAt?: string;
  pinSetAt?: string;
  loading: boolean;
  sessions: UserSession[];
  loadingSessions: boolean;

  fetchStatus: () => Promise<void>;
  setupPin: (pin: string, password: string) => Promise<boolean>;
  verifyPin: (pin: string) => Promise<{ valid: boolean; stepUpToken?: string }>;
  changePin: (newPin: string, currentPin?: string, password?: string) => Promise<boolean>;
  fetchSessions: () => Promise<void>;
  revokeSession: (sessionId: string) => Promise<boolean>;
  revokeOtherSessions: () => Promise<boolean>;
}

export const usePinStore = create<PinState>((set, get) => ({
  hasPin: false,
  isLocked: false,
  lockedUntil: undefined,
  remainingAttempts: 5, // keep in sync with PIN_MAX_ATTEMPTS
  attemptsResetAt: undefined,
  pinSetAt: undefined,
  loading: false,
  sessions: [],
  loadingSessions: false,

  fetchStatus: async () => {
    try {
      const res = await api.get<{ success: boolean; data: any }>('/auth/pin/status');
      if (res.data.success) {
        set({
          hasPin: res.data.data.hasPin,
          isLocked: res.data.data.isLocked,
          lockedUntil: res.data.data.lockedUntil,
          remainingAttempts: res.data.data.remainingAttempts,
          attemptsResetAt: res.data.data.attemptsResetAt,
          pinSetAt: res.data.data.pinSetAt,
        });
      }
    } catch (err) {
      console.error('Failed to fetch PIN status:', err);
    }
  },

  setupPin: async (pin: string, password: string) => {
    set({ loading: true });
    try {
      const res = await api.post<{ success: boolean; message: string }>('/auth/pin/setup', {
        pin,
        password,
      });
      toast.success(res.data.message || 'Transaction PIN configured successfully');
      set({ hasPin: true, remainingAttempts: 5, isLocked: false, lockedUntil: undefined, attemptsResetAt: undefined });
      return true;
    } catch (err: any) {
      toast.error(err.response?.data?.error?.message || 'Failed to setup PIN');
      return false;
    } finally {
      set({ loading: false });
    }
  },

  verifyPin: async (pin: string) => {
    try {
      const res = await api.post<{ success: boolean; data: { valid: boolean; stepUpToken?: string } }>(
        '/auth/pin/verify',
        { pin }
      );
      if (res.data.success && res.data.data?.valid) {
        set({
          remainingAttempts: 5,
          isLocked: false,
          lockedUntil: undefined,
          attemptsResetAt: undefined,
        });
        return { valid: true, stepUpToken: res.data.data.stepUpToken };
      }
      return { valid: false };
    } catch (err: any) {
      const status = err.response?.status;
      const errorData = err.response?.data?.error;

      if (status === 423) {
        set({ isLocked: true, lockedUntil: errorData?.details?.lockedUntil, remainingAttempts: 0 });
        toast.error(errorData?.message || 'Transaction PIN is locked due to multiple failed attempts');
      } else {
        const remaining = errorData?.details?.remainingAttempts ?? get().remainingAttempts - 1;
        set({ remainingAttempts: Math.max(0, remaining) });
        toast.error(errorData?.message || 'Incorrect transaction PIN');
      }
      return { valid: false };
    }
  },

  changePin: async (newPin: string, currentPin?: string, password?: string) => {
    try {
      set({ loading: true });
      const res = await api.put('/auth/pin/change', { newPin, currentPin, password });
      toast.success(res.data.message || 'Transaction PIN changed successfully');
      set({ remainingAttempts: 5, isLocked: false, lockedUntil: undefined, attemptsResetAt: undefined });
      return true;
    } catch (err: any) {
      toast.error(err.response?.data?.error?.message || 'Failed to change PIN');
      return false;
    } finally {
      set({ loading: false });
    }
  },

  fetchSessions: async () => {
    try {
      set({ loadingSessions: true });
      const refreshToken = localStorage.getItem('refreshToken') || '';
      const res = await api.get<{ success: boolean; data: UserSession[] }>('/auth/sessions', {
        headers: refreshToken ? { 'x-refresh-token': refreshToken } : {},
      });
      if (res.data.success && res.data.data) {
        set({ sessions: res.data.data });
      }
    } catch {
      // Non-blocking
    } finally {
      set({ loadingSessions: false });
    }
  },

  revokeSession: async (sessionId: string) => {
    try {
      const res = await api.delete(`/auth/sessions/${sessionId}`);
      toast.success(res.data.message || 'Session revoked successfully');
      set((state) => ({
        sessions: state.sessions.filter((s) => s.id !== sessionId),
      }));
      return true;
    } catch (err: any) {
      toast.error(err.response?.data?.error?.message || 'Failed to revoke session');
      return false;
    }
  },

  revokeOtherSessions: async () => {
    try {
      const refreshToken = localStorage.getItem('refreshToken') || '';
      const res = await api.post(
        '/auth/sessions/revoke-others',
        {},
        { headers: refreshToken ? { 'x-refresh-token': refreshToken } : {} }
      );
      toast.success(res.data.message || 'Other sessions logged out');
      set((state) => ({
        sessions: state.sessions.filter((s) => s.isCurrent),
      }));
      return true;
    } catch (err: any) {
      toast.error(err.response?.data?.error?.message || 'Failed to revoke sessions');
      return false;
    }
  },
}));
