import { expect, it } from 'vitest';
import { createReleaseRecords } from './release-records.mjs';

const commit = 'a'.repeat(40);
const manifest = { commit, registry: 'https://registry.npmjs.org', packages: ['@weftlet/core', '@weftlet/toolkit']
  .map((name) => ({ name, version: '0.1.2', integrity: `sha512-${Buffer.alloc(64, 1).toString('base64')}` })) };

function fixture() {
  const tags = new Map<string, unknown>();
  const releases = new Map<string, unknown>();
  const calls: { method: string; path: string; body: any }[] = [];
  const github = async (method: string, path: string, body?: any) => {
    calls.push({ method, path, body });
    if (method === 'GET' && path.startsWith('git/ref/tags/')) return tags.get(decodeURIComponent(path.slice('git/ref/tags/'.length)));
    if (method === 'GET' && path.startsWith('releases/tags/')) return releases.get(decodeURIComponent(path.slice('releases/tags/'.length)));
    if (method === 'POST' && path === 'git/refs') {
      const tag = body.ref.slice('refs/tags/'.length);
      if (tags.has(tag)) throw Object.assign(new Error('already exists'), { status: 422 });
      const ref = { object: { type: 'commit', sha: body.sha } };
      tags.set(tag, ref);
      return ref;
    }
    if (method === 'POST' && path === 'releases') {
      if (releases.has(body.tag_name)) throw Object.assign(new Error('already exists'), { status: 422 });
      releases.set(body.tag_name, body);
      return body;
    }
    throw new Error(`Unexpected request: ${method} ${path}`);
  };
  const lookup = async (pkg: { integrity: string }) => pkg.integrity;
  return { tags, releases, calls, github, lookup };
}

it('records package tags at the published commit and retries without moving tags or duplicating releases', async () => {
  const state = fixture();
  const options = { ...state, manifest, expectedCommit: commit };
  const result = await createReleaseRecords(options);
  expect(result).toEqual(['@weftlet/core@0.1.2', '@weftlet/toolkit@0.1.2']);
  expect([...state.tags.values()]).toEqual(result.map(() => ({ object: { type: 'commit', sha: commit } })));
  expect(state.calls.filter((call) => call.method === 'POST')).toHaveLength(4);
  expect(state.releases.get(result[0])).toMatchObject({ target_commitish: commit, draft: false,
    body: expect.stringContaining(manifest.packages[0]!.integrity) });
  state.calls.length = 0;
  await createReleaseRecords(options);
  expect(state.calls.every((call) => call.method === 'GET')).toBe(true);
});

it('does not create any release records when either npm package is missing or has different bytes', async () => {
  for (const wrong of [undefined, 'sha512-different']) {
    const state = fixture();
    await expect(createReleaseRecords({ ...state, manifest, expectedCommit: commit,
      lookup: async (pkg: { name: string; integrity: string }) => pkg.name === '@weftlet/toolkit' ? wrong : pkg.integrity,
    })).rejects.toThrow('Registry integrity');
    expect(state.calls.every((call) => call.method === 'GET')).toBe(true);
  }
});

it('rejects conflicting tags and manifests before creating records', async () => {
  const state = fixture();
  state.tags.set('@weftlet/toolkit@0.1.2', { object: { type: 'commit', sha: 'b'.repeat(40) } });
  await expect(createReleaseRecords({ ...state, manifest, expectedCommit: commit })).rejects.toThrow('Refusing to move');
  expect(state.calls.every((call) => call.method === 'GET')).toBe(true);
  await expect(createReleaseRecords({ ...fixture(), manifest, expectedCommit: 'b'.repeat(40) })).rejects.toThrow('manifest');
});

it('recovers when recording stops after a tag was created', async () => {
  const state = fixture();
  let fail = true;
  const github = async (method: string, path: string, body: unknown) => {
    if (path === 'releases' && method === 'POST' && fail) {
      fail = false;
      throw new Error('interrupted');
    }
    return state.github(method, path, body);
  };
  const options = { ...state, github, manifest, expectedCommit: commit };
  await expect(createReleaseRecords(options)).rejects.toThrow('interrupted');
  expect(state.tags.size).toBe(1);
  await createReleaseRecords(options);
  expect(state.tags.size).toBe(2);
  expect(state.releases.size).toBe(2);
});
