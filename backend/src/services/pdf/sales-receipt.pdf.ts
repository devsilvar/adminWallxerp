import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { fetchLogoForPdf } from '@/lib/pdf-utils';

// ─── Universal Itemized Sales Receipt Data Model ────────────
export interface SalesReceiptItem {
  name: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export interface SalesReceiptData {
  receiptNumber: string;
  transactionReference?: string | null;
  transactionDate: Date;
  amount: number;
  source: 'bank_transfer' | 'paycode' | 'pos' | 'online_store' | 'manual' | 'cash' | 'invoice' | 'store_voucher' | 'credit';
  sourceLabel: string;
  customerName?: string | null;
  customerPhone?: string | null;
  customerEmail?: string | null;
  customerAddress?: string | null;
  description?: string | null;
  invoiceNumber?: string | null;
  voucherCredit?: {
    amount: number;
    newBalance: number;
    cardCode?: string | null;
  } | null;
  voucherRedemption?: {
    amount: number;
    remainingBalance: number;
    cardCode?: string | null;
  } | null;
  items: SalesReceiptItem[];
  subtotal: number;
  discount?: number;
  vatRate?: number;
  vatAmount?: number;
  needsVerification?: boolean;
  saleId?: string;
  businessId?: string;
  business: {
    businessName: string;
    ownerName: string;
    merchantId: string;
    taxId?: string | null;
    address?: string | null;
    phone?: string | null; // NEW (optional): printed as "Phone: ..." under the address
    logoUrl?: string | null;
  };
}

// ─── Thermal-receipt layout constants (80mm roll) ───────────
const MM_TO_PT = 72 / 25.4;
const PAGE_W = Math.round(80 * MM_TO_PT * 100) / 100; // ≈ 226.77pt
const M = 12; // side margin
const CW = PAGE_W - M * 2; // content width
const X0 = M + 3; // table text left edge
const X1 = PAGE_W - M - 3; // table text right edge
const INK = '#000000';
const MUTED = '#444444';
const BAND = '#eeeeee';

// Table columns: Item (left) | Qty | Price | Total (all right-aligned)
const C_ITEM_X = X0;
const C_ITEM_W = 56;
const C_QTY_X = X0 + 59;
const C_QTY_W = 16;
const C_PRICE_X = X0 + 78;
const C_PRICE_W = 52;
const C_TOTAL_X = X0 + 133;
const C_TOTAL_W = X1 - C_TOTAL_X;

interface ReceiptFonts {
  regular: string;
  bold: string;
  hasNaira: boolean; // true when the font has a real ₦ glyph
}

/**
 * Optional: drop CourierPrime-Regular.ttf + CourierPrime-Bold.ttf (free on Google Fonts)
 * into /public/fonts for a real ₦ glyph. Without them we use built-in Courier and
 * draw the ₦ sign ourselves (an "N" with two strokes), so it always looks right.
 */
function registerReceiptFonts(doc: PDFKit.PDFDocument): ReceiptFonts {
  const dir = path.join(process.cwd(), 'public', 'fonts');
  const reg = path.join(dir, 'CourierPrime-Regular.ttf');
  const bold = path.join(dir, 'CourierPrime-Bold.ttf');
  try {
    if (fs.existsSync(reg) && fs.existsSync(bold)) {
      doc.registerFont('Receipt', reg);
      doc.registerFont('Receipt-Bold', bold);
      return { regular: 'Receipt', bold: 'Receipt-Bold', hasNaira: true };
    }
  } catch {
    /* fall through to built-in */
  }
  return { regular: 'Courier', bold: 'Courier-Bold', hasNaira: false };
}

function fmtNumber(n: number): string {
  const v = Number(n || 0);
  return v.toLocaleString('en-NG', {
    minimumFractionDigits: Number.isInteger(v) ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

function qty(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Number(n.toFixed(3)));
}

function receiptDate(d: Date): string {
  return new Date(d).toLocaleString('en-US', {
    timeZone: 'Africa/Lagos',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });
}

/**
 * Draws the whole receipt and returns the final Y position.
 * Called twice: once to measure, once to render on a page cut to the exact height.
 */
function drawReceipt(
  doc: PDFKit.PDFDocument,
  data: SalesReceiptData,
  fonts: ReceiptFonts,
  logoBuffer: Buffer | null
): number {
  let y = 18;

  const centered = (text: string, size: number, bold = false, color = INK, gap = 4) => {
    doc.font(bold ? fonts.bold : fonts.regular).fontSize(size).fillColor(color);
    doc.text(text, M, y, { width: CW, align: 'center' });
    y += doc.heightOfString(text, { width: CW, align: 'center' }) + gap;
  };

  const left = (text: string, size: number, bold = false, color = INK, gap = 4) => {
    doc.font(bold ? fonts.bold : fonts.regular).fontSize(size).fillColor(color);
    doc.text(text, M, y, { width: CW, align: 'left' });
    y += doc.heightOfString(text, { width: CW }) + gap;
  };

  const dashedRule = () => {
    doc.save().lineWidth(1.4).strokeColor(INK).dash(3.5, { space: 2.5 })
      .moveTo(M, y).lineTo(PAGE_W - M, y).stroke().undash().restore();
    y += 12;
  };

  const solidRule = (weight: number) => {
    doc.save().lineWidth(weight).strokeColor(INK).moveTo(M, y).lineTo(PAGE_W - M, y).stroke().restore();
  };

  const dottedRule = () => {
    doc.save().lineWidth(0.6).strokeColor('#666666').dash(0.6, { space: 1.3 })
      .moveTo(M, y).lineTo(PAGE_W - M, y).stroke().undash().restore();
  };

  /** Right-aligned money amount ending at `rightX`, with a real or hand-drawn ₦. */
  const putMoney = (
    value: number,
    rightX: number,
    top: number,
    size: number,
    bold = false,
    color = INK,
    prefix = ''
  ) => {
    doc.font(bold ? fonts.bold : fonts.regular).fontSize(size).fillColor(color);
    const digits = fmtNumber(value);

    if (fonts.hasNaira) {
      const t = `${prefix}₦${digits}`;
      doc.text(t, rightX - doc.widthOfString(t), top, { lineBreak: false });
      return;
    }

    const dw = doc.widthOfString(digits);
    const nw = doc.widthOfString('N');
    const nx = rightX - dw - nw;
    doc.text(digits, rightX - dw, top, { lineBreak: false });
    doc.text('N', nx, top, { lineBreak: false });
    if (prefix) doc.text(prefix, nx - doc.widthOfString(prefix), top, { lineBreak: false });

    // the two horizontal strokes that make it ₦
    doc.save().lineWidth(size * (bold ? 0.075 : 0.06)).strokeColor(color)
      .moveTo(nx - size * 0.04, top + size * 0.43).lineTo(nx + nw + size * 0.04, top + size * 0.43)
      .moveTo(nx - size * 0.04, top + size * 0.60).lineTo(nx + nw + size * 0.04, top + size * 0.60)
      .stroke().restore();
  };

  /** Label on the left, money on the right (Subtotal / Total style rows). */
  const pairMoney = (label: string, value: number, size = 8, bold = false, prefix = '') => {
    doc.font(bold ? fonts.bold : fonts.regular).fontSize(size).fillColor(INK);
    doc.text(label, X0, y, { width: 120, lineBreak: false });
    putMoney(value, X1, y, size, bold, INK, prefix);
    y += size + 9;
  };

  // ── Header: logo, business name, address, phone ──
  if (logoBuffer) {
    try {
      const LOGO = 40;
      doc.image(logoBuffer, (PAGE_W - LOGO) / 2, y, { fit: [LOGO, LOGO], align: 'center' });
      y += LOGO + 8;
    } catch {
      /* ignore broken logo */
    }
  }

  centered(data.business.businessName, 13, true, INK, 7);
  if (data.business.address) centered(data.business.address, 8, false, INK, 6);
  if (data.business.phone) centered(`Phone: ${data.business.phone}`, 8, false, INK, 6);
  if (data.business.taxId) centered(`TIN: ${data.business.taxId}`, 7.5, false, MUTED, 4);

  y += 6;
  dashedRule();

  // ── Order meta ──
  left(`Order #: ${data.receiptNumber}`, 8.5, true, INK, 7);
  left(`Date: ${receiptDate(data.transactionDate)}`, 8, false, INK, 7);
  if (data.customerName) left(`Customer: ${data.customerName}`, 8, false, INK, 7);
  if (data.invoiceNumber) left(`Invoice: ${data.invoiceNumber}`, 8, false, INK, 7);
  y += 2;

  // ── Table header (grey band + heavy rule) ──
  doc.rect(M, y, CW, 17).fillColor(BAND).fill();
  doc.fillColor(INK).font(fonts.bold).fontSize(7.5);
  doc.text('Item', C_ITEM_X, y + 5, { width: C_ITEM_W, lineBreak: false });
  doc.text('Qty', C_QTY_X, y + 5, { width: C_QTY_W, align: 'right', lineBreak: false });
  doc.text('Price', C_PRICE_X, y + 5, { width: C_PRICE_W, align: 'right', lineBreak: false });
  doc.text('Total', C_TOTAL_X, y + 5, { width: C_TOTAL_W, align: 'right', lineBreak: false });
  y += 17;
  solidRule(2);
  y += 2;

  // ── Item rows ──
  for (const line of data.items) {
    doc.font(fonts.regular).fontSize(7.5);
    const nameH = doc.heightOfString(line.name, { width: C_ITEM_W });
    const rowH = Math.max(20, nameH + 12);
    const ty = y + 6;

    doc.fillColor(INK).font(fonts.regular).fontSize(7.5);
    doc.text(line.name, C_ITEM_X, ty, { width: C_ITEM_W });
    doc.text(qty(line.quantity), C_QTY_X, ty, { width: C_QTY_W, align: 'right', lineBreak: false });
    putMoney(line.unitPrice, C_PRICE_X + C_PRICE_W, ty, 7.5);
    putMoney(line.lineTotal, X1, ty, 7.5);

    y += rowH;
    dottedRule();
    y += 1;
  }

  y += 6;

  // ── Totals ──
  pairMoney('Subtotal', data.subtotal);
  if (data.discount && data.discount > 0) pairMoney('Discount', data.discount, 8, false, '-');
  if (data.vatAmount && data.vatAmount > 0) pairMoney(`VAT (${data.vatRate ?? 0}%)`, data.vatAmount);

  solidRule(2);
  y += 8;
  pairMoney('Total', data.amount, 9.5, true);
  dottedRule();
  y += 12;
  dashedRule();

  // ── Payment ──
  left(`Payment: ${data.sourceLabel}`, 8, true, INK, 5);
  if (data.transactionReference) left(`Ref: ${data.transactionReference}`, 7.5, false, MUTED, 5);

  // ── Store voucher notices ──
  if (data.voucherRedemption) {
    y += 2;
    left('STORE VOUCHER USED', 7.5, true, INK, 4);
    pairMoney('Paid with voucher', data.voucherRedemption.amount, 7.5);
    pairMoney('Voucher balance', data.voucherRedemption.remainingBalance, 7.5);
    if (data.voucherRedemption.cardCode) left(`Card: ${data.voucherRedemption.cardCode}`, 7.5, false, MUTED, 4);
  }
  if (data.voucherCredit) {
    y += 2;
    left('CHANGE CREDITED TO VOUCHER', 7.5, true, INK, 4);
    pairMoney('Credited', data.voucherCredit.amount, 7.5);
    pairMoney('New balance', data.voucherCredit.newBalance, 7.5);
    if (data.voucherCredit.cardCode) left(`Card: ${data.voucherCredit.cardCode}`, 7.5, false, MUTED, 4);
  }

  y += 4;
  dashedRule();

  // ── Unverified transaction notice (clickable) ──
  if (data.needsVerification) {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const url = `${frontendUrl}/sales?tab=unverified${data.saleId ? `&txnId=${data.saleId}` : ''}`;
    centered('** UNVERIFIED TRANSACTION **', 7.5, true, INK, 3);
    centered('Classify this inflow in PayMyTax', 7, false, MUTED, 3);
    doc.font(fonts.bold).fontSize(7).fillColor('#2563eb');
    doc.text('Review Unverified Inflow', M, y, { width: CW, align: 'center', link: url, underline: true });
    y += 18;
    dashedRule();
  }

  // ── Thank you + footer ──
  y += 2;
  centered('Thank you for your purchase!', 9, false, INK, 8);
  centered('Goods sold are subject to store exchange policy.', 6.5, false, MUTED, 8);
  centered('Recorded for NRS tax compliance', 6.5, false, MUTED, 2);
  centered('WallXERP by WallX', 6.5, true, MUTED, 2);

  return y + 18; // bottom breathing room
}

/**
 * Builds a supermarket-style thermal receipt (80mm roll, monospace, dashed dividers).
 * The page height is measured first so the PDF is cut exactly to the content, with no blank space.
 */
export async function buildSalesReceiptPdf(data: SalesReceiptData): Promise<Buffer> {
  const logoBuffer = data.business.logoUrl ? await fetchLogoForPdf(data.business.logoUrl) : null;

  // Pass 1: measure on a very tall page
  const probe = new PDFDocument({ size: [PAGE_W, 20000], margin: 0 });
  probe.on('data', () => undefined);
  const probeFonts = registerReceiptFonts(probe);
  const contentHeight = drawReceipt(probe, data, probeFonts, logoBuffer);
  probe.end();

  // Pass 2: render on a page cut to the exact height
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: [PAGE_W, Math.ceil(contentHeight)],
      margin: 0,
      info: { Title: `Sales Receipt ${data.receiptNumber}`, Author: data.business.businessName },
    });
    const chunks: Buffer[] = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const fonts = registerReceiptFonts(doc);
    drawReceipt(doc, data, fonts, logoBuffer);
    doc.end();
  });
}