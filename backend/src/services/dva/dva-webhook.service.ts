import prisma from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import logger from '@/lib/logger';
import { config } from '@/config';
import { logAudit } from '@/lib/audit';
import { getPaymentProvider } from '@/lib/payment';
import { createReminderOnce } from '@/services/reminder.service';
import { formatNaira } from '@/lib/format';
import { invalidateOwnershipCache } from '@/lib/ownership';
import { dvaProcessingFee, round2 } from '@/lib/paystack-fees';
import { toNumber, resolveTransactionDateForLockedMonth, nextBusinessDayStart } from '@/shared/helpers';
import { eventBus } from '@/core/events/event-bus';
import { eventBus as realtimeBus } from '@/lib/realtime-emitter';
import { encrypt, computeBlindIndex } from '@/lib/crypto';
import { emitToAdmins } from '@/services/admin/realtime-admin.helper';

// ─── Payer extraction ───────────────────────────────────────

/**
 * Extract the PAYER identity from a Paystack dedicated-NUBAN charge.
 *
 * `data.customer` on a DVA charge is the *merchant's own* Paystack customer —
 * the `CUS_xxx` we created from `business.ownerName` during setup. Reading it
 * as the payer is why every inbound transfer was labelled with the merchant's
 * own name (or the generic "Bank Transfer" when the field was absent).
 *
 * The sender's details ride on `data.authorization` as `sender_name` and
 * `sender_bank` for transfers into a dedicated account. When the originating
 * bank withholds the sender name, Paystack only carries it in `narration`
 * (e.g. "Transfer from JOHN DOE / GTBank"), so we parse that as a fallback
 * rather than inventing a value.
 *
 * Returns nulls when the payload genuinely has no sender identity.
 */
function extractPayer(data: any): { name: string | null; bank: string | null } {
  const auth = data?.authorization ?? {};

  const pick = (...candidates: unknown[]): string | null => {
    for (const value of candidates) {
      if (typeof value === 'string' && value.trim()) return value.trim();
    }
    return null;
  };

  let name = pick(auth.sender_name, data?.sender_name);

  if (!name && typeof data?.narration === 'string') {
    // Paystack sometimes withholds sender_name and only carries the payer in
    // `narration`. Two shapes seen in the wild:
    //   1. "Transfer from JOHN DOE / GTBank"          (sender name as-is)
    //   2. "NIP: RHODA CHURCH -1123344343/44343231232" (NIP format: payer
    //      name immediately after "NIP:")
    // Try both before giving up — falling through to the merchant name
    // (data.customer) is the old mislabelling bug.
    const fromMatch = data.narration.match(
      /\bfrom\s+([A-Za-z][A-Za-z'.-]*(?:\s+[A-Za-z][A-Za-z'.-]*){0,4})/i,
    );
    if (fromMatch) name = fromMatch[1].trim();

    if (!name) {
      const nipMatch = data.narration.match(/\bNIP[:\s]+([A-Za-z][A-Za-z'.-]*(?:\s+[A-Za-z][A-Za-z'.-]*){0,4})/i);
      if (nipMatch) name = nipMatch[1].trim();
    }
  }

  if (!name) {
    logger.warn('[dva:payer] No sender identity in DVA charge payload — falling back to merchant name', {
      narration: typeof data?.narration === 'string' ? data.narration : undefined,
      hasAuthorization: !!data?.authorization,
      authorizationKeys: data?.authorization ? Object.keys(data.authorization) : [],
      customer: data?.customer,
    });
  }

  return {
    name: name || null,
    bank: pick(auth.sender_bank, data?.sender_bank),
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
        dvaFailureReason: null,
        dvaFailedAt: null,
      },
    });

    await prisma.user.update({
      where: { id: business.userId },
      data: {
        virtualAccountNumber: accountNumber,
        virtualAccountBank: bankName || 'Wema Bank',
        paystackCustomerCode: customerCode,
      },
    });

    invalidateOwnershipCache(business.id, business.userId);

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
    const reason = data.message || 'Dedicated account assignment failed';

    logger.error('DVA assignment failed', { customerCode, data });

    const business = customerCode
      ? await prisma.business.findFirst({ where: { paystackCustomerCode: customerCode } })
      : null;

    if (business) {
      await prisma.business.update({
        where: { id: business.id },
        data: { dvaFailureReason: reason, dvaFailedAt: new Date() },
      });
    }

    logAudit({
      businessId: business?.id,
      action: 'dva.failed',
      resourceType: 'business',
      resourceId: business?.id,
      newData: { customerCode, reason },
    });
  }
}

// ─── Process Customer Identification Webhook ────────────────

export async function processCustomerIdentificationWebhook(event: any) {
  const eventType = event.event;
  const data = event.data || {};
  const customerCode = data.customer_code || data.customer?.customer_code;

  if (!customerCode) {
    logger.warn('Customer identification webhook missing customer code', { eventType, data });
    return;
  }

  const business = await prisma.business.findFirst({
    where: { paystackCustomerCode: customerCode },
  });

  if (!business) {
    logger.warn('Customer identification webhook: no business for customer code', { customerCode });
    return;
  }

  if (eventType === 'customeridentification.success') {
    logger.info('Customer identification succeeded', { businessId: business.id, customerCode });

    logAudit({
      businessId: business.id,
      action: 'dva.customer_identified',
      resourceType: 'business',
      resourceId: business.id,
      newData: { customerCode },
    });

    await prisma.business.update({
      where: { id: business.id },
      data: { dvaFailureReason: null, dvaFailedAt: null },
    });

    const webhookBvn = data.bvn || data.identification?.number;
    await prisma.user.update({
      where: { id: business.userId },
      data: {
        bvnVerifiedAt: new Date(),
        ...(webhookBvn
          ? {
              bvn: encrypt(webhookBvn),
              bvnHash: computeBlindIndex(webhookBvn),
            }
          : {}),
      },
    });

    if (business.virtualAccountNumber) {
      logger.info('Identification success but DVA already assigned — skipping', {
        businessId: business.id,
      });
      return;
    }

    try {
      const provider = getPaymentProvider();
      const dva = await provider.createDedicatedAccount(
        customerCode,
        config.paystack.preferredBank,
      );

      if (dva.accountNumber) {
        await prisma.business.update({
          where: { id: business.id },
          data: {
            virtualAccountNumber: dva.accountNumber,
            virtualAccountBank: dva.bankName,
            dvaFailureReason: null,
            dvaFailedAt: null,
          },
        });

        logAudit({
          businessId: business.id,
          action: 'dva.assigned',
          resourceType: 'business',
          resourceId: business.id,
          newData: { accountNumber: dva.accountNumber, bank: dva.bankName, via: 'identification_webhook' },
        });

        logger.info('DVA assigned after identification success', {
          businessId: business.id,
          accountNumber: dva.accountNumber,
        });
      } else {
        logger.info('DVA requested after identification — awaiting assign webhook', {
          businessId: business.id,
        });
      }
    } catch (err) {
      logger.error('Failed to create DVA after identification success', {
        businessId: business.id,
        customerCode,
        err: err instanceof Error ? err.message : err,
      });
    }

    return;
  }

  if (eventType === 'customeridentification.failed') {
    const reason = data.reason || data.message || 'Identity verification failed';

    logger.error('Customer identification failed', { businessId: business.id, customerCode, reason });

    await prisma.business.update({
      where: { id: business.id },
      data: { dvaFailureReason: reason, dvaFailedAt: new Date() },
    });

    logAudit({
      businessId: business.id,
      action: 'dva.customer_identification_failed',
      resourceType: 'business',
      resourceId: business.id,
      newData: { customerCode, reason },
    });

    void createReminderOnce({
      businessId: business.id,
      reminderType: 'dva_validation_failed',
      scheduledDate: new Date(),
      message: `We couldn't verify your identity for your virtual account: ${reason}. Please check your BVN and that the bank account is in your name, then try again.`,
      referenceType: 'business',
      referenceId: customerCode,
      updateMessageOnDup: true,
    }).catch((err) =>
      logger.warn('Failed to create dva_validation_failed reminder', {
        businessId: business.id,
        err: err instanceof Error ? err.message : err,
      }),
    );
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

  // If this transfer corresponds to a storefront order, skip generic DVA auto-capture
  // to avoid double-booking against the Storefront order fulfillment handler.
  if (reference && typeof reference === 'string' && reference.startsWith('ORD-')) {
    logger.info('DVA transfer corresponds to storefront order, skipping generic auto-capture', { reference });
    return false;
  }

  const accountNumber =
    data.authorization?.receiver_bank_account_number ||
    data.dedicated_account?.account_number ||
    data.metadata?.receiver_account_number;

  if (!accountNumber) {
    logger.warn('DVA transfer webhook missing account number', { reference });
    return false;
  }

  let business: any = null;

  // 1. Exact business match first: if this account number belongs to a single specific business,
  // route directly to that business entity.
  const matchingBusinesses = await prisma.business.findMany({
    where: { virtualAccountNumber: accountNumber },
  });

  if (matchingBusinesses.length === 1) {
    business = matchingBusinesses[0];
  } else if (matchingBusinesses.length > 1) {
    // Sibling businesses sharing the central user DVA: route to the merchant's primary business (central landing pool)
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { virtualAccountNumber: accountNumber },
          { id: matchingBusinesses[0].userId },
        ],
      },
      include: {
        businesses: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (user && user.businesses.length > 0) {
      business = user.primaryBusinessId
        ? user.businesses.find((b) => b.id === user.primaryBusinessId) || user.businesses[0]
        : user.businesses[0];
    }
  } else {
    // Fallback: lookup by User.virtualAccountNumber (central landing pool)
    const user = await prisma.user.findFirst({
      where: { virtualAccountNumber: accountNumber },
      include: {
        businesses: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (user && user.businesses.length > 0) {
      business = user.primaryBusinessId
        ? user.businesses.find((b) => b.id === user.primaryBusinessId) || user.businesses[0]
        : user.businesses[0];
    }
  }

  if (!business) {
    logger.warn('DVA transfer: no business found for account', { accountNumber, reference });
    return false;
  }

  // DVA-ALLOC-03: Business-agnostic idempotency lookup
  // Probe by referenceId across all businesses first; if found under a different
  // business, that booking is authoritative — return true and create nothing.
  const existingSaleAnywhere = await prisma.salesTransaction.findFirst({
    where: { referenceId: reference },
  });

  if (existingSaleAnywhere && existingSaleAnywhere.businessId !== business.id) {
    logger.info('DVA transfer already authoritatively recorded under another business', {
      reference,
      existingBusinessId: existingSaleAnywhere.businessId,
      incomingBusinessId: business.id,
    });
    return true;
  }

  const existingSale = existingSaleAnywhere ?? (await prisma.salesTransaction.findFirst({
    where: { referenceId: reference, businessId: business.id },
  }));

  if (existingSale) {
    logger.info('DVA transfer already recorded — skipping duplicate capture', {
      reference,
      businessId: business.id,
      saleId: existingSale.id,
    });
    return true;
  }

  const payer = extractPayer(data);

  // On a DVA charge `data.customer` is this merchant's own Paystack customer,
  // so it is only a last-resort label (and what simulated payloads provide).
  const legacyCustomerName = data.customer?.first_name
    ? `${data.customer.first_name} ${data.customer.last_name || ''}`.trim()
    : null;
  const payerName = payer.name || legacyCustomerName;

  logger.info('[dva:payer] DVA transfer payer resolved', {
    businessId: business.id,
    reference,
    payerName,
    source: payer.name
      ? data?.authorization?.sender_name
        ? 'authorization.sender_name'
        : data?.sender_name
          ? 'data.sender_name'
          : 'narration'
      : legacyCustomerName
        ? 'legacy:data.customer (MERCHANT OWNER — no sender in payload)'
        : 'none',
    senderName: payer.name,
    senderBank: payer.bank,
    narration: typeof data?.narration === 'string' ? data.narration : undefined,
    merchantCustomerName: legacyCustomerName,
  });

  const customerHint =
    data.metadata?.purpose ||
    payer.name ||
    data.narration ||
    legacyCustomerName ||
    null;

  // D2/D7: Tax auto-split is permanently retired. 100% of customer deposits
  // land in WallX balance and are credited in full to the merchant's wallet.
  const isSplitSettled = false;
  const splitPct = null;
  const platformRetained = null;

  const feeNaira =
    typeof data.fees === 'number' ? round2(data.fees / 100) : dvaProcessingFee(amount);
  // Boss's rule: Platform absorbs Paystack's 1% DVA fee; customer receives 100% of deposit in full
  const netRetained = amount;

  // Standard atomic path: create both sale and wallet credit in one transaction fence
  try {
    const rawPaidDate = data.paid_at ? new Date(data.paid_at) : new Date();
    const dateRes = await resolveTransactionDateForLockedMonth(business.id, rawPaidDate, prisma);
    if (dateRes.wasAdjusted) {
      logger.warn('DVA transfer target month is locked/finalized — adjusting transactionDate to current open period', {
        businessId: business.id,
        reference,
        originalPaidAt: data.paid_at,
        effectiveDate: dateRes.effectiveDate.toISOString(),
        reason: dateRes.reason,
      });
    }

    const settledAt = nextBusinessDayStart(rawPaidDate);

    const sale = await prisma.$transaction(
      async (tx) => {
        const sale = await tx.salesTransaction.create({
          data: {
            businessId: business.id,
            amount,
            source: 'bank_transfer',
            dvaOrigin: true,
            status: 'pending',
            referenceId: reference,
            customerName: payerName || 'Bank Transfer',
            transactionDate: dateRes.effectiveDate,
            settledAt,
            settledViaSplit: isSplitSettled,
            splitPct,
            platformRetained,
            metadata: {
              channel: 'dva',
              paystackTransactionId: data.id,
              autoRecorded: true,
              splitSettled: false,
              paystackFeeNaira: typeof data.fees === 'number' ? round2(data.fees / 100) : null,
              paystackFeeModelledNaira: dvaProcessingFee(amount),
              monthLockAdjusted: dateRes.wasAdjusted,
              senderName: payer.name,
              senderBank: payer.bank,
              ...(dateRes.wasAdjusted
                ? {
                    originalPaidAt: data.paid_at,
                    adjustmentReason: dateRes.reason,
                  }
                : {}),
            },
            needsVerification: true,
            customerHint,
            isTaxable: true,
          },
        });

        await logAudit(
          {
            businessId: business.id,
            action: 'sale.auto_captured',
            resourceType: 'sales_transaction',
            resourceId: sale.id,
            newData: {
              amount,
              reference,
              channel: 'dva',
              customerName: payerName,
              monthLockAdjusted: dateRes.wasAdjusted,
              transactionDate: dateRes.effectiveDate.toISOString(),
            },
          },
          tx
        );

        return sale;
      },
      { maxWait: 10000, timeout: 20000 }
    );

    logger.info('Sale auto-captured into settlement from DVA transfer', {
      businessId: business.id,
      amount,
      reference,
      saleId: sale.id,
      settledAt: sale.settledAt,
    });

    eventBus.emit('dva.transfer_received', {
      accountNumber,
      amount,
      reference,
      payerName: payerName || undefined,
      rawEvent: event,
    });

    const _ownerId = (business as any).userId as string;
    const customerName = payerName || 'Unknown Customer';

    realtimeBus.emitToUserIds([_ownerId], {
      type: 'dva_transfer_received',
      businessId: business.id,
      saleId: sale.id,
      amount: Number(sale.amount),
      customerName,
      reference: (data.reference as string) || sale.id.slice(0, 8),
      timestamp: new Date().toISOString(),
    });

    if (sale.needsVerification) {
      void emitToAdmins({
        type: 'unverified_inflow_created',
        saleId: sale.id,
        businessId: business.id,
        businessName: business.businessName,
        amount: Number(sale.amount),
        referenceId: (data.reference as string) || sale.id.slice(0, 8),
        timestamp: new Date().toISOString(),
      }).catch((err) =>
        logger.warn('Failed to emit unverified_inflow_created to admins', { saleId: sale.id, err })
      );
    }

    void createReminderOnce({
      businessId: business.id,
      reminderType: 'transaction_needs_verification',
      scheduledDate: new Date(),
      message: `New payment of ${formatNaira(amount)} received. Please verify the transaction.`,
      referenceType: 'sales_transaction',
      referenceId: sale.id,
    })?.catch((err) =>
      logger.warn('Failed to create transaction_needs_verification reminder', {
        saleId: sale.id,
        err: err instanceof Error ? err.message : err,
      })
    );

    return true;
  } catch (err: any) {
    if (err.code === 'P2002') {
      logger.info('Concurrent DVA transfer already recorded', { reference, businessId: business.id });
      return true;
    }
    logger.error('Failed to process DVA transfer webhook atomically', {
      reference,
      err: err instanceof Error ? err.message : err,
    });
    throw err;
  }
}
