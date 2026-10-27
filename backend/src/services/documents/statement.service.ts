import PDFDocument from 'pdfkit';
import prisma from '@/lib/prisma';
import { config } from '@/config';
import logger from '@/lib/logger';
import { AppError } from '@/middleware/errorHandler';
import { logAudit } from '@/lib/audit';
import { Decimal } from '@prisma/client/runtime/library';
import { verifyBusinessAccess } from '@/lib/ownership';
import { fetchLogoForPdf } from '@/lib/pdf-utils';
import { buildLedgerStatementPdf } from '@/services/pdf/ledger-statement.pdf';
import { buildPnlStatementPdf, PnlStatementPdfOptions } from '@/services/pdf/pnl-statement.pdf';
import { getUnifiedLedger } from '@/services/ledger.service';
import { sendEmail } from '@/lib/email';
import { generateStatementHtml, generateStatementText } from '@/lib/email/templates/statement';
import { toNumber, TAXABLE_SALES_WHERE } from '@/shared/helpers';
import { calculateTaxWithStrategy } from '@/services/tax/tax-calculation-strategy';

// ─── Helpers ────────────────────────────────────────────────

function formatCurrency(amount: number): string {
  return `₦${amount.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatMonth(date: Date): string {
  return date.toLocaleDateString('en-NG', { year: 'numeric', month: 'long' });
}

// ─── PDF Builder ────────────────────────────────────────────

interface ReportRow {
  taxMonth: Date;
  totalSales: Decimal;
  totalExpenses: Decimal;
  grossProfit: Decimal;
  taxRate: Decimal;
  taxPayable: Decimal;
  paymentStatus: string;
  isFinalized: boolean;
}

async function buildPdf(
  business: {
    businessName: string;
    merchantId: string;
    ownerName: string;
    taxId: string | null;
    logoUrl?: string | null;
  },
  reports: ReportRow[],
  periodLabel: string
): Promise<Buffer> {
  const logoBuffer = business.logoUrl
    ? await fetchLogoForPdf(business.logoUrl)
    : null;

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // ── Logo (if available) ──
    if (logoBuffer) {
      try {
        doc.image(logoBuffer, 50, 45, { fit: [42, 42] });
      } catch {
        // Continue gracefully if image rendering fails
      }
    }

    // ── Header ──
    doc.fontSize(20).font('Helvetica-Bold').text('WallX ERP', { align: 'center' });
    doc.fontSize(10).font('Helvetica').text('Tax History Statement', { align: 'center' });
    doc.moveDown(0.8);

    // ── Business Info ──
    doc.fontSize(9).font('Helvetica');
    doc.text(`Merchant ID: ${business.merchantId}`);
    doc.text(`Business: ${business.businessName}`);
    doc.text(`Owner: ${business.ownerName}`);
    if (business.taxId) doc.text(`TIN: ${business.taxId}`);
    doc.text(`Period: ${periodLabel}`);
    doc.text(`Generated: ${new Date().toLocaleDateString('en-NG', { year: 'numeric', month: 'long', day: 'numeric' })}`);
    doc.moveDown(0.5);

    // ── Divider ──
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown(0.5);

    if (reports.length === 0) {
      doc.fontSize(11).text('No tax records found for the selected period.', { align: 'center' });
    } else {
      // ── Table Header ──
      const colX = [50, 140, 220, 300, 365, 420, 490];
      const headers = ['Month', 'Sales', 'Expenses', 'Profit', 'Rate', 'Tax Due', 'Status'];

      doc.fontSize(8).font('Helvetica-Bold');
      headers.forEach((h, i) => doc.text(h, colX[i], doc.y, { width: 70, continued: i < headers.length - 1 }));
      doc.text('');
      doc.moveDown(0.3);
      doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
      doc.moveDown(0.3);

      // ── Table Rows ──
      let grandTotalTax = 0;
      let grandTotalSales = 0;

      doc.font('Helvetica').fontSize(8);
      for (const r of reports) {
        const y = doc.y;
        if (y > 750) {
          doc.addPage();
        }

        const sales = toNumber(r.totalSales);
        const expenses = toNumber(r.totalExpenses);
        const profit = toNumber(r.grossProfit);
        const rate = toNumber(r.taxRate);
        const tax = toNumber(r.taxPayable);
        const status = r.paymentStatus === 'completed' ? 'Paid' : r.isFinalized ? 'Finalized' : 'Pending';

        grandTotalTax += tax;
        grandTotalSales += sales;

        const rowY = doc.y;
        doc.text(formatMonth(r.taxMonth), colX[0], rowY, { width: 85 });
        doc.text(formatCurrency(sales), colX[1], rowY, { width: 75 });
        doc.text(formatCurrency(expenses), colX[2], rowY, { width: 75 });
        doc.text(formatCurrency(profit), colX[3], rowY, { width: 60 });
        doc.text(`${rate}%`, colX[4], rowY, { width: 50 });
        doc.text(formatCurrency(tax), colX[5], rowY, { width: 65 });
        doc.text(status, colX[6], rowY, { width: 55 });
        doc.moveDown(0.6);
      }

      // ── Totals ──
      doc.moveDown(0.3);
      doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
      doc.moveDown(0.3);
      doc.font('Helvetica-Bold').fontSize(9);
      doc.text(`Total Sales: ${formatCurrency(grandTotalSales)}     |     Total Tax Payable: ${formatCurrency(grandTotalTax)}`, 50);
      doc.text(`Reports: ${reports.length} month(s)`, 50);
    }

    // ── Footer ──
    doc.moveDown(2);
    doc.fontSize(7).font('Helvetica').fillColor('#888888');
    doc.text(`Generated by WallX ERP  •  Tax Authority: ${config.tax.taxAuthority}  •  Currency: ${config.tax.currency}`, 50, undefined, { align: 'center' });
    doc.text('This is a computer-generated document and does not require a signature.', { align: 'center' });

    doc.end();
  });
}

// ─── Public API ─────────────────────────────────────────────

/**
 * Download tax history as PDF for a single month.
 */
export async function downloadMonthlyStatement(
  userId: string,
  businessId: string,
  month: number,
  year: number
): Promise<{ buffer: Buffer; filename: string }> {
  const { business } = await verifyBusinessAccess(userId, businessId, 'statements.download');

  const monthStart = new Date(year, month - 1, 1);

  const report = await prisma.monthlyTaxReport.findUnique({
    where: { businessId_taxMonth: { businessId, taxMonth: monthStart } },
  });

  if (!report) {
    throw new AppError(404, 'No tax report found for this month', 'REPORT_NOT_FOUND');
  }

  const periodLabel = formatMonth(monthStart);
  const buffer = await buildPdf(business, [report], periodLabel);
  const filename = `tax-statement-${business.merchantId}-${year}-${String(month).padStart(2, '0')}.pdf`;

  logAudit({
    userId,
    businessId,
    action: 'statement.downloaded',
    resourceType: 'tax_statement',
    resourceId: report.id,
    newData: { month, year, type: 'monthly' },
  });

  logger.info('Monthly statement downloaded', { businessId, month, year });

  return { buffer, filename };
}

/**
 * Download tax history as PDF for a date range (period).
 */
export async function downloadPeriodStatement(
  userId: string,
  businessId: string,
  startMonth: number,
  startYear: number,
  endMonth: number,
  endYear: number
): Promise<{ buffer: Buffer; filename: string }> {
  const { business } = await verifyBusinessAccess(userId, businessId, 'statements.download');

  const from = new Date(startYear, startMonth - 1, 1);
  const to = new Date(endYear, endMonth - 1, 1);

  if (from > to) {
    throw new AppError(400, 'Start date must be before end date', 'INVALID_DATE_RANGE');
  }

  const reports = await prisma.monthlyTaxReport.findMany({
    where: {
      businessId,
      taxMonth: { gte: from, lte: to },
    },
    orderBy: { taxMonth: 'asc' },
  });

  if (reports.length === 0) {
    throw new AppError(404, 'No tax reports found for this period', 'NO_REPORTS_FOUND');
  }

  const periodLabel = `${formatMonth(from)} — ${formatMonth(to)}`;
  const buffer = await buildPdf(business, reports, periodLabel);
  const filename = `tax-statement-${business.merchantId}-${startYear}${String(startMonth).padStart(2, '0')}-to-${endYear}${String(endMonth).padStart(2, '0')}.pdf`;

  logAudit({
    userId,
    businessId,
    action: 'statement.downloaded',
    resourceType: 'tax_statement',
    resourceId: businessId,
    newData: { from: from.toISOString(), to: to.toISOString(), type: 'period', reportCount: reports.length },
  });

  logger.info('Period statement downloaded', { businessId, from, to, reportCount: reports.length });

  return { buffer, filename };
}

/**
 * Generates an official dual-scope financial ledger statement PDF.
 */
export async function getLedgerStatementPdf(
  userId: string,
  businessId: string,
  query: {
    scope?: 'dva_bank' | 'all_income';
    from?: string;
    to?: string;
  }
): Promise<{ buffer: Buffer; filename: string; statementRef: string }> {
  const { business } = await verifyBusinessAccess(userId, businessId, 'statements.download');

  const scope = query.scope || 'dva_bank';
  const ledgerData = await getUnifiedLedger(userId, businessId, {
    scope,
    from: query.from,
    to: query.to,
    type: 'all',
    page: 1,
    limit: 5000,
  });

  const statementRef = `STMT-${business.merchantId}-${Date.now().toString(36).toUpperCase()}`;
  const periodLabel = query.from && query.to
    ? `${query.from} — ${query.to}`
    : query.from
    ? `From ${query.from}`
    : query.to
    ? `Up to ${query.to}`
    : 'All Time to Date';

  const buffer = await buildLedgerStatementPdf({
    business: {
      businessName: business.businessName,
      merchantId: business.merchantId,
      ownerName: business.ownerName,
      taxId: business.taxId,
      address: business.address,
      logoUrl: business.logoUrl,
      virtualAccountNumber: business.virtualAccountNumber,
      virtualAccountBank: business.virtualAccountBank,
    },
    scope,
    periodLabel,
    summary: ledgerData.summary,
    rows: ledgerData.data,
    statementRef,
  });

  const filename = `${scope === 'dva_bank' ? 'bank-statement' : 'sales-statement'}-${business.merchantId}-${statementRef}.pdf`;

  logAudit({
    userId,
    businessId,
    action: 'statement.downloaded',
    resourceType: 'ledger_statement',
    resourceId: businessId,
    newData: { scope, from: query.from, to: query.to, statementRef, rowsCount: ledgerData.data.length },
  });

  logger.info('Ledger statement generated', { businessId, scope, statementRef, rowsCount: ledgerData.data.length });

  return { buffer, filename, statementRef };
}

/**
 * Sends official financial ledger statement PDF to specified email address.
 */
export async function emailLedgerStatement(
  userId: string,
  businessId: string,
  query: {
    scope?: 'dva_bank' | 'all_income';
    from?: string;
    to?: string;
    recipientEmail: string;
  }
): Promise<{ success: boolean; delivered: boolean; statementRef: string }> {
  const { business } = await verifyBusinessAccess(userId, businessId, 'statements.download');

  if (!query.recipientEmail) {
    throw new AppError(400, 'Recipient email is required', 'RECIPIENT_EMAIL_REQUIRED');
  }

  const { buffer, filename, statementRef } = await getLedgerStatementPdf(userId, businessId, query);

  const scopeLabel = query.scope === 'all_income' ? 'Comprehensive Business Sales Statement' : 'Dedicated Virtual Bank Account Statement';

  const generatedDate = new Date().toLocaleDateString('en-NG', { dateStyle: 'long' });

  const emailRes = await sendEmail({
    to: query.recipientEmail,
    subject: `Official Financial Statement: ${business.businessName} (${statementRef})`,
    html: generateStatementHtml({
      businessName: business.businessName,
      merchantId: business.merchantId,
      statementRef,
      scopeLabel,
      generatedDate,
      filename,
    }),
    text: generateStatementText({
      businessName: business.businessName,
      merchantId: business.merchantId,
      statementRef,
      scopeLabel,
      generatedDate,
      filename,
    }),
    attachments: [
      {
        filename,
        content: buffer,
        contentType: 'application/pdf',
      },
    ],
  });

  logAudit({
    userId,
    businessId,
    action: 'statement.emailed',
    resourceType: 'ledger_statement',
    resourceId: businessId,
    newData: { scope: query.scope, recipientEmail: query.recipientEmail, statementRef },
  });

  return {
    success: true,
    delivered: emailRes.delivered,
    statementRef,
  };
}

// ─── Profit & Loss (P&L) Statement ──────────────────────────

const SALES_SOURCE_LABELS: Record<string, string> = {
  bank_transfer: 'Bank Transfer / DVA',
  pos: 'POS Terminal',
  online_store: 'Online Storefront',
  manual: 'Cash / Manual Entry',
  paycode: 'Paycode Checkout',
  ussd: 'USSD Channel',
};

const EXPENSE_CATEGORY_LABELS: Record<string, string> = {
  rent: 'Rent & Premises',
  inventory: 'Inventory & Stock Purchases',
  salary: 'Salaries & Wages',
  utility: 'Utilities (Power, Water, Internet)',
  fuel: 'Fuel & Generator',
  logistics: 'Logistics & Delivery',
  marketing: 'Marketing & Advertising',
  other: 'General & Administrative',
};

/**
 * Computes the complete Profit & Loss data and PDF options for a business and month/year.
 * Can be called both by the HTTP download endpoint (with ownership verification)
 * and by the automated cron / email dispatcher.
 */
export async function getPnlStatementData(
  businessId: string,
  month: number,
  year: number,
): Promise<PnlStatementPdfOptions & { buffer: Buffer; filename: string }> {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: {
      id: true,
      businessName: true,
      merchantId: true,
      ownerName: true,
      taxId: true,
      address: true,
      logoUrl: true,
    },
  });

  if (!business) {
    throw new AppError(404, 'Business not found', 'BUSINESS_NOT_FOUND');
  }

  const monthStart = new Date(Date.UTC(year, month - 1, 1));
  const monthEnd = new Date(Date.UTC(year, month, 0));
  const dateFilter = { gte: monthStart, lte: monthEnd };

  const [salesGroups, expenseGroups, deductibleAgg, existingReport] = await Promise.all([
    prisma.salesTransaction.groupBy({
      by: ['source'],
      where: {
        businessId,
        transactionDate: dateFilter,
        ...TAXABLE_SALES_WHERE,
      },
      _sum: { amount: true },
      _count: { _all: true },
    }),
    prisma.expense.groupBy({
      by: ['category'],
      where: {
        businessId,
        expenseDate: dateFilter,
      },
      _sum: { amount: true },
      _count: { _all: true },
    }),
    prisma.expense.aggregate({
      where: {
        businessId,
        expenseDate: dateFilter,
        isDeductible: true,
      },
      _sum: { amount: true },
    }),
    prisma.monthlyTaxReport.findUnique({
      where: { businessId_taxMonth: { businessId, taxMonth: monthStart } },
    }),
  ]);

  const bySource = salesGroups
    .map((g) => ({
      source: g.source,
      label: SALES_SOURCE_LABELS[g.source] || g.source.replace(/_/g, ' ').toUpperCase(),
      count: g._count._all,
      amount: toNumber(g._sum.amount),
    }))
    .filter((r) => r.amount > 0)
    .sort((a, b) => b.amount - a.amount);

  const byCategory = expenseGroups
    .map((g) => ({
      category: g.category,
      label: EXPENSE_CATEGORY_LABELS[g.category] || g.category.replace(/_/g, ' ').toUpperCase(),
      count: g._count._all,
      amount: toNumber(g._sum.amount),
    }))
    .filter((r) => r.amount > 0)
    .sort((a, b) => b.amount - a.amount);

  const totalSales = bySource.reduce((acc, r) => acc + r.amount, 0);
  const totalTransactions = bySource.reduce((acc, r) => acc + r.count, 0);
  const totalExpenses = byCategory.reduce((acc, r) => acc + r.amount, 0);
  const totalEntries = byCategory.reduce((acc, r) => acc + r.count, 0);
  const deductibleExpenses = toNumber(deductibleAgg._sum.amount);
  const nonDeductibleExpenses = Math.max(totalExpenses - deductibleExpenses, 0);

  const grossProfit = Math.max(totalSales - deductibleExpenses, 0);
  const profitMargin = totalSales > 0 ? (grossProfit / totalSales) * 100 : 0;
  let taxRate: number;
  let taxPayable: number;
  if (existingReport) {
    taxRate = toNumber(existingReport.taxRate);
    taxPayable = toNumber(existingReport.taxPayable);
  } else {
    const calcResult = await calculateTaxWithStrategy({
      businessId,
      month,
      year,
      totalSales,
      totalExpenses: deductibleExpenses,
      grossProfit,
    });
    taxRate = calcResult.taxRate;
    taxPayable = calcResult.taxPayable;
  }
  const netProfitAfterTax = Math.max(totalSales - totalExpenses - taxPayable, 0);

  const reportStatus: PnlStatementPdfOptions['summary']['reportStatus'] =
    existingReport?.isLocked || existingReport?.paymentStatus === 'completed'
      ? 'Paid & Locked'
      : existingReport?.isFinalized
      ? 'Finalized'
      : existingReport
      ? 'Calculated (Draft)'
      : 'Live Snapshot';

  const periodLabel = formatMonth(monthStart);
  const paddedMonth = String(month).padStart(2, '0');
  const statementRef = `PNL-${business.merchantId}-${year}${paddedMonth}`;
  const filename = `pnl-statement-${business.merchantId}-${year}-${paddedMonth}.pdf`;

  const pdfOptions: PnlStatementPdfOptions = {
    business: {
      businessName: business.businessName,
      merchantId: business.merchantId,
      ownerName: business.ownerName,
      taxId: business.taxId,
      address: business.address,
      logoUrl: business.logoUrl,
    },
    periodLabel,
    statementRef,
    revenue: {
      totalSales,
      totalTransactions,
      bySource,
    },
    expenses: {
      totalExpenses,
      deductibleExpenses,
      nonDeductibleExpenses,
      totalEntries,
      byCategory,
    },
    summary: {
      grossProfit,
      netProfitAfterTax,
      profitMargin: Number(profitMargin.toFixed(2)),
      taxRate,
      taxPayable: Number(taxPayable.toFixed(2)),
      reportStatus,
    },
  };

  const buffer = await buildPnlStatementPdf(pdfOptions);

  return {
    ...pdfOptions,
    buffer,
    filename,
  };
}

/**
 * Authenticated download of the monthly Profit & Loss Statement PDF.
 */
export async function downloadPnlStatement(
  userId: string,
  businessId: string,
  month: number,
  year: number,
): Promise<{ buffer: Buffer; filename: string; statementRef: string }> {
  await verifyBusinessAccess(userId, businessId, 'statements.download');

  const result = await getPnlStatementData(businessId, month, year);

  logAudit({
    userId,
    businessId,
    action: 'pnl_statement.downloaded',
    resourceType: 'pnl_statement',
    resourceId: businessId,
    newData: {
      month,
      year,
      statementRef: result.statementRef,
      totalSales: result.revenue.totalSales,
      totalExpenses: result.expenses.totalExpenses,
      grossProfit: result.summary.grossProfit,
      taxPayable: result.summary.taxPayable,
    },
  });

  logger.info('Profit & Loss statement downloaded', {
    businessId,
    month,
    year,
    statementRef: result.statementRef,
  });

  return {
    buffer: result.buffer,
    filename: result.filename,
    statementRef: result.statementRef,
  };
}

