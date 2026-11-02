import prisma from '@/lib/prisma';
import { PaymentStatus } from '@prisma/client';
import logger from '@/lib/logger';
import { logAudit } from '@/lib/audit';
import { getPaymentProvider } from '@/lib/payment';
import { WalletService } from '@/services/wallet.service';
import { toNumber } from '@/shared/helpers';
import { formatNaira } from '@/lib/format';
import { createReminderOnce } from '@/services/reminder.service';
import { emitToAdmins } from '@/services/admin/realtime-admin.helper';
import { eventBus } from '@/core/events/event-bus';
import { isAmbiguousTransferError } from '@/lib/payment/errors';
import { AppError } from '@/middleware/errorHandler';
import {
  dispatchWithdrawalRequestedEmail,
  dispatchWithdrawalCompletedEmail,
  dispatchWithdrawalFailedEmail,
  dispatchAdvanceWithdrawalEmail,
} from '@/services/email-dispatch.service';

export interface ExecuteInstantPayoutParams {
  userId: string;
  businessId: string;
  payoutId: string;
  initiator: 'merchant' | 'system';
}

export interface InstantPayoutResult {
  id: string;
  amount: number;
  fee: number;
  netAmount: number;
  transferReference: string;
  status: PaymentStatus;
  isAdvance?: boolean;
  destinationBankName: string;
  destinationAccountNum: string;
  destinationAccountName: string;
  initiatedAt: Date;
  completedAt: Date | null;
  message: string;
  fundingShortfall?: boolean;
}

/**
 * Shared Payout Executor (D9)
 *
 * Executes instant payout transfer via Paystack:
 * 1. Resolves/creates transfer recipient.
 * 2. Checks live gateway balance. If short, routes to 'pending' with 'funding_shortfall'
 *    (the admin funding queue — NOT an approval queue).
 * 3. Dispatches transfer via provider.
 * 4. If immediately completed, settles ledger debit atomically.
 * 5. Handles ambiguous errors vs deterministic rejections.
 * 6. Emits realtime and audit events.
 */
export async function executeInstantPayout(
  params: ExecuteInstantPayoutParams
): Promise<InstantPayoutResult> {
  const { userId, businessId, payoutId, initiator } = params;

  const payout = await prisma.settlementPayout.findUnique({
    where: { id: payoutId },
    include: {
      business: {
        select: { businessName: true },
      },
    },
  });

  if (!payout) {
    throw new Error(`Payout record ${payoutId} not found`);
  }

  const businessName = payout.business?.businessName || 'Business';
  const provider = getPaymentProvider();

  // 1. Resolve or create transfer recipient
  const recipient = await provider.createTransferRecipient({
    type: 'nuban',
    name: payout.destinationAccountName,
    accountNumber: payout.destinationAccountNum,
    bankCode: payout.destinationBankCode,
    currency: 'NGN',
    description: `Payout for ${businessName}`,
  });

  const transferAmount =
    toNumber(payout.netAmount) > 0 ? toNumber(payout.netAmount) : toNumber(payout.amount);

  // 2. Live Paystack Gateway Balance Guard
  const balanceCheck = await WalletService.checkLivePaystackBalance(transferAmount);
  if (!balanceCheck.canPayout) {
    logger.warn('Paystack live gateway balance insufficient — queuing in admin funding shortfall queue', {
      payoutId: payout.id,
      required: transferAmount,
      deficit: balanceCheck.deficit,
      initiator,
    });

    const queuedPayout = await prisma.settlementPayout.update({
      where: { id: payout.id },
      data: {
        status: 'pending',
        failureReason: `Funding shortfall: gateway balance deficit ₦${balanceCheck.deficit.toLocaleString('en-NG')}`,
      },
    });

    logAudit({
      userId,
      businessId,
      action: payout.isAdvance ? 'settlement.advance_funding_shortfall' : 'settlement.funding_shortfall_queued',
      resourceType: 'settlement_payout',
      resourceId: payout.id,
      newData: {
        isAdvance: payout.isAdvance,
        amount: toNumber(payout.amount),
        fee: toNumber(payout.fee),
        netAmount: toNumber(payout.netAmount),
        transferReference: payout.transferReference,
        initiator,
        mode: 'queued_due_to_gateway_balance_shortfall',
      },
    });

    void createReminderOnce({
      businessId,
      reminderType: payout.isAdvance ? 'advance_withdrawal' : 'payout_requested',
      scheduledDate: new Date(),
      message: payout.isAdvance
        ? `Advance request of ${formatNaira(transferAmount)} received (ref ${payout.transferReference}). Processing queued — funds will transfer shortly.`
        : `Withdrawal request of ${formatNaira(transferAmount)} received (ref ${payout.transferReference}). Processing queued — funds will transfer shortly.`,
      referenceType: 'settlement_payout',
      referenceId: payout.id,
    }).catch(() => {});

    void emitToAdmins({
      type: 'withdrawal_created',
      withdrawalId: queuedPayout.id,
      businessId,
      businessName,
      amount: toNumber(queuedPayout.amount),
      timestamp: new Date().toISOString(),
    }).catch((err) =>
      logger.warn('Failed to emit withdrawal_created to admins', { payoutId: queuedPayout.id, err })
    );

    return {
      id: queuedPayout.id,
      amount: toNumber(queuedPayout.amount),
      fee: toNumber(queuedPayout.fee),
      netAmount: toNumber(queuedPayout.netAmount),
      transferReference: queuedPayout.transferReference,
      status: 'pending',
      isAdvance: queuedPayout.isAdvance,
      destinationBankName: queuedPayout.destinationBankName,
      destinationAccountNum: queuedPayout.destinationAccountNum,
      destinationAccountName: queuedPayout.destinationAccountName,
      initiatedAt: queuedPayout.initiatedAt,
      completedAt: null,
      message: 'Withdrawal transfer queued. Processing shortly.',
      fundingShortfall: true,
    };
  }

  // 3. Initiate transfer through payment provider
  try {
    const transferResult = await provider.initiateTransfer({
      source: 'balance',
      amount: transferAmount,
      recipient: recipient.recipientCode,
      reason: payout.narration || `Payout for ${businessName}`,
      reference: payout.transferReference,
    });

    const isComplete =
      transferResult.status === 'success' || transferResult.status === 'completed';

    const updated = await prisma.settlementPayout.update({
      where: { id: payout.id },
      data: {
        paystackTransferCode: transferResult.transferCode,
        ...(isComplete ? { status: 'completed', completedAt: new Date() } : { status: 'processing' }),
        adminApprovedBy: initiator === 'system' ? 'SYSTEM_AUTO_SWEEP' : 'ON_DEMAND_MERCHANT_PIN',
        adminApprovedAt: new Date(),
      },
    });

    if (isComplete) {
      if (payout.isAdvance) {
        await WalletService.settleAdvanceDebit({
          userId,
          businessId,
          amount: toNumber(payout.netAmount),
          fee: toNumber(payout.fee),
          reference: payout.transferReference,
          linkedPayoutId: payout.id,
          description: `Advance payout completed for ${businessName}`,
        });
      } else {
        await WalletService.settlePayoutDebit({
          userId,
          businessId,
          amount: toNumber(payout.amount),
          fee: 0,
          reference: payout.transferReference,
          linkedPayoutId: payout.id,
          description: `Payout completed for ${businessName}`,
        });
      }

      eventBus.emit('payout.completed', {
        userId,
        payoutId: payout.id,
        amount: toNumber(payout.amount),
        reference: payout.transferReference,
      });

      void emitToAdmins({
        type: 'withdrawal_status_changed',
        withdrawalId: updated.id,
        businessId,
        businessName,
        status: 'completed',
        amount: toNumber(updated.amount),
        timestamp: new Date().toISOString(),
      }).catch((emitErr) =>
        logger.warn('Failed to emit status changed to admins', { payoutId: updated.id, err: emitErr })
      );
    } else {
      void emitToAdmins({
        type: 'withdrawal_created',
        withdrawalId: payout.id,
        businessId,
        businessName,
        amount: toNumber(payout.amount),
        timestamp: new Date().toISOString(),
      }).catch((emitErr) =>
        logger.warn('Failed to emit creation event to admins', { payoutId: payout.id, err: emitErr })
      );
    }

    logAudit({
      userId,
      businessId,
      action: payout.isAdvance
        ? 'settlement.advance_executed'
        : (initiator === 'system' ? 'settlement.auto_payout_executed' : 'settlement.instant_payout_executed'),
      resourceType: 'settlement_payout',
      resourceId: payout.id,
      newData: {
        isAdvance: payout.isAdvance,
        amount: toNumber(payout.amount),
        fee: toNumber(payout.fee),
        netAmount: toNumber(payout.netAmount),
        transferredToBank: transferAmount,
        transferReference: payout.transferReference,
        paystackTransferCode: transferResult.transferCode,
        initiator,
      },
    });

    logger.info('Payout executed and transfer initiated', {
      payoutId: payout.id,
      businessId,
      amount: toNumber(payout.amount),
      fee: toNumber(payout.fee),
      transferredToBank: transferAmount,
      reference: payout.transferReference,
      initiator,
    });

    void createReminderOnce({
      businessId,
      reminderType: payout.isAdvance ? 'advance_withdrawal' : 'payout_approved',
      scheduledDate: new Date(),
      message: payout.isAdvance
        ? `Your advance of ${formatNaira(transferAmount)} (ref ${payout.transferReference}) has been processed${
            toNumber(payout.fee) > 0 ? ` (fee ${formatNaira(toNumber(payout.fee))})` : ''
          }. The transfer to your ${payout.destinationBankName} account ••••${payout.destinationAccountNum.slice(-4)} is in progress.`
        : `Your withdrawal of ${formatNaira(transferAmount)} (ref ${payout.transferReference}) has been processed${
            toNumber(payout.fee) > 0 ? ` (fee ${formatNaira(toNumber(payout.fee))})` : ''
          }. The transfer to your ${payout.destinationBankName} account ••••${payout.destinationAccountNum.slice(-4)} is in progress.`,
      referenceType: 'settlement_payout',
      referenceId: payout.id,
    }).catch((remErr) =>
      logger.warn('Failed to create reminder', {
        payoutId: payout.id,
        err: remErr instanceof Error ? remErr.message : remErr,
      })
    );

    if (updated.status === 'completed') {
      if (payout.isAdvance) {
        void dispatchAdvanceWithdrawalEmail(updated.id);
      } else {
        void dispatchWithdrawalCompletedEmail(updated.id);
      }
    } else {
      if (payout.isAdvance) {
        void dispatchAdvanceWithdrawalEmail(updated.id);
      } else {
        void dispatchWithdrawalRequestedEmail(updated.id);
      }
    }

    return {
      id: updated.id,
      amount: toNumber(updated.amount),
      fee: toNumber(updated.fee),
      netAmount: toNumber(updated.netAmount),
      transferReference: updated.transferReference,
      status: updated.status,
      isAdvance: updated.isAdvance,
      destinationBankName: updated.destinationBankName,
      destinationAccountNum: updated.destinationAccountNum,
      destinationAccountName: updated.destinationAccountName,
      initiatedAt: updated.initiatedAt,
      completedAt: updated.completedAt,
      message: updated.isAdvance
        ? (isComplete
            ? 'Advance payout completed successfully.'
            : `Advance of ${formatNaira(toNumber(updated.netAmount))} is in progress (fee ${formatNaira(
                toNumber(updated.fee)
              )}, total debited ${formatNaira(toNumber(updated.amount))}). Transfer to your bank is processing.`)
        : (toNumber(updated.fee) > 0
            ? `Withdrawal of ${formatNaira(toNumber(updated.netAmount))} is in progress (fee ${formatNaira(
                toNumber(updated.fee)
              )}, total debited ${formatNaira(toNumber(updated.amount))}). Transfer to your bank is processing.`
            : `Withdrawal of ${formatNaira(toNumber(updated.netAmount))} is in progress. Transfer to your bank is processing.`),
    };
  } catch (err) {
    try {
      if (isAmbiguousTransferError(err)) {
        await prisma.settlementPayout.update({
          where: { id: payout.id },
          data: {
            status: 'processing',
            failureReason: `Gateway timeout / network error during payout transfer. Awaiting automated reconciliation. Original error: ${err instanceof Error ? err.message : String(err)}`,
            updatedAt: new Date(),
          },
        });

        logger.error('[PAYOUT_TRANSFER_AMBIGUOUS] Payout transfer status uncertain — funds remain locked', {
          payoutId: payout.id,
          businessId,
          transferReference: payout.transferReference,
          error: err instanceof Error ? err.message : String(err),
        });

        logAudit({
          userId,
          businessId,
          action: payout.isAdvance ? 'settlement.advance_transfer_ambiguous' : 'settlement.payout_transfer_ambiguous',
          resourceType: 'settlement_payout',
          resourceId: payout.id,
          newData: {
            isAdvance: payout.isAdvance,
            transferReference: payout.transferReference,
            reason: err instanceof Error ? err.message : String(err),
          },
        });

        void createReminderOnce({
          businessId,
          reminderType: payout.isAdvance ? 'advance_withdrawal' : 'payout_failed',
          scheduledDate: new Date(),
          message: payout.isAdvance
            ? `Your advance of ${formatNaira(transferAmount)} is being verified — the transfer was submitted but we're confirming the status with the bank. This usually resolves within 15 minutes. Your funds remain secure.`
            : `Your withdrawal of ${formatNaira(toNumber(payout.amount))} is being verified — the transfer was submitted but we're confirming the status with the bank. This usually resolves within 15 minutes. Your funds remain secure.`,
          referenceType: 'settlement_payout',
          referenceId: payout.id,
        }).catch((remErr) =>
          logger.warn('Failed to create ambiguous-transfer reminder', { payoutId: payout.id, err: remErr })
        );

        void emitToAdmins({
          type: 'withdrawal_status_changed',
          withdrawalId: payout.id,
          businessId,
          businessName,
          status: 'processing',
          amount: toNumber(payout.amount),
          failureReason: `Gateway timeout / network error during payout transfer`,
          timestamp: new Date().toISOString(),
        }).catch((emitErr) =>
          logger.warn('Failed to emit withdrawal_status_changed to admins', { payoutId: payout.id, err: emitErr })
        );

        throw new AppError(
          504,
          'Transfer was submitted to the payment gateway but response timed out. The payout is marked as processing and will be auto-reconciled within 15 minutes.',
          'TRANSFER_AMBIGUOUS',
          { payoutId: payout.id, transferReference: payout.transferReference }
        );
      } else {
        await prisma.settlementPayout.update({
          where: { id: payout.id },
          data: {
            status: 'failed',
            failureReason: err instanceof Error ? err.message : String(err),
            needsReconciliation: true,
            reconciliationReason: `Initiation rejection: ${err instanceof Error ? err.message : String(err)}`,
          },
        });

        // D6: DO NOT release locked funds automatically. Funds remain locked awaiting administrator reconciliation decision.

        logAudit({
          userId,
          businessId,
          action: payout.isAdvance ? 'settlement.advance_failed' : 'settlement.instant_payout_failed',
          resourceType: 'settlement_payout',
          resourceId: payout.id,
          newData: {
            isAdvance: payout.isAdvance,
            transferReference: payout.transferReference,
            reason: err instanceof Error ? err.message : String(err),
          },
        });

        eventBus.emit('payout.failed', {
          userId,
          payoutId: payout.id,
          amount: toNumber(payout.amount),
          reference: payout.transferReference,
          reason: err instanceof Error ? err.message : String(err),
          isRejection: false,
        });

        void createReminderOnce({
          businessId,
          reminderType: payout.isAdvance ? 'advance_withdrawal' : 'payout_failed',
          scheduledDate: new Date(),
          message: payout.isAdvance
            ? `The transfer for your advance of ${formatNaira(transferAmount)} could not be completed. The amount is held in your wallet while we review the transfer — we'll let you know the outcome.`
            : `The transfer for your withdrawal of ${formatNaira(toNumber(payout.amount))} could not be completed. The amount is held in your wallet while we review the transfer — we'll let you know the outcome.`,
          referenceType: 'settlement_payout',
          referenceId: payout.id,
        }).catch((remErr) =>
          logger.warn('Failed to create payout_failed reminder', { payoutId: payout.id, err: remErr })
        );

        void emitToAdmins({
          type: 'withdrawal_status_changed',
          withdrawalId: payout.id,
          businessId,
          businessName,
          status: 'failed',
          amount: toNumber(payout.amount),
          failureReason: err instanceof Error ? err.message : String(err),
          timestamp: new Date().toISOString(),
        }).catch((emitErr) =>
          logger.warn('Failed to emit withdrawal_status_changed to admins', { payoutId: payout.id, err: emitErr })
        );

        if (!payout.isAdvance) {
          void dispatchWithdrawalFailedEmail(
            payout.id,
            err instanceof Error ? err.message : 'Gateway error',
            false
          );
        }

        throw new AppError(
          502,
          `Transfer failed: ${err instanceof Error ? err.message : 'Gateway error'}. Funds are held pending settlement review.`,
          'TRANSFER_FAILED'
        );
      }
    } catch (markErr) {
      if (
        markErr instanceof AppError &&
        (markErr.code === 'TRANSFER_AMBIGUOUS' || markErr.code === 'TRANSFER_FAILED')
      ) {
        throw markErr;
      }
      logger.error('Failed to handle payout error after transfer attempt', {
        payoutId: payout.id,
        originalError: err instanceof Error ? err.message : String(err),
        markError: markErr instanceof Error ? markErr.message : String(markErr),
      });
      throw err;
    }
  }
}
