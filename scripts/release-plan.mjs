import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

export const packages = [
  { name: '@weftlet/core', path: 'packages/core/package.json' },
  { name: '@weftlet/toolkit', path: 'package.json' },
];

export function stableVersion(version) {
  return typeof version === 'string' && /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version);
}

export async function packageVersions(root) {
  return Promise.all(packages.map(async ({ name, path }) => {
    const manifest = JSON.parse(await readFile(join(root, path), 'utf8'));
    if (manifest.name !== name || !stableVersion(manifest.version)) throw new Error(`Invalid release package: ${name}`);
    return { name, version: manifest.version };
  }));
}

export async function pendingChangesets(root) {
  return (await readdir(join(root, '.changeset'))).filter((name) => name.endsWith('.md') && name !== 'README.md').sort();
}

export function validateReleasePlan(plan, versions) {
  if (plan?.schemaVersion !== 1 || !Array.isArray(plan.packages) || plan.packages.length !== packages.length ||
      !Array.isArray(plan.changesets) || plan.changesets.length === 0) throw new Error('Invalid generated release plan');
  for (const [index, expected] of packages.entries()) {
    const item = plan.packages[index];
    const current = versions.find((pkg) => pkg.name === expected.name);
    if (item?.name !== expected.name || !stableVersion(item.version) || !stableVersion(item.previousVersion) ||
        current?.version !== item.version) throw new Error('Release plan does not match committed package versions');
    const before = item.previousVersion.split('.').map(BigInt);
    const after = item.version.split('.').map(BigInt);
    const difference = after.findIndex((value, part) => value !== before[part]);
    if (difference < 0 || after[difference] <= before[difference]) throw new Error('Release versions must advance');
  }
  if (new Set(plan.packages.map((pkg) => pkg.version)).size !== 1) throw new Error('Fixed release group versions must match');
}

export async function checkReleasePlan(root) {
  if ((await pendingChangesets(root)).length) throw new Error('Merge the generated release PR before publishing pending changesets');
  const plan = JSON.parse(await readFile(join(root, '.changeset/release-plan.json'), 'utf8'));
  validateReleasePlan(plan, await packageVersions(root));
  return plan;
}
