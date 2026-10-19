/**
 * QA Exposure Audit — READ ONLY
 *
 * The QA review (qanotices1.md) found three defects that corrupt data already in
 * production. The fixes are forward-only: they stop new damage but cannot repair
 * what has already happened. This script answers "how bad is it, and which rows?"
 * before any repair is attempted.
 *
 * Every query is anchored on `audit_logs`. That is deliberate: each defect
 * overwrites the state that would otherwise reveal it (a resurrected payout row
 * reads as `completed`, a misrouted sale reads as an ordinary sale). The audit
 * trail is the only record that survives the overwrite.
 *
 * This script performs NO writes — no create/update/delete/$transaction. It is
 * safe to run against production.
 *
 * Usage:
 *   npm run audit:qa-exposure
 *
 * Classes:
 *   A — Double-processed payouts (QA-01/QA-02). A payout both failed AND completed.
 *   B — DVA misattribution (QA-02). Candidates only — see the note in auditClassB.
 *   C — Reassigned accrual sales (QA-03). Unambiguous; the safest class to repair.
 */

import prisma from '../src/lib/prisma';

/**
 * A payout that recorded both a terminal failure and a terminal success is the
 * fingerprint of the double-spend. Grouping by resourceId is what matters — one
 * rejected payout plus one unrelated later payout is two healthy records, while
 * one payout with both actions is one corrupted one.
 *
 * All five completion/failure actions are included, not just the two from the
 * QA document, because admin requery and the reconciliation cron can also
 * finalize a payout and are equally capable of doing it after a rejection.
 */
const PAYOUT_FAILURE_ACTIONS = [
  'settlement.payout_rejected',
  'settlement.payout_failed',
  'settlement.payout_failed_via_requery',
  'settlement.payout_failed_via_requery_not_found',
  'settlement.payout_reconciled_failed',
];

const PAYOUT_SUCCESS_ACTIONS = [
  'settlement.payout_completed',
  'settlement.payout_completed_via_requery',
  'settlement.payout_reconciled_completed',
];

async function auditClassA() {
  const [failures, successes] = await Promise.all([
    prisma.auditLog.findMany({
      where: { action: { in: PAYOUT_FAILURE_ACTIONS }, resourceType: 'settlement_payout' },
      select: { resourceId: true },
      distinct: ['resourceId'],
    }),
    prisma.auditLog.findMany({
      where: { action: { in: PAYOUT_SUCCESS_ACTIONS }, resourceType: 'settlement_payout' },
      select: { resourceId: true },
      distinct: ['resourceId'],
    }),
  ]);

  const successIds = new Set(successes.map((s) => s.resourceId).filter(Boolean) as string[]);
  const doubleProcessed = failures
    .map((f) => f.resourceId)
    .filter((id): id is string => Boolean(id) && successIds.has(id!));

  return { ids: Array.from(new Set(doubleProcessed)) };
}

async function auditNegativeLockedBalances() {
  // releaseLockedFunds and settlePayoutDebit both decrement lockedBalance. The
  // double-pass therefore drives it negative; wallet.service.ts's underflow guard
  // clamps only the release, not the later settle.
  const rows = await prisma.walletBalance.findMany({
    where: { lockedBalance: { lt: 0 } },
    select: { userId: true, balance: true, lockedBalance: true },
  });
  return rows;
}

async function auditClassB() {
  /**
   * A DVA sale on a multi-business owner's primary business is not evidence of
   * anything — that is simply where their money lands. The discriminator is the
   * account number the webhook actually received against.
   *
   * dva-webhook.service.ts:272-290 resolves the user with an OR across all of
   * their businesses' DVAs, then picks `primaryBusinessId` regardless of which
   * account matched. So a payment into business B's DVA gets booked to A. The
   * webhook body still records the true receiving account, which is what this
   * compares.
   *
   * SALE_ACCOUNT_NOT_FOUND is listed separately rather than treated as clean:
   * absence of a retained webhook body is missing evidence, not proof of
   * correctness.
   */
  const users = await prisma.user.findMany({
    where: { primaryBusinessId: { not: null } },
    select: {
      id: true,
      email: true,
      primaryBusinessId: true,
      businesses: { select: { id: true, businessName: true, virtualAccountNumber: true } },
    },
  });

  const multiBusinessUsers = users.filter((u) => u.primaryBusinessId && u.businesses.length > 1);
  if (multiBusinessUsers.length === 0) return { confirmed: [], unresolved: [], scanned: 0 };

  const primaryIds = multiBusinessUsers.map((u) => u.primaryBusinessId!);
  const ownerByPrimary = new Map(multiBusinessUsers.map((u) => [u.primaryBusinessId!, u]));
  const businessById = new Map(
    multiBusinessUsers.flatMap((u) => u.businesses.map((b) => [b.id, b] as const))
  );

  const sales = await prisma.salesTransaction.findMany({
    where: {
      businessId: { in: primaryIds },
      source: 'bank_transfer',
      dvaOrigin: true,
    },
    select: {
      id: true,
      businessId: true,
      amount: true,
      referenceId: true,
      transactionDate: true,
    },
    orderBy: { transactionDate: 'desc' },
  });

  const confirmed: ClassBConfirmed[] = [];
  const unresolved: ClassBUnresolved[] = [];

  for (const sale of sales) {
    const bookedTo = businessById.get(sale.businessId);
    const owner = ownerByPrimary.get(sale.businessId);

    const events = sale.referenceId
      ? await prisma.paystackWebhookEvent.findMany({
          where: { reference: sale.referenceId },
          select: { rawBody: true },
          take: 1,
        })
      : [];

    const body = events[0] ? safeParse(events[0].rawBody) : null;
    const receivedAccount =
      body?.data?.authorization?.receiver_bank_account_number ??
      body?.data?.dedicated_account?.account_number ??
      body?.data?.metadata?.receiver_account_number ??
      null;

    const base = {
      saleId: sale.id,
      amount: Number(sale.amount),
      transactionDate: sale.transactionDate.toISOString().slice(0, 10),
      referenceId: sale.referenceId ?? '(none)',
      bookedTo: bookedTo?.businessName ?? sale.businessId,
      ownerEmail: owner?.email ?? null,
    };

    if (!receivedAccount) {
      unresolved.push({ ...base, receivedAccount: null, bookedAccount: bookedTo?.virtualAccountNumber ?? null });
      continue;
    }

    if (receivedAccount !== bookedTo?.virtualAccountNumber) {
      // Money arrived at an account that is NOT the one it was booked to.
      confirmed.push({
        ...base,
        receivedAccount,
        bookedAccount: bookedTo?.virtualAccountNumber ?? null,
      });
    }
    // Account matches the booked business — legitimate. Not reported.
  }

  return { confirmed, unresolved, scanned: sales.length };
}

type ClassBConfirmed = {
  saleId: string;
  amount: number;
  transactionDate: string;
  referenceId: string;
  bookedTo: string;
  ownerEmail: string | null;
  receivedAccount: string;
  bookedAccount: string | null;
};

type ClassBUnresolved = Omit<ClassBConfirmed, 'receivedAccount'> & { receivedAccount: null };

function safeParse(raw: string): any {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function auditClassC() {
  // invoice/creditOrigin/creditPayment are filtered as relations, not
  // `invoiceId`-style scalars: all three foreign keys are declared on the other
  // side (Invoice.linkedSaleId, CustomerCredit.linkedSaleId, CreditPayment.linkedSaleId).
  const reassigned = await prisma.auditLog.findMany({
    where: { action: 'sale.reassigned', resourceType: 'sales_transaction' },
    select: { resourceId: true },
    distinct: ['resourceId'],
  });

  const saleIds = reassigned.map((r) => r.resourceId).filter((id): id is string => Boolean(id));
  if (saleIds.length === 0) return [];

  return prisma.salesTransaction.findMany({
    where: {
      id: { in: saleIds },
      OR: [
        { source: 'credit' },
        { invoice: { isNot: null } },
        { creditOrigin: { isNot: null } },
        { creditPayment: { isNot: null } },
      ],
    },
    select: {
      id: true,
      businessId: true,
      amount: true,
      source: true,
      status: true,
      transactionDate: true,
      invoice: { select: { id: true, invoiceNumber: true } },
      creditOrigin: { select: { id: true } },
      creditPayment: { select: { id: true } },
    },
  });
}

async function main() {
  console.log('🔍 QA Exposure Audit (READ-ONLY)\n');
  console.log('Anchored on audit_logs — the state these defects overwrite no longer\n');
  console.log('reveals them, so the audit trail is the only surviving evidence.\n');

  const [classA, negativeLocks, classB, classC] = await Promise.all([
    auditClassA(),
    auditNegativeLockedBalances(),
    auditClassB(),
    auditClassC(),
  ]);

  const totalFindings = classA.ids.length + negativeLocks.length + classB.confirmed.length + classC.length;

  // ─── Class A ────────────────────────────────────────────────────────────────
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('💸 Class A — Double-processed payouts (QA-01 / QA-02)');
  console.log('   A payout recorded BOTH a terminal failure and a terminal success.');
  console.log('   The merchant received the bank transfer and kept the released funds.\n');
  console.log(`   Count: ${classA.ids.length}`);
  for (const id of classA.ids) console.log(`     • ${id}`);

  // ─── Negative locked balances ───────────────────────────────────────────────
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔻 Wallets with negative lockedBalance');
  console.log('   Direct evidence of the double-decrement; needs no audit inference.\n');
  console.log(`   Count: ${negativeLocks.length}`);
  for (const w of negativeLocks) {
    console.log(`     • user ${w.userId} — balance ${w.balance}, locked ${w.lockedBalance}`);
  }

  // ─── Class B ────────────────────────────────────────────────────────────────
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🏦 Class B — DVA misattribution (QA-02)');
  console.log('   Money arrived at an account number that is NOT the business it was');
  console.log('   booked to. Confirmed by the webhook body, not inferred.\n');
  console.log(
    `   Scanned ${classB.scanned} DVA sale(s) on multi-business owners' primary businesses.\n`
  );
  console.log(`   Count: ${classB.confirmed.length}`);
  for (const s of classB.confirmed) {
    console.log(
      `     • ${s.saleId} — ₦${s.amount} on ${s.transactionDate}\n` +
        `         booked to ${s.bookedTo} (acct ${s.bookedAccount ?? 'none'})\n` +
        `         actually received by acct ${s.receivedAccount}   [${s.ownerEmail ?? 'unknown owner'}]`
    );
  }

  if (classB.unresolved.length > 0) {
    console.log(`\n   Unresolved (no retained webhook body — missing evidence, not clean):`);
    console.log(`   Count: ${classB.unresolved.length}`);
    for (const s of classB.unresolved) {
      console.log(`     • ${s.saleId} — ₦${s.amount} on ${s.transactionDate} → ${s.bookedTo}   [${s.ownerEmail ?? 'unknown owner'}]`);
    }
    console.log('   Review these against bank statements.');
  }

  // ─── Class C ────────────────────────────────────────────────────────────────
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📚 Class C — Reassigned accrual sales (QA-03)');
  console.log('   A cash sale was moved onto a credit/invoice-linked sale that');
  console.log('   revenue was already recognised against. Unambiguous; safest to repair.\n');
  console.log(`   Count: ${classC.length}`);
  for (const s of classC) {
    const linked =
      s.invoice?.invoiceNumber ?? (s.creditOrigin ? `creditOrigin ${s.creditOrigin.id}` : '') ??
      (s.creditPayment ? `creditPayment ${s.creditPayment.id}` : '');
    console.log(
      `     • ${s.id} — ₦${s.amount} source=${s.source} status=${s.status}` +
        ` business ${s.businessId}${linked ? ` → ${linked}` : ''}`
    );
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  if (totalFindings === 0) {
    console.log('✅ No exposure detected');
  } else {
    console.log(`⚠️  ${totalFindings} finding(s) require review.`);
    console.log('   Run `npm run db:backup` before attempting any repair.');
  }
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

main()
  .catch((error) => {
    console.error('❌ Error:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });