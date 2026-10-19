/**
 * Team & Invitation Validators (Zod v4)
 *
 * @author WallX Engineering Team
 */

import { z } from 'zod';
import { OVERRIDABLE_PERMISSIONS, FINANCIAL_OWNER_ONLY, type PermissionKey } from '@/services/team/permission.service';

// ─── Shared Refinements ─────────────────────────────────────

const businessRoleEnum = z.enum(['manager', 'sales_staff', 'accountant', 'viewer']);

const permissionOverridesSchema = z
  .record(z.string(), z.boolean())
  .optional()
  .refine(
    (overrides) => {
      if (!overrides) return true;
      for (const key of Object.keys(overrides)) {
        if (FINANCIAL_OWNER_ONLY.has(key as PermissionKey)) {
          return false;
        }
        if (!OVERRIDABLE_PERMISSIONS.includes(key as any)) {
          return false;
        }
      }
      return true;
    },
    {
      message: 'Permission overrides contain invalid or owner-only keys. Only overridable permission keys are allowed.',
    }
  );

// ─── Invitation Schemas ─────────────────────────────────────

export const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email('A valid email address is required'),
  fullName: z.string().trim().min(2, 'Name must be at least 2 characters').max(100).optional(),
  role: businessRoleEnum,
  permissions: permissionOverridesSchema,
});

export const acceptInvitationSchema = z
  .object({
    token: z.string().min(1).optional(),
    invitationId: z.string().uuid().optional(),
  })
  .refine((data) => !!data.token || !!data.invitationId, {
    message: 'Either token or invitationId is required',
  });

export const declineInvitationSchema = z
  .object({
    token: z.string().min(1).optional(),
    invitationId: z.string().uuid().optional(),
  })
  .refine((data) => !!data.token || !!data.invitationId, {
    message: 'Either token or invitationId is required',
  });

export const validateInviteTokenSchema = z.object({
  token: z.string().min(1, 'Invitation token is required'),
});

export const acceptOnboardingSchema = z.object({
  token: z.string().min(1, 'Invitation token is required'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password must be at most 128 characters')
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
      'Password must contain at least one uppercase letter, one lowercase letter, and one number'
    ),
});

// ─── Member Management Schemas ──────────────────────────────

export const updateMemberSchema = z
  .object({
    fullName: z.string().trim().min(2, 'Name must be at least 2 characters').max(100).optional(),
    role: businessRoleEnum.optional(),
    permissions: permissionOverridesSchema,
  })
  .refine(
    (data) =>
      data.fullName !== undefined ||
      data.role !== undefined ||
      (data.permissions !== undefined && data.permissions !== null),
    { message: 'At least one of fullName, role, or permissions must be provided' }
  );

// ─── Type Exports ───────────────────────────────────────────

export type InviteInput = z.infer<typeof inviteSchema>;
export type AcceptInvitationInput = z.infer<typeof acceptInvitationSchema>;
export type DeclineInvitationInput = z.infer<typeof declineInvitationSchema>;
export type ValidateInviteTokenInput = z.infer<typeof validateInviteTokenSchema>;
export type AcceptOnboardingInput = z.infer<typeof acceptOnboardingSchema>;
export type UpdateMemberInput = z.infer<typeof updateMemberSchema>;

