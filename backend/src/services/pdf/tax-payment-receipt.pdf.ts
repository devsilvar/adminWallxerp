import PDFDocument from 'pdfkit';
import { fetchLogoForPdf } from '@/lib/pdf-utils';
import {
  COLORS,
  LEFT,
  RIGHT,
  PAGE_WIDTH,
  INNER_PAD,
  formatMoney,
  formatDate,
  formatDateTime,
  formatPaymentMethod,
  renderDocumentFooters,
  registerBrandFonts,
  DocumentFonts,
} from './receipt-common.pdf';

// ─── Tax Payment Receipt Data Model ─────────────────────────
export interface TaxPaymentReceiptData {
  receiptNumber: string;
  paymentReference: string;
  paymentDate: Date;
  amount: number;
  paymentMethod: string;
  remittanceStatus: 'collected' | 'remitting' | 'remitted';
  firsRemittanceRef?: string | null;
  firsReceiptUrl?: string | null;
  business: {
    businessName: string;
    ownerName: string;
    merchantId: string;
    taxId?: string | null;
    address?: string | null;
    logoUrl?: string | null;
  };
  taxReport: {
    taxMonth: Date;
    totalSales: number;
    totalExpenses: number;
    grossProfit: number;
    taxRate: number;
    taxPayable: number;
  };
}

/**
 * Builds a professional PDF receipt for Tax Payment (Stage 1 Collection or Stage 2 NRS Remittance).
 * Rendered with sharp 90° architectural geometry, Montserrat typography, and balanced 14pt padding.
 */
export async function buildTaxPaymentReceiptPdf(data: TaxPaymentReceiptData): Promise<Buffer> {
  const logoBuffer = data.business.logoUrl ? await fetchLogoForPdf(data.business.logoUrl) : null;

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: LEFT,
      bufferPages: true,
      info: { Title: `Tax Receipt ${data.receiptNumber}`, Author: 'WallXERP by WallX' },
    });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // Register brand fonts (Montserrat with Helvetica fallback)
    const fonts: DocumentFonts = registerBrandFonts(doc);

    const isRemitted = data.remittanceStatus === 'remitted';

    // ── Header Background Band (Sharp 90°) ──
    doc.rect(LEFT, 44, PAGE_WIDTH, 76).fillAndStroke('#0f172a', '#0f172a');

    // ── Logo / Brand ──
    if (logoBuffer) {
      try {
        doc.image(logoBuffer, LEFT + 16, 54, { fit: [54, 54] });
      } catch {
        // Fallback gracefully
      }
    }

    const brandX = logoBuffer ? LEFT + 82 : LEFT + 20;
    doc.fillColor('#ffffff').fontSize(16).font(fonts.bold)
      .text('WallXERP', brandX, 58);
    doc.fillColor('#94a3b8').fontSize(8.5).font(fonts.regular)
      .text('Official NRS SME Tax Remittance Platform', brandX, 78);

    // ── Document Title & Metadata (Right) ──
    const titleText = isRemitted ? 'OFFICIAL NRS TAX RECEIPT' : 'TAX PAYMENT CUSTODY RECEIPT';
    doc.fontSize(9.5).font(fonts.bold).fillColor('#ffffff')
      .text(titleText, LEFT, 60, { width: PAGE_WIDTH - 16, align: 'right', characterSpacing: 0.3 });

    doc.fontSize(8).font(fonts.medium).fillColor('#cbd5e1')
      .text(`Receipt #: ${data.receiptNumber}`, LEFT, 76, { width: PAGE_WIDTH - 16, align: 'right' });
    doc.fontSize(8).font(fonts.regular).fillColor('#cbd5e1')
      .text(`Issued: ${formatDate(data.paymentDate)}`, LEFT, 90, { width: PAGE_WIDTH - 16, align: 'right' });

    doc.y = 134;

    // ── Stage Status Banner (Sharp 90°) ──
    const bannerBg = isRemitted ? '#f0fdf4' : '#eff6ff';
    const bannerBorder = isRemitted ? '#bbf7d0' : '#bfdbfe';
    const bannerText = isRemitted ? '#166534' : '#1e40af';
    const bannerDesc = isRemitted
      ? `STATUS: REMITTED TO NRS (Remittance Ref: ${data.firsRemittanceRef || 'VERIFIED'})`
      : 'STATUS: PAYMENT COLLECTED & HELD IN CUSTODY FOR BATCH NRS REMITTANCE';

    doc.rect(LEFT, doc.y, PAGE_WIDTH, 28).fillAndStroke(bannerBg, bannerBorder);
    doc.fillColor(bannerText).fontSize(8.5).font(fonts.bold)
      .text(bannerDesc, LEFT + 12, doc.y + 8.5, { width: PAGE_WIDTH - 24, align: 'center', characterSpacing: 0.2 });

    doc.moveDown(1.5);

    // ── Two Column Business & Taxpayer Summary (Sharp 90°) ──
    const topY = doc.y;
    const colGap = 15;
    const colWidth = (PAGE_WIDTH - colGap) / 2; // 246 pt

    // Left: Business Profile
    doc.rect(LEFT, topY, colWidth, 90).fillAndStroke(COLORS.panel, COLORS.hairline);
    doc.fillColor(COLORS.muted).fontSize(7.5).font(fonts.bold).text('TAXPAYER / BUSINESS', LEFT + 12, topY + 10, { characterSpacing: 0.3 });
    doc.fillColor(COLORS.ink).fontSize(10).font(fonts.bold).text(data.business.businessName, LEFT + 12, topY + 23, { width: colWidth - 24, ellipsis: true });
    doc.fillColor(COLORS.body).fontSize(8).font(fonts.regular);
    doc.text(`Owner: ${data.business.ownerName}`, LEFT + 12, topY + 39);
    doc.text(`Merchant ID: ${data.business.merchantId}`, LEFT + 12, topY + 53);
    if (data.business.taxId) {
      doc.text(`Tax ID (TIN): ${data.business.taxId}`, LEFT + 12, topY + 67);
    }

    // Right: Payment Details
    const rightColX = LEFT + colWidth + colGap;
    doc.rect(rightColX, topY, colWidth, 90).fillAndStroke(COLORS.panel, COLORS.hairline);
    doc.fillColor(COLORS.muted).fontSize(7.5).font(fonts.bold).text('PAYMENT DETAILS', rightColX + 12, topY + 10, { characterSpacing: 0.3 });
    doc.fillColor(COLORS.ink).fontSize(8.5).font(fonts.regular);
    doc.text(`Amount Paid: `, rightColX + 12, topY + 23, { continued: true });
    doc.font(fonts.bold).fillColor(COLORS.accent).text(formatMoney(data.amount));
    doc.fillColor(COLORS.body).font(fonts.regular);
    doc.text(`Channel: ${formatPaymentMethod(data.paymentMethod)}`, rightColX + 12, topY + 39);
    doc.text(`Paystack Ref: ${data.paymentReference}`, rightColX + 12, topY + 53, { width: colWidth - 24, ellipsis: true });
    doc.text(`Paid At: ${formatDateTime(data.paymentDate)}`, rightColX + 12, topY + 67);

    doc.y = topY + 106;

    // ── Tax Liability Breakdown Table with balanced 14pt padding (Sharp 90°) ──
    doc.fillColor(COLORS.ink).fontSize(10.5).font(fonts.bold).text('Tax Assessment & Settlement Breakdown', LEFT, doc.y);
    doc.moveDown(0.4);

    const tableY = doc.y;
    doc.rect(LEFT, tableY, PAGE_WIDTH, 22).fillColor(COLORS.headerBand).fill();

    const colItemX = LEFT + INNER_PAD; // 44 + 14 = 58
    const colBasisX = LEFT + 230;
    const colAmtW = 110;
    const colAmtX = RIGHT - INNER_PAD - colAmtW; // 551 - 14 - 110 = 427

    doc.fillColor(COLORS.onAccent).fontSize(7.5).font(fonts.bold);
    doc.text('DESCRIPTION / ASSESSMENT ITEM', colItemX, tableY + 7, { characterSpacing: 0.3 });
    doc.text('BASIS / CALCULATION', colBasisX, tableY + 7, { characterSpacing: 0.3 });
    doc.text('AMOUNT (NGN)', colAmtX, tableY + 7, { width: colAmtW, align: 'right', characterSpacing: 0.3 });

    doc.y = tableY + 22;

    const taxMonthLabel = new Date(data.taxReport.taxMonth).toLocaleDateString('en-NG', { month: 'long', year: 'numeric' });
    const rows = [
      { label: `Gross Sales Revenue (${taxMonthLabel})`, basis: 'Direct sales & invoices', amount: data.taxReport.totalSales },
      { label: `Allowable Business Expenses`, basis: 'Tax deductible operating costs', amount: data.taxReport.totalExpenses },
      { label: `Net Assessable Gross Profit`, basis: 'Sales minus Deductible Expenses', amount: data.taxReport.grossProfit },
      { label: `Statutory SME Tax Liability`, basis: `${data.taxReport.taxRate}% of Gross Profit`, amount: data.taxReport.taxPayable },
    ];

    rows.forEach((r, idx) => {
      const rowY = doc.y;
      const isAlt = idx % 2 === 1;
      if (isAlt) {
        doc.rect(LEFT, rowY, PAGE_WIDTH, 20).fill('#fafafa');
      }
      doc.fillColor(COLORS.body).fontSize(8).font(idx === 3 ? fonts.bold : fonts.regular);
      doc.text(r.label, colItemX, rowY + 5);
      doc.fillColor(COLORS.muted).font(fonts.regular);
      doc.text(r.basis, colBasisX, rowY + 5);
      doc.fillColor(idx === 3 ? COLORS.ink : COLORS.body).font(idx === 3 ? fonts.bold : fonts.regular);
      doc.text(formatMoney(r.amount), colAmtX, rowY + 5, { width: colAmtW, align: 'right' });
      doc.y = rowY + 20;
    });

    // ── Total Settled Band (Sharp 90°) ──
    const totalBandY = doc.y + 6;
    doc.rect(LEFT, totalBandY, PAGE_WIDTH, 32).fillAndStroke('#0f172a', '#0f172a');
    doc.fillColor('#ffffff').fontSize(9).font(fonts.bold).text('TOTAL TAX OBLIGATION SETTLED', colItemX, totalBandY + 10, { characterSpacing: 0.3 });
    doc.fontSize(10.5).font(fonts.bold);
    doc.text(formatMoney(data.amount), colAmtX, totalBandY + 9, { width: colAmtW, align: 'right' });

    doc.y = totalBandY + 44;

    // ── NRS Regulatory Notice & Verification Block (Sharp 90°) ──
    const startNoticeY = doc.y;
    const noticeText = 'This document serves as an immutable record of electronic tax settlement processed through WallXERP by WallX in accordance with the Nigerian SME Company Income Tax Regulations. All transactions are logged with cryptographic audit signatures and reported in designated NRS monthly clearing batches.';
    doc.fontSize(7.5).font(fonts.regular);
    const textHeight = doc.heightOfString(noticeText, { width: PAGE_WIDTH - 28, lineGap: 1.5 });
    const noticeHeight = Math.max(textHeight + 36, 68);

    doc.rect(LEFT, startNoticeY, PAGE_WIDTH, noticeHeight).fillAndStroke('#f8fafc', COLORS.hairline);
    doc.fillColor(COLORS.muted).fontSize(7.5).font(fonts.bold).text('LEGAL & COMPLIANCE NOTICE (FEDERAL INLAND REVENUE SERVICE)', colItemX, startNoticeY + 10, { characterSpacing: 0.3 });
    doc.fillColor(COLORS.body).fontSize(7.5).font(fonts.regular);
    doc.text(
      noticeText,
      colItemX,
      startNoticeY + 24,
      { width: PAGE_WIDTH - 28, lineGap: 1.5 }
    );

    // ── Universal Safe Footer Pass ──
    renderDocumentFooters(doc, {
      left: LEFT,
      right: RIGHT,
      platformText: 'WallXERP by WallX  •  Official Electronic Tax Settlement Receipt',
      complianceText: 'Statutory NRS Tax Remittance Record  •  support@paymytax.com',
      accentColor: COLORS.accent,
      fonts,
    });

    doc.end();
  });
}
