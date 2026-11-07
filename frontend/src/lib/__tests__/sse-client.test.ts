import { describe, it, expect, vi } from 'vitest';
import { SSEClient } from '../sse-client';

describe('SSEClient', () => {
  it('registers and triggers event listeners', () => {
    const client = new SSEClient();
    const handler = vi.fn();
    client.on('dva_transfer_received', handler);

    (client as any).listeners.get('dva_transfer_received')?.forEach((cb: any) =>
      cb({ type: 'dva_transfer_received', amount: 5000 })
    );

    expect(handler).toHaveBeenCalledWith({ type: 'dva_transfer_received', amount: 5000 });
  });

  it('removes event listener on off()', () => {
    const client = new SSEClient();
    const handler = vi.fn();
    client.on('bulk_import_completed', handler);
    client.off('bulk_import_completed', handler);

    (client as any).listeners.get('bulk_import_completed')?.forEach((cb: any) =>
      cb({ type: 'bulk_import_completed' })
    );

    expect(handler).not.toHaveBeenCalled();
  });

  it('clears listeners and closes on disconnect()', () => {
    const client = new SSEClient();
    const handler = vi.fn();
    client.on('payout_completed', handler);
    client.disconnect();

    expect((client as any).listeners.size).toBe(0);
  });
});
