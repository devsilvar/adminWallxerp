/**
 * Standalone read-only diagnostic. Bypasses src/config so .env cannot clobber
 * the connection URL. Pass the URL as the first argument.
 *
 * Usage: npx tsx scripts/diag-prod.ts "postgresql://..." [email-or-name]
 */
import { PrismaClient } from '@prisma/client';

const url = process.argv[2];
const needle = process.argv[3] || 'yusufsilvajs';
if (!url) {
  console.error('Usage: npx tsx scripts/diag-prod.ts "<DATABASE_URL>" [needle]');
  process.exit(1);
}

const prisma = new PrismaClient({ datasources: { db: { url } }, log: ['error'] });

type Row = Record<string, any>;
const n = (v: any) => (v == null ? 0 : Number(v));

async function main() {
  const meta = await prisma.$queryRaw<Row[]>`
    SELECT current_database() AS db,
           pg_postmaster_start_time()::text AS started,
           pg_database_size(current_database()) AS size_bytes,
           (SELECT count(*) FROM users) AS users,
           (SELECT count(*) FROM businesses) AS businesses,
           (SELECT count(*) FROM sales_transactions) AS sales,
           (SELECT count(*) FROM settlement_payouts) AS payouts,
           (SELECT count(*) FROM wallet_transactions) AS wallet_tx`;
  console.log('== TARGET DB ==');
  for (const [k, v] of Object.entries(meta[0])) {
    console.log(`  ${k}: ${v}`);
  }

  const matches = await prisma.$queryRaw<Row[]>`
    SELECT id, email FROM users
    WHERE email ILIKE ${'%' + needle + '%'}
       OR id::text IN (SELECT user_id::text FROM businesses WHERE business_name ILIKE ${'%' + needle + '%'})`;
  if (matches.length === 0) {
    console.log(`\nNo user matched "${needle}"`);
    return;
  }

  for (const u of matches) {
    console.log(`\n========== ${u.email}  (${u.id}) ==========`);

    const biz = await prisma.$queryRaw<Row[]>`
      SELECT b.id, b.business_name FROM businesses b WHERE b.user_id::text = ${u.id}::text`;
    console.log('businesses:', biz.map((b) => `${b.business_name} [${b.id}]`).join(' | '));

    // --- Settlement payouts (all) ---
    const payouts = await prisma.$queryRaw<Row[]>`
      SELECT p.created_at, p.business_id, b.business_name, p.amount, p.fee, p.net_amount,
             p.payment_status, p.is_advance, p.transfer_reference
      FROM settlement_payouts p
      LEFT JOIN businesses b ON b.id = p.business_id
      WHERE p.business_id::text IN (SELECT id::text FROM businesses WHERE user_id::text = ${u.id}::text)
      ORDER BY p.created_at DESC`;
    console.log(`\n-- settlement_payouts (all): ${payouts.length}`);
    for (const p of payouts) {
      console.log(
        `   ${new Date(p.created_at).toISOString()} ${p.business_name} amt=${p.amount} fee=${p.fee} net=${p.net_amount} status=${p.payment_status} isAdvance=${p.is_advance} ref=${p.transfer_reference}`
      );
    }

    // --- Wallet ledger ---
    const ledger = await prisma.$queryRaw<Row[]>`
      SELECT created_at, business_id, type, source, amount, net_amount, reference
      FROM wallet_transactions WHERE user_id::text = ${u.id}::text ORDER BY created_at DESC`;
    console.log(`\n-- wallet_transactions: ${ledger.length}`);
    for (const t of ledger) {
      console.log(
        `   ${new Date(t.created_at).toISOString()} ${t.type}/${t.source} amt=${t.amount} net=${t.net_amount} biz=${t.business_id} ref=${t.reference}`
      );
    }

    // --- Outstanding advance, exactly as WalletService computes it ---
    const credit = await prisma.$queryRaw<Row[]>`
      SELECT COALESCE(SUM(amount),0) AS amount, COALESCE(SUM(net_amount),0) AS net
      FROM wallet_transactions
      WHERE user_id::text = ${u.id}::text AND type = 'advance'
        AND source = 'settlement_advance' AND net_amount > 0`;
    const recovery = await prisma.$queryRaw<Row[]>`
      SELECT COALESCE(SUM(amount),0) AS amount, COALESCE(SUM(net_amount),0) AS net
      FROM wallet_transactions
      WHERE user_id::text = ${u.id}::text AND type = 'advance'
        AND source = 'settlement_advance_recovery' AND net_amount < 0`;
    const grossAdvance = n(credit[0].amount) - n(recovery[0].amount);
    console.log(`\n>> outstanding advance gross = ${grossAdvance}`);

    // --- Pending (unsettled) DVA inflows, as getPayoutPreview computes it ---
    const pending = await prisma.$queryRaw<Row[]>`
      SELECT COUNT(*) AS cnt, COALESCE(SUM(st.amount),0) AS total
      FROM sales_transactions st
      WHERE st.business_id::text IN (SELECT id::text FROM businesses WHERE user_id::text = ${u.id}::text)
        AND st.source = 'bank_transfer' AND st.dva_origin = true
        AND st.status IN ('pending','confirmed','completed')
        AND st.needs_verification = false
        AND NOT EXISTS (SELECT 1 FROM wallet_transactions w WHERE w.linked_sale_id = st.id)`;
    console.log(`-- raw pending settlement: count=${pending[0].cnt} sum=${pending[0].total}`);

    // --- Settled DVA inflows ---
    const settled = await prisma.$queryRaw<Row[]>`
      SELECT COUNT(*) AS cnt, COALESCE(SUM(st.amount),0) AS total
      FROM sales_transactions st
      WHERE st.business_id::text IN (SELECT id::text FROM businesses WHERE user_id::text = ${u.id}::text)
        AND st.source = 'bank_transfer' AND st.dva_origin = true
        AND st.status IN ('pending','confirmed','completed')
        AND EXISTS (SELECT 1 FROM wallet_transactions w WHERE w.linked_sale_id = st.id)`;
    console.log(`-- settled DVA inflows:  count=${settled[0].cnt} sum=${settled[0].total}`);

    const wallet = await prisma.$queryRaw<Row[]>`
      SELECT balance, locked_balance FROM wallet_balances WHERE user_id::text = ${u.id}::text`;
    console.log(`-- wallet balance = ${wallet[0]?.balance ?? 'n/a'}`);

    // --- What the Settlement page WOULD show today ---
    const bizIds = biz.map((b) => b.id);
    const payoutSum = await prisma.$queryRaw<Row[]>`
      SELECT COALESCE(SUM(amount),0) AS total FROM settlement_payouts
      WHERE business_id::text IN (SELECT id::text FROM businesses WHERE user_id::text = ${u.id}::text)
        AND payment_status IN ('completed','pending','processing') AND is_advance = false`;
    console.log(`\n-- totalWithdrawn (non-advance) = ${payoutSum[0].total}`);
    console.log(`-- SETTLEMENT PAGE "in settlement" TODAY  = ${pending[0].total}   <-- raw, un-netted`);
    console.log(`-- SHOULD BE (raw pending - outstanding advance) = ${Math.max(0, n(pending[0].total) - grossAdvance)}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
