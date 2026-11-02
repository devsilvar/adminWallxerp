/**
 * Main Router
 *
 * Aggregates all API routes and applies versioning.
 *
 * @author WallX Engineering Team
 */

import { Router } from 'express';
import healthRoutes from './health.routes';
import authRoutes from './auth.routes';
import businessRoutes from './business.routes';
import adminRoutes from './admin.routes';
import salesRoutes from './sales.routes';
import expenseRoutes from './expense.routes';
import taxRoutes from './tax.routes';
import taxProfileRoutes from './tax-profile.routes';
import reminderRoutes from './reminder.routes';
import paymentRoutes from './payment.routes';
import statementRoutes from './statement.routes';
import webhookRoutes from './webhook.routes';
import dvaRoutes from './dva.routes';
import invoiceRoutes from './invoice.routes';
import creditRoutes from './credit.routes';
import customerCardRoutes from './customer-card.routes';
import voucherRequestRoutes from './voucher-request.routes';
import searchRoutes from './search.routes';
import publicRoutes from './public.routes';
import bankRoutes from './bank.routes';
import testRoutes from './test.routes';
import transactionClassificationRoutes from './transaction-classification.routes';
import receiptRoutes from './receipt.routes';
import ledgerRoutes from './ledger.routes';
import settlementRoutes from './settlement.routes';
import walletRoutes from './wallet.routes';
import aiRoutes from './ai.routes';
import teamRoutes from './team.routes';
import invitationRoutes from './invitation.routes';
import subscriptionRoutes from './subscription.routes';
import feedbackRoutes from './feedback.routes';
import messageRoutes from './message.routes';
import sseRoutes from './sse.routes';
import { rejectAdminOnUserRoutes } from '@/middleware/roleGuard';

const router = Router();

/**
 * Health check routes (no version prefix)
 */
router.use('/health', healthRoutes);

/**
 * API v1 routes
 */
const v1 = Router();
// Public, unauthenticated endpoints. Mounted NRST so token routes can never
// be shadowed by an authenticated handler defined later.
v1.use('/public', publicRoutes);
v1.use('/auth', authRoutes);
v1.use('/invitations', invitationRoutes);

// Session isolation: reject admin JWTs from all SME business and user routes
v1.use('/businesses', rejectAdminOnUserRoutes);
v1.use('/banks', rejectAdminOnUserRoutes);
v1.use('/wallet', rejectAdminOnUserRoutes);
v1.use('/subscription', rejectAdminOnUserRoutes);
v1.use('/feedback', rejectAdminOnUserRoutes);
v1.use('/transaction-classifications', rejectAdminOnUserRoutes);

v1.use('/businesses', businessRoutes);
v1.use('/businesses/:businessId/sales', salesRoutes);
v1.use('/businesses/:businessId/expenses', expenseRoutes);
v1.use('/businesses/:businessId/tax', taxRoutes);
v1.use('/businesses/:businessId/tax-profile', taxProfileRoutes);
v1.use('/businesses/:businessId/tax', paymentRoutes);
v1.use('/businesses/:businessId/tax', statementRoutes);
v1.use('/businesses/:businessId/reminders', reminderRoutes);
v1.use('/businesses/:businessId/dva', dvaRoutes);
v1.use('/businesses/:businessId/settlement', settlementRoutes);
v1.use('/businesses/:businessId/invoices', invoiceRoutes);
v1.use('/businesses/:businessId/credits', creditRoutes);
v1.use('/businesses/:businessId/customers', customerCardRoutes);
v1.use('/businesses/:businessId/voucher-requests', voucherRequestRoutes);
v1.use('/businesses/:businessId/receipts', receiptRoutes);
v1.use('/businesses/:businessId/ledger', ledgerRoutes);
v1.use('/businesses/:businessId/search', searchRoutes);
v1.use('/businesses/:businessId/ai', aiRoutes);
v1.use('/businesses/:businessId/team', teamRoutes);
v1.use('/banks', bankRoutes);
v1.use('/transaction-classifications', transactionClassificationRoutes);
v1.use('/wallet', walletRoutes);
v1.use('/subscription', subscriptionRoutes);
v1.use('/feedback', feedbackRoutes);
v1.use('/admin', adminRoutes);
v1.use('/events', sseRoutes);
v1.use('/messages', messageRoutes);

// Test endpoints — only in test env (never in dev/staging with live keys)
if (process.env.NODE_ENV === 'test') {
  v1.use('/test', testRoutes);
}

router.use('/v1', v1);

// Webhooks — outside v1, no auth
router.use('/webhooks', webhookRoutes);

export default router;
