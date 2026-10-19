/**
 * Customer 360 & Master Data Management Service
 *
 * Implements:
 * - Customer 360 detail query with computed financial KPIs
 * - Unified customer history timeline across Sales, Invoices, Credits, and Vouchers
 * - Customer update and soft-archive management with phone collision deduplication
 * - Customer deletion guard protecting foreign-key history
 *
 * Invariant: Master data only. Never imports or calls assertMonthNotLocked,
 * isMonthLockedOrFinalized, or resolveTransactionDateForLockedMonth.
 *
 * @author WallX Engineering Team
 */

import prisma from '@/lib/prisma';
import { Prisma, CustomerCardLedger } from '@prisma/client';
import { AppError } from '@/middleware/errorHandler';
import { logAudit } from '@/lib/audit';
import { verifyBusinessAccess } from '@/lib/ownership';
import { toNumber } from '@/shared/helpers/number';
import { SETTLED_SALE_STATUSES } from '@/shared/helpers/settled-status';
import { normalizePhone } from './customer-resolver.service';
import type {
  UpdateCustomerInput,
  CustomerHistoryQuery,
} from '@/validators/customer-card.validator';

export interface CustomerKpis {
  totalSpent: number;
  orderCount: number;
  avgOrder: number;
  lastPurchaseAt: Date | null;
  firstSeenAt: Date | null;
  outstandingCredit: number;
  voucherBalance: number;
  totalInvoices: number;
  totalCredits: number;
  totalCreditPayments: number;
}

export interface CustomerDetailResult {
  customer: {
    id: string;
    businessId: string;
    name: string;
    email: string | null;
    phone: string | null;
    address: string | null;
    city: string | null;
    state: string | null;
    taxId: string | null;
    notes: string | null;
    isActive: boolean;
    voucherBonusPct: number | null;
    createdAt: Date;
    updatedAt: Date;
  };
  card: {
    id: string;
    cardCode: string;
    balance: number;
    isActive: boolean;
    createdAt: Date;
  } | null;
  kpis: CustomerKpis;
}

export interface TimelineItem {
  id: string;
  kind: 'sale' | 'invoice' | 'credit' | 'credit_payment' | 'voucher';
  date: Date;
  amount: number;
  status: string;
  title: string;
  subtitle?: string;
  refId?: string;
  notes?: string;
  raw?: Record<string, unknown>;
}

export interface CustomerHistoryResult {
  data: TimelineItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

/**
 * Retrieve full Customer 360 detail and computed lifetime KPIs.
 * Note: Archived customers (isActive: false) remain viewable by ID.
 * Lock-free: Does not check sales or tax period locks.
 */
export async function getCustomerDetail(
  userId: string,
  businessId: string,
  customerId: string
): Promise<CustomerDetailResult> {
  await verifyBusinessAccess(userId, businessId, 'customers.read');

  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    include: {
      card: {
        select: {
          id: true,
          cardCode: true,
          balance: true,
          isActive: true,
          createdAt: true,
        },
      },
    },
  });

  if (!customer || customer.businessId !== businessId) {
    throw new AppError(404, 'Customer not found', 'CUSTOMER_NOT_FOUND');
  }

  // Parallel KPI aggregation across disparate evidence tables
  const [salesAgg, creditAgg, creditCount, invoiceCount, creditPaymentCount] =
    await Promise.all([
      prisma.salesTransaction.aggregate({
        where: {
          businessId,
          customerId,
          status: { in: SETTLED_SALE_STATUSES },
        },
        _sum: { amount: true },
        _count: true,
        _max: { transactionDate: true },
        _min: { transactionDate: true },
      }),
      prisma.customerCredit.aggregate({
        where: {
          businessId,
          customerId,
          status: { in: ['unpaid', 'partially_paid', 'overdue'] },
        },
        _sum: { balance: true },
      }),
      prisma.customerCredit.count({
        where: { businessId, customerId },
      }),
      prisma.invoice.count({
        where: { businessId, customerId },
      }),
      prisma.creditPayment.count({
        where: { credit: { businessId, customerId } },
      }),
    ]);

  const orderCount = salesAgg._count ?? 0;
  const totalSpent = toNumber(salesAgg._sum.amount);
  const avgOrder = orderCount > 0 ? Math.round((totalSpent / orderCount) * 100) / 100 : 0;
  const lastPurchaseAt = salesAgg._max.transactionDate ?? null;
  const firstSeenAt = salesAgg._min.transactionDate ?? customer.createdAt;
  const outstandingCredit = toNumber(creditAgg._sum.balance);
  const voucherBalance = customer.card ? toNumber(customer.card.balance) : 0;

  return {
    customer: {
      id: customer.id,
      businessId: customer.businessId,
      name: customer.name,
      email: customer.email,
      phone: customer.phone,
      address: customer.address,
      city: customer.city,
      state: customer.state,
      taxId: customer.taxId,
      notes: customer.notes,
      isActive: customer.isActive,
      voucherBonusPct: customer.voucherBonusPct ? toNumber(customer.voucherBonusPct) : null,
      createdAt: customer.createdAt,
      updatedAt: customer.updatedAt,
    },
    card: customer.card
      ? {
          id: customer.card.id,
          cardCode: customer.card.cardCode,
          balance: toNumber(customer.card.balance),
          isActive: customer.card.isActive,
          createdAt: customer.card.createdAt,
        }
      : null,
    kpis: {
      totalSpent,
      orderCount,
      avgOrder,
      lastPurchaseAt,
      firstSeenAt,
      outstandingCredit,
      voucherBalance,
      totalInvoices: invoiceCount,
      totalCredits: creditCount,
      totalCreditPayments: creditPaymentCount,
    },
  };
}

/**
 * Retrieve unified timeline history for a customer across Sales, Invoices, Credits,
 * Credit Repayments, and Store Card Vouchers.
 *
 * Slicing strategy: Fetches take: page * limit from each source to prevent missing items
 * when merged chronologically across disparate sources.
 * In-memory filter: `query.type` is applied in-memory after mapping because each kind
 * originates from a separate Prisma model.
 * Lock-free: Does not check sales or tax period locks.
 */
export async function getCustomerHistory(
  userId: string,
  businessId: string,
  customerId: string,
  query: CustomerHistoryQuery
): Promise<CustomerHistoryResult> {
  await verifyBusinessAccess(userId, businessId, 'customers.read');

  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { id: true, businessId: true },
  });

  if (!customer || customer.businessId !== businessId) {
    throw new AppError(404, 'Customer not found', 'CUSTOMER_NOT_FOUND');
  }

  const takeCount = query.page * query.limit;

  const term = query.search?.trim();

  // Build source-specific filter criteria
  const salesWhere: Prisma.SalesTransactionWhereInput = {
    businessId,
    customerId,
    ...(query.from || query.to
      ? {
          transactionDate: {
            ...(query.from ? { gte: query.from } : {}),
            ...(query.to ? { lte: query.to } : {}),
          },
        }
      : {}),
    ...(term
      ? {
          OR: [
            { referenceId: { contains: term, mode: 'insensitive' } },
            { description: { contains: term, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  const invoiceWhere: Prisma.InvoiceWhereInput = {
    businessId,
    customerId,
    ...(query.from || query.to
      ? {
          issueDate: {
            ...(query.from ? { gte: query.from } : {}),
            ...(query.to ? { lte: query.to } : {}),
          },
        }
      : {}),
    ...(term
      ? {
          OR: [
            { invoiceNumber: { contains: term, mode: 'insensitive' } },
            { notes: { contains: term, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  const creditWhere: Prisma.CustomerCreditWhereInput = {
    businessId,
    customerId,
    ...(query.from || query.to
      ? {
          issueDate: {
            ...(query.from ? { gte: query.from } : {}),
            ...(query.to ? { lte: query.to } : {}),
          },
        }
      : {}),
    ...(term
      ? {
          OR: [
            { description: { contains: term, mode: 'insensitive' } },
            { notes: { contains: term, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  // Card ledger lookup
  const card = await prisma.customerCard.findUnique({
    where: { customerId },
    select: { id: true },
  });

  const ledgerWhere: Prisma.CustomerCardLedgerWhereInput | null = card
    ? {
        cardId: card.id,
        ...(query.from || query.to
          ? {
              createdAt: {
                ...(query.from ? { gte: query.from } : {}),
                ...(query.to ? { lte: query.to } : {}),
              },
            }
          : {}),
        ...(term
          ? {
              OR: [
                { receiptNumber: { contains: term, mode: 'insensitive' } },
                { notes: { contains: term, mode: 'insensitive' } },
              ],
            }
          : {}),
      }
    : null;

  const [salesResult, invoicesResult, creditsResult, ledgersResult] = await Promise.all([
    Promise.all([
      prisma.salesTransaction.findMany({
        where: salesWhere,
        orderBy: { transactionDate: 'desc' },
        take: takeCount,
      }),
      prisma.salesTransaction.count({ where: salesWhere }),
    ]),
    Promise.all([
      prisma.invoice.findMany({
        where: invoiceWhere,
        orderBy: { issueDate: 'desc' },
        take: takeCount,
      }),
      prisma.invoice.count({ where: invoiceWhere }),
    ]),
    Promise.all([
      prisma.customerCredit.findMany({
        where: creditWhere,
        include: { payments: true },
        orderBy: { issueDate: 'desc' },
        take: takeCount,
      }),
      prisma.customerCredit.count({ where: creditWhere }),
    ]),
    ledgerWhere
      ? Promise.all([
          prisma.customerCardLedger.findMany({
            where: ledgerWhere,
            orderBy: { createdAt: 'desc' },
            take: takeCount,
          }),
          prisma.customerCardLedger.count({ where: ledgerWhere }),
        ])
      : Promise.resolve([[], 0] as [CustomerCardLedger[], number]),
  ]);

  const [sales, salesCount] = salesResult;
  const [invoices, invoicesCount] = invoicesResult;
  const [credits, creditsCount] = creditsResult;
  const [ledgers, ledgersCount] = ledgersResult;

  let timeline: TimelineItem[] = [];

  // Map sales
  for (const sale of sales) {
    timeline.push({
      id: sale.id,
      kind: 'sale',
      date: sale.transactionDate,
      amount: toNumber(sale.amount),
      status: sale.status,
      title: sale.description || `Sale (${sale.source.replace('_', ' ')})`,
      subtitle: sale.referenceId ? `Ref: ${sale.referenceId}` : undefined,
      refId: sale.referenceId || undefined,
      raw: { source: sale.source, isTaxable: sale.isTaxable },
    });
  }

  // Map invoices
  for (const inv of invoices) {
    timeline.push({
      id: inv.id,
      kind: 'invoice',
      date: inv.issueDate,
      amount: toNumber(inv.total),
      status: inv.status,
      title: `Invoice #${inv.invoiceNumber}`,
      subtitle: inv.notes || undefined,
      refId: inv.invoiceNumber,
      raw: { dueDate: inv.dueDate, vatRate: toNumber(inv.vatRate) },
    });
  }

  let creditPaymentsCount = 0;

  // Map credits and flattened credit payments
  for (const cr of credits) {
    timeline.push({
      id: cr.id,
      kind: 'credit',
      date: cr.issueDate,
      amount: toNumber(cr.totalAmount),
      status: cr.status,
      title: cr.description || 'Customer Credit (BNPL)',
      subtitle:
        cr.notes ||
        (cr.linkedSaleId === null ? '[Revenue deferred — issue month locked]' : undefined),
      refId: cr.id,
      raw: {
        balance: toNumber(cr.balance),
        amountPaid: toNumber(cr.amountPaid),
        dueDate: cr.dueDate,
        linkedSaleId: cr.linkedSaleId,
      },
    });

    if (cr.payments && cr.payments.length > 0) {
      creditPaymentsCount += cr.payments.length;
      for (const p of cr.payments) {
        timeline.push({
          id: p.id,
          kind: 'credit_payment',
          date: p.paymentDate,
          amount: toNumber(p.amount),
          status: 'confirmed',
          title: `Credit Payment (${p.paymentType.replace('_', ' ')})`,
          subtitle: p.notes || `For credit: ${cr.description || cr.id}`,
          refId: p.id,
          raw: { creditId: cr.id, isFullPayment: p.isFullPayment },
        });
      }
    }
  }

  // Map card ledgers
  for (const led of ledgers) {
    timeline.push({
      id: led.id,
      kind: 'voucher',
      date: led.createdAt,
      amount: toNumber(led.amount),
      status: 'completed',
      title: `Store Card ${led.type.replace('_', ' ')}`,
      subtitle: led.notes || (led.receiptNumber ? `Receipt: ${led.receiptNumber}` : undefined),
      refId: led.receiptNumber || undefined,
      raw: {
        balanceBefore: toNumber(led.balanceBefore),
        balanceAfter: toNumber(led.balanceAfter),
      },
    });
  }

  // Apply in-memory type filter if specified
  if (query.type) {
    timeline = timeline.filter((item) => item.kind === query.type);
  }

  // Sort descending by date
  timeline.sort((a, b) => b.date.getTime() - a.date.getTime());

  // Slice window for requested page
  const offset = (query.page - 1) * query.limit;
  const slicedData = timeline.slice(offset, offset + query.limit);

  const total = query.type
    ? timeline.length
    : salesCount + invoicesCount + creditsCount + creditPaymentsCount + ledgersCount;

  const totalPages = Math.ceil(total / query.limit) || 1;

  return {
    data: slicedData,
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
 * Update an existing customer record.
 * Handles phone collision deduplication against other active customers in the same business.
 * Lock-free: Does not check sales or tax period locks.
 */
export async function updateCustomer(
  userId: string,
  businessId: string,
  customerId: string,
  input: UpdateCustomerInput
) {
  await verifyBusinessAccess(userId, businessId, 'customers.manage');

  const existing = await prisma.customer.findUnique({
    where: { id: customerId },
  });

  if (!existing || existing.businessId !== businessId) {
    throw new AppError(404, 'Customer not found', 'CUSTOMER_NOT_FOUND');
  }

  // If phone is being modified, ensure no other active customer in this business has the same phone
  if (input.phone !== undefined && input.phone !== null && input.phone.trim() !== '') {
    const newDigits = normalizePhone(input.phone);
    if (newDigits) {
      const candidates = await prisma.customer.findMany({
        where: {
          businessId,
          isActive: true,
          id: { not: customerId },
          phone: { contains: newDigits.slice(-4) },
        },
      });

      for (const candidate of candidates) {
        const candidateDigits = normalizePhone(candidate.phone);
        if (!candidateDigits) continue;

        if (newDigits.length >= 10 && candidateDigits.length >= 10) {
          if (newDigits.slice(-10) === candidateDigits.slice(-10)) {
            throw new AppError(
              409,
              'A customer with this phone number already exists',
              'PHONE_ALREADY_EXISTS'
            );
          }
        } else if (newDigits === candidateDigits) {
          throw new AppError(
            409,
            'A customer with this phone number already exists',
            'PHONE_ALREADY_EXISTS'
          );
        }
      }
    }
  }

  const updateData: Prisma.CustomerUpdateInput = {};
  if (input.name !== undefined) updateData.name = input.name.trim();
  if (input.phone !== undefined) updateData.phone = input.phone ? input.phone.trim() : null;
  if (input.email !== undefined) updateData.email = input.email ? input.email.trim().toLowerCase() : null;
  if (input.address !== undefined) updateData.address = input.address ? input.address.trim() : null;
  if (input.city !== undefined) updateData.city = input.city ? input.city.trim() : null;
  if (input.state !== undefined) updateData.state = input.state ? input.state.trim() : null;
  if (input.taxId !== undefined) updateData.taxId = input.taxId ? input.taxId.trim() : null;
  if (input.notes !== undefined) updateData.notes = input.notes ? input.notes.trim() : null;
  if (input.isActive !== undefined) updateData.isActive = input.isActive;
  if (input.voucherBonusPct !== undefined) updateData.voucherBonusPct = input.voucherBonusPct;

  const updated = await prisma.customer.update({
    where: { id: customerId },
    data: updateData,
  });

  await logAudit({
    userId,
    businessId,
    action: 'customer.updated',
    resourceType: 'customer',
    resourceId: customerId,
    oldData: {
      name: existing.name,
      phone: existing.phone,
      email: existing.email,
      isActive: existing.isActive,
    },
    newData: {
      name: updated.name,
      phone: updated.phone,
      email: updated.email,
      isActive: updated.isActive,
    },
  });

  return {
    ...updated,
    voucherBonusPct: updated.voucherBonusPct ? toNumber(updated.voucherBonusPct) : null,
  };
}

/**
 * Delete a customer record if they have no financial history.
 * If any associated transactions, invoices, credits, or cards exist, throws 409 CUSTOMER_HAS_HISTORY.
 * This domain-level guard prevents foreign-key constraint violations on Invoice and Credit tables.
 * Lock-free: Does not check sales or tax period locks.
 */
export async function deleteCustomer(
  userId: string,
  businessId: string,
  customerId: string
) {
  await verifyBusinessAccess(userId, businessId, 'customers.manage');

  const existing = await prisma.customer.findUnique({
    where: { id: customerId },
  });

  if (!existing || existing.businessId !== businessId) {
    throw new AppError(404, 'Customer not found', 'CUSTOMER_NOT_FOUND');
  }

  // Verify zero history across all linked models
  const [salesCount, invoiceCount, creditCount, cardLedgerCount] = await Promise.all([
    prisma.salesTransaction.count({ where: { customerId } }),
    prisma.invoice.count({ where: { customerId } }),
    prisma.customerCredit.count({ where: { customerId } }),
    prisma.customerCardLedger.count({ where: { card: { customerId } } }),
  ]);

  if (salesCount > 0 || invoiceCount > 0 || creditCount > 0 || cardLedgerCount > 0) {
    throw new AppError(
      409,
      'Customer cannot be deleted because they have associated transactions, invoices, credits, or card activity. You can archive this customer instead.',
      'CUSTOMER_HAS_HISTORY'
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.customerCard.deleteMany({ where: { customerId } });
    await tx.customer.delete({ where: { id: customerId } });
  });

  await logAudit({
    userId,
    businessId,
    action: 'customer.deleted',
    resourceType: 'customer',
    resourceId: customerId,
    oldData: {
      name: existing.name,
      phone: existing.phone,
      email: existing.email,
    },
  });

  return {
    success: true,
    message: 'Customer deleted successfully',
  };
}
