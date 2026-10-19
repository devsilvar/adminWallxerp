import fs from 'fs';
import path from 'path';
import { buildInvoicePdf } from '../src/services/pdf/invoice.pdf';
import { buildTaxPaymentReceiptPdf } from '../src/services/pdf/tax-payment-receipt.pdf';
import { buildDvaTransferReceiptPdf } from '../src/services/pdf/dva-receipt.pdf';
import { buildSalesReceiptPdf } from '../src/services/pdf/sales-receipt.pdf';
import { buildTaxSlipPdf } from '../src/services/pdf/tax-slip.pdf';
import { buildLedgerStatementPdf } from '../src/services/pdf/ledger-statement.pdf';
import { buildPnlStatementPdf } from '../src/services/pdf/pnl-statement.pdf';
import { buildSalesReportPdf } from '../src/services/pdf/sales-report.pdf';
import { buildExpenseReportPdf } from '../src/services/pdf/expense-report.pdf';

const OUT_DIR = path.resolve(__dirname, '../../pdf-renders');
if (!fs.existsSync(OUT_DIR)) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
}

async function main() {
  console.log('Generating PDFs...');

  // 1. INVOICE - SAMPLE (1-2 pages)
  const invoiceSample = await buildInvoicePdf(
    {
      businessName: 'Apex Logistics & Freight Limited',
      merchantId: 'MERCH-99482',
      ownerName: 'Babatunde Adeleke',
      taxId: '23491823-0001',
      address: '14 Marina Road, Victoria Island',
      city: 'Lagos',
      state: 'Lagos State',
    },
    {
      invoiceNumber: 'INV-2026-0042',
      status: 'sent',
      issueDate: new Date('2026-03-15'),
      dueDate: new Date('2026-03-30'),
      paidAt: null,
      paymentMethod: null,
      customerName: 'Dangote Flour Mills Plc',
      customerEmail: 'procurement@dangoteflour.com',
      customerPhone: '+234 803 123 4567',
      customerAddress: 'Plot 1, Commercial Ave, Apapa Port Complex, Lagos',
      customerTaxId: '00987654-0001',
      subtotal: 1450000,
      vatRate: 7.5,
      vatAmount: 108750,
      discount: 50000,
      total: 1508750,
      currency: 'NGN',
      notes: 'Please quote invoice number on bank transfer remittance advice. Late payments attract 1.5% monthly statutory interest.',
      paymentTerms: 'Net 15 Days. Direct bank deposit to dedicated virtual account.',
      lines: [
        { description: 'Haulage services: 30T container transport from Apapa to Ikeja Depot', quantity: 2, unitPrice: 450000, lineTotal: 900000 },
        { description: 'Terminal handling and demurrage waiver processing', quantity: 1, unitPrice: 250000, lineTotal: 250000 },
        { description: 'Transit cargo insurance surcharge (comprehensive all-risk)', quantity: 2, unitPrice: 150000, lineTotal: 300000 },
      ],
    }
  );
  fs.writeFileSync(path.join(OUT_DIR, '01_invoice_sample.pdf'), invoiceSample);

  // 1B. INVOICE - HOSTILE (Multi-page, 25 long lines, extreme numbers, zero discounts, missing optional fields)
  const hostileLines = Array.from({ length: 28 }).map((_, i) => ({
    description: `Industrial Component SKU-${1000 + i}: Precision heavy-gauge reinforced carbon-fiber bracket for multi-axle suspension system assembly with anti-corrosion coating [Ref Batch #${9000 + i}]`,
    quantity: (i + 1) * 3,
    unitPrice: 125450.75,
    lineTotal: (i + 1) * 3 * 125450.75,
  }));
  const hostileSubtotal = hostileLines.reduce((acc, l) => acc + l.lineTotal, 0);

  const invoiceHostile = await buildInvoicePdf(
    {
      businessName: 'Ultra Dynamics Super-Heavy Engineering & Allied Manufacturing Technologies West Africa Joint Venture Corporation Ltd',
      merchantId: 'MERCH-VERY-LONG-IDENTIFIER-99999999',
      ownerName: 'Chief (Dr.) Christopher Chukwuemeka Alexander Montgomery-Adeyemi CON, CFR, SAN',
      taxId: 'TIN-999888777-666',
      address: 'Suite 401-408, Tower B, Landmark World Trade Centre, Plot 1412 Constitution Avenue, Central Business District Phase 2',
      city: 'Federal Capital Territory',
      state: 'Abuja FCT',
    },
    {
      invoiceNumber: 'INV-2026-LONG-NUM-9999999',
      status: 'overdue',
      issueDate: new Date('2026-01-01'),
      dueDate: new Date('2026-01-15'),
      paidAt: null,
      paymentMethod: null,
      customerName: 'Consolidated West African Infrastructure Expansion & Maritime Development Consortium Plc',
      customerEmail: null,
      customerPhone: null,
      customerAddress: null,
      customerTaxId: null,
      subtotal: hostileSubtotal,
      vatRate: 7.5,
      vatAmount: hostileSubtotal * 0.075,
      discount: 0,
      total: hostileSubtotal * 1.075,
      currency: 'NGN',
      notes: 'Payment overdue. Demand notice served in accordance with the Companies and Allied Matters Act (CAMA 2020) and Federal Inland Revenue Service (Establishment) Act. Failure to settle within 48 hours will trigger immediate legal escalation and asset repossession.',
      paymentTerms: 'Immediate Payment Required.',
      lines: hostileLines,
    }
  );
  fs.writeFileSync(path.join(OUT_DIR, '01b_invoice_hostile.pdf'), invoiceHostile);

  // 2. TAX PAYMENT RECEIPT (Stage 1 Custody & Stage 2 Remitted)
  const taxReceiptStage1 = await buildTaxPaymentReceiptPdf({
    receiptNumber: 'PMT-REC-202603-0081',
    paymentReference: 'PAY-NRS-88491823901',
    paymentDate: new Date('2026-03-20T11:42:00Z'),
    amount: 142500,
    paymentMethod: 'bank_transfer',
    remittanceStatus: 'collected',
    business: {
      businessName: 'Greenfield Retail & Groceries Ltd',
      ownerName: 'Amina Yusuf',
      merchantId: 'MERCH-00128',
      taxId: '22837194-0001',
      address: 'Shop 4B, Palms Mall, Lekki, Lagos',
    },
    taxReport: {
      taxMonth: new Date('2026-02-01'),
      totalSales: 4500000,
      totalExpenses: 2600000,
      grossProfit: 1900000,
      taxRate: 7.5,
      taxPayable: 142500,
    },
  });
  fs.writeFileSync(path.join(OUT_DIR, '02_tax_receipt_custody.pdf'), taxReceiptStage1);

  const taxReceiptStage2 = await buildTaxPaymentReceiptPdf({
    receiptNumber: 'PMT-REC-202603-0081-R',
    paymentReference: 'PAY-NRS-88491823901',
    paymentDate: new Date('2026-03-20T11:42:00Z'),
    amount: 142500,
    paymentMethod: 'card',
    remittanceStatus: 'remitted',
    firsRemittanceRef: 'NRS-CBN-E-SETTLE-2026-03-998811',
    business: {
      businessName: 'Greenfield Retail & Groceries Ltd',
      ownerName: 'Amina Yusuf',
      merchantId: 'MERCH-00128',
      taxId: '22837194-0001',
      address: 'Shop 4B, Palms Mall, Lekki, Lagos',
    },
    taxReport: {
      taxMonth: new Date('2026-02-01'),
      totalSales: 4500000,
      totalExpenses: 2600000,
      grossProfit: 1900000,
      taxRate: 7.5,
      taxPayable: 142500,
    },
  });
  fs.writeFileSync(path.join(OUT_DIR, '02b_tax_receipt_remitted.pdf'), taxReceiptStage2);

  // 3. DVA TRANSFER RECEIPT (Credit Advice)
  const dvaReceipt = await buildDvaTransferReceiptPdf({
    receiptNumber: 'DVA-CR-20260318-771',
    transactionReference: 'TRX-DVA-991827461',
    transactionDate: new Date('2026-03-18T14:35:10Z'),
    amount: 75000,
    customerName: 'Emeka Okafor Enterprises',
    customerHint: 'Transfer from Access Bank mobile app ref #88127391',
    senderBank: 'Access Bank Plc',
    virtualAccountNumber: '9920194812',
    virtualAccountBank: 'Wema Bank (Paystack DVA)',
    business: {
      businessName: 'Kolawole Auto Spares & Accessories',
      ownerName: 'Kolawole Sanusi',
      merchantId: 'MERCH-KOLA-01',
      taxId: '10928374-0001',
      address: 'Block C, Ladipo Auto Market, Mushin, Lagos State',
    },
  });
  fs.writeFileSync(path.join(OUT_DIR, '03_dva_receipt.pdf'), dvaReceipt);

  // 4. SALES RECEIPT (POS / Itemized Cash Sale)
  const salesReceipt = await buildSalesReceiptPdf({
    receiptNumber: 'REC-2026-POS-10492',
    transactionReference: 'POS-TERM-8812-7481',
    transactionDate: new Date('2026-03-24T16:15:00Z'),
    amount: 68500,
    source: 'pos',
    sourceLabel: 'POS Terminal Sale',
    customerName: 'Mrs. Folake Balogun',
    customerPhone: '+234 802 998 7766',
    customerEmail: 'folake.b@yahoo.com',
    customerAddress: '12 Admiralty Way, Lekki Phase 1',
    description: 'Designer fashion items and accessories purchase',
    items: [
      { name: 'Italian Leather Handbag (Espresso Brown)', quantity: 1, unitPrice: 42000, lineTotal: 42000 },
      { name: 'Silk Scarf with Floral Print (Medium)', quantity: 2, unitPrice: 8500, lineTotal: 17000 },
      { name: 'Gold-Plated Cuff Earrings (Pair)', quantity: 1, unitPrice: 9500, lineTotal: 9500 },
    ],
    subtotal: 68500,
    discount: 0,
    vatRate: 0,
    vatAmount: 0,
    business: {
      businessName: 'Maison de Belleza Boutique',
      ownerName: 'Ngozi Chimamanda',
      merchantId: 'MERCH-MDB-22',
      taxId: '39481029-0001',
      address: 'Suite 2A, Silverbird Galleria, Victoria Island, Lagos',
    },
  });
  fs.writeFileSync(path.join(OUT_DIR, '04_sales_receipt.pdf'), salesReceipt);

  // 5. TAX ASSESSMENT SLIP
  const taxSlip = await buildTaxSlipPdf({
    slipNumber: 'NRS-SLIP-2026-03-00918',
    taxMonth: new Date('2026-03-01'),
    generatedAt: new Date('2026-03-28T09:00:00Z'),
    isFinalized: true,
    isLocked: true,
    paymentStatus: 'completed',
    business: {
      businessName: 'Zinox Cloud Computing & Digital Systems Ltd',
      merchantId: 'MERCH-ZNX-40',
      ownerName: 'Engr. Stanley Uzoma',
      taxId: '04829103-0001',
      address: '10 Saka Tinubu Street, Victoria Island, Lagos State, Nigeria',
      email: 'finance@zinoxcloud.ng',
      phone: '+234 1 270 9988',
    },
    assessment: {
      totalSales: 18500000,
      totalExpenses: 9200000,
      grossProfit: 9300000,
      taxRate: 7.5,
      taxPayable: 697500,
      profitMargin: 50.27,
    },
    payment: {
      paymentReference: 'NRS-CBN-REMIT-9948102948',
      paymentDate: new Date('2026-03-25T14:20:00Z'),
      paymentMethod: 'bank_transfer',
      amountPaid: 697500,
      paymentStatus: 'completed',
    },
  });
  fs.writeFileSync(path.join(OUT_DIR, '05_tax_assessment_slip.pdf'), taxSlip);

  // 6. LEDGER STATEMENT (Multi-page with 32 transactions)
  let currentBalance = 450000;
  const ledgerRows = Array.from({ length: 32 }).map((_, i) => {
    const isCredit = i % 4 !== 3; // mostly credits, occasional tax/payout debit
    const amount = (i + 1) * 35000;
    if (isCredit) {
      currentBalance += amount;
    } else {
      currentBalance -= amount;
    }
    return {
      id: `row-${i + 1}`,
      scope: 'all_income' as const,
      entryType: isCredit ? ('credit' as const) : ('debit' as const),
      sourceType: (isCredit ? (i % 3 === 0 ? 'dva_transfer' : i % 3 === 1 ? 'pos' : 'invoice_payment') : 'tax_payment') as any,
      amount,
      runningBalance: currentBalance,
      classification: isCredit ? 'Commercial Income' : 'Statutory Tax Outflow',
      description: isCredit
        ? (i % 2 === 0 ? `Commercial payment from client invoice #INV-${100 + i}` : `Counter POS retail settlement batch #${200 + i}`)
        : `NRS Monthly Withholding/VAT Remittance #${300 + i}`,
      reference: `TXN-REF-${10000 + i}`,
      date: new Date(2026, 2, (i % 28) + 1).toISOString(),
      status: 'settled' as const,
      counterparty: `Customer ${String.fromCharCode(65 + (i % 26))} Enterprises Ltd`,
      isTaxable: isCredit,
      metadata: null,
    };
  });
  const totalCredits = ledgerRows.filter(r => r.entryType === 'credit').reduce((sum, r) => sum + r.amount, 0);
  const totalDebits = ledgerRows.filter(r => r.entryType === 'debit').reduce((sum, r) => sum + r.amount, 0);

  const ledgerStatement = await buildLedgerStatementPdf({
    business: {
      businessName: 'Pinnacle Mega Supermarket & Pharmacy',
      merchantId: 'MERCH-PINN-88',
      ownerName: 'Chief Emmanuel Nwosu',
      taxId: '55829104-0001',
      address: '22 Toyin Street, Ikeja, Lagos State',
      virtualAccountNumber: '8149182390',
      virtualAccountBank: 'Wema Bank (Paystack DVA)',
    },
    scope: 'all_income',
    periodLabel: 'March 1, 2026 — March 31, 2026',
    summary: {
      openingBalance: 450000,
      totalCredits,
      totalDebits,
      totalTaxDebits: totalDebits,
      totalPayoutDebits: 0,
      totalSplitDebits: 0,
      closingBalance: currentBalance,
    },
    rows: ledgerRows,
    statementRef: 'STM-PINN-202603-904',
  });
  fs.writeFileSync(path.join(OUT_DIR, '06_ledger_statement.pdf'), ledgerStatement);

  // 7. P&L STATEMENT
  const pnlStatement = await buildPnlStatementPdf({
    business: {
      businessName: 'PrimeTech Integrated Engineering Ltd',
      merchantId: 'MERCH-PT-007',
      ownerName: 'Engr. Dapo Alabi',
      taxId: '99283716-0001',
      address: 'Plot 18, Trans-Amadi Industrial Layout, Port Harcourt, Rivers State',
    },
    periodLabel: 'Q1 2026 (January 1 — March 31, 2026)',
    statementRef: 'PNL-PT-2026Q1-01',
    revenue: {
      totalSales: 48500000,
      totalTransactions: 142,
      bySource: [
        { source: 'bank_transfer', label: 'Commercial Bank Transfers', count: 85, amount: 32000000 },
        { source: 'invoice', label: 'Direct Invoice Settlements', count: 42, amount: 14500000 },
        { source: 'pos', label: 'Terminal POS Card Transactions', count: 15, amount: 2000000 },
      ],
    },
    expenses: {
      totalExpenses: 28200000,
      deductibleExpenses: 26400000,
      nonDeductibleExpenses: 1800000,
      totalEntries: 64,
      byCategory: [
        { category: 'supplies', label: 'Raw Materials & Components Procurement', count: 24, amount: 16500000, isDeductible: true },
        { category: 'salaries', label: 'Technical Staff Payroll & Wages', count: 12, amount: 6200000, isDeductible: true },
        { category: 'utilities', label: 'Industrial Power, Gas & Water Utilities', count: 8, amount: 2100000, isDeductible: true },
        { category: 'maintenance', label: 'CNC Machinery & Heavy Equipment Servicing', count: 10, amount: 1600000, isDeductible: true },
        { category: 'entertainment', label: 'Executive Client Entertainment & Gifts', count: 10, amount: 1800000, isDeductible: false },
      ],
    },
    summary: {
      grossProfit: 20300000,
      netProfitAfterTax: 18777500,
      profitMargin: 41.86,
      taxRate: 7.5,
      taxPayable: 1522500,
      reportStatus: 'Paid & Locked',
    },
  });
  fs.writeFileSync(path.join(OUT_DIR, '07_pnl_statement.pdf'), pnlStatement);

  // 8. SALES REPORT
  const salesReport = await buildSalesReportPdf({
    businessName: 'Vanguard Industrial Supplies Nig Ltd',
    merchantId: 'MERCH-VIS-99',
    logoBuffer: null,
    from: '2026-03-01',
    to: '2026-03-31',
    rows: Array.from({ length: 25 }).map((_, i) => ({
      date: new Date(2026, 2, (i % 30) + 1),
      description: `Delivery of Industrial Safety Equipment Batch #${100 + i}`,
      source: i % 2 === 0 ? 'bank_transfer' : 'pos',
      customerName: `Client ${i + 1} Oilfield Services`,
      amount: (i + 1) * 65000,
      status: 'confirmed',
    })),
    totalAmount: 21125000,
    breakdown: {
      bank_transfer: { count: 13, total: 11050000 },
      pos: { count: 12, total: 10075000 },
    },
  });
  fs.writeFileSync(path.join(OUT_DIR, '08_sales_report.pdf'), salesReport);

  // 9. EXPENSE REPORT
  const expenseReport = await buildExpenseReportPdf({
    businessName: 'Vanguard Industrial Supplies Nig Ltd',
    merchantId: 'MERCH-VIS-99',
    logoBuffer: null,
    from: '2026-03-01',
    to: '2026-03-31',
    rows: Array.from({ length: 25 }).map((_, i) => ({
      date: new Date(2026, 2, (i % 30) + 1),
      description: `Operating expense disbursement ref #EXP-${200 + i}`,
      category: i % 3 === 0 ? 'supplies' : i % 3 === 1 ? 'utilities' : 'transport',
      amount: (i + 1) * 22000,
    })),
    totalAmount: 7150000,
    breakdown: {
      supplies: { count: 9, total: 2574000 },
      utilities: { count: 8, total: 2288000 },
      transport: { count: 8, total: 2288000 },
    },
  });
  fs.writeFileSync(path.join(OUT_DIR, '09_expense_report.pdf'), expenseReport);

  console.log('All 9 PDF types generated successfully in', OUT_DIR);
}

main().catch(console.error);
