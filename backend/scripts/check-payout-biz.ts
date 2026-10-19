import prisma from '../src/lib/prisma';

async function main() {
  const b = await prisma.business.findFirst({
    where: { businessName: 'Payout Test Business' },
    select: {
      id: true,
      businessName: true,
      settlementAccountNumber: true,
      settlementBankCode: true,
      user: {
        select: {
          id: true,
          settlementAccountNumber: true,
          settlementBankCode: true,
        },
      },
    },
  });
  console.log('Result:', JSON.stringify(b, null, 2));
  await prisma.$disconnect();
}

main();
