import { execFileSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { pnpmInvocation } from './package-manager.mjs';
import { packageVersions, pendingChangesets, validateReleasePlan } from './release-plan.mjs';

export async function versionPackages(root) {
  const previous = await packageVersions(root);
  const changesets = await pendingChangesets(root);
  if (!changesets.length) throw new Error('No pending changesets; no version bump performed');
  const pnpm = (args) => {
    const invocation = pnpmInvocation(args);
    execFileSync(invocation.command, invocation.args, { cwd: root, stdio: 'inherit' });
  };
  pnpm(['exec', 'changeset', 'version']);
  const versions = await packageVersions(root);
  const plan = {
    schemaVersion: 1,
    packages: versions.map((pkg, index) => ({ ...pkg, previousVersion: previous[index].version })),
    changesets,
  };
  validateReleasePlan(plan, versions);
  await writeFile(join(root, '.changeset/release-plan.json'), `${JSON.stringify(plan, null, 2)}\n`);
  pnpm(['install', '--lockfile-only', '--ignore-scripts']);
  execFileSync(process.execPath, ['scripts/update-inventory.mjs'], { cwd: root, stdio: 'inherit' });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  versionPackages(fileURLToPath(new URL('../', import.meta.url))).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
