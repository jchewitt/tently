import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { FileSnapshotStore } from '../dist/storage/storage.js';
import { createContextGraphApplication } from '../dist/application/application.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const store = new FileSnapshotStore(`${root}/.context-graph`);
const proofPath = new URL('../.context-graph/restoration-proof.json', import.meta.url);
const configPath = new URL('../.context-graph/restoration-config.json', import.meta.url);
const digest = (snapshot) => createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
const mode = process.argv[2];
if (!['--checkpoint', '--verify'].includes(mode)) throw new Error('Use --checkpoint before publishing the environment, or --verify after restoration');

if (mode === '--checkpoint') {
  const report = JSON.parse(await readFile(new URL('../.context-graph/architecture-report.json', import.meta.url), 'utf8'));
  const snapshot = await store.read(report.snapshotId ?? report.snapshot?.manifest.snapshotId);
  if (!snapshot?.facts.length) throw new Error('Run pnpm govern first to produce public repository evidence');
  const config = JSON.parse(await readFile(new URL('../architecture.context-graph.config.json', import.meta.url), 'utf8'));
  config.repositoryRoot = '..';
  config.semantic = { ...config.semantic, provider: 'module',
    providerModule: './__intentionally_unavailable_restoration_provider__.mjs',
    providerIdentity: 'unavailable-restoration-probe' };
  await writeFile(configPath, JSON.stringify(config, null, 2) + '\n');
  const queryPath = snapshot.facts.find((fact) => fact.provenance.path.startsWith('src/'))?.provenance.path;
  if (!queryPath) throw new Error('Architecture evidence has no runtime source citation');
  await writeFile(proofPath, JSON.stringify({ snapshotId: snapshot.manifest.snapshotId,
    commitSha: snapshot.manifest.commitSha, contentDigest: snapshot.manifest.contentDigest,
    sha256: digest(snapshot), queryPath }, null, 2) + '\n');
  console.log('Saved an ignored evidence checkpoint. Publish the environment, then verify in a new cloud task.');
} else {
  const proof = JSON.parse(await readFile(proofPath, 'utf8'));
  const snapshot = await store.read(proof.snapshotId);
  if (!snapshot || digest(snapshot) !== proof.sha256 || snapshot.manifest.contentDigest !== proof.contentDigest) {
    throw new Error('Retained evidence is missing or changed; do not regenerate the checkpoint to claim restoration');
  }
  const application = await createContextGraphApplication(fileURLToPath(configPath));
  const pack = await application.queryService.scan({ snapshotId: proof.snapshotId,
    changedFiles: [proof.queryPath], maxFacts: 10 });
  if (pack.snapshot.snapshotId !== proof.snapshotId || !pack.facts.length ||
      pack.evidenceState?.eligibleForCurrentDiffValidation !== false) {
    throw new Error('Saved evidence query or historical-evidence labeling failed');
  }
  console.log(JSON.stringify({ passed: true, snapshotId: proof.snapshotId, facts: pack.facts.length,
    provider: 'intentionally unavailable', eligibleForCurrentDiffValidation: false,
    note: 'This verifies retained evidence. Claim cloud restoration only when run in a genuinely new task.' }));
}
