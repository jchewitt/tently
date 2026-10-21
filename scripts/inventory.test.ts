import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, expect, it } from 'vitest';

const execute = promisify(execFile);
const roots: string[] = [];
const hash = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex');
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });

async function fixture(attributes = '') {
  const root = await mkdtemp(join(tmpdir(), 'weftlet-inventory-'));
  roots.push(root);
  const git = (...args: string[]) => execute('git', args, { cwd: root });
  const run = (...args: string[]) => execute(process.execPath, ['scripts/update-inventory.mjs', ...args], { cwd: root });
  await mkdir(join(root, 'scripts'));
  await mkdir(join(root, 'docs'));
  await cp(resolve('scripts/update-inventory.mjs'), join(root, 'scripts/update-inventory.mjs'));
  await writeFile(join(root, '.gitattributes'), attributes);
  await writeFile(join(root, 'intent.md'), '# Public intent\nA worker consumes a contract.\n');
  const manifest = { imports: [{ sourcePath: 'original/intent.md', destinationPath: 'intent.md',
    sourceSha256: hash(await readFile(join(root, 'intent.md'))) }], authoredPaths: [] };
  await writeFile(join(root, 'docs/extraction-manifest.json'), JSON.stringify(manifest));
  await git('init', '--quiet', '--initial-branch=main');
  await git('config', 'core.autocrlf', 'false');
  await run();
  await git('add', '.');
  await git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'fixture');
  return { root, git, run };
}

it.each(['autocrlf', 'attributes'])('accepts a real CRLF checkout via %s without changing bytes, index, config or source hashes', async mode => {
  const { root, git, run } = await fixture(mode === 'attributes' ? '* text eol=crlf\n' : '');
  if (mode === 'autocrlf') await git('config', 'core.autocrlf', 'true');
  await git('config', 'core.safecrlf', 'true');
  await rm(join(root, 'intent.md'));
  await rm(join(root, 'docs/extraction-manifest.json'));
  await git('checkout-index', '--force', '--all');
  const files = ['intent.md', 'docs/extraction-manifest.json', '.git/index', '.git/config'];
  const before = await Promise.all(files.map(f => readFile(join(root, f))));
  expect(before[0].toString()).toContain('\r\n');
  expect(before[1].toString()).toContain('\r\n');
  await run('--check');
  await run();
  for (const [index, path] of files.entries()) expect(await readFile(join(root, path)), path).toEqual(before[index]);
  await writeFile(join(root, 'intent.md'), before[0].toString().replace('worker', 'changed worker'));
  await expect(run('--check')).rejects.toThrow();
  await run();
  const updated = JSON.parse(await readFile(join(root, 'docs/extraction-manifest.json'), 'utf8'));
  const original = JSON.parse(before[1].toString());
  expect(updated.imports[0].sourceSha256).toBe(original.imports[0].sourceSha256);
  expect(updated.imports[0].destinationSha256).not.toBe(original.imports[0].destinationSha256);
  expect(await readFile(join(root, 'intent.md'), 'utf8')).toContain('<!-- Modified for standalone extraction; see docs/extraction-manifest.json. -->\r\n');
  await run('--check');
});

it('does not normalize binary or explicitly non-text bytes, or hide edits to the manifest', async () => {
  const { root, git, run } = await fixture('literal.bin -text\n');
  const binary = Buffer.from([0, 0xff, 13, 10, 65, 13, 10]);
  const literal = Buffer.from('Literal\r\nbytes\r\n');
  await writeFile(join(root, 'binary.bin'), binary);
  await writeFile(join(root, 'literal.bin'), literal);
  const manifest = JSON.parse(await readFile(join(root, 'docs/extraction-manifest.json'), 'utf8'));
  for (const [name, bytes] of [['binary.bin', binary], ['literal.bin', literal]] as const) {
    manifest.imports.push({ sourcePath: `original/${name}`, destinationPath: name, sourceSha256: hash(bytes) });
  }
  await writeFile(join(root, 'docs/extraction-manifest.json'), JSON.stringify(manifest));
  await git('config', 'core.autocrlf', 'true');
  await run();
  const updated = JSON.parse(await readFile(join(root, 'docs/extraction-manifest.json'), 'utf8'));
  expect(updated.imports.slice(1).map((e: { destinationSha256: string }) => e.destinationSha256)).toEqual([hash(binary), hash(literal)]);
  await run('--check');
  await writeFile(join(root, 'literal.bin'), 'Literal\nbytes\n');
  await expect(run('--check')).rejects.toThrow();
  await writeFile(join(root, 'literal.bin'), literal);
  updated.imports[0].sourceSha256 = '0'.repeat(64);
  await writeFile(join(root, 'docs/extraction-manifest.json'), JSON.stringify(updated, null, 2) + '\n');
  await expect(run('--check')).rejects.toThrow();
});

it('refuses custom clean filters without executing them', async () => {
  const { root, git, run } = await fixture();
  await writeFile(join(root, '.gitattributes'), 'intent.md filter=private-filter\n');
  await writeFile(join(root, 'intent.md'), '# Public intent\r\nA worker consumes a contract.\r\n');
  await git('config', 'filter.private-filter.clean', 'echo filter-was-run > unexpected-filter-output');
  await expect(run('--check')).rejects.toThrow('custom Git filter');
  await expect(readFile(join(root, 'unexpected-filter-output'))).rejects.toMatchObject({ code: 'ENOENT' });
});
