import type { ReactNode } from 'react';
import { useBusinessStore } from '@/stores/business.store.ts';
import { useAuthStore } from '@/stores/auth.store.ts';
import type { PermissionKey } from '@/types/index.ts';

/**
 * Pure, fail-closed permission evaluator.
 * - Business owner always evaluates to true.
 * - Non-owner checks myPermissions[permission] === true.
 * - If key is absent, false, null, or undefined -> evaluates to false (fail-closed).
 */
export function hasPerm(
  permission: PermissionKey,
  business?: { userId?: string; myRole?: string; myPermissions?: Record<string, boolean> | null } | null,
  userId?: string | null
): boolean {
  const biz = business !== undefined ? business : useBusinessStore.getState().activeBusiness;
  const uid = userId !== undefined ? userId : useAuthStore.getState().user?.id;

  if (!biz) return false;

  // Business owner always has full access
  if ((uid && biz.userId === uid) || biz.myRole === 'owner') {
    return true;
  }

  // Check resolved permissions from backend (fail-closed: must strictly equal true)
  if (biz.myPermissions && biz.myPermissions[permission] === true) {
    return true;
  }

  return false;
}

/**
 * Hook to check if the current user has a specific permission for the active business.
 */
export function usePermission(permission: PermissionKey): boolean {
  const activeBusiness = useBusinessStore((s) => s.activeBusiness);
  const user = useAuthStore((s) => s.user);
  return hasPerm(permission, activeBusiness, user?.id);
}

interface PermissionGateProps {
  requires: PermissionKey;
  fallback?: ReactNode;
  children: ReactNode;
}

/**
 * Conditionally renders content if the user has the required permission.
 */
export default function PermissionGate({
  requires,
  fallback = null,
  children,
}: PermissionGateProps) {
  const hasAccess = usePermission(requires);
  if (!hasAccess) return <>{fallback}</>;
  return <>{children}</>;
}
