import prisma, { TxClient } from '@/lib/prisma';
import logger from '@/lib/logger';
import { AppError } from '@/middleware/errorHandler';
import { logAudit } from '@/lib/audit';
import { verifyBusinessOwnership, verifyBusinessAccess } from '@/lib/ownership';
import { assertMonthNotLocked, toNumber } from '@/shared/helpers';
import { ACCRUAL_SALE_INCLUDE, isAccrualLinked } from '@/shared/helpers/accrual';
import { emitToAdmins } from '@/services/admin/realtime-admin.helper';

/**
 * Guards both reassignment entry points (`applyVerification` and
 * `applyReassignment`) against moving an accrual sale. See `shared/helpers/accrual`
 * for why the check keys on the linked relations rather than `source`.
 */
function assertSaleIsReassignable(sale: {
  source: string;
  customerId?: string | null;
  invoice?: { id: string; invoiceNumber: string } | null;
  creditOrigin?: { id: string } | null;
  creditPayment?: { id: string } | null;
}) {
  if (
    sale.creditOrigin ||
    sale.creditPayment ||
    sale.source === 'credit' ||
    sale.source === 'store_voucher' ||
    sale.customerId != null
  ) {
    throw new AppError(
      409,
      'This sale is linked to an accrual transaction (credit or store voucher), so it cannot be moved to another business.',
      'ACCRUAL_SALE_IMMUTABLE'
    );
  }
}

// ─── Verification ───────────────────────────────────────────

export async function getUnverifiedSales(
  userId: string,
  businessId: string,
  query?: { page?: number; limit?: number }
) {
  await verifyBusinessAccess(userId, businessId, 'sales.read');

  const page = query?.page ?? 1;
  const limit = query?.limit ?? 50;
  const offset = (page - 1) * limit;

  const [sales, total] = await Promise.all([
    prisma.salesTransaction.findMany({
      where: { businessId, needsVerification: true },
      skip: offset,
      take: limit,
      orderBy: { transactionDate: 'desc' },
      include: ACCRUAL_SALE_INCLUDE,
    }),
    prisma.salesTransaction.count({
      where: { businessId, needsVerification: true },
    }),
  ]);

  const totalPages = Math.ceil(total / limit);

  return {
    data: sales.map((sale) => ({ ...sale, accrualLinked: isAccrualLinked(sale) })),
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

// Legacy identifiers that older clients / scripts still send. They are not
// real classification names — map them to the canonical seeded names so old
// callers don't get INVALID_CLASSIFICATION. The canonical DB name always wins.
const LEGACY_CLASSIFICATION_ALIASES: Record<string, string> = {
  sale: 'Product Sale',
  sales_revenue: 'Product Sale',
  service_revenue: 'Service Revenue',
  business_income: 'Product Sale',
  transfer: 'Transfer Between Accounts',
  transfer_between_accounts: 'Transfer Between Accounts',
  loan: 'Loan Received',
  gift: 'Gift Received',
  grant: 'Grant Received',
  capital: 'Capital Injection',
  capital_injection: 'Capital Injection',
  credit_settlement: 'Credit / Debt Settlement',
  debt_settlement: 'Credit / Debt Settlement',
  credit_payment: 'Credit / Debt Settlement',
  credit_debt_settlement: 'Credit / Debt Settlement',
  other: 'Other',
};

function slugifyClassification(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/**
 * When a sale is reassigned to another business, cascade the move to the linked
 * Invoice so the invoice and sale stay synchronized under the target business.
 */
async function cascadeInvoiceReassignment(
  client: TxClient,
  saleId: string,
  targetBusinessId: string,
  effectiveSourceBusinessId: string,
  actingUserId: string
) {
  const linkedInvoice = await client.invoice.findFirst({
    where: { linkedSaleId: saleId },
  });

  if (!linkedInvoice) return null;

  // Check for invoice number collision in target business
  const collision = await client.invoice.findUnique({
    where: {
      businessId_invoiceNumber: {
        businessId: targetBusinessId,
        invoiceNumber: linkedInvoice.invoiceNumber,
      },
    },
  });

  let targetInvoiceNumber = linkedInvoice.invoiceNumber;
  if (collision && collision.id !== linkedInvoice.id) {
    const year = new Date(linkedInvoice.issueDate || new Date()).getUTCFullYear();
    const existingInvoices = await client.invoice.findMany({
      where: {
        businessId: targetBusinessId,
        invoiceNumber: { startsWith: `INV-${year}-` },
      },
      select: { invoiceNumber: true },
    });
    let maxSeq = 0;
    for (const inv of existingInvoices) {
      const parts = inv.invoiceNumber.split('-');
      const seq = parseInt(parts[2], 10);
      if (!isNaN(seq) && seq > maxSeq) maxSeq = seq;
    }
    targetInvoiceNumber = `INV-${year}-${String(maxSeq + 1).padStart(3, '0')}`;
  }

  const updatedInvoice = await client.invoice.update({
    where: { id: linkedInvoice.id },
    data: {
      businessId: targetBusinessId,
      invoiceNumber: targetInvoiceNumber,
      customerId: null, // Detach customer since customer records are scoped to source business
    },
  });

  // If invoice number changed, sync referenceId and description on the sale
  if (targetInvoiceNumber !== linkedInvoice.invoiceNumber) {
    await client.salesTransaction.update({
      where: { id: saleId },
      data: {
        referenceId: targetInvoiceNumber,
        description: `Invoice ${targetInvoiceNumber} — ${linkedInvoice.customerName}`,
      },
    });
  }

  await logAudit(
    {
      userId: actingUserId,
      businessId: targetBusinessId,
      action: 'invoice.reassigned',
      resourceType: 'invoice',
      resourceId: linkedInvoice.id,
      oldData: {
        businessId: effectiveSourceBusinessId,
        invoiceNumber: linkedInvoice.invoiceNumber,
      },
      newData: {
        businessId: targetBusinessId,
        invoiceNumber: targetInvoiceNumber,
      },
    },
    client
  );

  return updatedInvoice;
}

export type VerificationActor =
  | { kind: 'user'; userId: string }
  | { kind: 'admin'; adminUserId: string };

export interface ApplyVerificationOptions {
  saleId: string;
  classificationName: string;
  sourceBusinessId?: string;
  actor: VerificationActor;
  meta?: { customerName?: string; description?: string; targetBusinessId?: string };
  tx?: TxClient;
}

export async function applyVerification({
  saleId,
  classificationName,
  sourceBusinessId,
  actor,
  meta,
  tx,
}: ApplyVerificationOptions) {
  const db = tx ?? prisma;

  const sale = await db.salesTransaction.findUnique({
    where: { id: saleId },
    include: ACCRUAL_SALE_INCLUDE,
  });

  if (!sale) {
    throw new AppError(404, 'Sale not found', 'SALE_NOT_FOUND');
  }

  if (sourceBusinessId && sale.businessId !== sourceBusinessId) {
    throw new AppError(404, 'Sale not found or does not belong to this business', 'SALE_NOT_FOUND');
  }

  if (!sale.needsVerification) {
    // Idempotent: already verified
    return sale;
  }

  // Handle business reassignment if specified
  let targetBusinessId: string | undefined = undefined;
  if (meta?.targetBusinessId && meta.targetBusinessId !== sale.businessId) {
    assertSaleIsReassignable(sale);

    const targetBusiness = await db.business.findUnique({ where: { id: meta.targetBusinessId } });
    if (!targetBusiness) {
      throw new AppError(404, 'Target business not found', 'BUSINESS_NOT_FOUND');
    }

    const currentBusiness = await db.business.findUnique({ where: { id: sale.businessId } });
    if (!currentBusiness) {
      throw new AppError(404, 'Source business not found', 'BUSINESS_NOT_FOUND');
    }

    if (currentBusiness.userId !== targetBusiness.userId) {
      throw new AppError(403, 'Target business must belong to the same merchant', 'FORBIDDEN');
    }

    if (actor.kind === 'user') {
      await verifyBusinessOwnership(actor.userId, meta.targetBusinessId, db);
    }

    await assertMonthNotLocked(sale.businessId, sale.transactionDate, db);
    await assertMonthNotLocked(meta.targetBusinessId, sale.transactionDate, db);

    if (sale.referenceId) {
      const existingRef = await db.salesTransaction.findFirst({
        where: {
          businessId: meta.targetBusinessId,
          source: sale.source,
          referenceId: sale.referenceId,
        },
        select: { id: true },
      });

      if (existingRef) {
        throw new AppError(
          409,
          `Target business already has a transaction with reference ${sale.referenceId}`,
          'DUPLICATE_SALES_REFERENCE'
        );
      }
    }
    targetBusinessId = meta.targetBusinessId;
  }

  // Resolve classification
  let classification =
    (await db.transactionClassification.findFirst({
      where: {
        OR: [
          { name: classificationName },
          { name: { equals: classificationName, mode: 'insensitive' } },
        ],
        isActive: true,
      },
    })) ??
    (await (async () => {
      const aliased = LEGACY_CLASSIFICATION_ALIASES[classificationName.trim().toLowerCase()];
      if (!aliased) return null;
      return db.transactionClassification.findFirst({
        where: { name: aliased, isActive: true },
      });
    })()) ??
    (await (async () => {
      const slug = slugifyClassification(classificationName);
      if (!slug) return null;
      const active = await db.transactionClassification.findMany({
        where: { isActive: true },
      });
      return active.find((c) => slugifyClassification(c.name) === slug) ?? null;
    })());

  if (!classification) {
    throw new AppError(400, `Classification "${classificationName}" not found`, 'INVALID_CLASSIFICATION');
  }

  const isTaxable = classification.taxTreatment === 'taxable';
  const isRevenue = classification.isRevenue;
  const actingUserId = actor.kind === 'admin' ? actor.adminUserId : actor.userId;

  const executeVerification = async (client: TxClient) => {
    const updated = await client.salesTransaction.update({
      where: { id: saleId },
      data: {
        needsVerification: false,
        verifiedAt: new Date(),
        verifiedBy: actingUserId,
        finalClassification: classification.name,
        classificationId: classification.id,
        status: 'confirmed',
        isTaxable,
        ...(targetBusinessId ? { businessId: targetBusinessId } : {}),
        ...(meta?.customerName !== undefined && meta.customerName !== ''
          ? { customerName: meta.customerName }
          : {}),
        ...(meta?.description !== undefined && meta.description !== ''
          ? { description: meta.description }
          : {}),
      },
    });

    if (targetBusinessId) {
      await client.walletTransaction.updateMany({
        where: { linkedSaleId: saleId },
        data: { businessId: targetBusinessId },
      });

      await cascadeInvoiceReassignment(
        client,
        saleId,
        targetBusinessId,
        sale.businessId,
        actingUserId
      );
    }

    await logAudit(
      {
        userId: actingUserId,
        businessId: targetBusinessId || sale.businessId,
        action: isRevenue ? 'sale.verified' : 'sale.reclassified',
        resourceType: 'sales_transaction',
        resourceId: saleId,
        newData: {
          classification: classification.name,
          category: classification.category,
          isTaxable,
          isRevenue,
          verifiedBy: actingUserId,
          ...(targetBusinessId ? { reassignedFromBusinessId: sale.businessId } : {}),
        },
      },
      client
    );

    return updated;
  };

  const updatedSale = tx ? await executeVerification(tx) : await prisma.$transaction(executeVerification);

  logger.info('Transaction classified', {
    saleId,
    businessId: targetBusinessId || sale.businessId,
    originalBusinessId: sale.businessId,
    actorUserId: actingUserId,
    actorKind: actor.kind,
    classification: classification.name,
    category: classification.category,
    isTaxable,
    isRevenue,
  });

  if (actor.kind !== 'admin') {
    void emitToAdmins({
      type: 'unverified_inflow_verified',
      saleId: updatedSale.id,
      businessId: updatedSale.businessId,
      timestamp: new Date().toISOString(),
    }).catch((err) =>
      logger.warn('Failed to emit unverified_inflow_verified to admins on user verification', {
        saleId: updatedSale.id,
        err,
      })
    );
  }

  return updatedSale;
}

export async function verifySale(
  userId: string,
  businessId: string,
  saleId: string,
  classificationName: string,
  tx?: TxClient,
  meta?: { customerName?: string; description?: string; targetBusinessId?: string }
) {
  const db = tx ?? prisma;
  await verifyBusinessAccess(userId, businessId, 'sales.update', db);
  return applyVerification({
    saleId,
    classificationName,
    sourceBusinessId: businessId,
    actor: { kind: 'user', userId },
    meta,
    tx,
  });
}

export async function reclassifySale(
  userId: string,
  businessId: string,
  saleId: string,
  classificationName: string,
  tx?: TxClient,
  meta?: { targetBusinessId?: string }
) {
  return verifySale(userId, businessId, saleId, classificationName, tx, meta);
}

export interface ApplyReassignmentOptions {
  saleId: string;
  sourceBusinessId?: string;
  targetBusinessId: string;
  actor: VerificationActor;
  tx?: TxClient;
}

export async function applyReassignment({
  saleId,
  sourceBusinessId,
  targetBusinessId,
  actor,
  tx,
}: ApplyReassignmentOptions) {
  const db = tx ?? prisma;

  // 1. Fetch sale and verify existence
  const sale = await db.salesTransaction.findUnique({
    where: { id: saleId },
    include: ACCRUAL_SALE_INCLUDE,
  });

  if (!sale) {
    throw new AppError(404, 'Sale not found', 'SALE_NOT_FOUND');
  }

  const effectiveSourceBusinessId = sourceBusinessId ?? sale.businessId;

  if (sale.businessId !== effectiveSourceBusinessId) {
    throw new AppError(404, 'Sale not found or does not belong to this business', 'SALE_NOT_FOUND');
  }

  if (effectiveSourceBusinessId === targetBusinessId) {
    throw new AppError(400, 'Target business must be different from source business', 'INVALID_TARGET_BUSINESS');
  }

  assertSaleIsReassignable(sale);

  // 2. Fetch businesses and verify target exists and belongs to the same merchant
  const [sourceBusiness, targetBusiness] = await Promise.all([
    db.business.findUnique({ where: { id: effectiveSourceBusinessId } }),
    db.business.findUnique({ where: { id: targetBusinessId } }),
  ]);

  if (!sourceBusiness) {
    throw new AppError(404, 'Source business not found', 'BUSINESS_NOT_FOUND');
  }

  if (!targetBusiness) {
    throw new AppError(404, 'Target business not found', 'BUSINESS_NOT_FOUND');
  }

  if (sourceBusiness.userId !== targetBusiness.userId) {
    throw new AppError(403, 'Target business must belong to the same merchant', 'FORBIDDEN');
  }

  // 3. Check month locking for both businesses
  await assertMonthNotLocked(effectiveSourceBusinessId, sale.transactionDate, db);
  await assertMonthNotLocked(targetBusinessId, sale.transactionDate, db);

  // 4. Duplicate reference check on target business if referenceId exists
  if (sale.referenceId) {
    const existingRef = await db.salesTransaction.findFirst({
      where: {
        businessId: targetBusinessId,
        source: sale.source,
        referenceId: sale.referenceId,
      },
      select: { id: true },
    });

    if (existingRef) {
      throw new AppError(
        409,
        `Target business already has a transaction with reference ${sale.referenceId}`,
        'DUPLICATE_SALES_REFERENCE'
      );
    }
  }

  // 5. Execute transaction
  const executeReassignment = async (client: TxClient) => {
    const updated = await client.salesTransaction.update({
      where: { id: saleId },
      data: { businessId: targetBusinessId },
    });

    await client.walletTransaction.updateMany({
      where: { linkedSaleId: saleId },
      data: { businessId: targetBusinessId },
    });

    const actingUserId = actor.kind === 'admin' ? actor.adminUserId : actor.userId;

    await cascadeInvoiceReassignment(
      client,
      saleId,
      targetBusinessId,
      effectiveSourceBusinessId,
      actingUserId
    );

    await logAudit(
      {
        userId: actingUserId,
        businessId: targetBusinessId,
        action: 'sale.reassigned',
        resourceType: 'sales_transaction',
        resourceId: saleId,
        oldData: {
          businessId: effectiveSourceBusinessId,
          businessName: sourceBusiness.businessName,
          amount: toNumber(sale.amount),
        },
        newData: {
          businessId: targetBusinessId,
          businessName: targetBusiness.businessName,
          amount: toNumber(sale.amount),
          reassignedBy: actor.kind === 'admin' ? 'admin' : 'user',
        },
      },
      client
    );

    return updated;
  };

  const updatedSale = tx ? await executeReassignment(tx) : await prisma.$transaction(executeReassignment);

  logger.info('Sale reassigned to another business', {
    saleId,
    sourceBusinessId: effectiveSourceBusinessId,
    targetBusinessId,
    amount: toNumber(sale.amount),
    actorKind: actor.kind,
  });

  return updatedSale;
}

/**
 * Reassigns a sales transaction from one business to another.
 *
 * Requirements & Guards:
 * 1. The user must own both the source business and the target business.
 * 2. Neither business's month containing transactionDate may be locked/finalized.
 * 3. The target business cannot already have a transaction with the same (source, referenceId).
 * 4. Must be executed atomically in a transaction with audit logging.
 */
export async function reassignSaleBusiness(
  userId: string,
  sourceBusinessId: string,
  saleId: string,
  targetBusinessId: string
) {
  if (sourceBusinessId === targetBusinessId) {
    throw new AppError(400, 'Target business must be different from source business', 'INVALID_TARGET_BUSINESS');
  }

  // 1. Verify ownership of both businesses
  await Promise.all([
    verifyBusinessOwnership(userId, sourceBusinessId),
    verifyBusinessOwnership(userId, targetBusinessId),
  ]);

  return applyReassignment({
    saleId,
    sourceBusinessId,
    targetBusinessId,
    actor: { kind: 'user', userId },
  });
}
