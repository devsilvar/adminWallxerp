import PDFKit from 'pdfkit';
import fs from 'fs';
import path from 'path';

export const COLORS = {
  ink: '#0F172A',        // Slate 900 — primary typography & heavy bars
  body: '#334155',       // Slate 700 — standard readable body text
  muted: '#64748B',      // Slate 500 — labels, secondary metadata
  faint: '#94A3B8',      // Slate 400 — footnotes, subtle dates, page nums
  hairline: '#E2E8F0',   // Slate 200 — divider lines, card borders
  panel: '#F8FAFC',      // Slate 50  — card backgrounds, zebra rows
  panelBorder: '#CBD5E1',// Slate 300 — structured input borders
  accent: '#10B981',     // Emerald 600 — payment receipts & cashflows
  accentIndigo: '#4F46E5', // Indigo 600 — commercial invoices & ERP statements
  accentDark: '#1E1B4B', // Indigo 950 — deep banner contrast
  headerBand: '#0F172A', // Slate 900 — table header bands
  onAccent: '#FFFFFF',
  success: '#059669',    // Emerald 600 — paid status & credits
  successBg: '#F0FDF4',  // Emerald 50
  successBorder: '#BBF7D0',
  info: '#2563EB',       // Blue 600
  infoBg: '#EFF6FF',
  infoBorder: '#BFDBFE',
  warn: '#D97706',       // Amber 600
  warnBg: '#FFFBEB',
  warnBorder: '#FDE68A',
  danger: '#DC2626',     // Red 600 — overdue & debits
  dangerBg: '#FEF2F2',
  dangerBorder: '#FECACA',
  neutral: '#64748B',
  primary: '#4F46E5',    // Primary brand indigo
  subheading: '#334155', // Slate 700
};

export interface DocumentFonts {
  regular: string;
  medium: string;
  semiBold: string;
  bold: string;
}

export function registerBrandFonts(doc: PDFKit.PDFDocument): DocumentFonts {
  const candidates = [
    path.resolve(__dirname, '../../../assets/fonts'),
    path.resolve(__dirname, '../../assets/fonts'),
    path.resolve(process.cwd(), 'assets/fonts'),
    path.resolve(process.cwd(), 'backend/assets/fonts'),
  ];
  const fontsDir = candidates.find(dir => fs.existsSync(dir));

  if (fontsDir) {
    const regular = path.join(fontsDir, 'Montserrat-Regular.ttf');
    const medium = path.join(fontsDir, 'Montserrat-Medium.ttf');
    const semiBold = path.join(fontsDir, 'Montserrat-SemiBold.ttf');
    const bold = path.join(fontsDir, 'Montserrat-Bold.ttf');

    if (fs.existsSync(regular) && fs.existsSync(bold)) {
      doc.registerFont('Montserrat', regular);
      doc.registerFont('Montserrat-Medium', fs.existsSync(medium) ? medium : regular);
      doc.registerFont('Montserrat-SemiBold', fs.existsSync(semiBold) ? semiBold : bold);
      doc.registerFont('Montserrat-Bold', bold);

      return {
        regular: 'Montserrat',
        medium: 'Montserrat-Medium',
        semiBold: 'Montserrat-SemiBold',
        bold: 'Montserrat-Bold',
      };
    }
  }

  return {
    regular: 'Helvetica',
    medium: 'Helvetica',
    semiBold: 'Helvetica-Bold',
    bold: 'Helvetica-Bold',
  };
}

export const FONT = {
  regular: 'Helvetica',
  bold: 'Helvetica-Bold',
};

export const MARGIN = 44;
export const LEFT = 44;
export const RIGHT = 551;
export const PAGE_WIDTH = RIGHT - LEFT; // 507 pt
export const RADIUS = 5;
export const INNER_PAD = 14;
export const CARD_PAD_X = 14;
export const CARD_PAD_Y = 12;
export const FOOTER_Y = 788;
export const FOOTER_DIVIDER_Y = 780;
export const MAX_CONTENT_Y = 745;

/**
 * Bulletproof currency formatter.
 * Handles null, undefined, NaN, strings, and zero gracefully.
 * Never outputs raw undefined or unformatted floats.
 */
export function formatMoney(amount: number | string | null | undefined, currency = 'NGN'): string {
  if (amount === null || amount === undefined || amount === '') {
    return `${currency} 0.00`;
  }
  const n = typeof amount === 'number' ? amount : parseFloat(String(amount));
  if (isNaN(n) || !isFinite(n)) {
    return `${currency} 0.00`;
  }
  return `${currency} ${n.toLocaleString('en-NG', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * Safe short date (e.g., "24 Mar 2026")
 */
export function formatDate(d: Date | string | null | undefined): string {
  if (!d) return '—';
  try {
    const dateObj = typeof d === 'string' ? new Date(d) : d;
    if (isNaN(dateObj.getTime())) return String(d);
    return dateObj.toLocaleDateString('en-NG', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return '—';
  }
}

/**
 * Safe date with time (e.g., "24 Mar 2026, 16:15")
 */
export function formatDateTime(d: Date | string | null | undefined): string {
  if (!d) return '—';
  try {
    const dateObj = typeof d === 'string' ? new Date(d) : d;
    if (isNaN(dateObj.getTime())) return String(d);
    return dateObj.toLocaleDateString('en-NG', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

/**
 * Quantity formatter. Whole numbers stay whole; decimals show up to 2 places.
 */
export function formatQty(qty: number | null | undefined): string {
  if (qty === null || qty === undefined || isNaN(qty)) return '0';
  return Number.isInteger(qty) ? qty.toString() : qty.toLocaleString('en-NG', { maximumFractionDigits: 2 });
}

/**
 * Month and year (e.g., "March 2026")
 */
export function formatMonthYear(d: Date | string | null | undefined): string {
  if (!d) return '—';
  try {
    const dateObj = typeof d === 'string' ? new Date(d) : d;
    if (isNaN(dateObj.getTime())) return String(d);
    return dateObj.toLocaleDateString('en-NG', { month: 'long', year: 'numeric' });
  } catch {
    return '—';
  }
}

/**
 * Fallback for null/empty strings
 */
export function safeText(text: string | null | undefined, fallback = '—'): string {
  if (!text || !text.trim()) return fallback;
  return text.trim();
}

/**
 * Formats channel / payment method to a human-readable title.
 */
export function formatPaymentMethod(method: string | null | undefined): string {
  if (!method) return '—';
  const clean = method.toLowerCase().trim().replace(/_/g, ' ');
  switch (clean) {
    case 'bank transfer':
    case 'nip':
    case 'direct transfer':
      return 'Bank Transfer';
    case 'card':
      return 'Debit / Credit Card';
    case 'pos':
      return 'POS Terminal';
    case 'cash':
    case 'manual':
      return 'Cash / Direct';
    case 'dva transfer':
    case 'dva':
      return 'Dedicated Virtual Account (DVA)';
    default:
      return clean.replace(/\b\w/g, c => c.toUpperCase());
  }
}

export interface DocumentFooterOptions {
  left?: number;
  right?: number;
  platformText?: string;
  complianceText?: string;
  disclaimerText?: string;
  accentColor?: string;
  fonts?: DocumentFonts;
}

/**
 * Renders consistent, publication-grade footers across all buffered pages.
 * Temporarily disables PDFKit's bottom margin to strictly prevent accidental auto-page breaks.
 */
export function renderDocumentFooters(doc: PDFKit.PDFDocument, options: DocumentFooterOptions = {}): void {
  const left = options.left ?? LEFT;
  const right = options.right ?? RIGHT;
  const contentWidth = right - left;
  const platformText = options.platformText ?? 'WallXERP by WallX  •  NRS SME Compliance & Financial Platform';
  const complianceText = options.complianceText ?? 'Compliant with Nigerian Tax Regulations  •  Valid Electronic Document';
  const disclaimerText = options.disclaimerText;
  const fontBold = options.fonts?.bold || FONT.bold;
  const fontRegular = options.fonts?.regular || FONT.regular;

  const totalPages = doc.bufferedPageRange().count;

  for (let i = 0; i < totalPages; i++) {
    doc.switchToPage(i);

    // Safeguard: zero out bottom margin on this page so footer text at y ~ 790 cannot trigger an auto-page break
    const originalBottomMargin = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;

    const footerY = FOOTER_Y;
    const dividerY = FOOTER_DIVIDER_Y;

    // Subtle divider
    doc
      .moveTo(left, dividerY)
      .lineTo(right, dividerY)
      .strokeColor(COLORS.hairline)
      .lineWidth(0.5)
      .stroke();

    // Primary footer line
    doc
      .fontSize(6.5)
      .font(fontBold)
      .fillColor(options.accentColor || COLORS.muted)
      .text(platformText, left, footerY, { lineBreak: false });

    // Secondary compliance line / disclaimer
    doc
      .fontSize(6)
      .font(fontRegular)
      .fillColor(COLORS.faint)
      .text(disclaimerText || complianceText, left, footerY + 9, { lineBreak: false });

    // Page numbering right-aligned
    if (totalPages > 1) {
      doc
        .fontSize(6.5)
        .font(fontRegular)
        .fillColor(COLORS.muted)
        .text(`Page ${i + 1} of ${totalPages}`, left, footerY, {
          width: contentWidth,
          align: 'right',
          lineBreak: false,
        });
    }

    doc.page.margins.bottom = originalBottomMargin;
  }
}
