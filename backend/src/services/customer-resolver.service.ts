/**
 * Customer Identity Resolver Primitive
 *
 * Provides phone normalization and identity resolution for auto-capture
 * across Sales, Invoices, and Debtors (BNPL).
 *
 * Invariant: Master data only. Never calls assertMonthNotLocked or any
 * period-lock helpers. Runs inside the caller's Prisma transaction.
 *
 * @author WallX Engineering Team
 */

import { Customer } from '@prisma/client';
import { TxClient } from '@/lib/prisma';
import { logAudit } from '@/lib/audit';

export interface CustomerIdentityInput {
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
}

export interface ResolvedCustomerResult {
  customer: Customer;
  autoCreated: boolean;
}

/**
 * Normalizes a phone number by stripping all non-digit characters.
 * Requires at least 7 digits to be considered a valid phone number.
 * Returns null if invalid or shorter than 7 digits.
 */
export function normalizePhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 7) return null;
  return digits;
}

/**
 * Resolves or auto-creates a Customer record given an identity.
 *
 * Strategy:
 * 1. Requires either a valid phone or email (name-only is gated and returns null).
 * 2. If phone is present:
 *    - Coarse prefilter using the last 4 digits in DB.
 *    - Exact comparison in JS:
 *      * Length >= 10: exact match on the last 10 digits (matches 0803... and +234803...).
 *      * Length < 10: exact full digit equality.
 * 3. If email is present (and no phone match):
 *    - Case-insensitive search on active customers.
 * 4. If existing customer found:
 *    - Enriches null fields only (phone, email, address). Does NOT overwrite existing values.
 *    - Returns { customer, autoCreated: false }.
 * 5. If not found:
 *    - Auto-creates a new Customer row with isActive: true.
 *    - Logs 'customer.auto_created' audit entry inside tx.
 *    - Returns { customer, autoCreated: true }.
 *
 * Note on concurrency: In the rare case of concurrent requests with the same identity,
 * both may create separate rows if no unique constraint exists on phone.
 * Handled via single-instance SME usage or future advisory lock.
 */
export async function findOrCreateCustomerByIdentity(
  businessId: string,
  identity: CustomerIdentityInput,
  tx: TxClient
): Promise<ResolvedCustomerResult | null> {
  const cleanPhone = normalizePhone(identity.phone);
  const cleanEmail = identity.email && identity.email.trim() ? identity.email.trim().toLowerCase() : null;

  // Gate: either phone or email is required. Name-only sales never auto-create customer records.
  if (!cleanPhone && !cleanEmail) {
    return null;
  }

  let existing: Customer | null = null;

  // 1. Phone-based resolution
  if (cleanPhone) {
    const last4 = cleanPhone.slice(-4);
    const candidates = await tx.customer.findMany({
      where: {
        businessId,
        isActive: true,
        phone: { contains: last4 },
      },
    });

    for (const candidate of candidates) {
      const candidateDigits = normalizePhone(candidate.phone);
      if (!candidateDigits) continue;

      if (cleanPhone.length >= 10) {
        if (candidateDigits.length >= 10 && candidateDigits.slice(-10) === cleanPhone.slice(-10)) {
          existing = candidate;
          break;
        }
      } else {
        if (candidateDigits === cleanPhone) {
          existing = candidate;
          break;
        }
      }
    }
  }

  // 2. Email-based resolution fallback
  if (!existing && cleanEmail) {
    const candidate = await tx.customer.findFirst({
      where: {
        businessId,
        isActive: true,
        email: { equals: cleanEmail, mode: 'insensitive' },
      },
    });

    if (candidate) {
      existing = candidate;
    }
  }

  // 3. Existing customer enrichment
  if (existing) {
    const updateData: { email?: string; phone?: string; address?: string } = {};

    if (!existing.email && cleanEmail) {
      updateData.email = cleanEmail;
    }
    if (!existing.phone && identity.phone && identity.phone.trim()) {
      updateData.phone = identity.phone.trim();
    }
    if (!existing.address && identity.address && identity.address.trim()) {
      updateData.address = identity.address.trim();
    }

    if (Object.keys(updateData).length > 0) {
      existing = await tx.customer.update({
        where: { id: existing.id },
        data: updateData,
      });
    }

    return { customer: existing, autoCreated: false };
  }

  // 4. Create new customer
  const newCustomer = await tx.customer.create({
    data: {
      businessId,
      name: identity.name?.trim() || 'Walk-in Customer',
      phone: identity.phone?.trim() || null,
      email: cleanEmail || null,
      address: identity.address?.trim() || null,
      isActive: true,
    },
  });

  await logAudit(
    {
      businessId,
      action: 'customer.auto_created',
      resourceType: 'customer',
      resourceId: newCustomer.id,
      newData: {
        name: newCustomer.name,
        phone: newCustomer.phone,
        email: newCustomer.email,
        address: newCustomer.address,
      },
    },
    tx
  );

  return { customer: newCustomer, autoCreated: true };
}
