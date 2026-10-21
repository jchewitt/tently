import '../runtime-check.mjs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { access, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pnpmInvocation } from './package-manager.mjs';
import { npmAuthOptions, releaseAuthentication } from './npm-auth.mjs';
import { runNpm } from './npm-command.mjs';
import { publishAndVerify } from './registry-publication.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const destination = join(root, '.release');
const registry = 'https://registry.npmjs.org';
const execute = (command, args, cwd = root) => execFileSync(command, args, {
  cwd, encoding: 'utf8', stdio: ['inherit', 'pipe', 'inherit'],
});
const git = (...args) => execute('git', args).trim();
const digest = (bytes) => createHash('sha512').update(bytes).digest('base64');
const entries = [
  ['@weftlet/core', 'packages/core'],
  ['@weftlet/toolkit', '.'],
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

function registryIntegrity(npmCli, pkg) {
  let output;
  try {
    output = execFileSync(process.execPath,
      [npmCli, 'view', `${pkg.name}@${pkg.version}`, 'dist.integrity', '--json',
        '--prefer-online', '--fetch-retries=0', '--fetch-timeout=15000',
        `--registry=${registry}`, ...authentication.args],
      { cwd: root, encoding: 'utf8', timeout: 20_000, stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (error) {
    let report;
    try { report = JSON.parse(String(error.stdout)); } catch {}
    if (report?.error?.code === 'E404') return null;
    throw new Error(`Unable to check registry state for ${pkg.name}; publication stopped. ` +
      'Authentication, network and registry errors are not treated as missing packages.');
  }
  const integrity = JSON.parse(output);
  if (typeof integrity !== 'string' || !integrity.startsWith('sha512-')) {
    throw new Error(`Registry returned invalid integrity for ${pkg.name}; publication stopped`);
  }
  return integrity;
}

async function main() {
  const mode = process.argv[2];
  const authArgument = process.argv[3];
  if (!['--prepare', '--publish'].includes(mode) || process.argv.length > 4 ||
      (authArgument !== undefined && (mode !== '--publish' || !['--auth=login', '--auth=oidc'].includes(authArgument)))) {
    throw new Error('Use pnpm release:prepare or pnpm release:publish [--auth=login|--auth=oidc]');
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
      const pkg = { name, version: manifest.version, filename,
        integrity: `sha512-${digest(await readFile(archive))}` };
      const existing = registryIntegrity(npmCli, pkg);
      if (existing !== null) {
        if (existing !== pkg.integrity) throw new Error(`${name}@${pkg.version} already exists with different bytes`);
        console.log(`Prepared archive matches existing release: ${name}@${pkg.version}`);
      } else {
        const inspection = JSON.parse(npm('publish', archive, '--dry-run', '--json', '--provenance=false'));
        if (inspection.name !== name || inspection.version !== manifest.version) throw new Error('Tarball identity mismatch');
      }
      packages.push(pkg);
    }
    const manifest = { commit, registry, packages };
    await writeFile(join(destination, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
    console.log(`Prepared and verified ${packages.length} packages at ${commit} in .release/`);
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
  const auth = releaseAuthentication(authArgument?.slice('--auth='.length) ?? 'login', npm('--version'));
  // OIDC is scoped to publish; whoami cannot establish trusted-publisher permission.
  authentication = await npmAuthOptions(undefined, { isolate: auth.isolate });
  if (auth.requiresWhoami) npm('whoami');
  for (const pkg of manifest.packages) {
    const receipt = join(destination, `${pkg.filename}.accepted.json`);
    await publishAndVerify({
      pkg,
      lookup: () => registryIntegrity(npmCli, pkg),
      wasAccepted: async () => {
        let saved;
        try { saved = JSON.parse(await readFile(receipt, 'utf8')); }
        catch (error) { if (error.code === 'ENOENT') return false; throw error; }
        if (saved.name !== pkg.name || saved.version !== pkg.version || saved.integrity !== pkg.integrity) {
          throw new Error(`Acceptance record differs from prepared archive for ${pkg.name}; inspect release state`);
        }
        return true;
      },
      publish: () => npm('publish', join(destination, pkg.filename), '--access=public',
        `--provenance=${process.env.GITHUB_ACTIONS === 'true'}`),
      recordAccepted: () => writeFile(receipt, `${JSON.stringify({
        name: pkg.name, version: pkg.version, integrity: pkg.integrity,
      }, null, 2)}\n`),
    });
  }
  console.log('Both packages are published and their registry integrity matches the prepared archives.');
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
}).finally(() => authentication.cleanup());
