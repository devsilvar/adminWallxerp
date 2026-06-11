import prisma from '@/lib/prisma';
import logger from '@/lib/logger';
import { config } from '@/config';
import { AppError } from '@/middleware/errorHandler';
import { logAudit } from '@/lib/audit';
import { getPaymentProvider } from '@/lib/payment';
import { createReminderOnce } from '@/services/reminder.service';
import { formatNaira } from '@/lib/format';

// ─── Helpers ────────────────────────────────────────────────

async function verifyBusinessOwnership(userId: string, businessId: string) {
  const business = await prisma.business.findUnique({ where: { id: businessId } });

  if (!business) {
    throw new AppError(404, 'Business not found', 'BUSINESS_NOT_FOUND');
  }
  if (business.userId !== userId) {
    throw new AppError(403, 'You do not have access to this business', 'FORBIDDEN');
  }

  return business;
}

function splitName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/);
  const firstName = parts[0] || 'Business';
  const lastName = parts.slice(1).join(' ') || 'Owner';
  return { firstName, lastName };
}

// ─── Validate Customer (BVN + bank account) ──────────────────
//
// Paystack moved off the deprecated `type: 'bvn'` validation shape to
// `type: 'bank_account'` — they now cross-check the BVN against a bank
// account registered under the same NIBSS record. The caller MUST supply
// both the bank's NIBSS clearing code (e.g. "044" for Access) and the
// 10-digit NUBAN account number alongside the BVN. The bank list comes
// from `GET /api/v1/banks` (cached `bank.service.ts`); the BVN form on
// Account.tsx renders a dropdown sourced from that endpoint.
//
// Validation is asynchronous on Paystack's side — they queue the check
// and emit `customeridentification.success` / `customeridentification.failed`
// webhooks (not yet handled — see plan Phase 4.1). For now we return
// `validated: true` to mean "submission accepted" and tell the user to
// retry DVA setup in a few moments.

export interface ValidateCustomerInput {
  bvn: string;
  bankCode: string;
  accountNumber: string;
}

export async function validateCustomer(
  userId: string,
  businessId: string,
  input: ValidateCustomerInput,
) {
  const business = await verifyBusinessOwnership(userId, businessId);

  if (!business.paystackCustomerCode) {
    throw new AppError(
      400,
      'No Paystack customer exists for this business. Set up virtual account first.',
      'NO_CUSTOMER',
    );
  }

  const provider = getPaymentProvider();
  const { firstName, lastName } = splitName(business.ownerName);

  await provider.validateCustomer({
    customerCode: business.paystackCustomerCode,
    bvn: input.bvn,
    bankCode: input.bankCode,
    accountNumber: input.accountNumber,
    firstName,
    lastName,
  });

  logAudit({
    userId,
    businessId,
    action: 'dva.customer_validated',
    resourceType: 'business',
    resourceId: businessId,
    // We DELIBERATELY do not log the BVN or full account number — both are
    // PII. Last-4 of the account is enough for support traceability.
    newData: {
      bankCode: input.bankCode,
      accountLast4: input.accountNumber.slice(-4),
    },
  });

  logger.info('Customer BVN+bank validation submitted', {
    businessId,
    customerCode: business.paystackCustomerCode,
  });

  return { validated: true };
}

// ─── Setup Virtual Account ──────────────────────────────────

export async function setupVirtualAccount(userId: string, businessId: string) {
  const business = await verifyBusinessOwnership(userId, businessId);

  // Check if DVA already exists
  if (business.virtualAccountNumber) {
    return {
      status: 'active' as const,
      accountNumber: business.virtualAccountNumber,
      bankName: business.virtualAccountBank,
    };
  }

  // Get user for email/phone
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, phone: true },
  });

  if (!user) {
    throw new AppError(404, 'User not found', 'USER_NOT_FOUND');
  }

  // Paystack rejects fintech-DVA customer creation when the upstream record
  // has no phone — `customeridentification.failed` fires later with a vague
  // "phone required" message that's hostile to surface to the SME. Block at
  // the door instead so the UI can inline-capture the missing field, PATCH
  // /auth/me, and retry setup. Frontend Account.tsx catches this code and
  // renders the inline phone form. Path (b) from paymentPlan.md §2.3 —
  // intentionally NOT enforced at registration so users who never want a
  // DVA aren't gated on phone collection.
  if (!user.phone || !user.phone.trim()) {
    throw new AppError(
      400,
      'Add your phone number before setting up a virtual account. Paystack requires it for identity verification.',
      'USER_PHONE_REQUIRED',
    );
  }

  const provider = getPaymentProvider();
  const { firstName, lastName } = splitName(business.ownerName);

  // Step 1: Create Paystack customer (or reuse existing).
  //
  // Returns the code we should pass to /dedicated_account. Persists newly
  // created codes to the business row. Reused as the retry path below when
  // a stale code triggers customer_not_found.
  const ensureCustomerCode = async (force = false): Promise<string> => {
    if (!force && business.paystackCustomerCode) {
      return business.paystackCustomerCode;
    }

    const customer = await provider.createCustomer({
      email: user.email,
      firstName,
      lastName,
      phone: user.phone || undefined,
    });

    await prisma.business.update({
      where: { id: businessId },
      data: { paystackCustomerCode: customer.customerCode },
    });

    logger.info('Paystack customer created', {
      businessId,
      customerCode: customer.customerCode,
      recreated: force,
    });

    return customer.customerCode;
  };

  let customerCode = await ensureCustomerCode();

  // Step 2: Request dedicated virtual account.
  //
  // NOTE: On live mode, Paystack requires customer BVN validation before DVA.
  // If Paystack returns an error about validation, we surface it clearly.
  //
  // Self-heal on stale customer_code: if the code we have was created against
  // a different Paystack integration (e.g. test→live swap, or restored from a
  // backup with another team's data), Paystack returns customer_not_found.
  // Recreate the customer once against the current key and retry. If the
  // retry also fails, let the original AppError propagate to the caller.
  // Bank slug is mode-aware (test-bank in test mode, wema-bank in live). See
  // config.paystack.preferredBank — env var PAYSTACK_PREFERRED_BANK overrides.
  const preferredBank = config.paystack.preferredBank;
  const subaccount = business.paystackSubaccountCode || undefined;

  let dva;
  try {
    dva = await provider.createDedicatedAccount(customerCode, preferredBank, subaccount);
  } catch (err) {
    const isStaleCode =
      err instanceof AppError &&
      err.code === 'PAYSTACK_ERROR' &&
      (err.details as { paystackCode?: string } | undefined)?.paystackCode === 'customer_not_found';

    if (!isStaleCode) throw err;

    logger.warn('Stale Paystack customer code detected — recreating', {
      businessId,
      staleCustomerCode: customerCode,
    });

    customerCode = await ensureCustomerCode(true);
    dva = await provider.createDedicatedAccount(customerCode, preferredBank, subaccount);
  }

  // If Paystack returned account details synchronously, save them now
  if (dva.accountNumber) {
    await prisma.business.update({
      where: { id: businessId },
      data: {
        virtualAccountNumber: dva.accountNumber,
        virtualAccountBank: dva.bankName,
      },
    });

    logAudit({
      userId,
      businessId,
      action: 'dva.assigned',
      resourceType: 'business',
      resourceId: businessId,
      newData: { accountNumber: dva.accountNumber, bank: dva.bankName },
    });

    logger.info('DVA assigned synchronously', { businessId, accountNumber: dva.accountNumber });

    return {
      status: 'active' as const,
      accountNumber: dva.accountNumber,
      bankName: dva.bankName,
    };
  }

  // If async, Paystack will send webhook later
  logAudit({
    userId,
    businessId,
    action: 'dva.requested',
    resourceType: 'business',
    resourceId: businessId,
    newData: { customerCode },
  });

  logger.info('DVA requested (async)', { businessId, customerCode });

  return {
    status: 'pending' as const,
    message: 'Your account number is being set up. This usually takes a few seconds to a minute.',
  };
}

// ─── Get Virtual Account Details ────────────────────────────

export async function getVirtualAccount(userId: string, businessId: string) {
  const business = await verifyBusinessOwnership(userId, businessId);

  if (business.virtualAccountNumber) {
    return {
      status: 'active',
      accountNumber: business.virtualAccountNumber,
      bankName: business.virtualAccountBank,
    };
  }

  return {
    status: 'none',
    message: 'No virtual account set up for this business.',
  };
}

// ─── Process DVA Assignment Webhook ─────────────────────────

export async function processDVAAssignmentWebhook(event: any) {
  const eventType = event.event;
  const data = event.data;

  if (eventType === 'dedicatedaccount.assign.success') {
    const customerCode = data.customer?.customer_code;
    const accountNumber = data.dedicated_account?.account_number;
    const bankName = data.dedicated_account?.bank?.name;

    if (!customerCode || !accountNumber) {
      logger.warn('DVA webhook missing required fields', { eventType, data });
      return;
    }

    // Find business by customer code
    const business = await prisma.business.findFirst({
      where: { paystackCustomerCode: customerCode },
    });

    if (!business) {
      logger.warn('DVA webhook: no business found for customer code', { customerCode });
      return;
    }

    await prisma.business.update({
      where: { id: business.id },
      data: {
        virtualAccountNumber: accountNumber,
        virtualAccountBank: bankName || 'Wema Bank',
      },
    });

    logAudit({
      businessId: business.id,
      action: 'dva.assigned',
      resourceType: 'business',
      resourceId: business.id,
      newData: { accountNumber, bank: bankName },
    });

    logger.info('DVA assigned via webhook', { businessId: business.id, accountNumber });
  }

  if (eventType === 'dedicatedaccount.assign.failed') {
    const customerCode = data.customer?.customer_code;

    logger.error('DVA assignment failed', { customerCode, data });

    logAudit({
      action: 'dva.failed',
      resourceType: 'business',
      newData: { customerCode, reason: data.message || 'Unknown' },
    });
  }
}

// ─── Process DVA Transfer (Auto-Record Sale) ────────────────

export async function processDVATransferWebhook(event: any) {
  const data = event.data;
  const reference = data.reference;
  const amount = data.amount / 100; // kobo to naira
  const channel = data.channel;

  // Only handle dedicated_nuban transfers
  if (channel !== 'dedicated_nuban') return false;

  // Find the virtual account number from the transaction
  const accountNumber =
    data.dedicated_account?.account_number ||
    data.metadata?.receiver_account_number;

  if (!accountNumber) {
    logger.warn('DVA transfer webhook missing account number', { reference });
    return false;
  }

  // Find business by virtual account number
  const business = await prisma.business.findFirst({
    where: { virtualAccountNumber: accountNumber },
  });

  if (!business) {
    logger.warn('DVA transfer: no business found for account', { accountNumber, reference });
    return false;
  }

  // Check for duplicate (same reference)
  const existing = await prisma.salesTransaction.findFirst({
    where: { referenceId: reference, businessId: business.id },
  });

  if (existing) {
    logger.info('DVA transfer already recorded', { reference, businessId: business.id });
    return true;
  }

  // Auto-create sales transaction
  // Extract customer hint from metadata or narration
  const customerHint = 
    data.metadata?.purpose || 
    data.narration || 
    (data.customer?.first_name 
      ? `${data.customer.first_name} ${data.customer.last_name || ''}`.trim()
      : null);

  const sale = await prisma.salesTransaction.create({
    data: {
      businessId: business.id,
      amount,
      source: 'bank_transfer',
      status: 'pending',
      referenceId: reference,
      customerName: data.customer?.first_name
        ? `${data.customer.first_name} ${data.customer.last_name || ''}`.trim()
        : 'Bank Transfer',
      transactionDate: data.paid_at ? new Date(data.paid_at) : new Date(),
      metadata: {
        channel: 'dva',
        paystackTransactionId: data.id,
        autoRecorded: true,
      },
      needsVerification: true,
      customerHint,
      isTaxable: true,
    },
  });

  logAudit({
    businessId: business.id,
    action: 'sale.auto_captured',
    resourceType: 'sales_transaction',
    resourceId: sale.id,
    newData: { amount, reference, channel: 'dva', customerName: data.customer?.first_name },
  });

  logger.info('Sale auto-captured from DVA transfer', {
    businessId: business.id,
    amount,
    reference,
  });

  // Fire-and-forget reminder. Replayed webhooks short-circuit at the
  // duplicate-check above, so this only fires once per real sale.
  void createReminderOnce({
    businessId: business.id,
    reminderType: 'transaction_needs_verification',
    scheduledDate: new Date(),
    message: `New payment of ${formatNaira(amount)} received. Please verify the transaction.`,
    referenceType: 'sales_transaction',
    referenceId: sale.id,
  }).catch((err) =>
    logger.warn('Failed to create transaction_needs_verification reminder', {
      saleId: sale.id,
      err: err instanceof Error ? err.message : err,
    })
  );

  return true;
}


// ─── Requery DVA ────────────────────────────────────────────

const lastRequeryTimes = new Map<string, number>();
const REQUERY_RATE_LIMIT_MS = 10 * 60 * 1000; // 10 minutes

export async function requeryDVA(userId: string, businessId: string) {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    include: { user: true },
  });

  if (!business) {
    throw new AppError(404, 'Business not found', 'BUSINESS_NOT_FOUND');
  }
  if (business.userId !== userId) {
    throw new AppError(403, 'You do not have access to this business', 'FORBIDDEN');
  }

  if (!business.virtualAccountNumber) {
    throw new AppError(400, 'No virtual account set up for this business', 'NO_DVA');
  }

  // Rate limit check
  const now = Date.now();
  const lastRequery = lastRequeryTimes.get(businessId);
  if (lastRequery && now - lastRequery < REQUERY_RATE_LIMIT_MS) {
    const waitMinutes = Math.ceil((REQUERY_RATE_LIMIT_MS - (now - lastRequery)) / 60000);
    throw new AppError(
      429,
      `Please wait ${waitMinutes} more minutes before requerying`,
      'RATE_LIMITED'
    );
  }

  const provider = getPaymentProvider();
  const result = await provider.requeryDVA(
    business.virtualAccountNumber,
    config.paystack.preferredBank
  );

  lastRequeryTimes.set(businessId, now);

  logAudit({
    userId,
    businessId,
    action: 'dva.requeried',
    resourceType: 'business',
    resourceId: businessId,
    newData: { transactionCount: result.transactions.length },
  });

  logger.info('DVA requeried', { businessId, userId, transactionCount: result.transactions.length });

  return {
    accountNumber: result.accountNumber,
    transactionCount: result.transactions.length,
    message: 'DVA requeried successfully. Any missing transfers should appear shortly.',
  };
}



// ─── Settlement Bank Connection (Subaccount Split-Settlement) ────────────────

export async function resolveSettlementAccount(
  userId: string,
  businessId: string,
  bankCode: string,
  accountNumber: string,
) {
  await verifyBusinessOwnership(userId, businessId);
  const provider = getPaymentProvider();

  const result = await provider.resolveAccount(accountNumber, bankCode);

  return {
    bankCode: result.bankCode,
    accountNumber: result.accountNumber,
    accountName: result.accountName,
  };
}

export async function connectSettlementBank(
  userId: string,
  businessId: string,
  params: { bankCode: string; bankName: string; accountNumber: string; commissionPct?: number },
) {
  const business = await verifyBusinessOwnership(userId, businessId);
  const provider = getPaymentProvider();

  // Re-resolve server-side (never trust client-supplied name)
  const { accountName } = await provider.resolveAccount(params.accountNumber, params.bankCode);

  const { subaccountCode } = await provider.createSubaccount({
    businessName: business.businessName,
    bankCode: params.bankCode,
    accountNumber: params.accountNumber,
    percentageCharge: params.commissionPct ?? 0,
  });

  await prisma.business.update({
    where: { id: businessId },
    data: {
      paystackSubaccountCode: subaccountCode,
      settlementBankCode: params.bankCode,
      settlementBankName: params.bankName,
      settlementAccountNumber: params.accountNumber,
      settlementAccountName: accountName,
      platformCommissionPct: params.commissionPct ?? 0,
      settlementConnectedAt: new Date(),
    },
  });

  logAudit({
    userId,
    businessId,
    action: 'settlement.connected',
    resourceType: 'business',
    resourceId: businessId,
    newData: { subaccountCode, bankCode: params.bankCode, accountLast4: params.accountNumber.slice(-4) },
  });

  return { subaccountCode, accountName, bankName: params.bankName };
}
