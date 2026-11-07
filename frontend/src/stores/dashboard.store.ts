import { create } from 'zustand';

/**
 * Dashboard event store — lightweight pub/sub for cache invalidation.
 * 
 * When a mutation happens (create sale, add expense, finalize tax), emit
 * an event via `invalidateDashboard()`. The Dashboard component subscribes
 * and refetches its bundle.
 * 
 * Why not just call a function directly? Decoupling. Sales.tsx doesn't need
 * to import Dashboard.tsx or know how the dashboard works. It just signals
 * "hey, data changed" and listeners decide what to do.
 * 
 * Pattern: Event counter. Dashboard watches the counter; when it changes,
 * it knows to refetch. This is React-friendly (works with useEffect deps)
 * and avoids the "stale closure" issues that callback-based patterns have.
 */

export type InvalidationReason = 
  | 'sale_created' 
  | 'sale_updated' 
  | 'sale_deleted'
  | 'expense_created' 
  | 'expense_updated' 
  | 'expense_deleted'
  | 'invoice_paid'
  | 'invoice_dva_reconciled'
  | 'sales_imported'
  | 'tax_calculated'
  | 'tax_finalized'
  | 'tax_paid'
  | 'transaction_verified'
  | 'credit_settled'
  | 'debt_reconciled'
  | 'manual'; // User clicked refresh button

interface DashboardEventState {
  /** Increments on every invalidation. Components can watch this counter. */
  invalidationCounter: number;
  
  /** Last reason for invalidation (for debugging/logging). */
  lastReason: InvalidationReason | null;
  
  /** Timestamp of last invalidation. */
  lastInvalidatedAt: number | null;
  
  /** 
   * Signal that dashboard data is stale and should be refetched.
   * Call this after any mutation that affects dashboard numbers.
   * 
   * Example:
   *   await api.post('/sales', body);
   *   invalidateDashboard('sale_created');
   */
  invalidateDashboard: (reason: InvalidationReason) => void;
  
  /**
   * Reset invalidation state (e.g., after successful refetch).
   * Optional — helps with debugging. Not required for functionality.
   */
  reset: () => void;
}

export const useDashboardEvents = create<DashboardEventState>((set) => ({
  invalidationCounter: 0,
  lastReason: null,
  lastInvalidatedAt: null,
  
  invalidateDashboard: (reason) => {
    if (import.meta.env.DEV) {
      console.log(`[DashboardEvents] Invalidated: ${reason}`);
    }
    set((state) => ({
      invalidationCounter: state.invalidationCounter + 1,
      lastReason: reason,
      lastInvalidatedAt: Date.now(),
    }));
  },
  
  reset: () => {
    set({
      invalidationCounter: 0,
      lastReason: null,
      lastInvalidatedAt: null,
    });
  },
}));
