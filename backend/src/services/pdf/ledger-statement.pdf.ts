import PDFDocument from 'pdfkit';
import { UnifiedLedgerRow, UnifiedLedgerResponse } from '@/services/ledger.service';
import { fetchLogoForPdf } from '@/lib/pdf-utils';
import {
  LEFT,
  RIGHT,
  PAGE_WIDTH,
  INNER_PAD,
  COLORS,
  formatMoney,
  formatDate,
  renderDocumentFooters,
  registerBrandFonts,
  DocumentFonts,
} from './receipt-common.pdf';

export interface StatementPdfOptions {
  business: {
    businessName: string;
    merchantId: string;
    ownerName: string;
    taxId: string | null;
    address?: string | null;
    logoUrl?: string | null;
    virtualAccountNumber?: string | null;
    virtualAccountBank?: string | null;
  };
  scope: 'dva_bank' | 'all_income';
  periodLabel: string;
  summary: UnifiedLedgerResponse['summary'];
  rows: UnifiedLedgerRow[];
  statementRef: string;
}

/**
 * Builds an official A4 multi-page financial ledger statement.
 * Rendered with sharp 90° architectural geometry, Montserrat typography, and balanced 14pt padding.
 */
export async function buildLedgerStatementPdf(options: StatementPdfOptions): Promise<Buffer> {
  const { business, scope, periodLabel, summary, rows, statementRef } = options;

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
        // Fallback gracefully
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
      .fillColor(COLORS.primary)
      .text(
        scope === 'dva_bank'
          ? 'OFFICIAL DVA BANK ACCOUNT STATEMENT'
          : 'COMPREHENSIVE BUSINESS SALES STATEMENT',
        headerTextX,
        56,
        { characterSpacing: 0.3 }
      );

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
        { align: 'right', width: PAGE_WIDTH }
      );

    // Divider
    doc.moveTo(LEFT, 82).lineTo(RIGHT, 82).strokeColor(COLORS.hairline).lineWidth(0.8).stroke();

    // ── 2. Business & Account Metadata Block ───────────────────
    const metaY = 92;
    const colWidth = (PAGE_WIDTH - 20) / 2;

    // Left Column: Business Info
    doc.fontSize(7.5).font(fonts.bold).fillColor(COLORS.subheading).text('ACCOUNT HOLDER DETAILS', LEFT, metaY, { characterSpacing: 0.3 });
    doc.fontSize(10).font(fonts.bold).fillColor(COLORS.ink).text(business.businessName, LEFT, metaY + 12, { width: colWidth, lineBreak: false, ellipsis: true });
    doc.fontSize(8).font(fonts.regular).fillColor(COLORS.body);
    doc.text(`Owner: ${business.ownerName}`, LEFT, metaY + 26, { width: colWidth, lineBreak: false, ellipsis: true });
    if (business.taxId) doc.text(`Tax ID / TIN: ${business.taxId}`, LEFT, metaY + 37, { width: colWidth, lineBreak: false, ellipsis: true });
    if (business.address) doc.text(`Address: ${business.address}`, LEFT, metaY + 48, { width: colWidth, height: 10, ellipsis: true });

    // Right Column: Virtual Bank & Statement Info
    const rightColX = LEFT + colWidth + 20;
    doc.fontSize(7.5).font(fonts.bold).fillColor(COLORS.subheading).text('ACCOUNT & STATEMENT INFO', rightColX, metaY, { characterSpacing: 0.3 });
    doc.fontSize(8).font(fonts.regular).fillColor(COLORS.body);
    let rightOffset = 12;
    if (business.virtualAccountNumber) {
      doc.text(`Virtual NUBAN: ${business.virtualAccountNumber}`, rightColX, metaY + rightOffset, { width: colWidth, lineBreak: false, ellipsis: true });
      rightOffset += 11;
      doc.text(`Bank Name: ${business.virtualAccountBank || 'Wema Bank PLC'}`, rightColX, metaY + rightOffset, { width: colWidth, lineBreak: false, ellipsis: true });
      rightOffset += 11;
    }
    doc.text(`Merchant ID: ${business.merchantId}`, rightColX, metaY + rightOffset, { width: colWidth, lineBreak: false, ellipsis: true });
    rightOffset += 11;
    doc.text(`Statement Period: ${periodLabel}`, rightColX, metaY + rightOffset, { width: colWidth, lineBreak: false, ellipsis: true });
    rightOffset += 11;
    doc.text(`Currency: Nigerian Naira (NGN)`, rightColX, metaY + rightOffset, { width: colWidth, lineBreak: false, ellipsis: true });

    // ── 3. KPI Financial Summary Strip (Sharp 90° Cards) ───────
    const cardY = 165;
    const gap = 8;
    const cardW = (PAGE_WIDTH - gap * 3) / 4; // ~120.75 pt
    const cardH = 46;

    const cards = [
      { label: 'OPENING BALANCE', value: formatMoney(summary.openingBalance), bg: '#F8FAFC', border: '#E2E8F0', text: '#334155' },
      { label: 'TOTAL INFLOWS (+)', value: `+${formatMoney(summary.totalCredits)}`, bg: '#ECFDF5', border: '#A7F3D0', text: '#059669' },
      { label: 'TOTAL OUTFLOWS (-)', value: `-${formatMoney(summary.totalDebits)}`, bg: '#FEF2F2', border: '#FECACA', text: '#DC2626' },
      { label: 'CLOSING BALANCE', value: formatMoney(summary.closingBalance), bg: '#0F172A', border: '#0F172A', text: '#34D399', isDark: true },
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
        .text(c.value, cx + 8, cardY + 22, { width: cardW - 16 });
    });

    // ── 4. Transactions Table (Sharp 90° & 14pt Padding) ───────
    let tableY = 224;

    // Symmetrical 14pt padding:
    // Left boundary: LEFT + INNER_PAD = 44 + 14 = 58 pt
    // Right boundary: RIGHT - INNER_PAD = 551 - 14 = 537 pt (colX.balance + width 57 = 537)
    const colX = {
      date: LEFT + INNER_PAD, // 58
      desc: 104,
      ref: 228,
      type: 288,
      inflow: 350,  // width 60, ends at 410
      outflow: 412, // width 60, ends at 472
      balance: 474, // width 63, ends at 537 (= RIGHT - 14)
    };

    function renderTableHeader(y: number) {
      doc.rect(LEFT, y, PAGE_WIDTH, 18).fill('#F1F5F9');
      doc.fontSize(6).font(fonts.bold).fillColor(COLORS.subheading);
      doc.text('DATE', colX.date, y + 6);
      doc.text('DESCRIPTION / COUNTERPARTY', colX.desc, y + 6);
      doc.text('REFERENCE', colX.ref, y + 6);
      doc.text('CHANNEL', colX.type, y + 6);
      doc.text('INFLOW (NGN)', colX.inflow, y + 6, { width: 60, align: 'right' });
      doc.text('OUTFLOW (NGN)', colX.outflow, y + 6, { width: 60, align: 'right' });
      doc.text('BALANCE (NGN)', colX.balance, y + 6, { width: 63, align: 'right' });
    }

    renderTableHeader(tableY);
    tableY += 20;

    if (rows.length === 0) {
      doc
        .fontSize(8.5)
        .font(fonts.regular)
        .fillColor(COLORS.muted)
        .text('No recorded transactions found in the selected period.', LEFT, tableY + 20, {
          align: 'center',
          width: PAGE_WIDTH,
        });
    } else {
      rows.forEach((r, index) => {
        // Page overflow check with room for row and safe footer margin
        if (tableY > 730) {
          doc.addPage();
          tableY = 44;
          renderTableHeader(tableY);
          tableY += 20;
        }

        const isEven = index % 2 === 0;
        if (isEven) {
          doc.rect(LEFT, tableY - 2, PAGE_WIDTH, 20).fill('#FAFAFA');
        }

        doc.fontSize(7).font(fonts.regular).fillColor(COLORS.subheading);
        doc.text(formatDate(r.date), colX.date, tableY + 2, { width: 44, height: 10, ellipsis: true });

        // Description + Counterparty combined cleanly
        const narration =
          r.counterparty && r.counterparty !== 'Customer'
            ? `${r.description} (${r.counterparty})`
            : r.description;
        doc.text(narration, colX.desc, tableY + 2, { width: 120, height: 10, ellipsis: true });

        doc.fontSize(6).font(fonts.regular).fillColor(COLORS.muted).text(r.reference, colX.ref, tableY + 2, { width: 56, height: 10, ellipsis: true });

        doc.fontSize(6).font(fonts.bold).fillColor(COLORS.body).text(r.sourceType.toUpperCase().replace('_', ' '), colX.type, tableY + 2, { width: 58, height: 10, ellipsis: true });

        if (r.entryType === 'credit') {
          doc.fontSize(6.5).font(fonts.bold).fillColor(COLORS.success).text(`+${r.amount.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, colX.inflow, tableY + 2, { width: 60, align: 'right' });
          doc.fontSize(6.5).font(fonts.regular).fillColor(COLORS.faint).text('-', colX.outflow, tableY + 2, { width: 60, align: 'right' });
        } else {
          doc.fontSize(6.5).font(fonts.regular).fillColor(COLORS.faint).text('-', colX.inflow, tableY + 2, { width: 60, align: 'right' });
          doc.fontSize(6.5).font(fonts.bold).fillColor(COLORS.danger).text(`-${r.amount.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, colX.outflow, tableY + 2, { width: 60, align: 'right' });
        }

        doc.fontSize(6.5).font(fonts.bold).fillColor(COLORS.ink).text(r.runningBalance.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), colX.balance, tableY + 2, { width: 63, align: 'right' });

        tableY += 20;
      });
    }

    // ── 5. Official Certification Footer on All Pages ──────────
    renderDocumentFooters(doc, {
      left: LEFT,
      right: RIGHT,
      platformText: 'CERTIFIED SME FINANCIAL STATEMENT · WALLX ERP COMPLIANCE PLATFORM',
      complianceText: 'Compliant with Nigerian NRS regulations · Valid electronic document',
      accentColor: COLORS.primary,
      fonts,
    });

    doc.end();
  });
}
