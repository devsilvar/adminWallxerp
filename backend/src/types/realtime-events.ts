export type RealtimeEvent =
  | { type: 'dva_transfer_received'; businessId: string; saleId: string; amount: number; customerName: string; reference: string; timestamp: string }
  | { type: 'bulk_import_completed'; businessId: string; jobId: string; totalRows: number; importedCount: number; skippedCount: number; timestamp: string }
  | { type: 'payout_completed'; businessId: string; payoutId: string; amount: number; status: 'completed'|'failed'; failureReason?: string; timestamp: string }
  | { type: 'wallet_balance_updated'; businessId: string; availableBalance: number; lockedBalance: number; timestamp: string }
  | { type: 'broadcast_email_progress'; broadcastId: string; totalRecipients: number; sent: number; failed: number; skipped: number; pending: number; totalProcessed: number; timestamp: string }
  | { type: 'broadcast_email_completed'; broadcastId: string; totalRecipients: number; sent: number; failed: number; skipped: number; pending: number; status: 'sent'; deliveryStats: { total: number; sent: number; failed: number; skipped: number; pending: number }; timestamp: string }
  | { type: 'withdrawal_created'; withdrawalId: string; businessId: string; businessName: string; amount: number; timestamp: string }
  | { type: 'advance_created'; withdrawalId: string; businessId: string; businessName: string; amount: number; timestamp: string }
  | { type: 'withdrawal_status_changed'; withdrawalId: string; businessId: string; businessName: string; status: 'pending'|'processing'|'completed'|'failed'; amount: number; failureReason?: string; timestamp: string }
  | { type: 'unverified_inflow_created'; saleId: string; businessId: string; businessName: string; amount: number; referenceId?: string; timestamp: string }
  | { type: 'unverified_inflow_verified'; saleId: string; businessId: string; timestamp: string }
  | { type: 'subscription_submitted'; submissionId: string; customerName: string; plan: string; amount: number; timestamp: string }
  | { type: 'subscription_status_changed'; submissionId: string; status: 'approved'|'rejected'; plan: string; timestamp: string };

export const REALTIME_EVENT_TYPES = [
  'dva_transfer_received',
  'bulk_import_completed',
  'payout_completed',
  'wallet_balance_updated',
  'broadcast_email_progress',
  'broadcast_email_completed',
  'withdrawal_created',
  'advance_created',
  'withdrawal_status_changed',
  'unverified_inflow_created',
  'unverified_inflow_verified',
  'subscription_submitted',
  'subscription_status_changed',
] as const;
