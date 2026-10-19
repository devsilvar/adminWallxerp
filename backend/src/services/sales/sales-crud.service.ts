import prisma, { TxClient } from '@/lib/prisma';
import logger from '@/lib/logger';
import { AppError } from '@/middleware/errorHandler';
import { logAudit } from '@/lib/audit';
import { CreateSaleInput, UpdateSaleInput, SaleLineItemInput } from '@/validators/sales.validator';
import { verifyBusinessAccess } from '@/lib/ownership';
import { assertMonthNotLocked, toNumber } from '@/shared/helpers';
import { ACCRUAL_SALE_INCLUDE } from '@/shared/helpers/accrual';
import {
  debitCardForSale,
  creditChange,
  restoreVoucherBalanceForSale,
} from '@/services/customer-card.service';
import { findOrCreateCustomerByIdentity } from '@/services/customer-resolver.service';

const TX_OPTIONS = { maxWait: 15000, timeout: 30000 };

// ─── Helpers ────────────────────────────────────────────────

/**
 * Computes line totals and grand total for a basket of sale items.
 * Uses the same 2-decimal rounding as invoice computeTotals.
 */
export function computeSaleTotal(items: SaleLineItemInput[]): {
  total: number;
  lines: Array<{
    name: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
    sortOrder: number;
  }>;
} {
  let total = 0;
  const lines = items.map((item, index) => {
    const lineTotal = Math.round(item.quantity * item.unitPrice * 100) / 100;
    total = Math.round((total + lineTotal) * 100) / 100;
    return {
      name: item.name,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      lineTotal,
      sortOrder: index,
    };
  });
  return { total, lines };
}

// ─── CRUD ───────────────────────────────────────────────────

export async function createSale(
  userId: string,
  businessId: string,
  input: CreateSaleInput,
  tx?: TxClient
) {
  const db = tx ?? prisma;

  const _access = await verifyBusinessAccess(userId, businessId, 'sales.create', db);
  await assertMonthNotLocked(businessId, input.transactionDate, db);

  const hasItems = input.items !== undefined && input.items.length > 0;
  const { total: computedTotal, lines } = hasItems
    ? computeSaleTotal(input.items!)
    : { total: 0, lines: [] };
  const effectiveAmount = hasItems ? computedTotal : input.amount!;

  let description = input.description;
  if (!description && hasItems) {
    const itemSummary = input.items!.map((i) => `${i.name} (${i.quantity})`).join(', ');
    description = `${input.items!.length} item${input.items!.length > 1 ? 's' : ''}: ${itemSummary}`.slice(0, 500);
  }

  // Pre-validate store voucher redemption requirements before starting transaction
  const voucherCustomerId =
    input.source === 'store_voucher'
      ? (input.metadata?.voucherCustomerId ?? (input as any).customerId)
      : undefined;

  // ─── Capture voucher PIN credentials BEFORE transaction (will be stripped from metadata) ───
  let voucherAuth: { voucherPin: string; voucherLast4: string } | null = null;

  if (input.source === 'store_voucher') {
    if (!voucherCustomerId) {
      throw new AppError(
        400,
        'voucherCustomerId is required in metadata for store voucher redemption',
        'VOUCHER_CUSTOMER_REQUIRED'
      );
    }

    const voucherPin = input.metadata?.voucherPin?.toString().trim();
    const voucherLast4 = input.metadata?.voucherLast4?.toString().trim();

    if (!voucherPin || !voucherLast4) {
      throw new AppError(
        400,
        'voucherPin and voucherLast4 are required in metadata for store voucher payment',
        'VOUCHER_AUTH_REQUIRED'
      );
    }

    // Capture in closure (will NOT be persisted in metadata)
    voucherAuth = { voucherPin, voucherLast4 };
  }

  const changeCreditCustomerId =
    input.source === 'cash' ? input.metadata?.changeCreditCustomerId : undefined;
  const changeCreditAmount = changeCreditCustomerId
    ? Number(input.metadata?.changeCreditAmount ?? 0)
    : 0;

  const saleCustomerId =
    voucherCustomerId ?? changeCreditCustomerId ?? input.customerId ?? input.metadata?.customerId ?? null;

  const runCreate = async (client: TxClient) => {
    // Check month lock inside transaction against live state
    await assertMonthNotLocked(businessId, input.transactionDate, client);

    let effectiveCustomerId: string | null = saleCustomerId;
    let autoCreated: boolean | undefined;

    // Validate foreign customer if explicit customerId passed
    if (input.customerId) {
      const cust = await client.customer.findFirst({
        where: { id: input.customerId, businessId },
        select: { id: true },
      });
      if (!cust) {
        throw new AppError(400, 'Invalid customer', 'INVALID_CUSTOMER');
      }
    }

    // Auto-capture fallback if no customer linked yet but phone or email provided
    const customerPhone = input.metadata?.customerPhone;
    const customerEmail = input.metadata?.customerEmail;
    if (!effectiveCustomerId && (customerPhone || customerEmail)) {
      const resolved = await findOrCreateCustomerByIdentity(
        businessId,
        {
          name: input.customerName || 'Walk-in Customer',
          phone: customerPhone,
          email: customerEmail,
        },
        client
      );
      if (resolved) {
        effectiveCustomerId = resolved.customer.id;
        autoCreated = resolved.autoCreated;
      }
    }

    // Strip plaintext PIN credentials from metadata before persisting
    const sanitizedMetadata = input.metadata !== undefined && typeof input.metadata === 'object'
      ? { ...input.metadata }
      : {};
    delete sanitizedMetadata.voucherPin;
    delete sanitizedMetadata.voucherLast4;

    const sale = await client.salesTransaction.create({
      data: {
        businessId,
        amount: effectiveAmount,
        source: input.source,
        // Canonical settled status — matches the tax engine, verification, and
        // the DB reality (all settled rows are 'confirmed').
        status: input.status ?? 'confirmed',
        referenceId: input.referenceId,
        description,
        customerName: input.customerName,
        transactionDate: input.transactionDate,
        metadata: sanitizedMetadata,
        needsVerification: input.needsVerification ?? false,
        createdBy: userId,
        customerId: effectiveCustomerId,
        isTaxable: true,
        ...(hasItems
          ? {
              items: {
                createMany: {
                  data: lines,
                },
              },
            }
          : {}),
      },
      include: {
        items: {
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    if (input.source === 'store_voucher' && voucherCustomerId && voucherAuth) {
      await debitCardForSale(
        userId,
        businessId,
        voucherCustomerId,
        effectiveAmount,
        sale.id,
        input.referenceId ?? null,
        client,
        voucherAuth // Pass captured PIN credentials (not persisted)
      );
    }

    if (input.source === 'cash' && changeCreditCustomerId && changeCreditAmount > 0) {
      await creditChange(
        userId,
        businessId,
        changeCreditCustomerId,
        {
          amount: changeCreditAmount,
          receiptNumber: input.referenceId ?? null,
          receiptDate: input.transactionDate,
          notes: `Change credited from cash sale ${input.referenceId ?? sale.id}`,
        },
        client
      );
    }

    await logAudit(
      {
        userId,
        businessId,
        action: 'sale.created',
        resourceType: 'sales_transaction',
        resourceId: sale.id,
        newData: {
          amount: effectiveAmount,
          source: input.source,
          transactionDate: input.transactionDate.toISOString(),
          ...(hasItems ? { itemCount: lines.length } : {}),
        },
      },
      client
    );

    return Object.assign(sale, {
      meta: {
        customerId: effectiveCustomerId,
        customerAutoCreated: autoCreated,
      },
    });
  };

  // ─── Execute transaction with PIN failure handling ───
  let sale;
  try {
    sale = tx
      ? await runCreate(tx)
      : await prisma.$transaction((innerTx) => runCreate(innerTx as TxClient), TX_OPTIONS);
  } catch (err: any) {
    // If voucher auth failed, persist the attempt increment in a SEPARATE transaction
    // (the sale TX rolled back, so attempts were lost)
    if (
      err?.code === 'VOUCHER_AUTH_FAILED' &&
      input.source === 'store_voucher' &&
      voucherCustomerId
    ) {
      try {
        const card = await prisma.customerCard.findUnique({
          where: { customerId: voucherCustomerId },
          select: { id: true, pinAttempts: true },
        });

        if (card) {
          const newAttempts = card.pinAttempts + 1;
          const { nextLockDuration } = await import('@/services/voucher-pin.service');
          const lockDurationMs = nextLockDuration(newAttempts);
          const pinLockedUntil = lockDurationMs > 0 ? new Date(Date.now() + lockDurationMs) : null;

          // Use atomic increment to avoid race conditions
          await prisma.customerCard.update({
            where: { id: card.id },
            data: { 
              pinAttempts: { increment: 1 },  // Atomic increment
              pinLockedUntil 
            },
          });

          logger.warn('Voucher PIN attempt failed - incremented attempts in separate TX', {
            businessId,
            customerId: voucherCustomerId,
            cardId: card.id,
            newAttempts,
            locked: !!pinLockedUntil,
          });
        }
      } catch (persistErr) {
        logger.error('Failed to persist voucher PIN attempt after auth failure', {
          error: persistErr instanceof Error ? persistErr.message : String(persistErr),
          customerId: voucherCustomerId,
        });
      }
    }

    // Re-throw original error
    throw err;
  }

  logger.info('Sale created', { saleId: sale.id, businessId, userId });

  // ─── Post-commit: Dispatch deduction receipt email ───
  if (input.source === 'store_voucher' && voucherCustomerId) {
    const { dispatchVoucherDeductionEmail } = await import('@/services/email-dispatch.service');
    void dispatchVoucherDeductionEmail({
      businessId,
      customerId: voucherCustomerId,
      amountDebited: effectiveAmount,
      receiptNumber: input.referenceId ?? null,
      saleId: sale.id,
      transactionDate: input.transactionDate,
    });
  }

  return sale;
}

export async function listSales(
  userId: string,
  businessId: string,
  query: {
    page: number;
    limit: number;
    source?: string;
    status?: string;
    startDate?: Date;
    endDate?: Date;
    month?: number;
    year?: number;
    search?: string;
    customerId?: string;
    minAmount?: number;
    maxAmount?: number;
  }
) {
  const access = await verifyBusinessAccess(userId, businessId, 'sales.read');

  const where: any = { businessId };
  const andConditions: any[] = [];

  if (access.role === 'sales_staff') {
    andConditions.push({
      OR: [
        { createdBy: userId },
        { source: 'bank_transfer' },
        { source: 'store_voucher' },
      ],
    });
  }

  if (query.source) where.source = query.source;
  if (query.status) where.status = query.status;
  if (query.customerId) where.customerId = query.customerId;

  // Amount range filter
  if (query.minAmount !== undefined || query.maxAmount !== undefined) {
    where.amount = {};
    if (query.minAmount !== undefined) where.amount.gte = query.minAmount;
    if (query.maxAmount !== undefined) where.amount.lte = query.maxAmount;
  }

  // Search filter (customerName, description, referenceId)
  if (query.search && query.search.trim()) {
    const term = query.search.trim();
    andConditions.push({
      OR: [
        { customerName: { contains: term, mode: 'insensitive' } },
        { description: { contains: term, mode: 'insensitive' } },
        { referenceId: { contains: term, mode: 'insensitive' } },
      ],
    });
  }

  if (andConditions.length > 0) {
    where.AND = andConditions;
  }

  // Date range filter
  if (query.startDate || query.endDate) {
    where.transactionDate = {};
    if (query.startDate) where.transactionDate.gte = query.startDate;
    if (query.endDate) where.transactionDate.lte = query.endDate;
  }

  if (query.month && query.year) {
    const monthStart = new Date(Date.UTC(query.year, query.month - 1, 1));
    const monthEnd = new Date(Date.UTC(query.year, query.month, 0));
    where.transactionDate = { gte: monthStart, lte: monthEnd };
  }

  const offset = (query.page - 1) * query.limit;

  const [sales, total] = await Promise.all([
    prisma.salesTransaction.findMany({
      where,
      skip: offset,
      take: query.limit,
      // Secondary sort by createdAt so bulk imports sharing a transactionDate
      // surface newest-first instead of in arbitrary Postgres order.
      orderBy: [{ transactionDate: 'desc' }, { createdAt: 'desc' }],
      include: {
        _count: {
          select: { items: true },
        },
        ...ACCRUAL_SALE_INCLUDE,
      },
    }),
    prisma.salesTransaction.count({ where }),
  ]);

  const totalPages = Math.ceil(total / query.limit);

  return {
    data: sales.map((sale) => ({
      ...sale,
      itemsCount: sale._count.items,
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

export async function getSaleById(userId: string, businessId: string, saleId: string) {
  const access = await verifyBusinessAccess(userId, businessId, 'sales.read');

  const sale = await prisma.salesTransaction.findUnique({
    where: { id: saleId },
    include: {
      items: {
        orderBy: { sortOrder: 'asc' },
      },
      ...ACCRUAL_SALE_INCLUDE,
    },
  });

  if (!sale || sale.businessId !== businessId) {
    throw new AppError(404, 'Sale not found', 'SALE_NOT_FOUND');
  }

  if (
    access.role === 'sales_staff' &&
    sale.createdBy !== userId &&
    sale.source !== 'bank_transfer' &&
    sale.source !== 'store_voucher'
  ) {
    throw new AppError(403, 'You can only view your own sales', 'PERMISSION_DENIED');
  }

  return sale;
}

export async function updateSale(
  userId: string,
  businessId: string,
  saleId: string,
  input: UpdateSaleInput,
  tx?: TxClient
) {
  const db = tx ?? prisma;

  const access = await verifyBusinessAccess(userId, businessId, 'sales.update', db);

  const existing = await db.salesTransaction.findUnique({
    where: { id: saleId },
    include: { items: true },
  });

  if (!existing || existing.businessId !== businessId) {
    throw new AppError(404, 'Sale not found', 'SALE_NOT_FOUND');
  }

  if (access.role === 'sales_staff' && existing.createdBy !== userId) {
    throw new AppError(403, 'You can only edit your own sales', 'PERMISSION_DENIED');
  }

  // Guard store_voucher financial immutability against in-place tampering
  if (existing.source === 'store_voucher') {
    const isTamperingAmount = input.amount !== undefined && toNumber(input.amount) !== toNumber(existing.amount);
    const isTamperingItems = input.items !== undefined;
    const isTamperingSource = input.source !== undefined && input.source !== 'store_voucher';

    if (isTamperingAmount || isTamperingItems || isTamperingSource) {
      throw new AppError(
        409,
        'Sales paid with store voucher cannot have their amount, items, or payment method edited directly. To correct a mistake, please reverse/void the sale to restore the customer voucher balance, then enter the correct sale.',
        'VOUCHER_SALE_FINANCIALLY_IMMUTABLE'
      );
    }
  }

  // Check lock on the EXISTING transaction date (can't edit a sale in a locked month)
  await assertMonthNotLocked(businessId, existing.transactionDate, db);

  // If the transaction date is changing, also check the NEW month isn't locked
  if (input.transactionDate && input.transactionDate.getTime() !== existing.transactionDate.getTime()) {
    await assertMonthNotLocked(businessId, input.transactionDate, db);
  }

  const runUpdate = async (client: TxClient | typeof prisma) => {
    const data: Record<string, any> = {};
    if (input.source !== undefined) data.source = input.source;
    if (input.status !== undefined) data.status = input.status;
    if (input.referenceId !== undefined) data.referenceId = input.referenceId;
    if (input.description !== undefined) data.description = input.description;
    if (input.customerName !== undefined) data.customerName = input.customerName;
    if (input.transactionDate !== undefined) data.transactionDate = input.transactionDate;
    if (input.metadata !== undefined) data.metadata = input.metadata;
    if (input.customerId !== undefined) {
      if (input.customerId) {
        const cust = await client.customer.findFirst({
          where: { id: input.customerId, businessId },
          select: { id: true },
        });
        if (!cust) {
          throw new AppError(400, 'Invalid customer', 'INVALID_CUSTOMER');
        }
      }
      data.customerId = input.customerId || null;
    }

    // Handle auto-restoration of customer store voucher balance on reversal/cancellation
    if (
      existing.source === 'store_voucher' &&
      input.status !== undefined &&
      ['reversed', 'cancelled'].includes(input.status) &&
      existing.status !== input.status
    ) {
      data.isTaxable = false; // Reversed sales are not taxable revenue
      await restoreVoucherBalanceForSale(
        userId,
        businessId,
        saleId,
        input.description || 'Sale reversed',
        client as TxClient
      );
    }

    let itemCount: number | undefined;

    if (input.items !== undefined) {
      if (input.items.length > 0) {
        const { total: computedTotal, lines } = computeSaleTotal(input.items);
        data.amount = computedTotal;
        itemCount = lines.length;

        // Atomically replace all lines
        await client.saleLineItem.deleteMany({ where: { saleId } });
        await client.saleLineItem.createMany({
          data: lines.map((line) => ({ ...line, saleId })),
        });
      } else {
        // items: [] -> basket converted to single amount
        await client.saleLineItem.deleteMany({ where: { saleId } });
        if (input.amount !== undefined) {
          data.amount = input.amount;
        }
        itemCount = 0;
      }
    } else if (input.amount !== undefined) {
      data.amount = input.amount;
    }

    const updated = await client.salesTransaction.update({
      where: { id: saleId },
      data,
      include: {
        items: {
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    logAudit(
      {
        userId,
        businessId,
        action: 'sale.updated',
        resourceType: 'sales_transaction',
        resourceId: saleId,
        oldData: { amount: Number(existing.amount), source: existing.source },
        newData: {
          ...input,
          ...(itemCount !== undefined ? { itemCount } : {}),
          ...(data.amount !== undefined ? { amount: data.amount } : {}),
        } as Record<string, any>,
      },
      tx ? (client as TxClient) : undefined
    );

    return updated;
  };

  const updated = tx
    ? await runUpdate(tx)
    : await prisma.$transaction((innerTx) => runUpdate(innerTx), TX_OPTIONS);

  logger.info('Sale updated', { saleId, businessId, userId });

  return updated;
}

export async function deleteSale(
  userId: string,
  businessId: string,
  saleId: string,
  tx?: TxClient
) {
  const db = tx ?? prisma;

  await verifyBusinessAccess(userId, businessId, 'sales.delete', db);

  const existing = await db.salesTransaction.findUnique({ where: { id: saleId } });

  if (!existing || existing.businessId !== businessId) {
    throw new AppError(404, 'Sale not found', 'SALE_NOT_FOUND');
  }

  await assertMonthNotLocked(businessId, existing.transactionDate, db);

  const runDelete = async (client: TxClient) => {
    // If a store_voucher sale is deleted, auto-restore the customer's balance
    if (existing.source === 'store_voucher') {
      await restoreVoucherBalanceForSale(
        userId,
        businessId,
        saleId,
        'Sale deleted',
        client
      );
    }

    await client.salesTransaction.delete({
      where: { id: saleId },
    });

    await logAudit(
      {
        userId,
        businessId,
        action: 'sale.deleted',
        resourceType: 'sales_transaction',
        resourceId: saleId,
        oldData: {
          amount: Number(existing.amount),
          source: existing.source,
          description: existing.description,
        },
      },
      client
    );
  };

  if (tx) {
    await runDelete(tx);
  } else {
    await prisma.$transaction((innerTx) => runDelete(innerTx as TxClient), TX_OPTIONS);
  }

  logger.info('Sale deleted', { saleId, businessId, userId });

  return { message: 'Sale deleted successfully' };
}
