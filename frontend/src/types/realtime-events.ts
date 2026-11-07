export type RealtimeEvent =
  | { type: 'dva_transfer_received'; businessId: string; saleId: string; amount: number; customerName: string; reference: string; timestamp: string }
  | { type: 'bulk_import_completed'; businessId: string; jobId: string; totalRows: number; importedCount: number; skippedCount: number; timestamp: string }
  | { type: 'payout_completed'; businessId: string; payoutId: string; amount: number; status: 'completed'|'failed'; failureReason?: string; timestamp: string }
  | { type: 'wallet_balance_updated'; businessId: string; availableBalance: number; lockedBalance: number; timestamp: string };

export const REALTIME_EVENT_TYPES = ['dva_transfer_received','bulk_import_completed','payout_completed','wallet_balance_updated'] as const;
