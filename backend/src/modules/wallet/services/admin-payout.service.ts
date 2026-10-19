import prisma from '@/lib/prisma';
import { getPaymentProvider } from '@/lib/payment';
import { AppError } from '@/middleware/errorHandler';
import { logAudit } from '@/lib/audit';
import logger from '@/lib/logger';
import { createReminderOnce } from '@/services/reminder.service';
import { formatNaira } from '@/lib/format';
import { toNumber } from '@/shared/helpers';
import { WalletService } from '@/services/wallet.service';
import { eventBus } from '@/core/events/event-bus';
import { eventBus as realtimeBus } from '@/lib/realtime-emitter';
import { getPayoutPreview } from '@/services/settlement/payout-preview.service';
import { isAmbiguousTransferError } from '@/lib/payment/errors';
import { emitToAdmins } from '@/services/admin/realtime-admin.helper';

/**
 * ADMIN: List withdrawal requests (queue) — paginated, optional status filter.
 * Account numbers masked to last-4 in list responses (PII protection).
 */
export async function adminListWithdrawalRequests(query: {
  status?: 'pending' | 'processing' | 'completed' | 'failed';
  search?: string;
  page?: number;
  limit?: number;
}) {
  const page = query.page ?? 1;
  const limit = query.limit ?? 20;

  const where: any = {};
  if (query.status) {
    where.status = query.status;
  }
  if (query.search && query.search.trim()) {
    const s = query.search.trim();
    where.OR = [
      { business: { businessName: { contains: s, mode: 'insensitive' } } },
      { business: { merchantId: { contains: s, mode: 'insensitive' } } },
      { business: { user: { email: { contains: s, mode: 'insensitive' } } } },
      { destinationAccountName: { contains: s, mode: 'insensitive' } },
      { destinationBankName: { contains: s, mode: 'insensitive' } },
      { transferReference: { contains: s, mode: 'insensitive' } },
    ];
  }

  const [items, total] = await Promise.all([
    prisma.settlementPayout.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        business: {
          select: {
            id: true,
            businessName: true,
            merchantId: true,
            user: {
              select: { id: true, email: true, autoPayoutEnabled: true },
            },
          },
        },
      },
    }),
    prisma.settlementPayout.count({ where }),
  ]);

  const totalPages = Math.ceil(total / limit) || 1;
  const now = Date.now();

  return {
    items: items.map((p) => {
      const initiatedTime = p.initiatedAt ? new Date(p.initiatedAt).getTime() : new Date(p.createdAt).getTime();
      const ageHours = (now - initiatedTime) / (1000 * 60 * 60);
      const isStale = p.status === 'pending' && ageHours > 24;

      return {
        id: p.id,
        businessId: p.businessId,
        businessName: p.business.businessName,
        merchantId: p.business.merchantId,
        autoPayoutEnabled: p.business.user.autoPayoutEnabled,
        userEmail: p.business.user.email,
        amount: toNumber(p.amount),
        fee: toNumber(p.fee),
        netAmount: toNumber(p.netAmount),
        destinationBankName: p.destinationBankName,
        destinationAccountNum: `•••• ${p.destinationAccountNum.slice(-4)}`,
        destinationAccountName: p.destinationAccountName,
        transferReference: p.transferReference,
        status: p.status,
        isStale,
        narration: p.narration,
        failureReason: p.failureReason,
        adminApprovedBy: p.adminApprovedBy,
        adminApprovedAt: p.adminApprovedAt,
        initiatedAt: p.initiatedAt,
        completedAt: p.completedAt,
        createdAt: p.createdAt,
      };
    }),
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    },
  };
}

/**
 * ADMIN: Approve a pending withdrawal request → claim → initiate Paystack transfer.
 */
export async function adminApproveWithdrawal(adminUserId: string, payoutId: string) {
  const payout = await prisma.settlementPayout.findUnique({
    where: { id: payoutId },
    include: {
      business: {
        include: {
          user: {
            select: { id: true, email: true },
          },
        },
      },
    },
  });

  if (!payout) {
    throw new AppError(404, 'Withdrawal request not found', 'PAYOUT_NOT_FOUND');
  }

  if (payout.status !== 'pending') {
    throw new AppError(
      409,
      `This request is already ${payout.status} and cannot be approved again.`,
      'ALREADY_PROCESSED'
    );
  }

  const businessId = payout.businessId;
  const provider = getPaymentProvider();

  // Approval fence: lock + affordability recheck + atomic claim, all in ONE tx
  await prisma.$transaction(async (tx) => {
    // Fence 1: Advisory lock
    const [{ locked }] = await tx.$queryRaw<Array<{ locked: boolean }>>`
      SELECT pg_try_advisory_xact_lock(hashtextextended(${payout.business.user.id}::text, 0)) AS locked
    `;
    if (!locked) {
      throw new AppError(
        409,
        'Another approval for this account is in progress. Please wait a moment and try again.',
        'WITHDRAWAL_IN_PROGRESS'
      );
    }

    // Fence 2: Affordability check
    const preview = await getPayoutPreview(
      payout.business.user.id,
      businessId,
      tx,
      { excludePayoutId: payout.id }
    );
    if (toNumber(payout.amount) > preview.availableForWithdrawal) {
      throw new AppError(
        409,
        `Balance no longer covers this request (another withdrawal may have been approved since it was submitted). Reject it and ask the SME to submit a new request.`,
        'INSUFFICIENT_FUNDS_AT_APPROVAL',
        { currentAvailable: preview.availableForWithdrawal, requested: toNumber(payout.amount) }
      );
    }

    // Fence 3: Atomic claim
    const res = await tx.settlementPayout.updateMany({
      where: { id: payout.id, status: 'pending' },
      data: { status: 'processing' },
    });
    if (res.count === 0) {
      throw new AppError(
        409,
        'This request was already approved or rejected by another admin.',
        'ALREADY_PROCESSED'
      );
    }
  }, { maxWait: 20000, timeout: 60000 });

  void emitToAdmins({
    type: 'withdrawal_status_changed',
    withdrawalId: payout.id,
    businessId: payout.businessId,
    businessName: payout.business.businessName,
    status: 'processing',
    amount: toNumber(payout.amount),
    timestamp: new Date().toISOString(),
  }).catch((emitErr) => {
    logger.warn('Failed to emit withdrawal_status_changed (processing) to admins', { payoutId: payout.id, err: emitErr });
  });

  // Network IO outside any transaction
  try {
    const recipient = await provider.createTransferRecipient({
      type: 'nuban',
      name: payout.destinationAccountName,
      accountNumber: payout.destinationAccountNum,
      bankCode: payout.destinationBankCode,
      currency: 'NGN',
      description: `Payout for ${payout.business.businessName}`,
    });

    const transferAmount =
      toNumber(payout.netAmount) > 0 ? toNumber(payout.netAmount) : toNumber(payout.amount);

    // Live Paystack Balance Guard
    const balanceCheck = await WalletService.checkLivePaystackBalance(transferAmount);
    if (!balanceCheck.canPayout) {
      throw new AppError(
        503,
        'Platform settlement balance is currently insufficient to fulfill this transfer. Please try again later or contact support.',
        'GATEWAY_BALANCE_INSUFFICIENT',
        { deficitNaira: balanceCheck.deficit }
      );
    }

    const transferResult = await provider.initiateTransfer({
      source: 'balance',
      amount: transferAmount,
      recipient: recipient.recipientCode,
      reason: payout.narration || `Balance withdrawal for ${payout.business.businessName}`,
      reference: payout.transferReference,
    });

    const isComplete =
      transferResult.status === 'success' || transferResult.status === 'completed';

    const updated = await prisma.settlementPayout.update({
      where: { id: payout.id },
      data: {
        paystackTransferCode: transferResult.transferCode,
        ...(isComplete ? { status: 'completed', completedAt: new Date() } : {}),
        adminApprovedBy: adminUserId,
        adminApprovedAt: new Date(),
      },
    });

    if (isComplete) {
      await WalletService.settlePayoutDebit({
        userId: payout.business.userId,
        businessId: payout.businessId,
        amount: toNumber(payout.amount),
        fee: 0,
        reference: payout.transferReference,
        linkedPayoutId: payout.id,
        description: `Admin approved payout for ${payout.business.businessName}`,
      });

      // Post-commit event emission
      eventBus.emit('payout.completed', {
        userId: payout.business.userId,
        payoutId: payout.id,
        amount: toNumber(payout.amount),
        reference: payout.transferReference,
      });

      realtimeBus.emitToUserIds([payout.business.userId], {
        type: 'payout_completed',
        businessId: payout.businessId,
        payoutId: payout.id,
        amount: toNumber(payout.amount),
        status: 'completed',
        timestamp: new Date().toISOString(),
      });

      void emitToAdmins({
        type: 'withdrawal_status_changed',
        withdrawalId: payout.id,
        businessId: payout.businessId,
        businessName: payout.business.businessName,
        status: 'completed',
        amount: toNumber(payout.amount),
        timestamp: new Date().toISOString(),
      }).catch((emitErr) => {
        logger.warn('Failed to emit withdrawal_status_changed (completed) to admins', { payoutId: payout.id, err: emitErr });
      });
    }

    logAudit({
      userId: adminUserId,
      businessId,
      action: 'settlement.payout_approved',
      resourceType: 'settlement_payout',
      resourceId: payout.id,
      newData: {
        amount: toNumber(payout.amount),
        fee: toNumber(payout.fee),
        netAmount: toNumber(payout.netAmount),
        transferredToBank: transferAmount,
        transferReference: payout.transferReference,
        paystackTransferCode: transferResult.transferCode,
      },
    });

    logger.info('Withdrawal request approved and transfer initiated', {
      payoutId: payout.id,
      businessId,
      amount: toNumber(payout.amount),
      fee: toNumber(payout.fee),
      transferredToBank: transferAmount,
      reference: payout.transferReference,
      adminUserId,
    });

    void createReminderOnce({
      businessId,
      reminderType: 'payout_approved',
      scheduledDate: new Date(),
      message: `Your withdrawal of ${formatNaira(transferAmount)} (ref ${payout.transferReference}) was approved${
        toNumber(payout.fee) > 0
          ? ` after Paystack's ${formatNaira(toNumber(payout.fee))} transfer fee`
          : ''
      }. The transfer to your ${payout.destinationBankName} account ••••${payout.destinationAccountNum.slice(-4)} is in progress.`,
      referenceType: 'settlement_payout',
      referenceId: payout.id,
    }).catch((remErr) =>
      logger.warn('Failed to create payout_approved reminder', {
        payoutId: payout.id,
        err: remErr instanceof Error ? remErr.message : remErr,
      })
    );

    return updated;
  } catch (err) {
    try {
      if (err instanceof AppError && err.code === 'GATEWAY_BALANCE_INSUFFICIENT') {
        // Platform settlement balance is insufficient before transfer was initiated.
        // Revert to pending so admin can top up Paystack and retry, or choose Settle Offline.
        await prisma.settlementPayout.update({
          where: { id: payout.id },
          data: {
            status: 'pending',
            failureReason: `Platform Paystack balance insufficient to fulfill transfer (${err.message}). Top up Paystack and re-approve, or settle offline.`,
          },
        });

        void emitToAdmins({
          type: 'withdrawal_status_changed',
          withdrawalId: payout.id,
          businessId: payout.businessId,
          businessName: payout.business.businessName,
          status: 'pending',
          amount: toNumber(payout.amount),
          failureReason: `Platform Paystack balance insufficient to fulfill transfer (${err.message})`,
          timestamp: new Date().toISOString(),
        }).catch((emitErr) => {
          logger.warn('Failed to emit withdrawal_status_changed (pending) to admins', { payoutId: payout.id, err: emitErr });
        });

        throw err;
      }

      if (isAmbiguousTransferError(err)) {
        // ─── AMBIGUOUS: Paystack may have accepted the transfer ───
        // DO NOT release locked funds — the reconciliation cron will verify
        await prisma.settlementPayout.update({
          where: { id: payout.id },
          data: {
            status: 'processing',
            failureReason: `Gateway timeout / network error during transfer initiation. Awaiting automated reconciliation. Original error: ${err instanceof Error ? err.message : String(err)}`,
            updatedAt: new Date(),
          },
        });

        logger.error('[PAYOUT_TRANSFER_AMBIGUOUS] Admin approval transfer status uncertain — funds remain locked', {
          payoutId: payout.id,
          businessId,
          transferReference: payout.transferReference,
          error: err instanceof Error ? err.message : String(err),
        });

        logAudit({
          userId: adminUserId,
          businessId,
          action: 'settlement.payout_transfer_ambiguous',
          resourceType: 'settlement_payout',
          resourceId: payout.id,
          newData: {
            transferReference: payout.transferReference,
            reason: err instanceof Error ? err.message : String(err),
          },
        });

        void createReminderOnce({
          businessId,
          reminderType: 'payout_failed',
          scheduledDate: new Date(),
          message: `Your withdrawal of ${formatNaira(toNumber(payout.amount))} is being verified — the transfer was submitted but we're confirming the status with the bank. This usually resolves within 15 minutes. Your funds remain secure.`,
          referenceType: 'settlement_payout',
          referenceId: payout.id,
        }).catch((remErr) =>
          logger.warn('Failed to create ambiguous-transfer reminder', {
            payoutId: payout.id,
            err: remErr instanceof Error ? remErr.message : remErr,
          })
        );

        void emitToAdmins({
          type: 'withdrawal_status_changed',
          withdrawalId: payout.id,
          businessId: payout.businessId,
          businessName: payout.business.businessName,
          status: 'processing',
          amount: toNumber(payout.amount),
          failureReason: `Gateway timeout / network error during transfer initiation. Awaiting automated reconciliation.`,
          timestamp: new Date().toISOString(),
        }).catch((emitErr) => {
          logger.warn('Failed to emit withdrawal_status_changed (processing-ambiguous) to admins', { payoutId: payout.id, err: emitErr });
        });

        throw new AppError(
          504,
          'Transfer was submitted to the payment gateway but response timed out. The payout is marked as processing and will be auto-reconciled within 15 minutes.',
          'TRANSFER_AMBIGUOUS',
          { payoutId: payout.id, transferReference: payout.transferReference },
        );
      } else {
        // ─── DETERMINISTIC: Paystack definitively rejected the transfer ───
        // Safe to release locked funds back to available wallet balance
        await prisma.settlementPayout.update({
          where: { id: payout.id },
          data: {
            status: 'failed',
            failureReason: err instanceof Error ? err.message : String(err),
          },
        });

        if (payout.business?.userId) {
          await WalletService.releaseLockedFunds({
            userId: payout.business.userId,
            amount: payout.amount,
            fee: 0,
          });
        }

        logAudit({
          userId: adminUserId,
          businessId,
          action: 'settlement.payout_failed',
          resourceType: 'settlement_payout',
          resourceId: payout.id,
          newData: {
            transferReference: payout.transferReference,
            reason: err instanceof Error ? err.message : String(err),
          },
        });

        void createReminderOnce({
          businessId,
          reminderType: 'payout_failed',
          scheduledDate: new Date(),
          message: `The transfer for your withdrawal of ${formatNaira(toNumber(payout.amount))} could not be initiated; the amount is back in your available balance. Support has been notified.`,
          referenceType: 'settlement_payout',
          referenceId: payout.id,
        }).catch((remErr) =>
          logger.warn('Failed to create payout_failed reminder on approval error', {
            payoutId: payout.id,
            err: remErr instanceof Error ? remErr.message : remErr,
          })
        );

        if (payout.business?.userId) {
          eventBus.emit('payout.failed', {
            userId: payout.business.userId,
            payoutId: payout.id,
            amount: toNumber(payout.amount),
            reference: payout.transferReference,
            reason: err instanceof Error ? err.message : String(err),
            isRejection: false,
          });

          realtimeBus.emitToUserIds([payout.business.userId], {
            type: 'payout_completed',
            businessId: payout.businessId,
            payoutId: payout.id,
            amount: toNumber(payout.amount),
            status: 'failed',
            failureReason: err instanceof Error ? err.message : String(err),
            timestamp: new Date().toISOString(),
          });
        }

        void emitToAdmins({
          type: 'withdrawal_status_changed',
          withdrawalId: payout.id,
          businessId: payout.businessId,
          businessName: payout.business.businessName,
          status: 'failed',
          amount: toNumber(payout.amount),
          failureReason: err instanceof Error ? err.message : String(err),
          timestamp: new Date().toISOString(),
        }).catch((emitErr) => {
          logger.warn('Failed to emit withdrawal_status_changed (failed) to admins', { payoutId: payout.id, err: emitErr });
        });
      }
    } catch (markErr) {
      logger.error('Failed to handle payout error after approval transfer attempt', {
        payoutId: payout.id,
        originalError: err instanceof Error ? err.message : String(err),
        markError: markErr instanceof Error ? markErr.message : String(markErr),
      });
    }
    throw err;
  }
}

/**
 * ADMIN: Reject a pending withdrawal request → releases the reserved funds.
 */
export async function adminRejectWithdrawal(
  adminUserId: string,
  payoutId: string,
  reason: string
) {
  const payout = await prisma.settlementPayout.findUnique({
    where: { id: payoutId },
    select: {
      id: true,
      businessId: true,
      amount: true,
      fee: true,
      status: true,
      transferReference: true,
      business: { select: { userId: true, businessName: true } },
    },
  });

  if (!payout) {
    throw new AppError(404, 'Withdrawal request not found', 'PAYOUT_NOT_FOUND');
  }

  // A payout already dispatched to Paystack cannot be recalled. Rejecting it would
  // release locked funds the merchant can spend again while the bank transfer still
  // settles. Only 'pending' is safe to cancel; 'processing' must be resolved by requery.
  if (payout.status === 'processing') {
    throw new AppError(
      409,
      'This withdrawal is already in flight at the bank and cannot be cancelled. Use Requery to retrieve its final status.',
      'PAYOUT_IN_FLIGHT'
    );
  }

  const res = await prisma.settlementPayout.updateMany({
    where: { id: payout.id, status: 'pending' },
    data: {
      status: 'failed',
      failureReason: `Rejected by admin: ${reason}`,
    },
  });

  if (res.count === 0) {
    throw new AppError(
      409,
      'This request was already completed or rejected.',
      'ALREADY_PROCESSED'
    );
  }

  // Release locked funds back to available wallet balance
  if (payout.business?.userId) {
    await WalletService.releaseLockedFunds({
      userId: payout.business.userId,
      amount: payout.amount,
      fee: 0,
    });
  }

  logAudit({
    userId: adminUserId,
    businessId: payout.businessId,
    action: 'settlement.payout_rejected',
    resourceType: 'settlement_payout',
    resourceId: payout.id,
    newData: { amount: toNumber(payout.amount), reason },
  });

  logger.info('Withdrawal request rejected by admin', {
    payoutId: payout.id,
    businessId: payout.businessId,
    amount: toNumber(payout.amount),
    reason,
    adminUserId,
  });

  void createReminderOnce({
    businessId: payout.businessId,
    reminderType: 'payout_rejected',
    scheduledDate: new Date(),
    message: `Your withdrawal request of ${formatNaira(toNumber(payout.amount))} was rejected by admin: ${reason}. The funds remain in your available balance.`,
    referenceType: 'settlement_payout',
    referenceId: payout.id,
  }).catch((err) =>
    logger.warn('Failed to create payout_rejected reminder', {
      payoutId: payout.id,
      err: err instanceof Error ? err.message : err,
    })
  );

  if (payout.business?.userId) {
    eventBus.emit('payout.failed', {
      userId: payout.business.userId,
      payoutId: payout.id,
      amount: toNumber(payout.amount),
      reference: payout.transferReference,
      reason,
      isRejection: true,
    });
  }

  void emitToAdmins({
    type: 'withdrawal_status_changed',
    withdrawalId: payout.id,
    businessId: payout.businessId,
    businessName: payout.business?.businessName || '',
    status: 'failed',
    amount: toNumber(payout.amount),
    failureReason: `Rejected by admin: ${reason}`,
    timestamp: new Date().toISOString(),
  }).catch((err) =>
    logger.warn('Failed to emit withdrawal_status_changed (rejected) to admins', { payoutId: payout.id, err })
  );

  return { id: payout.id, status: 'failed' };
}

/**
 * ADMIN: Requery withdrawal status from Paystack
 */
export async function adminRequeryWithdrawal(adminUserId: string, payoutId: string) {
  const payout = await prisma.settlementPayout.findUnique({
    where: { id: payoutId },
    include: { business: true },
  });

  if (!payout) {
    throw new AppError(404, 'Withdrawal request not found', 'PAYOUT_NOT_FOUND');
  }

  if (payout.status === 'completed') {
    return { id: payout.id, status: payout.status, message: 'Transfer is already marked completed' };
  }

  const provider = getPaymentProvider();
  if (typeof provider.verifyTransfer !== 'function') {
    return { id: payout.id, status: payout.status, message: 'Transfer requery is not supported by payment provider' };
  }

  try {
    const result = await provider.verifyTransfer(
      payout.transferReference,
      payout.paystackTransferCode || undefined
    );
    const paystackStatus = result.status?.toLowerCase();
    const wasPendingOrProcessing =
      payout.status === 'pending' || payout.status === 'processing';

    if (paystackStatus === 'success' || paystackStatus === 'completed') {
      // Claim the status flip so a concurrent requery or transfer.success webhook
      // cannot both proceed to settle the same payout.
      const claimed = await prisma.settlementPayout.updateMany({
        where: { id: payout.id, status: { not: 'completed' } },
        data: {
          status: 'completed',
          completedAt: new Date(),
        },
      });

      if (claimed.count === 0) {
        return { id: payout.id, status: 'completed', message: 'Transfer is already marked completed' };
      }

      const userId = payout.business?.userId;

      if (userId) {
        // settlePayoutDebit is not idempotent — it decrements unconditionally. A
        // webhook may already have settled this payout while the row was still
        // 'processing', so the existing ledger entry is the source of truth.
        const alreadySettled = await prisma.walletTransaction.findFirst({
          where: { linkedPayoutId: payout.id },
          select: { id: true },
        });

        if (!alreadySettled) {
          // A payout that reached 'failed' had its locked funds released, and
          // releaseLockedFunds never debited `balance`. The transfer settled at the
          // bank regardless, so the balance still has to come out — but lockedBalance
          // must not be decremented a second time or the wallet goes negative.
          const settle = wasPendingOrProcessing
            ? WalletService.settlePayoutDebit
            : WalletService.debitReleasedPayout;

          await settle.call(WalletService, {
            userId,
            businessId: payout.businessId,
            amount: toNumber(payout.amount),
            fee: 0,
            reference: payout.transferReference,
            linkedPayoutId: payout.id,
            description: `Settlement payout completed via requery to ${payout.destinationBankName}`,
          });
        } else {
          logger.info('Requery found the payout already settled in the wallet ledger', {
            payoutId: payout.id,
            walletTransactionId: alreadySettled.id,
          });
        }
      }

      logAudit({
        userId: adminUserId,
        businessId: payout.businessId,
        action: 'settlement.payout_completed_via_requery',
        resourceType: 'settlement_payout',
        resourceId: payout.id,
        newData: {
          status: 'completed',
          transferReference: payout.transferReference,
          previousStatus: payout.status,
        },
      });

      if (userId) {
        eventBus.emit('payout.completed', {
          userId,
          payoutId: payout.id,
          amount: toNumber(payout.amount),
          reference: payout.transferReference,
        });
      }

      void emitToAdmins({
        type: 'withdrawal_status_changed',
        withdrawalId: payout.id,
        businessId: payout.businessId,
        businessName: payout.business.businessName,
        status: 'completed',
        amount: toNumber(payout.amount),
        timestamp: new Date().toISOString(),
      }).catch((emitErr) => {
        logger.warn('Failed to emit withdrawal_status_changed (requery-completed) to admins', { payoutId: payout.id, err: emitErr });
      });

      return { id: payout.id, status: 'completed', message: 'Transfer verified as successful' };
    } else if (paystackStatus === 'failed' || paystackStatus === 'reversed') {
      await prisma.settlementPayout.update({
        where: { id: payout.id },
        data: {
          status: 'failed',
          failureReason: result.gatewayResponse || 'Transfer failed at bank/Paystack',
        },
      });

      // Release locked funds if it was still pending/processing
      if (wasPendingOrProcessing && payout.business?.userId) {
        await WalletService.releaseLockedFunds({
          userId: payout.business.userId,
          amount: payout.amount,
          fee: 0,
        });
      }

      logAudit({
        userId: adminUserId,
        businessId: payout.businessId,
        action: 'settlement.payout_failed_via_requery',
        resourceType: 'settlement_payout',
        resourceId: payout.id,
        newData: { status: 'failed', reason: result.gatewayResponse },
      });

      if (wasPendingOrProcessing && payout.business?.userId) {
        eventBus.emit('payout.failed', {
          userId: payout.business.userId,
          payoutId: payout.id,
          amount: toNumber(payout.amount),
          reference: payout.transferReference,
          reason: result.gatewayResponse || 'Transfer failed at bank/Paystack',
          isRejection: false,
        });
      }

      void emitToAdmins({
        type: 'withdrawal_status_changed',
        withdrawalId: payout.id,
        businessId: payout.businessId,
        businessName: payout.business.businessName,
        status: 'failed',
        amount: toNumber(payout.amount),
        failureReason: result.gatewayResponse || 'Transfer failed at bank/Paystack',
        timestamp: new Date().toISOString(),
      }).catch((emitErr) => {
        logger.warn('Failed to emit withdrawal_status_changed (requery-failed) to admins', { payoutId: payout.id, err: emitErr });
      });

      return { id: payout.id, status: 'failed', message: `Transfer marked failed: ${result.gatewayResponse || paystackStatus}` };
    } else {
      return { id: payout.id, status: payout.status, message: `Transfer is currently ${paystackStatus}` };
    }
  } catch (err: any) {
    logger.warn('Requery transfer error', { payoutId, error: err.message });

    const isNotFound =
      (err instanceof AppError && (err.details?.httpStatus === 404 || err.statusCode === 404)) ||
      err.message?.toLowerCase().includes('not found');

    if (isNotFound) {
      // Transfer reference does NOT exist on Paystack (never processed or rejected upstream).
      // Mark as failed and release locked funds back to available wallet balance.
      const wasPendingOrProcessing =
        payout.status === 'pending' || payout.status === 'processing';

      await prisma.settlementPayout.update({
        where: { id: payout.id },
        data: {
          status: 'failed',
          failureReason: `Transfer not found on Paystack (${err.message || 'reference not found'}). Request marked as failed and funds returned to user wallet.`,
        },
      });

      if (wasPendingOrProcessing && payout.business?.userId) {
        await WalletService.releaseLockedFunds({
          userId: payout.business.userId,
          amount: payout.amount,
          fee: 0,
        });
      }

      logAudit({
        userId: adminUserId,
        businessId: payout.businessId,
        action: 'settlement.payout_failed_via_requery_not_found',
        resourceType: 'settlement_payout',
        resourceId: payout.id,
        newData: { status: 'failed', reason: err.message, transferReference: payout.transferReference },
      });

      void createReminderOnce({
        businessId: payout.businessId,
        reminderType: 'payout_failed',
        scheduledDate: new Date(),
        message: `Your withdrawal of ${formatNaira(toNumber(payout.amount))} (ref ${payout.transferReference}) could not be completed (transfer not found at payment gateway). Funds have been returned to your available balance.`,
        referenceType: 'settlement_payout',
        referenceId: payout.id,
      }).catch((remErr) =>
        logger.warn('Failed to create payout_failed reminder on requery not-found', { payoutId, remErr })
      );

      if (wasPendingOrProcessing && payout.business?.userId) {
        eventBus.emit('payout.failed', {
          userId: payout.business.userId,
          payoutId: payout.id,
          amount: toNumber(payout.amount),
          reference: payout.transferReference,
          reason: `Transfer not found on Paystack: ${err.message}`,
          isRejection: false,
        });
      }

      void emitToAdmins({
        type: 'withdrawal_status_changed',
        withdrawalId: payout.id,
        businessId: payout.businessId,
        businessName: payout.business.businessName,
        status: 'failed',
        amount: toNumber(payout.amount),
        failureReason: `Transfer not found on Paystack: ${err.message}`,
        timestamp: new Date().toISOString(),
      }).catch((emitErr) => {
        logger.warn('Failed to emit withdrawal_status_changed (requery-notfound) to admins', { payoutId: payout.id, err: emitErr });
      });

      return {
        id: payout.id,
        status: 'failed',
        message: 'Transfer was not found on Paystack. Request marked as failed and funds released back to user wallet.',
      };
    }

    throw new AppError(502, `Failed to verify transfer with Paystack: ${err.message}`, 'PAYSTACK_REQUERY_FAILED');
  }
}

/**
 * Admin: Toggles whether a user account's withdrawal requests execute automatically
 * or via manual admin review. Syncs across all businesses owned by this user.
 */
export async function adminToggleUserAutoPayout(
  adminUserId: string,
  targetUserId: string,
  enabled: boolean
) {
  const user = await prisma.user.findUnique({
    where: { id: targetUserId },
    include: {
      businesses: {
        select: {
          id: true,
          businessName: true,
          settlementAccountNumber: true,
          settlementBankCode: true,
        },
      },
    },
  });

  if (!user) {
    throw new AppError(404, 'User not found', 'USER_NOT_FOUND');
  }

  // If enabling, verify settlement account exists on user profile or at least one business
  const hasSettlement = Boolean(
    (user.settlementAccountNumber && user.settlementBankCode) ||
    user.businesses.some((b) => b.settlementAccountNumber && b.settlementBankCode)
  );

  if (enabled && !hasSettlement) {
    throw new AppError(
      400,
      'Cannot enable automatic payouts for a user account without a connected settlement bank account',
      'SETTLEMENT_ACCOUNT_REQUIRED'
    );
  }

  // Update user row directly as single source of truth
  const updatedUser = await prisma.user.update({
    where: { id: targetUserId },
    data: { autoPayoutEnabled: enabled },
    select: {
      id: true,
      autoPayoutEnabled: true,
    },
  });

  logAudit({
    userId: adminUserId,
    action: 'admin.user_auto_payout_toggled',
    resourceType: 'user',
    resourceId: targetUserId,
    oldData: { autoPayoutEnabled: user.autoPayoutEnabled },
    newData: { autoPayoutEnabled: enabled },
  });

  logger.info('User account auto-payout toggled by admin', {
    targetUserId,
    adminUserId,
    enabled,
    businessesCount: user.businesses.length,
  });

  return { userId: targetUserId, autoPayoutEnabled: updatedUser.autoPayoutEnabled };
}

/**
 * ADMIN: Settle a withdrawal manually (e.g. via direct corporate mobile banking transfer).
 * This allows administrators to fulfill payouts when Paystack Transfers float is empty,
 * recording the external bank session reference and permanently debiting the customer's wallet.
 */
export async function adminManualSettleWithdrawal(
  adminUserId: string,
  payoutId: string,
  params: { sessionReference: string; notes?: string }
) {
  const payout = await prisma.settlementPayout.findUnique({
    where: { id: payoutId },
    include: {
      business: {
        include: {
          user: {
            select: { id: true, email: true },
          },
        },
      },
    },
  });

  if (!payout) {
    throw new AppError(404, 'Withdrawal request not found', 'PAYOUT_NOT_FOUND');
  }

  const businessId = payout.businessId;
  const userId = payout.business.userId;

  // Allowed statuses:
  // - 'pending': normal approval queue, funds still locked
  // - 'failed': previous Paystack transfer failed (e.g. insufficient gateway balance)
  //
  // 'processing' is deliberately excluded. It means the transfer has already been
  // handed to Paystack and may settle at the bank at any moment; paying it out here
  // as well risks paying the merchant twice. Use Requery to learn its real outcome.
  if (payout.status === 'processing') {
    throw new AppError(
      409,
      'This withdrawal is already in flight at the payment gateway and cannot be settled manually. Use Requery to retrieve its final status.',
      'PAYOUT_IN_FLIGHT'
    );
  }

  if (!['pending', 'failed'].includes(payout.status)) {
    throw new AppError(
      400,
      `Cannot manually settle withdrawal with status '${payout.status}'. Only pending or failed requests can be settled.`,
      'INVALID_PAYOUT_STATUS'
    );
  }

  // Fenced transaction: PostgreSQL advisory lock + wallet settlement debit + payout record completion
  const updated = await prisma.$transaction(async (tx) => {
    // Fence 1: Advisory lock
    const [{ locked }] = await tx.$queryRaw<Array<{ locked: boolean }>>`
      SELECT pg_try_advisory_xact_lock(hashtextextended(${userId}::text, 0)) AS locked
    `;
    if (!locked) {
      throw new AppError(
        409,
        'Another transaction for this account is in progress. Please wait a moment and try again.',
        'WITHDRAWAL_IN_PROGRESS'
      );
    }

    // Fence 2: If the payout had status 'failed', the locked funds were released back to available balance.
    // We must verify that available balance is still sufficient to fulfill the debit.
    if (payout.status === 'failed') {
      const wallet = await tx.walletBalance.findUnique({ where: { userId } });
      const currentAvailable = wallet ? toNumber(wallet.balance) - toNumber(wallet.lockedBalance) : 0;
      const requiredDebit = toNumber(payout.amount);
      if (currentAvailable < requiredDebit) {
        throw new AppError(
          400,
          `User available balance (₦${currentAvailable.toLocaleString('en-NG', { minimumFractionDigits: 2 })}) is insufficient to fulfill this manual settlement (requires ₦${requiredDebit.toLocaleString('en-NG', { minimumFractionDigits: 2 })}).`,
          'INSUFFICIENT_FUNDS'
        );
      }
      // Re-reserve funds into lockedBalance so settlePayoutDebit decrements cleanly
      await WalletService.reserveFunds(
        {
          userId,
          amount: payout.amount,
          fee: 0,
          reference: payout.transferReference,
          linkedPayoutId: payout.id,
          description: `Manual settlement reservation for ${payout.business.businessName}`,
        },
        tx
      );
    }

    // Update payout to completed
    const updatedPayout = await tx.settlementPayout.update({
      where: { id: payout.id },
      data: {
        status: 'completed',
        completedAt: new Date(),
        adminApprovedBy: adminUserId,
        adminApprovedAt: new Date(),
        paystackTransferCode: `MANUAL:${params.sessionReference.trim()}`,
        failureReason: null,
        narration: params.notes ? `${payout.narration ? payout.narration + ' | ' : ''}Manual Settle: ${params.notes.trim()}` : payout.narration,
      },
    });

    // Execute wallet ledger debit
    await WalletService.settlePayoutDebit(
      {
        userId,
        businessId,
        amount: toNumber(payout.amount),
        fee: 0,
        reference: payout.transferReference,
        linkedPayoutId: payout.id,
        description: `Manual bank transfer settlement (${params.sessionReference.trim()})`,
        metadata: {
          settlementMethod: 'manual_transfer',
          sessionReference: params.sessionReference.trim(),
          adminUserId,
          notes: params.notes?.trim() || null,
        },
      },
      tx
    );

    await logAudit(
      {
        userId: adminUserId,
        businessId,
        action: 'settlement.manual_settled',
        resourceType: 'settlement_payout',
        resourceId: payout.id,
        newData: {
          amount: toNumber(payout.amount),
          fee: toNumber(payout.fee),
          netAmount: toNumber(payout.netAmount),
          sessionReference: params.sessionReference.trim(),
          transferReference: payout.transferReference,
          notes: params.notes?.trim() || null,
        },
      },
      tx
    );

    return updatedPayout;
  }, { maxWait: 10000, timeout: 20000 });

  // Post-commit event emission
  eventBus.emit('payout.completed', {
    userId,
    payoutId: payout.id,
    amount: toNumber(payout.amount),
    reference: payout.transferReference,
  });

  logger.info('Withdrawal settled manually by admin', {
    payoutId: payout.id,
    businessId,
    amount: toNumber(payout.amount),
    fee: toNumber(payout.fee),
    netAmount: toNumber(payout.netAmount),
    sessionReference: params.sessionReference.trim(),
    reference: payout.transferReference,
    adminUserId,
  });

  void createReminderOnce({
    businessId,
    reminderType: 'payout_approved',
    scheduledDate: new Date(),
    message: `Your withdrawal of ${formatNaira(toNumber(payout.netAmount))} has been settled via bank transfer (ref: ${params.sessionReference.trim()}).`,
    referenceType: 'settlement_payout',
    referenceId: payout.id,
  }).catch((remErr) =>
    logger.warn('Failed to create payout_approved reminder on manual settle', {
      payoutId: payout.id,
      err: remErr instanceof Error ? remErr.message : remErr,
    })
  );

  void emitToAdmins({
    type: 'withdrawal_status_changed',
    withdrawalId: payout.id,
    businessId: payout.businessId,
    businessName: payout.business.businessName,
    status: 'completed',
    amount: toNumber(payout.amount),
    timestamp: new Date().toISOString(),
  }).catch((emitErr) => {
    logger.warn('Failed to emit withdrawal_status_changed (manual-settled) to admins', { payoutId: payout.id, err: emitErr });
  });

  return updated;
}
