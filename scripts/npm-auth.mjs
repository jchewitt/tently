import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** Store only npm's variable reference, never the credential or proxy placeholder value. */
export async function npmAuthOptions(
  tokenVariable = process.env.WEFTLET_NPM_TOKEN ? 'WEFTLET_NPM_TOKEN'
    : process.env.TENTLY_NPM_TOKEN ? 'TENTLY_NPM_TOKEN' : undefined,
  { isolate = false } = {},
) {
  if (tokenVariable && !['WEFTLET_NPM_TOKEN', 'TENTLY_NPM_TOKEN'].includes(tokenVariable)) {
    throw new Error('Unsupported npm token variable');
  }
  if (!tokenVariable && !isolate) return { args: [], cleanup: async () => {} };
  const directory = await mkdtemp(join(tmpdir(), 'weftlet-npm-auth-'));
  const path = join(directory, 'npmrc');
  const globalPath = join(directory, 'global-npmrc');
  try {
    await writeFile(path, isolate ? '' : `//registry.npmjs.org/:_authToken=\${${tokenVariable}}\n`, { mode: 0o600 });
    if (isolate) await writeFile(globalPath, '', { mode: 0o600 });
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
  return {
    args: [`--userconfig=${path}`, ...(isolate ? [`--globalconfig=${globalPath}`] : [])],
    cleanup: () => rm(directory, { recursive: true, force: true }),
  };
}

/** Preconditions only. npm and the registry verify the actual OIDC identity. */
export function releaseAuthentication(mode, npmVersion, environment = process.env) {
  if (mode === 'login') return { requiresWhoami: true, isolate: false };
  if (mode !== 'oidc') throw new Error('Release authentication must be login or oidc');
  const version = /^(\d+)\.(\d+)\.(\d+)$/.exec(npmVersion.trim());
  if (!version || Number(version[1]) < 11 || (Number(version[1]) === 11 &&
      (Number(version[2]) < 5 || (Number(version[2]) === 5 && Number(version[3]) < 1)))) {
    throw new Error('Trusted publishing requires npm 11.5.1 or newer');
  }
  if (environment.GITHUB_ACTIONS !== 'true' || environment.RUNNER_ENVIRONMENT !== 'github-hosted' ||
      environment.GITHUB_REPOSITORY !== 'jchewitt/weftlet' || environment.GITHUB_REF !== 'refs/heads/main' ||
      environment.GITHUB_EVENT_NAME !== 'workflow_dispatch' ||
      !environment.ACTIONS_ID_TOKEN_REQUEST_URL || !environment.ACTIONS_ID_TOKEN_REQUEST_TOKEN) {
    throw new Error('OIDC publication requires the manually dispatched GitHub-hosted main-branch release workflow with id-token: write');
  }
  if (Object.entries(environment).some(([key, value]) => value &&
      (['WEFTLET_NPM_TOKEN', 'TENTLY_NPM_TOKEN', 'NODE_AUTH_TOKEN', 'NPM_TOKEN'].includes(key.toUpperCase()) ||
       /^npm_config_.*(?:token|auth|password)/i.test(key)))) {
    throw new Error('OIDC publication must not inherit npm tokens or authentication overrides');
  }
  return { requiresWhoami: false, isolate: true };
}
