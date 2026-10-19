import PDFDocument from 'pdfkit';
import { Decimal } from '@prisma/client/runtime/library';
import { config } from '@/config';
import { fetchLogoForPdf } from '@/lib/pdf-utils';
import { toNumber } from '@/shared/helpers';
import {
  renderDocumentFooters,
  registerBrandFonts,
  DocumentFonts,
  LEFT,
  RIGHT,
  PAGE_WIDTH,
  INNER_PAD,
} from './receipt-common.pdf';

// ─── Design tokens ──────────────────────────────────────────
// Crisp architectural palette — slate/ink text, indigo accent,
// subtle hairline borders, generous spacing, sharp 90° geometry.

const COLORS = {
  ink: '#0f172a',
  body: '#334155',
  muted: '#64748b',
  faint: '#94a3b8',
  hairline: '#e2e8f0',
  panel: '#f8fafc',
  accent: '#4f46e5',
  headerBand: '#0f172a',
  onAccent: '#ffffff',
  success: '#16a34a',
  info: '#2563eb',
  danger: '#dc2626',
  neutral: '#6b7280',
  warn: '#b45309',
};

// ─── Helpers ────────────────────────────────────────────────

function formatMoney(amount: number, currency: string): string {
  const prefix = currency === 'NGN' ? 'NGN ' : `${currency} `;
  return `${prefix}${amount.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatQty(qty: number): string {
  return Number.isInteger(qty) ? qty.toString() : qty.toLocaleString('en-NG', { maximumFractionDigits: 2 });
}

function formatDate(d: Date): string {
  return d.toLocaleDateString('en-NG', { year: 'numeric', month: 'short', day: 'numeric' });
}

function statusLabel(status: string): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: 'Cash',
  bank_transfer: 'Bank Transfer',
  pos: 'POS',
  card: 'Card',
  mobile_money: 'Mobile Money',
  cheque: 'Cheque',
  online: 'Online',
  other: 'Other',
};

function paymentMethodLabel(method: string | null | undefined): string | null {
  if (!method) return null;
  return PAYMENT_METHOD_LABELS[method] ?? method;
}

function statusColor(status: string): string {
  switch (status) {
    case 'paid':
      return COLORS.success;
    case 'sent':
      return COLORS.info;
    case 'overdue':
      return COLORS.danger;
    case 'cancelled':
      return COLORS.neutral;
    case 'draft':
    default:
      return COLORS.warn;
  }
}

// ─── Types ──────────────────────────────────────────────────

export interface InvoiceForPdf {
  invoiceNumber: string;
  status: string;
  issueDate: Date;
  dueDate: Date;
  paidAt: Date | null;
  paymentMethod: string | null;
  customerName: string;
  customerEmail: string | null;
  customerPhone: string | null;
  customerAddress: string | null;
  customerTaxId: string | null;
  subtotal: Decimal | number;
  vatRate: Decimal | number;
  vatAmount: Decimal | number;
  discount: Decimal | number;
  total: Decimal | number;
  currency: string;
  notes: string | null;
  paymentTerms: string | null;
  lines: Array<{
    description: string;
    quantity: Decimal | number;
    unitPrice: Decimal | number;
    lineTotal: Decimal | number;
  }>;
}

export interface BusinessForPdf {
  businessName: string;
  merchantId: string;
  ownerName: string;
  taxId: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  logoUrl?: string | null;
}

// ─── Flow-layout primitives ────────────────────────────────

interface BlockItem {
  text: string;
  size: number;
  font: string;
  width: number;
  align?: 'left' | 'right';
  color?: string;
  gapAfter?: number;
  characterSpacing?: number;
}

function measureBlock(doc: PDFKit.PDFDocument, items: BlockItem[]): number {
  let h = 0;
  for (const it of items) {
    doc.fontSize(it.size).font(it.font);
    h += doc.heightOfString(it.text, { width: it.width, characterSpacing: it.characterSpacing }) + (it.gapAfter ?? 0);
  }
  return h;
}

function drawBlock(doc: PDFKit.PDFDocument, items: BlockItem[], x: number, startY: number): number {
  let y = startY;
  for (const it of items) {
    doc.fontSize(it.size).font(it.font).fillColor(it.color ?? COLORS.ink);
    doc.text(it.text, x, y, {
      width: it.width,
      align: it.align ?? 'left',
      characterSpacing: it.characterSpacing,
    });
    y += doc.heightOfString(it.text, { width: it.width, characterSpacing: it.characterSpacing }) + (it.gapAfter ?? 0);
  }
  return y;
}

function drawBlockDryRun(doc: PDFKit.PDFDocument, items: BlockItem[]): number {
  return measureBlock(doc, items);
}

// ─── Builder ────────────────────────────────────────────────

/**
 * Render an A4 invoice PDF as a Buffer.
 * Designed with generous vertical rhythm, sharp 90° edges, and Montserrat typography.
 */
export async function buildInvoicePdf(
  business: BusinessForPdf,
  invoice: InvoiceForPdf,
): Promise<Buffer> {
  const logoBuffer = business.logoUrl
    ? await fetchLogoForPdf(business.logoUrl)
    : null;

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 44, bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // Register modern font (Montserrat with fallback to Helvetica)
    const fonts: DocumentFonts = registerBrandFonts(doc);

    // ── Top accent bar ──
    doc.rect(0, 0, doc.page.width, 6).fillColor(COLORS.accent).fill();

    // ── Header: business (left) + INVOICE (right) ──
    const HEADER_TOP = 46;
    const LEFT_COL_WIDTH = 295;
    const RIGHT_COL_WIDTH = 185;
    const RIGHT_COL_X = RIGHT - RIGHT_COL_WIDTH;

    // Logo (if available)
    const LOGO_SIZE = 48;
    const LOGO_GAP = 10;
    let logoOffset = 0;

    if (logoBuffer) {
      try {
        doc.image(logoBuffer, LEFT, HEADER_TOP, {
          fit: [LOGO_SIZE, LOGO_SIZE],
        });
        logoOffset = LOGO_SIZE + LOGO_GAP;
      } catch {
        logoOffset = 0;
      }
    }

    const textStartY = HEADER_TOP + logoOffset;

    const bizLines: string[] = [];
    if (business.ownerName) bizLines.push(business.ownerName);
    const locParts = [business.address, business.city, business.state].filter(Boolean);
    if (locParts.length) bizLines.push(locParts.join(', '));
    if (business.taxId) bizLines.push(`TIN: ${business.taxId}`);
    bizLines.push(`Merchant ID: ${business.merchantId}`);

    const leftHeaderItems: BlockItem[] = [
      { text: business.businessName, size: 17, font: fonts.bold, width: LEFT_COL_WIDTH, color: COLORS.ink, gapAfter: 6 },
      ...bizLines.map((line): BlockItem => ({
        text: line,
        size: 8,
        font: fonts.regular,
        width: LEFT_COL_WIDTH,
        color: COLORS.body,
        gapAfter: 3,
      })),
    ];
    const leftHeaderBottom = textStartY + drawBlockDryRun(doc, leftHeaderItems);
    drawBlock(doc, leftHeaderItems, LEFT, textStartY);

    const rightHeaderItems: BlockItem[] = [
      { text: 'INVOICE', size: 22, font: fonts.bold, width: RIGHT_COL_WIDTH, align: 'right', color: COLORS.ink, gapAfter: 6, characterSpacing: 1 },
      { text: invoice.invoiceNumber, size: 9.5, font: fonts.medium, width: RIGHT_COL_WIDTH, align: 'right', color: COLORS.muted, gapAfter: 10 },
    ];
    const afterInvoiceNum = drawBlock(doc, rightHeaderItems, RIGHT_COL_X, HEADER_TOP);

    // Status pill — sharp 90° rectangular badge (no rounded corners)
    const statusText = statusLabel(invoice.status).toUpperCase();
    const pillColor = statusColor(invoice.status);
    doc.fontSize(7.5).font(fonts.bold);
    const pillWidth = doc.widthOfString(statusText, { characterSpacing: 0.5 }) + 20;
    const pillX = RIGHT - pillWidth;
    const pillY = afterInvoiceNum;
    doc.rect(pillX, pillY, pillWidth, 18).fillColor(pillColor).fill();
    doc
      .fillColor(COLORS.onAccent)
      .text(statusText, pillX, pillY + 5, { width: pillWidth, align: 'center', characterSpacing: 0.5 });
    const rightHeaderBottom = pillY + 18;

    // ── Divider — placed with generous breathing room ──
    const dividerY = Math.max(leftHeaderBottom, rightHeaderBottom) + 18;
    doc.strokeColor(COLORS.hairline).lineWidth(0.8).moveTo(LEFT, dividerY).lineTo(RIGHT, dividerY).stroke();

    // ── Bill To / Dates band — sharp 90° container with generous padding ──
    const bandTop = dividerY + 18;
    const padX = 16;
    const padY = 16;
    const custColWidth = 250;
    const dateColWidth = 90;
    const col2X = RIGHT - padX - dateColWidth; // 551 - 16 - 90 = 445
    const col1X = col2X - 20 - dateColWidth;   // 445 - 20 - 90 = 335

    const custLines: string[] = [];
    if (invoice.customerAddress) custLines.push(invoice.customerAddress);
    if (invoice.customerEmail) custLines.push(invoice.customerEmail);
    if (invoice.customerPhone) custLines.push(invoice.customerPhone);
    if (invoice.customerTaxId) custLines.push(`TIN: ${invoice.customerTaxId}`);

    const leftBandItems: BlockItem[] = [
      { text: 'BILL TO', size: 7.5, font: fonts.bold, width: custColWidth, color: COLORS.muted, gapAfter: 6, characterSpacing: 0.5 },
      { text: invoice.customerName, size: 10, font: fonts.bold, width: custColWidth, color: COLORS.ink, gapAfter: 6 },
      ...custLines.map((l): BlockItem => ({ text: l, size: 8, font: fonts.regular, width: custColWidth, color: COLORS.body, gapAfter: 3.5 })),
    ];
    const leftBandHeight = measureBlock(doc, leftBandItems);

    const dateRow = (label: string, value: string, color = COLORS.ink): BlockItem[] => [
      { text: label.toUpperCase(), size: 7.5, font: fonts.bold, width: dateColWidth, align: 'right', color: COLORS.muted, gapAfter: 3, characterSpacing: 0.5 },
      { text: value, size: 9, font: fonts.medium, width: dateColWidth, align: 'right', color, gapAfter: 12 },
    ];

    const col1Items: BlockItem[] = [...dateRow('Issue Date', formatDate(invoice.issueDate))];
    const col2Items: BlockItem[] = [...dateRow('Due Date', formatDate(invoice.dueDate))];
    if (invoice.paidAt) {
      col1Items.push(...dateRow('Paid On', formatDate(invoice.paidAt), COLORS.success));
      const methodLabel = paymentMethodLabel(invoice.paymentMethod);
      if (methodLabel) col2Items.push(...dateRow('Method', methodLabel));
    }
    const rightBandHeight = Math.max(measureBlock(doc, col1Items), measureBlock(doc, col2Items));

    const bandContentHeight = Math.max(leftBandHeight, rightBandHeight);
    const bandHeight = padY * 2 + bandContentHeight - (leftBandItems[leftBandItems.length - 1].gapAfter ?? 0);

    // Sharp rectangular card with subtle hairline border
    doc.rect(LEFT, bandTop, PAGE_WIDTH, bandHeight).fillColor(COLORS.panel).strokeColor(COLORS.hairline).lineWidth(0.5).fillAndStroke();
    drawBlock(doc, leftBandItems, LEFT + padX, bandTop + padY);
    drawBlock(doc, col1Items, col1X, bandTop + padY);
    drawBlock(doc, col2Items, col2X, bandTop + padY);

    // ── Line items table with sharp 90° edges and symmetrical 14pt padding ──
    const tableTop = bandTop + bandHeight + 24;
    const innerPadX = INNER_PAD; // 14 pt
    const tableInnerLeft = LEFT + innerPadX;   // 44 + 14 = 58
    const tableInnerRight = RIGHT - innerPadX; // 551 - 14 = 537

    const colDesc = tableInnerLeft; // 58
    const colQty = 310;
    const qtyW = 35;
    const colUnit = 355;
    const unitW = 75;
    const colTotal = 437;
    const totalW = tableInnerRight - colTotal; // 537 - 437 = 100 pt
    const descColWidth = colQty - colDesc - 15; // 310 - 58 - 15 = 237 pt
    const rowPadY = 8;

    const renderTableHeader = (headerY: number) => {
      // Sharp 90° architectural header bar (no rounded corners)
      doc.rect(LEFT, headerY, PAGE_WIDTH, 24).fillColor(COLORS.headerBand).fill();

      doc.fillColor(COLORS.onAccent).fontSize(7.5).font(fonts.bold);
      doc.text('DESCRIPTION', colDesc, headerY + 8, { width: descColWidth, characterSpacing: 0.5 });
      doc.text('QTY', colQty, headerY + 8, { width: qtyW, align: 'right', characterSpacing: 0.5 });
      doc.text('UNIT PRICE', colUnit, headerY + 8, { width: unitW, align: 'right', characterSpacing: 0.5 });
      doc.text('AMOUNT', colTotal, headerY + 8, { width: totalW, align: 'right', characterSpacing: 0.5 });
    };

    const addContinuationPage = () => {
      doc.addPage();
      // Top accent bar
      doc.rect(0, 0, doc.page.width, 5).fillColor(COLORS.accent).fill();

      // Running continuation header
      const runningBiz =
        business.businessName.length > 55
          ? business.businessName.substring(0, 52).trim() + '...'
          : business.businessName;
      doc.fontSize(7.5).font(fonts.bold).fillColor(COLORS.muted);
      doc.text(runningBiz.toUpperCase(), LEFT, 24, { width: PAGE_WIDTH - 180, lineBreak: false });
      doc.fontSize(7.5).font(fonts.regular).fillColor(COLORS.faint);
      doc.text(`INVOICE ${invoice.invoiceNumber}  ·  Continuation`, RIGHT - 175, 24, { width: 175, align: 'right', lineBreak: false });
      doc.moveTo(LEFT, 38).lineTo(RIGHT, 38).strokeColor(COLORS.hairline).lineWidth(0.5).stroke();

      renderTableHeader(46);
      return 46 + 26;
    };

    renderTableHeader(tableTop);
    let y = tableTop + 26;

    invoice.lines.forEach((line, idx) => {
      const qty = toNumber(line.quantity);
      const unit = toNumber(line.unitPrice);
      const total = toNumber(line.lineTotal);

      doc.fontSize(8).font(fonts.regular);
      const descHeight = doc.heightOfString(line.description, { width: descColWidth });
      const rowHeight = Math.max(24, descHeight + rowPadY * 2);

      if (y + rowHeight > 710) {
        y = addContinuationPage();
      }

      // Sharp rectangular row highlight (no rounded corners)
      if (idx % 2 === 0) {
        doc.rect(LEFT, y, PAGE_WIDTH, rowHeight).fillColor(COLORS.panel).fill();
      }

      const textY = y + rowPadY;
      doc.fillColor(COLORS.ink).font(fonts.regular).fontSize(8);
      doc.text(line.description, colDesc, textY, { width: descColWidth });
      doc.text(formatQty(qty), colQty, textY, { width: qtyW, align: 'right' });
      doc.text(formatMoney(unit, invoice.currency), colUnit, textY, { width: unitW, align: 'right' });
      doc.fillColor(COLORS.ink).font(fonts.bold);
      doc.text(formatMoney(total, invoice.currency), colTotal, textY, { width: totalW, align: 'right' });

      y += rowHeight;
    });

    doc.strokeColor(COLORS.hairline).lineWidth(0.8).moveTo(LEFT, y).lineTo(RIGHT, y).stroke();

    // ── Guard against orphan totals block ──
    if (y + 125 > 710) {
      y = addContinuationPage();
    }

    // ── Totals block with aligned right edge and generous spacing ──
    y += 18;
    const totalsValueX = colTotal; // 437
    const totalsWidth = totalW;    // 100 pt (ends at 537 pt = RIGHT - 14)
    const totalsLabelX = 270;
    const totalsLabelWidth = colTotal - totalsLabelX - 14; // 153 pt

    const subtotal = toNumber(invoice.subtotal);
    const discount = toNumber(invoice.discount);
    const vatRate = toNumber(invoice.vatRate);
    const vatAmount = toNumber(invoice.vatAmount);
    const total = toNumber(invoice.total);

    doc.fontSize(8.5).font(fonts.regular).fillColor(COLORS.body);
    doc.text('Subtotal', totalsLabelX, y, { width: totalsLabelWidth, align: 'right' });
    doc.text(formatMoney(subtotal, invoice.currency), totalsValueX, y, { width: totalsWidth, align: 'right' });
    y += 18;

    if (discount > 0) {
      doc.fillColor(COLORS.body);
      doc.text('Discount', totalsLabelX, y, { width: totalsLabelWidth, align: 'right' });
      doc.text(`-${formatMoney(discount, invoice.currency)}`, totalsValueX, y, { width: totalsWidth, align: 'right' });
      y += 18;
    }

    doc.fillColor(COLORS.body);
    doc.text(`VAT (${vatRate}%)`, totalsLabelX, y, { width: totalsLabelWidth, align: 'right' });
    doc.text(formatMoney(vatAmount, invoice.currency), totalsValueX, y, { width: totalsWidth, align: 'right' });
    y += 16;

    const totalPanelY = y;
    const totalPanelHeight = 36;
    const totalPanelLeft = totalsLabelX - 18; // 252
    const totalPanelWidth = RIGHT - totalPanelLeft; // 551 - 252 = 299 pt

    // Sharp 90° black total box (no rounded corners)
    doc
      .rect(totalPanelLeft, totalPanelY, totalPanelWidth, totalPanelHeight)
      .fillColor(COLORS.ink)
      .fill();

    doc.fontSize(9.5).font(fonts.bold).fillColor(COLORS.onAccent);
    doc.text('TOTAL', totalPanelLeft + innerPadX, totalPanelY + 12, { width: 100, align: 'left', characterSpacing: 0.5 });
    doc.text(formatMoney(total, invoice.currency), totalsValueX, totalPanelY + 12, { width: totalsWidth, align: 'right' });
    y = totalPanelY + totalPanelHeight + 28;

    // ── Notes & payment terms ──
    if (invoice.notes || invoice.paymentTerms) {
      if (y > 680) {
        doc.addPage();
        doc.rect(0, 0, doc.page.width, 5).fillColor(COLORS.accent).fill();
        y = 45;
      }

      doc.strokeColor(COLORS.hairline).lineWidth(0.8).moveTo(LEFT, y).lineTo(RIGHT, y).stroke();
      y += 16;

      if (invoice.paymentTerms) {
        doc.fontSize(7.5).font(fonts.bold).fillColor(COLORS.muted);
        doc.text('PAYMENT TERMS', LEFT, y, { characterSpacing: 0.5 });
        y += 12;
        doc.fontSize(8).font(fonts.regular).fillColor(COLORS.body);
        doc.text(invoice.paymentTerms, LEFT, y, { width: PAGE_WIDTH, lineGap: 2 });
        y = doc.y + 14;
      }

      if (invoice.notes) {
        doc.fontSize(7.5).font(fonts.bold).fillColor(COLORS.muted);
        doc.text('NOTES', LEFT, y, { characterSpacing: 0.5 });
        y += 12;
        doc.fontSize(8).font(fonts.regular).fillColor(COLORS.body);
        doc.text(invoice.notes, LEFT, y, { width: PAGE_WIDTH, lineGap: 2 });
      }
    }

    // ── Universal Safe Footer Pass on all pages ──
    renderDocumentFooters(doc, {
      left: LEFT,
      right: RIGHT,
      platformText: `WallXERP by WallX  •  Tax Authority: ${config.tax.taxAuthority}  •  VAT shown separately per NRS standard`,
      disclaimerText: 'This is an official computer-generated commercial invoice. Valid without physical signature.',
      accentColor: COLORS.accent,
      fonts,
    });

    doc.end();
  });
}

