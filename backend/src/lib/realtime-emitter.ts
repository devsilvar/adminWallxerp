import { EventEmitter } from 'events';
import logger from '@/lib/logger';
import type { RealtimeEvent } from '@/types/realtime-events';

class RealtimeBus extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(1000);
  }

  emitToUserIds(userIds: string[], event: RealtimeEvent) {
    const uniq = new Set(userIds.filter(Boolean));
    for (const uid of uniq) {
      logger.debug('realtime emit', { userId: uid, type: event.type });
      this.emit(`user:${uid}`, event);
    }
  }

  emitToChannel(channel: string, event: RealtimeEvent) {
    this.emit(`channel:${channel}`, event);
  }
}

export const eventBus = new RealtimeBus();
export const realtimeBus = eventBus;
