import { readFile, stat } from 'node:fs/promises';
import { expect, it } from 'vitest';
import { npmAuthOptions } from '../scripts/npm-auth.mjs';

it('preserves normal npm login configuration when no cloud token is configured', async () => {
  const result = await npmAuthOptions(false);
  expect(result.args).toEqual([]);
  await result.cleanup();
});

it('scopes npm authentication to its registry using only a temporary variable reference', async () => {
  const result = await npmAuthOptions(true);
  const path = result.args[0]!.slice('--userconfig='.length);
  try {
    expect(await readFile(path, 'utf8')).toBe('//registry.npmjs.org/:_authToken=${TENTLY_NPM_TOKEN}\n');
    if (process.platform !== 'win32') expect((await stat(path)).mode & 0o777).toBe(0o600);
  } finally { await result.cleanup(); }
  await expect(stat(path)).rejects.toMatchObject({ code: 'ENOENT' });
});
