import {
  adminVerifyPasswordCodeSchema,
  adminCompletePasswordChangeSchema,
} from '../../src/validators/admin-account.validator';

describe('Admin Account Validators — Phase 8 (qahunter.md RTM)', () => {
  describe('adminVerifyPasswordCodeSchema', () => {
    // REQ-VAL-01: Valid 6-Digit Codes
    it('accepts valid 6-digit decimal code strings [positive]', () => {
      expect(adminVerifyPasswordCodeSchema.safeParse({ code: '123456' }).success).toBe(true);
      expect(adminVerifyPasswordCodeSchema.safeParse({ code: '000000' }).success).toBe(true);
      expect(adminVerifyPasswordCodeSchema.safeParse({ code: '999999' }).success).toBe(true);
    });

    // REQ-VAL-02: Boundary & Negative Code Formats
    it('rejects codes below 6 digits [boundary-min]', () => {
      const res = adminVerifyPasswordCodeSchema.safeParse({ code: '12345' });
      expect(res.success).toBe(false);
    });

    it('rejects codes above 6 digits [boundary-max]', () => {
      const res = adminVerifyPasswordCodeSchema.safeParse({ code: '1234567' });
      expect(res.success).toBe(false);
    });

    it('rejects codes containing alphabetic or special characters [negative]', () => {
      expect(adminVerifyPasswordCodeSchema.safeParse({ code: '12a456' }).success).toBe(false);
      expect(adminVerifyPasswordCodeSchema.safeParse({ code: '12-456' }).success).toBe(false);
      expect(adminVerifyPasswordCodeSchema.safeParse({ code: '      ' }).success).toBe(false);
      expect(adminVerifyPasswordCodeSchema.safeParse({ code: '' }).success).toBe(false);
    });
  });

  describe('adminCompletePasswordChangeSchema', () => {
    const validTicket = 'valid.jwt.ticket';

    // REQ-VAL-03: Valid Password & Matching Confirmation
    it('accepts compliant passwords with matching confirmation [positive]', () => {
      const res = adminCompletePasswordChangeSchema.safeParse({
        changeTicket: validTicket,
        newPassword: 'Innovation@101',
        confirmPassword: 'Innovation@101',
      });
      expect(res.success).toBe(true);
    });

    // REQ-VAL-04: Password Length Boundaries (8-128 chars)
    it('accepts password at exact minimum length of 8 characters [boundary-min]', () => {
      const minPass = 'Ab1!cdef';
      const res = adminCompletePasswordChangeSchema.safeParse({
        changeTicket: validTicket,
        newPassword: minPass,
        confirmPassword: minPass,
      });
      expect(res.success).toBe(true);
    });

    it('rejects password below minimum length (7 chars) [boundary-min-1]', () => {
      const shortPass = 'Ab1!cde';
      const res = adminCompletePasswordChangeSchema.safeParse({
        changeTicket: validTicket,
        newPassword: shortPass,
        confirmPassword: shortPass,
      });
      expect(res.success).toBe(false);
    });

    it('accepts password at exact maximum length of 128 characters [boundary-max]', () => {
      const maxPass = 'Aa1!' + 'x'.repeat(124);
      expect(maxPass.length).toBe(128);
      const res = adminCompletePasswordChangeSchema.safeParse({
        changeTicket: validTicket,
        newPassword: maxPass,
        confirmPassword: maxPass,
      });
      expect(res.success).toBe(true);
    });

    it('rejects password exceeding maximum length (129 chars) [boundary-max+1]', () => {
      const tooLongPass = 'Aa1!' + 'x'.repeat(125);
      expect(tooLongPass.length).toBe(129);
      const res = adminCompletePasswordChangeSchema.safeParse({
        changeTicket: validTicket,
        newPassword: tooLongPass,
        confirmPassword: tooLongPass,
      });
      expect(res.success).toBe(false);
    });

    // REQ-VAL-05: Complexity Rules
    it('rejects passwords missing uppercase, lowercase, or digit [negative]', () => {
      // Missing uppercase
      expect(
        adminCompletePasswordChangeSchema.safeParse({
          changeTicket: validTicket,
          newPassword: 'innovation@101',
          confirmPassword: 'innovation@101',
        }).success
      ).toBe(false);

      // Missing lowercase
      expect(
        adminCompletePasswordChangeSchema.safeParse({
          changeTicket: validTicket,
          newPassword: 'INNOVATION@101',
          confirmPassword: 'INNOVATION@101',
        }).success
      ).toBe(false);

      // Missing digit
      expect(
        adminCompletePasswordChangeSchema.safeParse({
          changeTicket: validTicket,
          newPassword: 'Innovation@abc',
          confirmPassword: 'Innovation@abc',
        }).success
      ).toBe(false);
    });

    // REQ-VAL-06: Confirmation Mismatch & Missing Ticket
    it('rejects mismatched password and confirmation [negative]', () => {
      const res = adminCompletePasswordChangeSchema.safeParse({
        changeTicket: validTicket,
        newPassword: 'Innovation@101',
        confirmPassword: 'DifferentPassword@102',
      });
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error.issues[0].message).toBe('Passwords do not match');
      }
    });

    it('rejects missing or empty changeTicket [negative]', () => {
      const res = adminCompletePasswordChangeSchema.safeParse({
        changeTicket: '',
        newPassword: 'Innovation@101',
        confirmPassword: 'Innovation@101',
      });
      expect(res.success).toBe(false);
    });
  });
});
