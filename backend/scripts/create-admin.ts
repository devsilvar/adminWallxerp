/**
 * Create or update a single platform admin.
 *
 * Usage:
 *   npx tsx scripts/create-admin.ts --email richmond@wallx.co --password 'Innovation@101'
 *
 * Against production:
 *   railway run npx tsx scripts/create-admin.ts --email ... --password ...
 */
import 'dotenv/config';
import bcrypt from 'bcrypt';
import prisma from '../src/lib/prisma';

const BCRYPT_ROUNDS = 10;

export function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

export function validateAdminPassword(password: string): boolean {
  return /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,128}$/.test(password);
}

export async function runCreateAdmin(
  customEmail?: string,
  customPassword?: string,
  db = prisma,
) {
  const email = (customEmail ?? arg('email') ?? process.env.ADMIN_EMAIL ?? '').toLowerCase().trim();
  const password = customPassword ?? arg('password') ?? process.env.ADMIN_PASSWORD ?? '';

  if (!email || !password) {
    throw new Error('Provide --email and --password (or ADMIN_EMAIL / ADMIN_PASSWORD).');
  }
  if (!validateAdminPassword(password)) {
    throw new Error('Password must be 8-128 chars with an uppercase letter, a lowercase letter and a number.');
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  const existing = await db.user.findUnique({ where: { email } });

  const user = await db.user.upsert({
    where: { email },
    update: { role: 'admin', isVerified: true, isActive: true, passwordHash },
    create: { email, passwordHash, role: 'admin', isVerified: true, isActive: true },
  });

  if (!existing) {
    await db.auditLog.create({
      data: {
        action: 'admin.created',
        resourceType: 'user',
        resourceId: user.id,
        newData: { email, source: 'script' },
      },
    });
  }

  const message = `${existing ? 'Updated' : 'Created'} admin: ${user.email} (role=${user.role})`;
  console.log(message);
  return { user, existing: !!existing, message };
}

async function main() {
  await runCreateAdmin();
}

if (process.env.NODE_ENV !== 'test' && require.main === module) {
  main()
    .catch((err) => {
      console.error(err instanceof Error ? err.message : err);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
