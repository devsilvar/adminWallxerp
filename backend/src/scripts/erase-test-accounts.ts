/**
 * One-shot sweep of throwaway test accounts (and everything they own).
 *
 * A "test account" matches a default LIKE pattern:
 *   - ends with @yopmail.com   (e.g. foo@yopmail.com)
 *   - starts with "test"       (e.g. test@example.com, Test123@…, test-…@e2e.com)
 *   - ends with @example.com   (e.g. demo@example.com)
 *   - ends with @e2e.com       (e.g. qa@e2e.com)
 * plus any extra patterns the caller passes — EXCEPT the excluded seed
 * accounts john…@example.com / jane…@example.com, which are never matched.
 *
 * Invoked two ways:
 *   - Startup toggle: ERASE_TEST_ACCOUNTS=true|dry in the environment —
 *     server.ts calls runEraseTestAccounts() once after listen (see
 *     config.cleanup.eraseTestAccounts). 'dry' only logs the report.
 *   - CLI: scripts/erase-test-accounts.ts (dry by default, --apply to delete).
 *
 * Deletion happens in a single transaction: audit_logs are removed explicitly
 * first (their FKs are ON DELETE SET NULL — without this, orphan rows would
 * survive with NULL ids), then the users; everything else (businesses, sales,
 * expenses, invoices, customers, cards, ledgers, sessions, wallets,
 * memberships, invitations, reminders, tax reports/payments/statements,
 * settlements) cascades from users/businesses at the database level.
 * Afterwards every touched table is re-counted and the match query re-run —
 * any leftover reference throws, so a partial cleanup cannot pass silently.
 *
 * Admin accounts ARE deleted when they match (QA admins like
 * admin-qa-…@example.com are throwaways too); only the seed admin
 * admin@paymytax.com is excluded by pattern. The sweep is idempotent:
 * re-running against a clean DB finds nothing.
 */
import logger from '../lib/logger';
import prisma from '../lib/prisma';

export const DEFAULT_ERASE_PATTERNS = [
  '%@yopmail.com',
  'test%',
  '%@example.com',
  '%@e2e.com',
];

// Never deleted, even when a pattern above matches: the seed accounts
// john@example.com / jane@example.com must stay for local dev + tests, as must
// the real seed admin (admin@paymytax.com — reachable if a caller passes a
// broad extra pattern like --like=%@paymytax.com).
export const DEFAULT_ERASE_EXCLUDE_PATTERNS = [
  'john%@example.com',
  'jane%@example.com',
  'admin@paymytax.com',
];

export type EraseMode = 'dry' | 'apply';

interface MatchedUser {
  id: string;
  email: string;
  role: string;
  createdAt: Date;
}

function describeDb(): string {
  try {
    const u = new URL(process.env.DATABASE_URL ?? '');
    return `${u.host}${u.pathname}`;
  } catch {
    return '(DATABASE_URL not set or unparsable)';
  }
}

async function findMatches(
  patterns: string[],
  excludePatterns: string[]
): Promise<MatchedUser[]> {
  const where = patterns.map((_, i) => `lower(email) LIKE $${i + 1}`).join(' OR ');
  const not = excludePatterns
    .map((_, i) => `lower(email) LIKE $${patterns.length + i + 1}`)
    .join(' OR ');
  const sql =
    `SELECT id, email, role, created_at AS "createdAt" FROM users WHERE (${where})` +
    (excludePatterns.length ? ` AND NOT (${not})` : '') +
    ' ORDER BY created_at';
  return prisma.$queryRawUnsafe<MatchedUser[]>(sql, ...patterns.map((p) => p.toLowerCase()), ...excludePatterns.map((p) => p.toLowerCase()));
}

async function tableCounts(userIds: string[], bizIds: string[]) {
  const inU = { in: userIds };
  const inB = { in: bizIds };
  return {
    sales: await prisma.salesTransaction.count({ where: { businessId: inB } }),
    expenses: await prisma.expense.count({ where: { businessId: inB } }),
    invoices: await prisma.invoice.count({ where: { businessId: inB } }),
    taxReports: await prisma.monthlyTaxReport.count({ where: { businessId: inB } }),
    taxPayments: await prisma.taxPayment.count({ where: { businessId: inB } }),
    reminders: await prisma.reminder.count({ where: { businessId: inB } }),
    customers: await prisma.customer.count({ where: { businessId: inB } }),
    customerCards: await prisma.customerCard.count({ where: { businessId: inB } }),
    settlements: await prisma.settlementPayout.count({ where: { businessId: inB } }),
    sessions: await prisma.session.count({ where: { userId: inU } }),
    wallets: await prisma.walletBalance.count({ where: { userId: inU } }),
    walletTx: await prisma.walletTransaction.count({ where: { userId: inU } }),
    memberships: await prisma.businessMember.count({
      where: { OR: [{ userId: inU }, { businessId: inB }] },
    }),
    auditLogs: await prisma.auditLog.count({
      where: { OR: [{ userId: inU }, { businessId: inB }] },
    }),
  };
}

export async function runEraseTestAccounts(
  mode: EraseMode,
  extraPatterns: string[] = []
): Promise<void> {
  const patterns = [...DEFAULT_ERASE_PATTERNS, ...extraPatterns];
  const lines: string[] = [
    `Target database: ${describeDb()}`,
    `Match patterns:  ${patterns.join('  OR  ')}`,
    `Excluded:        ${DEFAULT_ERASE_EXCLUDE_PATTERNS.join('  OR  ')}`,
    `Mode:            ${mode === 'apply' ? 'APPLY (deleting)' : 'DRY RUN (no changes)'}`,
  ];

  const all = await findMatches(patterns, DEFAULT_ERASE_EXCLUDE_PATTERNS);
  if (all.length === 0) {
    lines.push('No matching accounts found. Nothing to do.');
    logger.info(lines.join('\n'));
    return;
  }

  const targets = all;

  const businesses = await prisma.business.findMany({
    where: { userId: { in: targets.map((u) => u.id) } },
    select: { id: true, businessName: true, merchantId: true },
  });
  const bizIds = businesses.map((b) => b.id);
  const userIds = targets.map((u) => u.id);

  lines.push(`Matched ${all.length} account(s): ${targets.length} to delete`);
  for (const u of targets) {
    lines.push(`  - ${u.email}  [${u.id}]  created ${u.createdAt.toISOString().slice(0, 10)}`);
  }
  lines.push(`Owned businesses (${businesses.length}):`);
  for (const b of businesses) {
    lines.push(`  - ${b.businessName}  (${b.merchantId})`);
  }

  const before = await tableCounts(userIds, bizIds);
  lines.push('Rows that would be removed:');
  let total = 0;
  for (const [table, n] of Object.entries(before)) {
    total += n;
    lines.push(`  ${table.padEnd(14)} ${n}`);
  }
  lines.push(`  ${'TOTAL'.padEnd(14)} ${total}`);

  if (mode === 'dry') {
    lines.push('DRY RUN — nothing was deleted.');
    logger.info(lines.join('\n'));
    return;
  }

  const result = await prisma.$transaction(
    async (tx) => {
      const audit = await tx.auditLog.deleteMany({
        where: { OR: [{ userId: { in: userIds } }, { businessId: { in: bizIds } }] },
      });
      const users = await tx.user.deleteMany({ where: { id: { in: userIds } } });
      return { audit: audit.count, users: users.count };
    },
    { maxWait: 15_000, timeout: 120_000 }
  );
  lines.push(
    `Deleted ${result.users} user(s) and ${result.audit} audit log row(s); cascades removed the rest.`
  );

  const after = await tableCounts(userIds, bizIds);
  const leftovers = Object.entries(after).filter(([, n]) => n > 0);
  if (leftovers.length > 0) {
    logger.error(
      ['ERASE_TEST_ACCOUNTS verification FAILED — rows still reference deleted accounts:',
        ...leftovers.map(([table, n]) => `  ${table}: ${n}`)].join('\n')
    );
    throw new Error('erase-test-accounts: cleanup incomplete (leftover rows)');
  }

  const remaining = await findMatches(patterns, DEFAULT_ERASE_EXCLUDE_PATTERNS);
  if (remaining.length > 0) {
    logger.error(
      ['ERASE_TEST_ACCOUNTS verification FAILED — matching accounts still present:',
        ...remaining.map((u) => `  ${u.email} [${u.id}] (${u.role})`)].join('\n')
    );
    throw new Error('erase-test-accounts: cleanup incomplete (accounts remain)');
  }

  lines.push('Verified: 0 rows reference the deleted accounts, 0 matching accounts remain.');
  logger.info(lines.join('\n'));
}
