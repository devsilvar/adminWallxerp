import crypto from 'crypto';
import prisma, { TxClient } from '@/lib/prisma';
import logger from '@/lib/logger';
import { AppError } from '@/middleware/errorHandler';
import { logAudit } from '@/lib/audit';
import { verifyBusinessAccess } from '@/lib/ownership';
import { toNumber } from '@/shared/helpers';
import config from '@/config';
import {
  dispatchVoucherVerificationEmail,
  dispatchVoucherAdjustmentNotificationEmail,
} from '@/services/email-dispatch.service';
import {
  generateVoucherPin,
  hashVoucherPin,
} from '@/services/voucher-pin.service';
import { generateUniqueCardCode } from '@/services/customer-card.service';
import type {
  RequestTopUpInput,
  RequestAdjustmentInput,
  VoucherRequestsQuery,
} from '@/validators/customer-card.validator';

const TX_OPTIONS = {
  maxWait: 30000,
  timeout: process.env.NODE_ENV === 'test' ? 60000 : 30000,
};

const round2 = (n: number): number => Math.round(n * 100) / 100;

async function resolveBonusPct(
  tx: TxClient,
  businessId: string,
  customerId: string,
  overridePct?: number
): Promise<number> {
  if (overridePct !== undefined) {
    return Math.min(overridePct, config.voucher.maxBonusPct);
  }
  const [business, customer] = await Promise.all([
    tx.business.findUnique({ where: { id: businessId }, select: { voucherBonusPct: true } }),
    tx.customer.findUnique({ where: { id: customerId }, select: { voucherBonusPct: true } }),
  ]);
  const businessPct =
    business?.voucherBonusPct !== null && business?.voucherBonusPct !== undefined
      ? toNumber(business.voucherBonusPct as any)
      : 0;
  const customerRaw = (customer as any)?.voucherBonusPct;
  const customerPct =
    customerRaw !== null && customerRaw !== undefined ? toNumber(customerRaw as any) : null;
  const effective = customerPct !== null ? customerPct : businessPct;
  return Math.min(effective, config.voucher.maxBonusPct);
}

/**
 * Creates a top-up ledger request.
 * For sales_staff: status is ALWAYS pending.
 * For owner/manager: fast-lane moves directly to awaiting_customer with token generated.
 */
export async function createTopUpRequest(
  userId: string,
  businessId: string,
  customerId: string,
  input: RequestTopUpInput
) {
  const { role } = await verifyBusinessAccess(userId, businessId, 'customers.manage');

  const customer = await prisma.customer.findFirst({
    where: { id: customerId, businessId },
    include: { card: true },
  });

  if (!customer) {
    throw new AppError(404, 'Customer not found', 'CUSTOMER_NOT_FOUND');
  }

  // Ensure customer has an active virtual card
  let cardId = customer.card?.id;
  if (!cardId) {
    const plainPin = generateVoucherPin();
    const pinHash = await hashVoucherPin(plainPin);
    const cardCode = await generateUniqueCardCode(businessId);

    const card = await prisma.customerCard.create({
      data: {
        businessId,
        customerId: customer.id,
        cardCode,
        balance: 0,
        pinHash,
        pinAttempts: 0,
      },
    });
    cardId = card.id;
  }

  const effectivePct = await resolveBonusPct(prisma, businessId, customerId, input.bonusPct);
  const bonusAmount = round2((input.amount * effectivePct) / 100);

  const isManagerOrOwner = role === 'owner' || role === 'manager';

  let rawToken: string | null = null;
  let tokenHash: string | null = null;
  let expiresAt: Date | null = null;

  if (isManagerOrOwner) {
    rawToken = crypto.randomBytes(32).toString('hex');
    tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    expiresAt = new Date(Date.now() + config.voucher.verificationExpiryHours * 3600 * 1000);
  }

  const request = await prisma.voucherLedgerRequest.create({
    data: {
      businessId,
      customerId,
      cardId,
      kind: 'top_up',
      amount: input.amount,
      bonusPct: effectivePct,
      bonusAmount,
      status: isManagerOrOwner ? 'awaiting_customer' : 'pending',
      source: 'crm',
      createdBy: userId,
      authorizedBy: isManagerOrOwner ? userId : null,
      authorizedAt: isManagerOrOwner ? new Date() : null,
      verificationTokenHash: tokenHash,
      verificationExpiresAt: expiresAt,
      customerName: customer.name,
      customerPhone: customer.phone,
      customerEmail: customer.email,
      notes: input.notes?.trim() || null,
    },
  });

  await logAudit({
    userId,
    businessId,
    action: 'card.topup_requested',
    resourceType: 'voucher_ledger_request',
    resourceId: request.id,
    newData: {
      amount: input.amount,
      bonusPct: effectivePct,
      bonusAmount,
      status: request.status,
      customerId,
    },
  });

  // If fast-lane owner/manager created, dispatch verification link
  if (isManagerOrOwner && rawToken && customer.email) {
    const verifyUrl = `${config.publicUrls.apiBase}/verify-voucher/${request.id}?token=${rawToken}`;
    void dispatchVoucherVerificationEmail({
      businessId,
      customerId,
      requestId: request.id,
      amount: input.amount,
      bonusAmount,
      bonusPct: effectivePct,
      verifyUrl,
      toEmail: customer.email,
      customerName: customer.name,
      customerPhone: customer.phone,
    });
  }

  return {
    ...request,
    amount: toNumber(request.amount),
    bonusPct: request.bonusPct ? toNumber(request.bonusPct) : null,
    bonusAmount: request.bonusAmount ? toNumber(request.bonusAmount) : null,
  };
}

/**
 * Creates an adjustment request (credit >0 or deduction <0).
 * Status starts as pending.
 */
export async function createAdjustmentRequest(
  userId: string,
  businessId: string,
  customerId: string,
  input: RequestAdjustmentInput
) {
  await verifyBusinessAccess(userId, businessId, 'customers.manage');

  const customer = await prisma.customer.findFirst({
    where: { id: customerId, businessId },
    include: { card: true },
  });

  if (!customer) {
    throw new AppError(404, 'Customer not found', 'CUSTOMER_NOT_FOUND');
  }

  let cardId = customer.card?.id;
  if (!cardId) {
    const plainPin = generateVoucherPin();
    const pinHash = await hashVoucherPin(plainPin);
    const cardCode = await generateUniqueCardCode(businessId);

    const card = await prisma.customerCard.create({
      data: {
        businessId,
        customerId: customer.id,
        cardCode,
        balance: 0,
        pinHash,
        pinAttempts: 0,
      },
    });
    cardId = card.id;
  }

  const request = await prisma.voucherLedgerRequest.create({
    data: {
      businessId,
      customerId,
      cardId,
      kind: 'adjustment',
      amount: input.amount,
      status: 'pending',
      source: 'crm',
      createdBy: userId,
      customerName: customer.name,
      customerPhone: customer.phone,
      customerEmail: customer.email,
      notes: input.reason.trim(),
    },
  });

  await logAudit({
    userId,
    businessId,
    action: 'card.adjustment_requested',
    resourceType: 'voucher_ledger_request',
    resourceId: request.id,
    newData: {
      amount: input.amount,
      reason: input.reason.trim(),
      status: 'pending',
      customerId,
    },
  });

  return {
    ...request,
    amount: toNumber(request.amount),
    bonusPct: null,
    bonusAmount: null,
  };
}

/**
 * Authorize a pending voucher request:
 * - When amount > 0: moves to awaiting_customer, generates magic link token, dispatches verification email.
 * - When amount < 0: checks effective business threshold (manager <= threshold / owner > threshold),
 *   executes FOR UPDATE lock, decrements balance, creates ledger entry, updates status to applied,
 *   and dispatches notification email.
 */
export async function authorizeRequest(
  userId: string,
  businessId: string,
  requestId: string,
  opts?: { bypassReason?: string }
) {
  const { role } = await verifyBusinessAccess(userId, businessId);
  if (role !== 'owner' && role !== 'manager') {
    throw new AppError(403, 'Only managers and owners can authorize voucher requests', 'PERMISSION_DENIED');
  }

  const req = await prisma.voucherLedgerRequest.findFirst({
    where: { id: requestId, businessId },
    include: {
      customer: true,
      card: true,
    },
  });

  if (!req) {
    throw new AppError(404, 'Voucher request not found', 'REQUEST_NOT_FOUND');
  }

  if (req.status === 'verified' || req.status === 'applied') {
    throw new AppError(409, 'Voucher request has already been applied', 'REQUEST_ALREADY_APPLIED');
  }

  if (req.status === 'rejected') {
    throw new AppError(400, 'Cannot authorize a rejected voucher request', 'REQUEST_REJECTED');
  }

  if (req.status === 'expired') {
    throw new AppError(410, 'Voucher request has expired', 'REQUEST_EXPIRED');
  }

  const amountNum = toNumber(req.amount);

  // ─── Positive Request: Requires Customer Magic Link Verification ─────────
  if (amountNum > 0) {
    if (!req.customerEmail && !req.customerPhone && !opts?.bypassReason) {
      throw new AppError(
        409,
        'Customer contact (email or phone) is required for verification magic link',
        'CUSTOMER_CONTACT_REQUIRED'
      );
    }

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + config.voucher.verificationExpiryHours * 3600 * 1000);

    const updated = await prisma.voucherLedgerRequest.update({
      where: { id: req.id },
      data: {
        status: 'awaiting_customer',
        verificationTokenHash: tokenHash,
        verificationExpiresAt: expiresAt,
        authorizedBy: userId,
        authorizedAt: new Date(),
        rejectReason: null,
      },
    });

    await logAudit({
      userId,
      businessId,
      action: 'card.request_authorized',
      resourceType: 'voucher_ledger_request',
      resourceId: req.id,
      newData: {
        status: 'awaiting_customer',
        authorizedBy: userId,
        bypassReason: opts?.bypassReason || null,
      },
    });

    const verifyUrl = `${config.publicUrls.apiBase}/verify-voucher/${req.id}?token=${rawToken}`;

    void dispatchVoucherVerificationEmail({
      businessId,
      customerId: req.customerId,
      requestId: req.id,
      amount: amountNum,
      bonusAmount: req.bonusAmount ? toNumber(req.bonusAmount) : null,
      bonusPct: req.bonusPct ? toNumber(req.bonusPct) : null,
      verifyUrl,
      toEmail: req.customerEmail,
      customerName: req.customerName,
      customerPhone: req.customerPhone,
    });

    return {
      success: true,
      data: {
        ...updated,
        amount: toNumber(updated.amount),
        bonusPct: updated.bonusPct ? toNumber(updated.bonusPct) : null,
        bonusAmount: updated.bonusAmount ? toNumber(updated.bonusAmount) : null,
      },
      status: 'awaiting_customer',
      message: 'Voucher request authorized — verification link sent to customer',
      verifyUrl,
    };
  }

  // ─── Negative Request (Deduction): Instant Applied with Threshold Gate ────
  const biz = await prisma.business.findUnique({
    where: { id: businessId },
    select: { voucherAdjustmentThreshold: true },
  });

  const effectiveThreshold = Number(
    biz?.voucherAdjustmentThreshold !== null && biz?.voucherAdjustmentThreshold !== undefined
      ? biz.voucherAdjustmentThreshold
      : config.voucher.adjustmentThreshold
  );

  const deductionAmount = Math.abs(amountNum);

  if (deductionAmount > effectiveThreshold && role !== 'owner') {
    throw new AppError(
      403,
      'Adjustments exceeding the business threshold require owner approval',
      'ADJUSTMENT_REQUIRES_OWNER'
    );
  }

  if (!req.cardId) {
    throw new AppError(404, 'Customer card not found for balance deduction', 'CARD_NOT_FOUND');
  }

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
    const balanceAfter = currentBalance - deductionAmount;

    if (balanceAfter < 0) {
      throw new AppError(
        409,
        `Insufficient card balance for deduction. Available: ₦${currentBalance.toFixed(2)}, Deduction: ₦${deductionAmount.toFixed(2)}`,
        'INSUFFICIENT_CARD_BALANCE'
      );
    }

    // 1. Update CustomerCard balance
    const updatedCard = await tx.customerCard.update({
      where: { id: card.id },
      data: { balance: balanceAfter },
    });

    // 2. Insert CustomerCardLedger record
    const ledger = await tx.customerCardLedger.create({
      data: {
        cardId: card.id,
        type: 'adjustment',
        amount: deductionAmount,
        balanceBefore: currentBalance,
        balanceAfter,
        notes: req.notes,
        performedBy: req.createdBy,
      },
    });

    // 3. Mark VoucherLedgerRequest as applied
    const updatedReq = await tx.voucherLedgerRequest.update({
      where: { id: req.id },
      data: {
        status: 'applied',
        ledgerId: ledger.id,
        authorizedBy: userId,
        authorizedAt: new Date(),
        verificationTokenHash: null,
      },
    });

    await logAudit(
      {
        userId,
        businessId,
        action: 'card.adjustment_applied',
        resourceType: 'voucher_ledger_request',
        resourceId: req.id,
        newData: {
          deductionAmount,
          balanceBefore: currentBalance,
          balanceAfter,
          ledgerId: ledger.id,
          authorizedBy: userId,
        },
      },
      tx
    );

    return {
      updatedReq,
      updatedCard,
      ledger,
      balanceAfter,
    };
  }, TX_OPTIONS);

  // Post-commit: dispatch notification email to customer
  void dispatchVoucherAdjustmentNotificationEmail({
    businessId,
    customerId: req.customerId,
    amount: amountNum,
    reason: req.notes || 'Balance deduction',
    toEmail: req.customerEmail,
    customerName: req.customerName,
    customerPhone: req.customerPhone,
  });

  return {
    success: true,
    data: {
      ...result.updatedReq,
      amount: toNumber(result.updatedReq.amount),
      bonusPct: null,
      bonusAmount: null,
    },
    status: 'applied',
    balance: result.balanceAfter,
    message: 'Adjustment approved and applied immediately',
  };
}

/**
 * Rejects a pending or awaiting_customer voucher request.
 */
export async function rejectRequest(
  userId: string,
  businessId: string,
  requestId: string,
  input: { reason: string }
) {
  const { role } = await verifyBusinessAccess(userId, businessId);
  if (role !== 'owner' && role !== 'manager') {
    throw new AppError(403, 'Only managers and owners can reject voucher requests', 'PERMISSION_DENIED');
  }

  const req = await prisma.voucherLedgerRequest.findFirst({
    where: { id: requestId, businessId },
  });

  if (!req) {
    throw new AppError(404, 'Voucher request not found', 'REQUEST_NOT_FOUND');
  }

  if (req.status === 'verified' || req.status === 'applied') {
    throw new AppError(409, 'Cannot reject a request that has already been verified or applied', 'REQUEST_ALREADY_APPLIED');
  }

  const updated = await prisma.voucherLedgerRequest.update({
    where: { id: req.id },
    data: {
      status: 'rejected',
      rejectedBy: userId,
      rejectedAt: new Date(),
      rejectReason: input.reason.trim(),
      verificationTokenHash: null,
    },
  });

  await logAudit({
    userId,
    businessId,
    action: 'card.request_rejected',
    resourceType: 'voucher_ledger_request',
    resourceId: req.id,
    newData: {
      rejectReason: input.reason.trim(),
      rejectedBy: userId,
    },
  });

  return {
    ...updated,
    amount: toNumber(updated.amount),
    bonusPct: updated.bonusPct ? toNumber(updated.bonusPct) : null,
    bonusAmount: updated.bonusAmount ? toNumber(updated.bonusAmount) : null,
  };
}

/**
 * Resends the verification token link for requests currently in awaiting_customer status.
 */
export async function resendVerification(
  userId: string,
  businessId: string,
  requestId: string
) {
  const { role } = await verifyBusinessAccess(userId, businessId);
  if (role !== 'owner' && role !== 'manager') {
    throw new AppError(403, 'Only managers and owners can resend verification links', 'PERMISSION_DENIED');
  }

  const req = await prisma.voucherLedgerRequest.findFirst({
    where: { id: requestId, businessId },
  });

  if (!req) {
    throw new AppError(404, 'Voucher request not found', 'REQUEST_NOT_FOUND');
  }

  if (req.status !== 'awaiting_customer') {
    throw new AppError(400, 'Can only resend verification for requests awaiting customer confirmation', 'INVALID_REQUEST_STATUS');
  }

  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const expiresAt = new Date(Date.now() + config.voucher.verificationExpiryHours * 3600 * 1000);

  const updated = await prisma.voucherLedgerRequest.update({
    where: { id: req.id },
    data: {
      verificationTokenHash: tokenHash,
      verificationExpiresAt: expiresAt,
    },
  });

  const verifyUrl = `${config.publicUrls.apiBase}/verify-voucher/${req.id}?token=${rawToken}`;

  void dispatchVoucherVerificationEmail({
    businessId,
    customerId: req.customerId,
    requestId: req.id,
    amount: toNumber(req.amount),
    bonusAmount: req.bonusAmount ? toNumber(req.bonusAmount) : null,
    bonusPct: req.bonusPct ? toNumber(req.bonusPct) : null,
    verifyUrl,
    toEmail: req.customerEmail,
    customerName: req.customerName,
    customerPhone: req.customerPhone,
  });

  return {
    success: true,
    data: {
      ...updated,
      amount: toNumber(updated.amount),
      bonusPct: updated.bonusPct ? toNumber(updated.bonusPct) : null,
      bonusAmount: updated.bonusAmount ? toNumber(updated.bonusAmount) : null,
    },
    verifyUrl,
    message: 'Verification link resent to customer',
  };
}

/**
 * Lists voucher ledger requests with filtering and pagination.
 */
export async function listRequests(
  userId: string,
  businessId: string,
  query: VoucherRequestsQuery
) {
  await verifyBusinessAccess(userId, businessId, 'customers.read');

  const where: any = { businessId };

  if (query.status) {
    where.status = query.status;
  }
  if (query.kind) {
    where.kind = query.kind;
  }
  if (query.customerId) {
    where.customerId = query.customerId;
  }
  if (query.search && query.search.trim()) {
    const term = query.search.trim();
    where.OR = [
      { customerName: { contains: term, mode: 'insensitive' } },
      { customerEmail: { contains: term, mode: 'insensitive' } },
      { customerPhone: { contains: term } },
      { notes: { contains: term, mode: 'insensitive' } },
    ];
  }

  const page = query.page || 1;
  const limit = query.limit || 20;
  const skip = (page - 1) * limit;

  const [requests, total] = await Promise.all([
    prisma.voucherLedgerRequest.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        customer: { select: { id: true, name: true, phone: true, email: true } },
        card: { select: { id: true, cardCode: true, balance: true } },
        ledger: {
          select: {
            id: true,
            type: true,
            amount: true,
            balanceBefore: true,
            balanceAfter: true,
            createdAt: true,
          },
        },
      },
    }),
    prisma.voucherLedgerRequest.count({ where }),
  ]);

  const totalPages = Math.ceil(total / limit);

  return {
    data: requests.map((r) => ({
      ...r,
      amount: toNumber(r.amount),
      bonusPct: r.bonusPct ? toNumber(r.bonusPct) : null,
      bonusAmount: r.bonusAmount ? toNumber(r.bonusAmount) : null,
      card: r.card
        ? {
            ...r.card,
            balance: toNumber(r.card.balance),
          }
        : null,
      ledger: r.ledger
        ? {
            ...r.ledger,
            amount: toNumber(r.ledger.amount),
            balanceBefore: toNumber(r.ledger.balanceBefore),
            balanceAfter: toNumber(r.ledger.balanceAfter),
          }
        : null,
    })),
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
 * Gets a single voucher request by ID.
 */
export async function getRequest(
  userId: string,
  businessId: string,
  requestId: string
) {
  await verifyBusinessAccess(userId, businessId, 'customers.read');

  const req = await prisma.voucherLedgerRequest.findFirst({
    where: { id: requestId, businessId },
    include: {
      customer: { select: { id: true, name: true, phone: true, email: true } },
      card: { select: { id: true, cardCode: true, balance: true } },
      ledger: true,
    },
  });

  if (!req) {
    throw new AppError(404, 'Voucher request not found', 'REQUEST_NOT_FOUND');
  }

  return {
    ...req,
    amount: toNumber(req.amount),
    bonusPct: req.bonusPct ? toNumber(req.bonusPct) : null,
    bonusAmount: req.bonusAmount ? toNumber(req.bonusAmount) : null,
    card: req.card
      ? {
          ...req.card,
          balance: toNumber(req.card.balance),
        }
      : null,
    ledger: req.ledger
      ? {
          ...req.ledger,
          amount: toNumber(req.ledger.amount),
          balanceBefore: toNumber(req.ledger.balanceBefore),
          balanceAfter: toNumber(req.ledger.balanceAfter),
        }
      : null,
  };
}

export const voucherLedgerRequestService = {
  createTopUpRequest,
  createAdjustmentRequest,
  authorizeRequest,
  rejectRequest,
  resendVerification,
  listRequests,
  getRequest,
};
