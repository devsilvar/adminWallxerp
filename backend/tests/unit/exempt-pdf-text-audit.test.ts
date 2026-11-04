import PDFDocument from 'pdfkit';
import { buildInvoicePdf, InvoiceForPdf, BusinessForPdf } from '@/services/pdf/invoice.pdf';
import { buildTaxSlipPdf, TaxSlipData } from '@/services/pdf/tax-slip.pdf';
import {
  generatePnlStatementReadyHtml,
  generatePnlStatementReadyText,
} from '@/lib/email/templates/pnl-statement-ready';
import {
  generateWelcomeHtml,
  generateWelcomeText,
} from '@/lib/email/templates/welcome';
import {
  generateTaxDueDateHtml,
  generateTaxDueDateText,
} from '@/lib/email/templates/tax-due-date';

describe('TAX-08: PDF and Email Copy Audit (Phase 7)', () => {
  let renderedStrings: string[] = [];
  let textSpy: jest.SpyInstance;

  beforeEach(() => {
    renderedStrings = [];
    const origText = PDFDocument.prototype.text;
    textSpy = jest.spyOn(PDFDocument.prototype, 'text').mockImplementation(function (
      this: any,
      text: any,
      ...args: any[]
    ) {
      if (typeof text === 'string') {
        renderedStrings.push(text);
      }
      return origText.call(this, text, ...args);
    });
  });

  afterEach(() => {
    textSpy.mockRestore();
  });

  const business: BusinessForPdf = {
    businessName: 'Green Farms Ltd',
    merchantId: 'M-12345',
    email: 'green@farms.ng',
    phone: '08012345678',
    address: '12 Farm Road, Kaduna',
    taxId: 'TIN-001',
    logoUrl: null,
  };

  describe('Invoice PDF VAT line suppression', () => {
    it('suppresses the VAT line completely when vatAmount is 0 for an exempt invoice', async () => {
      const exemptInvoice: InvoiceForPdf = {
        invoiceNumber: 'INV-TEST-EXEMPT',
        status: 'draft',
        customerName: 'Acme Nigeria Ltd',
        customerEmail: 'acme@test.com',
        customerPhone: null,
        customerAddress: null,
        customerTaxId: null,
        issueDate: new Date('2026-03-01'),
        dueDate: new Date('2026-03-15'),
        paidAt: null,
        paymentMethod: null,
        subtotal: 100000,
        vatRate: 0,
        vatAmount: 0,
        discount: 0,
        total: 100000,
        currency: 'NGN',
        notes: null,
        paymentTerms: null,
        lines: [
          {
            description: 'Exempt Agricultural Supply',
            quantity: 1,
            unitPrice: 100000,
            lineTotal: 100000,
          },
        ],
      };

      const pdf = await buildInvoicePdf(business, exemptInvoice);
      expect(Buffer.isBuffer(pdf)).toBe(true);

      // Verify no rendered string contains 7.5 or VAT (
      expect(renderedStrings.some((s) => s.includes('7.5'))).toBe(false);
      expect(renderedStrings.some((s) => s.includes('VAT (0%)'))).toBe(false);
      expect(renderedStrings.some((s) => s.includes('VAT ('))).toBe(false);
    });

    it('renders the VAT line when vatAmount is positive', async () => {
      const standardInvoice: InvoiceForPdf = {
        invoiceNumber: 'INV-TEST-STANDARD',
        status: 'draft',
        customerName: 'Acme Nigeria Ltd',
        customerEmail: 'acme@test.com',
        customerPhone: null,
        customerAddress: null,
        customerTaxId: null,
        issueDate: new Date('2026-03-01'),
        dueDate: new Date('2026-03-15'),
        paidAt: null,
        paymentMethod: null,
        subtotal: 100000,
        vatRate: 7.5,
        vatAmount: 7500,
        discount: 0,
        total: 107500,
        currency: 'NGN',
        notes: null,
        paymentTerms: null,
        lines: [
          {
            description: 'Consulting Services',
            quantity: 1,
            unitPrice: 100000,
            lineTotal: 100000,
          },
        ],
      };

      const pdf = await buildInvoicePdf(business, standardInvoice);
      expect(Buffer.isBuffer(pdf)).toBe(true);
      expect(renderedStrings.some((s) => s.includes('VAT (7.5%)'))).toBe(true);
    });
  });

  describe('Tax Slip PDF statutory basis and seal', () => {
    it('states the VAT exemption basis for a non-VAT business', async () => {
      const exemptSlip: TaxSlipData = {
        slipNumber: 'SLIP-2026-03-001',
        taxMonth: new Date('2026-03-01'),
        generatedAt: new Date(),
        isFinalized: true,
        isLocked: true,
        paymentStatus: 'paid',
        business: {
          businessName: 'Green Farms Ltd',
          merchantId: 'M-12345',
          ownerName: 'Farmer Joe',
        },
        assessment: {
          totalSales: 1000000,
          totalExpenses: 400000,
          grossProfit: 600000,
          taxRate: 0,
          taxPayable: 0,
          taxBasis: 'cit-provision',
          needsManualReview: false,
        },
        payment: {
          paymentReference: 'REF-001',
          paymentStatus: 'paid',
          amountPaid: 0,
        },
      };

      const pdf = await buildTaxSlipPdf(exemptSlip);
      expect(Buffer.isBuffer(pdf)).toBe(true);

      // Verify no rendered text contains 7.5
      expect(renderedStrings.some((s) => s.includes('7.5'))).toBe(false);
      // Assessment basis card + verification seal must both state the exemption
      expect(
        renderedStrings.some((s) =>
          s.includes(
            'Assessment Basis: VAT-exempt — monthly remittance is ₦0; CIT is assessed annually'
          )
        )
      ).toBe(true);
      expect(
        renderedStrings.some((s) =>
          s.includes(
            'Tax Basis: VAT-exempt — monthly remittance is ₦0; CIT is assessed annually.'
          )
        )
      ).toBe(true);
      expect(
        renderedStrings.some((s) => s.includes('MONTHLY REMITTANCE — NO VAT DUE'))
      ).toBe(true);
    });

    it('states Net VAT as the basis when VAT is chargeable', async () => {
      const taxableSlip: TaxSlipData = {
        slipNumber: 'SLIP-2026-03-002',
        taxMonth: new Date('2026-03-01'),
        generatedAt: new Date(),
        isFinalized: true,
        isLocked: true,
        paymentStatus: 'paid',
        business: {
          businessName: 'Green Farms Ltd',
          merchantId: 'M-12345',
          ownerName: 'Farmer Joe',
        },
        assessment: {
          totalSales: 1000000,
          totalExpenses: 400000,
          grossProfit: 600000,
          taxRate: 10,
          taxPayable: 60000,
          taxBasis: 'vat',
          needsManualReview: false,
        },
        payment: {
          paymentReference: 'REF-002',
          paymentStatus: 'paid',
          amountPaid: 60000,
        },
      };

      const pdf = await buildTaxSlipPdf(taxableSlip);
      expect(Buffer.isBuffer(pdf)).toBe(true);

      expect(
        renderedStrings.some((s) =>
          s.includes('Assessment Basis: Net VAT = Output VAT − Input VAT (10% standard rate)')
        )
      ).toBe(true);
      expect(
        renderedStrings.some((s) =>
          s.includes('Tax Basis: Net VAT = Output VAT − Input VAT (10% standard rate).')
        )
      ).toBe(true);
      // The retired gross-profit formula must not appear anywhere on the slip.
      expect(
        renderedStrings.some((s) => s.includes('* (Sales - Expenses)'))
      ).toBe(false);
    });

    it('labels the assessment as pending when no tax profile exists', async () => {
      const reviewSlip: TaxSlipData = {
        slipNumber: 'SLIP-2026-03-003',
        taxMonth: new Date('2026-03-01'),
        generatedAt: new Date(),
        isFinalized: false,
        isLocked: false,
        paymentStatus: 'pending',
        business: {
          businessName: 'Green Farms Ltd',
          merchantId: 'M-12345',
          ownerName: 'Farmer Joe',
        },
        assessment: {
          totalSales: 1000000,
          totalExpenses: 400000,
          grossProfit: 600000,
          taxRate: 0,
          taxPayable: 0,
          taxBasis: 'cit-provision',
          needsManualReview: true,
        },
        payment: null,
      };

      const pdf = await buildTaxSlipPdf(reviewSlip);
      expect(Buffer.isBuffer(pdf)).toBe(true);

      expect(
        renderedStrings.some((s) =>
          s.includes('ASSESSMENT PENDING — TAX PROFILE REQUIRED')
        )
      ).toBe(true);
      expect(
        renderedStrings.some((s) =>
          s.includes('Pending tax-profile review — no statutory rate has been applied')
        )
      ).toBe(true);
    });
  });

  describe('Email templates copy honesty', () => {
    it('pnl-statement-ready template does not contain hardcoded 7.5%', () => {
      const mockData = {
        businessName: 'Test Biz',
        monthLabel: 'March 2026',
        totalSalesFormatted: '₦1,000,000',
        totalExpensesFormatted: '₦400,000',
        grossProfitFormatted: '₦600,000',
        profitMarginFormatted: '60%',
        taxPayableFormatted: '₦0',
        downloadLink: 'https://app.paymytax.com/pnl',
      };

      const html = generatePnlStatementReadyHtml(mockData);
      const text = generatePnlStatementReadyText(mockData);

      expect(html).not.toContain('7.5');
      expect(text).not.toContain('7.5');
      expect(html).toContain('Estimated Tax');
      expect(text).toContain('Estimated Tax:');
    });

    it('welcome email template does not contain hardcoded 7.5%', () => {
      const mockData = {
        userName: 'Ada',
        userEmail: 'ada@example.com',
        businessName: 'Ada Stores',
        dashboardLink: 'https://app.paymytax.com',
      };

      const html = generateWelcomeHtml(mockData);
      const text = generateWelcomeText(mockData);

      expect(html).not.toContain('7.5');
      expect(text).not.toContain('7.5');
    });

    it('tax-due-date email template does not contain hardcoded 7.5%', () => {
      const mockData = {
        ownerName: 'Ada',
        businessName: 'Ada Stores',
        taxMonthLabel: 'March 2026',
        statusHeadline: 'Tax return due soon',
        reminderMessage: 'Your monthly tax return is due on the 21st.',
        taxDashboardLink: 'https://app.paymytax.com/tax',
      };

      const html = generateTaxDueDateHtml(mockData);
      const text = generateTaxDueDateText(mockData);

      expect(html).not.toContain('7.5%');
      expect(text).not.toContain('7.5%');
    });
  });
});
