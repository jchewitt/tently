import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** Store only npm's variable reference, never the credential or proxy placeholder value. */
export async function npmAuthOptions(tokenAvailable = Boolean(process.env.TENTLY_NPM_TOKEN)) {
  if (!tokenAvailable) return { args: [], cleanup: async () => {} };
  const directory = await mkdtemp(join(tmpdir(), 'tently-npm-auth-'));
  const path = join(directory, 'npmrc');
  try {
    await writeFile(path, '//registry.npmjs.org/:_authToken=${TENTLY_NPM_TOKEN}\n', { mode: 0o600 });
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
  return {
    args: [`--userconfig=${path}`],
    cleanup: () => rm(directory, { recursive: true, force: true }),
  };
}
