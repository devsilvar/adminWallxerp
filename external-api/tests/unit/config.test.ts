import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config.js';

const base = { DATABASE_URL: 'postgresql://u:p@localhost:5432/db' };

describe('loadConfig', () => {
  it('applies the documented defaults (plan §10)', () => {
    const config = loadConfig({ ...base });

    expect(config.NODE_ENV).toBe('development');
    expect(config.PORT).toBe(3000);
    expect(config.TRUST_PROXY).toBe(1);
    expect(config.EXTERNAL_API_ENABLED).toBe(true);
    expect(config.INSTANCE_COUNT).toBe(1);
    expect(config.EXTERNAL_DATA_RATE_LIMIT).toBe(120);
    expect(config.EXTERNAL_ACTIVATION_RATE_LIMIT).toBe(10);
    expect(config.EXTERNAL_PUBLIC_PDF_RATE_LIMIT).toBe(30);
    expect(config.EXTERNAL_ROTATE_GRACE_MINUTES).toBe(10);
    expect(config.EXTERNAL_CODE_TTL_HOURS).toBe(72);
    expect(config.EXTERNAL_SHARE_TOKEN_TTL_DAYS).toBe(30);
    expect(config.EXTERNAL_TOMBSTONE_RETENTION_DAYS).toBe(180);
    expect(config.EXTERNAL_AUDIT_RETENTION_DAYS).toBe(730);
    expect(config.PLATFORM_FLAT_FEE_NGN).toBe(0);
  });

  it('coerces the kill switch to a boolean rather than the string "false"', () => {
    expect(loadConfig({ ...base, EXTERNAL_API_ENABLED: 'false' }).EXTERNAL_API_ENABLED).toBe(false);
  });

  it('coerces numeric strings', () => {
    const config = loadConfig({ ...base, PORT: '8080', INSTANCE_COUNT: '3' });

    expect(config.PORT).toBe(8080);
    expect(config.INSTANCE_COUNT).toBe(3);
  });

  it('accepts TRUST_PROXY=0 (no proxy in front of the process)', () => {
    expect(loadConfig({ ...base, TRUST_PROXY: '0' }).TRUST_PROXY).toBe(0);
  });

  it('rejects a missing DATABASE_URL', () => {
    expect(() => loadConfig({})).toThrow(/DATABASE_URL/);
  });

  it('rejects a non-numeric PORT', () => {
    expect(() => loadConfig({ ...base, PORT: 'eighty' })).toThrow(/PORT/);
  });

  it('rejects an unknown NODE_ENV', () => {
    expect(() => loadConfig({ ...base, NODE_ENV: 'staging' })).toThrow(/NODE_ENV/);
  });

  it('rejects a zero or negative INSTANCE_COUNT', () => {
    expect(() => loadConfig({ ...base, INSTANCE_COUNT: '0' })).toThrow(/INSTANCE_COUNT/);
  });
});
