import { readFile, stat } from 'node:fs/promises';
import { expect, it } from 'vitest';
import { npmAuthOptions, releaseAuthentication } from "./npm-auth.mjs";

it('preserves normal npm login configuration when no cloud token is configured', async () => {
  const result = await npmAuthOptions(null);
  expect(result.args).toEqual([]);
  await result.cleanup();
});

it('scopes npm authentication to its registry using only a temporary variable reference', async () => {
  const result = await npmAuthOptions('WEFTLET_NPM_TOKEN');
  const path = result.args[0]!.slice('--userconfig='.length);
  try {
    expect(await readFile(path, 'utf8')).toBe('//registry.npmjs.org/:_authToken=${WEFTLET_NPM_TOKEN}\n');
    if (process.platform !== 'win32') expect((await stat(path)).mode & 0o777).toBe(0o600);
  } finally { await result.cleanup(); }
  await expect(stat(path)).rejects.toMatchObject({ code: 'ENOENT' });
});

const oidcEnvironment = {
  GITHUB_ACTIONS: 'true', RUNNER_ENVIRONMENT: 'github-hosted', GITHUB_REPOSITORY: 'jchewitt/tently',
  GITHUB_REF: 'refs/heads/main', GITHUB_EVENT_NAME: 'workflow_dispatch',
  ACTIONS_ID_TOKEN_REQUEST_URL: 'https://example.invalid/oidc', ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'fixture-only',
};

it('supports legacy token variable references without storing their values', async () => {
  const result = await npmAuthOptions('TENTLY_NPM_TOKEN');
  try {
    expect(await readFile(result.args[0]!.slice('--userconfig='.length), 'utf8'))
      .toContain('${TENTLY_NPM_TOKEN}');
  } finally { await result.cleanup(); }
});

it('isolates OIDC from user and global npm credentials and cleans both files', async () => {
  const result = await npmAuthOptions(null, { isolate: true });
  const paths = result.args.map((arg: string) => arg.slice(arg.indexOf('=') + 1));
  expect(paths).toHaveLength(2);
  for (const path of paths) expect(await readFile(path, 'utf8')).toBe('');
  await result.cleanup();
  for (const path of paths) await expect(stat(path)).rejects.toMatchObject({ code: 'ENOENT' });
});

it('keeps manual authentication and explicitly selects OIDC without a whoami probe', () => {
  expect(releaseAuthentication('login', '11.9.0', {})).toEqual({ requiresWhoami: true, isolate: false });
  for (const version of ['11.5.1', '11.21.1', '12.0.0']) {
    expect(releaseAuthentication('oidc', version, oidcEnvironment)).toEqual({ requiresWhoami: false, isolate: true });
  }
  for (const version of ['10.9.0', '11.4.9', '11.5.0', 'unknown']) {
    expect(() => releaseAuthentication('oidc', version, oidcEnvironment)).toThrow('npm 11.5.1');
  }
});

it('rejects OIDC outside the intended runner, repository, ref, trigger or token context', () => {
  for (const [key, value] of Object.entries({
    GITHUB_ACTIONS: 'false', RUNNER_ENVIRONMENT: 'self-hosted', GITHUB_REPOSITORY: 'someone/fork',
    GITHUB_REF: 'refs/heads/other', GITHUB_EVENT_NAME: 'pull_request',
    ACTIONS_ID_TOKEN_REQUEST_URL: '', ACTIONS_ID_TOKEN_REQUEST_TOKEN: '',
  })) {
    expect(() => releaseAuthentication('oidc', '11.21.1', { ...oidcEnvironment, [key]: value }))
      .toThrow('manually dispatched');
  }
  expect(() => releaseAuthentication('auto', '11.21.1', oidcEnvironment)).toThrow('login or oidc');
});

it('rejects ambient tokens instead of falling back from OIDC to token authentication', () => {
  for (const key of ['WEFTLET_NPM_TOKEN', 'TENTLY_NPM_TOKEN', 'NODE_AUTH_TOKEN', 'NPM_TOKEN', 'npm_config__authToken']) {
    expect(() => releaseAuthentication('oidc', '11.21.1', { ...oidcEnvironment, [key]: 'fixture-only' }))
      .toThrow('must not inherit');
  }
});
