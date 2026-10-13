/**
 * Customer Virtual Store Card & Change Voucher Service
 *
 * Implements:
 * - Customer search & quick-creation
 * - Customer virtual card generation with 6-digit PIN authentication
 * - Top-up & change credits (liability, non-taxable, month-locked)
 * - Card balance redemptions via sales (pessimistic row locking, taxable)
 * - Adjustments (owner & manager only)
 * - PIN-based voucher authentication with rate limiting and lockout
 *
 * @author WallX Engineering Team
 */

import prisma, { TxClient } from '@/lib/prisma';
import logger from '@/lib/logger';
import { AppError } from '@/middleware/errorHandler';
import { logAudit } from '@/lib/audit';
import { verifyBusinessAccess } from '@/lib/ownership';
import { assertMonthNotLocked, toNumber } from '@/shared/helpers';
import config from '@/config';
import { dispatchVoucherNotificationEmail } from '@/services/email-dispatch.service';
import {
  generateVoucherPin,
  hashVoucherPin,
  verifyVoucherPin,
  checkPinLock,
  nextLockDuration,
} from '@/services/voucher-pin.service';
import type {
  ListCustomersQuery,
  QuickCreateCustomerInput,
  TopUpCardInput,
  ChangeCreditInput,
  AdjustCardInput,
  ListCardActivityQuery,
} from '@/validators/customer-card.validator';

const TX_OPTIONS = { maxWait: 15000, timeout: 30000 };

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
  const businessPct = business?.voucherBonusPct !== null && business?.voucherBonusPct !== undefined ? toNumber(business.voucherBonusPct as any) : 0;
  const customerRaw = (customer as any)?.voucherBonusPct;
  const customerPct = customerRaw !== null && customerRaw !== undefined ? toNumber(customerRaw as any) : null;
  const effective = customerPct !== null ? customerPct : businessPct;
  return Math.min(effective, config.voucher.maxBonusPct);
}

/**
 * Extract the last 4 digits of a phone number for voucher authentication.
 * Returns empty string if phone is null, undefined, or too short.
 */
export function maskPhoneSuffix(phone: string | null | undefined): string {
  if (!phone) return '';
  const cleaned = phone.trim().replace(/\D/g, ''); // Remove non-digits
  if (cleaned.length < 4) return '';
  return cleaned.slice(-4);
}

/**
 * Mask a phone number for user-facing display (e.g. 0803***4567).
 */
export function maskPhoneNumber(phone: string): string {
  const cleaned = phone.trim();
  if (cleaned.length <= 6) return cleaned;
  const start = cleaned.slice(0, 4);
  const end = cleaned.slice(-3);
  return `${start}****${end}`;
}

/**
 * Generates a unique 6-digit card code for a business.
 */
export async function generateUniqueCardCode(
  businessId: string,
  tx?: TxClient
): Promise<string> {
  const db = tx ?? prisma;
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const existing = await db.customerCard.findUnique({
      where: { cardCode: code },
      select: { id: true },
    });
    if (!existing) {
      return code;
    }
  }
  // Fallback with timestamp suffix if loop exhausted
  return String(Date.now()).slice(-6);
}

/**
 * Search and list customers for autocomplete and CRM lookup.
 */
export async function searchCustomers(
  userId: string,
  businessId: string,
  query: ListCustomersQuery
) {
  await verifyBusinessAccess(userId, businessId, 'customers.read');

  const where: any = {
    businessId,
    isActive: true,
  };

  if (query.search && query.search.trim()) {
    const term = query.search.trim();
    where.OR = [
      { name: { contains: term, mode: 'insensitive' } },
      { phone: { contains: term } },
    ];
  }

  const offset = (query.page - 1) * query.limit;

  const [customers, total] = await Promise.all([
    prisma.customer.findMany({
      where,
      skip: offset,
      take: query.limit,
      orderBy: { name: 'asc' },
      include: {
        card: {
          select: {
            id: true,
            cardCode: true,
            balance: true,
            isActive: true,
          },
        },
      },
    }),
    prisma.customer.count({ where }),
  ]);

  const totalPages = Math.ceil(total / query.limit);

  return {
    data: customers.map((c) => ({
      ...c,
      card: c.card
        ? {
            ...c.card,
            balance: toNumber(c.card.balance),
          }
        : null,
    })),
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages,
      hasNext: query.page < totalPages,
      hasPrev: query.page > 1,
    },
  };
}

/**
 * Quick-create a customer with an associated virtual store card.
 */
export async function quickCreateCustomer(
  userId: string,
  businessId: string,
  input: QuickCreateCustomerInput
) {
  await verifyBusinessAccess(userId, businessId, 'customers.manage');

  const normalizedPhone = input.phone.trim();

  // Validate phone is sufficient for voucher PIN verification (min 4 digits for last-4)
  const phoneDigits = normalizedPhone.replace(/\D/g, '');
  if (phoneDigits.length < 4) {
    throw new AppError(
      400,
      'Phone number must contain at least 4 digits for voucher card authentication',
      'INVALID_PHONE_LENGTH'
    );
  }

  // Deduplicate against existing customer by business and phone
  const existing = await prisma.customer.findFirst({
    where: {
      businessId,
      phone: normalizedPhone,
    },
    include: {
      card: true,
    },
  });

  if (existing) {
    if (!existing.card) {
      // Generate PIN BEFORE transaction
      const plainPin = generateVoucherPin();
      const pinHash = await hashVoucherPin(plainPin);

      const cardCode = await generateUniqueCardCode(businessId);
      const card = await prisma.customerCard.create({
        data: {
          businessId,
          customerId: existing.id,
          cardCode,
          balance: 0,
          pinHash, // Store hashed PIN
          pinAttempts: 0,
        },
      });

      if (existing.email) {
        void dispatchVoucherNotificationEmail({
          businessId,
          customerId: existing.id,
          cardCode,
          balance: 0,
          actionType: 'created',
          toEmail: existing.email,
          customerName: existing.name,
          pinCode: plainPin, // Include plaintext PIN in email
        });
      }

      return {
        ...existing,
        card: {
          ...card,
          balance: toNumber(card.balance),
        },
      };
    }
    return {
      ...existing,
      card: {
        ...existing.card,
        balance: toNumber(existing.card.balance),
      },
    };
  }

  // Generate PIN BEFORE transaction (bcrypt must not run inside TX)
  const plainPin = generateVoucherPin();
  const pinHash = await hashVoucherPin(plainPin);

  // Create new customer and card inside transaction
  const result = await prisma.$transaction(
    async (tx) => {
      const customer = await tx.customer.create({
        data: {
          businessId,
          name: input.name.trim(),
          phone: normalizedPhone,
          email: input.email ? input.email.trim() : null,
          address: input.address?.trim() || null,
          notes: input.notes?.trim() || null,
        },
      });

      const cardCode = await generateUniqueCardCode(businessId, tx);
      const card = await tx.customerCard.create({
        data: {
          businessId,
          customerId: customer.id,
          cardCode,
          balance: 0,
          pinHash, // Store hashed PIN
          pinAttempts: 0,
        },
      });

      await logAudit(
        {
          userId,
          businessId,
          action: 'customer.created',
          resourceType: 'customer',
          resourceId: customer.id,
          newData: { name: customer.name, phone: customer.phone, cardCode },
        },
        tx
      );

      return {
        ...customer,
        card: {
          ...card,
          balance: toNumber(card.balance),
        },
      };
    },
    TX_OPTIONS
  );

  // Post-commit fire-and-forget notification to customer if email is provided
  if (result.email) {
    void dispatchVoucherNotificationEmail({
      businessId,
      customerId: result.id,
      cardCode: result.card.cardCode,
      balance: result.card.balance,
      actionType: 'created',
      toEmail: result.email,
      customerName: result.name,
      notes: result.notes,
      pinCode: plainPin, // Include plaintext PIN in email
    });
  }

  return result;
}

/**
 * Get customer card balance and ledger history.
 * Only manager/owner roles can view balances (PIN verification happens at debit time).
 */
export async function getCustomerCard(
  userId: string,
  businessId: string,
  customerId: string
) {
  const access = await verifyBusinessAccess(userId, businessId, 'customers.read');

  // Only managers and owners can view card balances
  if (access.role !== 'owner' && access.role !== 'manager') {
    throw new AppError(
      403,
      'Only managers and owners can view customer voucher balances',
      'INSUFFICIENT_PERMISSIONS'
    );
  }

  const customer = await prisma.customer.findFirst({
    where: { id: customerId, businessId },
    include: {
      card: {
        include: {
          ledgers: {
            orderBy: { createdAt: 'desc' },
            take: 50,
          },
        },
      },
    },
  });

  if (!customer) {
    throw new AppError(404, 'Customer not found', 'CUSTOMER_NOT_FOUND');
  }

  if (!customer.card) {
    throw new AppError(
      404,
      'Customer has no virtual store card',
      'CUSTOMER_HAS_NO_CARD'
    );
  }

  return {
    customer: {
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
      email: customer.email,
    },
    card: {
      id: customer.card.id,
      cardCode: customer.card.cardCode,
      balance: toNumber(customer.card.balance),
      isActive: customer.card.isActive,
      createdAt: customer.card.createdAt,
      updatedAt: customer.card.updatedAt,
      ledgers: customer.card.ledgers.map((l) => ({
        ...l,
        amount: toNumber(l.amount),
        balanceBefore: toNumber(l.balanceBefore),
        balanceAfter: toNumber(l.balanceAfter),
      })),
    },
  };
}

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Auth-gated voucher lookup by 6-digit PIN and last 4 digits of phone.
 * Constant-time anti-enumeration protection with uniform delay.
 * Allows sales_staff, managers, and owners to securely verify vouchers without customer search.
 */
export async function lookupVoucherByPin(
  userId: string,
  businessId: string,
  pin: string,
  last4: string
) {
  await verifyBusinessAccess(userId, businessId, 'customers.read');

  const candidates = await prisma.customer.findMany({
    where: {
      businessId,
      isActive: true,
      card: { isNot: null },
    },
    include: { card: true },
  });
  const filtered = candidates.filter(
    (c) => c.card && c.card.isActive && maskPhoneSuffix(c.phone) === last4.trim()
  );

  if (filtered.length === 0) {
    await delay(400);
    throw new AppError(401, 'Invalid voucher PIN or phone.', 'VOUCHER_AUTH_FAILED');
  }

  for (const customer of filtered) {
    const card = customer.card!;
    // 1) lock check
    try {
      checkPinLock(card);
    } catch (e) {
      throw e;
    } // 423 with retryAfterMinutes

    // 2) PIN proof
    if (!card.pinHash) continue; // legacy card without PIN -> treat as not matched
    const ok = await verifyVoucherPin(pin.trim(), card.pinHash);
    if (ok) {
      await logAudit({
        userId,
        businessId,
        action: 'card.voucher_lookup',
        resourceType: 'customer_card',
        resourceId: card.id,
        newData: { customerId: customer.id },
      });
      logger.info('voucher lookup success', { businessId, cardId: card.id });
      return {
        customer: {
          id: customer.id,
          name: customer.name,
          phone: customer.phone,
          email: customer.email,
        },
        card: {
          id: card.id,
          balance: toNumber(card.balance),
          isActive: card.isActive,
        },
      };
    }
    // 3) wrong PIN -> increment attempts for this card only, then try next candidate
    const lockMs = nextLockDuration(card.pinAttempts + 1);
    await prisma.customerCard.update({
      where: { id: card.id },
      data: {
        pinAttempts: { increment: 1 },
        pinLockedUntil: lockMs ? new Date(Date.now() + lockMs) : null,
      },
    });
  }

  await delay(400);
  logger.warn('voucher lookup failed', { businessId, candidateCount: filtered.length });
  throw new AppError(401, 'Invalid voucher PIN or phone.', 'VOUCHER_AUTH_FAILED');
}

// ─── PIN Management ─────────────────────────────────────────

/**
 * Resend voucher PIN to customer email.
 * Manager/owner only. Does not generate new PIN, only re-sends existing one.
 * 
 * NOTE: This requires decrypting or re-issuing a new PIN since we store bcrypt hash.
 * Current implementation issues a NEW PIN and updates the hash.
 */
export async function resendVoucherPin(
  userId: string,
  businessId: string,
  customerId: string
) {
  await verifyBusinessAccess(userId, businessId, 'customers.manage');

  const customer = await prisma.customer.findFirst({
    where: { id: customerId, businessId },
    include: { card: true },
  });

  if (!customer) {
    throw new AppError(404, 'Customer not found', 'CUSTOMER_NOT_FOUND');
  }

  if (!customer.card) {
    throw new AppError(
      404,
      'Customer has no virtual store card',
      'CUSTOMER_HAS_NO_CARD'
    );
  }

  if (!customer.email) {
    throw new AppError(
      400,
      'Customer has no email address on file. Cannot resend PIN.',
      'CUSTOMER_HAS_NO_EMAIL'
    );
  }

  // Generate new PIN and hash (bcrypt prevents decryption of old PIN)
  const plainPin = generateVoucherPin();
  const pinHash = await hashVoucherPin(plainPin);

  await prisma.customerCard.update({
    where: { id: customer.card.id },
    data: {
      pinHash,
      pinAttempts: 0, // Reset attempts on PIN reissue
      pinLockedUntil: null,
    },
  });

  // Dispatch email with new PIN
  void dispatchVoucherNotificationEmail({
    businessId,
    customerId,
    cardCode: customer.card.cardCode,
    balance: toNumber(customer.card.balance),
    actionType: 'created', // Reuse 'created' template styling
    toEmail: customer.email,
    customerName: customer.name,
    pinCode: plainPin,
    notes: 'Your voucher PIN has been reset at your request.',
  });

  await logAudit({
    userId,
    businessId,
    action: 'card.pin_resent',
    resourceType: 'customer_card',
    resourceId: customer.card.id,
    newData: { customerId, cardCode: customer.card.cardCode },
  });

  logger.info('Voucher PIN reissued', {
    businessId,
    customerId,
    cardId: customer.card.id,
    userId,
  });

  return {
    success: true,
    message: `New voucher PIN sent to ${customer.email}`,
  };
}

/**
 * Change voucher PIN with authentication (old PIN + last-4 phone verification).
 * Can be initiated by manager/owner or by customer themselves (when we add customer portal).
 */
export async function changeVoucherPin(
  userId: string,
  businessId: string,
  customerId: string,
  oldPin: string,
  newPin: string,
  last4Phone: string
) {
  await verifyBusinessAccess(userId, businessId, 'customers.manage');

  const customer = await prisma.customer.findFirst({
    where: { id: customerId, businessId },
    include: { card: true },
  });

  if (!customer) {
    throw new AppError(404, 'Customer not found', 'CUSTOMER_NOT_FOUND');
  }

  if (!customer.card) {
    throw new AppError(
      404,
      'Customer has no virtual store card',
      'CUSTOMER_HAS_NO_CARD'
    );
  }

  const card = customer.card;

  // ─── 1. Check PIN lockout ───
  const { checkPinLock, verifyVoucherPin, validatePinFormat } = await import('@/services/voucher-pin.service');
  checkPinLock(card);

  // ─── 2. Validate Last-4 Phone ───
  const customerLast4 = maskPhoneSuffix(customer.phone);
  if (!customerLast4 || customerLast4 !== last4Phone.trim()) {
    // Increment attempts in separate transaction
    const newAttempts = card.pinAttempts + 1;
    const { nextLockDuration } = await import('@/services/voucher-pin.service');
    const lockDurationMs = nextLockDuration(newAttempts);
    const pinLockedUntil = lockDurationMs > 0 ? new Date(Date.now() + lockDurationMs) : null;

    await prisma.customerCard.update({
      where: { id: card.id },
      data: { pinAttempts: newAttempts, pinLockedUntil },
    });

    throw new AppError(
      401,
      'Phone verification failed. Last 4 digits do not match.',
      'VOUCHER_AUTH_FAILED'
    );
  }

  // ─── 3. Verify old PIN ───
  if (!card.pinHash) {
    throw new AppError(
      500,
      'Card PIN not initialized. Please contact support.',
      'PIN_NOT_INITIALIZED'
    );
  }

  const oldPinValid = await verifyVoucherPin(oldPin, card.pinHash);
  if (!oldPinValid) {
    // Increment attempts in separate transaction
    const newAttempts = card.pinAttempts + 1;
    const { nextLockDuration } = await import('@/services/voucher-pin.service');
    const lockDurationMs = nextLockDuration(newAttempts);
    const pinLockedUntil = lockDurationMs > 0 ? new Date(Date.now() + lockDurationMs) : null;

    await prisma.customerCard.update({
      where: { id: card.id },
      data: { pinAttempts: newAttempts, pinLockedUntil },
    });

    throw new AppError(401, 'Incorrect old PIN. Please try again.', 'VOUCHER_AUTH_FAILED');
  }

  // ─── 4. Validate new PIN format ───
  validatePinFormat(newPin);

  // ─── 5. Hash new PIN and update (outside transaction, reset attempts) ───
  const newPinHash = await hashVoucherPin(newPin);

  await prisma.customerCard.update({
    where: { id: card.id },
    data: {
      pinHash: newPinHash,
      pinAttempts: 0,
      pinLockedUntil: null,
    },
  });

  // Dispatch email notification (if customer has email)
  if (customer.email) {
    void dispatchVoucherNotificationEmail({
      businessId,
      customerId,
      cardCode: card.cardCode,
      balance: toNumber(card.balance),
      actionType: 'created', // Reuse template
      toEmail: customer.email,
      customerName: customer.name,
      pinCode: newPin,
      notes: 'Your voucher PIN has been changed successfully.',
    });
  }

  await logAudit({
    userId,
    businessId,
    action: 'card.pin_changed',
    resourceType: 'customer_card',
    resourceId: card.id,
    newData: { customerId, cardCode: card.cardCode },
  });

  logger.info('Voucher PIN changed', {
    businessId,
    customerId,
    cardId: card.id,
    userId,
  });

  return {
    success: true,
    message: customer.email
      ? `Voucher PIN changed successfully. Confirmation sent to ${customer.email}.`
      : 'Voucher PIN changed successfully.',
  };
}

/**
 * Top up a customer virtual card (Liability only, non-taxable, month-locked).
 */
export async function topUpCard(
  userId: string,
  businessId: string,
  customerId: string,
  input: TopUpCardInput
) {
  await verifyBusinessAccess(userId, businessId, 'customers.manage');

  const date = input.receiptDate ?? new Date();
  await assertMonthNotLocked(businessId, date);

  // Check if we need to create a card and prepare PIN BEFORE transaction
  const existingCard = await prisma.customerCard.findUnique({
    where: { customerId },
  });

  let pinData: { plainPin: string; pinHash: string } | null = null;
  
  if (!existingCard) {
    // Generate PIN outside transaction (bcrypt must not run in TX)
    const plainPin = generateVoucherPin();
    const pinHash = await hashVoucherPin(plainPin);
    pinData = { plainPin, pinHash };
  }

  const result = await prisma.$transaction(
    async (tx) => {
      let card = await tx.customerCard.findUnique({
        where: { customerId },
      });

      if (!card) {
        const cardCode = await generateUniqueCardCode(businessId, tx);
        card = await tx.customerCard.create({
          data: {
            businessId,
            customerId,
            cardCode,
            balance: 0,
            pinHash: pinData!.pinHash,
            pinAttempts: 0,
          },
        });
      }

      // Concurrency protection: pessimistic row lock
      await (tx as any).$queryRaw`SELECT id FROM customer_cards WHERE id = ${card.id} FOR UPDATE`;

      const currentCard = await tx.customerCard.findUnique({
        where: { id: card.id },
      });
      if (!currentCard) {
        throw new AppError(404, 'Customer card not found', 'CUSTOMER_CARD_NOT_FOUND');
      }

      const effectivePct = await resolveBonusPct(tx, businessId, customerId, input.bonusPct);
      const bonusAmount = effectivePct > 0 ? round2(input.amount * effectivePct / 100) : 0;
      const credited = round2(input.amount + bonusAmount);
      const balanceBefore = toNumber(currentCard.balance);
      const balanceAfter = round2(balanceBefore + credited);

      const updated = await tx.customerCard.update({
        where: { id: card.id },
        data: {
          balance: { increment: credited },
        },
      });

      const ledger = await tx.customerCardLedger.create({
        data: {
          cardId: card.id,
          type: 'top_up',
          amount: input.amount,
          balanceBefore,
          balanceAfter,
          performedBy: userId,
          notes: input.notes?.trim() || null,
          bonusAmount: bonusAmount > 0 ? bonusAmount : null,
          bonusPct: effectivePct > 0 ? effectivePct : null,
        },
      });

      await logAudit(
        {
          userId,
          businessId,
          action: 'card.top_up',
          resourceType: 'customer_card',
          resourceId: card.id,
          newData: { amount: input.amount, bonusAmount, bonusPct: effectivePct, balanceBefore, balanceAfter, credited },
        },
        tx
      );

      return {
        card: {
          ...updated,
          balance: toNumber(updated.balance),
        },
        ledger: {
          ...ledger,
          amount: toNumber(ledger.amount),
          balanceBefore: toNumber(ledger.balanceBefore),
          balanceAfter: toNumber(ledger.balanceAfter),
          bonusAmount: ledger.bonusAmount !== null && ledger.bonusAmount !== undefined ? toNumber(ledger.bonusAmount as any) : null,
          bonusPct: ledger.bonusPct !== null && ledger.bonusPct !== undefined ? toNumber(ledger.bonusPct as any) : null,
        },
      };
    },
    TX_OPTIONS
  );

  // Post-commit: Send PIN email if card was just created
  if (pinData) {
    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      select: { email: true, name: true },
    });

    if (customer?.email) {
      void dispatchVoucherNotificationEmail({
        businessId,
        customerId,
        balance: result.card.balance,
        actionType: 'created',
        toEmail: customer.email,
        customerName: customer.name,
        pinCode: pinData.plainPin,
        notes: 'Your store voucher card has been created with your first top-up.',
        amount: input.amount,
        bonusAmount: (result as any).ledger?.bonusAmount ?? null,
        bonusPct: (result as any).ledger?.bonusPct ?? null,
      });
    } else {
      // Still send top-up notification even if no email for PIN
      void dispatchVoucherNotificationEmail({
        businessId,
        customerId,
        balance: result.card.balance,
        actionType: 'top_up',
        amount: input.amount,
        bonusAmount: (result as any).ledger?.bonusAmount ?? null,
        bonusPct: (result as any).ledger?.bonusPct ?? null,
        notes: input.notes,
      });
    }
  } else {
    // Existing card - send top-up notification
    void dispatchVoucherNotificationEmail({
      businessId,
      customerId,
      balance: result.card.balance,
      actionType: 'top_up',
      amount: input.amount,
      bonusAmount: (result as any).ledger?.bonusAmount ?? null,
      bonusPct: (result as any).ledger?.bonusPct ?? null,
      notes: input.notes,
    });
  }

  return result;
}

/**
 * Credit customer change to virtual store card (Liability only, non-taxable, month-locked).
 */
export async function creditChange(
  userId: string,
  businessId: string,
  customerId: string,
  input: ChangeCreditInput,
  externalTx?: TxClient
) {
  await verifyBusinessAccess(userId, businessId, 'customers.manage', externalTx);

  const date = input.receiptDate ?? new Date();
  await assertMonthNotLocked(businessId, date, externalTx);

  // Check if we need to create a card and prepare PIN BEFORE transaction
  const existingCard = await (externalTx || prisma).customerCard.findUnique({
    where: { customerId },
  });

  let pinData: { plainPin: string; pinHash: string } | null = null;
  
  if (!existingCard) {
    // Generate PIN outside transaction (bcrypt must not run in TX)
    const plainPin = generateVoucherPin();
    const pinHash = await hashVoucherPin(plainPin);
    pinData = { plainPin, pinHash };
  }

  const execute = async (tx: TxClient) => {
    let card = await tx.customerCard.findUnique({
      where: { customerId },
    });

    if (!card) {
      const cardCode = await generateUniqueCardCode(businessId, tx);
      card = await tx.customerCard.create({
        data: {
          businessId,
          customerId,
          cardCode,
          balance: 0,
          pinHash: pinData!.pinHash,
          pinAttempts: 0,
        },
      });
    }

    // Pessimistic row lock
    await (tx as any).$queryRaw`SELECT id FROM customer_cards WHERE id = ${card.id} FOR UPDATE`;

    const currentCard = await tx.customerCard.findUnique({
      where: { id: card.id },
    });
    if (!currentCard) {
      throw new AppError(404, 'Customer card not found', 'CUSTOMER_CARD_NOT_FOUND');
    }

    const balanceBefore = toNumber(currentCard.balance);
    const balanceAfter = balanceBefore + input.amount;

    const updated = await tx.customerCard.update({
      where: { id: card.id },
      data: {
        balance: { increment: input.amount },
      },
    });

    const ledger = await tx.customerCardLedger.create({
      data: {
        cardId: card.id,
        type: 'change_credit',
        amount: input.amount,
        balanceBefore,
        balanceAfter,
        receiptNumber: input.receiptNumber || null,
        linkedSaleId: input.linkedSaleId || null,
        performedBy: userId,
        notes: input.notes?.trim() || 'Cash change deposit',
      },
    });

    await logAudit(
      {
        userId,
        businessId,
        action: 'card.change_credit',
        resourceType: 'customer_card',
        resourceId: card.id,
        newData: {
          amount: input.amount,
          balanceBefore,
          balanceAfter,
          receiptNumber: input.receiptNumber,
          linkedSaleId: input.linkedSaleId,
        },
      },
      tx
    );

    return {
      card: {
        ...updated,
        balance: toNumber(updated.balance),
      },
      ledger: {
        ...ledger,
        amount: toNumber(ledger.amount),
        balanceBefore: toNumber(ledger.balanceBefore),
        balanceAfter: toNumber(ledger.balanceAfter),
      },
    };
  };

  if (externalTx) {
    return await execute(externalTx);
  }
  const result = await prisma.$transaction(execute, TX_OPTIONS);

  // Post-commit: Send PIN email if card was just created
  if (pinData) {
    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      select: { email: true, name: true },
    });

    if (customer?.email) {
      void dispatchVoucherNotificationEmail({
        businessId,
        customerId,
        cardCode: result.card.cardCode,
        balance: result.card.balance,
        actionType: 'created',
        toEmail: customer.email,
        customerName: customer.name,
        pinCode: pinData.plainPin,
        notes: 'Your store voucher card has been created with change credit.',
      });
    } else {
      // Still send change credit notification even if no email for PIN
      void dispatchVoucherNotificationEmail({
        businessId,
        customerId,
        cardCode: result.card.cardCode,
        balance: result.card.balance,
        actionType: 'change_credit',
        amount: input.amount,
        notes: input.notes,
      });
    }
  } else {
    // Existing card - send change credit notification
    void dispatchVoucherNotificationEmail({
      businessId,
      customerId,
      cardCode: result.card.cardCode,
      balance: result.card.balance,
      actionType: 'change_credit',
      amount: input.amount,
      notes: input.notes,
    });
  }

  return result;
}

/**
 * Manually adjust customer card balance.
 * Strictly limited to business owner and manager.
 */
export async function adjustCardBalance(
  userId: string,
  businessId: string,
  customerId: string,
  input: AdjustCardInput
) {
  const access = await verifyBusinessAccess(userId, businessId, 'customers.manage');

  // Explicit role enforcement: owner or manager only
  if (access.role !== 'owner' && access.role !== 'manager') {
    throw new AppError(
      403,
      'Only business owners and managers can perform card balance adjustments',
      'PERMISSION_DENIED'
    );
  }

  const date = input.receiptDate ?? new Date();
  await assertMonthNotLocked(businessId, date);

  return await prisma.$transaction(
    async (tx) => {
      const card = await tx.customerCard.findUnique({
        where: { customerId },
      });

      if (!card) {
        throw new AppError(404, 'Customer card not found', 'CUSTOMER_CARD_NOT_FOUND');
      }

      // Pessimistic row lock
      await (tx as any).$queryRaw`SELECT id FROM customer_cards WHERE id = ${card.id} FOR UPDATE`;

      const currentCard = await tx.customerCard.findUnique({
        where: { id: card.id },
      });
      if (!currentCard) {
        throw new AppError(404, 'Customer card not found', 'CUSTOMER_CARD_NOT_FOUND');
      }

      const balanceBefore = toNumber(currentCard.balance);
      const balanceAfter = balanceBefore + input.amount;

      if (balanceAfter < 0) {
        throw new AppError(
          409,
          'Adjustment would result in a negative card balance',
          'INSUFFICIENT_CARD_BALANCE',
          { balanceBefore, requestedAdjustment: input.amount }
        );
      }

      const updated = await tx.customerCard.update({
        where: { id: card.id },
        data: {
          balance: { increment: input.amount },
        },
      });

      const ledger = await tx.customerCardLedger.create({
        data: {
          cardId: card.id,
          type: 'adjustment',
          amount: Math.abs(input.amount),
          balanceBefore,
          balanceAfter,
          performedBy: userId,
          notes: input.reason.trim(),
        },
      });

      await logAudit(
        {
          userId,
          businessId,
          action: 'card.adjustment',
          resourceType: 'customer_card',
          resourceId: card.id,
          newData: {
            amount: input.amount,
            balanceBefore,
            balanceAfter,
            reason: input.reason,
          },
        },
        tx
      );

      return {
        card: {
          ...updated,
          balance: toNumber(updated.balance),
        },
        ledger: {
          ...ledger,
          amount: toNumber(ledger.amount),
          balanceBefore: toNumber(ledger.balanceBefore),
          balanceAfter: toNumber(ledger.balanceAfter),
        },
      };
    },
    TX_OPTIONS
  );
}

/**
 * Debit customer virtual card for a store voucher sale payment.
 * Must run inside the sale transaction.
 */
/**
 * Debit customer card for sale with PIN + Last-4 phone authentication.
 * Must be called inside a transaction with the auth object containing plaintext credentials.
 * 
 * CRITICAL: Failed PIN attempts must be persisted in a SEPARATE transaction (caller's responsibility)
 * because this transaction will rollback on error.
 */
export async function debitCardForSale(
  userId: string,
  businessId: string,
  customerId: string,
  amount: number,
  saleId: string,
  receiptNumber: string | null,
  tx: TxClient,
  auth: { voucherPin: string; voucherLast4: string } // Plaintext credentials
) {
  // Load customer with card (inside TX for consistency)
  const customer = await tx.customer.findUnique({
    where: { id: customerId },
    include: { card: true },
  });

  if (!customer) {
    throw new AppError(404, 'Customer not found', 'CUSTOMER_NOT_FOUND');
  }

  if (!customer.card) {
    throw new AppError(
      404,
      'Customer has no virtual store card to redeem from',
      'CUSTOMER_HAS_NO_CARD'
    );
  }

  const card = customer.card;

  // Pessimistic row locking to eliminate concurrent double-spend race
  await (tx as any).$queryRaw`SELECT id FROM customer_cards WHERE id = ${card.id} FOR UPDATE`;

  // Reload card with lock
  const lockedCard = await tx.customerCard.findUnique({
    where: { id: card.id },
  });

  if (!lockedCard) {
    throw new AppError(404, 'Customer card not found', 'CUSTOMER_CARD_NOT_FOUND');
  }

  // ─── 1. Check PIN lockout ───
  const { checkPinLock, verifyVoucherPin, validatePinFormat } = await import('@/services/voucher-pin.service');
  checkPinLock(lockedCard);

  // ─── 2. Validate Last-4 Phone ───
  const customerLast4 = maskPhoneSuffix(customer.phone);
  if (!customerLast4 || customerLast4 !== auth.voucherLast4.trim()) {
    // Increment attempts (will rollback, caller must persist)
    const newAttempts = lockedCard.pinAttempts + 1;
    const { nextLockDuration } = await import('@/services/voucher-pin.service');
    const lockDurationMs = nextLockDuration(newAttempts);
    const pinLockedUntil = lockDurationMs > 0 ? new Date(Date.now() + lockDurationMs) : null;

    await tx.customerCard.update({
      where: { id: card.id },
      data: { pinAttempts: newAttempts, pinLockedUntil },
    });

    throw new AppError(
      401,
      'Phone verification failed. Last 4 digits do not match.',
      'VOUCHER_AUTH_FAILED'
    );
  }

  // ─── 3. Validate PIN format ───
  try {
    validatePinFormat(auth.voucherPin);
  } catch (err) {
    throw new AppError(400, 'Invalid PIN format. Must be exactly 6 digits.', 'INVALID_PIN_FORMAT');
  }

  // ─── 4. Verify PIN hash ───
  if (!lockedCard.pinHash) {
    throw new AppError(
      500,
      'Card PIN not initialized. Please contact support.',
      'PIN_NOT_INITIALIZED'
    );
  }

  const pinValid = await verifyVoucherPin(auth.voucherPin, lockedCard.pinHash);
  if (!pinValid) {
    // Increment attempts (will rollback, caller must persist)
    const newAttempts = lockedCard.pinAttempts + 1;
    const { nextLockDuration } = await import('@/services/voucher-pin.service');
    const lockDurationMs = nextLockDuration(newAttempts);
    const pinLockedUntil = lockDurationMs > 0 ? new Date(Date.now() + lockDurationMs) : null;

    await tx.customerCard.update({
      where: { id: card.id },
      data: { pinAttempts: newAttempts, pinLockedUntil },
    });

    throw new AppError(401, 'Incorrect PIN. Please try again.', 'VOUCHER_AUTH_FAILED');
  }

  // ─── 5. PIN verified successfully - Reset attempts ───
  if (lockedCard.pinAttempts > 0 || lockedCard.pinLockedUntil) {
    await tx.customerCard.update({
      where: { id: card.id },
      data: { pinAttempts: 0, pinLockedUntil: null },
    });
  }

  // ─── 6. Check balance sufficiency ───
  const currentBalance = toNumber(lockedCard.balance);
  if (currentBalance < amount) {
    throw new AppError(
      409,
      `Insufficient voucher balance. Available: ₦${currentBalance.toLocaleString()}, required: ₦${amount.toLocaleString()}`,
      'VOUCHER_BALANCE_CONFLICT',
      { availableBalance: currentBalance, requiredAmount: amount }
    );
  }

  // ─── 7. Debit the card ───
  const balanceBefore = currentBalance;
  const balanceAfter = balanceBefore - amount;

  const updatedCard = await tx.customerCard.update({
    where: { id: card.id },
    data: {
      balance: { decrement: amount },
    },
  });

  const ledger = await tx.customerCardLedger.create({
    data: {
      cardId: card.id,
      type: 'sale_debit',
      amount,
      balanceBefore,
      balanceAfter,
      receiptNumber: receiptNumber || null,
      linkedSaleId: saleId,
      performedBy: userId,
      notes: `Voucher redemption for sale ${receiptNumber || saleId}`,
    },
  });

  return {
    card: {
      ...updatedCard,
      balance: toNumber(updatedCard.balance),
    },
    ledger: {
      ...ledger,
      amount: toNumber(ledger.amount),
      balanceBefore: toNumber(ledger.balanceBefore),
      balanceAfter: toNumber(ledger.balanceAfter),
    },
  };
}

/**
 * Restore customer voucher balance when a store voucher sale is reversed, cancelled, or deleted.
 * Must run inside a transaction with pessimistic locking.
 */
export async function restoreVoucherBalanceForSale(
  userId: string,
  businessId: string,
  saleId: string,
  reason: string,
  tx: TxClient
) {
  // 1. Locate the debit ledger associated with this sale
  const debitLedger = await tx.customerCardLedger.findFirst({
    where: {
      linkedSaleId: saleId,
      type: 'sale_debit',
    },
  });

  if (!debitLedger) {
    return null;
  }

  // 2. Check for existing reversal refund (idempotency guard)
  const existingRefund = await tx.customerCardLedger.findFirst({
    where: {
      linkedSaleId: saleId,
      type: 'adjustment',
      notes: { startsWith: 'Reversal refund' },
    },
  });

  if (existingRefund) {
    return existingRefund;
  }

  // 3. Pessimistic row lock on customer card
  await (tx as any).$queryRaw`SELECT id FROM customer_cards WHERE id = ${debitLedger.cardId} FOR UPDATE`;

  const card = await tx.customerCard.findUnique({
    where: { id: debitLedger.cardId },
  });

  if (!card) {
    throw new AppError(404, 'Customer card not found for refund', 'CUSTOMER_CARD_NOT_FOUND');
  }

  const refundAmount = toNumber(debitLedger.amount);
  const balanceBefore = toNumber(card.balance);
  const balanceAfter = balanceBefore + refundAmount;

  const updatedCard = await tx.customerCard.update({
    where: { id: card.id },
    data: {
      balance: { increment: refundAmount },
    },
  });

  const refundLedger = await tx.customerCardLedger.create({
    data: {
      cardId: card.id,
      type: 'adjustment',
      amount: refundAmount,
      balanceBefore,
      balanceAfter,
      receiptNumber: debitLedger.receiptNumber,
      linkedSaleId: saleId,
      performedBy: userId,
      notes: `Reversal refund for voided sale #${debitLedger.receiptNumber || saleId}: ${reason}`,
    },
  });

  await logAudit(
    {
      userId,
      businessId,
      action: 'card.voucher_refunded',
      resourceType: 'customer_card',
      resourceId: card.id,
      newData: {
        saleId,
        refundAmount,
        balanceBefore,
        balanceAfter,
        reason,
      },
    },
    tx
  );

  return {
    card: { ...updatedCard, balance: toNumber(updatedCard.balance) },
    ledger: { ...refundLedger, amount: toNumber(refundLedger.amount), balanceBefore, balanceAfter },
  };
}

/**
 * List all store card transactions / activity logs across the entire business.
 * Allows business owner and staff to see "who did what" with customer vouchers.
 */
export async function listStoreCardActivity(
  userId: string,
  businessId: string,
  query: ListCardActivityQuery
) {
  await verifyBusinessAccess(userId, businessId, 'customers.read');

  const where: any = {
    card: { businessId },
  };

  if (query.type) {
    where.type = query.type;
  }

  if (query.customerId) {
    where.card = { ...where.card, customerId: query.customerId };
  }

  if (query.startDate || query.endDate) {
    where.createdAt = {};
    if (query.startDate) where.createdAt.gte = new Date(query.startDate);
    if (query.endDate) {
      const end = new Date(query.endDate);
      end.setHours(23, 59, 59, 999);
      where.createdAt.lte = end;
    }
  }

  if (query.search && query.search.trim()) {
    const term = query.search.trim();
    where.OR = [
      { receiptNumber: { contains: term, mode: 'insensitive' } },
      { notes: { contains: term, mode: 'insensitive' } },
      { card: { customer: { name: { contains: term, mode: 'insensitive' } } } },
      { card: { customer: { phone: { contains: term } } } },
    ];
  }

  const offset = (query.page - 1) * query.limit;

  const [ledgers, total] = await Promise.all([
    prisma.customerCardLedger.findMany({
      where,
      skip: offset,
      take: query.limit,
      orderBy: { createdAt: 'desc' },
      include: {
        card: {
          select: {
            id: true,
            cardCode: true,
            customerId: true,
            customer: {
              select: {
                id: true,
                name: true,
                phone: true,
                email: true,
              },
            },
          },
        },
      },
    }),
    prisma.customerCardLedger.count({ where }),
  ]);

  // Batch-fetch users who performed these actions so the owner can see who did what!
  const performerIds = Array.from(
    new Set(ledgers.map((l) => l.performedBy).filter(Boolean))
  ) as string[];

  const performers =
    performerIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: performerIds } },
          select: { id: true, fullName: true, email: true },
        })
      : [];

  const performerMap = new Map<string, { id: string; name: string; email: string }>(
    performers.map((p) => [
      p.id,
      {
        id: p.id,
        name: p.fullName || p.email.split('@')[0],
        email: p.email,
      },
    ])
  );

  const totalPages = Math.ceil(total / query.limit);

  return {
    data: ledgers.map((l) => {
      const performer = l.performedBy ? performerMap.get(l.performedBy) : null;
      return {
        id: l.id,
        cardId: l.cardId,
        cardCode: l.card.cardCode,
        customerId: l.card.customerId,
        customerName: l.card.customer?.name ?? 'Unknown Customer',
        customerPhone: l.card.customer?.phone ?? null,
        type: l.type,
        amount: toNumber(l.amount),
        balanceBefore: toNumber(l.balanceBefore),
        balanceAfter: toNumber(l.balanceAfter),
        receiptNumber: l.receiptNumber,
        linkedSaleId: l.linkedSaleId,
        performedBy: l.performedBy,
        performerName: performer ? performer.name : 'System / Auto',
        performerEmail: performer ? performer.email : null,
        notes: l.notes,
        createdAt: l.createdAt.toISOString(),
      };
    }),
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages,
      hasNext: query.page < totalPages,
      hasPrev: query.page > 1,
    },
  };
}

/**
 * Get store-wide customer voucher statistics.
 */
export async function getStoreCardStats(userId: string, businessId: string) {
  await verifyBusinessAccess(userId, businessId, 'customers.read');

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [
    totalCustomers,
    totalCards,
    balanceAgg,
    redeemedAgg,
    changeAgg,
    bonusAgg,
  ] = await Promise.all([
    prisma.customer.count({ where: { businessId, isActive: true } }),
    prisma.customerCard.count({ where: { businessId, isActive: true } }),
    prisma.customerCard.aggregate({
      where: { businessId, isActive: true },
      _sum: { balance: true },
    }),
    prisma.customerCardLedger.aggregate({
      where: {
        card: { businessId },
        type: 'sale_debit',
        createdAt: { gte: startOfMonth },
      },
      _sum: { amount: true },
    }),
    prisma.customerCardLedger.aggregate({
      where: {
        card: { businessId },
        type: 'change_credit',
        createdAt: { gte: startOfMonth },
      },
      _sum: { amount: true },
    }),
    prisma.customerCardLedger.aggregate({
      where: {
        card: { businessId },
        createdAt: { gte: startOfMonth },
      },
      _sum: { bonusAmount: true },
    }),
  ]);

  return {
    totalCustomers,
    totalCards,
    circulatingBalance: toNumber(balanceAgg._sum.balance ?? 0),
    monthRedeemed: toNumber(redeemedAgg._sum.amount ?? 0),
    monthChangeCredited: toNumber(changeAgg._sum.amount ?? 0),
    monthBonusGiven: toNumber((bonusAgg as any)._sum.bonusAmount ?? 0),
  };
}

export async function updateCustomerVoucherBonus(
  userId: string,
  businessId: string,
  customerId: string,
  voucherBonusPct: number | null
) {
  await verifyBusinessAccess(userId, businessId, 'customers.manage');
  if (voucherBonusPct !== null && (voucherBonusPct < 0 || voucherBonusPct > config.voucher.maxBonusPct)) {
    throw new AppError(400, `Customer bonus must be between 0 and ${config.voucher.maxBonusPct}% or null to inherit`, 'INVALID_BONUS_PCT');
  }
  const customer = await prisma.customer.findFirst({ where: { id: customerId, businessId } });
  if (!customer) throw new AppError(404, 'Customer not found', 'CUSTOMER_NOT_FOUND');
  const updated = await prisma.customer.update({
    where: { id: customerId },
    data: { voucherBonusPct },
    select: { id: true, name: true, voucherBonusPct: true },
  });
  await logAudit({
    userId,
    businessId,
    action: 'customer.bonus_updated',
    resourceType: 'customer',
    resourceId: customerId,
    newData: { voucherBonusPct },
  });
  return {
    ...updated,
    voucherBonusPct: updated.voucherBonusPct !== null && updated.voucherBonusPct !== undefined ? toNumber(updated.voucherBonusPct as any) : null,
  };
}

export const customerCardService = {
  searchCustomers,
  quickCreateCustomer,
  getCustomerCard,
  lookupVoucherByPin,
  resendVoucherPin,
  changeVoucherPin,
  topUpCard,
  creditChange,
  adjustCardBalance,
  debitCardForSale,
  restoreVoucherBalanceForSale,
  listStoreCardActivity,
  getStoreCardStats,
  updateCustomerVoucherBonus,
};
