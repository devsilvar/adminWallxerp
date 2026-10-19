import prisma from '@/lib/prisma';
import { eventBus } from '@/lib/realtime-emitter';
import type { RealtimeEvent } from '@/types/realtime-events';

let adminIdsCache: string[] | null = null;
let lastFetchedAt = 0;
const CACHE_TTL_MS = 60000;

/**
 * Emits a real-time SSE event to all currently active administrators.
 * Caches admin user IDs in memory for 60 seconds to avoid repeating DB queries
 * on high-frequency admin desk updates.
 */
export async function emitToAdmins(event: RealtimeEvent): Promise<void> {
  const now = Date.now();
  if (!adminIdsCache || now - lastFetchedAt > CACHE_TTL_MS) {
    const admins = await prisma.user.findMany({
      where: { role: 'admin', isActive: true },
      select: { id: true },
    });
    adminIdsCache = admins.map((a) => a.id);
    lastFetchedAt = now;
  }
  if (adminIdsCache.length > 0) {
    eventBus.emitToUserIds(adminIdsCache, event);
  }
}

/**
 * Test helper to reset cached admin IDs.
 */
export function _resetAdminCacheForTest(): void {
  adminIdsCache = null;
  lastFetchedAt = 0;
}
