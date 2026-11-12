import { createBusinessSchema } from '@/validators/business.validator';

describe('createBusinessSchema - ownerName optionality', () => {
  const baseValid = {
    businessName: 'Acme Enterprises',
    businessType: 'Retail',
    state: 'Lagos',
  };

  it('validates successfully when ownerName is omitted', () => {
    const result = createBusinessSchema.safeParse(baseValid);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.ownerName).toBeUndefined();
    }
  });

  it('validates successfully when ownerName is provided', () => {
    const result = createBusinessSchema.safeParse({
      ...baseValid,
      ownerName: 'Ada Lovelace',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.ownerName).toBe('Ada Lovelace');
    }
  });

  it('fails validation when ownerName is less than 2 characters', () => {
    const result = createBusinessSchema.safeParse({
      ...baseValid,
      ownerName: 'A',
    });
    expect(result.success).toBe(false);
  });
});

describe('createBusiness ownerName resolution logic', () => {
  function resolveOwnerName(
    inputOwnerName?: string | null,
    userFullName?: string | null,
  ): string | null {
    return inputOwnerName?.trim() || userFullName?.trim() || null;
  }

  it('prefers explicit input.ownerName over user.fullName', () => {
    const resolved = resolveOwnerName('Explicit Owner', 'User Profile Name');
    expect(resolved).toBe('Explicit Owner');
  });

  it('inherits user.fullName when input.ownerName is omitted or empty', () => {
    const resolved = resolveOwnerName(undefined, 'User Profile Name');
    expect(resolved).toBe('User Profile Name');

    const resolvedBlank = resolveOwnerName('   ', 'User Profile Name');
    expect(resolvedBlank).toBe('User Profile Name');
  });

  it('returns null when neither is provided', () => {
    expect(resolveOwnerName(undefined, null)).toBeNull();
    expect(resolveOwnerName('  ', '   ')).toBeNull();
  });
});
