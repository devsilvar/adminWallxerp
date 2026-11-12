import bcrypt from 'bcrypt';
import prisma from '../../src/lib/prisma';
import { validateAdminPassword, runCreateAdmin } from '../../scripts/create-admin';
import fs from 'fs';
import path from 'path';

describe('Admin Seed & Script — Hardening Phase 2 (qahunter.md RTM)', () => {
  const TEST_ADMIN_EMAIL = 'richmond@wallx.co';
  const TEST_ADMIN_PASS = 'Innovation@101';

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('Password Policy & Boundary Validation (REQ-ADM-PWD)', () => {
    it('accepts valid passwords meeting complexity requirements [positive]', () => {
      expect(validateAdminPassword('Innovation@101')).toBe(true);
      expect(validateAdminPassword('PlatformAdmin2026#')).toBe(true);
    });

    it('accepts password at exact minimum length of 8 characters [boundary-min]', () => {
      expect(validateAdminPassword('Aa1!bcde')).toBe(true);
      expect(validateAdminPassword('Aa1!bcde').toString()).toBe('true');
    });

    it('rejects password below minimum length (7 chars) [boundary-min-1]', () => {
      expect(validateAdminPassword('Aa1!bcd')).toBe(false);
    });

    it('rejects password missing uppercase letter [negative]', () => {
      expect(validateAdminPassword('innovation@101')).toBe(false);
    });

    it('rejects password missing lowercase letter [negative]', () => {
      expect(validateAdminPassword('INNOVATION@101')).toBe(false);
    });

    it('rejects password missing digit [negative]', () => {
      expect(validateAdminPassword('Innovation@abc')).toBe(false);
    });

    it('rejects empty or whitespace password [negative]', () => {
      expect(validateAdminPassword('')).toBe(false);
      expect(validateAdminPassword('        ')).toBe(false);
    });
  });

  describe('create-admin Script Execution & Idempotency (REQ-ADM-SEED)', () => {
    it('creates or updates richmond@wallx.co as admin with valid hash [positive]', async () => {
      const res1 = await runCreateAdmin(TEST_ADMIN_EMAIL, TEST_ADMIN_PASS);

      expect(res1.user).toBeDefined();
      expect(res1.user.email).toBe(TEST_ADMIN_EMAIL);
      expect(res1.user.role).toBe('admin');
      expect(res1.user.isVerified).toBe(true);
      expect(res1.user.isActive).toBe(true);

      // Verify bcrypt hash matches the password
      const isMatch = await bcrypt.compare(TEST_ADMIN_PASS, res1.user.passwordHash);
      expect(isMatch).toBe(true);

      // Verify DB record directly
      const dbUser = await prisma.user.findUnique({ where: { email: TEST_ADMIN_EMAIL } });
      expect(dbUser).not.toBeNull();
      expect(dbUser?.role).toBe('admin');
    });

    it('is idempotent: second execution updates existing admin without creating duplicates [idempotency]', async () => {
      const res2 = await runCreateAdmin(TEST_ADMIN_EMAIL, TEST_ADMIN_PASS);

      expect(res2.existing).toBe(true);
      expect(res2.message).toContain('Updated admin');

      // Ensure count of richmond@wallx.co is exactly 1
      const count = await prisma.user.count({ where: { email: TEST_ADMIN_EMAIL } });
      expect(count).toBe(1);
    });

    it('throws error when required email or password arguments are missing [negative]', async () => {
      await expect(runCreateAdmin('', 'Innovation@101')).rejects.toThrow(/Provide --email and --password/);
      await expect(runCreateAdmin(TEST_ADMIN_EMAIL, '')).rejects.toThrow(/Provide --email and --password/);
    });

    it('throws error when password does not meet complexity rules [negative]', async () => {
      await expect(runCreateAdmin('badadmin@wallx.co', 'weak123')).rejects.toThrow(/Password must be 8-128 chars/);
    });
  });

  describe('seed.ts Integration Verification', () => {
    it('verifies backend/prisma/seed.ts contains richmond@wallx.co configuration', () => {
      const seedFile = fs.readFileSync(path.join(__dirname, '../../prisma/seed.ts'), 'utf8');
      expect(seedFile).toContain("email: 'richmond@wallx.co'");
      expect(seedFile).toContain("passwordHash: await hashPassword('Innovation@101')");
      expect(seedFile).toContain("Admin: richmond@wallx.co / Innovation@101");
    });
  });
});
