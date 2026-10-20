import '../runtime-check.mjs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { access, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pnpmInvocation } from './package-manager.mjs';
import { npmAuthOptions } from './npm-auth.mjs';
import { runNpm } from './npm-command.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const destination = join(root, '.release');
const registry = 'https://registry.npmjs.org';
const execute = (command, args, cwd = root) => execFileSync(command, args, {
  cwd, encoding: 'utf8', stdio: ['inherit', 'pipe', 'inherit'],
});
const git = (...args) => execute('git', args).trim();
const digest = (bytes) => createHash('sha512').update(bytes).digest('base64');
const entries = [
  ['@launch-echo/tently-core', 'packages/core'],
  ['@launch-echo/tently', '.'],
];
let authentication = { args: [], cleanup: async () => {} };

async function npmCliPath() {
  for (const path of [
    ...(process.env.npm_execpath?.endsWith('npm-cli.js') ? [process.env.npm_execpath] : []),
    join(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js'),
    resolve(dirname(process.execPath), '../lib/node_modules/npm/bin/npm-cli.js'),
  ]) {
    try { await access(path); return path; } catch {}
  }
  throw new Error('Install Node with npm before preparing a release');
}

async function main() {
  const mode = process.argv[2];
  if (!['--prepare', '--publish'].includes(mode) || process.argv.length !== 3) {
    throw new Error('Use pnpm release:prepare or pnpm release:publish');
  }
  if (git('status', '--porcelain=v1', '--untracked-files=normal')) {
    throw new Error('Commit the reviewed source and documentation before preparing or publishing a release');
  }
  const commit = git('rev-parse', 'HEAD');
  const npmCli = await npmCliPath();
  const npm = (...args) => runNpm(npmCli, [...args, `--registry=${registry}`, ...authentication.args], root);
  if (mode === '--prepare') {
    await mkdir(destination, { recursive: true });
    const packages = [];
    for (const [name, directory] of entries) {
      const packageRoot = resolve(root, directory);
      const manifest = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8'));
      if (manifest.name !== name || manifest.private || manifest.publishConfig?.access !== 'public') {
        throw new Error(`Unexpected release metadata for ${name}`);
      }
      if (!process.env.npm_execpath) throw new Error('Run through pnpm release:prepare to resolve workspace dependency ranges');
      const invocation = pnpmInvocation(['pack', '--pack-destination', destination]);
      execute(invocation.command, invocation.args, packageRoot);
      const filename = `${name.replace(/^@/, '').replaceAll('/', '-')}-${manifest.version}.tgz`;
      if (!(await readdir(destination)).includes(filename)) throw new Error(`Missing archive: ${filename}`);
      const archive = join(destination, filename);
      const inspection = JSON.parse(npm('publish', archive, '--dry-run', '--json', '--provenance=false'));
      if (inspection.name !== name || inspection.version !== manifest.version) throw new Error('Tarball identity mismatch');
      packages.push({ name, version: manifest.version, filename,
        integrity: `sha512-${digest(await readFile(archive))}` });
    }
    const manifest = { commit, registry, packages };
    await writeFile(join(destination, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
    console.log(`Prepared and dry-run checked ${packages.length} packages at ${commit} in .release/`);
    console.log('Review .release/manifest.json, then run pnpm release:publish with an authorized npm identity.');
    return;
  }
  const manifest = JSON.parse(await readFile(join(destination, 'manifest.json'), 'utf8'));
  if (manifest.commit !== commit || manifest.registry !== registry || manifest.packages.length !== entries.length) {
    throw new Error('Release manifest does not match this checkout; rerun pnpm release:prepare');
  }
  // Validate every archive before any external write.
  for (const [index, pkg] of manifest.packages.entries()) {
    const filename = `${pkg.name.replace(/^@/, '').replaceAll('/', '-')}-${pkg.version}.tgz`;
    if (pkg.name !== entries[index][0] || pkg.filename !== filename || filename.includes('..') ||
        pkg.integrity !== `sha512-${digest(await readFile(join(destination, filename)))}`) {
      throw new Error('Release archive identity or integrity mismatch');
    }
  }
  // Use the operator's login or the secure cloud variable reference; never persist its value.
  authentication = await npmAuthOptions();
  npm('whoami');
  for (const pkg of manifest.packages) {
    let existing;
    try {
      existing = JSON.parse(execFileSync(process.execPath,
        [npmCli, 'view', `${pkg.name}@${pkg.version}`, 'dist.integrity', '--json', `--registry=${registry}`, ...authentication.args],
        { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
    } catch (error) {
      let report;
      try { report = JSON.parse(String(error.stdout)); } catch {}
      if (report?.error?.code !== 'E404') throw new Error(`Unable to check registry state for ${pkg.name}; no publish attempted for it`);
    }
    if (existing) {
      if (existing !== pkg.integrity) throw new Error(`${pkg.name}@${pkg.version} already exists with different bytes`);
      console.log(`Already published with matching integrity: ${pkg.name}@${pkg.version}`);
      continue;
    }
    console.log(`Publishing ${pkg.name}@${pkg.version}`);
    npm('publish', join(destination, pkg.filename), '--access=public',
      `--provenance=${process.env.GITHUB_ACTIONS === 'true'}`);
    const actual = JSON.parse(npm('view', `${pkg.name}@${pkg.version}`, 'dist.integrity', '--json'));
    if (actual !== pkg.integrity) throw new Error(`Published integrity could not be verified for ${pkg.name}; inspect registry state before retrying`);
  }
  console.log('Both packages are published and their registry integrity matches the prepared archives.');
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
}).finally(() => authentication.cleanup());
