import { describe, it, expect } from 'vitest';
import { resolveGreetingName } from '../Dashboard';
import type { User, Business } from '@/types/index';

describe('resolveGreetingName', () => {
  const baseUser: User = {
    id: 'user-1',
    email: 'user@example.com',
    role: 'user',
    isVerified: true,
    isActive: true,
    createdAt: '2026-01-01',
  };

  const baseBusiness: Business = {
    id: 'biz-1',
    userId: 'user-1',
    merchantId: 'PMTW0000001',
    businessName: 'Acme Enterprises',
    ownerName: 'Chidi Okonkwo',
    businessType: 'retail',
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
  };

  it('returns the first whitespace-delimited token of user.fullName when present', () => {
    const user: User = {
      ...baseUser,
      fullName: 'Aisha Bello Mohammed',
    };
    expect(resolveGreetingName(user, baseBusiness)).toBe('Aisha');
  });

  it('handles leading and trailing whitespace in user.fullName cleanly', () => {
    const user: User = {
      ...baseUser,
      fullName: '   Emeka   Okafor  ',
    };
    expect(resolveGreetingName(user, baseBusiness)).toBe('Emeka');
  });

  it('falls back to ownerName ONLY if the logged-in user is the business owner', () => {
    const ownerUser: User = {
      ...baseUser,
      id: 'owner-uuid-123',
      fullName: null,
    };
    const business: Business = {
      ...baseBusiness,
      userId: 'owner-uuid-123',
      ownerName: 'Folake Adeyemi',
    };

    expect(resolveGreetingName(ownerUser, business)).toBe('Folake');
  });

  it('NEVER greets a team member with the business owner name when member has no fullName', () => {
    const teamMemberUser: User = {
      ...baseUser,
      id: 'member-uuid-456',
      fullName: null,
    };
    const business: Business = {
      ...baseBusiness,
      userId: 'owner-uuid-123', // Owner is someone else!
      ownerName: 'Folake Adeyemi',
    };

    // Must return empty string so greeting displays "Good morning/afternoon", NOT "Good afternoon, Folake"
    expect(resolveGreetingName(teamMemberUser, business)).toBe('');
  });

  it('returns empty string when user and business are null or undefined', () => {
    expect(resolveGreetingName(null, null)).toBe('');
    expect(resolveGreetingName(undefined, undefined)).toBe('');
  });

  it('never uses email prefix as greeting name', () => {
    const userWithoutName: User = {
      ...baseUser,
      id: 'member-999',
      email: 'john.doe@company.com',
      fullName: undefined,
    };
    const otherBusiness: Business = {
      ...baseBusiness,
      userId: 'boss-111',
    };

    const result = resolveGreetingName(userWithoutName, otherBusiness);
    expect(result).not.toBe('john.doe');
    expect(result).toBe('');
  });
});
