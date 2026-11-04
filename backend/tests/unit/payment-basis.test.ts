import { describe, it, expect } from '@jest/globals';
import {
  paymentBasisForPolicy,
  type BusinessTaxPolicy,
} from '@/services/tax/tax-policy.service';

const policy = (over: Partial<BusinessTaxPolicy> = {}): BusinessTaxPolicy => ({
  source: 'PROFILE',
  vat: { chargeable: true, rate: 7.5, reason: null },
  incomeTax: { type: 'CIT', rate: 30, devLevyRate: 4 },
  advisories: [],
  ...over,
});

describe('paymentBasisForPolicy', () => {
  it('names VAT when the profile charges VAT', () => {
    expect(paymentBasisForPolicy(policy())).toBe('vat');
  });

  it('names a CIT provision for a VAT-exempt company', () => {
    expect(
      paymentBasisForPolicy(
        policy({
          vat: { chargeable: false, rate: 0, reason: 'Small company exemption' },
          incomeTax: { type: 'CIT', rate: 0, devLevyRate: 0 },
        }),
      ),
    ).toBe('cit-provision');
  });

  it('names a PIT provision for a VAT-exempt sole proprietor', () => {
    expect(
      paymentBasisForPolicy(
        policy({
          vat: { chargeable: false, rate: 0, reason: 'Turnover below threshold' },
          incomeTax: { type: 'PIT', rate: 7.5, devLevyRate: 0 },
        }),
      ),
    ).toBe('pit-provision');
  });

  it('falls back to VAT for a business with no profile (DEFAULT source)', () => {
    expect(
      paymentBasisForPolicy(
        policy({
          source: 'DEFAULT',
          vat: { chargeable: true, rate: 7.5, reason: null },
          incomeTax: { type: 'CIT', rate: 7.5, devLevyRate: 0 },
        }),
      ),
    ).toBe('vat');
  });
});
