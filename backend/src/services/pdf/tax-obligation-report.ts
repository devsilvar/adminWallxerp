import PDFDocument from 'pdfkit';
import { registerBrandFonts } from './receipt-common.pdf';
import { QUIZ_LABELS } from '@/shared/tax-quiz-engine';
import type { QuizAnswers, TaxProfileConfiguration } from '@/shared/tax-constants';

export interface ObligationReportData {
  business: {
    id: string;
    businessName: string;
    ownerName: string;
    taxId?: string | null;
  };
  answers: QuizAnswers;
  config: TaxProfileConfiguration;
  completedAt?: Date | null;
}

const COLORS = {
  ink: '#0F172A',         // Slate 900
  body: '#334155',        // Slate 700
  muted: '#64748B',       // Slate 500
  faint: '#94A3B8',       // Slate 400
  hairline: '#E2E8F0',    // Slate 200
  panel: '#F8FAFC',       // Slate 50
  panelBorder: '#CBD5E1', // Slate 300
  primary: '#4F46E5',     // Indigo 600
  primaryDark: '#1E1B4B', // Indigo 950
  success: '#059669',     // Emerald 600
  warning: '#D97706',     // Amber 600
  danger: '#DC2626',      // Red 600
};

export async function generateTaxObligationReport(data: ObligationReportData): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: 36,
      info: {
        Title: `Tax Obligation Report — ${data.business.businessName}`,
        Author: 'PayMyTax by WallX',
      },
    });

    const chunks: Buffer[] = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', (err) => reject(err));

    const fonts = registerBrandFonts(doc);
    const LEFT = 36;
    const RIGHT = 595.28 - 36;
    const PAGE_WIDTH = RIGHT - LEFT;
    let y = 36;

    // ── 1. Top Brand Banner ─────────────────────────────────────────
    doc.rect(LEFT, y, PAGE_WIDTH, 56).fill(COLORS.primaryDark);

    doc
      .fillColor('#FFFFFF')
      .font(fonts.bold)
      .fontSize(14)
      .text('PAYMYTAX BY WALLX', LEFT + 16, y + 12, { characterSpacing: 0.5 });

    doc
      .fillColor(COLORS.hairline)
      .font(fonts.medium)
      .fontSize(9)
      .text('Official Statutory Tax Obligation & Classification Guide', LEFT + 16, y + 32);

    const dateStr = (data.completedAt ? new Date(data.completedAt) : new Date()).toLocaleDateString('en-NG', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    doc
      .fillColor('#FFFFFF')
      .font(fonts.regular)
      .fontSize(8)
      .text(`Generated: ${dateStr}`, LEFT, y + 22, { align: 'right', width: PAGE_WIDTH - 16 });

    y += 70;

    // ── 2. Business Entity Summary ──────────────────────────────────
    doc
      .rect(LEFT, y, PAGE_WIDTH, 68)
      .fillAndStroke(COLORS.panel, COLORS.panelBorder);

    doc
      .fillColor(COLORS.ink)
      .font(fonts.bold)
      .fontSize(11)
      .text(data.business.businessName.toUpperCase(), LEFT + 14, y + 10);

    doc
      .fillColor(COLORS.muted)
      .font(fonts.regular)
      .fontSize(8.5)
      .text(`Owner: ${data.business.ownerName}   |   TIN / Tax ID: ${data.business.taxId || 'Not registered / In progress'}`, LEFT + 14, y + 26);

    const structureLabel = QUIZ_LABELS.legalStructure[data.answers.legalStructure] || data.answers.legalStructure;
    const turnoverLabel = QUIZ_LABELS.annualTurnover[data.answers.annualTurnover] || data.answers.annualTurnover;

    doc
      .text(`Structure: ${structureLabel}`, LEFT + 14, y + 40)
      .text(`Annual Turnover: ${turnoverLabel}`, LEFT + 14, y + 52);

    y += 82;

    // ── 3. Statutory Classification ─────────────────────────────────
    doc
      .fillColor(COLORS.ink)
      .font(fonts.bold)
      .fontSize(10)
      .text('STATUTORY TAX CLASSIFICATION (NTA 2025 FRAMEWORK)', LEFT, y);

    y += 16;

    const colWidth = (PAGE_WIDTH - 12) / 3;

    // Card 1: Income Tax
    doc.rect(LEFT, y, colWidth, 60).fillAndStroke(COLORS.panel, COLORS.panelBorder);
    doc.fillColor(COLORS.muted).font(fonts.medium).fontSize(7.5).text('INCOME TAX REGIME', LEFT + 8, y + 8);
    const incomeTaxTitle = data.config.isCorporate
      ? `CIT: ${data.config.citRate}%`
      : 'PIT (Personal Tax)';
    doc.fillColor(COLORS.primary).font(fonts.bold).fontSize(10).text(incomeTaxTitle, LEFT + 8, y + 20);
    const incomeTaxSub = data.config.isCorporate
      ? (data.config.citRate === 0 ? 'Small Company 0% Rate' : `30% CIT + ${data.config.devLevyRate}% Dev Levy`)
      : 'Graduated bands (0% - 25%)';
    doc.fillColor(COLORS.body).font(fonts.regular).fontSize(7.5).text(incomeTaxSub, LEFT + 8, y + 36, { width: colWidth - 16 });

    // Card 2: Value Added Tax
    const c2X = LEFT + colWidth + 6;
    doc.rect(c2X, y, colWidth, 60).fillAndStroke(COLORS.panel, COLORS.panelBorder);
    doc.fillColor(COLORS.muted).font(fonts.medium).fontSize(7.5).text('VALUE ADDED TAX (VAT)', c2X + 8, y + 8);
    const vatTitle = data.config.vatExempt ? 'EXEMPT (0%)' : '7.5% STANDARD';
    const vatColor = data.config.vatExempt ? COLORS.success : COLORS.warning;
    doc.fillColor(vatColor).font(fonts.bold).fontSize(10).text(vatTitle, c2X + 8, y + 20);
    const vatSub = data.config.vatExempt
      ? 'Turnover under ₦25M threshold'
      : 'Mandatory collection on sales';
    doc.fillColor(COLORS.body).font(fonts.regular).fontSize(7.5).text(vatSub, c2X + 8, y + 36, { width: colWidth - 16 });

    // Card 3: Filing Authority
    const c3X = LEFT + (colWidth + 6) * 2;
    doc.rect(c3X, y, colWidth, 60).fillAndStroke(COLORS.panel, COLORS.panelBorder);
    doc.fillColor(COLORS.muted).font(fonts.medium).fontSize(7.5).text('PRIMARY TAX AUTHORITY', c3X + 8, y + 8);
    const authTitle = data.config.primaryTaxAuthority === 'NRS_FEDERAL' ? 'FEDERAL (NRS / FIRS)' : 'STATE IRS (SIRS)';
    doc.fillColor(COLORS.ink).font(fonts.bold).fontSize(10).text(authTitle, c3X + 8, y + 20);
    const authSub = data.config.primaryTaxAuthority === 'NRS_FEDERAL'
      ? 'Corporate returns & filings'
      : 'State of residence / operation';
    doc.fillColor(COLORS.body).font(fonts.regular).fontSize(7.5).text(authSub, c3X + 8, y + 36, { width: colWidth - 16 });

    y += 72;

    // ── 4. Actionable Compliance Checklist ──────────────────────────
    doc
      .fillColor(COLORS.ink)
      .font(fonts.bold)
      .fontSize(10)
      .text('STATUTORY OBLIGATION BREAKDOWN', LEFT, y);

    y += 16;

    const obligations = [
      {
        area: 'Value Added Tax',
        badge: data.config.vatExempt ? '[OK] EXEMPT' : '[ACTION] COLLECT 7.5%',
        badgeColor: data.config.vatExempt ? COLORS.success : COLORS.warning,
        desc: data.config.vatExempt
          ? 'You do not charge VAT on invoices. No monthly VAT return is required under NTA 2025.'
          : 'You must charge 7.5% VAT on all taxable sales and remit net VAT monthly by the 21st.',
      },
      {
        area: 'Employee Payroll (PAYE)',
        badge: data.config.mustDeductPAYE ? '[ACTION] MONTHLY REMITTANCE' : '[OK] NO DEDUCTION',
        badgeColor: data.config.mustDeductPAYE ? COLORS.warning : COLORS.success,
        desc: data.config.mustDeductPAYE
          ? `You have staff earning above ₦800,000/year (₦66,667/mo). Deduct and remit PAYE by the 10th.${data.config.mustSplitPAYEByState ? ' Note: Multi-state split remittance required.' : ''}`
          : 'No staff earn above ₦800,000/year. No monthly PAYE remittance is currently due.',
      },
      {
        area: 'Withholding Tax (WHT)',
        badge: data.config.mustDeductWHT ? '[ACTION] COMPLIANCE REQUIRED' : '[OK] EXEMPT BELOW ₦25M',
        badgeColor: data.config.mustDeductWHT ? COLORS.warning : COLORS.success,
        desc: data.config.mustDeductWHT
          ? `Deduct WHT on eligible vendor/contractor disbursements.${data.config.whtTransactionExemptionLimit ? ` Qualifying small company: payments ≤₦2M per vendor with valid TIN are exempt.` : ''}`
          : 'Turnover under ₦25M: You are statutorily exempt from deducting WHT on vendor payments.',
      },
      {
        area: 'Annual Income Tax Filing',
        badge: '[ACTION] ANNUAL FILING',
        badgeColor: COLORS.primary,
        desc: data.config.isCorporate
          ? `File Corporate Income Tax return within 6 months of fiscal year end (by June 30). Rate: ${data.config.citRate}%.`
          : 'File Personal Income Tax Form A with your State Internal Revenue Service by March 31 annually.',
      },
    ];

    obligations.forEach((ob) => {
      const rowHeight = 36;
      doc.rect(LEFT, y, PAGE_WIDTH, rowHeight).fillAndStroke(COLORS.panel, COLORS.panelBorder);

      doc
        .fillColor(COLORS.ink)
        .font(fonts.bold)
        .fontSize(8.5)
        .text(ob.area, LEFT + 10, y + 8);

      doc
        .fillColor(ob.badgeColor)
        .font(fonts.bold)
        .fontSize(8)
        .text(ob.badge, RIGHT - 170, y + 8, { width: 160, align: 'right' });

      doc
        .fillColor(COLORS.body)
        .font(fonts.regular)
        .fontSize(7.5)
        .text(ob.desc, LEFT + 10, y + 20, { width: PAGE_WIDTH - 20 });

      y += rowHeight + 6;
    });

    y += 10;

    // ── 5. Deadlines & Penalties Card ───────────────────────────────
    doc.rect(LEFT, y, PAGE_WIDTH, 62).fillAndStroke('#FFFBEB', '#FDE68A');

    doc
      .fillColor('#92400E')
      .font(fonts.bold)
      .fontSize(8.5)
      .text('STATUTORY FILING CALENDAR & PENALTY PROTECTION', LEFT + 12, y + 8);

    doc
      .fillColor('#78350F')
      .font(fonts.regular)
      .fontSize(7.5)
      .text(
        '• Monthly PAYE: Remit by 10th of following month to State IRS\n' +
        '• Monthly VAT / WHT: File and remit by 21st of following month to FIRS/NRS\n' +
        '• Annual Returns: 31 March (Individuals/Business Names) | 30 June (Limited Companies)\n' +
        '• Late Filing Penalty: ₦100,000 for the first month + ₦50,000 per subsequent month. Nil returns required even with ₦0 profit.',
        LEFT + 12,
        y + 20,
        { lineGap: 1.5 }
      );

    y += 74;

    // ── 6. Mandatory Legal Disclaimer (Layer 6 Protection) ──────────
    doc.rect(LEFT, y, PAGE_WIDTH, 52).fillAndStroke('#F1F5F9', COLORS.panelBorder);

    doc
      .fillColor(COLORS.muted)
      .font(fonts.bold)
      .fontSize(7.5)
      .text('LEGAL NOTICE & STATUTORY DISCLAIMER (WallX Technology Services Limited)', LEFT + 10, y + 6);

    doc
      .fillColor(COLORS.muted)
      .font(fonts.regular)
      .fontSize(6.5)
      .text(
        'PayMyTax by WallX is an automated financial record-keeping software tool and does not provide legal, accounting, or professional tax advice. All calculations and classifications are estimates based on user-supplied answers and published statutory rules (Nigeria Tax Act 2025). WallX Technology Services Limited makes no warranties regarding legal completeness or audit outcomes. Users are solely responsible for ensuring compliance with applicable tax authorities.',
        LEFT + 10,
        y + 18,
        { width: PAGE_WIDTH - 20, lineGap: 1.5 }
      );

    doc.end();
  });
}
