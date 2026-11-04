import { DocumentFonts, FONT } from './receipt-common.pdf';

interface RenderSealOptions {
  doc: PDFKit.PDFDocument;
  left: number;
  right: number;
  pageWidth: number;
  y: number;
  isPaid: boolean;
  slipNumber: string;
  generatedAt: Date;
  /** Statutory basis the assessment was computed under, stated verbatim. */
  taxBasisText: string;
  colors: {
    hairline: string;
    muted: string;
    faint: string;
    success: string;
  };
  fonts?: DocumentFonts;
}

/**
 * Draws the statutory compliance disclaimer and optional NRS verification stamp.
 * Uses sharp 90° architectural geometry and Montserrat typography.
 */
export function drawTaxSlipVerificationSeal(options: RenderSealOptions): void {
  const { doc, left, right, pageWidth, isPaid, slipNumber, generatedAt, colors, fonts } = options;
  let { y } = options;

  const fontBold = fonts?.bold || FONT.bold;
  const fontRegular = fonts?.regular || FONT.regular;

  const formulaText = options.taxBasisText;

  const remainingSpace = 795 - y;
  if (remainingSpace <= 50) return;

  doc
    .moveTo(left, y)
    .lineTo(right, y)
    .strokeColor(colors.hairline)
    .lineWidth(0.5)
    .stroke();
  y += 10;

  if (isPaid) {
    const textWidth = pageWidth - 180;
    doc
      .fillColor(colors.muted)
      .font(fontBold)
      .fontSize(7)
      .text('STATUTORY DECLARATION & AUDIT VERIFICATION', left, y, { characterSpacing: 0.3 });
    y += 12;

    doc
      .fillColor(colors.faint)
      .font(fontRegular)
      .fontSize(6.5)
      .text(
        `This Monthly Tax Assessment Slip is electronically compiled and certified by WallXERP by WallX in compliance with the Federal Inland Revenue Service (NRS) SME Taxation Framework. Computations are based on reconciled business records for the specified month. ${formulaText} Valid without physical signature under the Electronic Transactions Act. Verification Ref: ${slipNumber}. Generated on ${generatedAt.toISOString()}.`,
        left,
        y,
        { width: textWidth, align: 'justify', lineGap: 1.5 }
      );

    // Official Sharp 90° Green NRS Compliance Certification Stamp (no rounded corners)
    const stampX = right - 165;
    const stampY = y - 6;
    const stampW = 165;
    const stampH = 52;

    doc
      .rect(stampX, stampY, stampW, stampH)
      .lineWidth(1.2)
      .strokeColor(colors.success)
      .stroke();

    doc
      .rect(stampX + 2.5, stampY + 2.5, stampW - 5, stampH - 5)
      .lineWidth(0.5)
      .strokeColor(colors.success)
      .stroke();

    doc
      .fillColor(colors.success)
      .font(fontBold)
      .fontSize(7.5)
      .text('NRS COMPLIANCE CERTIFIED', stampX, stampY + 7, {
        width: stampW,
        align: 'center',
        characterSpacing: 0.4,
      });

    doc
      .fillColor(colors.success)
      .font(fontBold)
      .fontSize(9.5)
      .text('TAX PAID & REMITTED', stampX, stampY + 18, {
        width: stampW,
        align: 'center',
        characterSpacing: 0.2,
      });

    doc
      .fillColor(colors.success)
      .font(fontRegular)
      .fontSize(6)
      .text(`VERIFIED: ${slipNumber}`, stampX, stampY + 31, {
        width: stampW,
        align: 'center',
      });

    doc
      .fillColor(colors.success)
      .font(fontRegular)
      .fontSize(5.5)
      .text('OFFICIAL ELECTRONIC COMPLIANCE SEAL', stampX, stampY + 40, {
        width: stampW,
        align: 'center',
      });
  } else {
    doc
      .fillColor(colors.muted)
      .font(fontBold)
      .fontSize(7)
      .text('STATUTORY DECLARATION & AUDIT VERIFICATION', left, y, { characterSpacing: 0.3 });
    y += 12;

    doc
      .fillColor(colors.faint)
      .font(fontRegular)
      .fontSize(6.5)
      .text(
        `This Monthly Tax Assessment Slip is electronically compiled and certified by WallXERP by WallX in compliance with the Federal Inland Revenue Service (NRS) SME Taxation Framework. Computations are based on reconciled business records for the specified month. ${formulaText} Valid without physical signature under the Electronic Transactions Act. Verification Ref: ${slipNumber}. Generated on ${generatedAt.toISOString()}.`,
        left,
        y,
        { width: pageWidth, align: 'justify', lineGap: 1.5 }
      );
  }
}
