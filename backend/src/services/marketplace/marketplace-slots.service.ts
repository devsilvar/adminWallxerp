import crypto from 'crypto';
import { Readable } from 'stream';
import { v2 as cloudinary } from 'cloudinary';
import { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import config from '@/config';
import logger from '@/lib/logger';
import { AppError } from '@/middleware/errorHandler';
import { verifyBusinessAccess } from '@/lib/ownership';
import { WalletService } from '@/services/wallet/wallet.service';
import { logAudit } from '@/lib/audit';
import { sendEmail } from '@/lib/email';
import { assertAllowanceNotBelowLiveProducts } from '@/services/marketplace/marketplace.service';
import {
  generateSlotPurchaseReceiptHtml,
  generateSlotPurchaseReceiptText,
} from '@/lib/email/templates/slot-purchase-receipt';

/**
 * Dedicated transaction isolation options for wallet debit operations.
 * Declared locally to avoid reaching into another module's internals.
 */
export const TX_OPTIONS = { maxWait: 15000, timeout: 30000 };

export interface PurchaseSlotsViaWalletParams {
  userId: string;
  businessId: string;
  slots: number;
  idempotencyKey?: string;
  metadata?: {
    ipAddress?: string;
    userAgent?: string;
  };
}

export interface SlotReceiptEmailParams {
  toEmail?: string | null;
  ownerName: string;
  businessName: string;
  slots: number;
  unitPrice: number;
  amount: number;
  reference: string;
  newAllowance: number;
}

/**
 * Dispatches receipt email asynchronously after successful transaction commit.
 */
export async function dispatchSlotPurchaseReceiptEmail(params: SlotReceiptEmailParams) {
  if (!params.toEmail) return { delivered: false };

  try {
    const formattedUnit = `NGN ${params.unitPrice.toLocaleString('en-NG', { minimumFractionDigits: 2 })}`;
    const formattedAmount = `NGN ${params.amount.toLocaleString('en-NG', { minimumFractionDigits: 2 })}`;
    const nowFormatted = new Date().toLocaleDateString('en-NG', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    const html = generateSlotPurchaseReceiptHtml({
      ownerName: params.ownerName,
      businessName: params.businessName,
      slots: params.slots,
      unitPriceFormatted: formattedUnit,
      amountFormatted: formattedAmount,
      paymentReference: params.reference,
      paymentDate: nowFormatted,
      newAllowance: params.newAllowance,
    });

    const text = generateSlotPurchaseReceiptText({
      ownerName: params.ownerName,
      businessName: params.businessName,
      slots: params.slots,
      unitPriceFormatted: formattedUnit,
      amountFormatted: formattedAmount,
      paymentReference: params.reference,
      paymentDate: nowFormatted,
      newAllowance: params.newAllowance,
    });

    const result = await sendEmail({
      to: params.toEmail,
      subject: `Receipt: +${params.slots} Listing Slot${params.slots === 1 ? '' : 's'} Unlocked - ${params.businessName}`,
      html,
      text,
    });

    return result;
  } catch (err: unknown) {
    logger.warn('[marketplace-slots] Failed to dispatch slot purchase receipt email', {
      error: err instanceof Error ? err.message : String(err),
      toEmail: params.toEmail,
    });
    return { delivered: false };
  }
}

/**
 * Purchase additional marketplace listing slots via merchant wallet debit.
 * Atomic debit + advisory locked allowance raise + audit log.
 */
export async function purchaseSlotsViaWallet(params: PurchaseSlotsViaWalletParams) {
  const { userId, businessId, slots, idempotencyKey, metadata } = params;

  if (!slots || slots < 1 || !Number.isInteger(slots)) {
    throw new AppError(400, 'Slots must be a positive integer', 'INVALID_SLOTS');
  }

  // 1. Verify caller has access to the business
  const { business } = await verifyBusinessAccess(userId, businessId);

  // 2. Price calculation server-side from configuration (fail closed on misconfiguration)
  const unitPrice = Number(config.marketplace.slotUnitPrice);
  if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
    throw new AppError(
      503,
      'Marketplace slot pricing is not configured',
      'SLOT_PRICING_NOT_CONFIGURED'
    );
  }
  const amountDec = new Prisma.Decimal(unitPrice).mul(slots);
  const totalAmount = amountDec.toNumber();

  // 3. Fast-path check on existing idempotencyKey before transaction
  if (idempotencyKey) {
    const existing = await prisma.marketplaceSlotPurchase.findUnique({
      where: { idempotencyKey },
      include: {
        business: {
          select: {
            id: true,
            businessName: true,
            marketplaceSlotAllowance: true,
          },
        },
      },
    });

    if (existing) {
      return {
        purchase: existing,
        newAllowance: existing.business.marketplaceSlotAllowance,
        alreadyProcessed: true,
        message: 'Slot purchase previously completed',
      };
    }
  }

  const ownerUserId = business.userId;
  const walletRef = `WTX-SLOT-${Date.now()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
  const walletIdempotencyKey = idempotencyKey
    ? `slot-wallet:${idempotencyKey}`
    : `slot-wallet:${walletRef}`;

  try {
    const result = await prisma.$transaction(async (tx) => {
      // 4. Ensure owner wallet exists
      await WalletService.getOrCreateWallet(ownerUserId, tx);

      // 5. Serialize concurrent balance evaluations using PostgreSQL row-level lock
      if (typeof (tx as any).$queryRaw === 'function') {
        await (tx as any).$queryRaw`SELECT id FROM wallet_balances WHERE user_id = ${ownerUserId} FOR UPDATE`;
      }

      const wallet = await tx.walletBalance.findUnique({
        where: { userId: ownerUserId },
      });
      if (!wallet) {
        throw new AppError(404, 'Wallet not found', 'WALLET_NOT_FOUND');
      }

      const available = new Prisma.Decimal(wallet.balance).minus(new Prisma.Decimal(wallet.lockedBalance));

      if (available.lt(amountDec)) {
        throw new AppError(
          402,
          `Insufficient available wallet balance. Available: ₦${available.toNumber().toLocaleString('en-NG', { minimumFractionDigits: 2 })}, Required: ₦${amountDec.toNumber().toLocaleString('en-NG', { minimumFractionDigits: 2 })}`,
          'INSUFFICIENT_WALLET_BALANCE'
        );
      }

      // 6. Debit owner's central wallet
      const updatedWallet = await tx.walletBalance.update({
        where: { userId: ownerUserId },
        data: {
          balance: { decrement: amountDec },
          version: { increment: 1 },
          updatedAt: new Date(),
        },
      });

      // 7. Write debit ledger row
      const walletTx = await tx.walletTransaction.create({
        data: {
          walletId: updatedWallet.id,
          userId: ownerUserId,
          businessId,
          type: 'debit',
          amount: amountDec,
          fee: new Prisma.Decimal(0),
          netAmount: amountDec.negated(),
          balanceAfter: updatedWallet.balance,
          reference: walletRef,
          source: 'marketplace_slot',
          description: `Purchase of ${slots} marketplace listing slot${slots === 1 ? '' : 's'}`,
          idempotencyKey: walletIdempotencyKey,
          metadata: {
            businessId,
            slots,
            unitPrice,
            purchasedBy: userId,
          },
        },
      });

      // 8. Advisory lock on the business to serialize concurrent allowance and product creations
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${businessId}, 0));`;

      // 9. Increment slot allowance on the business
      const updatedBusiness = await tx.business.update({
        where: { id: businessId },
        data: {
          marketplaceSlotAllowance: { increment: slots },
        },
        select: {
          id: true,
          businessName: true,
          marketplaceSlotAllowance: true,
          user: {
            select: {
              id: true,
              email: true,
              fullName: true,
            },
          },
        },
      });

      // 10. Record slot purchase record
      const purchase = await tx.marketplaceSlotPurchase.create({
        data: {
          businessId,
          slots,
          unitPrice: new Prisma.Decimal(unitPrice),
          amount: amountDec,
          status: 'active',
          paidVia: 'wallet',
          walletTxRef: walletRef,
          purchasedBy: userId,
          idempotencyKey: idempotencyKey || null,
        },
      });

      // 11. Write audit log
      await logAudit(
        {
          userId,
          businessId,
          action: 'marketplace.slots_purchased',
          resourceType: 'marketplace_slot_purchase',
          resourceId: purchase.id,
          newData: {
            slots,
            unitPrice,
            amount: totalAmount,
            walletTxRef: walletRef,
            newAllowance: updatedBusiness.marketplaceSlotAllowance,
          },
          ipAddress: metadata?.ipAddress,
          userAgent: metadata?.userAgent,
        },
        tx
      );

      return {
        purchase,
        newAllowance: updatedBusiness.marketplaceSlotAllowance,
        walletTransaction: walletTx,
        business: updatedBusiness,
        alreadyProcessed: false,
      };
    }, TX_OPTIONS);

    // 12. Dispatch receipt email post-transaction
    void dispatchSlotPurchaseReceiptEmail({
      toEmail: result.business.user?.email,
      ownerName: result.business.user?.fullName || result.business.businessName,
      businessName: result.business.businessName,
      slots,
      unitPrice,
      amount: totalAmount,
      reference: walletRef,
      newAllowance: result.newAllowance,
    });

    return {
      purchase: result.purchase,
      newAllowance: result.newAllowance,
      walletTxRef: walletRef,
      alreadyProcessed: false,
      message: `Successfully purchased ${slots} listing slot${slots === 1 ? '' : 's'}`,
    };
  } catch (err: unknown) {
    // Handle concurrent duplicate requests / unique-constraint races.
    if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === 'P2002') {
      const target = (err as { meta?: { target?: unknown } }).meta?.target;
      logger.warn('[marketplace-slots] P2002 during slot purchase; attempting idempotent recovery', {
        idempotencyKey,
        walletRef,
        walletIdempotencyKey,
        target,
      });

      if (idempotencyKey) {
        const existing = await prisma.marketplaceSlotPurchase.findUnique({
          where: { idempotencyKey },
          include: {
            business: {
              select: {
                marketplaceSlotAllowance: true,
              },
            },
          },
        });

        if (existing) {
          return {
            purchase: existing,
            newAllowance: existing.business.marketplaceSlotAllowance,
            alreadyProcessed: true,
            message: 'Slot purchase previously completed',
          };
        }
      }

      // Fallback: a wallet tx may have committed while the slot purchase lookup missed a race;
      // recover by wallet idempotency key -> wallet tx reference -> slot purchase.
      const existingWalletTx = await prisma.walletTransaction.findUnique({
        where: { idempotencyKey: walletIdempotencyKey },
        select: { reference: true },
      });
      if (existingWalletTx?.reference) {
        const existing = await prisma.marketplaceSlotPurchase.findUnique({
          where: { walletTxRef: existingWalletTx.reference },
          include: {
            business: {
              select: {
                marketplaceSlotAllowance: true,
              },
            },
          },
        });

        if (existing) {
          return {
            purchase: existing,
            newAllowance: existing.business.marketplaceSlotAllowance,
            alreadyProcessed: true,
            message: 'Slot purchase previously completed',
          };
        }
      }
    }

    throw err;
  }
}

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Phase 11 — Proof-of-Payment Path & Admin Slot Moderation
 * ─────────────────────────────────────────────────────────────────────────────
 */

export interface SubmitSlotProofParams {
  userId: string;
  businessId: string;
  slots: number;
  file: {
    originalname: string;
    buffer: Buffer;
    mimetype: string;
    size: number;
  };
  metadata?: {
    ipAddress?: string;
    userAgent?: string;
  };
}

export const ALLOWED_PROOF_MIMES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'application/pdf',
]);

export const MAX_PROOF_BYTES = 10 * 1024 * 1024; // 10MB

/**
 * Merchant submits bank transfer payment proof for slot purchase.
 * Persists with status `pending_proof`. Never auto-approves.
 */
export async function submitSlotProof(params: SubmitSlotProofParams) {
  const { userId, businessId, slots, file, metadata } = params;

  if (!file) {
    throw new AppError(400, 'Please upload a receipt screenshot or document as proof of payment', 'PROOF_REQUIRED');
  }

  if (!ALLOWED_PROOF_MIMES.has(file.mimetype.toLowerCase())) {
    throw new AppError(
      400,
      'Only JPEG, PNG, WebP images or PDF documents are accepted as proof of payment.',
      'BAD_FILE_TYPE'
    );
  }

  if (file.size > MAX_PROOF_BYTES) {
    throw new AppError(400, 'Proof document must be under 10MB', 'FILE_TOO_LARGE');
  }

  if (!slots || slots < 1 || !Number.isInteger(slots)) {
    throw new AppError(400, 'Slots must be a positive integer', 'INVALID_SLOTS');
  }

  // 1. Verify caller has access to the business (wrong business => 403)
  await verifyBusinessAccess(userId, businessId);

  // 2. Pricing calculated server-side
  const unitPrice = Number(config.marketplace.slotUnitPrice ?? 0);
  const totalAmount = slots * unitPrice;

  // 3. Upload proof via Cloudinary streaming with fallback
  let proofUrl: string | null = null;
  const isCloudinaryConfigured = Boolean(
    config.cloudinary.cloudName && config.cloudinary.apiKey && config.cloudinary.apiSecret
  );

  if (isCloudinaryConfigured) {
    try {
      const uploadResult = await new Promise<{ secure_url: string; public_id: string }>(
        (resolve, reject) => {
          const uploadStream = cloudinary.uploader.upload_stream(
            {
              folder: `paymytax/marketplace/slot-proofs/${businessId}`,
              resource_type: 'auto',
            },
            (err, res) => {
              if (err || !res) return reject(err || new Error('Cloudinary returned empty result'));
              resolve({ secure_url: res.secure_url, public_id: res.public_id });
            }
          );
          Readable.from(file.buffer).pipe(uploadStream);
        }
      );
      proofUrl = uploadResult.secure_url;
    } catch (err: unknown) {
      logger.warn('[marketplace-slots] Cloudinary proof upload failed, falling back to data URI', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (!proofUrl) {
    // Safe dev/test/offline fallback: Base64 data URI
    const base64 = file.buffer.toString('base64');
    proofUrl = `data:${file.mimetype};base64,${base64}`;
  }

  // 4. Create purchase record with pending_proof status (never auto-approves)
  const purchase = await prisma.marketplaceSlotPurchase.create({
    data: {
      businessId,
      slots,
      unitPrice: new Prisma.Decimal(unitPrice),
      amount: new Prisma.Decimal(totalAmount),
      status: 'pending_proof',
      paidVia: 'proof',
      proofUrl,
      purchasedBy: userId,
    },
    include: {
      business: {
        select: {
          id: true,
          businessName: true,
          marketplaceSlotAllowance: true,
        },
      },
    },
  });

  // 5. Audit log
  await logAudit(
    {
      userId,
      businessId,
      action: 'marketplace.slot_proof_submitted',
      resourceType: 'marketplace_slot_purchase',
      resourceId: purchase.id,
      newData: {
        slots,
        unitPrice,
        amount: totalAmount,
        proofUrl,
      },
      ipAddress: metadata?.ipAddress,
      userAgent: metadata?.userAgent,
    }
  );

  return {
    purchase,
    message: 'Payment proof submitted successfully and is pending admin review.',
  };
}

export interface ListAdminSlotPurchasesParams {
  status?: 'pending_proof' | 'active' | 'rejected' | 'refunded';
  page?: number;
  limit?: number;
  search?: string;
}

/**
 * Admin: List slot purchases/proofs with filtering and pagination.
 */
export async function listAdminSlotPurchases(params: ListAdminSlotPurchasesParams) {
  const page = Math.max(1, params.page || 1);
  const limit = Math.min(100, Math.max(1, params.limit || 20));
  const skip = (page - 1) * limit;

  const where: Prisma.MarketplaceSlotPurchaseWhereInput = {};
  if (params.status) {
    where.status = params.status;
  }
  if (params.search && params.search.trim()) {
    const q = params.search.trim();
    where.OR = [
      { business: { businessName: { contains: q, mode: 'insensitive' } } },
      { business: { user: { email: { contains: q, mode: 'insensitive' } } } },
      { business: { user: { fullName: { contains: q, mode: 'insensitive' } } } },
    ];
  }

  const [total, data] = await Promise.all([
    prisma.marketplaceSlotPurchase.count({ where }),
    prisma.marketplaceSlotPurchase.findMany({
      where,
      skip,
      take: limit,
      orderBy: params.status === 'pending_proof' ? { createdAt: 'asc' } : { createdAt: 'desc' },
      include: {
        business: {
          select: {
            id: true,
            businessName: true,
            marketplaceSlotAllowance: true,
            user: {
              select: {
                id: true,
                email: true,
                fullName: true,
                phone: true,
              },
            },
          },
        },
      },
    }),
  ]);

  return {
    data,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    },
  };
}

export interface ApproveSlotProofParams {
  adminUserId: string;
  purchaseId: string;
  metadata?: {
    ipAddress?: string;
    userAgent?: string;
  };
}

/**
 * Admin: Approve pending slot proof.
 * Transactional: updates status to active + raises allowance in one atomic transaction.
 * Guarded on status = 'pending_proof' to prevent double increments.
 */
export async function approveSlotProof(params: ApproveSlotProofParams) {
  const { adminUserId, purchaseId, metadata } = params;

  const purchase = await prisma.marketplaceSlotPurchase.findUnique({
    where: { id: purchaseId },
    include: {
      business: {
        include: {
          user: {
            select: { id: true, email: true, fullName: true },
          },
        },
      },
    },
  });

  if (!purchase) {
    throw new AppError(404, 'Slot purchase record not found', 'PURCHASE_NOT_FOUND');
  }

  if (purchase.status !== 'pending_proof') {
    throw new AppError(
      409,
      `Slot purchase cannot be approved because current status is '${purchase.status}'`,
      'PROOF_ALREADY_PROCESSED'
    );
  }

  const result = await prisma.$transaction(async (tx) => {
    // Guard against race conditions: verify status inside the transaction
    const current = await tx.marketplaceSlotPurchase.findUnique({
      where: { id: purchaseId },
    });

    if (!current || current.status !== 'pending_proof') {
      throw new AppError(
        409,
        `Slot purchase cannot be approved because current status is '${current?.status}'`,
        'PROOF_ALREADY_PROCESSED'
      );
    }

    // Transactional advisory lock on business
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${purchase.businessId}, 0));`;

    // 1. Update purchase status
    const updatedPurchase = await tx.marketplaceSlotPurchase.update({
      where: { id: purchaseId },
      data: {
        status: 'active',
        reviewedBy: adminUserId,
        reviewedAt: new Date(),
      },
    });

    // 2. Increment business allowance
    const updatedBusiness = await tx.business.update({
      where: { id: purchase.businessId },
      data: {
        marketplaceSlotAllowance: { increment: current.slots },
      },
      select: {
        id: true,
        businessName: true,
        marketplaceSlotAllowance: true,
        user: {
          select: {
            id: true,
            email: true,
            fullName: true,
          },
        },
      },
    });

    // 3. Log audit
    await logAudit(
      {
        userId: adminUserId,
        businessId: purchase.businessId,
        action: 'marketplace.slot_proof_approved',
        resourceType: 'marketplace_slot_purchase',
        resourceId: purchaseId,
        newData: {
          slots: current.slots,
          amount: Number(current.amount),
          newAllowance: updatedBusiness.marketplaceSlotAllowance,
        },
        ipAddress: metadata?.ipAddress,
        userAgent: metadata?.userAgent,
      },
      tx
    );

    return { purchase: updatedPurchase, business: updatedBusiness };
  }, TX_OPTIONS);

  // 4. Post-transaction receipt email dispatch
  void dispatchSlotPurchaseReceiptEmail({
    toEmail: result.business.user?.email,
    ownerName: result.business.user?.fullName || result.business.businessName,
    businessName: result.business.businessName,
    slots: result.purchase.slots,
    unitPrice: Number(result.purchase.unitPrice),
    amount: Number(result.purchase.amount),
    reference: `PROOF-APPROVAL-${result.purchase.id.slice(0, 8).toUpperCase()}`,
    newAllowance: result.business.marketplaceSlotAllowance,
  });

  return {
    purchase: result.purchase,
    newAllowance: result.business.marketplaceSlotAllowance,
    message: `Slot proof approved successfully. Allowance increased to ${result.business.marketplaceSlotAllowance}.`,
  };
}

export interface RejectSlotProofParams {
  adminUserId: string;
  purchaseId: string;
  reason: string;
  metadata?: {
    ipAddress?: string;
    userAgent?: string;
  };
}

/**
 * Admin: Reject pending slot proof with required reason.
 * Allowance remains unchanged.
 */
export async function rejectSlotProof(params: RejectSlotProofParams) {
  const { adminUserId, purchaseId, reason, metadata } = params;

  if (!reason || reason.trim().length < 3) {
    throw new AppError(
      400,
      'Rejection reason is mandatory and must be at least 3 characters',
      'REASON_REQUIRED'
    );
  }

  const purchase = await prisma.marketplaceSlotPurchase.findUnique({
    where: { id: purchaseId },
  });

  if (!purchase) {
    throw new AppError(404, 'Slot purchase record not found', 'PURCHASE_NOT_FOUND');
  }

  if (purchase.status !== 'pending_proof') {
    throw new AppError(
      409,
      `Slot purchase cannot be rejected because current status is '${purchase.status}'`,
      'PROOF_ALREADY_PROCESSED'
    );
  }

  const updatedPurchase = await prisma.$transaction(async (tx) => {
    const current = await tx.marketplaceSlotPurchase.findUnique({
      where: { id: purchaseId },
    });

    if (!current || current.status !== 'pending_proof') {
      throw new AppError(
        409,
        `Slot purchase cannot be rejected because current status is '${current?.status}'`,
        'PROOF_ALREADY_PROCESSED'
      );
    }

    const updated = await tx.marketplaceSlotPurchase.update({
      where: { id: purchaseId },
      data: {
        status: 'rejected',
        rejectionReason: reason.trim(),
        reviewedBy: adminUserId,
        reviewedAt: new Date(),
      },
    });

    await logAudit(
      {
        userId: adminUserId,
        businessId: current.businessId,
        action: 'marketplace.slot_proof_rejected',
        resourceType: 'marketplace_slot_purchase',
        resourceId: purchaseId,
        newData: {
          reason: reason.trim(),
        },
        ipAddress: metadata?.ipAddress,
        userAgent: metadata?.userAgent,
      },
      tx
    );

    return updated;
  }, TX_OPTIONS);

  return {
    purchase: updatedPurchase,
    message: 'Slot purchase proof was rejected. Allowance remains unchanged.',
  };
}

export interface RefundSlotPurchaseParams {
  adminUserId: string;
  purchaseId: string;
  reason?: string;
  metadata?: {
    ipAddress?: string;
    userAgent?: string;
  };
}

/**
 * Admin: Refund an active slot purchase.
 * active => refunded + wallet credit + allowance -= slots.
 * Blocked when allowance - slots < liveProducts with 409 ALLOWANCE_BELOW_LIVE_COUNT.
 */
export async function refundSlotPurchase(params: RefundSlotPurchaseParams) {
  const { adminUserId, purchaseId, reason, metadata } = params;

  const purchase = await prisma.marketplaceSlotPurchase.findUnique({
    where: { id: purchaseId },
    include: {
      business: true,
    },
  });

  if (!purchase) {
    throw new AppError(404, 'Slot purchase record not found', 'PURCHASE_NOT_FOUND');
  }

  if (purchase.status !== 'active') {
    throw new AppError(
      400,
      `Only active slot purchases can be refunded (current status: '${purchase.status}')`,
      'CANNOT_REFUND_INACTIVE_PURCHASE'
    );
  }

  // Fast floor check before transaction
  const proposedAllowance = purchase.business.marketplaceSlotAllowance - purchase.slots;
  await assertAllowanceNotBelowLiveProducts(purchase.businessId, proposedAllowance);

  const result = await prisma.$transaction(async (tx) => {
    // Advisory lock on business
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${purchase.businessId}, 0));`;

    // Re-verify purchase status
    const current = await tx.marketplaceSlotPurchase.findUnique({
      where: { id: purchaseId },
    });
    if (!current || current.status !== 'active') {
      throw new AppError(
        409,
        `Slot purchase cannot be refunded because current status is '${current?.status}'`,
        'PURCHASE_NOT_ACTIVE'
      );
    }

    // Re-verify floor inside transaction
    const biz = await tx.business.findUnique({
      where: { id: purchase.businessId },
      select: { marketplaceSlotAllowance: true, userId: true },
    });
    if (!biz) {
      throw new AppError(404, 'Business not found', 'BUSINESS_NOT_FOUND');
    }

    const txProposedAllowance = biz.marketplaceSlotAllowance - current.slots;
    await assertAllowanceNotBelowLiveProducts(purchase.businessId, txProposedAllowance, tx);

    // 1. Decrement allowance
    const updatedBusiness = await tx.business.update({
      where: { id: purchase.businessId },
      data: {
        marketplaceSlotAllowance: { decrement: current.slots },
      },
      select: {
        id: true,
        businessName: true,
        marketplaceSlotAllowance: true,
        userId: true,
      },
    });

    // 2. Update purchase status
    const updatedPurchase = await tx.marketplaceSlotPurchase.update({
      where: { id: purchaseId },
      data: {
        status: 'refunded',
        rejectionReason: reason?.trim() || 'Admin refund',
        reviewedBy: adminUserId,
        reviewedAt: new Date(),
      },
    });

    // 3. Wallet credit to business owner
    const refundRef = `WTX-REFUND-SLOT-${Date.now()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
    await WalletService.creditWallet(
      {
        userId: updatedBusiness.userId,
        businessId: purchase.businessId,
        amount: Number(current.amount),
        fee: 0,
        netAmount: Number(current.amount),
        reference: refundRef,
        source: 'marketplace_slot_refund',
        description: `Refund for ${current.slots} marketplace listing slot(s)`,
        idempotencyKey: `refund-slot:${current.id}`,
        metadata: {
          slotPurchaseId: current.id,
          refundedBy: adminUserId,
          reason: reason?.trim(),
        },
      },
      tx
    );

    // 4. Log audit
    await logAudit(
      {
        userId: adminUserId,
        businessId: purchase.businessId,
        action: 'marketplace.slot_refunded',
        resourceType: 'marketplace_slot_purchase',
        resourceId: current.id,
        newData: {
          slots: current.slots,
          refundedAmount: Number(current.amount),
          newAllowance: updatedBusiness.marketplaceSlotAllowance,
          reason: reason?.trim(),
        },
        ipAddress: metadata?.ipAddress,
        userAgent: metadata?.userAgent,
      },
      tx
    );

    return { purchase: updatedPurchase, newAllowance: updatedBusiness.marketplaceSlotAllowance };
  }, TX_OPTIONS);

  return {
    purchase: result.purchase,
    newAllowance: result.newAllowance,
    message: `Slot purchase refunded successfully. ₦${Number(purchase.amount).toLocaleString('en-NG', { minimumFractionDigits: 2 })} credited to owner wallet. New allowance: ${result.newAllowance}.`,
  };
}
