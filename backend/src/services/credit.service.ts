import { randomUUID } from 'crypto';
import prisma from '@/lib/prisma';
import logger from '@/lib/logger';
import { AppError } from '@/middleware/errorHandler';
import { logAudit } from '@/lib/audit';
import { verifyBusinessAccess } from '@/lib/ownership';
import { toNumber, assertMonthNotLocked, isMonthLockedOrFinalized } from '@/shared/helpers';
import { findOrCreateCustomerByIdentity } from '@/services/customer-resolver.service';
import { formatNaira, formatDateISO } from '@/lib/format';
import {
  CreateCreditInput,
  RecordPaymentInput,
  UpdateCreditInput,
  WriteOffCreditInput,
  CreditsQueryInput,
  CreditLineItemInput,
} from '@/validators/credit.validator';
import { dispatchCreditCreatedEmail } from '@/services/email-dispatch.service';
import { sendEmail } from '@/lib/email';
import {
  generateDebtorReminderHtml,
  generateDebtorReminderText,
  DebtorReminderEmailData,
} from '@/lib/email/templates/debtor-reminder';

const TX_OPTIONS = { maxWait: 10000, timeout: 25000 };

/**
 * Computes line totals and grand total for credit items with 2-decimal rounding.
 */
export function computeCreditTotal(items: CreditLineItemInput[]): {
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

export async function createCredit(userId: string, businessId: string, data: CreateCreditInput) {
  await verifyBusinessAccess(userId, businessId, 'debtors.manage');

  const hasItems = data.items !== undefined && data.items.length > 0;
  const { total: computedTotal, lines } = hasItems
    ? computeCreditTotal(data.items!)
    : { total: 0, lines: [] };
  const effectiveTotalAmount = hasItems ? computedTotal : data.totalAmount!;

  const email = data.customerEmail?.trim().toLowerCase();
  if (!email) {
    throw new AppError(400, 'Customer email is required', 'CUSTOMER_EMAIL_REQUIRED');
  }
  if (!email.includes('@')) {
    throw new AppError(400, 'Enter a valid email address', 'INVALID_EMAIL');
  }

  let description = data.description;
  if (!description && hasItems) {
    const itemSummary = data.items!.map((i) => `${i.name} (${i.quantity})`).join(', ');
    description = `${data.items!.length} item${data.items!.length > 1 ? 's' : ''}: ${itemSummary}`.slice(0, 500);
  }

  const credit = await prisma.$transaction(async (tx) => {
    // ── 0. Resolve customer identity first (same TX) ──
    let resolvedCustomerId: string | null = data.customerId ?? null;
    if (resolvedCustomerId) {
      const cust = await tx.customer.findFirst({
        where: { id: resolvedCustomerId, businessId },
        select: { id: true },
      });
      if (!cust) {
        throw new AppError(400, 'Invalid customer', 'INVALID_CUSTOMER');
      }
    } else if (data.customerPhone || email) {
      const resolved = await findOrCreateCustomerByIdentity(
        businessId,
        {
          name: data.customerName,
          phone: data.customerPhone,
          email,
        },
        tx
      );
      if (resolved) {
        resolvedCustomerId = resolved.customer.id;
      }
    }

    // ── Month-lock check for the sales leg ONLY (Finding 12) ──
    const lock = await isMonthLockedOrFinalized(businessId, data.issueDate, tx);

    // Pre-generate credit UUID so the sale's referenceId can point to it.
    // This leverages @@unique([businessId, source, referenceId]) to prevent
    // duplicate sales for the same credit.
    const creditId = randomUUID();
    let saleId: string | null = null;
    let revenueDeferred = false;

    if (!lock.lockedOrFinalized) {
      // Look up 'Credit Sale' classification
      const classification = await tx.transactionClassification.findFirst({
        where: { name: 'Credit Sale', isActive: true },
      });

      // ── 1. Create the SalesTransaction (revenue recognized NOW — accrual basis) ──
      const sale = await tx.salesTransaction.create({
        data: {
          businessId,
          amount: effectiveTotalAmount,
          source: 'credit',
          status: 'confirmed',
          isTaxable: true,
          referenceId: creditId,
          description: `Credit sale to ${data.customerName}${description ? ' — ' + description : ''}`,
          customerName: data.customerName,
          transactionDate: data.issueDate,
          createdBy: userId,
          customerId: resolvedCustomerId,
          finalClassification: 'Credit Sale',
          classificationId: classification?.id || null,
          metadata: { creditSale: true, creditId },
          // Mirror line items as SaleLineItems if in items mode
          ...(hasItems
            ? {
                items: {
                  createMany: {
                    data: lines.map((l) => ({
                      name: l.name,
                      quantity: l.quantity,
                      unitPrice: l.unitPrice,
                      lineTotal: l.lineTotal,
                      sortOrder: l.sortOrder,
                    })),
                  },
                },
              }
            : {}),
        },
      });
      saleId = sale.id;
    } else {
      revenueDeferred = true;
    }

    const deferredSuffix = '[Revenue deferred — issue month locked]';
    const finalNotes = revenueDeferred
      ? (data.notes ? `${data.notes}\n${deferredSuffix}` : deferredSuffix)
      : (data.notes || null);

    // ── 2. Create the CustomerCredit (debtor record, linked to sale if open, else null) ──
    const credit = await tx.customerCredit.create({
      data: {
        id: creditId,
        businessId,
        customerName: data.customerName,
        customerEmail: email,
        customerPhone: data.customerPhone || null,
        description: description || 'Credit obligation',
        totalAmount: effectiveTotalAmount,
        balance: effectiveTotalAmount,
        amountPaid: 0,
        issueDate: data.issueDate,
        dueDate: data.dueDate,
        reminderDate: data.reminderDate || null,
        customerId: resolvedCustomerId,
        guarantorName: data.guarantorName || null,
        guarantorPhone: data.guarantorPhone || null,
        notes: finalNotes,
        status: 'unpaid',
        createdBy: userId,
        linkedSaleId: saleId,
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

    await logAudit(
      {
        userId,
        businessId,
        action: 'credit.created',
        resourceType: 'customer_credit',
        resourceId: credit.id,
        newData: {
          customerName: data.customerName,
          totalAmount: effectiveTotalAmount,
          dueDate: data.dueDate,
          itemsCount: hasItems ? lines.length : 0,
          linkedSaleId: saleId,
          revenueDeferred,
        },
      },
      tx
    );

    if (revenueDeferred) {
      return Object.assign(credit, {
        meta: {
          revenueDeferred: true,
          reason: lock.isLocked ? 'PERIOD_LOCKED' : 'PERIOD_FINALIZED',
        },
      });
    }

    return credit;
  }, TX_OPTIONS);

  void dispatchCreditCreatedEmail(credit.id, userId);

  return credit;
}

/**
 * Record a manual credit repayment.
 *
 * Under accrual-basis accounting, revenue was recognized at credit creation
 * (createCredit). Repayments only update the debtor ledger — NO new
 * SalesTransaction is created. CreditPayment.paymentDate records when the
 * money was actually received, independent of tax period finalization.
 */
export async function recordPayment(userId: string, businessId: string, creditId: string, data: RecordPaymentInput) {
  return prisma.$transaction(async (tx) => {
    await verifyBusinessAccess(userId, businessId, 'debtors.manage', tx);

    // Row-level lock — prevent concurrent double-payment
    const credits = await tx.$queryRaw<any[]>`
      SELECT * FROM customer_credits WHERE id = ${creditId} FOR UPDATE
    `;
    const credit = credits[0];
    if (!credit || credit.business_id !== businessId) {
      throw new AppError(404, 'Credit not found', 'CREDIT_NOT_FOUND');
    }

    const currentStatus = credit.status as string;
    if (!['unpaid', 'partially_paid', 'overdue'].includes(currentStatus)) {
      throw new AppError(409, 'Credit is already settled or written off', 'CREDIT_CLOSED');
    }

    const currentBalance = toNumber(credit.balance);
    if (data.amount > currentBalance) {
      throw new AppError(400, `Payment of ₦${data.amount.toLocaleString()} exceeds remaining balance of ${formatNaira(currentBalance)}`, 'CREDIT_OVERPAYMENT');
    }

    const newAmountPaid = toNumber(credit.amount_paid) + data.amount;
    const newBalance = toNumber(credit.total_amount) - newAmountPaid;
    const isFullPayment = newBalance <= 0;

    // Create CreditPayment record (debtor ledger entry — no linked sale)
    await tx.creditPayment.create({
      data: {
        creditId,
        amount: data.amount,
        paymentDate: data.paymentDate,
        paymentType: data.paymentType,
        isFullPayment,
        linkedSaleId: null,
        notes: data.notes || null,
      },
    });

    // Update credit balance
    const updated = await tx.customerCredit.update({
      where: { id: creditId },
      data: {
        amountPaid: newAmountPaid,
        balance: Math.max(0, newBalance),
        status: isFullPayment ? 'paid' : 'partially_paid',
      },
      include: { payments: { orderBy: { createdAt: 'desc' } } },
    });

    await logAudit({
      userId, businessId,
      action: 'credit.payment_recorded',
      resourceType: 'customer_credit',
      resourceId: creditId,
      oldData: { balance: currentBalance, status: currentStatus },
      newData: {
        balance: Math.max(0, newBalance),
        status: updated.status,
        amount: data.amount,
        isFullPayment,
      },
    }, tx);

    logger.info('Credit payment recorded (debtor ledger only — no sale)', {
      creditId, amount: data.amount,
      newBalance: Math.max(0, newBalance), isFullPayment, businessId, userId,
    });

    return updated;
  }, TX_OPTIONS);
}

/**
 * Write off a credit as bad debt.
 *
 * NOTE (accrual-basis): The linked SalesTransaction is intentionally NOT
 * touched on write-off. Revenue was recognized at credit creation.
 *
 * CITA §25 auto-deduction: A matching deductible Expense (category:
 * bad_debt) is automatically created for the outstanding balance, reducing
 * the SME's gross profit and 7.5% VAT liability for the write-off month.
 */
export async function writeOffCredit(userId: string, businessId: string, creditId: string, data: WriteOffCreditInput) {
  await verifyBusinessAccess(userId, businessId, 'debtors.manage');

  return prisma.$transaction(async (tx) => {
    const credit = await tx.customerCredit.findUnique({
      where: { id: creditId },
    });

    if (!credit || credit.businessId !== businessId) {
      throw new AppError(404, 'Credit not found', 'CREDIT_NOT_FOUND');
    }

    if (credit.status === 'paid' || credit.status === 'written_off') {
      throw new AppError(409, 'Credit is already settled or written off', 'CREDIT_CLOSED');
    }

    const writeOffDate = new Date();
    await assertMonthNotLocked(businessId, writeOffDate, tx);

    const expenseAmount = Number(credit.balance);

    const writeOffNote = `[Written off: ${writeOffDate.toISOString().slice(0, 10)}] ${data.reason}`;
    const updatedNotes = credit.notes ? `${credit.notes}\n${writeOffNote}` : writeOffNote;

    const updated = await tx.customerCredit.update({
      where: { id: creditId },
      data: {
        status: 'written_off',
        notes: updatedNotes,
      },
    });

    // ── Auto-create bad debt expense (CITA §25) ──────────────
    // The outstanding balance becomes a deductible expense, reducing
    // the SME's gross profit and therefore their 7.5% VAT liability.
    const badDebtExpense = await tx.expense.create({
      data: {
        businessId,
        category: 'bad_debt',
        description: `Bad debt write-off: ${credit.customerName ?? 'Unknown'} — ₦${expenseAmount.toLocaleString('en-NG')} uncollected (CITA §25)`,
        amount: expenseAmount,
        quantity: 1,
        unitPrice: expenseAmount,
        expenseDate: writeOffDate,
        isDeductible: true,
        createdBy: userId,
        linkedCreditId: creditId,
      },
    });

    logger.info('Auto-created bad debt expense for write-off', {
      expenseId: badDebtExpense.id,
      creditId,
      amount: expenseAmount,
      businessId,
    });

    await logAudit({
      userId,
      businessId,
      action: 'credit.written_off',
      resourceType: 'customer_credit',
      resourceId: creditId,
      oldData: { status: credit.status, balance: expenseAmount },
      newData: {
        status: 'written_off',
        reason: data.reason,
        autoExpenseId: badDebtExpense.id,
        autoExpenseAmount: expenseAmount,
      },
    }, tx);

    return {
      ...updated,
      badDebtExpense: {
        id: badDebtExpense.id,
        amount: expenseAmount,
      },
    };
  }, TX_OPTIONS);
}

export async function listCredits(userId: string, businessId: string, query: CreditsQueryInput) {
  await verifyBusinessAccess(userId, businessId, 'debtors.read');

  const page = query.page;
  const limit = query.limit;
  const skip = (page - 1) * limit;

  const where: any = { businessId };
  if (query.status) {
    where.status = query.status;
  }
  if (query.search) {
    where.customerName = {
      contains: query.search,
      mode: 'insensitive',
    };
  }

  const [total, data] = await Promise.all([
    prisma.customerCredit.count({ where }),
    prisma.customerCredit.findMany({
      where,
      skip,
      take: limit,
      orderBy: { dueDate: 'asc' },
      include: {
        items: {
          orderBy: { sortOrder: 'asc' },
        },
        payments: {
          orderBy: { createdAt: 'desc' },
        },
      },
    }),
  ]);

  const totalPages = Math.ceil(total / limit);

  return {
    data,
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

export async function getCreditById(userId: string, businessId: string, creditId: string) {
  await verifyBusinessAccess(userId, businessId, 'debtors.read');

  const credit = await prisma.customerCredit.findUnique({
    where: { id: creditId },
    include: {
      items: {
        orderBy: { sortOrder: 'asc' },
      },
      payments: {
        orderBy: { createdAt: 'desc' },
        include: { linkedSale: true },
      },
      customer: true,
    },
  });

  if (!credit || credit.businessId !== businessId) {
    throw new AppError(404, 'Credit not found', 'CREDIT_NOT_FOUND');
  }

  return credit;
}

export async function updateCredit(userId: string, businessId: string, creditId: string, data: UpdateCreditInput) {
  return prisma.$transaction(async (tx) => {
    // Ownership verified INSIDE the transaction to avoid stale-cache race
    await verifyBusinessAccess(userId, businessId, 'debtors.manage', tx);

    const credit = await tx.customerCredit.findUnique({
      where: { id: creditId },
      include: { items: true },
    });

    if (!credit || credit.businessId !== businessId) {
      throw new AppError(404, 'Credit not found', 'CREDIT_NOT_FOUND');
    }

    if (credit.status === 'paid' || credit.status === 'written_off') {
      throw new AppError(409, 'Credit cannot be updated once settled or written off', 'CREDIT_CLOSED');
    }

    if (data.dueDate && new Date(data.dueDate) < new Date(credit.issueDate)) {
      throw new AppError(400, 'Due date cannot be before credit issue date', 'INVALID_DUE_DATE');
    }
    const effectiveDueDate = data.dueDate ? new Date(data.dueDate) : new Date(credit.dueDate);
    if (data.reminderDate && new Date(data.reminderDate) > effectiveDueDate) {
      throw new AppError(400, 'Reminder date cannot be after due date', 'INVALID_REMINDER_DATE');
    }

    // ─── Line-item replacement logic ───
    const hasItems = data.items !== undefined && data.items.length > 0;
    let itemUpdateData: Record<string, any> = {};

    if (hasItems) {
      const { total: computedTotal, lines } = computeCreditTotal(data.items!);
      const amountPaid = toNumber(credit.amountPaid);

      // Invariant: new total must not drop below already-paid amount
      if (computedTotal < amountPaid) {
        throw new AppError(
          400,
          `Cannot reduce credit total (₦${computedTotal.toLocaleString()}) below already paid amount (₦${amountPaid.toLocaleString()})`,
          'INVALID_CREDIT_AMOUNT',
        );
      }

      // Atomically replace line items
      await tx.creditLineItem.deleteMany({ where: { creditId } });
      await tx.creditLineItem.createMany({
        data: lines.map((l) => ({
          creditId,
          name: l.name,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          lineTotal: l.lineTotal,
          sortOrder: l.sortOrder,
        })),
      });

      const newBalance = Math.round((computedTotal - amountPaid) * 100) / 100;
      let newStatus = credit.status as string;
      if (newBalance <= 0) {
        newStatus = 'paid';
      } else if (amountPaid > 0) {
        newStatus = 'partially_paid';
      }

      // Auto-generate description from items if not explicitly provided
      let newDescription = data.description;
      if (newDescription === undefined) {
        const itemSummary = data.items!.map((i) => `${i.name} (${i.quantity})`).join(', ');
        newDescription = `${data.items!.length} item${data.items!.length > 1 ? 's' : ''}: ${itemSummary}`.slice(0, 500);
      }

      itemUpdateData = {
        totalAmount: computedTotal,
        balance: Math.max(0, newBalance),
        status: newStatus,
        description: newDescription,
      };
    }

    const updated = await tx.customerCredit.update({
      where: { id: creditId },
      data: {
        ...(data.customerName !== undefined && { customerName: data.customerName }),
        ...(data.customerPhone !== undefined && { customerPhone: data.customerPhone || null }),
        ...(data.customerEmail !== undefined && {
          customerEmail: data.customerEmail?.trim() ? data.customerEmail.trim().toLowerCase() : null,
        }),
        ...(!hasItems && data.description !== undefined && { description: data.description }),
        dueDate: data.dueDate,
        reminderDate: data.reminderDate || null,
        notes: data.notes || null,
        guarantorName: data.guarantorName || null,
        guarantorPhone: data.guarantorPhone || null,
        ...itemUpdateData,
      },
      include: {
        items: { orderBy: { sortOrder: 'asc' } },
        payments: { orderBy: { createdAt: 'desc' } },
      },
    });

    // ── Sync linked SalesTransaction (DEBT-05: accrual-basis sync) ──────
    // If this credit was created under accrual-basis (linkedSaleId exists),
    // keep the sale amount/items/customerName in sync with the credit.
    if (credit.linkedSaleId) {
      const saleUpdateData: Record<string, any> = {};

      // If items/total changed, check month-lock first (the sale's month must be open)
      if (hasItems) {
        const linkedSale = await tx.salesTransaction.findUnique({
          where: { id: credit.linkedSaleId },
          select: { transactionDate: true },
        });
        if (linkedSale) {
          await assertMonthNotLocked(businessId, linkedSale.transactionDate, tx);
        }

        const { total: computedTotal, lines: syncLines } = computeCreditTotal(data.items!);
        saleUpdateData.amount = computedTotal;

        // Replace SaleLineItems to mirror the new CreditLineItems
        await tx.saleLineItem.deleteMany({ where: { saleId: credit.linkedSaleId } });
        await tx.saleLineItem.createMany({
          data: syncLines.map((l) => ({
            saleId: credit.linkedSaleId!,
            name: l.name,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
            lineTotal: l.lineTotal,
            sortOrder: l.sortOrder,
          })),
        });
      }

      // Sync customer name if changed
      if (data.customerName !== undefined) {
        saleUpdateData.customerName = data.customerName;
        const desc = itemUpdateData.description || data.description || credit.description;
        saleUpdateData.description = `Credit sale to ${data.customerName}${desc ? ' — ' + desc : ''}`;
      }

      if (Object.keys(saleUpdateData).length > 0) {
        await tx.salesTransaction.update({
          where: { id: credit.linkedSaleId },
          data: saleUpdateData,
        });
      }
    }

    await logAudit({
      userId, businessId,
      action: 'credit.updated',
      resourceType: 'customer_credit',
      resourceId: creditId,
      oldData: {
        totalAmount: toNumber(credit.totalAmount),
        balance: toNumber(credit.balance),
        status: credit.status,
        itemsCount: credit.items.length,
      },
      newData: {
        totalAmount: toNumber(updated.totalAmount),
        balance: toNumber(updated.balance),
        status: updated.status,
        itemsCount: updated.items.length,
        itemsUpdated: hasItems,
        saleSynced: !!credit.linkedSaleId,
      },
    }, tx);

    return updated;
  }, TX_OPTIONS);
}

export async function getCreditsSummary(userId: string, businessId: string) {
  await verifyBusinessAccess(userId, businessId, 'debtors.read');

  const currentDate = new Date();
  const firstDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);

  const [aggregations, activeDebtorsResult, recoveredThisMonthResult] = await Promise.all([
    prisma.customerCredit.groupBy({
      by: ['status'],
      where: {
        businessId,
        status: { in: ['unpaid', 'partially_paid', 'overdue'] },
      },
      _sum: {
        balance: true,
      },
    }),
    prisma.customerCredit.findMany({
      where: {
        businessId,
        status: { in: ['unpaid', 'partially_paid', 'overdue'] },
      },
      select: { customerName: true },
      distinct: ['customerName'],
    }),
    prisma.creditPayment.aggregate({
      where: {
        credit: { businessId },
        paymentDate: { gte: firstDayOfMonth },
      },
      _sum: {
        amount: true,
      },
    }),
  ]);

  let totalOutstanding = 0;
  let overdueAmount = 0;

  aggregations.forEach((agg: any) => {
    const amount = agg._sum.balance ? Number(agg._sum.balance) : 0;
    totalOutstanding += amount;
    if (agg.status === 'overdue') {
      overdueAmount += amount;
    }
  });

  return {
    totalOutstanding,
    overdueAmount,
    activeDebtors: activeDebtorsResult.length,
    recoveredThisMonth: recoveredThisMonthResult._sum.amount ? Number(recoveredThisMonthResult._sum.amount) : 0,
  };
}

export async function reconcileDvaTransferToCredit(userId: string, businessId: string, creditId: string, saleId: string) {
  return prisma.$transaction(async (tx) => {
    // Ownership verified INSIDE the transaction to avoid stale-cache race
    await verifyBusinessAccess(userId, businessId, 'debtors.manage', tx);

    const sale = await tx.salesTransaction.findUnique({
      where: { id: saleId },
    });

    if (!sale || sale.businessId !== businessId) {
      throw new AppError(404, 'Sale transaction not found', 'SALE_NOT_FOUND');
    }

    if (!sale.dvaOrigin && !sale.needsVerification && sale.source !== 'bank_transfer') {
      throw new AppError(400, 'Transaction is not eligible for DVA reconciliation', 'INVALID_RECONCILIATION');
    }

    // Cross-module guard 1: check if already reconciled to another debtor
    const existingPayment = await tx.creditPayment.findUnique({
      where: { linkedSaleId: saleId },
    });

    if (existingPayment) {
      throw new AppError(409, 'Sale transaction has already been reconciled to a debtor', 'SALE_ALREADY_RECONCILED');
    }

    // Cross-module guard 2: check if already reconciled to an invoice
    const existingInvoice = await tx.invoice.findFirst({
      where: { linkedSaleId: saleId },
    });

    if (existingInvoice) {
      throw new AppError(409, 'Sale transaction has already been reconciled to an invoice', 'SALE_ALREADY_RECONCILED');
    }

    const credit = await tx.customerCredit.findUnique({
      where: { id: creditId },
    });

    if (!credit || credit.businessId !== businessId) {
      throw new AppError(404, 'Credit not found', 'CREDIT_NOT_FOUND');
    }

    if (!['unpaid', 'partially_paid', 'overdue'].includes(credit.status)) {
      throw new AppError(409, 'Credit is already settled or written off', 'CREDIT_CLOSED');
    }

    const classification = await tx.transactionClassification.findFirst({
      where: { name: 'Credit / Debt Settlement', isActive: true },
    });

    const amount = toNumber(sale.amount);
    const newAmountPaid = toNumber(credit.amountPaid) + amount;
    const newBalance = toNumber(credit.totalAmount) - newAmountPaid;
    const isFullPayment = newBalance <= 0;

    // Under accrual-basis, revenue was recognized when the credit was created.
    // This DVA transfer is a debt repayment — marking isTaxable: false to
    // prevent double-counting. The sale still exists for audit trail purposes.
    await tx.salesTransaction.update({
      where: { id: saleId },
      data: {
        needsVerification: false,
        verifiedAt: new Date(),
        verifiedBy: userId,
        status: 'confirmed',
        isTaxable: false,
        finalClassification: 'Credit Repayment (Non-Taxable)',
        classificationId: classification?.id || null,
        customerName: credit.customerName,
        metadata: {
          ...((sale.metadata as object) ?? {}),
          creditRepayment: true,
          creditReconciliation: {
            creditId: credit.id,
            customerName: credit.customerName,
            reconciledAt: new Date().toISOString(),
            reconciledBy: userId,
          },
        },
      },
    });

    await tx.creditPayment.create({
      data: {
        creditId,
        amount,
        paymentDate: sale.transactionDate,
        paymentType: 'bank_transfer',
        isFullPayment,
        linkedSaleId: saleId,
        notes: isFullPayment && newBalance < 0
          ? `Settled in full (Overpayment of ₦${Math.abs(newBalance).toLocaleString()} recorded via bank transfer)`
          : undefined,
      },
    });

    const updated = await tx.customerCredit.update({
      where: { id: creditId },
      data: {
        amountPaid: newAmountPaid,
        balance: Math.max(0, newBalance),
        status: isFullPayment ? 'paid' : 'partially_paid',
      },
    });

    await logAudit({
      userId, businessId,
      action: 'credit.dva_reconciled',
      resourceType: 'customer_credit',
      resourceId: creditId,
      newData: {
        saleId,
        amount,
        status: updated.status,
        isTaxable: false,
      },
    }, tx);

    return updated;
  }, TX_OPTIONS);
}

export async function getWhatsAppReminderLink(userId: string, businessId: string, creditId: string) {
  await verifyBusinessAccess(userId, businessId, 'debtors.manage');

  const credit = await prisma.customerCredit.findUnique({
    where: { id: creditId },
    include: { business: true },
  });

  if (!credit || credit.businessId !== businessId) {
    throw new AppError(404, 'Credit not found', 'CREDIT_NOT_FOUND');
  }

  const phone = credit.customerPhone;
  if (!phone) {
    throw new AppError(400, 'Customer does not have a phone number', 'NO_PHONE_NUMBER');
  }

  let normalizedPhone = phone.replace(/\D/g, '');
  if (normalizedPhone.startsWith('0')) {
    normalizedPhone = '234' + normalizedPhone.slice(1);
  } else if (!normalizedPhone.startsWith('234')) {
    normalizedPhone = '234' + normalizedPhone;
  }

  const businessName = credit.business.businessName;
  const customerName = credit.customerName;
  const balance = Number(credit.balance);
  const dueDate = credit.dueDate;

  const msg = `Dear ${customerName}, this is a payment reminder from ${businessName}. Your outstanding balance of ${formatNaira(balance)} was due on ${formatDateISO(dueDate)}. Please arrange payment at your earliest convenience. Thank you.`;

  const encodedMsg = encodeURIComponent(msg);

  await prisma.customerCredit.update({
    where: { id: creditId },
    data: { lastReminderSentAt: new Date() },
  });

  await logAudit({
    userId,
    businessId,
    action: 'credit.whatsapped',
    resourceType: 'customer_credit',
    resourceId: creditId,
    newData: { phone: normalizedPhone, balance },
  });

  return {
    waUrl: `https://wa.me/${normalizedPhone}?text=${encodedMsg}`,
    message: msg,
  };
}

/**
 * Manually dispatch debt update and payment instructions email to debtor.
 *
 * Always uses the debtor-reminder template with live outstanding balance,
 * due date, and wallet settlement (DVA) details.
 * Bumps lastReminderSentAt to prevent duplicate sends on the same Lagos day during nightly sweeps.
 */
export async function sendDebtorInfoEmail(
  userId: string,
  businessId: string,
  creditId: string,
): Promise<{ delivered: boolean; to: string }> {
  await verifyBusinessAccess(userId, businessId, 'debtors.manage');

  const credit = await prisma.customerCredit.findUnique({
    where: { id: creditId },
    include: {
      business: {
        include: {
          user: {
            select: {
              email: true,
              phone: true,
              virtualAccountNumber: true,
              virtualAccountBank: true,
            },
          },
        },
      },
    },
  });

  if (!credit || credit.businessId !== businessId) {
    throw new AppError(404, 'Credit not found', 'CREDIT_NOT_FOUND');
  }

  if (credit.status === 'paid' || credit.status === 'written_off') {
    throw new AppError(409, 'Credit cannot be updated once settled or written off', 'CREDIT_CLOSED');
  }

  if (toNumber(credit.balance) === 0) {
    throw new AppError(409, 'Debt is already settled', 'CREDIT_CLOSED');
  }

  const to = credit.customerEmail?.trim();
  if (!to || !to.includes('@')) {
    throw new AppError(400, 'Customer email is required to send debt information', 'CUSTOMER_EMAIL_REQUIRED');
  }

  const bankName = credit.business.virtualAccountBank ?? credit.business.user?.virtualAccountBank ?? null;
  const accountNumber = credit.business.virtualAccountNumber ?? credit.business.user?.virtualAccountNumber ?? null;

  const amountFormatted = formatNaira(toNumber(credit.balance));
  const dueDateFormatted = formatDateISO(credit.dueDate);
  const businessName = credit.business.businessName;

  const emailData: DebtorReminderEmailData = {
    customerName: credit.customerName,
    businessName,
    amountFormatted,
    dueDateFormatted,
    bankName,
    accountNumber,
    accountName: businessName,
  };

  const html = generateDebtorReminderHtml(emailData);
  const text = generateDebtorReminderText(emailData);

  const result = await sendEmail({
    to,
    subject: `Debt update — ${businessName}: ${amountFormatted} due ${dueDateFormatted}`,
    html,
    text,
  });

  await prisma.customerCredit.update({
    where: { id: creditId },
    data: { lastReminderSentAt: new Date() },
  });

  await logAudit({
    userId,
    businessId,
    action: 'credit.debtor_emailed',
    resourceType: 'customer_credit',
    resourceId: creditId,
    newData: {
      to,
      delivered: result.delivered,
      amount: toNumber(credit.balance),
      status: credit.status,
    },
  });

  logger.info('Debt info emailed manually', {
    creditId,
    to,
    delivered: result.delivered,
    businessId,
  });

  return { delivered: result.delivered, to };
}

