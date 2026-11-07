import { create } from 'zustand';
import toast from 'react-hot-toast';
import api, { getErrorMessage } from '@/lib/axios.ts';
import type { UserMessage, Pagination } from '@/types/index.ts';

export interface FetchMessagesParams {
  page?: number;
  limit?: number;
  unread?: boolean;
  search?: string;
}

interface MessageState {
  messages: UserMessage[];
  pagination: Pagination | null;
  unreadCount: number;
  loading: boolean;
  lastFetchedAt: number | null;

  fetch: (params?: FetchMessagesParams) => Promise<void>;
  fetchUnreadCount: () => Promise<void>;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  clear: () => void;
}

export const useMessageStore = create<MessageState>((set, get) => ({
  messages: [],
  pagination: null,
  unreadCount: 0,
  loading: false,
  lastFetchedAt: null,

  fetch: async (params) => {
    set({ loading: true });
    try {
      const res = await api.get('/messages', { params });
      if (res.data?.success) {
        set({
          messages: res.data.data || [],
          pagination: res.data.pagination || null,
          lastFetchedAt: Date.now(),
        });
      }
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to load inbox messages'));
    } finally {
      set({ loading: false });
    }
  },

  fetchUnreadCount: async () => {
    try {
      const res = await api.get('/messages/unread-count');
      if (res.data?.success && typeof res.data.count === 'number') {
        set({ unreadCount: res.data.count });
      }
    } catch {
      // Background count check fails silently
    }
  },

  markRead: async (id: string) => {
    const prevMessages = get().messages;
    const prevUnreadCount = get().unreadCount;

    const target = prevMessages.find((m) => m.id === id);
    if (!target || target.isRead) return;

    // Optimistic UI update
    set({
      messages: prevMessages.map((m) =>
        m.id === id ? { ...m, isRead: true, readAt: new Date().toISOString() } : m,
      ),
      unreadCount: Math.max(0, prevUnreadCount - 1),
    });

    try {
      await api.patch(`/messages/${id}/read`);
    } catch (err) {
      // Revert on failure
      set({
        messages: prevMessages,
        unreadCount: prevUnreadCount,
      });
      toast.error(getErrorMessage(err, 'Failed to mark message as read'));
    }
  },

  markAllRead: async () => {
    const prevMessages = get().messages;
    const prevUnreadCount = get().unreadCount;

    if (prevUnreadCount === 0 && prevMessages.every((m) => m.isRead)) return;

    // Optimistic UI update
    set({
      messages: prevMessages.map((m) => ({
        ...m,
        isRead: true,
        readAt: new Date().toISOString(),
      })),
      unreadCount: 0,
    });

    try {
      await api.patch('/messages/read-all');
    } catch (err) {
      // Revert on failure
      set({
        messages: prevMessages,
        unreadCount: prevUnreadCount,
      });
      toast.error(getErrorMessage(err, 'Failed to mark all as read'));
    }
  },

  clear: () => {
    set({
      messages: [],
      pagination: null,
      unreadCount: 0,
      loading: false,
      lastFetchedAt: null,
    });
  },
}));
