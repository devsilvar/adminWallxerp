/**
 * Unit Tests: Permission Merging, Resolution & Implication Rules (PERM-08)
 *
 * Verifies the canonical permission resolution logic:
 * - Role defaults matrix
 * - Per-member override application
 * - Write-implies-read enforcement (WRITE_IMPLIES_READ)
 * - FINANCIAL_OWNER_ONLY lockout for non-owners
 * - Sanitization of non-boolean / unknown override keys
 * - Perfect synchronization between hasPermission and resolvePermissions
 *
 * Runs without a database connection.
 * Execute: npm run test:unit
 */

import {
  ALL_PERMISSIONS,
  FINANCIAL_OWNER_ONLY,
  OVERRIDABLE_PERMISSIONS,
  ROLE_DEFAULTS,
  WRITE_IMPLIES_READ,
  resolvePermissions,
  hasPermission,
  type PermissionKey,
} from '../../src/services/team/permission.service';

describe('Permission Merge & Resolution Unit Tests (PERM-08)', () => {
  describe('Canonical Matrix Constants', () => {
    it('defines exactly 32 canonical permissions', () => {
      expect(ALL_PERMISSIONS.length).toBe(32);
      expect(new Set(ALL_PERMISSIONS).size).toBe(32);
    });

    it('locks exactly 4 financial owner-only permissions', () => {
      expect(FINANCIAL_OWNER_ONLY.size).toBe(4);
      expect(FINANCIAL_OWNER_ONLY.has('tax.pay')).toBe(true);
      expect(FINANCIAL_OWNER_ONLY.has('wallet.withdraw')).toBe(true);
      expect(FINANCIAL_OWNER_ONLY.has('business.delete')).toBe(true);
      expect(FINANCIAL_OWNER_ONLY.has('settings.update')).toBe(true);
    });

    it('has 28 overridable permissions', () => {
      expect(OVERRIDABLE_PERMISSIONS.length).toBe(28);
      for (const p of OVERRIDABLE_PERMISSIONS) {
        expect(FINANCIAL_OWNER_ONLY.has(p)).toBe(false);
      }
    });

    it('defines write-implies-read pairings for key operational actions', () => {
      expect(WRITE_IMPLIES_READ['sales.create']).toBe('sales.read');
      expect(WRITE_IMPLIES_READ['sales.update']).toBe('sales.read');
      expect(WRITE_IMPLIES_READ['sales.delete']).toBe('sales.read');
      expect(WRITE_IMPLIES_READ['sales.import']).toBe('sales.read');
      expect(WRITE_IMPLIES_READ['expenses.create']).toBe('expenses.read');
      expect(WRITE_IMPLIES_READ['expenses.update']).toBe('expenses.read');
      expect(WRITE_IMPLIES_READ['expenses.delete']).toBe('expenses.read');
      expect(WRITE_IMPLIES_READ['invoices.create']).toBe('invoices.read');
      expect(WRITE_IMPLIES_READ['invoices.send']).toBe('invoices.read');
      expect(WRITE_IMPLIES_READ['invoices.mark_paid']).toBe('invoices.read');
      expect(WRITE_IMPLIES_READ['debtors.manage']).toBe('debtors.read');
      expect(WRITE_IMPLIES_READ['tax.calculate']).toBe('tax.read');
      expect(WRITE_IMPLIES_READ['tax.finalize']).toBe('tax.read');
    });
  });

  describe('resolvePermissions without overrides (Defaults)', () => {
    it('owner role receives all 30 permissions as true', () => {
      const perms = resolvePermissions('owner');
      for (const key of ALL_PERMISSIONS) {
        expect(perms[key]).toBe(true);
      }
    });

    it('sales_staff defaults to sales.create: true, expenses.read: false, expenses.create: false', () => {
      const perms = resolvePermissions('sales_staff');
      expect(perms['sales.create']).toBe(true);
      expect(perms['sales.read']).toBe(true);
      expect(perms['expenses.read']).toBe(false);
      expect(perms['expenses.create']).toBe(false);
      expect(perms['tax.finalize']).toBe(false);
      expect(perms['tax.pay']).toBe(false);
      expect(perms['wallet.withdraw']).toBe(false);
    });

    it('accountant defaults to expenses.read: true, sales.create: false, tax.finalize: false', () => {
      const perms = resolvePermissions('accountant');
      expect(perms['expenses.read']).toBe(true);
      expect(perms['expenses.create']).toBe(true);
      expect(perms['sales.create']).toBe(false);
      expect(perms['tax.calculate']).toBe(true);
      expect(perms['tax.finalize']).toBe(false);
      expect(perms['tax.pay']).toBe(false);
    });

    it('viewer defaults to read-only permissions and all mutations false', () => {
      const perms = resolvePermissions('viewer');
      expect(perms['sales.read']).toBe(true);
      expect(perms['expenses.read']).toBe(true);
      expect(perms['invoices.read']).toBe(true);
      expect(perms['dashboard.read']).toBe(true);
      expect(perms['sales.create']).toBe(false);
      expect(perms['expenses.create']).toBe(false);
      expect(perms['tax.calculate']).toBe(false);
      expect(perms['tax.pay']).toBe(false);
      expect(perms['ai.use']).toBe(false);
    });
  });

  describe('resolvePermissions with overrides', () => {
    it('applies explicit boolean overrides on overridable keys', () => {
      const perms = resolvePermissions('sales_staff', {
        'expenses.read': true,
      });
      expect(perms['expenses.read']).toBe(true);
      // Other defaults remain untouched
      expect(perms['expenses.create']).toBe(false);
      expect(perms['sales.create']).toBe(true);
    });

    it('enforces WRITE_IMPLIES_READ: granting write implies sibling read', () => {
      // sales_staff granted expenses.create without explicit expenses.read
      const perms = resolvePermissions('sales_staff', {
        'expenses.create': true,
      });
      expect(perms['expenses.create']).toBe(true);
      expect(perms['expenses.read']).toBe(true);
    });

    it('enforces WRITE_IMPLIES_READ even if override explicitly attempts to set read to false', () => {
      // If someone attempts contradictory override { 'expenses.create': true, 'expenses.read': false }
      // write-implies-read guarantees the caller cannot create without read visibility
      const perms = resolvePermissions('sales_staff', {
        'expenses.create': true,
        'expenses.read': false,
      });
      expect(perms['expenses.create']).toBe(true);
      expect(perms['expenses.read']).toBe(true);
    });

    it('locks FINANCIAL_OWNER_ONLY: non-owners cannot receive financial owner permissions', () => {
      const perms = resolvePermissions('manager', {
        'tax.pay': true,
        'wallet.withdraw': true,
        'business.delete': true,
        'settings.update': true,
      } as any);

      expect(perms['tax.pay']).toBe(false);
      expect(perms['wallet.withdraw']).toBe(false);
      expect(perms['business.delete']).toBe(false);
      expect(perms['settings.update']).toBe(false);
    });

    it('ignores unknown permission keys and non-boolean values in overrides', () => {
      const perms = resolvePermissions('viewer', {
        'nonexistent.key': true,
        'sales.create': 'true' as any,
        'expenses.create': null as any,
        'tax.calculate': true,
      } as any);

      expect((perms as any)['nonexistent.key']).toBeUndefined();
      expect(perms['sales.create']).toBe(false); // default for viewer
      expect(perms['expenses.create']).toBe(false); // default for viewer
      expect(perms['tax.calculate']).toBe(true); // valid override
      expect(perms['tax.read']).toBe(true); // implied by tax.calculate
    });

    it('owner is completely immune to overrides (always returns 100% true)', () => {
      const perms = resolvePermissions('owner', {
        'sales.create': false,
        'expenses.read': false,
        'tax.pay': false,
      });
      for (const key of ALL_PERMISSIONS) {
        expect(perms[key]).toBe(true);
      }
    });
  });

  describe('hasPermission parity with resolvePermissions', () => {
    it('always matches resolvePermissions output across roles and overrides', () => {
      const testCases: Array<{ role: any; overrides: any; check: PermissionKey }> = [
        { role: 'sales_staff', overrides: null, check: 'sales.create' },
        { role: 'sales_staff', overrides: null, check: 'expenses.read' },
        { role: 'sales_staff', overrides: { 'expenses.create': true }, check: 'expenses.read' },
        { role: 'sales_staff', overrides: { 'expenses.read': true }, check: 'expenses.read' },
        { role: 'manager', overrides: { 'tax.pay': true }, check: 'tax.pay' },
        { role: 'viewer', overrides: { 'invoices.create': true }, check: 'invoices.read' },
        { role: 'owner', overrides: { 'tax.pay': false }, check: 'tax.pay' },
      ];

      for (const tc of testCases) {
        const direct = hasPermission(tc.role, tc.overrides, tc.check);
        const resolved = resolvePermissions(tc.role, tc.overrides)[tc.check];
        expect(direct).toBe(resolved);
      }
    });
  });
});
