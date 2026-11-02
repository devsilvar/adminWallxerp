import { describe, it, expect } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';

describe('Frontend & Backend Shared Tax Engine Byte-Sync Verification', () => {
  const backendEnginePath = path.resolve(__dirname, '../../src/shared/tax-quiz-engine.ts');
  const frontendEnginePath = path.resolve(__dirname, '../../../frontend/src/lib/tax-quiz-engine.ts');

  const backendConstantsPath = path.resolve(__dirname, '../../src/shared/tax-constants.ts');
  const frontendConstantsPath = path.resolve(__dirname, '../../../frontend/src/lib/tax-constants.ts');

  it('backend and frontend tax-quiz-engine.ts should be byte-identical (normalized for line endings)', () => {
    expect(fs.existsSync(backendEnginePath)).toBe(true);
    expect(fs.existsSync(frontendEnginePath)).toBe(true);

    const backendContent = fs.readFileSync(backendEnginePath, 'utf8').replace(/\r\n/g, '\n').trim();
    const frontendContent = fs.readFileSync(frontendEnginePath, 'utf8').replace(/\r\n/g, '\n').trim();

    expect(backendContent).toBe(frontendContent);
  });

  it('backend and frontend tax-constants.ts should have matching key statutory constants', () => {
    expect(fs.existsSync(backendConstantsPath)).toBe(true);
    expect(fs.existsSync(frontendConstantsPath)).toBe(true);

    const backendContent = fs.readFileSync(backendConstantsPath, 'utf8').replace(/\r\n/g, '\n').trim();
    const frontendContent = fs.readFileSync(frontendConstantsPath, 'utf8').replace(/\r\n/g, '\n').trim();

    expect(backendContent).toBe(frontendContent);
  });
});
