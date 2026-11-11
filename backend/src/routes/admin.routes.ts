import { Router } from 'express';
import { authenticate, authorize } from '@/middleware/auth';
import * as adminController from '@/controllers/admin.controller';
import * as remittanceController from '@/controllers/firs-remittance.controller';
import * as messageController from '@/controllers/message.controller';
import marketplaceAdminRoutes from './marketplace-admin.routes';
import { broadcastRateLimiter } from '@/middleware/security';

const router = Router();

// All admin routes require authentication + admin role
router.use(authenticate, authorize('admin'));

router.get('/dashboard', adminController.getDashboard);
router.get('/users', adminController.listUsers);
router.get('/users/:id', adminController.getUserDetail);
router.patch('/users/:id/status', adminController.toggleUserStatus);
router.post('/users/:id/notify-signup', adminController.notifyUserSignup);
router.patch('/users/:id/email-verification', adminController.toggleEmailVerification);
router.patch('/users/:id/auto-payout', adminController.toggleUserAutoPayout);
router.get('/users/:id/downgrade-preview', adminController.previewDowngrade);
router.patch('/users/:id/subscription', adminController.overrideUserSubscription);
router.get('/businesses', adminController.listBusinesses);
router.get('/audit-logs', adminController.listAuditLogs);

// Treasury P&L & forensic unit economics
router.get('/treasury/analytics', adminController.getTreasuryAnalytics);
router.get('/treasury/transactions/:id', adminController.getTreasuryTransactionDetail);

// Platform-wide real-wallet-money feed (DVA inflows / withdrawals / tax payments)
router.get('/transactions', adminController.listTransactions);

// Unverified inflows triage & reallocation
router.get('/sales/unverified', adminController.listUnverifiedInflows);
router.patch('/sales/:saleId/reassign', adminController.reassignSale);
router.post('/sales/unverified/:saleId/verify', adminController.verifyUnverifiedSale);

// Global platform fee settings
router.get('/settings/fees', adminController.getFeeConfig);
router.patch('/settings/fees', adminController.updateFeeConfig);

// Global platform tax & statutory compliance settings
router.get('/settings/tax', adminController.getTaxConfig);
router.patch('/settings/tax', adminController.updateTaxConfig);

// Global dynamic AI provider settings
router.get('/settings/ai', adminController.getAIConfig);
router.put('/settings/ai', adminController.updateAIConfig);
router.post('/settings/ai/test', adminController.testAIConfig);


// Payout account change lock (admin-granted one-time permissions)
router.post('/businesses/:businessId/payout-change-permit', adminController.grantPayoutChangePermission);
router.delete('/businesses/:businessId/payout-change-permit', adminController.revokePayoutChangePermission);

// Withdrawal request management (NEW-7 v2: admin-approved withdrawal workflow)
router.get('/settlement/withdrawals', adminController.listWithdrawalRequests);
router.post('/settlement/withdrawals/:id/approve', adminController.approveWithdrawalRequest);
router.post('/settlement/withdrawals/:id/reject', adminController.rejectWithdrawalRequest);
router.post('/settlement/withdrawals/:id/requery', adminController.requeryWithdrawalRequest);
router.post('/settlement/withdrawals/:id/manual-settle', adminController.manualSettleWithdrawalRequest);

// NRS remittance tracking & reconciliation
router.get('/remittances/summary', remittanceController.getSummary);
router.get('/remittances', remittanceController.listRemittances);
router.post('/remittances', remittanceController.createBatch);
router.get('/remittances/:id', remittanceController.getRemittance);
router.post('/remittances/:id/record', remittanceController.recordRemittance);

// Manual Bank Transfer Subscription Desk
router.get('/subscriptions', adminController.listSubscriptions);
router.get('/subscriptions/:id', adminController.getSubscriptionDetail);
router.get('/subscriptions/:id/receipt', adminController.getSubscriptionReceipt);
router.post('/subscriptions/:id/approve', adminController.approveSubscription);
router.post('/subscriptions/:id/reject', adminController.rejectSubscription);

// In-app user feedback & reviews analytics
router.get('/reviews', adminController.listReviews);

// Broadcasts & Direct Messaging Desk
router.get('/broadcasts', messageController.listBroadcasts);
router.get('/broadcasts/:id', messageController.getBroadcast);
router.get('/broadcasts/:id/messages', messageController.listBroadcastMessages);
router.post('/broadcasts/:id/retry', messageController.retryBroadcastEmails);
router.post('/broadcasts', broadcastRateLimiter, messageController.createBroadcast);

// Marketplace moderation queue & approvals
router.use('/marketplace', marketplaceAdminRoutes);

export default router;
