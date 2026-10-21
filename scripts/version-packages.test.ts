import { execFile } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { expect, it } from 'vitest';
import { checkReleasePlan, validateReleasePlan } from './release-plan.mjs';

const execute = promisify(execFile);
const original = resolve(import.meta.dirname, '..');

it.each([
  ['@weftlet/toolkit', 'patch', '0.1.2'],
  ['@weftlet/core', 'minor', '0.2.0'],
])('versions the real root/core workspace for %s %s without publishing', async (name, bump, version) => {
  const root = await mkdtemp(join(tmpdir(), 'weftlet-version-'));
  const git = (...args: string[]) => execute('git', args, { cwd: root });
  try {
    await mkdir(join(root, '.changeset'), { recursive: true });
    await mkdir(join(root, 'packages/core'), { recursive: true });
    await mkdir(join(root, 'scripts'), { recursive: true });
    await mkdir(join(root, 'docs'), { recursive: true });
    await mkdir(join(root, 'node_modules/@changesets'), { recursive: true });
    for (const path of ['package.json', 'packages/core/package.json', 'pnpm-workspace.yaml',
      'pnpm-lock.yaml', '.changeset/config.json', 'scripts/update-inventory.mjs']) {
      await cp(join(original, path), join(root, path));
    }
    // Keep this fixture independent of future package version bumps.
    for (const path of ['package.json', 'packages/core/package.json']) {
      const pkg = JSON.parse(await readFile(join(root, path), 'utf8'));
      pkg.version = '0.1.1';
      await writeFile(join(root, path), JSON.stringify(pkg, null, 2) + '\n');
    }
    await symlink(await realpath(join(original, 'node_modules/@changesets/cli')),
      join(root, 'node_modules/@changesets/cli'), process.platform === 'win32' ? 'junction' : 'dir');
    await writeFile(join(root, '.gitignore'), 'node_modules/\n.release/\n');
    await writeFile(join(root, 'docs/extraction-manifest.json'), JSON.stringify({ imports: [], authoredPaths: [] }));
    await writeFile(join(root, '.changeset/fixture.md'), `---\n"${name}": ${bump}\n---\n\nPublic fixture change.\n`);
    await git('init', '--quiet', '--initial-branch=main');
    await git('add', '.');
    await git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false',
      'commit', '--quiet', '-m', 'fixture');
    const module = new URL('./version-packages.mjs', import.meta.url).href;
    const script = `import { versionPackages } from ${JSON.stringify(module)}; await versionPackages(${JSON.stringify(root)});`;
    await execute(process.execPath, ['--input-type=module', '--eval', script], { cwd: root, timeout: 45_000 });
    const plan = await checkReleasePlan(root);
    expect(plan.packages.map((pkg: { version: string }) => pkg.version)).toEqual([version, version]);
    expect(plan.changesets).toEqual(['fixture.md']);
    for (const path of ['package.json', 'packages/core/package.json']) {
      expect(JSON.parse(await readFile(join(root, path), 'utf8')).version).toBe(version);
    }
    expect(await readFile(join(root, 'CHANGELOG.md'), 'utf8')).toContain(version);
    expect(await readFile(join(root, 'packages/core/CHANGELOG.md'), 'utf8')).toContain(version);
    await expect(readFile(join(root, '.changeset/fixture.md'))).rejects.toMatchObject({ code: 'ENOENT' });
    const inventory = JSON.parse(await readFile(join(root, 'docs/extraction-manifest.json'), 'utf8'));
    expect(inventory.authoredPaths).toContain('.changeset/release-plan.json');
    expect(inventory.authoredPaths).not.toContain('.changeset/fixture.md');
    await git('add', '.');
    await execute(process.execPath, ['scripts/update-inventory.mjs', '--check'], { cwd: root });
    await expect(execute(process.execPath, ['--input-type=module', '--eval', script], { cwd: root }))
      .rejects.toMatchObject({ stderr: expect.stringContaining('No pending changesets') });
    await writeFile(join(root, '.changeset/unreleased.md'), '---\n"@weftlet/toolkit": patch\n---\nPending\n');
    await expect(checkReleasePlan(root)).rejects.toThrow('pending changesets');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 60_000);

it('rejects stale, split and non-advancing release plans', () => {
  const versions = ['@weftlet/core', '@weftlet/toolkit'].map((name) => ({ name, version: '0.1.2' }));
  const plan = { schemaVersion: 1, changesets: ['fixture.md'],
    packages: versions.map((pkg) => ({ ...pkg, previousVersion: '0.1.1' })) };
  expect(() => validateReleasePlan(plan, versions)).not.toThrow();
  expect(() => validateReleasePlan(plan, [{ ...versions[0], version: '0.1.3' }, versions[1]])).toThrow('committed');
  expect(() => validateReleasePlan({ ...plan, packages: plan.packages.map((pkg) => ({ ...pkg, previousVersion: '0.1.2' })) }, versions))
    .toThrow('advance');
  expect(() => validateReleasePlan({ ...plan, changesets: [] }, versions)).toThrow('Invalid');
  const split = [{ ...versions[0], version: '0.1.3' }, versions[1]];
  expect(() => validateReleasePlan({ ...plan, packages: split.map((pkg) => ({ ...pkg, previousVersion: '0.1.1' })) }, split))
    .toThrow('group versions');
});
