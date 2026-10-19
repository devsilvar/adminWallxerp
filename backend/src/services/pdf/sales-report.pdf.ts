/**
 * Sales Report PDF — A4 tabular report of all sales in a date range.
 * Publication-grade layout with sharp 90° geometry, Montserrat typography,
 * symmetrical 14pt padding, continuation headers, and robust multi-page footers.
 */
import PDFDocument from 'pdfkit';
import {
  COLORS,
  LEFT,
  RIGHT,
  PAGE_WIDTH,
  INNER_PAD,
  formatMoney,
  formatDate,
  renderDocumentFooters,
  registerBrandFonts,
  DocumentFonts,
} from './receipt-common.pdf';

export interface SalesReportRow {
  date: Date | string;
  description: string | null;
  source: string;
  customerName: string | null;
  amount: number;
  status: string;
}

export interface SalesReportData {
  businessName: string;
  merchantId: string;
  logoBuffer: Buffer | null;
  from: string; // YYYY-MM-DD
  to: string;
  rows: SalesReportRow[];
  totalAmount: number;
  breakdown: Record<string, { count: number; total: number }>;
}

const SOURCE_LABELS: Record<string, string> = {
  bank_transfer: 'Bank Transfer',
  manual: 'Manual',
  cash: 'Cash',
  pos: 'POS',
  invoice: 'Invoice',
  online_store: 'Online',
  paycode: 'Paycode',
};

export async function buildSalesReportPdf(data: SalesReportData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: LEFT,
      bufferPages: true,
      info: {
        Title: `Sales Report ${data.from} to ${data.to}`,
        Author: 'WallXERP by WallX',
      },
    });

    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // Register brand fonts (Montserrat with Helvetica fallback)
    const fonts: DocumentFonts = registerBrandFonts(doc);

    // ── Header ──────────────────────────────────────────────
    if (data.logoBuffer) {
      try {
        doc.image(data.logoBuffer, LEFT, 38, { fit: [42, 42] });
      } catch {
        /* skip */
      }
    }

    const headerX = data.logoBuffer ? LEFT + 50 : LEFT;
    doc
      .font(fonts.bold)
      .fontSize(16)
      .fillColor(COLORS.ink)
      .text(data.businessName, headerX, 38);
    doc
      .font(fonts.regular)
      .fontSize(8)
      .fillColor(COLORS.muted)
      .text(`Merchant ID: ${data.merchantId}`, headerX, 58);

    doc
      .font(fonts.bold)
      .fontSize(12)
      .fillColor(COLORS.ink)
      .text('Sales Report', LEFT, 38, { width: PAGE_WIDTH, align: 'right', characterSpacing: 0.3 });
    doc
      .font(fonts.regular)
      .fontSize(8)
      .fillColor(COLORS.muted)
      .text(`${formatDate(data.from)} — ${formatDate(data.to)}`, LEFT, 54, {
        width: PAGE_WIDTH,
        align: 'right',
      });

    doc.moveTo(LEFT, 82).lineTo(RIGHT, 82).strokeColor(COLORS.hairline).lineWidth(0.8).stroke();

    // ── Summary Strip ───────────────────────────────────────
    let y = 94;
    doc.font(fonts.bold).fontSize(9).fillColor(COLORS.ink).text('Summary', LEFT, y, { characterSpacing: 0.2 });
    y += 16;

    doc.font(fonts.regular).fontSize(8).fillColor(COLORS.body);
    doc.text(`Total Sales: ${data.rows.length} transactions`, LEFT, y);
    doc.text(`Total Amount: ${formatMoney(data.totalAmount)}`, LEFT + 200, y);
    y += 14;

    // Breakdown by source
    const sources = Object.entries(data.breakdown).filter(([, v]) => v.count > 0);
    if (sources.length > 0) {
      const summaryText = sources
        .map(([source, info]) => {
          const label = SOURCE_LABELS[source] || source;
          return `${label}: ${info.count} (${formatMoney(info.total)})`;
        })
        .join('    •    ');
      doc
        .font(fonts.regular)
        .fontSize(7)
        .fillColor(COLORS.muted)
        .text(summaryText, LEFT, y, { width: PAGE_WIDTH });
      y += 16;
    }

    doc.moveTo(LEFT, y).lineTo(RIGHT, y).strokeColor(COLORS.hairline).lineWidth(0.5).stroke();
    y += 12;

    // ── Table Header (Sharp 90° & 14pt Padding) ─────────────
    // Symmetrical 14pt padding:
    // Left text boundary: LEFT + INNER_PAD = 44 + 14 = 58 pt
    // Right text boundary: RIGHT - INNER_PAD = 551 - 14 = 537 pt (colAmount + width 92 = 537)
    const COL = {
      date: LEFT + INNER_PAD, // 58
      desc: 118,
      source: 282,
      customer: 360,
      amount: 445, // 445 + 92 = 537 (= RIGHT - 14)
    };

    function renderTableHeader(curY: number) {
      doc.rect(LEFT, curY, PAGE_WIDTH, 18).fill('#F1F5F9');
      doc.font(fonts.bold).fontSize(7).fillColor(COLORS.subheading);
      doc.text('DATE', COL.date, curY + 5, { width: 55, characterSpacing: 0.2 });
      doc.text('DESCRIPTION', COL.desc, curY + 5, { width: 160, characterSpacing: 0.2 });
      doc.text('SOURCE', COL.source, curY + 5, { width: 75, characterSpacing: 0.2 });
      doc.text('CUSTOMER', COL.customer, curY + 5, { width: 80, characterSpacing: 0.2 });
      doc.text('AMOUNT (NGN)', COL.amount, curY + 5, { width: 92, align: 'right', characterSpacing: 0.2 });
    }

    renderTableHeader(y);
    y += 20;

    // ── Table Rows ──────────────────────────────────────────
    for (let i = 0; i < data.rows.length; i++) {
      if (y > 730) {
        doc.addPage();
        y = 44;
        renderTableHeader(y);
        y += 20;
      }

      const row = data.rows[i];
      const bg = i % 2 === 0 ? '#ffffff' : COLORS.panel;
      doc.rect(LEFT, y - 2, PAGE_WIDTH, 18).fill(bg);

      doc.font(fonts.regular).fontSize(7).fillColor(COLORS.body);
      doc.text(formatDate(row.date), COL.date, y + 2, { width: 55, height: 10, ellipsis: true });
      doc.text(row.description || '—', COL.desc, y + 2, { width: 160, height: 10, ellipsis: true });
      doc.font(fonts.regular).fontSize(7).fillColor(COLORS.muted);
      doc.text(SOURCE_LABELS[row.source] || row.source, COL.source, y + 2, { width: 75, height: 10, ellipsis: true });
      doc.text(row.customerName || '—', COL.customer, y + 2, { width: 80, height: 10, ellipsis: true });
      doc.font(fonts.bold).fontSize(7).fillColor(COLORS.ink);
      doc.text(formatMoney(row.amount), COL.amount, y + 2, { width: 92, align: 'right', height: 10 });

      y += 18;
    }

    if (data.rows.length === 0) {
      doc
        .font(fonts.regular)
        .fontSize(8.5)
        .fillColor(COLORS.muted)
        .text('No sales transactions found in this period.', LEFT, y + 20, {
          width: PAGE_WIDTH,
          align: 'center',
        });
      y += 50;
    }

    // ── Total Bar (Sharp 90°) ───────────────────────────────
    if (y > 720) {
      doc.addPage();
      y = 44;
    }

    doc.rect(LEFT, y, PAGE_WIDTH, 22).fill('#ECFDF5');
    doc
      .font(fonts.bold)
      .fontSize(8)
      .fillColor('#065F46')
      .text('TOTAL SALES', LEFT + INNER_PAD, y + 6, { characterSpacing: 0.3 });
    doc
      .font(fonts.bold)
      .fontSize(8)
      .fillColor('#065F46')
      .text(formatMoney(data.totalAmount), COL.amount, y + 6, { width: 92, align: 'right' });

    // ── Footer ──────────────────────────────────────────────
    renderDocumentFooters(doc, {
      left: LEFT,
      right: RIGHT,
      platformText: 'WallXERP by WallX  •  NRS SME Compliance & Financial Platform',
      complianceText: `Compliant with Nigerian Tax Regulations  •  Generated: ${new Date().toLocaleDateString('en-NG')}`,
      accentColor: COLORS.muted,
      fonts,
    });

    doc.end();
  });
}
