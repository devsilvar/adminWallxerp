import prisma from '@/lib/prisma';
import { verifyBusinessAccess } from '@/lib/ownership';
import { toNumber, TAXABLE_SALES_WHERE } from '@/shared/helpers';
import { calculateTaxWithStrategy } from '@/services/tax/tax-calculation-strategy';
import { resolveTaxPolicy } from '@/services/tax/tax-policy.service';

/**
 * Financial domains the calling member is allowed to see. `ai.use` only grants
 * access to the assistant — it must never become a side channel for data the
 * caller's role cannot read through the API directly.
 */
export interface FinancialScope {
  sales: boolean;
  expenses: boolean;
  invoices: boolean;
  tax: boolean;
  reminders: boolean;
}

export interface BusinessFinancialContext {
  scope: FinancialScope;
  business: {
    id: string;
    name: string;
    industry: string | null;
    currency: string;
    targetProfitMarginPercent: number;
    taxId: string | null;
  };
  currentMonth: {
    periodName: string;
    totalSales: number;
    totalExpenses: number | null;
    grossProfit: number | null;
    profitMarginPercent: number | null;
    isOperatingLoss: boolean | null;
    taxPayable: number | null;
    taxRatePercent: number | null;
    vatChargeable: boolean | null;
    vatReason: string | null;
    isFinalized: boolean | null;
    paymentStatus: string | null;
  };
  topExpenseDrivers: Array<{
    category: string;
    amount: number;
    sharePercent: number;
  }>;
  invoicingHealth: {
    overdueInvoicesCount: number;
    overdueAmount: number;
    unpaidSentCount: number;
    unpaidSentAmount: number;
  } | null;
  recentTrends: Array<{
    month: string;
    sales: number;
    expenses: number | null;
    grossProfit: number | null;
    marginPercent: number | null;
    taxPayable: number | null;
    isPaid: boolean | null;
  }>;
  complianceAlerts: string[];
}

const REDACTED = '[not accessible under your role]';

/**
 * Builds an aggregated, real-time financial health profile for an SME.
 * Pre-computes exact figures server-side to prevent LLM hallucinations.
 * Strictly excludes any sensitive personal identifiers (BVN, NIN, passwords).
 *
 * Figures outside the caller's permission scope are returned as `null` rather
 * than being computed and withheld, so redacted data never reaches the LLM
 * prompt, the response payload, or the deterministic fallback renderer.
 */
export async function buildBusinessFinancialContext(
  businessId: string,
  userId: string
): Promise<{ context: BusinessFinancialContext; summaryText: string }> {
  // 1. Verify business membership + `ai.use`
  const { business, permissions } = await verifyBusinessAccess(userId, businessId, 'ai.use');

  const scope: FinancialScope = {
    sales: permissions['sales.read'] === true,
    expenses: permissions['expenses.read'] === true,
    invoices: permissions['invoices.read'] === true,
    tax: permissions['tax.read'] === true,
    reminders: permissions['reminders.read'] === true,
  };

  const now = new Date();
  const currentMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const currentMonthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999));
  const monthFilter = { gte: currentMonthStart, lte: currentMonthEnd };

  // 2. Fetch concurrent aggregations in parallel for low latency (<50ms)
  const [
    salesAgg,
    expenseAgg,
    categoryGroups,
    currentReport,
    unpaidInvoices,
    recentReports,
    activeReminders,
  ] = await Promise.all([
    // Live Sales for current month
    scope.sales
      ? prisma.salesTransaction.aggregate({
          where: {
            businessId,
            transactionDate: monthFilter,
            ...TAXABLE_SALES_WHERE,
          },
          _sum: { amount: true },
        })
      : Promise.resolve({ _sum: { amount: null } }),
    // Live Expenses for current month — strictly gated on expenses.read (PERM-01b)
    scope.expenses
      ? prisma.expense.aggregate({
          where: {
            businessId,
            expenseDate: monthFilter,
            isDeductible: true,
          },
          _sum: { amount: true },
        })
      : Promise.resolve({ _sum: { amount: null } }),
    // Top expense categories for current month — strictly gated on expenses.read (PERM-01b)
    scope.expenses
      ? prisma.expense.groupBy({
          by: ['category'],
          where: {
            businessId,
            expenseDate: monthFilter,
          },
          _sum: { amount: true },
          orderBy: { _sum: { amount: 'desc' } },
          take: 5,
        })
      : Promise.resolve([]),
    // Existing calculated monthly tax report
    prisma.monthlyTaxReport.findUnique({
      where: {
        businessId_taxMonth: {
          businessId,
          taxMonth: currentMonthStart,
        },
      },
    }),
    // Invoices pending payment or overdue
    prisma.invoice.findMany({
      where: {
        businessId,
        status: { in: ['sent', 'overdue'] },
      },
      select: {
        id: true,
        invoiceNumber: true,
        total: true,
        status: true,
        dueDate: true,
      },
    }),
    // Last 6 months trend
    prisma.monthlyTaxReport.findMany({
      where: { businessId },
      orderBy: { taxMonth: 'desc' },
      take: 6,
    }),
    // Active un-sent reminders/alerts
    prisma.reminder.findMany({
      where: {
        businessId,
        isSent: false,
      },
      select: {
        reminderType: true,
        message: true,
      },
      take: 5,
    }),
  ]);

  // ─── Raw figures (in-memory only — never emitted unless in scope) ───
  const rawSales = scope.sales ? toNumber(salesAgg._sum.amount) : 0;
  const rawExpenses = scope.expenses ? toNumber(expenseAgg._sum.amount) : null;
  const rawGrossProfit = scope.sales && scope.expenses && rawExpenses !== null ? rawSales - rawExpenses : null;
  const rawMargin = scope.sales && scope.expenses && rawGrossProfit !== null && rawSales > 0 ? (rawGrossProfit / rawSales) * 100 : null;

  let computedTaxRate = currentReport ? toNumber(currentReport.taxRate) : 0;
  let computedTaxPayable = currentReport ? toNumber(currentReport.taxPayable) : 0;

  if (scope.tax) {
    if (currentReport) {
      computedTaxRate = toNumber(currentReport.taxRate);
      computedTaxPayable = toNumber(currentReport.taxPayable);
    } else {
      const gross = rawGrossProfit !== null ? Math.max(0, rawGrossProfit) : 0;
      const strategyResult = await calculateTaxWithStrategy({
        businessId,
        month: now.getUTCMonth() + 1,
        year: now.getUTCFullYear(),
        totalSales: rawSales,
        totalExpenses: rawExpenses ?? 0,
        grossProfit: gross,
      });
      computedTaxRate = strategyResult.taxRate;
      computedTaxPayable = strategyResult.taxPayable;
    }
  }

  // Statutory classification for this business. Without it the model sees a
  // rate with no context and advises VAT to merchants who cannot charge it.
  const taxPolicy = scope.tax ? await resolveTaxPolicy(businessId) : null;

  // Top expense drivers with % share
  const topExpenseDrivers = scope.expenses && rawExpenses !== null
    ? categoryGroups.map((g) => {
        const amount = toNumber(g._sum.amount);
        const sharePercent = rawExpenses > 0 ? (amount / rawExpenses) * 100 : 0;
        return {
          category: g.category.replace(/_/g, ' '),
          amount,
          sharePercent: Number(sharePercent.toFixed(1)),
        };
      })
    : [];

  // Invoicing breakdown
  let overdueCount = 0;
  let overdueAmount = 0;
  let unpaidSentCount = 0;
  let unpaidSentAmount = 0;

  for (const inv of unpaidInvoices) {
    const invTotal = toNumber(inv.total);
    const isPastDue = inv.status === 'overdue' || (inv.dueDate && new Date(inv.dueDate) < now);
    if (isPastDue) {
      overdueCount++;
      overdueAmount += invTotal;
    } else {
      unpaidSentCount++;
      unpaidSentAmount += invTotal;
    }
  }

  // Trend history (oldest to newest for trajectory)
  const recentTrends = recentReports
    .slice()
    .reverse()
    .map((r) => {
      const tSales = toNumber(r.totalSales);
      const tExpenses = toNumber(r.totalExpenses);
      const tGrossProfit = toNumber(r.grossProfit);
      return {
        month: new Date(r.taxMonth).toLocaleDateString('en-GB', {
          month: 'short',
          year: 'numeric',
          timeZone: 'UTC',
        }),
        sales: tSales,
        expenses: scope.expenses ? tExpenses : null,
        grossProfit: scope.expenses ? tGrossProfit : null,
        marginPercent: scope.expenses ? Number(toNumber(r.profitMargin).toFixed(1)) : null,
        taxPayable: scope.tax ? toNumber(r.taxPayable) : null,
        isPaid: scope.tax ? r.paymentStatus === 'completed' || r.isLocked : null,
      };
    });

  // ─── Diagnostics & Compliance Alerts, gated by scope ───
  const complianceAlerts: string[] = [];

  // NRS statutory deadline: 21st of following month. A calendar fact, not a
  // figure, so it is shown to every member who can use the assistant.
  const nextMonthYear = now.getUTCMonth() === 11 ? now.getUTCFullYear() + 1 : now.getUTCFullYear();
  const nextMonthIndex = (now.getUTCMonth() + 1) % 12;
  const deadlineDate = new Date(Date.UTC(nextMonthYear, nextMonthIndex, 21));
  const deadlineStr = deadlineDate.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });

  complianceAlerts.push(
    `NRS Tax Remittance Deadline: Tax for ${now.toLocaleString('en-GB', { month: 'long' })} is due on or before ${deadlineStr}.`
  );

  const defaultMargin = business.defaultProfitMargin ? toNumber(business.defaultProfitMargin) : 20.0;

  if (scope.expenses && rawMargin !== null && rawSales > 0 && Math.abs(rawMargin - defaultMargin) > 15) {
    if (rawMargin < defaultMargin) {
      complianceAlerts.push(
        `Profit Margin Warning: Current margin (${rawMargin.toFixed(1)}%) is significantly below target (${defaultMargin}%). Possible causes: high operating costs or uncaptured sales.`
      );
    } else {
      complianceAlerts.push(
        `Margin Deviation Alert: Current margin (${rawMargin.toFixed(1)}%) is unusually high (>15% above target). Nudge: ensure all deductible business expenses are recorded to avoid overpaying tax.`
      );
    }
  }

  if (scope.expenses && rawExpenses !== null && rawSales > 0 && rawExpenses === 0) {
    complianceAlerts.push(
      'No deductible expenses recorded for this month. Recording legitimate business expenses reduces taxable gross profit under NRS regulations.'
    );
  }

  if (scope.expenses && rawGrossProfit !== null && rawGrossProfit < 0 && rawExpenses !== null) {
    complianceAlerts.push(
      `Operating Loss Alert: Expenses (₦${rawExpenses.toLocaleString()}) exceed Sales (₦${rawSales.toLocaleString()}). No tax is currently payable (₦0.00).`
    );
  }

  if (scope.invoices && overdueAmount > 0) {
    complianceAlerts.push(
      `Uncollected Revenue: ₦${overdueAmount.toLocaleString()} is overdue across ${overdueCount} unpaid invoice(s).`
    );
  }

  if (scope.reminders) {
    for (const rem of activeReminders) {
      if (rem.message && !complianceAlerts.some((a) => a.includes(rem.message!))) {
        complianceAlerts.push(rem.message);
      }
    }
  }

  const currentMonthName = now.toLocaleString('en-GB', { month: 'long', year: 'numeric' });

  const context: BusinessFinancialContext = {
    scope,
    business: {
      id: business.id,
      name: business.businessName,
      industry: business.businessType || null,
      currency: 'NGN',
      targetProfitMarginPercent: defaultMargin,
      taxId: business.taxId,
    },
    currentMonth: {
      periodName: currentMonthName,
      totalSales: scope.sales ? rawSales : 0,
      totalExpenses: scope.expenses ? rawExpenses : null,
      grossProfit: scope.expenses ? rawGrossProfit : null,
      profitMarginPercent: scope.expenses && rawMargin !== null ? Number(rawMargin.toFixed(1)) : null,
      isOperatingLoss: scope.expenses && rawGrossProfit !== null ? rawGrossProfit < 0 : null,
      taxPayable: scope.tax && rawGrossProfit !== null
        ? Number(computedTaxPayable.toFixed(2))
        : null,
      taxRatePercent: scope.tax ? computedTaxRate : null,
      vatChargeable: scope.tax ? taxPolicy?.vat.chargeable ?? null : null,
      vatReason: scope.tax ? taxPolicy?.vat.reason ?? null : null,
      isFinalized: scope.tax ? currentReport?.isFinalized ?? false : null,
      paymentStatus: scope.tax ? currentReport?.paymentStatus ?? 'pending' : null,
    },
    topExpenseDrivers: scope.expenses ? topExpenseDrivers : [],
    invoicingHealth: scope.invoices
      ? { overdueInvoicesCount: overdueCount, overdueAmount, unpaidSentCount, unpaidSentAmount }
      : null,
    recentTrends,
    complianceAlerts,
  };

  const naira = (v: number, decimals = 0) =>
    `₦${v.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;

  // ─── Prompt-facing brief: only in-scope figures are ever serialized ───
  const currentMonthLines: string[] = [
    `Total Sales Revenue: ${scope.sales ? naira(rawSales) : REDACTED}`,
  ];
  if (scope.expenses && rawExpenses !== null && rawGrossProfit !== null && rawMargin !== null) {
    currentMonthLines.push(
      `Total Deductible Expenses: ${naira(rawExpenses)}`,
      `Gross Profit (Sales - Expenses): ${naira(rawGrossProfit)}`,
      `Profit Margin: ${rawMargin.toFixed(1)}% (Target: ${defaultMargin}%)`
    );
  }
  if (scope.tax) {
    const vatLine = taxPolicy
      ? taxPolicy.vat.chargeable
        ? `VAT: chargeable at ${taxPolicy.vat.rate}%`
        : `VAT: not chargeable on this business's tax profile${taxPolicy.vat.reason ? ` (${taxPolicy.vat.reason})` : ''}`
      : `VAT: unknown`;
    currentMonthLines.push(
      vatLine,
      `Applicable Rate: ${computedTaxRate}%`,
      `Estimated Tax Payable: ${naira(computedTaxPayable, 2)}`,
      `Report Status: ${currentReport?.isFinalized ? 'Finalized' : 'Draft / Live In-Progress'}`,
      `Payment Status: ${currentReport?.paymentStatus ?? 'Pending'}`
    );
  }

  const expenseSection = scope.expenses
    ? topExpenseDrivers.length > 0
      ? topExpenseDrivers.map((d) => `• ${d.category}: ${naira(d.amount)} (${d.sharePercent}% of expenses)`).join('\n')
      : '• No expenses recorded this month yet.'
    : `• ${REDACTED}`;

  const invoiceSection = scope.invoices
    ? `Overdue Unpaid Invoices: ${overdueCount} (${naira(overdueAmount)} tied up)\nPending Unpaid Invoices: ${unpaidSentCount} (${naira(unpaidSentAmount)})`
    : `• ${REDACTED}`;

  const trendSection =
    recentTrends.length > 0
      ? recentTrends
          .map((t) => {
            const parts = [scope.sales ? `Sales ${naira(t.sales)}` : null];
            if (t.expenses !== null) parts.push(`Expenses ${naira(t.expenses)}`, `Margin ${t.marginPercent}%`);
            if (t.taxPayable !== null) parts.push(`Tax ${naira(t.taxPayable)} [${t.isPaid ? 'Paid' : 'Unpaid'}]`);
            return `• ${t.month}: ${parts.filter(Boolean).join(' | ')}`;
          })
          .join('\n')
      : '• No historical monthly reports yet.';

  const anyRedacted = !scope.sales || !scope.expenses || !scope.invoices || !scope.tax || !scope.reminders;
  const scopeNote = anyRedacted
    ? `\n--- ACCESS SCOPE ---\nSome financial sections above are marked ${REDACTED}. The asking member's role does not include them. Do not estimate, infer, or substitute figures for those sections — say the data is unavailable and suggest requesting access from an owner or manager.\n`
    : '';

  const summaryText = `
=== BUSINESS FINANCIAL PROFILE ===
Business Name: ${business.businessName}
Industry: ${business.businessType || 'SME / Commerce'}
Base Currency: NGN (₦)
Target Profit Margin: ${defaultMargin}%

--- CURRENT MONTH (${currentMonthName}) ---
${currentMonthLines.join('\n')}

--- EXPENSE BREAKDOWN (TOP SPENDING AREAS) ---
${expenseSection}

--- INVOICES & RECEIVABLES ---
${invoiceSection}

--- 6-MONTH TREND TRAJECTORY ---
${trendSection}

--- ACTIVE COMPLIANCE & FINANCIAL ALERTS ---
${complianceAlerts.map((a) => `• ${a}`).join('\n')}
${scopeNote}`.trim();

  return { context, summaryText };
}