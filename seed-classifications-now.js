// Run: node seed-classifications-now.js
// This seeds the transaction classifications table

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const classifications = [
  { name: 'Product Sale', category: 'revenue', taxTreatment: 'taxable', isRevenue: true, description: 'Sale of physical or digital products' },
  { name: 'Service Revenue', category: 'revenue', taxTreatment: 'taxable', isRevenue: true, description: 'Income from services provided' },
  { name: 'Commission Income', category: 'revenue', taxTreatment: 'taxable', isRevenue: true, description: 'Commission earned from sales or referrals' },
  { name: 'Rental Income', category: 'revenue', taxTreatment: 'taxable', isRevenue: true, description: 'Income from renting assets or property' },
  { name: 'Capital Injection', category: 'capital', taxTreatment: 'non_taxable', isRevenue: false, description: 'Investment or capital from shareholders' },
  { name: 'Owner Contribution', category: 'capital', taxTreatment: 'non_taxable', isRevenue: false, description: 'Personal funds added by business owner' },
  { name: 'Shareholder Contribution', category: 'capital', taxTreatment: 'non_taxable', isRevenue: false, description: 'Capital contribution from shareholders' },
  { name: 'Business Loan Received', category: 'loan', taxTreatment: 'non_taxable', isRevenue: false, description: 'Loan received for business operations' },
  { name: 'Director Loan', category: 'loan', taxTreatment: 'non_taxable', isRevenue: false, description: 'Loan from company director' },
  { name: 'Bank Loan', category: 'loan', taxTreatment: 'non_taxable', isRevenue: false, description: 'Loan from financial institution' },
  { name: 'Transfer Between Own Accounts', category: 'transfer', taxTreatment: 'non_taxable', isRevenue: false, description: 'Internal transfer between business accounts' },
  { name: 'Wallet Funding', category: 'transfer', taxTreatment: 'non_taxable', isRevenue: false, description: 'Funding virtual wallet from own account' },
  { name: 'Refund Received', category: 'refund', taxTreatment: 'non_taxable', isRevenue: false, description: 'Refund from supplier or vendor' },
  { name: 'Customer Deposit', category: 'refund', taxTreatment: 'review_required', isRevenue: false, description: 'Advance payment or deposit from customer' },
  { name: 'Chargeback Reversal', category: 'refund', taxTreatment: 'non_taxable', isRevenue: false, description: 'Reversal of previous chargeback' },
  { name: 'Grant Received', category: 'grant', taxTreatment: 'review_required', isRevenue: false, description: 'Government or institutional grant' },
  { name: 'Gift Received', category: 'gift', taxTreatment: 'review_required', isRevenue: false, description: 'Non-repayable gift or donation' },
  { name: 'Tax Refund', category: 'tax_refund', taxTreatment: 'non_taxable', isRevenue: false, description: 'Refund from tax authority' },
  { name: 'VAT Refund', category: 'tax_refund', taxTreatment: 'non_taxable', isRevenue: false, description: 'Value Added Tax refund' },
  { name: 'Insurance Claim', category: 'insurance', taxTreatment: 'review_required', isRevenue: false, description: 'Payment from insurance company' },
  { name: 'Asset Sale Proceeds', category: 'asset_sale', taxTreatment: 'review_required', isRevenue: false, description: 'Money from selling business asset' },
  { name: 'Other Income', category: 'other', taxTreatment: 'review_required', isRevenue: false, description: 'Unclassified or miscellaneous income' },
];

async function main() {
  console.log('🌱 Seeding transaction classifications...\n');
  
  let created = 0;
  let updated = 0;

  for (const c of classifications) {
    try {
      const result = await prisma.transactionClassification.upsert({
        where: { name: c.name },
        update: c,
        create: c,
      });
      
      if (result) {
        const existing = await prisma.transactionClassification.count({ where: { name: c.name } });
        if (existing > 1) updated++; else created++;
        console.log(`✓ ${c.name}`);
      }
    } catch (err) {
      console.error(`✗ Failed to seed ${c.name}:`, err.message);
    }
  }

  const total = await prisma.transactionClassification.count();
  console.log(`\n✅ Done! ${total} classifications in database`);
  console.log(`   ${created} created, ${updated} updated`);
}

main()
  .catch(e => {
    console.error('❌ Error:', e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
