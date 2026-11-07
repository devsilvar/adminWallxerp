/**
 * Verifies that the settlement preview nets off advances already drawn.
 * Run with JEST_WORKER_ID set so src/config does not overwrite DATABASE_URL from .env.
 *
 * Usage:
 *   DATABASE_URL="postgresql://..." JEST_WORKER_ID=1 npx tsx scripts/verify-advance-netting.ts <email> [businessId]
 */
import prisma from '../src/lib/prisma';
import { getPayoutPreview, getAdvancePreview } from '../src/services/settlement/payout-preview.service';

async function main() {
  const email = process.argv[2] || 'yusufsilvajs@gmail.com';
  const user = await prisma.user.findFirst({
    where: { email: { equals: email, mode: 'insensitive' } },
    select: { id: true, email: true, businesses: { select: { id: true, businessName: true } } },
  });
  if (!user) throw new Error(`No user for ${email}`);

  console.log(`DB host: ${(await prisma.$queryRaw<any[]>`SELECT inet_server_addr()::text AS h`)[0].h}`);
  console.log(`User: ${user.email}`);

  for (const biz of user.businesses) {
    if (process.argv[3] && biz.id !== process.argv[3]) continue;
    const preview = await getPayoutPreview(user.id, biz.id);
    const adv = await getAdvancePreview(user.id, biz.id);

    console.log(`\n--- ${biz.businessName} (${biz.id}) ---`);
    console.log(`  in settlement (shown)      : ${preview.pooledPendingSettlement}`);
    console.log(`  in settlement (gross)      : ${preview.grossPooledPendingSettlement}`);
    console.log(`  outstanding advance        : ${preview.outstandingAdvance}`);
    console.log(`  legacy (bank) advances out : ${preview.legacyAdvanceWithdrawn}`);
    console.log(`  availableForWithdrawal     : ${preview.availableForWithdrawal}`);
    console.log(`  advance preview pending    : ${adv.pooledPendingSettlement}`);
    console.log(`  advance maxAdvance         : ${adv.maxAdvance}`);
    console.log(`  hasOutstandingAdvance      : ${adv.hasOutstandingAdvance}`);
    console.log(
      `  CHECK gross - advance == shown : ${preview.grossPooledPendingSettlement} - ${preview.outstandingAdvance} = ${Math.max(0, preview.grossPooledPendingSettlement - preview.outstandingAdvance)}`
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
