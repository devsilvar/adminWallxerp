import type { Express } from 'express';
import { createApp } from '../../src/app.js';
import { loadConfig, type Config } from '../../src/config.js';

const BASE_ENV: Record<string, string> = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://test:test@localhost:5432/wowo_external_test',
};

/** Builds a validated config from the documented defaults plus overrides. */
export function testConfig(overrides: Record<string, string> = {}): Config {
  return loadConfig({ ...BASE_ENV, ...overrides });
}

export function createTestApp(overrides: Record<string, string> = {}): Express {
  return createApp(testConfig(overrides));
}
