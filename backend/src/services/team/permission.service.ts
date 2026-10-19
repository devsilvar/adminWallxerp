/**
 * Team Permission Service
 *
 * Defines the canonical permission matrix (30 keys × 5 roles) and provides
 * resolution logic for role defaults + per-member overrides.
 *
 * @author WallX Engineering Team
 */

import type { BusinessRole } from '@prisma/client';
import { getPlanLimits } from '@/config/subscription-plans';

// ─── Constants ──────────────────────────────────────────────

/** Maximum non-owner active members + pending unexpired invitations per business (fallback default) */
export const TEAM_MEMBER_CAP = 3;

/**
 * Resolves the team member cap dynamically based on the business owner's subscription tier.
 * Returns -1 for unlimited (Scale-Up plan).
 */
export function getTeamCapForTier(tier?: string | null): number {
  return getPlanLimits(tier).maxTeamMembers;
}

/** Invitation token expiry in days */
export const INVITATION_EXPIRY_DAYS = 7;

/** All 30 canonical permission keys */
export const ALL_PERMISSIONS = [
  'sales.create', 'sales.read', 'sales.update', 'sales.delete', 'sales.import',
  'expenses.create', 'expenses.read', 'expenses.update', 'expenses.delete',
  'invoices.create', 'invoices.read', 'invoices.send', 'invoices.mark_paid',
  'debtors.read', 'debtors.manage',
  'customers.read', 'customers.manage',
  'tax.read', 'tax.calculate', 'tax.finalize', 'tax.pay',
  'payments.read',
  'dashboard.read',
  'settings.read', 'settings.update',
  'team.manage',
  'business.delete',
  'wallet.read', 'wallet.withdraw',
  'statements.download',
  'reminders.read',
  'ai.use',
] as const;

export type PermissionKey = (typeof ALL_PERMISSIONS)[number];

/** Permissions that are hard-locked to the owner — cannot be overridden or granted to others */
export const FINANCIAL_OWNER_ONLY = new Set<PermissionKey>([
  'tax.pay',
  'wallet.withdraw',
  'business.delete',
  'settings.update',
]);

/** Permissions that can be overridden per-member */
export const OVERRIDABLE_PERMISSIONS = ALL_PERMISSIONS.filter(
  (p) => !FINANCIAL_OWNER_ONLY.has(p)
);

export type OverridablePermissionKey = Exclude<PermissionKey, 'tax.pay' | 'wallet.withdraw' | 'business.delete' | 'settings.update'>;

// ─── Role Defaults Matrix ───────────────────────────────────

export const ROLE_DEFAULTS: Record<BusinessRole, Record<PermissionKey, boolean>> = {
  owner: Object.fromEntries(ALL_PERMISSIONS.map((p) => [p, true])) as Record<PermissionKey, boolean>,

  manager: {
    'sales.create': true, 'sales.read': true, 'sales.update': true, 'sales.delete': true, 'sales.import': true,
    'expenses.create': true, 'expenses.read': true, 'expenses.update': true, 'expenses.delete': true,
    'invoices.create': true, 'invoices.read': true, 'invoices.send': true, 'invoices.mark_paid': true,
    'debtors.read': true, 'debtors.manage': true,
    'customers.read': true, 'customers.manage': true,
    'tax.read': true, 'tax.calculate': true, 'tax.finalize': true, 'tax.pay': false,
    'payments.read': true,
    'dashboard.read': true,
    'settings.read': true, 'settings.update': false,
    'team.manage': true,
    'business.delete': false,
    'wallet.read': true, 'wallet.withdraw': false,
    'statements.download': true,
    'reminders.read': true,
    'ai.use': true,
  },

  sales_staff: {
    'sales.create': true, 'sales.read': true, 'sales.update': true, 'sales.delete': false, 'sales.import': false,
    'expenses.create': false, 'expenses.read': false, 'expenses.update': false, 'expenses.delete': false,
    'invoices.create': true, 'invoices.read': true, 'invoices.send': true, 'invoices.mark_paid': false,
    'debtors.read': true, 'debtors.manage': false,
    'customers.read': true, 'customers.manage': true,
    'tax.read': false, 'tax.calculate': false, 'tax.finalize': false, 'tax.pay': false,
    'payments.read': false,
    'dashboard.read': true,
    'settings.read': false, 'settings.update': false,
    'team.manage': false,
    'business.delete': false,
    'wallet.read': false, 'wallet.withdraw': false,
    'statements.download': false,
    'reminders.read': true,
    'ai.use': true,
  },

  accountant: {
    'sales.create': false, 'sales.read': true, 'sales.update': false, 'sales.delete': false, 'sales.import': false,
    'expenses.create': true, 'expenses.read': true, 'expenses.update': true, 'expenses.delete': false,
    'invoices.create': false, 'invoices.read': true, 'invoices.send': false, 'invoices.mark_paid': true,
    'debtors.read': true, 'debtors.manage': true,
    'customers.read': true, 'customers.manage': false,
    'tax.read': true, 'tax.calculate': true, 'tax.finalize': false, 'tax.pay': false,
    'payments.read': true,
    'dashboard.read': true,
    'settings.read': false, 'settings.update': false,
    'team.manage': false,
    'business.delete': false,
    'wallet.read': true, 'wallet.withdraw': false,
    'statements.download': true,
    'reminders.read': true,
    'ai.use': true,
  },

  viewer: {
    'sales.create': false, 'sales.read': true, 'sales.update': false, 'sales.delete': false, 'sales.import': false,
    'expenses.create': false, 'expenses.read': true, 'expenses.update': false, 'expenses.delete': false,
    'invoices.create': false, 'invoices.read': true, 'invoices.send': false, 'invoices.mark_paid': false,
    'debtors.read': true, 'debtors.manage': false,
    'customers.read': true, 'customers.manage': false,
    'tax.read': true, 'tax.calculate': false, 'tax.finalize': false, 'tax.pay': false,
    'payments.read': true,
    'dashboard.read': true,
    'settings.read': false, 'settings.update': false,
    'team.manage': false,
    'business.delete': false,
    'wallet.read': false, 'wallet.withdraw': false,
    'statements.download': true,
    'reminders.read': true,
    'ai.use': false,
  },
};

/** Which roles each role is allowed to invite/manage */
export const INVITABLE_ROLES_BY_ROLE: Record<BusinessRole, BusinessRole[]> = {
  owner: ['manager', 'sales_staff', 'accountant', 'viewer'],
  manager: ['sales_staff', 'accountant', 'viewer'],
  sales_staff: [],
  accountant: [],
  viewer: [],
};

// ─── Permission Implication Rules ────────────────────────────

/**
 * Write/action permissions that imply their sibling read permission.
 * Granting any action or mutation automatically implies read visibility.
 */
export const WRITE_IMPLIES_READ: Partial<Record<PermissionKey, PermissionKey>> = {
  'sales.create': 'sales.read',
  'sales.update': 'sales.read',
  'sales.delete': 'sales.read',
  'sales.import': 'sales.read',
  'expenses.create': 'expenses.read',
  'expenses.update': 'expenses.read',
  'expenses.delete': 'expenses.read',
  'invoices.create': 'invoices.read',
  'invoices.send': 'invoices.read',
  'invoices.mark_paid': 'invoices.read',
  'debtors.manage': 'debtors.read',
  'tax.calculate': 'tax.read',
  'tax.finalize': 'tax.read',
  'tax.pay': 'tax.read',
  'settings.update': 'settings.read',
  'wallet.withdraw': 'wallet.read',
};

// ─── Permission Resolution ─────────────────────────────────

/**
 * Check if a role (with optional overrides) has a specific permission.
 *
 * @param role - The business role
 * @param overrides - Optional per-member permission overrides (from BusinessMember.permissions JSON)
 * @param permission - The permission key to check
 * @returns true if the permission is granted
 */
export function hasPermission(
  role: BusinessRole,
  overrides: Record<string, boolean> | null | undefined,
  permission: PermissionKey
): boolean {
  return resolvePermissions(role, overrides)[permission] ?? false;
}

/**
 * Resolve the full permission map for a role + overrides.
 *
 * @param role - The business role
 * @param overrides - Optional per-member permission overrides
 * @returns Full permission map (30 keys → boolean)
 */
export function resolvePermissions(
  role: BusinessRole,
  overrides?: Record<string, boolean> | null
): Record<PermissionKey, boolean> {
  const result = { ...ROLE_DEFAULTS[role] };

  // Owner gets everything, no overrides apply
  if (role === 'owner') return result;

  // Apply overrides for non-FINANCIAL_OWNER_ONLY keys
  if (overrides) {
    for (const [key, value] of Object.entries(overrides)) {
      if (
        ALL_PERMISSIONS.includes(key as PermissionKey) &&
        !FINANCIAL_OWNER_ONLY.has(key as PermissionKey) &&
        typeof value === 'boolean'
      ) {
        (result as Record<string, boolean>)[key] = value;
      }
    }
  }

  // Enforce write-implies-read: any action/mutation grant implies read access
  for (const [actionKey, readKey] of Object.entries(WRITE_IMPLIES_READ)) {
    if (result[actionKey as PermissionKey] && readKey) {
      result[readKey as PermissionKey] = true;
    }
  }

  return result;
}
