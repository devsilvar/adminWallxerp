import PDFDocument from 'pdfkit';
import { fetchLogoForPdf } from '@/lib/pdf-utils';
import {
  LEFT,
  RIGHT,
  PAGE_WIDTH,
  INNER_PAD,
  COLORS,
  formatMoney,
  renderDocumentFooters,
  registerBrandFonts,
  DocumentFonts,
} from './receipt-common.pdf';

export interface PnlRevenueRow {
  source: string;
  label: string;
  count: number;
  amount: number;
}

export interface PnlExpenseRow {
  category: string;
  label: string;
  count: number;
  amount: number;
  isDeductible?: boolean;
}

export interface PnlStatementPdfOptions {
  business: {
    businessName: string;
    merchantId: string;
    ownerName: string;
    taxId: string | null;
    address?: string | null;
    logoUrl?: string | null;
  };
  periodLabel: string;
  statementRef: string;
  revenue: {
    totalSales: number;
    totalTransactions: number;
    bySource: PnlRevenueRow[];
  };
  expenses: {
    totalExpenses: number;
    deductibleExpenses: number;
    nonDeductibleExpenses: number;
    totalEntries: number;
    byCategory: PnlExpenseRow[];
  };
  summary: {
    grossProfit: number;
    netProfitAfterTax: number;
    profitMargin: number;
    taxRate: number;
    taxPayable: number;
    reportStatus: 'Paid & Locked' | 'Finalized' | 'Calculated (Draft)' | 'Live Snapshot';
    /** What the monthly charge settles — resolved from the business tax policy. */
    taxBasis: 'vat' | 'cit-provision' | 'pit-provision';
    /** True when no completed tax profile exists; no statutory rate applies. */
    needsManualReview?: boolean;
  };
}

/**
 * Builds an official A4 multi-page Profit & Loss (P&L) Statement.
 * Rendered with sharp 90° architectural geometry, Montserrat typography, and balanced 14pt padding.
 */
export async function buildPnlStatementPdf(options: PnlStatementPdfOptions): Promise<Buffer> {
  const { business, periodLabel, statementRef, revenue, expenses, summary } = options;

  const logoBuffer = business.logoUrl ? await fetchLogoForPdf(business.logoUrl) : null;

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: LEFT, bufferPages: true });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // Register brand fonts (Montserrat with Helvetica fallback)
    const fonts: DocumentFonts = registerBrandFonts(doc);

    // ── 1. Top Header ─────────────────────────────────────────
    if (logoBuffer) {
      try {
        doc.image(logoBuffer, LEFT, 35, { fit: [42, 42] });
      } catch {
        // Fallback gracefully if logo fails to render
      }
    }

    const headerTextX = LEFT + (logoBuffer ? 50 : 0);

    doc
      .fontSize(16)
      .font(fonts.bold)
      .fillColor(COLORS.ink)
      .text('WALLX ERP', headerTextX, 38);

    doc
      .fontSize(8)
      .font(fonts.bold)
      .fillColor('#7C3AED')
      .text('OFFICIAL PROFIT & LOSS (P&L) STATEMENT', headerTextX, 56, { characterSpacing: 0.3 });

    doc
      .fontSize(8)
      .font(fonts.medium)
      .fillColor(COLORS.muted)
      .text(`Statement Ref: ${statementRef}`, LEFT, 38, { align: 'right', width: PAGE_WIDTH });

    doc
      .fontSize(7.5)
      .font(fonts.regular)
      .fillColor(COLORS.muted)
      .text(
        `Generated: ${new Date().toLocaleDateString('en-NG', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })}`,
        LEFT,
        50,
        { align: 'right', width: PAGE_WIDTH },
      );

    // Divider
    doc.moveTo(LEFT, 82).lineTo(RIGHT, 82).strokeColor(COLORS.hairline).lineWidth(0.8).stroke();

    // ── 2. Business & Period Metadata Block ───────────────────
    const metaY = 92;
    const colWidth = (PAGE_WIDTH - 20) / 2;

    doc
      .fontSize(7.5)
      .font(fonts.bold)
      .fillColor(COLORS.subheading)
      .text('BUSINESS DETAILS', LEFT, metaY, { characterSpacing: 0.3 });
    doc
      .fontSize(10)
      .font(fonts.bold)
      .fillColor(COLORS.ink)
      .text(business.businessName, LEFT, metaY + 12, { width: colWidth, lineBreak: false, ellipsis: true });
    doc.fontSize(8).font(fonts.regular).fillColor(COLORS.body);
    doc.text(`Owner: ${business.ownerName}`, LEFT, metaY + 26, { width: colWidth, lineBreak: false, ellipsis: true });
    if (business.taxId) doc.text(`Tax ID / TIN: ${business.taxId}`, LEFT, metaY + 37, { width: colWidth, lineBreak: false, ellipsis: true });
    if (business.address) doc.text(`Address: ${business.address}`, LEFT, metaY + 48, { width: colWidth, height: 10, ellipsis: true });

    const rightColX = LEFT + colWidth + 20;
    doc
      .fontSize(7.5)
      .font(fonts.bold)
      .fillColor(COLORS.subheading)
      .text('STATEMENT SUMMARY INFO', rightColX, metaY, { characterSpacing: 0.3 });
    doc.fontSize(8).font(fonts.regular).fillColor(COLORS.body);
    doc.text(`Merchant ID: ${business.merchantId}`, rightColX, metaY + 12, { width: colWidth, lineBreak: false, ellipsis: true });
    doc.text(`Accounting Period: ${periodLabel}`, rightColX, metaY + 23, { width: colWidth, lineBreak: false, ellipsis: true });
    doc.text(`Assessment Status: ${summary.reportStatus}`, rightColX, metaY + 34, { width: colWidth, lineBreak: false, ellipsis: true });
    doc.text(`Currency: Nigerian Naira (NGN)`, rightColX, metaY + 45, { width: colWidth, lineBreak: false, ellipsis: true });

    // ── 3. KPI Financial Summary Strip (Sharp 90° Cards) ───────
    const cardY = 160;
    const gap = 8;
    const cardW = (PAGE_WIDTH - gap * 3) / 4; // ~120.75 pt
    const cardH = 48;

    const cards = [
      {
        label: 'TOTAL REVENUE (+)',
        value: formatMoney(revenue.totalSales),
        bg: '#ECFDF5',
        border: '#A7F3D0',
        text: '#059669',
      },
      {
        label: 'TOTAL EXPENSES (-)',
        value: formatMoney(expenses.totalExpenses),
        bg: '#FEF2F2',
        border: '#FECACA',
        text: '#DC2626',
      },
      {
        label: `GROSS PROFIT (${summary.profitMargin.toFixed(1)}%)`,
        value: formatMoney(summary.grossProfit),
        bg: '#FAF5FF',
        border: '#E9D5FF',
        text: '#7C3AED',
      },
      {
        label: `ESTIMATED TAX (${summary.taxRate}%)`,
        value: formatMoney(summary.taxPayable),
        bg: '#0F172A',
        border: '#0F172A',
        text: '#C084FC',
        isDark: true,
      },
    ];

    cards.forEach((c, i) => {
      const cx = LEFT + i * (cardW + gap);
      doc.rect(cx, cardY, cardW, cardH).fillAndStroke(c.bg, c.border);
      doc
        .fontSize(6.5)
        .font(fonts.bold)
        .fillColor(c.isDark ? '#94A3B8' : COLORS.muted)
        .text(c.label, cx + 8, cardY + 7, { width: cardW - 16, characterSpacing: 0.2 });
      doc
        .fontSize(8.5)
        .font(fonts.bold)
        .fillColor(c.text)
        .text(c.value, cx + 8, cardY + 23, { width: cardW - 16 });
    });

    let cursorY = 224;

    // ── 4. Section 1: Revenue Breakdown by Channel ─────────────
    doc
      .fontSize(9)
      .font(fonts.bold)
      .fillColor(COLORS.ink)
      .text('1. REVENUE (SALES TURNOVER BY CHANNEL)', LEFT, cursorY, { characterSpacing: 0.3 });
    cursorY += 14;

    const colRev = {
      label: LEFT + INNER_PAD, // 58
      count: 255, // width: 65, ends at 320
      share: 330, // width: 60, ends at 390
      amount: 405, // width: 132, ends at 537 = RIGHT - 14!
    };

    function renderRevenueHeader(y: number) {
      doc.rect(LEFT, y, PAGE_WIDTH, 18).fill('#F1F5F9');
      doc.fontSize(7).font(fonts.bold).fillColor(COLORS.subheading);
      doc.text('REVENUE CHANNEL', colRev.label, y + 5, { characterSpacing: 0.3 });
      doc.text('TRANSACTIONS', colRev.count, y + 5, { width: 65, align: 'right', characterSpacing: 0.3 });
      doc.text('SHARE (%)', colRev.share, y + 5, { width: 60, align: 'right', characterSpacing: 0.3 });
      doc.text('AMOUNT (NGN)', colRev.amount, y + 5, { width: 132, align: 'right', characterSpacing: 0.3 });
    }

    renderRevenueHeader(cursorY);
    cursorY += 20;

    if (revenue.bySource.length === 0) {
      doc
        .fontSize(8)
        .font(fonts.regular)
        .fillColor(COLORS.muted)
        .text('No taxable sales recorded in this period.', colRev.label, cursorY + 4);
      cursorY += 20;
    } else {
      revenue.bySource.forEach((row, idx) => {
        if (cursorY > 730) {
          doc.addPage();
          cursorY = 44;
          renderRevenueHeader(cursorY);
          cursorY += 20;
        }
        if (idx % 2 === 0) {
          doc.rect(LEFT, cursorY - 2, PAGE_WIDTH, 18).fill('#FAFAFA');
        }
        const share =
          revenue.totalSales > 0 ? ((row.amount / revenue.totalSales) * 100).toFixed(1) : '0.0';
        doc.fontSize(7.5).font(fonts.regular).fillColor(COLORS.subheading);
        doc.text(row.label, colRev.label, cursorY + 2);
        doc.text(String(row.count), colRev.count, cursorY + 2, { width: 65, align: 'right' });
        doc.text(`${share}%`, colRev.share, cursorY + 2, { width: 60, align: 'right' });
        doc
          .font(fonts.bold)
          .fillColor(COLORS.success)
          .text(formatMoney(row.amount), colRev.amount, cursorY + 2, {
            width: 132,
            align: 'right',
          });
        cursorY += 18;
      });
    }

    // Total Revenue Row (Sharp 90°)
    doc.rect(LEFT, cursorY, PAGE_WIDTH, 20).fill('#ECFDF5');
    doc.fontSize(8).font(fonts.bold).fillColor('#065F46');
    doc.text('TOTAL REVENUE', colRev.label, cursorY + 5, { characterSpacing: 0.3 });
    doc.text(String(revenue.totalTransactions), colRev.count, cursorY + 5, {
      width: 65,
      align: 'right',
    });
    doc.text('100.0%', colRev.share, cursorY + 5, { width: 60, align: 'right' });
    doc.text(formatMoney(revenue.totalSales), colRev.amount, cursorY + 5, {
      width: 132,
      align: 'right',
    });
    cursorY += 32;

    // ── 5. Section 2: Operating Expenses Breakdown by Category ──
    if (cursorY > 680) {
      doc.addPage();
      cursorY = 44;
    }

    doc
      .fontSize(9)
      .font(fonts.bold)
      .fillColor(COLORS.ink)
      .text('2. OPERATING EXPENSES (BY CATEGORY)', LEFT, cursorY, { characterSpacing: 0.3 });
    cursorY += 14;

    const colExp = {
      label: LEFT + INNER_PAD, // 58
      count: 255, // width: 65, ends at 320
      share: 330, // width: 60, ends at 390
      amount: 405, // width: 132, ends at 537 = RIGHT - 14!
    };

    function renderExpenseHeader(y: number) {
      doc.rect(LEFT, y, PAGE_WIDTH, 18).fill('#F1F5F9');
      doc.fontSize(7).font(fonts.bold).fillColor(COLORS.subheading);
      doc.text('EXPENSE CATEGORY', colExp.label, y + 5, { characterSpacing: 0.3 });
      doc.text('ENTRIES', colExp.count, y + 5, { width: 65, align: 'right', characterSpacing: 0.3 });
      doc.text('SHARE (%)', colExp.share, y + 5, { width: 60, align: 'right', characterSpacing: 0.3 });
      doc.text('AMOUNT (NGN)', colExp.amount, y + 5, { width: 132, align: 'right', characterSpacing: 0.3 });
    }

    renderExpenseHeader(cursorY);
    cursorY += 20;

    if (expenses.byCategory.length === 0) {
      doc
        .fontSize(8)
        .font(fonts.regular)
        .fillColor(COLORS.muted)
        .text('No operating expenses recorded in this period.', colExp.label, cursorY + 4);
      cursorY += 20;
    } else {
      expenses.byCategory.forEach((row, idx) => {
        if (cursorY > 730) {
          doc.addPage();
          cursorY = 44;
          renderExpenseHeader(cursorY);
          cursorY += 20;
        }
        if (idx % 2 === 0) {
          doc.rect(LEFT, cursorY - 2, PAGE_WIDTH, 18).fill('#FAFAFA');
        }
        const share =
          expenses.totalExpenses > 0
            ? ((row.amount / expenses.totalExpenses) * 100).toFixed(1)
            : '0.0';
        doc.fontSize(7.5).font(fonts.regular).fillColor(COLORS.subheading);
        doc.text(row.label, colExp.label, cursorY + 2);
        doc.text(String(row.count), colExp.count, cursorY + 2, { width: 65, align: 'right' });
        doc.text(`${share}%`, colExp.share, cursorY + 2, { width: 60, align: 'right' });
        doc
          .font(fonts.bold)
          .fillColor(COLORS.danger)
          .text(formatMoney(row.amount), colExp.amount, cursorY + 2, {
            width: 132,
            align: 'right',
          });
        cursorY += 18;
      });
    }

    // Total Expenses Row (Sharp 90°)
    doc.rect(LEFT, cursorY, PAGE_WIDTH, 20).fill('#FEF2F2');
    doc.fontSize(8).font(fonts.bold).fillColor('#991B1B');
    doc.text('TOTAL OPERATING EXPENSES', colExp.label, cursorY + 5, { characterSpacing: 0.3 });
    doc.text(String(expenses.totalEntries), colExp.count, cursorY + 5, {
      width: 65,
      align: 'right',
    });
    doc.text('100.0%', colExp.share, cursorY + 5, { width: 60, align: 'right' });
    doc.text(formatMoney(expenses.totalExpenses), colExp.amount, cursorY + 5, {
      width: 132,
      align: 'right',
    });
    cursorY += 34;

    // ── 6. Section 3: Net Profit & Tax Assessment Summary ──────
    if (cursorY > 640) {
      doc.addPage();
      cursorY = 44;
    }

    doc
      .fontSize(9)
      .font(fonts.bold)
      .fillColor(COLORS.ink)
      .text('3. NET PROFITABILITY & NRS TAX COMPUTATION', LEFT, cursorY, { characterSpacing: 0.3 });
    cursorY += 14;

    const summaryRows: Array<{ label: string; value: string; bold?: boolean; highlight?: boolean }> =
      [
        { label: 'Total Taxable Revenue (Sales)', value: formatMoney(revenue.totalSales) },
        {
          label: 'Less: Allowable Deductible Expenses',
          value: `(${formatMoney(expenses.deductibleExpenses)})`,
        },
        ...(expenses.nonDeductibleExpenses > 0
          ? [
              {
                label: 'Non-Deductible Expenses (Excluded from Tax Base)',
                value: formatMoney(expenses.nonDeductibleExpenses),
              },
            ]
          : []),
        {
          label:
            summary.taxBasis === 'vat'
              ? 'Gross Profit (Revenue - Deductible Expenses)'
              : 'Gross Profit (Annual Income-Tax Base = Revenue - Deductible Expenses)',
          value: formatMoney(summary.grossProfit),
          bold: true,
          highlight: true,
        },
        {
          label: 'Gross Profit Margin (%)',
          value: `${summary.profitMargin.toFixed(2)}%`,
        },
        {
          label: summary.needsManualReview
            ? 'Monthly Tax Payable (Pending Review — tax profile incomplete)'
            : summary.taxBasis === 'vat'
            ? 'Net VAT Payable (Output VAT − Input VAT)'
            : 'Monthly Remittance (VAT-exempt)',
          value: formatMoney(summary.taxPayable),
          bold: true,
        },
        {
          label: 'Net Profit After Tax',
          value: formatMoney(summary.netProfitAfterTax),
          bold: true,
          highlight: true,
        },
      ];

    summaryRows.forEach((sRow) => {
      if (sRow.highlight) {
        doc.rect(LEFT, cursorY - 2, PAGE_WIDTH, 20).fill('#FAF5FF');
      }
      doc
        .fontSize(8)
        .font(sRow.bold ? fonts.bold : fonts.regular)
        .fillColor(sRow.highlight ? '#581C87' : COLORS.subheading)
        .text(sRow.label, LEFT + INNER_PAD, cursorY + 3);
      doc
        .fontSize(8)
        .font(sRow.bold ? fonts.bold : fonts.regular)
        .fillColor(sRow.highlight ? '#7C3AED' : COLORS.ink)
        .text(sRow.value, 357, cursorY + 3, { width: 180, align: 'right' });
      cursorY += 20;
    });

    // ── 7. Official Certification Footer on All Pages ──────────
    renderDocumentFooters(doc, {
      left: LEFT,
      right: RIGHT,
      platformText: 'CERTIFIED SME PROFIT & LOSS STATEMENT · WALLX ERP COMPLIANCE PLATFORM',
      complianceText: 'Compliant with Nigerian NRS regulations · Valid electronic document',
      accentColor: '#7C3AED',
      fonts,
    });

    doc.end();
  });
}
