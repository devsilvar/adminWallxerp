import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🔍 Checking MarketplaceProduct table...\n');

  // Count all products
  const total = await prisma.marketplaceProduct.count();
  console.log(`Total products in DB: ${total}`);

  // Count by status
  const byStatus = await prisma.marketplaceProduct.groupBy({
    by: ['status'],
    _count: true,
  });
  console.log('\nProducts by status:');
  byStatus.forEach((s) => {
    console.log(`  ${s.status}: ${s._count}`);
  });

  // List all products with details
  const products = await prisma.marketplaceProduct.findMany({
    select: {
      id: true,
      name: true,
      slug: true,
      status: true,
      price: true,
      category: true,
      approvedAt: true,
      createdAt: true,
      business: {
        select: {
          businessName: true,
          state: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  console.log(`\n📦 All products (${products.length}):\n`);
  products.forEach((p, i) => {
    console.log(`${i + 1}. ${p.name} (${p.slug})`);
    console.log(`   Status: ${p.status}`);
    console.log(`   Price: ₦${p.price}`);
    console.log(`   Category: ${p.category}`);
    console.log(`   Business: ${p.business.businessName} (${p.business.state})`);
    console.log(`   Approved: ${p.approvedAt ? p.approvedAt.toISOString() : 'NO'}`);
    console.log(`   Created: ${p.createdAt.toISOString()}`);
    console.log('');
  });

  // Check what the API query would return
  console.log('🔎 Testing API query (status: approved)...\n');
  const approvedProducts = await prisma.marketplaceProduct.findMany({
    where: {
      status: 'approved',
    },
    select: {
      id: true,
      name: true,
      slug: true,
      price: true,
    },
  });
  console.log(`API would return: ${approvedProducts.length} products`);
  approvedProducts.forEach((p) => {
    console.log(`  - ${p.name} (₦${p.price})`);
  });
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
