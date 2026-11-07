import { registerSchema } from '../../src/validators/auth.validator';

describe('auth.validator - registerSchema', () => {
  const baseValid = {
    email: 'TestMerchant@Example.com',
    password: 'Password123!',
  };

  it('validates valid registration without acquisitionSource', () => {
    const parsed = registerSchema.safeParse(baseValid);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.email).toBe('testmerchant@example.com');
      expect(parsed.data.acquisitionSource).toBeUndefined();
    }
  });

  it('validates registration with acquisitionSource="marketplace"', () => {
    const parsed = registerSchema.safeParse({
      ...baseValid,
      acquisitionSource: 'marketplace',
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.acquisitionSource).toBe('marketplace');
    }
  });

  it('rejects unwhitelisted acquisitionSource strings', () => {
    const parsed = registerSchema.safeParse({
      ...baseValid,
      acquisitionSource: 'google_ads',
    });
    expect(parsed.success).toBe(false);
  });

  it('validates registration with acceptedTerms=true', () => {
    const parsed = registerSchema.safeParse({
      ...baseValid,
      acceptedTerms: true,
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.acceptedTerms).toBe(true);
    }
  });

  it('validates registration with acceptedTerms=false or omitted', () => {
    const parsedOmitted = registerSchema.safeParse(baseValid);
    expect(parsedOmitted.success).toBe(true);
    if (parsedOmitted.success) {
      expect(parsedOmitted.data.acceptedTerms).toBeUndefined();
    }

    const parsedFalse = registerSchema.safeParse({
      ...baseValid,
      acceptedTerms: false,
    });
    expect(parsedFalse.success).toBe(true);
    if (parsedFalse.success) {
      expect(parsedFalse.data.acceptedTerms).toBe(false);
    }
  });
});
