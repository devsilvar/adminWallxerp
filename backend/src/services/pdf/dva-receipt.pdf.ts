import PDFDocument from 'pdfkit';
import { fetchLogoForPdf } from '@/lib/pdf-utils';
import {
  COLORS,
  LEFT,
  RIGHT,
  PAGE_WIDTH,
  INNER_PAD,
  formatMoney,
  formatDateTime,
  renderDocumentFooters,
  registerBrandFonts,
  DocumentFonts,
} from './receipt-common.pdf';

// ─── DVA Inflow Receipt Data Model ──────────────────────────
export interface DvaTransferReceiptData {
  receiptNumber: string;
  transactionReference: string;
  transactionDate: Date;
  amount: number;
  customerName?: string | null;
  customerHint?: string | null;
  senderBank?: string | null;
  virtualAccountNumber: string;
  virtualAccountBank: string;
  needsVerification?: boolean;
  saleId?: string;
  businessId?: string;
  business: {
    businessName: string;
    ownerName: string;
    merchantId: string;
    taxId?: string | null;
    address?: string | null;
    logoUrl?: string | null;
  };
}

/**
 * Builds a customer-facing PDF receipt for DVA inbound bank transfers (Credit Advice).
 * Rendered with sharp 90° architectural geometry, Montserrat typography, and symmetrical padding.
 */
export async function buildDvaTransferReceiptPdf(data: DvaTransferReceiptData): Promise<Buffer> {
  const logoBuffer = data.business.logoUrl ? await fetchLogoForPdf(data.business.logoUrl) : null;

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: LEFT,
      bufferPages: true,
      info: { Title: `Credit Advice ${data.receiptNumber}`, Author: data.business.businessName },
    });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // Register brand fonts (Montserrat with Helvetica fallback)
    const fonts: DocumentFonts = registerBrandFonts(doc);

    // ── Top Emerald Accent Bar (Sharp 90°) ──
    doc.rect(0, 0, doc.page.width, 6).fillColor(COLORS.accent).fill();

    // ── Header Section ──
    const HEADER_TOP = 44;
    const LEFT_COL_WIDTH = 290;
    const RIGHT_COL_WIDTH = 195;
    const RIGHT_COL_X = RIGHT - RIGHT_COL_WIDTH;

    // Logo (if available)
    const LOGO_SIZE = 44;
    let textStartX = LEFT;
    if (logoBuffer) {
      try {
        doc.image(logoBuffer, LEFT, HEADER_TOP, { fit: [LOGO_SIZE, LOGO_SIZE] });
        textStartX = LEFT + LOGO_SIZE + 10;
      } catch {
        textStartX = LEFT;
      }
    }

    const leftColWidthAdjusted = LEFT_COL_WIDTH - (textStartX - LEFT);

    // Left Column: Business Details
    let leftY = HEADER_TOP;
    doc.fillColor(COLORS.ink).fontSize(14).font(fonts.bold);
    doc.text(data.business.businessName, textStartX, leftY, { width: leftColWidthAdjusted });
    leftY += doc.heightOfString(data.business.businessName, { width: leftColWidthAdjusted }) + 4;

    doc.fillColor(COLORS.muted).fontSize(8.5).font(fonts.regular);
    doc.text(`Merchant ID: ${data.business.merchantId}`, textStartX, leftY, { width: leftColWidthAdjusted });
    leftY += 13;

    if (data.business.taxId) {
      doc.text(`Tax ID (TIN): ${data.business.taxId}`, textStartX, leftY, { width: leftColWidthAdjusted });
      leftY += 13;
    }
    if (data.business.address) {
      doc.text(data.business.address, textStartX, leftY, { width: leftColWidthAdjusted });
      leftY += doc.heightOfString(data.business.address, { width: leftColWidthAdjusted }) + 3;
    }

    // Right Column: Title, Receipt #, Date, Status
    let rightY = HEADER_TOP;
    doc.fillColor(COLORS.ink).fontSize(13).font(fonts.bold)
      .text('BANK TRANSFER RECEIPT', RIGHT_COL_X, rightY, { width: RIGHT_COL_WIDTH, align: 'right', characterSpacing: 0.3 });
    rightY += 18;

    doc.fillColor(COLORS.muted).fontSize(8.5).font(fonts.medium)
      .text(`Receipt #: ${data.receiptNumber}`, RIGHT_COL_X, rightY, { width: RIGHT_COL_WIDTH, align: 'right' });
    rightY += 13;

    doc.fillColor(COLORS.muted).fontSize(8).font(fonts.regular)
      .text(`Date: ${formatDateTime(data.transactionDate)}`, RIGHT_COL_X, rightY, { width: RIGHT_COL_WIDTH, align: 'right' });
    rightY += 16;

    // Status Pill on Right — Sharp 90° Rectangle (no rounded corners)
    const pillText = data.needsVerification ? 'UNVERIFIED INFLOW' : 'SUCCESSFUL';
    const pillBg = data.needsVerification ? '#b45309' : '#16a34a';
    doc.fontSize(8).font(fonts.bold);
    const pillW = doc.widthOfString(pillText, { characterSpacing: 0.5 }) + 18;
    const pillX = RIGHT - pillW;
    doc.rect(pillX, rightY, pillW, 18).fillColor(pillBg).fill();
    doc.fillColor('#ffffff').text(pillText, pillX, rightY + 4.5, { width: pillW, align: 'center', characterSpacing: 0.5 });
    rightY += 24;

    // ── Divider ──
    const dividerY = Math.max(leftY, rightY) + 14;
    doc.strokeColor(COLORS.hairline).lineWidth(0.8).moveTo(LEFT, dividerY).lineTo(RIGHT, dividerY).stroke();

    // ── Amount Hero Card — Sharp 90° Architectural Container ──
    const amountCardY = dividerY + 16;
    doc.rect(LEFT, amountCardY, PAGE_WIDTH, 70).fillAndStroke('#f0fdf4', '#bbf7d0');
    doc.fillColor('#166534').fontSize(8.5).font(fonts.bold)
      .text('TOTAL AMOUNT CREDITED', LEFT, amountCardY + 12, { width: PAGE_WIDTH, align: 'center', characterSpacing: 0.5 });
    doc.fillColor(COLORS.ink).fontSize(22).font(fonts.bold)
      .text(formatMoney(data.amount), LEFT, amountCardY + 26, { width: PAGE_WIDTH, align: 'center' });
    doc.fillColor('#15803d').fontSize(8).font(fonts.regular)
      .text('Settled via Nigerian Inter-Bank Settlement System (NIBSS) • Instant Wallet Credit', LEFT, amountCardY + 53, { width: PAGE_WIDTH, align: 'center' });

    // ── Transfer Details Section ──
    const detailsStartY = amountCardY + 86;
    doc.fillColor(COLORS.ink).fontSize(10.5).font(fonts.bold).text('Transfer & Settlement Details', LEFT, detailsStartY);

    let tableY = detailsStartY + 18;
    const labelColX = LEFT + INNER_PAD; // 44 + 14 = 58
    const labelColW = 160;
    const valColX = labelColX + labelColW + 10;
    const valColW = RIGHT - INNER_PAD - valColX; // Ends at RIGHT - 14 = 537 pt

    const details: Array<{ label: string; value: string }> = [
      { label: 'Beneficiary Business', value: data.business.businessName },
      { label: 'Destination Account', value: `${data.virtualAccountBank} — ${data.virtualAccountNumber}` },
      { label: 'Payer / Counterparty', value: data.customerName || data.customerHint || 'Direct Bank Customer' },
      { label: 'Transaction Reference', value: data.transactionReference },
      { label: 'Payment Channel', value: 'Dedicated NUBAN Virtual Account Transfer (NIP)' },
      { label: 'Value Date & Time', value: formatDateTime(data.transactionDate) },
      { label: 'Settlement Status', value: 'Confirmed & Credited to Business Wallet' },
      ...(data.needsVerification
        ? [{ label: 'Tax Classification', value: 'Unverified Inflow — Review Required in App' }]
        : []),
      { label: 'NRS Regulatory Record', value: 'Captured for SME Tax Assessment' },
    ];

    details.forEach((item, idx) => {
      doc.fontSize(8.5).font(fonts.regular);
      const valHeight = doc.heightOfString(item.value, { width: valColW });
      const rowHeight = Math.max(22, valHeight + 8);

      if (idx % 2 === 1) {
        doc.rect(LEFT, tableY, PAGE_WIDTH, rowHeight).fill('#f8fafc');
      }

      doc.fillColor(COLORS.muted).fontSize(8).font(fonts.regular);
      doc.text(item.label, labelColX, tableY + 5);

      doc.fillColor(COLORS.ink).font(fonts.bold);
      doc.text(item.value, valColX, tableY + 5, { width: valColW, align: 'left' });

      tableY += rowHeight;
    });

    // ── Action Banner for Unverified Inflows (Direct Clickable Link) ──
    if (data.needsVerification) {
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
      const unverifiedUrl = `${frontendUrl}/sales?tab=unverified${data.saleId ? `&txnId=${data.saleId}` : ''}`;

      const unverifiedBoxY = tableY + 12;
      const unverifiedBoxHeight = 52;
      doc.rect(LEFT, unverifiedBoxY, PAGE_WIDTH, unverifiedBoxHeight).fillAndStroke('#fffbeb', '#fcd34d');

      doc.fillColor('#92400e').fontSize(8).font(fonts.bold)
        .text('TAX COMPLIANCE: UNVERIFIED BANK INFLOW', labelColX, unverifiedBoxY + 8, { characterSpacing: 0.3 });

      doc.fillColor('#78350f').fontSize(7.5).font(fonts.regular)
        .text(
          'This transfer was auto-captured and requires review. Click below to verify or reclassify this inflow in PayMyTax:',
          labelColX,
          unverifiedBoxY + 20,
          { width: PAGE_WIDTH - 28, lineGap: 1.2 }
        );

      doc.fillColor('#2563eb').fontSize(7.5).font(fonts.bold)
        .text(`Review Unverified Inflow → ${unverifiedUrl}`, labelColX, unverifiedBoxY + 34, {
          link: unverifiedUrl,
          underline: true,
          width: PAGE_WIDTH - 28,
        });

      tableY += unverifiedBoxHeight + 8;
    }

    // ── Notice Block with dynamic height — Sharp 90° ──
    const noticeY = tableY + 16;
    const noticeText = 'This electronic credit advice certifies that funds were received through the Nigerian Inter-Bank Settlement System (NIBSS) into the merchant\'s dedicated virtual account. All records are cryptographically logged for SME accounting and NRS compliance.';
    doc.fontSize(7.5).font(fonts.regular);
    const textHeight = doc.heightOfString(noticeText, { width: PAGE_WIDTH - 28, lineGap: 1.5 });
    const noticeHeight = Math.max(textHeight + 28, 56);

    doc.rect(LEFT, noticeY, PAGE_WIDTH, noticeHeight).fillAndStroke('#f8fafc', COLORS.hairline);
    doc.fillColor(COLORS.muted).fontSize(7.5).font(fonts.bold)
      .text('LEGAL & COMPLIANCE CONFIRMATION', labelColX, noticeY + 8, { characterSpacing: 0.3 });
    doc.fillColor(COLORS.body).fontSize(7.5).font(fonts.regular);
    doc.text(
      noticeText,
      labelColX,
      noticeY + 22,
      { width: PAGE_WIDTH - 28, lineGap: 1.5 }
    );

    // ── Universal Safe Footer Pass ──
    renderDocumentFooters(doc, {
      left: LEFT,
      right: RIGHT,
      platformText: 'WallXERP by WallX  •  Official Electronic Credit Advice',
      complianceText: 'Captured for SME Tax Compliance  •  https://paymytax.com',
      accentColor: COLORS.accent,
      fonts,
    });

    doc.end();
  });
}
