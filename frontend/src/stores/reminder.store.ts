import { create } from 'zustand';
import toast from 'react-hot-toast';
import api, { getErrorMessage } from '@/lib/axios.ts';
import type { Reminder } from '@/types/index.ts';

/**
 * Reminder store — scoped to the top-bar NotificationBell's "active" list.
 *
 * Deliberately narrow: the existing /reminders page still owns its own
 * paginated/filterable state; this store only manages the unsent reminders
 * that drive the bell badge + dropdown. Split-state pattern mirrors
 * invoice.store.ts.
 */
interface ReminderState {
  activeReminders: Reminder[];
  loading: boolean;
  error: string | null;
  lastFetchedBusinessId: string | null;
  lastFetchedAt: number | null;

  fetchActive: (businessId: string) => Promise<void>;
  markRead: (businessId: string, id: string) => Promise<void>;
  dismiss: (businessId: string, id: string) => Promise<void>;
  clear: () => void;
}

function basePath(businessId: string) {
  return `/businesses/${businessId}/reminders`;
}

/** Replace the same reminder in the list if present. */
function patchInList(list: Reminder[], patch: Partial<Reminder> & { id: string }): Reminder[] {
  const idx = list.findIndex((r) => r.id === patch.id);
  if (idx === -1) return list;
  const next = list.slice();
  next[idx] = { ...next[idx], ...patch };
  return next;
}

export const useReminderStore = create<ReminderState>((set, get) => ({
  activeReminders: [],
  loading: false,
  error: null,
  lastFetchedBusinessId: null,
  lastFetchedAt: null,

  fetchActive: async (businessId) => {
    set({ loading: true, error: null });
    try {
      const { data } = await api.get(`${basePath(businessId)}/active`);
      set({
        activeReminders: data.data,
        lastFetchedBusinessId: businessId,
        lastFetchedAt: Date.now(),
      });
    } catch (err) {
      // Keep the last-known list; surface error inside the dropdown only.
      set({ error: getErrorMessage(err) });
    } finally {
      set({ loading: false });
    }
  },

  /**
   * Optimistically flip isSent=true, then PATCH. On failure, revert the row
   * and show a toast. Server is idempotent so a duplicate call (e.g. from a
   * re-render race) is harmless.
   */
  markRead: async (businessId, id) => {
    const prev = get().activeReminders.find((r) => r.id === id);
    if (!prev) return; // nothing to do; list was cleared underneath us
    if (prev.isSent) return; // already read — skip the network round-trip

    set((s) => ({
      activeReminders: patchInList(s.activeReminders, {
        id,
        isSent: true,
        sentAt: new Date().toISOString(),
      }),
    }));

    try {
      await api.patch(`${basePath(businessId)}/${id}/mark-sent`);
    } catch (err) {
      // Revert to the prior shape on failure.
      set((s) => ({
        activeReminders: patchInList(s.activeReminders, {
          id,
          isSent: prev.isSent,
          sentAt: prev.sentAt,
        }),
      }));
      toast.error(getErrorMessage(err));
    }
  },

  /**
   * Optimistically remove the row, then DELETE. On failure, re-insert at its
   * original index so the user sees it come back and knows the action failed.
   */
  dismiss: async (businessId, id) => {
    const before = get().activeReminders;
    const idx = before.findIndex((r) => r.id === id);
    if (idx === -1) return;
    const removed = before[idx]!;

    set({ activeReminders: before.filter((r) => r.id !== id) });

    try {
      await api.delete(`${basePath(businessId)}/${id}`);
    } catch (err) {
      set((s) => {
        const next = s.activeReminders.slice();
        // Clamp idx in case the list has shrunk further since.
        const insertAt = Math.min(idx, next.length);
        next.splice(insertAt, 0, removed);
        return { activeReminders: next };
      });
      toast.error(getErrorMessage(err));
    }
  },

  clear: () =>
    set({
      activeReminders: [],
      loading: false,
      error: null,
      lastFetchedBusinessId: null,
      lastFetchedAt: null,
    }),
}));

/** Derived unread count — pass as a selector to the hook. */
export const selectUnreadCount = (s: ReminderState): number =>
  s.activeReminders.reduce((n, r) => (r.isSent ? n : n + 1), 0);
