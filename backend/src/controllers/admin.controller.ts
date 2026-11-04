import fs from 'fs';
import { Response } from 'express';
import { asyncHandler, AppError } from '@/middleware/errorHandler';
import { AuthenticatedRequest } from '@/types';
import {
  paginationSchema,
  userSearchSchema,
  toggleStatusSchema,
  verifyEmailSchema,
  auditLogFilterSchema,
  manualSettleWithdrawalSchema,
  updateFeeConfigSchema,
  updateTaxConfigSchema,
  treasuryAnalyticsFilterSchema,
  adminTransactionsQuerySchema,
  updateAIConfigSchema,
  testAIConfigSchema,
  listUnverifiedInflowsSchema,
  adminReassignSaleSchema,
  adminVerifySaleSchema,
  listSubscriptionsSchema,
  approveSubscriptionSchema,
  rejectSubscriptionSchema,
  listAdminReviewsSchema,
  adminOverrideSubscriptionSchema,
} from '@/validators/admin.validator';
import * as adminService from '@/services/admin.service';
import * as adminUnverifiedService from '@/services/admin/admin-unverified-inflows.service';
import * as feedbackService from '@/services/feedback.service';
import * as settlementService from '@/services/settlement.service';
import { PlatformConfigService } from '@/services/platform-config.service';
import { PlatformTaxConfigService } from '@/services/platform-tax-config.service';
import { AIConfigService } from '@/services/ai/ai-config.service';

export const getDashboard = asyncHandler(
  async (_req: AuthenticatedRequest, res: Response) => {
    const stats = await adminService.getDashboardStats();

    res.status(200).json({
      success: true,
      data: stats,
    });
  }
);

export const listUsers = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const { page, limit, search, role, isActive, isVerified } = userSearchSchema.parse(req.query);
    const result = await adminService.listUsers(page, limit, search, { role, isActive, isVerified });

    res.status(200).json({
      success: true,
      ...result,
    });
  }
);

export const getUserDetail = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const user = await adminService.getUserDetail(req.params.id);

    res.status(200).json({
      success: true,
      data: user,
    });
  }
);

export const toggleUserStatus = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const { isActive, reason } = toggleStatusSchema.parse(req.body);
    const result = await adminService.toggleUserStatus(req.params.id, isActive, req.user!.userId, undefined, reason);

    res.status(200).json({
      success: true,
      data: result,
      message: `User ${isActive ? 'activated' : 'deactivated'} successfully`,
    });
  }
);

export const toggleEmailVerification = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const { isVerified } = verifyEmailSchema.parse(req.body);
    
    const result = isVerified
      ? await adminService.verifyUserEmail(req.params.id, req.user!.userId)
      : await adminService.unverifyUserEmail(req.params.id, req.user!.userId);

    res.status(200).json({
      success: true,
      data: result,
      message: `User email ${isVerified ? 'verified' : 'unverified'} successfully`,
    });
  }
);

export const listBusinesses = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const { page, limit } = paginationSchema.parse(req.query);
    const result = await adminService.listAllBusinesses(page, limit);

    res.status(200).json({
      success: true,
      ...result,
    });
  }
);

export const listAuditLogs = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const { page, limit, userId, action } = auditLogFilterSchema.parse(req.query);
    const result = await adminService.listAuditLogs(page, limit, { userId, action });

    res.status(200).json({
      success: true,
      ...result,
    });
  }
);

export const grantPayoutChangePermission = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const result = await adminService.grantPayoutChangePermission(
      req.params.businessId,
      req.user!.userId
    );

    res.status(200).json({
      success: true,
      data: result,
      message: 'One-time payout change permission granted. Expires in 24 hours.',
    });
  }
);

export const revokePayoutChangePermission = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const result = await adminService.revokePayoutChangePermission(
      req.params.businessId,
      req.user!.userId
    );

    res.status(200).json({
      success: true,
      data: result,
      message: 'Payout change permission revoked successfully.',
    });
  }
);


// ═══════════════════════════════════════════════════════════════════════════
// ADMIN: Withdrawal Request Management (NEW-7 v2)
// ═══════════════════════════════════════════════════════════════════════════

export const listWithdrawalRequests = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const status = req.query.status as 'pending' | 'processing' | 'completed' | 'failed' | undefined;
    const page = req.query.page ? Number(req.query.page) : undefined;
    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    const search = typeof req.query.search === 'string' ? req.query.search : undefined;
    const needsReconciliation = req.query.needsReconciliation === 'true'
      ? true
      : req.query.needsReconciliation === 'false'
      ? false
      : undefined;

    const result = await settlementService.adminListWithdrawalRequests({
      status,
      search,
      page,
      limit,
      needsReconciliation,
    });

    res.status(200).json({
      success: true,
      data: result.items,
      items: result.items,
      pagination: result.pagination,
    });
  }
);

export const approveWithdrawalRequest = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const result = await settlementService.adminApproveWithdrawal(
      req.user!.userId,
      req.params.id
    );

    res.status(200).json({
      success: true,
      data: result,
      message: 'Withdrawal request approved and transfer initiated.',
    });
  }
);

export const rejectWithdrawalRequest = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const { reason } = req.body;
    if (!reason || typeof reason !== 'string' || reason.trim().length < 3) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Rejection reason is required (minimum 3 characters)',
        },
      });
    }

    const result = await settlementService.adminRejectWithdrawal(
      req.user!.userId,
      req.params.id,
      reason.trim()
    );

    res.status(200).json({
      success: true,
      data: result,
      message: 'Withdrawal request rejected.',
    });
  }
);

export const requeryWithdrawalRequest = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const result = await settlementService.adminRequeryWithdrawal(
      req.user!.userId,
      req.params.id
    );

    res.status(200).json({
      success: true,
      data: result,
      message: result.message,
    });
  }
);

export const manualSettleWithdrawalRequest = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const input = manualSettleWithdrawalSchema.parse(req.body);
    const result = await settlementService.adminManualSettleWithdrawal(
      req.user!.userId,
      req.params.id,
      input
    );

    res.status(200).json({
      success: true,
      data: result,
      message: 'Withdrawal marked as settled via manual bank transfer.',
    });
  }
);

export const toggleUserAutoPayout = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const { id: targetUserId } = req.params;
    const { enabled } = req.body;

    if (typeof enabled !== 'boolean') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: '"enabled" boolean field is required',
        },
      });
    }

    const result = await settlementService.adminToggleUserAutoPayout(
      req.user!.userId,
      targetUserId,
      enabled
    );

    res.status(200).json({
      success: true,
      data: result,
      message: `User account payout mode updated to ${enabled ? 'Automatic' : 'Manual'}.`,
    });
  }
);

export const getTreasuryAnalytics = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const filters = treasuryAnalyticsFilterSchema.parse(req.query);
    const result = await adminService.getTreasuryAnalytics(filters);

    res.status(200).json({
      success: true,
      data: result,
    });
  }
);

export const listTransactions = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const filters = adminTransactionsQuerySchema.parse(req.query);
    const result = await adminService.getAdminTransactions(filters);

    res.status(200).json({
      success: true,
      data: result.transfers,
      summary: result.summary,
      pagination: result.pagination,
    });
  }
);

export const getTreasuryTransactionDetail = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;
    const type = req.query.type as 'inflow' | 'outflow' | undefined;
    const detail = await adminService.getTreasuryTransactionDetail(id, type);

    res.status(200).json({
      success: true,
      data: detail,
    });
  }
);

export const getFeeConfig = asyncHandler(
  async (_req: AuthenticatedRequest, res: Response) => {
    const config = await PlatformConfigService.getFeeConfig();

    res.status(200).json({
      success: true,
      data: config,
    });
  }
);

export const updateFeeConfig = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const params = updateFeeConfigSchema.parse(req.body);
    const updated = await PlatformConfigService.updateFeeConfig(
      params,
      req.user!.userId,
      { ip: req.ip, userAgent: req.headers['user-agent'] }
    );

    res.status(200).json({
      success: true,
      data: updated,
      message: 'Global platform fee configuration updated successfully.',
    });
  }
);

export const getTaxConfig = asyncHandler(
  async (_req: AuthenticatedRequest, res: Response) => {
    const config = await PlatformTaxConfigService.getTaxConfig();

    res.status(200).json({
      success: true,
      data: config,
    });
  }
);

export const updateTaxConfig = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const params = updateTaxConfigSchema.parse(req.body);
    const updated = await PlatformTaxConfigService.updateTaxConfig(
      params,
      req.user!.userId
    );

    res.status(200).json({
      success: true,
      data: updated,
      message: 'Global platform tax configuration updated successfully.',
    });
  }
);

export const getAIConfig = asyncHandler(
  async (_req: AuthenticatedRequest, res: Response) => {
    const config = await AIConfigService.getAdminConfig();

    res.status(200).json({
      success: true,
      data: config,
    });
  }
);

export const updateAIConfig = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const params = updateAIConfigSchema.parse(req.body);
    const updated = await AIConfigService.updateConfig(params, req.user!.userId);

    res.status(200).json({
      success: true,
      data: updated,
      message: 'Global AI provider configuration updated successfully.',
    });
  }
);

export const testAIConfig = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const params = testAIConfigSchema.parse(req.body);
    const result = await AIConfigService.testConnection(params);

    res.status(200).json({
      success: result.success,
      data: result,
      message: result.success
        ? `Connection successful (${result.latencyMs}ms)`
        : `Connection test failed: ${result.error}`,
    });
  }
);

export const listUnverifiedInflows = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const query = listUnverifiedInflowsSchema.parse(req.query);
    const result = await adminUnverifiedService.listUnverifiedInflows(query);

    res.status(200).json({
      success: true,
      ...result,
    });
  }
);

export const reassignSale = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const { targetBusinessId } = adminReassignSaleSchema.parse(req.body);
    const updated = await adminUnverifiedService.adminReassignSale(
      req.user!.userId,
      req.params.saleId,
      targetBusinessId
    );

    res.status(200).json({
      success: true,
      data: updated,
      message: 'Sale successfully reallocated to target business',
    });
  }
);

export const verifyUnverifiedSale = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const input = adminVerifySaleSchema.parse(req.body);
    const updated = await adminUnverifiedService.adminVerifySale(
      req.user!.userId,
      req.params.saleId,
      input
    );

    res.status(200).json({
      success: true,
      data: updated,
      message: 'Transaction successfully verified and classified',
    });
  }
);

export const listSubscriptions = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const query = listSubscriptionsSchema.parse(req.query);
    const result = await adminService.listSubscriptionSubmissions(query);

    res.status(200).json({
      success: true,
      ...result,
    });
  }
);

export const getSubscriptionDetail = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const submission = await adminService.getSubscriptionSubmissionDetail(req.params.id);

    res.status(200).json({
      success: true,
      data: submission,
    });
  }
);

export const getSubscriptionReceipt = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const submission = await adminService.getSubscriptionReceipt(req.params.id);

    if (submission.receiptUrl && submission.receiptUrl.startsWith('http')) {
      return res.redirect(submission.receiptUrl);
    }

    if (submission.receiptPath && fs.existsSync(submission.receiptPath)) {
      res.setHeader('Content-Type', submission.receiptMime || 'application/octet-stream');
      res.setHeader(
        'Content-Disposition',
        `inline; filename="${submission.receiptFileName || 'receipt'}"`,
      );
      const stream = fs.createReadStream(submission.receiptPath);
      return stream.pipe(res);
    }

    throw new AppError(404, 'Receipt document not found on storage', 'RECEIPT_NOT_FOUND');
  }
);

export const approveSubscription = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const input = approveSubscriptionSchema.parse(req.body);
    const result = await adminService.approveSubscription(
      req.params.id,
      req.user!.userId,
      input
    );

    res.status(200).json({
      success: true,
      data: result,
      message: 'Subscription successfully approved and activated',
    });
  }
);

export const rejectSubscription = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const { reason } = rejectSubscriptionSchema.parse(req.body);
    const result = await adminService.rejectSubscription(
      req.params.id,
      req.user!.userId,
      reason
    );

    res.status(200).json({
      success: true,
      data: result,
      message: 'Subscription rejected',
    });
  }
);

export const listReviews = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const query = listAdminReviewsSchema.parse(req.query);
    const result = await feedbackService.listFeedbacksForAdmin(query);

    res.status(200).json({
      success: true,
      ...result,
    });
  }
);

export const overrideUserSubscription = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const input = adminOverrideSubscriptionSchema.parse(req.body);
    const result = await adminService.overrideUserSubscription(
      req.params.id,
      req.user!.userId,
      input
    );

    res.status(200).json({
      success: true,
      data: result,
      message: `Subscription successfully updated to ${input.tier}`,
    });
  }
);

export const previewDowngrade = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const tier = (req.query.tier as string) || '';
  if (!tier) throw new AppError(400, 'tier query param is required', 'MISSING_TIER');
  const preview = await adminService.previewDowngrade(id, tier);
  res.status(200).json({ success: true, data: preview });
});





