/**
 * Comprehensive Logout Cleanup Tests
 * 
 * Ensures that logout() properly clears:
 * - All localStorage items
 * - All sessionStorage items  
 * - All Zustand store state
 * - Authentication state
 * 
 * This prevents cross-user data leakage when multiple users
 * use the same browser session sequentially.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useAuthStore } from '../auth.store';
import { useBusinessStore } from '../business.store';
import { useInvoiceStore } from '../invoice.store';
import { useTeamStore } from '../team.store';
import { useReminderStore } from '../reminder.store';
import { useCreditStore } from '../credit.store';
import { useCustomerStore } from '../customer.store';
import { useLedgerStore } from '../ledger.store';
import { useSettlementStore } from '../settlement.store';

describe('Auth Store - Logout Cleanup', () => {
  beforeEach(() => {
    // Clear all storage before each test
    localStorage.clear();
    sessionStorage.clear();
    
    // Reset all stores to initial state
    useAuthStore.setState({
      user: null,
      isAuthenticated: false,
      isLoading: false,
    });
  });

  it('should clear all authentication tokens from localStorage', () => {
    // Setup: Add tokens
    localStorage.setItem('accessToken', 'test-access-token');
    localStorage.setItem('refreshToken', 'test-refresh-token');
    
    // Execute logout
    useAuthStore.getState().logout();
    
    // Verify tokens are removed
    expect(localStorage.getItem('accessToken')).toBeNull();
    expect(localStorage.getItem('refreshToken')).toBeNull();
  });

  it('should clear business and user context from localStorage', () => {
    // Setup
    localStorage.setItem('activeBusinessId', 'biz-123');
    localStorage.setItem('signupPlan', 'business');
    
    // Execute
    useAuthStore.getState().logout();
    
    // Verify
    expect(localStorage.getItem('activeBusinessId')).toBeNull();
    expect(localStorage.getItem('signupPlan')).toBeNull();
  });

  it('should clear trial and subscription data from localStorage', () => {
    // Setup
    localStorage.setItem('wallx_trial_started_at', '1234567890');
    localStorage.setItem('hasSeenTrialWelcome', 'true');
    
    // Execute
    useAuthStore.getState().logout();
    
    // Verify
    expect(localStorage.getItem('wallx_trial_started_at')).toBeNull();
    expect(localStorage.getItem('hasSeenTrialWelcome')).toBeNull();
  });

  it('should clear all AI chat history from localStorage', () => {
    // Setup: Create AI chat entries for multiple businesses
    localStorage.setItem('ai_chats_v2_biz-1', JSON.stringify([{ id: '1', messages: [] }]));
    localStorage.setItem('ai_chats_v2_biz-2', JSON.stringify([{ id: '2', messages: [] }]));
    localStorage.setItem('ai_active_chat_biz-1', 'chat-1');
    localStorage.setItem('ai_active_chat_biz-2', 'chat-2');
    localStorage.setItem('ai_chat_biz-old', JSON.stringify([])); // Legacy format
    localStorage.setItem('unrelated_key', 'should-remain'); // Should not be removed
    
    // Execute
    useAuthStore.getState().logout();
    
    // Verify AI chat keys are removed
    expect(localStorage.getItem('ai_chats_v2_biz-1')).toBeNull();
    expect(localStorage.getItem('ai_chats_v2_biz-2')).toBeNull();
    expect(localStorage.getItem('ai_active_chat_biz-1')).toBeNull();
    expect(localStorage.getItem('ai_active_chat_biz-2')).toBeNull();
    expect(localStorage.getItem('ai_chat_biz-old')).toBeNull();
    
    // Verify unrelated keys remain
    expect(localStorage.getItem('unrelated_key')).toBe('should-remain');
  });

  it('should clear review prompt state from localStorage', () => {
    // Setup
    localStorage.setItem('wallx_review_prompt_dismissed', 'true');
    localStorage.setItem('wallx_review_prompt_snoozed_until', '1234567890');
    localStorage.setItem('wallx_review_submitted', 'true');
    localStorage.setItem('wallx_test_review', 'true');
    
    // Execute
    useAuthStore.getState().logout();
    
    // Verify
    expect(localStorage.getItem('wallx_review_prompt_dismissed')).toBeNull();
    expect(localStorage.getItem('wallx_review_prompt_snoozed_until')).toBeNull();
    expect(localStorage.getItem('wallx_review_submitted')).toBeNull();
    expect(localStorage.getItem('wallx_test_review')).toBeNull();
  });

  it('should clear all sessionStorage items', () => {
    // Setup
    sessionStorage.setItem('pendingVerificationEmail', 'user@example.com');
    sessionStorage.setItem('businessCreatedAt', '1234567890');
    sessionStorage.setItem('businessCreatedName', 'Test Business');
    sessionStorage.setItem('justCreatedFirstBiz', 'true');
    
    // Execute
    useAuthStore.getState().logout();
    
    // Verify
    expect(sessionStorage.getItem('pendingVerificationEmail')).toBeNull();
    expect(sessionStorage.getItem('businessCreatedAt')).toBeNull();
    expect(sessionStorage.getItem('businessCreatedName')).toBeNull();
    expect(sessionStorage.getItem('justCreatedFirstBiz')).toBeNull();
  });

  it('should reset auth state', () => {
    // Setup: Set user as authenticated
    useAuthStore.setState({
      user: { id: '123', email: 'test@example.com' } as any,
      isAuthenticated: true,
    });
    
    // Execute
    useAuthStore.getState().logout();
    
    // Verify
    const state = useAuthStore.getState();
    expect(state.user).toBeNull();
    expect(state.isAuthenticated).toBe(false);
  });

  it('should call clear() on all domain stores', () => {
    // Setup: Mock clear methods
    const reminderClearSpy = vi.spyOn(useReminderStore.getState(), 'clear');
    const businessClearSpy = vi.spyOn(useBusinessStore.getState(), 'clear');
    const invoiceClearSpy = vi.spyOn(useInvoiceStore.getState(), 'clear');
    const teamClearSpy = vi.spyOn(useTeamStore.getState(), 'clear');
    const creditClearSpy = vi.spyOn(useCreditStore.getState(), 'clear');
    const customerClearSpy = vi.spyOn(useCustomerStore.getState(), 'clear');
    const ledgerClearSpy = vi.spyOn(useLedgerStore.getState(), 'clear');
    const settlementClearSpy = vi.spyOn(useSettlementStore.getState(), 'clear');
    
    // Execute
    useAuthStore.getState().logout();
    
    // Verify all clear methods were called
    expect(reminderClearSpy).toHaveBeenCalledTimes(1);
    expect(businessClearSpy).toHaveBeenCalledTimes(1);
    expect(invoiceClearSpy).toHaveBeenCalledTimes(1);
    expect(teamClearSpy).toHaveBeenCalledTimes(1);
    expect(creditClearSpy).toHaveBeenCalledTimes(1);
    expect(customerClearSpy).toHaveBeenCalledTimes(1);
    expect(ledgerClearSpy).toHaveBeenCalledTimes(1);
    expect(settlementClearSpy).toHaveBeenCalledTimes(1);
  });

  it('should perform complete cleanup in correct order', () => {
    // Setup: Populate everything
    localStorage.setItem('accessToken', 'token');
    localStorage.setItem('refreshToken', 'refresh');
    localStorage.setItem('activeBusinessId', 'biz-1');
    localStorage.setItem('signupPlan', 'starter');
    localStorage.setItem('wallx_trial_started_at', '123');
    localStorage.setItem('hasSeenTrialWelcome', 'true');
    localStorage.setItem('ai_chats_v2_biz-1', '[]');
    localStorage.setItem('wallx_review_submitted', 'true');
    
    sessionStorage.setItem('pendingVerificationEmail', 'test@example.com');
    sessionStorage.setItem('justCreatedFirstBiz', 'true');
    
    useAuthStore.setState({
      user: { id: '123', email: 'test@example.com' } as any,
      isAuthenticated: true,
    });
    
    // Execute
    useAuthStore.getState().logout();
    
    // Verify complete cleanup
    expect(localStorage.getItem('accessToken')).toBeNull();
    expect(localStorage.getItem('refreshToken')).toBeNull();
    expect(localStorage.getItem('activeBusinessId')).toBeNull();
    expect(localStorage.getItem('signupPlan')).toBeNull();
    expect(localStorage.getItem('wallx_trial_started_at')).toBeNull();
    expect(localStorage.getItem('hasSeenTrialWelcome')).toBeNull();
    expect(localStorage.getItem('ai_chats_v2_biz-1')).toBeNull();
    expect(localStorage.getItem('wallx_review_submitted')).toBeNull();
    
    expect(sessionStorage.getItem('pendingVerificationEmail')).toBeNull();
    expect(sessionStorage.getItem('justCreatedFirstBiz')).toBeNull();
    
    const authState = useAuthStore.getState();
    expect(authState.user).toBeNull();
    expect(authState.isAuthenticated).toBe(false);
  });

  it('should preserve language preference across logout', () => {
    // Setup: Language is intentionally persisted
    localStorage.setItem('lang', 'en');
    localStorage.setItem('accessToken', 'token');
    
    // Execute
    useAuthStore.getState().logout();
    
    // Verify: auth cleared but language preserved
    expect(localStorage.getItem('accessToken')).toBeNull();
    expect(localStorage.getItem('lang')).toBe('en'); // Should remain
  });

  it('should handle logout when storage is already empty', () => {
    // Execute logout with no data
    expect(() => {
      useAuthStore.getState().logout();
    }).not.toThrow();
    
    // Verify state is clean
    const state = useAuthStore.getState();
    expect(state.user).toBeNull();
    expect(state.isAuthenticated).toBe(false);
  });

  it('should handle logout with many AI chat entries efficiently', () => {
    // Setup: Create 50 AI chat entries
    for (let i = 0; i < 50; i++) {
      localStorage.setItem(`ai_chats_v2_biz-${i}`, JSON.stringify([]));
      localStorage.setItem(`ai_active_chat_biz-${i}`, `chat-${i}`);
    }
    
    // Add some unrelated keys
    localStorage.setItem('unrelated_1', 'value1');
    localStorage.setItem('unrelated_2', 'value2');
    
    // Execute
    const startTime = performance.now();
    useAuthStore.getState().logout();
    const endTime = performance.now();
    
    // Verify all AI chats removed
    for (let i = 0; i < 50; i++) {
      expect(localStorage.getItem(`ai_chats_v2_biz-${i}`)).toBeNull();
      expect(localStorage.getItem(`ai_active_chat_biz-${i}`)).toBeNull();
    }
    
    // Verify unrelated keys remain
    expect(localStorage.getItem('unrelated_1')).toBe('value1');
    expect(localStorage.getItem('unrelated_2')).toBe('value2');
    
    // Should complete quickly (under 100ms even with 100 keys)
    expect(endTime - startTime).toBeLessThan(100);
  });
});

describe('Store Clear Methods - Individual Verification', () => {
  it('should clear business store completely', () => {
    // Setup: Populate business store
    useBusinessStore.setState({
      businesses: [{ id: '1', name: 'Test' } as any],
      activeBusiness: { id: '1', name: 'Test' } as any,
      isLoading: true,
    });
    
    // Execute
    useBusinessStore.getState().clear();
    
    // Verify
    const state = useBusinessStore.getState();
    expect(state.businesses).toEqual([]);
    expect(state.activeBusiness).toBeNull();
    expect(state.isLoading).toBe(false);
  });

  it('should clear credit store completely', () => {
    useCreditStore.setState({
      credits: [{ id: '1' } as any],
      listLoading: true,
    });
    
    useCreditStore.getState().clear();
    
    const state = useCreditStore.getState();
    expect(state.credits).toEqual([]);
    expect(state.listLoading).toBe(false);
  });

  it('should clear customer store completely', () => {
    useCustomerStore.setState({
      customers: [{ id: '1' } as any],
      stats: { totalCustomers: 10 } as any,
      activities: [{ id: '1' } as any],
      loading: true,
    });
    
    useCustomerStore.getState().clear();
    
    const state = useCustomerStore.getState();
    expect(state.customers).toEqual([]);
    expect(state.stats).toBeNull();
    expect(state.activities).toEqual([]);
    expect(state.loading).toBe(false);
  });

  it('should clear ledger store completely', () => {
    useLedgerStore.setState({
      items: [{ id: '1' } as any],
      summary: { openingBalance: 1000 } as any,
      loading: true,
      searchQuery: 'test',
    });
    
    useLedgerStore.getState().clear();
    
    const state = useLedgerStore.getState();
    expect(state.items).toEqual([]);
    expect(state.summary.openingBalance).toBe(0);
    expect(state.loading).toBe(false);
    expect(state.searchQuery).toBe('');
  });

  it('should clear settlement store completely', () => {
    useSettlementStore.setState({
      preview: { businessId: '1' } as any,
      history: [{ id: '1' } as any],
      loading: true as any,
    });
    
    useSettlementStore.getState().clear();
    
    const state = useSettlementStore.getState();
    expect(state.preview).toBeNull();
    expect(state.history).toEqual([]);
  });
});
