import { expect, it } from 'vitest';
import { inWorkingScope } from './working-content.js';

it('matches equivalent configured directory roots and contract globs without including outside paths', () => {
  for (const root of ['src', './src', './src/', '.\\src', '.', './']) {
    expect(inWorkingScope('src/value.ts', [root])).toBe(true);
    expect(inWorkingScope('../outside.ts', [root])).toBe(false);
  }
  expect(inWorkingScope('contracts/deep/shared.ts', ['./contracts/**/*.ts'])).toBe(true);
  expect(inWorkingScope('contracts/shared.md', ['./contracts/**/*.ts'])).toBe(false);
  expect(inWorkingScope('src-other/value.ts', ['./src'])).toBe(false);
});
