import { Prisma, BoostPlan, BoostStatus } from '@prisma/client';
import prisma, { TxClient } from '@/lib/prisma';
import { AppError } from '@/middleware/errorHandler';
import { config } from '@/config';
import { WalletService } from '@/services/wallet/wallet.service';
import logger from '@/lib/logger';

export interface PurchaseBoostInput {
  businessId: string;
  productId: string;
  plan: 'week' | 'fortnight' | 'month';
  userId: string;
  requestId?: string;
  metadata?: {
    ipAddress?: string;
    userAgent?: string;
  };
}

export interface BoostResponse {
  boost: {
    id: string;
    productId: string;
    businessId: string;
    plan: BoostPlan;
    amount: number;
    startsAt: Date;
    endsAt: Date;
    status: BoostStatus;
    impressions: number;
    walletTxRef: string | null;
    createdAt: Date;
  };
  product: {
    id: string;
    name: string;
    category: string;
    boostEndsAt: Date | null;
  };
  wallet: {
    amountDebited: number;
    newBalance: number;
  };
  isWaitlisted: boolean;
  waitlistNotice?: string;
  advisoryNotice?: string;
  isIdempotentReplay?: boolean;
}

const PLAN_DAYS: Record<BoostPlan, number> = {
  week: 7,
  fortnight: 14,
  month: 30,
};

export class MarketplaceBoostsService {
  /**
   * Purchase or extend a page-one visibility boost for an approved listing.
   */
  static async purchaseBoost(input: PurchaseBoostInput): Promise<BoostResponse> {
    const { businessId, productId, plan, userId, requestId, metadata } = input;

    const boostPlan = plan as BoostPlan;
    const planPrice = Number(config.marketplace.boostPrices[boostPlan] ?? 0);
    const durationDays = config.marketplace.boostDurationsDays[boostPlan] ?? PLAN_DAYS[boostPlan] ?? 7;

    if (planPrice <= 0) {
      throw new AppError(500, 'Boost pricing for this plan is not currently configured', 'CONFIG_ERROR');
    }

    // 1. Build idempotency key
    const idempotencyKey = requestId
      ? `boost:${productId}:${plan}:${requestId}`
      : null;

    if (idempotencyKey) {
      const existingKeyMatch = await prisma.marketplaceBoost.findUnique({
        where: { idempotencyKey },
        include: {
          product: { select: { id: true, name: true, category: true, boostEndsAt: true } },
        },
      });

      if (existingKeyMatch) {
        return {
          boost: {
            id: existingKeyMatch.id,
            productId: existingKeyMatch.productId,
            businessId: existingKeyMatch.businessId,
            plan: existingKeyMatch.plan,
            amount: Number(existingKeyMatch.amount),
            startsAt: existingKeyMatch.startsAt,
            endsAt: existingKeyMatch.endsAt,
            status: existingKeyMatch.status,
            impressions: existingKeyMatch.impressions,
            walletTxRef: existingKeyMatch.walletTxRef,
            createdAt: existingKeyMatch.createdAt,
          },
          product: {
            id: existingKeyMatch.product.id,
            name: existingKeyMatch.product.name,
            category: existingKeyMatch.product.category,
            boostEndsAt: existingKeyMatch.product.boostEndsAt,
          },
          wallet: {
            amountDebited: 0,
            newBalance: 0,
          },
          isWaitlisted: existingKeyMatch.status === 'waitlisted',
          isIdempotentReplay: true,
        };
      }
    }

    // 2. Validate product ownership, status, and inventory before starting transaction
    const product = await prisma.marketplaceProduct.findUnique({
      where: { id: productId },
      include: {
        business: {
          select: { id: true, userId: true },
        },
      },
    });

    if (!product || product.businessId !== businessId) {
      throw new AppError(404, 'Product not found in this business', 'NOT_FOUND');
    }

    if (product.business.userId !== userId) {
      throw new AppError(403, 'Only the business owner can purchase visibility boosts', 'FORBIDDEN');
    }

    // Edge case check: archived, rejected, draft, or out of stock listings cannot be boosted
    if (product.status !== 'approved') {
      throw new AppError(
        400,
        `Cannot boost listing with status "${product.status}". Only approved listings can be boosted.`,
        'INVALID_STATUS'
      );
    }

    if (product.trackInventory && (product.stockQuantity ?? 0) <= 0) {
      throw new AppError(400, 'Cannot boost an out-of-stock product. Update your inventory stock first.', 'OUT_OF_STOCK');
    }

    const now = new Date();

    // 3. Execute atomic transaction
    return await prisma.$transaction(async (tx: TxClient) => {
      // Re-fetch product inside transaction with lock-friendly check
      const currentProduct = await tx.marketplaceProduct.findUniqueOrThrow({
        where: { id: productId },
      });

      if (currentProduct.status !== 'approved') {
        throw new AppError(
          400,
          `Cannot boost listing with status "${currentProduct.status}". Only approved listings can be boosted.`,
          'INVALID_STATUS'
        );
      }

      if (currentProduct.trackInventory && (currentProduct.stockQuantity ?? 0) <= 0) {
        throw new AppError(400, 'Cannot boost an out-of-stock product.', 'OUT_OF_STOCK');
      }

      // 4. Check for existing active or waitlisted boost on this product
      const existingBoost = await tx.marketplaceBoost.findFirst({
        where: {
          productId,
          status: { in: ['active', 'waitlisted'] },
        },
      });

      let amountToDebit = planPrice;
      let isUpgrade = false;

      if (existingBoost) {
        if (existingBoost.status === 'active') {
          // If extending/upgrading an active boost:
          if (existingBoost.plan !== boostPlan) {
            // Plan upgrade (e.g. week -> month): charge difference
            isUpgrade = true;
            amountToDebit = Math.max(0, planPrice - Number(existingBoost.amount));
          } else {
            // Extension of same plan: charge full plan price to push endsAt out
            amountToDebit = planPrice;
          }
        } else {
          throw new AppError(
            400,
            'This product already has a pending waitlisted boost. Wait until it goes live before purchasing another plan.',
            'BOOST_ALREADY_WAITLISTED'
          );
        }
      }

      // 5. Check and debit central wallet
      const ownerUserId = product.business.userId;
      const walletBalance = await WalletService.getWalletBalance(ownerUserId, tx);

      if (walletBalance.availableBalance < amountToDebit) {
        throw new AppError(
          402,
          `Insufficient available wallet balance. Available: ₦${walletBalance.availableBalance.toLocaleString('en-NG', {
            minimumFractionDigits: 2,
          })}, Required: ₦${amountToDebit.toLocaleString('en-NG', { minimumFractionDigits: 2 })}. Please fund your wallet via DVA to continue.`,
          'INSUFFICIENT_WALLET_BALANCE'
        );
      }

      const walletTxRef = `BOOST-TX-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

      if (amountToDebit > 0) {
        const amountDec = new Prisma.Decimal(amountToDebit);
        await tx.walletBalance.update({
          where: { userId: ownerUserId },
          data: {
            balance: { decrement: amountDec },
            version: { increment: 1 },
          },
        });

        await tx.walletTransaction.create({
          data: {
            walletId: walletBalance.id,
            userId: ownerUserId,
            businessId,
            type: 'debit',
            amount: amountDec,
            fee: new Prisma.Decimal(0),
            netAmount: amountDec,
            balanceAfter: new Prisma.Decimal(walletBalance.balance - amountToDebit),
            reference: walletTxRef,
            source: 'marketplace_boost',
            description: `Marketplace visibility boost (${plan}) for listing "${product.name}"`,
            metadata: {
              productId,
              productName: product.name,
              plan,
              isUpgrade,
            },
          },
        });
      }

      // 6. Capacity & Waitlist Check
      const maxCap = config.marketplace.maxCategoryBoostsPerPage ?? 3;
      const activeCategoryBoosts = await tx.marketplaceBoost.count({
        where: {
          status: 'active',
          product: {
            category: product.category,
            id: { not: productId },
          },
          endsAt: { gt: now },
        },
      });

      let boostRecord;
      let isWaitlisted = false;
      let waitlistNotice: string | undefined;

      if (existingBoost && existingBoost.status === 'active') {
        // Pushing endsAt out on the existing active row
        let newEndsAt: Date;
        if (isUpgrade) {
          const additionalDays = Math.max(0, durationDays - (PLAN_DAYS[existingBoost.plan] ?? 0));
          newEndsAt = new Date(existingBoost.endsAt.getTime() + additionalDays * 86400000);
        } else {
          newEndsAt = new Date(existingBoost.endsAt.getTime() + durationDays * 86400000);
        }

        boostRecord = await tx.marketplaceBoost.update({
          where: { id: existingBoost.id },
          data: {
            plan: boostPlan,
            amount: new Prisma.Decimal(planPrice),
            endsAt: newEndsAt,
            updatedAt: now,
          },
        });

        await tx.marketplaceProduct.update({
          where: { id: productId },
          data: { boostEndsAt: newEndsAt },
        });
      } else {
        // Fresh boost purchase
        if (activeCategoryBoosts >= maxCap) {
          // Category page-1 boost cap reached -> put on waitlist
          isWaitlisted = true;
          const earliestExpiring = await tx.marketplaceBoost.findFirst({
            where: {
              status: 'active',
              product: { category: product.category },
              endsAt: { gt: now },
            },
            orderBy: { endsAt: 'asc' },
          });

          const startsAt = earliestExpiring ? earliestExpiring.endsAt : now;
          const endsAt = new Date(startsAt.getTime() + durationDays * 86400000);

          boostRecord = await tx.marketplaceBoost.create({
            data: {
              productId,
              businessId,
              plan: boostPlan,
              amount: new Prisma.Decimal(planPrice),
              startsAt,
              endsAt,
              status: 'waitlisted',
              walletTxRef,
              idempotencyKey,
            },
          });

          waitlistNotice = `This category currently has ${maxCap} active boosts. Your listing is placed on the priority waitlist and will automatically go live on ${startsAt.toLocaleDateString('en-NG')}.`;
        } else {
          // Active immediately
          const startsAt = now;
          const endsAt = new Date(now.getTime() + durationDays * 86400000);

          boostRecord = await tx.marketplaceBoost.create({
            data: {
              productId,
              businessId,
              plan: boostPlan,
              amount: new Prisma.Decimal(planPrice),
              startsAt,
              endsAt,
              status: 'active',
              walletTxRef,
              idempotencyKey,
            },
          });

          await tx.marketplaceProduct.update({
            where: { id: productId },
            data: { boostEndsAt: endsAt },
          });
        }
      }

      // Check for small category advisory notice (§2.4: If fewer than 12 approved listings in category)
      const approvedCount = await tx.marketplaceProduct.count({
        where: {
          category: product.category,
          status: 'approved',
        },
      });

      let advisoryNotice: string | undefined;
      if (approvedCount < 12) {
        advisoryNotice = `This category has ${approvedCount} approved listing(s), so page one shows all of them. Your boost keeps your listing pinned at the top.`;
      }

      // Audit Log
      await tx.auditLog.create({
        data: {
          userId,
          businessId,
          action: 'marketplace.boost_purchased',
          newData: {
            productId,
            productName: product.name,
            plan,
            amount: amountToDebit,
            status: boostRecord.status,
            startsAt: boostRecord.startsAt,
            endsAt: boostRecord.endsAt,
            walletTxRef,
          },
          ipAddress: metadata?.ipAddress,
          userAgent: metadata?.userAgent,
        },
      });

      return {
        boost: {
          id: boostRecord.id,
          productId: boostRecord.productId,
          businessId: boostRecord.businessId,
          plan: boostRecord.plan,
          amount: Number(boostRecord.amount),
          startsAt: boostRecord.startsAt,
          endsAt: boostRecord.endsAt,
          status: boostRecord.status,
          impressions: boostRecord.impressions,
          walletTxRef: boostRecord.walletTxRef,
          createdAt: boostRecord.createdAt,
        },
        product: {
          id: product.id,
          name: product.name,
          category: product.category,
          boostEndsAt: isWaitlisted ? null : boostRecord.endsAt,
        },
        wallet: {
          amountDebited: amountToDebit,
          newBalance: walletBalance.balance - amountToDebit,
        },
        isWaitlisted,
        waitlistNotice,
        advisoryNotice,
      };
    });
  }

  /**
   * Get active boost details for a product.
   */
  static async getProductBoost(productId: string): Promise<any | null> {
    const boost = await prisma.marketplaceBoost.findFirst({
      where: {
        productId,
        status: { in: ['active', 'waitlisted'] },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!boost) return null;

    return {
      id: boost.id,
      productId: boost.productId,
      businessId: boost.businessId,
      plan: boost.plan,
      amount: Number(boost.amount),
      startsAt: boost.startsAt,
      endsAt: boost.endsAt,
      status: boost.status,
      impressions: boost.impressions,
      createdAt: boost.createdAt,
    };
  }
}
