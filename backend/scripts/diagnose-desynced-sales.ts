import prisma from '../src/lib/prisma';

async function main() {
  const desynced: any[] = await prisma.$queryRaw`
    SELECT st.id, st.business_id as "salesBusinessId", wt.business_id as "walletBusinessId"
    FROM sales_transactions st
    JOIN wallet_transactions wt ON wt.linked_sale_id = st.id
    WHERE st.business_id <> wt.business_id;
  `;
  console.log(`Diagnostic result: Found ${desynced.length} desynced sales transaction(s).`);
  if (desynced.length > 0) {
    console.log(JSON.stringify(desynced, null, 2));
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
