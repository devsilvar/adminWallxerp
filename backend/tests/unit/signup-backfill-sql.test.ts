import fs from 'fs';
import path from 'path';

describe('Phase 6: Backfill User Full Name Migration SQL', () => {
  const migrationPath = path.resolve(
    __dirname,
    '../../prisma/migrations/20261111180000_backfill_user_full_name/migration.sql',
  );

  it('migration file exists and is readable', () => {
    expect(fs.existsSync(migrationPath)).toBe(true);
  });

  it('contains the correct idempotent backfill SQL query', () => {
    const sql = fs.readFileSync(migrationPath, 'utf8');

    // Asserts required query parts:
    expect(sql).toContain('WITH candidate AS');
    expect(sql).toContain('SELECT DISTINCT ON (b.user_id)');
    expect(sql).toContain('btrim(b.owner_name) AS owner_name');
    expect(sql).toContain('FROM businesses b');
    expect(sql).toContain('JOIN users u ON u.id = b.user_id');

    // Asserts scopes: only blank or NULL names are targeted
    expect(sql).toContain("(u.full_name IS NULL OR btrim(u.full_name) = '')");
    expect(sql).toContain("btrim(b.owner_name) <> ''");

    // Asserts deterministic precedence: primary business first, then earliest created
    expect(sql).toContain('(b.id = u.primary_business_id) DESC');
    expect(sql).toContain('b.created_at ASC');

    // Asserts update target and idempotency guard
    expect(sql).toContain('UPDATE users u');
    expect(sql).toContain('SET full_name = c.owner_name');
    expect(sql).toContain('WHERE u.id = c.user_id');
  });

  it('contains no DDL or destructive statements (pure data migration)', () => {
    const sql = fs.readFileSync(migrationPath, 'utf8');
    expect(sql).not.toMatch(/\bDROP\b/i);
    expect(sql).not.toMatch(/\bALTER\b/i);
    expect(sql).not.toMatch(/\bTRUNCATE\b/i);
    expect(sql).not.toMatch(/\bDELETE\b/i);
  });
});
