#!/usr/bin/env ts-node
/**
 * TAX-21: Tax Engine Parity Script
 *
 * Verifies that the backend and frontend copies of:
 *   - tax-quiz-engine.ts
 *   - tax-constants.ts
 * are byte-identical after normalizing line endings.
 *
 * Exits 0 if parity is maintained.
 * Exits 1 and prints a diff summary if mismatch is detected.
 *
 * Usage:
 *   npm run check:parity           (from backend/)
 *   npx ts-node scripts/check-tax-engine-parity.ts
 */

import * as fs from 'fs';
import * as path from 'path';

interface ParityCheck {
  label: string;
  backendPath: string;
  frontendPath: string;
}

const CHECKS: ParityCheck[] = [
  {
    label: 'tax-quiz-engine.ts',
    backendPath: path.resolve(__dirname, '../src/shared/tax-quiz-engine.ts'),
    frontendPath: path.resolve(__dirname, '../../frontend/src/lib/tax-quiz-engine.ts'),
  },
  {
    label: 'tax-constants.ts',
    backendPath: path.resolve(__dirname, '../src/shared/tax-constants.ts'),
    frontendPath: path.resolve(__dirname, '../../frontend/src/lib/tax-constants.ts'),
  },
];

/**
 * Normalize line endings to LF and trim trailing whitespace for comparison.
 * This prevents CRLF vs LF differences from causing false positives.
 */
function normalizeContent(raw: string): string {
  return raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trimEnd();
}

/**
 * Generate a simple character-level diff summary (first N mismatching lines).
 */
function diffSummary(backendContent: string, frontendContent: string, maxLines = 10): string {
  const bLines = backendContent.split('\n');
  const fLines = frontendContent.split('\n');
  const lines: string[] = [];
  const maxLen = Math.max(bLines.length, fLines.length);

  for (let i = 0; i < maxLen && lines.length < maxLines; i++) {
    const b = bLines[i] ?? '(missing)';
    const f = fLines[i] ?? '(missing)';
    if (b !== f) {
      lines.push(`  Line ${i + 1}:`);
      lines.push(`    BACKEND  : ${b.substring(0, 120)}`);
      lines.push(`    FRONTEND : ${f.substring(0, 120)}`);
    }
  }

  if (lines.length === 0) {
    return '  (no line-level diff found — may be trailing whitespace or encoding)';
  }
  return lines.join('\n');
}

let exitCode = 0;

console.log('=== TAX ENGINE PARITY CHECK ===\n');

for (const check of CHECKS) {
  process.stdout.write(`Checking ${check.label} ... `);

  if (!fs.existsSync(check.backendPath)) {
    console.error(`FAIL\n  Backend file not found: ${check.backendPath}`);
    exitCode = 1;
    continue;
  }

  if (!fs.existsSync(check.frontendPath)) {
    console.error(`FAIL\n  Frontend file not found: ${check.frontendPath}`);
    exitCode = 1;
    continue;
  }

  const backendRaw = fs.readFileSync(check.backendPath, 'utf8');
  const frontendRaw = fs.readFileSync(check.frontendPath, 'utf8');

  const backendNorm = normalizeContent(backendRaw);
  const frontendNorm = normalizeContent(frontendRaw);

  if (backendNorm === frontendNorm) {
    console.log('OK');
  } else {
    exitCode = 1;
    console.error('MISMATCH');
    console.error(`  Backend  : ${check.backendPath}`);
    console.error(`  Frontend : ${check.frontendPath}`);
    console.error(`  Backend lines  : ${backendNorm.split('\n').length}`);
    console.error(`  Frontend lines : ${frontendNorm.split('\n').length}`);
    console.error('\n  First differing lines:');
    console.error(diffSummary(backendNorm, frontendNorm));
    console.error('');
  }
}

console.log('');
if (exitCode === 0) {
  console.log('✅ All tax engine files are in parity.');
} else {
  console.error('❌ Parity check FAILED. Sync the frontend files with the backend shared files.');
  console.error('   Hint: copy backend/src/shared/tax-quiz-engine.ts -> frontend/src/lib/tax-quiz-engine.ts');
  console.error('         copy backend/src/shared/tax-constants.ts   -> frontend/src/lib/tax-constants.ts');
}

process.exit(exitCode);
