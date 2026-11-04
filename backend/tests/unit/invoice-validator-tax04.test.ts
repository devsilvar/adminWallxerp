import { createInvoiceSchema } from '@/validators/invoice.validator';

const validBody = {
  customerName: 'Ayo Test',
  issueDate: '2026-03-01',
  dueDate: '2026-03-15',
  lines: [{ description: 'Consulting', quantity: 1, unitPrice: 100000 }],
};

describe('TAX-04 — createInvoiceSchema does not invent a VAT rate', () => {
  it('leaves vatRate undefined when the caller omits it', () => {
    const parsed = createInvoiceSchema.parse(validBody);
    expect('vatRate' in parsed).toBe(false);
    expect(parsed.vatRate).toBeUndefined();
  });

  it('preserves an explicit zero instead of replacing it', () => {
    expect(createInvoiceSchema.parse({ ...validBody, vatRate: 0 }).vatRate).toBe(0);
  });

  it('preserves an explicit non-zero rate', () => {
    expect(createInvoiceSchema.parse({ ...validBody, vatRate: 7.5 }).vatRate).toBe(7.5);
  });

  it('still bounds the rate to 0-100', () => {
    expect(() => createInvoiceSchema.parse({ ...validBody, vatRate: 100.01 })).toThrow();
    expect(() => createInvoiceSchema.parse({ ...validBody, vatRate: -0.01 })).toThrow();
  });
});
