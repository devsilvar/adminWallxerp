import crypto from 'crypto';
import prisma from '@/lib/prisma';
import logger from '@/lib/logger';
import { AppError } from '@/middleware/errorHandler';
import { logAudit } from '@/lib/audit';
import { assertMonthNotLocked, toNumber } from '@/shared/helpers';
import { formatNaira } from '@/lib/format';
import { dispatchVoucherNotificationEmail } from '@/services/email-dispatch.service';

const TX_OPTIONS = {
  maxWait: 30000,
  timeout: process.env.NODE_ENV === 'test' ? 60000 : 30000,
};

/**
 * Validates a raw magic link token against the SHA-256 hash stored in the DB
 * using constant-time comparison to prevent timing attacks.
 */
function validateTokenHash(rawToken: string, storedHash: string | null): void {
  if (!rawToken || !rawToken.trim()) {
    throw new AppError(400, 'Verification token is required', 'TOKEN_REQUIRED');
  }

  if (!storedHash) {
    throw new AppError(401, 'Invalid or expired verification token', 'INVALID_TOKEN');
  }

  const computedHash = crypto.createHash('sha256').update(rawToken.trim()).digest('hex');
  const computedBuf = Buffer.from(computedHash, 'utf8');
  const storedBuf = Buffer.from(storedHash, 'utf8');

  if (
    computedBuf.length !== storedBuf.length ||
    !crypto.timingSafeEqual(computedBuf, storedBuf)
  ) {
    throw new AppError(401, 'Invalid verification token', 'INVALID_TOKEN');
  }
}

/**
 * Retrieves public preview information for a voucher credit magic link.
 */
export async function getPreview(
  requestId: string,
  rawToken: string,
  businessId?: string
) {
  const req = await prisma.voucherLedgerRequest.findUnique({
    where: { id: requestId },
    include: {
      business: {
        select: {
          id: true,
          businessName: true,
          address: true,
          city: true,
          state: true,
        },
      },
      customer: {
        select: {
          id: true,
          name: true,
          phone: true,
          email: true,
        },
      },
      card: {
        select: {
          id: true,
          cardCode: true,
          balance: true,
        },
      },
    },
  });

  if (!req) {
    throw new AppError(404, 'Voucher request not found', 'REQUEST_NOT_FOUND');
  }

  if (businessId && req.businessId !== businessId) {
    throw new AppError(404, 'Voucher request not found', 'REQUEST_NOT_FOUND');
  }

  // Token validation
  validateTokenHash(rawToken, req.verificationTokenHash);

  // Status checks
  if (req.status === 'verified' || req.status === 'applied') {
    throw new AppError(
      409,
      'This voucher request has already been verified and credited',
      'ALREADY_VERIFIED'
    );
  }

  if (req.status === 'expired' || (req.verificationExpiresAt && req.verificationExpiresAt < new Date())) {
    throw new AppError(410, 'This verification link has expired', 'LINK_EXPIRED');
  }

  if (req.status === 'rejected') {
    throw new AppError(400, 'This voucher request has been rejected', 'REQUEST_REJECTED');
  }

  if (req.status !== 'awaiting_customer') {
    throw new AppError(
      400,
      `Voucher request is not awaiting verification (status: ${req.status})`,
      'INVALID_STATUS'
    );
  }

  const amountNum = toNumber(req.amount);
  const bonusAmountNum = req.bonusAmount ? toNumber(req.bonusAmount) : 0;
  const totalCredit = amountNum + bonusAmountNum;

  return {
    id: req.id,
    businessId: req.businessId,
    businessName: req.business?.businessName || 'Store',
    customerId: req.customerId,
    customerName: req.customerName,
    customerPhone: req.customerPhone,
    customerEmail: req.customerEmail,
    cardId: req.cardId,
    cardCode: req.card?.cardCode || null,
    cardBalance: req.card ? toNumber(req.card.balance) : 0,
    kind: req.kind,
    amount: amountNum,
    bonusPct: req.bonusPct ? toNumber(req.bonusPct) : null,
    bonusAmount: req.bonusAmount ? toNumber(req.bonusAmount) : null,
    totalCredit,
    notes: req.notes,
    expiresAt: req.verificationExpiresAt,
  };
}

/**
 * Confirms customer verification for a voucher top-up or credit.
 * Replay protection: if already verified/applied, returns 200 with already_verified: true.
 */
export async function confirm(
  requestId: string,
  rawToken: string,
  businessId?: string
) {
  const req = await prisma.voucherLedgerRequest.findUnique({
    where: { id: requestId },
    include: {
      business: {
        select: {
          id: true,
          businessName: true,
          address: true,
        },
      },
      customer: {
        select: {
          id: true,
          name: true,
          phone: true,
          email: true,
        },
      },
      card: true,
    },
  });

  if (!req) {
    throw new AppError(404, 'Voucher request not found', 'REQUEST_NOT_FOUND');
  }

  if (businessId && req.businessId !== businessId) {
    throw new AppError(404, 'Voucher request not found', 'REQUEST_NOT_FOUND');
  }

  // Idempotency / Replay protection:
  // If already verified or applied, return success with already_verified = true
  if (req.status === 'verified' || req.status === 'applied') {
    const cardBalance = req.card ? toNumber(req.card.balance) : 0;
    return {
      success: true,
      already_verified: true,
      balance: cardBalance,
      message: 'This voucher credit has already been verified and applied to your card',
      data: {
        id: req.id,
        status: req.status,
        cardId: req.cardId,
        balanceAfter: cardBalance,
      },
    };
  }

  // Token validation
  validateTokenHash(rawToken, req.verificationTokenHash);

  // Status checks
  if (req.status === 'expired' || (req.verificationExpiresAt && req.verificationExpiresAt < new Date())) {
    throw new AppError(410, 'This verification link has expired', 'LINK_EXPIRED');
  }

  if (req.status === 'rejected') {
    throw new AppError(400, 'This voucher request has been rejected', 'REQUEST_REJECTED');
  }

  if (req.status !== 'awaiting_customer') {
    throw new AppError(
      400,
      `Cannot confirm voucher request in status "${req.status}"`,
      'INVALID_STATUS'
    );
  }

  if (!req.cardId) {
    throw new AppError(404, 'Customer virtual card not found for this request', 'CARD_NOT_FOUND');
  }

  // Invariant 2: Month-lock guard
  await assertMonthNotLocked(req.businessId, new Date());

  const result = await prisma.$transaction(async (tx) => {
    // Acquire row-level lock on card
    await tx.$queryRaw`SELECT id FROM customer_cards WHERE id = ${req.cardId} FOR UPDATE`;

    const card = await tx.customerCard.findUnique({
      where: { id: req.cardId! },
    });

    if (!card) {
      throw new AppError(404, 'Customer card not found', 'CARD_NOT_FOUND');
    }

    const currentBalance = toNumber(card.balance);
    const amountNum = toNumber(req.amount);
    const bonusAmountNum = req.bonusAmount ? toNumber(req.bonusAmount) : 0;
    const totalCredit = amountNum + bonusAmountNum;
    const balanceAfter = currentBalance + totalCredit;

    // 1. Update card balance
    const updatedCard = await tx.customerCard.update({
      where: { id: card.id },
      data: { balance: balanceAfter },
    });

    // 2. Create customer card ledger entry
    const ledger = await tx.customerCardLedger.create({
      data: {
        cardId: card.id,
        type: req.kind === 'top_up' ? 'top_up' : 'adjustment',
        amount: totalCredit,
        bonusAmount: bonusAmountNum > 0 ? bonusAmountNum : null,
        bonusPct: req.bonusPct ? toNumber(req.bonusPct) : null,
        balanceBefore: currentBalance,
        balanceAfter,
        notes: req.notes || `Customer verified ${req.kind.replace('_', ' ')}`,
        performedBy: req.authorizedBy || req.createdBy,
      },
    });

    // 3. Mark request as verified
    const updatedReq = await tx.voucherLedgerRequest.update({
      where: { id: req.id },
      data: {
        status: 'verified',
        ledgerId: ledger.id,
        verifiedAt: new Date(),
        verificationTokenHash: null, // Wipe token to prevent reuse
      },
    });

    // 4. Audit log inside transaction
    await logAudit(
      {
        userId: req.authorizedBy || req.createdBy,
        businessId: req.businessId,
        action: 'card.request_verified',
        resourceType: 'voucher_ledger_request',
        resourceId: req.id,
        newData: {
          totalCredit,
          amount: amountNum,
          bonusAmount: bonusAmountNum,
          balanceBefore: currentBalance,
          balanceAfter,
          ledgerId: ledger.id,
          status: 'verified',
        },
      },
      tx
    );

    return {
      updatedReq,
      updatedCard,
      ledger,
      balanceAfter,
      totalCredit,
      amountNum,
      bonusAmountNum,
    };
  }, TX_OPTIONS);

  // Post-commit: dispatch notification email
  void dispatchVoucherNotificationEmail({
    businessId: req.businessId,
    customerId: req.customerId,
    customerName: req.customerName,
    toEmail: req.customerEmail,
    balance: result.balanceAfter,
    actionType: 'top_up',
    amount: result.amountNum,
    bonusAmount: result.bonusAmountNum > 0 ? result.bonusAmountNum : null,
    bonusPct: req.bonusPct ? toNumber(req.bonusPct) : null,
    notes: req.notes,
  });

  return {
    success: true,
    already_verified: false,
    balance: result.balanceAfter,
    totalCredit: result.totalCredit,
    message: 'Voucher balance successfully verified and activated',
    data: {
      id: req.id,
      status: 'verified',
      cardId: req.cardId,
      balanceAfter: result.balanceAfter,
      totalCredit: result.totalCredit,
    },
  };
}

export const voucherVerificationService = {
  getPreview,
  confirm,
};
