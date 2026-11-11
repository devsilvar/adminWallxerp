import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    env: {
      NODE_ENV: 'test',
    },
    // Phase 0 touches no database, so no Postgres service is needed. Phase 1
    // adds `prisma migrate deploy` against a test database before the suite runs.
  },
});
