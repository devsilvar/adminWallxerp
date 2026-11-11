/**
 * Test / throwaway account detection.
 *
 * Shared by the new-signup notification paths (cron + admin manual send) and
 * kept in sync with the domains the startup cleanup sweep treats as
 * disposable (src/scripts/erase-test-accounts.ts). Internal alert emails must
 * never be fanned out for these addresses.
 */

const TEST_EMAIL_DOMAINS = [
  '@yopmail.com',
  '@example.com',
  '@e2e.com',
  '@mailinator.com',
  '@test.com',
];

export function isTestAccountEmail(email: string): boolean {
  const lower = email.trim().toLowerCase();
  return TEST_EMAIL_DOMAINS.some((domain) => lower.endsWith(domain));
}
