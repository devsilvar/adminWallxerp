import PDFDocument from 'pdfkit';
import { fetchLogoForPdf } from '@/lib/pdf-utils';
import { config } from '@/config';
import {
  LEFT,
  RIGHT,
  PAGE_WIDTH,
  INNER_PAD,
  formatMoney,
  formatDate,
  formatMonthYear,
  renderDocumentFooters,
  registerBrandFonts,
  DocumentFonts,
} from './receipt-common.pdf';
import { drawTaxSlipVerificationSeal } from './tax-slip-seal.pdf';

// ─── Design Tokens ──────────────────────────────────────────
const COLORS = {
  ink: '#0f172a',        // Slate 900
  body: '#334155',       // Slate 700
  muted: '#64748b',      // Slate 500
  faint: '#94a3b8',      // Slate 400
  hairline: '#e2e8f0',   // Slate 200
  panel: '#f8fafc',      // Slate 50
  panelBorder: '#cbd5e1',// Slate 300
  accent: '#4f46e5',     // Indigo 600
  accentDark: '#3730a3', // Indigo 800
  headerBand: '#1e1b4b', // Indigo 950
  onAccent: '#ffffff',
  success: '#15803d',    // Green 700
  successBg: '#f0fdf4',  // Green 50
  successBorder: '#bbf7d0',
  pending: '#b45309',    // Amber 700
  pendingBg: '#fffbeb',  // Amber 50
  pendingBorder: '#fde68a',
  blue: '#1d4ed8',       // Blue 700
  blueBg: '#eff6ff',     // Blue 50
  blueBorder: '#bfdbfe',
};

// ─── Data Interface ─────────────────────────────────────────

export interface TaxSlipData {
  slipNumber: string;
  taxMonth: Date;
  generatedAt: Date;
  isFinalized: boolean;
  isLocked: boolean;
  isNilReturn?: boolean;
  paymentStatus: string;
  business: {
    businessName: string;
    merchantId: string;
    ownerName: string;
    taxId?: string | null;
    address?: string | null;
    email?: string | null;
    phone?: string | null;
    logoUrl?: string | null;
  };
  assessment: {
    totalSales: number;
    totalExpenses: number;
    grossProfit: number;
    taxRate: number;
    taxPayable: number;
    profitMargin?: number | null;
    /** What the monthly charge settles — resolved from the business tax policy. */
    taxBasis: 'vat' | 'cit-provision' | 'pit-provision';
    /** True when no completed tax profile exists; the assessment cannot be stated. */
    needsManualReview?: boolean;
  };
  payment?: {
    paymentReference: string;
    paymentDate?: Date | null;
    paymentMethod?: string | null;
    amountPaid?: number | null;
    paymentStatus: string;
  } | null;
}

/**
 * The statutory basis this assessment was computed under. This is the only
 * place the slip is allowed to describe the computation — it must match the
 * engine, not the retired "rate × gross profit" shortcut.
 */
function assessmentBasisStatement(assessment: TaxSlipData['assessment']): string {
  if (assessment.needsManualReview) {
    return 'Pending tax-profile review — no statutory rate has been applied';
  }
  if (assessment.taxBasis === 'vat') {
    return `Net VAT = Output VAT − Input VAT (${assessment.taxRate}% standard rate)`;
  }
  if (assessment.taxBasis === 'pit-provision') {
    return 'VAT-exempt — monthly remittance is ₦0; PIT is assessed annually by the State IRS';
  }
  return 'VAT-exempt — monthly remittance is ₦0; CIT is assessed annually';
}

/**
 * Builds an official, publication-quality 1-page A4 PDF Monthly Tax Assessment Slip.
 * Crafted with sharp 90° architectural geometry and Montserrat typography.
 */
export async function buildTaxSlipPdf(data: TaxSlipData): Promise<Buffer> {
  const logoBuffer = data.business.logoUrl ? await fetchLogoForPdf(data.business.logoUrl) : null;
  const basisStatement = assessmentBasisStatement(data.assessment);
  const needsReview = Boolean(data.assessment.needsManualReview);
  const vatBasis = !needsReview && data.assessment.taxBasis === 'vat';
  const pitBasis = !needsReview && data.assessment.taxBasis === 'pit-provision';

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: LEFT,
      bufferPages: true,
      info: {
        Title: `Tax Assessment Slip - ${data.slipNumber}`,
        Author: 'WallXERP by WallX',
        Subject: `NRS SME Tax Assessment - ${formatMonthYear(data.taxMonth)}`,
        Keywords: 'Tax, NRS, SME, Assessment Slip, Nigeria, WallXERP',
      },
    });

    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // Register brand typography (Montserrat with Helvetica fallback)
    const fonts: DocumentFonts = registerBrandFonts(doc);

    let y = 34;

    // ── 1. Top Decorative Brand Bar (Sharp 90°) ────────────────
    doc.rect(LEFT, y, PAGE_WIDTH, 4).fill(COLORS.accent);
    y += 12;

    // ── 2. Header Section (Logo / Brand Left, Title Right) ──────
    const headerTop = y;

    // Left: Logo & Company Identification
    if (logoBuffer) {
      try {
        doc.image(logoBuffer, LEFT, y, { fit: [46, 46] });
      } catch {
        // Fallback without logo
      }
    }

    const brandX = logoBuffer ? LEFT + 54 : LEFT;
    doc
      .fillColor(COLORS.ink)
      .font(fonts.bold)
      .fontSize(16)
      .text('WallXERP', brandX, y, { lineBreak: false });

    doc
      .fillColor(COLORS.accent)
      .font(fonts.bold)
      .fontSize(9)
      .text(' BY WALLX', brandX + 80, y + 5, { lineBreak: false });

    doc
      .fillColor(COLORS.muted)
      .font(fonts.regular)
      .fontSize(7.5)
      .text('Federal Inland Revenue Service (NRS) SME Compliance Portal', brandX, y + 18);

    // Right: Document Title & Reference Block
    const docTitle = data.isNilReturn ? 'NIL TAX RETURN SLIP' : 'TAX ASSESSMENT SLIP';
    doc
      .fillColor(COLORS.headerBand)
      .font(fonts.bold)
      .fontSize(13.5)
      .text(docTitle, LEFT, headerTop, { width: PAGE_WIDTH, align: 'right', characterSpacing: 0.5 });

    doc
      .fillColor(COLORS.muted)
      .font(fonts.bold)
      .fontSize(8.5)
      .text(`SLIP NO: ${data.slipNumber}`, LEFT, headerTop + 18, { width: PAGE_WIDTH, align: 'right' });

    doc
      .fillColor(COLORS.faint)
      .font(fonts.regular)
      .fontSize(7.5)
      .text(`Issued: ${formatDate(data.generatedAt)}`, LEFT, headerTop + 30, { width: PAGE_WIDTH, align: 'right' });

    y = headerTop + 46;

    // ── 3. Status Banner (Sharp 90° Rectangle) ─────────────────
    const isPaid = data.paymentStatus === 'completed' || data.isLocked;
    const isFinalized = data.isFinalized;

    let bannerBg = COLORS.panel;
    let bannerBorder = COLORS.hairline;
    let bannerColor = COLORS.muted;
    let bannerText = 'PROVISIONAL TAX ASSESSMENT (DRAFT)';
    let bannerSub = 'Draft calculation subject to review prior to finalization and remittance.';

    if (data.isNilReturn) {
      bannerBg = COLORS.blueBg;
      bannerBorder = COLORS.blueBorder;
      bannerColor = COLORS.blue;
      bannerText = 'STATUTORY NIL TAX RETURN — ZERO TAX PAYABLE';
      bannerSub = 'Official NRS Nil Return recorded for trading period with ₦0 taxable sales. Compliance satisfied.';
    } else if (isPaid) {
      bannerBg = COLORS.successBg;
      bannerBorder = COLORS.successBorder;
      bannerColor = COLORS.success;
      bannerText = 'OFFICIAL TAX SLIP — PAID & REMITTED';
      bannerSub = 'Tax assessment has been fully paid and recorded for statutory NRS compliance.';
    } else if (isFinalized) {
      bannerBg = COLORS.blueBg;
      bannerBorder = COLORS.blueBorder;
      bannerColor = COLORS.blue;
      bannerText = 'FINALIZED ASSESSMENT — AWAITING PAYMENT';
      bannerSub = 'Monthly assessment confirmed and locked. Remit payable tax to maintain NRS compliance.';
    }

    doc
      .rect(LEFT, y, PAGE_WIDTH, 34)
      .fillAndStroke(bannerBg, bannerBorder);

    doc
      .fillColor(bannerColor)
      .font(fonts.bold)
      .fontSize(8.5)
      .text(bannerText, LEFT + INNER_PAD, y + 7, { characterSpacing: 0.3 });

    doc
      .fillColor(COLORS.body)
      .font(fonts.regular)
      .fontSize(7.5)
      .text(bannerSub, LEFT + INNER_PAD, y + 20);

    y += 44;

    // ── 4. Metadata Two-Column Card (Sharp 90° Geometry) ────────
    const colGap = 15;
    const colWidth = (PAGE_WIDTH - colGap) / 2; // (507 - 15) / 2 = 246 pt
    const cardHeight = 88;

    // Left Column: Business / Taxpayer Details
    doc
      .rect(LEFT, y, colWidth, cardHeight)
      .fillAndStroke(COLORS.panel, COLORS.hairline);

    doc
      .fillColor(COLORS.muted)
      .font(fonts.bold)
      .fontSize(7.5)
      .text('TAXPAYER / BUSINESS DETAILS', LEFT + INNER_PAD, y + 8, { characterSpacing: 0.3 });

    doc
      .fillColor(COLORS.ink)
      .font(fonts.bold)
      .fontSize(9.5)
      .text(data.business.businessName, LEFT + INNER_PAD, y + 21, { width: colWidth - 28, height: 12, ellipsis: true });

    doc
      .fillColor(COLORS.body)
      .font(fonts.regular)
      .fontSize(8);

    const leftDetails = [
      `Merchant ID: ${data.business.merchantId}`,
      `Tax ID (TIN): ${data.business.taxId || 'Not registered / In Progress'}`,
      `Owner / Contact: ${data.business.ownerName}`,
      data.business.address ? `Address: ${data.business.address.slice(0, 36)}` : `Email: ${data.business.email || 'N/A'}`,
    ];

    let dy = y + 36;
    leftDetails.forEach((line) => {
      doc.text(line, LEFT + INNER_PAD, dy, { width: colWidth - 28, height: 10, ellipsis: true });
      dy += 11;
    });

    // Right Column: Assessment Period & Authority Details
    const rightX = LEFT + colWidth + colGap;
    doc
      .rect(rightX, y, colWidth, cardHeight)
      .fillAndStroke(COLORS.panel, COLORS.hairline);

    doc
      .fillColor(COLORS.muted)
      .font(fonts.bold)
      .fontSize(7.5)
      .text('ASSESSMENT SPECIFICATIONS', rightX + INNER_PAD, y + 8, { characterSpacing: 0.3 });

    doc
      .fillColor(COLORS.accentDark)
      .font(fonts.bold)
      .fontSize(10.5)
      .text(formatMonthYear(data.taxMonth).toUpperCase(), rightX + INNER_PAD, y + 21);

    const rightDetails = [
      `Tax Jurisdiction: Nigeria (NRS)`,
      `Assessment Basis: ${basisStatement}`,
      `Assessment Status: ${isPaid ? 'Paid & Compliant' : isFinalized ? 'Finalized' : 'Draft Assessment'}`,
      `Due Date: 21st of ${new Date(new Date(data.taxMonth).setMonth(new Date(data.taxMonth).getMonth() + 1)).toLocaleDateString('en-NG', { month: 'short', year: 'numeric' })}`,
    ];

    dy = y + 36;
    rightDetails.forEach((line) => {
      doc.fillColor(COLORS.body).font(fonts.regular).fontSize(8).text(line, rightX + INNER_PAD, dy, { width: colWidth - 28, height: 10, ellipsis: true });
      dy += 11;
    });

    y += cardHeight + 16;

    // ── 5. Assessment Computation Table (Sharp 90° & 14pt Pad) ──
    doc
      .fillColor(COLORS.ink)
      .font(fonts.bold)
      .fontSize(9.5)
      .text('Monthly Tax Assessment Breakdown', LEFT, y);
    y += 14;

    // Table Header Band (Sharp 90°)
    const tableHeaderY = y;
    doc
      .rect(LEFT, tableHeaderY, PAGE_WIDTH, 22)
      .fill(COLORS.headerBand);

    const colItemX = LEFT + INNER_PAD; // 44 + 14 = 58
    const colBasisX = LEFT + 240;
    const colAmtW = 110;
    const colAmtX = RIGHT - INNER_PAD - colAmtW; // 551 - 14 - 110 = 427

    doc.fillColor(COLORS.onAccent).font(fonts.bold).fontSize(7.5);
    doc.text('ASSESSMENT COMPONENT', colItemX, tableHeaderY + 7, { characterSpacing: 0.4 });
    doc.text('CALCULATION BASIS', colBasisX, tableHeaderY + 7, { characterSpacing: 0.4 });
    doc.text('AMOUNT (NGN)', colAmtX, tableHeaderY + 7, { width: colAmtW, align: 'right', characterSpacing: 0.4 });

    y = tableHeaderY + 24;

    // Row definitions
    const rows = [
      {
        title: 'Total Gross Sales (Revenue)',
        subtitle: 'Confirmed sales, POS collections, and bank inflows',
        basis: 'Gross Turnover (A)',
        amount: formatMoney(data.assessment.totalSales),
        isNegative: false,
      },
      {
        title: 'Allowable Business Expenses',
        subtitle: 'Deductible operating expenses logged for this month',
        basis: 'Deductible Outflows (B)',
        amount: `- ${formatMoney(data.assessment.totalExpenses)}`,
        isNegative: true,
      },
      {
        title: needsReview
          ? 'Gross Profit (Reference)'
          : vatBasis
          ? 'Gross Profit (Reference)'
          : 'Gross Profit (Annual Income-Tax Base)',
        subtitle: needsReview
          ? 'Complete the tax profile to determine the assessment basis'
          : vatBasis
          ? 'Not the VAT base — VAT is charged on taxable sales'
          : 'CIT/PIT is assessed annually, not monthly',
        basis: 'Sales − Expenses',
        amount: formatMoney(data.assessment.grossProfit),
        isBold: true,
      },
      needsReview
        ? {
            title: 'Statutory Rate',
            subtitle: 'Tax profile incomplete',
            basis: 'Not determined',
            amount: '—',
          }
        : vatBasis
        ? {
            title: 'Standard VAT Rate',
            subtitle: 'Applied to taxable sales and VAT-bearing expenses',
            basis: 'Statutory VAT Rate',
            amount: `${data.assessment.taxRate}%`,
          }
        : {
            title: 'Monthly VAT',
            subtitle: 'VAT is not chargeable on this tax profile',
            basis: 'NTA 2025 — VAT exemption',
            amount: formatMoney(0),
          },
    ];

    rows.forEach((row, i) => {
      const rowY = y;
      const rowHeight = 28;

      // Subtle zebra striping (Sharp 90°)
      if (i % 2 === 1) {
        doc.rect(LEFT, rowY, PAGE_WIDTH, rowHeight).fill('#fbfcfd');
      }

      // Title & Subtitle
      doc
        .fillColor(row.isBold ? COLORS.ink : COLORS.body)
        .font(row.isBold ? fonts.bold : fonts.regular)
        .fontSize(8)
        .text(row.title, colItemX, rowY + 5);

      doc
        .fillColor(COLORS.faint)
        .font(fonts.regular)
        .fontSize(7)
        .text(row.subtitle, colItemX, rowY + 16);

      // Basis
      doc
        .fillColor(COLORS.muted)
        .font(fonts.regular)
        .fontSize(8)
        .text(row.basis, colBasisX, rowY + 9);

      // Amount
      doc
        .fillColor(row.isBold ? COLORS.ink : COLORS.body)
        .font(row.isBold ? fonts.bold : fonts.regular)
        .fontSize(8.5)
        .text(row.amount, colAmtX, rowY + 9, { width: colAmtW, align: 'right' });

      // Hairline divider below
      doc
        .moveTo(LEFT, rowY + rowHeight)
        .lineTo(RIGHT, rowY + rowHeight)
        .strokeColor(COLORS.hairline)
        .lineWidth(0.5)
        .stroke();

      y += rowHeight;
    });

    // ── 6. Payable Tax Summary Bar (Sharp 90° Box) ──────────────
    y += 6;
    const summaryHeight = 42;
    doc
      .rect(LEFT, y, PAGE_WIDTH, summaryHeight)
      .fillAndStroke('#f5f3ff', COLORS.accent);

    doc
      .fillColor(COLORS.accentDark)
      .font(fonts.bold)
      .fontSize(9.5)
      .text(
        needsReview
          ? 'ASSESSMENT PENDING — TAX PROFILE REQUIRED'
          : vatBasis
          ? 'NET VAT PAYABLE — MONTHLY REMITTANCE'
          : 'MONTHLY REMITTANCE — NO VAT DUE',
        colItemX,
        y + 11,
        { characterSpacing: 0.3 }
      );

    doc
      .fillColor(COLORS.muted)
      .font(fonts.regular)
      .fontSize(7.5)
      .text(
        needsReview
          ? 'Complete the Tax Profile Quiz before this period can be remitted to the NRS.'
          : vatBasis
          ? 'Net VAT due — output VAT minus input VAT'
          : pitBasis
          ? 'VAT-exempt. Personal Income Tax is assessed annually with your State IRS.'
          : 'VAT-exempt. Corporate Income Tax and Development Levy are assessed annually.',
        colItemX,
        y + 24,
        { width: PAGE_WIDTH - 240 }
      );

    const payableW = 200;
    const payableX = RIGHT - INNER_PAD - payableW;
    doc
      .fillColor(COLORS.accentDark)
      .font(fonts.bold)
      .fontSize(13)
      .text(formatMoney(data.assessment.taxPayable), payableX, y + 13, { width: payableW, align: 'right' });

    y += summaryHeight + 14;

    // ── 7. Payment & Remittance Details (Sharp 90°) ─────────────
    if (isPaid && data.payment) {
      const boxHeight = 54;
      doc
        .rect(LEFT, y, PAGE_WIDTH, boxHeight)
        .fillAndStroke(COLORS.successBg, COLORS.successBorder);

      doc
        .fillColor(COLORS.success)
        .font(fonts.bold)
        .fontSize(8)
        .text('TAX PAYMENT & NRS REMITTANCE CONFIRMATION', colItemX, y + 7, { characterSpacing: 0.3 });

      doc
        .fillColor(COLORS.body)
        .font(fonts.regular)
        .fontSize(7.5);

      // Row 1
      doc.text(`Payment Ref: ${data.payment.paymentReference}`, colItemX, y + 19, { width: 300, height: 10, ellipsis: true });
      doc.text(`Status: COMPLETED`, RIGHT - INNER_PAD - 90, y + 19, { width: 90, align: 'right' });

      // Row 2
      doc.text(`Date Paid: ${data.payment.paymentDate ? formatDate(data.payment.paymentDate) : 'Confirmed'}`, colItemX, y + 30, { width: 180 });
      doc.text(`Amount Paid: ${formatMoney(data.payment.amountPaid || data.assessment.taxPayable)}`, RIGHT - INNER_PAD - 160, y + 30, { width: 160, align: 'right' });

      doc
        .fillColor(COLORS.muted)
        .font(fonts.regular)
        .fontSize(6.5)
        .text('Statutory electronic remittance processed via WallXERP automated gateway. Record certified for NRS compliance.', colItemX, y + 42);

      y += boxHeight + 12;
    } else {
      const boxHeight = 40;
      doc
        .rect(LEFT, y, PAGE_WIDTH, boxHeight)
        .fillAndStroke(COLORS.panel, COLORS.panelBorder);

      doc
        .fillColor(COLORS.ink)
        .font(fonts.bold)
        .fontSize(8)
        .text('HOW TO REMIT YOUR MONTHLY TAX', colItemX, y + 7, { characterSpacing: 0.3 });

      doc
        .fillColor(COLORS.body)
        .font(fonts.regular)
        .fontSize(7.5)
        .text(
          'Log in to your WallXERP SME dashboard at any time and click "Pay Now" on this assessment report. Instant card, transfer, and virtual account payments are supported with automated instant receipt generation.',
          colItemX,
          y + 19,
          { width: PAGE_WIDTH - 28 }
        );

      y += boxHeight + 12;
    }

    // ── 8. Statutory Disclaimer & Verification Seal ────────────
    drawTaxSlipVerificationSeal({
      doc,
      left: LEFT,
      right: RIGHT,
      pageWidth: PAGE_WIDTH,
      y,
      isPaid,
      slipNumber: data.slipNumber,
      generatedAt: data.generatedAt,
      taxBasisText: `Tax Basis: ${basisStatement}.`,
      colors: {
        hairline: COLORS.hairline,
        muted: COLORS.muted,
        faint: COLORS.faint,
        success: COLORS.success,
      },
      fonts,
    });

    // ── 9. Universal Safe Footer Pass ───────────────────────────
    renderDocumentFooters(doc, {
      left: LEFT,
      right: RIGHT,
      platformText: `WallXERP by WallX  •  SME Tax Remittance System  •  Authority: ${config.tax.taxAuthority}`,
      disclaimerText: `Official Tax Assessment Slip  •  Generated: ${new Date().toLocaleDateString('en-NG')}  •  Valid without physical signature`,
      accentColor: COLORS.accent,
      fonts,
    });

    doc.end();
  });
}
