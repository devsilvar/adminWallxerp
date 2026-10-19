/**
 * CLI for the test-account sweep. All logic lives in
 * src/scripts/erase-test-accounts.ts (compiled into dist/ so the same code
 * runs behind the ERASE_TEST_ACCOUNTS startup toggle on Railway).
 *
 * Default sweep: @yopmail.com, @example.com, @e2e.com, and anything starting
 * with "test" — except the seed accounts john@example.com / jane@example.com.
 *
 * Usage:
 *   npx tsx scripts/erase-test-accounts.ts                        # DRY RUN (default)
 *   npx tsx scripts/erase-test-accounts.ts --apply                # delete
 *   npx tsx scripts/erase-test-accounts.ts --like=%sample%,demo%  # extra LIKE patterns
 *   npm run erase-test-accounts -- --apply
 */
import 'dotenv/config';
import prisma from '../src/lib/prisma';
import { runEraseTestAccounts } from '../src/scripts/erase-test-accounts';

function parseArgs(argv: string[]) {
  const apply = argv.includes('--apply');
  const likeArg = argv.find((a) => a.startsWith('--like='));
  const extra = likeArg
    ? likeArg
        .slice('--like='.length)
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean)
    : [];
  return { apply, extra };
}

async function main() {
  const { apply, extra } = parseArgs(process.argv.slice(2));
  await runEraseTestAccounts(apply ? 'apply' : 'dry', extra);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
