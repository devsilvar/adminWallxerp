/**
 * Currency Reactivity Coverage Test
 *
 * Fails if a money-rendering component (one that calls formatNaira or formatMoney)
 * does not also call useDisplayCurrency(). That missing hook call is the one failure
 * mode of the per-component subscription design (§6.C of the reviewed plan).
 *
 * Uses pure Node.js fs (no grep) for Windows compatibility.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

// Files that legitimately format money without subscribing:
//   lib/format.ts, lib/currency.ts  — the formatters themselves
//   NGN-locked surfaces              — never convert, never re-render
const ALLOWED = new Set([
  'src/lib/format.ts',
  'src/lib/currency.ts',
  'src/stores/currency.store.ts',
  'src/lib/tax-quiz-engine.ts',
  'src/lib/fees.ts',
  'src/lib/tax-constants.ts',
  'src/data/Subscription.tsx',
  'src/data/marketing.ts',
  'src/pages/Subscription.tsx',
  'src/pages/Payments.tsx',        // unrouted dead code
  'src/pages/Reminders.tsx',       // unrouted dead code
]);

const SRC_ROOT = join(__dirname, '../../..');
const MONEY_RE = /formatNaira|formatMoney/;
const HOOK_RE = /useDisplayCurrency/;

function walkFiles(dir: string, ext: RegExp, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '__tests__' || entry.name === '.git') continue;
      walkFiles(full, ext, out);
    } else if (ext.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

describe('currency reactivity coverage', () => {
  it('every money-rendering component subscribes to the display currency', () => {
    const allFiles = walkFiles(SRC_ROOT, /\.(tsx|ts)$/);

    // Relativise and filter to src/ only
    const srcFiles = allFiles
      .map((f) => relative(SRC_ROOT, f).replace(/\\/g, '/'))
      .filter((f) => f.startsWith('src/'));

    // Files that call formatNaira or formatMoney
    const moneyFiles = srcFiles.filter((rel) => {
      const content = readFileSync(join(SRC_ROOT, rel), 'utf8');
      return MONEY_RE.test(content);
    });

    // Exclude the allowed list
    const needHook = moneyFiles.filter((f) => !ALLOWED.has(f));

    // Check each one also contains useDisplayCurrency
    const missing = needHook.filter((f) => {
      const content = readFileSync(join(SRC_ROOT, f), 'utf8');
      return !HOOK_RE.test(content);
    });

    if (missing.length > 0) {
      console.error(
        '\nThese files render money but are missing useDisplayCurrency():\n' +
        missing.map((f) => `  - ${f}`).join('\n') +
        '\nAdd `useDisplayCurrency();` as the first hook call in each component.\n'
      );
    }

    expect(missing).toEqual([]);
  });
});
