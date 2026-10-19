import prisma, { TxClient } from '@/lib/prisma';
import logger from '@/lib/logger';
import { AppError } from '@/middleware/errorHandler';
import { logAudit } from '@/lib/audit';
import { CreateExpenseInput, UpdateExpenseInput } from '@/validators/expense.validator';
import { verifyBusinessAccess } from '@/lib/ownership';
import { assertMonthNotLocked, SETTLED_SALE_STATUSES } from '@/shared/helpers';

/**
 * Categories whose expenses are **always tax-deductible** under Nigerian tax
 * law (CITA Section 24, PITA Section 20).
 * Backend enforces this regardless of what a client sends, so an API caller
 * cannot accidentally mark legitimate operational expenses as non-deductible.
 */
const ALWAYS_DEDUCTIBLE_CATEGORIES = new Set([
  'rent',
  'inventory',
  'salary',
  'utility',
  'fuel',
  'logistics',
  'marketing',
  'bad_debt',
  'subscription',
  'insurance',
  'professional_fees',
  'repairs_maintenance',
  'bank_charges',
  'communication',
  'office_supplies',
  'travel',
]);

/**
 * Categories that are **never tax-deductible** under Nigerian tax law
 * (CITA Section 27(a) — government taxes, fines, penalties, regulatory permits).
 */
const NEVER_DEDUCTIBLE_CATEGORIES = new Set(['tax_permit']);

/**
 * Resolve isDeductible based on category:
 * - Never deductible (tax_permit) -> always false
 * - Always deductible (16 core/operational categories) -> always true
 * - Conditional (gift, depreciation, interest, other) -> user choice (defaults to true)
 */
function resolveDeductible(category: string, userChoice?: boolean): boolean {
  if (NEVER_DEDUCTIBLE_CATEGORIES.has(category)) return false;
  if (ALWAYS_DEDUCTIBLE_CATEGORIES.has(category)) return true;
  return userChoice ?? true;
}

// ─── CRUD ───────────────────────────────────────────────────

export async function createExpense(
  userId: string,
  businessId: string,
  input: CreateExpenseInput,
  tx?: TxClient
) {
  const db = tx ?? prisma;

  await verifyBusinessAccess(userId, businessId, 'expenses.create', db);
  await assertMonthNotLocked(businessId, input.expenseDate, db);

  const quantity = input.quantity ?? 1;
  const unitPrice = Math.round((input.amount / quantity) * 100) / 100;

  const expense = await db.expense.create({
    data: {
      businessId,
      category: input.category,
      description: input.description,
      amount: input.amount,
      quantity,
      unitPrice,
      expenseDate: input.expenseDate,
      receiptUrl: input.receiptUrl,
      isDeductible: resolveDeductible(input.category, input.isDeductible),
      createdBy: userId,
    },
  });

  await logAudit({
    userId,
    businessId,
    action: 'expense.created',
    resourceType: 'expense',
    resourceId: expense.id,
    newData: {
      amount: input.amount,
      quantity,
      unitPrice,
      category: input.category,
      isDeductible: expense.isDeductible,
    },
  }, tx);

  logger.info('Expense created', { expenseId: expense.id, businessId, userId });

  return expense;
}

export async function listExpenses(
  userId: string,
  businessId: string,
  query: {
    page: number;
    limit: number;
    category?: string;
    startDate?: Date;
    endDate?: Date;
    month?: number;
    year?: number;
  }
) {
  const access = await verifyBusinessAccess(userId, businessId, 'expenses.read');

  const where: any = { businessId };

  if (access.role === 'sales_staff') {
    // Null policy: legacy rows predating createdBy or created via bulk restore remain visible
    where.OR = [{ createdBy: userId }, { createdBy: null }];
  }

  if (query.category) where.category = query.category;

  if (query.startDate || query.endDate) {
    where.expenseDate = {};
    if (query.startDate) where.expenseDate.gte = query.startDate;
    if (query.endDate) where.expenseDate.lte = query.endDate;
  }

  if (query.month && query.year) {
    const monthStart = new Date(Date.UTC(query.year, query.month - 1, 1));
    const monthEnd = new Date(Date.UTC(query.year, query.month, 0));
    where.expenseDate = { gte: monthStart, lte: monthEnd };
  }

  const offset = (query.page - 1) * query.limit;

  const [expenses, total] = await Promise.all([
    prisma.expense.findMany({
      where,
      skip: offset,
      take: query.limit,
      orderBy: { expenseDate: 'desc' },
    }),
    prisma.expense.count({ where }),
  ]);

  const totalPages = Math.ceil(total / query.limit);

  return {
    data: expenses,
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

export async function getExpenseById(userId: string, businessId: string, expenseId: string) {
  const access = await verifyBusinessAccess(userId, businessId, 'expenses.read');

  const expense = await prisma.expense.findUnique({ where: { id: expenseId } });

  if (!expense || expense.businessId !== businessId) {
    throw new AppError(404, 'Expense not found', 'EXPENSE_NOT_FOUND');
  }

  if (access.role === 'sales_staff' && expense.createdBy !== userId && expense.createdBy !== null) {
    throw new AppError(403, 'You can only view your own expenses', 'PERMISSION_DENIED');
  }

  return expense;
}

export async function updateExpense(
  userId: string,
  businessId: string,
  expenseId: string,
  input: UpdateExpenseInput,
  tx?: TxClient
) {
  const db = tx ?? prisma;

  const access = await verifyBusinessAccess(userId, businessId, 'expenses.update', db);

  const existing = await db.expense.findUnique({ where: { id: expenseId } });

  if (!existing || existing.businessId !== businessId) {
    throw new AppError(404, 'Expense not found', 'EXPENSE_NOT_FOUND');
  }

  if (access.role === 'sales_staff' && existing.createdBy !== userId) {
    throw new AppError(403, 'You can only edit your own expenses', 'PERMISSION_DENIED');
  }

  if (existing.linkedCreditId) {
    throw new AppError(
      403,
      'This expense was auto-created from a bad debt write-off and cannot be edited.',
      'SYSTEM_EXPENSE_PROTECTED'
    );
  }

  await assertMonthNotLocked(businessId, existing.expenseDate, db);

  // If expense date is changing, also check the new month isn't locked
  if (input.expenseDate && input.expenseDate.getTime() !== existing.expenseDate.getTime()) {
    await assertMonthNotLocked(businessId, input.expenseDate, db);
  }

  const effectiveAmount = input.amount !== undefined ? input.amount : Number(existing.amount);
  const effectiveQuantity = input.quantity !== undefined ? input.quantity : Number(existing.quantity ?? 1);

  const data: Record<string, any> = {};
  if (input.category !== undefined) data.category = input.category;
  if (input.description !== undefined) data.description = input.description;
  if (input.amount !== undefined) data.amount = input.amount;
  if (input.quantity !== undefined) data.quantity = input.quantity;
  if (input.amount !== undefined || input.quantity !== undefined) {
    data.unitPrice = Math.round((effectiveAmount / effectiveQuantity) * 100) / 100;
  }
  if (input.expenseDate !== undefined) data.expenseDate = input.expenseDate;
  if (input.receiptUrl !== undefined) data.receiptUrl = input.receiptUrl;

  // ── Category-driven deductibility guardrail ────────────────
  // If the category is changing, or isDeductible is explicitly set, enforce
  // the rule: core categories are always deductible regardless of user input.
  const effectiveCategory = input.category ?? existing.category;
  if (input.isDeductible !== undefined || input.category !== undefined) {
    data.isDeductible = resolveDeductible(effectiveCategory, input.isDeductible ?? existing.isDeductible);
  }

  const updated = await db.expense.update({
    where: { id: expenseId },
    data,
  });

  await logAudit({
    userId,
    businessId,
    action: 'expense.updated',
    resourceType: 'expense',
    resourceId: expenseId,
    oldData: {
      amount: Number(existing.amount),
      quantity: Number(existing.quantity ?? 1),
      unitPrice: existing.unitPrice ? Number(existing.unitPrice) : null,
      category: existing.category,
      isDeductible: existing.isDeductible,
    },
    newData: {
      ...input,
      ...(data.unitPrice !== undefined ? { unitPrice: data.unitPrice } : {}),
    } as Record<string, any>,
  }, tx);

  logger.info('Expense updated', { expenseId, businessId, userId });

  return updated;
}

export async function deleteExpense(
  userId: string,
  businessId: string,
  expenseId: string,
  tx?: TxClient
) {
  const db = tx ?? prisma;

  const access = await verifyBusinessAccess(userId, businessId, 'expenses.delete', db);

  const existing = await db.expense.findUnique({ where: { id: expenseId } });

  if (!existing || existing.businessId !== businessId) {
    throw new AppError(404, 'Expense not found', 'EXPENSE_NOT_FOUND');
  }

  if (access.role === 'sales_staff' && existing.createdBy !== userId) {
    throw new AppError(403, 'You can only delete your own expenses', 'PERMISSION_DENIED');
  }

  if (existing.linkedCreditId) {
    throw new AppError(
      403,
      'This expense was auto-created from a bad debt write-off and cannot be deleted.',
      'SYSTEM_EXPENSE_PROTECTED'
    );
  }

  await assertMonthNotLocked(businessId, existing.expenseDate, db);

  await db.expense.delete({
    where: { id: expenseId },
  });

  await logAudit({
    userId,
    businessId,
    action: 'expense.deleted',
    resourceType: 'expense',
    resourceId: expenseId,
    oldData: { amount: Number(existing.amount), category: existing.category, description: existing.description },
  }, tx);

  logger.info('Expense deleted', { expenseId, businessId, userId });

  return { message: 'Expense deleted successfully' };
}

// ─── Daily Summary ──────────────────────────────────────────

/**
 * Same-day totals grouped by category + the day's register rows, plus the
 * same expense-intelligence ratio alerts scoped to the day.
 *
 * UTC day window — identical convention to the sales daily endpoint and
 * getMonthlySummary, so daily and monthly numbers always reconcile.
 */
export async function getDailySummary(
  userId: string,
  businessId: string,
  date?: string
) {
  const access = await verifyBusinessAccess(userId, businessId, 'expenses.read');

  const day = date ?? new Date().toISOString().slice(0, 10);
  const dayStart = new Date(`${day}T00:00:00.000Z`);
  const dayEnd = new Date(`${day}T23:59:59.999Z`);
  if (Number.isNaN(dayStart.getTime()) || Number.isNaN(dayEnd.getTime())) {
    throw new AppError(400, 'Invalid date — expected YYYY-MM-DD', 'INVALID_DATE');
  }
  const tomorrowStr = new Date(Date.now() + 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  if (day > tomorrowStr) {
    throw new AppError(
      400,
      'Date cannot be more than a day in the future',
      'INVALID_DATE'
    );
  }

  const dateFilter = { gte: dayStart, lte: dayEnd };
  const expenseWhere: any = { businessId, expenseDate: dateFilter };
  if (access.role === 'sales_staff') {
    // Null policy: legacy rows predating createdBy or created via bulk restore remain visible
    expenseWhere.OR = [{ createdBy: userId }, { createdBy: null }];
  }

  const [expenseAgg, byCategory, transactions, salesAgg] = await Promise.all([
    // Total expenses for the day
    prisma.expense.aggregate({
      where: expenseWhere,
      _sum: { amount: true },
    }),

    // Breakdown by category
    prisma.expense.groupBy({
      by: ['category'],
      where: expenseWhere,
      _sum: { amount: true },
      _count: true,
    }),

    // Register: the day's rows — capped to keep the payload bounded
    prisma.expense.findMany({
      where: expenseWhere,
      orderBy: { expenseDate: 'desc' },
      take: 200,
      select: {
        id: true,
        amount: true,
        quantity: true,
        unitPrice: true,
        category: true,
        description: true,
        expenseDate: true,
        isDeductible: true,
      },
    }),

    // Same-day settled sales — powers the low/high expense ratio alerts
    prisma.salesTransaction.aggregate({
      where: {
        businessId,
        transactionDate: dateFilter,
        status: { in: SETTLED_SALE_STATUSES },
      },
      _sum: { amount: true },
    }),
  ]);

  const totalExpenses = Number(expenseAgg._sum.amount ?? 0);
  const totalSales = Number(salesAgg._sum.amount ?? 0);

  // Same thresholds/rule as the monthly intelligence block below
  const alerts: { type: string; message: string }[] = [];
  if (totalSales > 0) {
    const ratio = totalExpenses / totalSales;
    const percentage = (ratio * 100).toFixed(1);
    if (ratio < LOW_EXPENSE_THRESHOLD) {
      alerts.push({
        type: 'LOW_EXPENSE_WARNING',
        message: `Your expenses (${percentage}% of sales) are unusually low today. You may be forgetting to log expenses — this inflates your taxable profit.`,
      });
    } else if (ratio > HIGH_EXPENSE_THRESHOLD) {
      alerts.push({
        type: 'HIGH_EXPENSE_WARNING',
        message: `Your expenses (${percentage}% of sales) are unusually high today. Double-check your entries for typos or duplicates.`,
      });
    }
  }

  return {
    date: day,
    totalExpenses,
    totalSales,
    transactionCount: transactions.length,
    categoryBreakdown: byCategory.map((entry) => ({
      category: entry.category,
      total: entry._sum.amount ?? 0,
      count: entry._count,
    })),
    alerts,
    transactions,
  };
}

// ─── Summary with Expense Intelligence ──────────────────────

const LOW_EXPENSE_THRESHOLD = 0.05;  // below 5% of sales → probably forgot to log
const HIGH_EXPENSE_THRESHOLD = 0.90; // above 90% of sales → suspiciously high

export async function getMonthlySummary(
  userId: string,
  businessId: string,
  month: number,
  year: number
) {
  const access = await verifyBusinessAccess(userId, businessId, 'expenses.read');

  const monthStart = new Date(Date.UTC(year, month - 1, 1));
  const monthEnd = new Date(Date.UTC(year, month, 0));

  const dateFilter = { gte: monthStart, lte: monthEnd };
  const expenseWhere: any = { businessId, expenseDate: dateFilter };
  if (access.role === 'sales_staff') {
    // Null policy: legacy rows predating createdBy or created via bulk restore remain visible
    expenseWhere.OR = [{ createdBy: userId }, { createdBy: null }];
  }

  const [expenseAgg, byCategory, expenseCount, salesAgg] = await Promise.all([
    // Total expenses for the month
    prisma.expense.aggregate({
      where: expenseWhere,
      _sum: { amount: true },
    }),

    // Breakdown by category
    prisma.expense.groupBy({
      by: ['category'],
      where: expenseWhere,
      _sum: { amount: true },
      _count: true,
    }),

    // Total count
    prisma.expense.count({
      where: expenseWhere,
    }),

    // Completed sales for the same month — needed for expense intelligence.
    // Same settled-status rule as the sales overview: 'confirmed' is canonical,
    // 'completed' is the legacy manual-entry status.
    prisma.salesTransaction.aggregate({
      where: {
        businessId,
        transactionDate: dateFilter,
        status: { in: SETTLED_SALE_STATUSES },
      },
      _sum: { amount: true },
    }),
  ]);

  const totalExpenses = Number(expenseAgg._sum.amount ?? 0);
  const totalSales = Number(salesAgg._sum.amount ?? 0);

  const categoryBreakdown = byCategory.map((entry) => ({
    category: entry.category,
    total: entry._sum.amount ?? 0,
    count: entry._count,
  }));

  // ── Expense Intelligence Alerts ──
  const alerts: { type: string; message: string }[] = [];

  if (totalSales > 0) {
    const ratio = totalExpenses / totalSales;
    const percentage = (ratio * 100).toFixed(1);

    // Pattern 1: Too few expenses — user probably forgot to log them.
    // They'll overpay on tax because gross profit is artificially high.
    if (ratio < LOW_EXPENSE_THRESHOLD) {
      alerts.push({
        type: 'LOW_EXPENSE_WARNING',
        message: `Your expenses (${percentage}% of sales) are unusually low. `
          + `Make sure you've recorded all business expenses — missing expenses will increase your tax liability.`,
      });
    }

    // Pattern 2: Too many expenses — expenses eating almost all revenue.
    // Could be legitimate (bad month), but could also be inflated to reduce tax.
    // Flag it so admin/NRS can review if needed.
    if (ratio > HIGH_EXPENSE_THRESHOLD) {
      alerts.push({
        type: 'HIGH_EXPENSE_WARNING',
        message: `Your expenses (${percentage}% of sales) are unusually high. `
          + `This significantly reduces your taxable profit. Please ensure all expense entries are accurate and supported by receipts.`,
      });
    }
  }

  // Pattern 3: Expenses logged but zero sales — might be a new month where
  // sales haven't been entered yet.
  if (totalSales === 0 && totalExpenses > 0) {
    alerts.push({
      type: 'NO_SALES_WARNING',
      message: `You have expenses recorded but no sales for this month. `
        + `Make sure you've entered all sales before finalizing.`,
    });
  }

  return {
    month,
    year,
    totalExpenses,
    totalSales,
    transactionCount: expenseCount,
    categoryBreakdown,
    alerts,
  };
}
