import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createReleaseRecords } from './release-records.mjs';

const repository = 'jchewitt/weftlet';
if (process.env.GITHUB_REPOSITORY !== repository || !process.env.GH_TOKEN) {
  throw new Error('Release records require the repository workflow with a contents-write GitHub token');
}
const root = fileURLToPath(new URL('../', import.meta.url));
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
if (commit !== process.env.GITHUB_SHA) throw new Error('Release checkout does not match the workflow commit');
const manifest = JSON.parse(await readFile(new URL('../.release/manifest.json', import.meta.url), 'utf8'));
const tags = await createReleaseRecords({
  manifest, expectedCommit: commit,
  lookup: async (pkg) => {
    const response = await fetch(`https://registry.npmjs.org/${encodeURIComponent(pkg.name)}`, {
      headers: { accept: 'application/json', 'cache-control': 'no-cache' }, signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`Registry lookup failed (${response.status}) for ${pkg.name}`);
    return (await response.json()).versions?.[pkg.version]?.dist?.integrity;
  },
  github: async (method, path, body) => {
    const response = await fetch(`https://api.github.com/repos/${repository}/${path}`, {
      method, signal: AbortSignal.timeout(30_000),
      headers: { authorization: `Bearer ${process.env.GH_TOKEN}`, accept: 'application/vnd.github+json',
        'content-type': 'application/json', 'x-github-api-version': '2022-11-28' },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (method === 'GET' && response.status === 404) return undefined;
    if (!response.ok) throw Object.assign(new Error(`GitHub release-record request failed (${response.status}): ${method} ${path}`), { status: response.status });
    return response.json();
  },
});
console.log(`Verified release records: ${tags.join(', ')}`);
