import api from '@/lib/axios';

export class SSEClient {
  private es: EventSource | null = null;
  private listeners = new Map<string, Set<(e: any) => void>>();
  private reconnectAttempts = 0;
  maxRetries = 10;
  baseDelay = 1000;

  async connect() {
    if (import.meta.env.VITE_ENABLE_SSE === 'false') return;
    if (typeof window === 'undefined' || typeof EventSource === 'undefined') return;
    if (this.es && (this.es.readyState === EventSource.CONNECTING || this.es.readyState === EventSource.OPEN)) {
      return;
    }
    const token = localStorage.getItem('accessToken');
    if (!token) return;

    let ticket: string;
    try {
      const r = await api.get('/events/ticket');
      ticket = (r.data as any).ticket;
    } catch {
      return;
    }

    if (!ticket) return;

    const url = `/api/v1/events/stream?ticket=${encodeURIComponent(ticket)}`;
    this.es = new EventSource(url);

    this.es.onopen = () => {
      this.reconnectAttempts = 0;
    };

    this.es.onmessage = (ev) => {
      try {
        const data = JSON.parse((ev as MessageEvent).data);
        if (data.type === 'connection_established') return;
        const cbs = this.listeners.get(data.type);
        cbs?.forEach((cb) => cb(data));
      } catch {}
    };

    this.es.onerror = () => {
      this.es?.close();
      this.es = null;
      this.reconnectWithBackoff();
    };
  }

  private reconnectWithBackoff() {
    if (this.reconnectAttempts >= this.maxRetries) return;
    const d = Math.min(this.baseDelay * Math.pow(2, this.reconnectAttempts++), 30000);
    setTimeout(() => this.connect(), d);
  }

  on(type: string, cb: (e: any) => void) {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)!.add(cb);
  }

  off(type: string, cb: (e: any) => void) {
    this.listeners.get(type)?.delete(cb);
  }

  disconnect() {
    this.es?.close();
    this.es = null;
    this.listeners.clear();
  }
}

let inst: SSEClient | null = null;
export const getSSEClient = () => inst ?? (inst = new SSEClient());
