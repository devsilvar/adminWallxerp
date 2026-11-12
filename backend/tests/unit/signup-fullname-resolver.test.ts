import { resolveUserDisplayName } from '@/services/auth/auth.service';

const biz = (id: string, ownerName: string, createdAt: Date) => ({
  id,
  ownerName,
  createdAt,
});

describe('resolveUserDisplayName', () => {
  it('returns fullName when present', () => {
    expect(
      resolveUserDisplayName({ fullName: 'Amaka Obi', primaryBusinessId: null }, []),
    ).toBe('Amaka Obi');
  });

  it('trims whitespace from fullName', () => {
    expect(
      resolveUserDisplayName({ fullName: '  Amaka  ', primaryBusinessId: null }, []),
    ).toBe('Amaka');
  });

  it('falls back to primary business ownerName when fullName is null', () => {
    const businesses = [
      biz('b1', 'Amaka Obi', new Date('2024-01-01')),
      biz('b2', 'Older Biz', new Date('2023-01-01')),
    ];
    expect(
      resolveUserDisplayName({ fullName: null, primaryBusinessId: 'b1' }, businesses),
    ).toBe('Amaka Obi');
  });

  it('falls back to earliest-created business when no primary is set', () => {
    const businesses = [
      biz('b2', 'Newer Biz', new Date('2024-06-01')),
      biz('b1', 'Older Biz', new Date('2023-01-01')),
    ];
    expect(
      resolveUserDisplayName({ fullName: null, primaryBusinessId: null }, businesses),
    ).toBe('Older Biz');
  });

  it('returns null when no name and no businesses', () => {
    expect(
      resolveUserDisplayName({ fullName: null, primaryBusinessId: null }, []),
    ).toBeNull();
  });

  it('returns null when fullName is empty string', () => {
    expect(
      resolveUserDisplayName({ fullName: '', primaryBusinessId: null }, []),
    ).toBeNull();
  });

  it('ignores empty/whitespace owner names on businesses and falls back to valid ones', () => {
    const businesses = [
      biz('b1', '   ', new Date('2023-01-01')),
      biz('b2', 'Valid Owner', new Date('2024-01-01')),
    ];
    expect(
      resolveUserDisplayName({ fullName: null, primaryBusinessId: null }, businesses),
    ).toBe('Valid Owner');
  });

  it('handles null/undefined user or businesses safely', () => {
    expect(resolveUserDisplayName(null, null)).toBeNull();
    expect(resolveUserDisplayName(undefined, undefined)).toBeNull();
  });
});
