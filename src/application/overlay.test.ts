import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rename, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { expect, it } from 'vitest';
import { buildWorkingOverlay } from "./overlay.js";
import { GitRepository } from "../repository/git.js";
import { FileSnapshotStore } from "../storage/storage.js";
import { sha256, stableJson } from "../infrastructure/util.js";
import type { ContextGraphConfig } from "../configuration/config.js";
import type { GraphSnapshot } from "@weftlet/core";
import { ScipSymbolExtractor, ScipTypeScriptIndexer } from "../extraction/static.js";
import { SnapshotImpactQueryService } from "../graph/query.js";
import { SavedEvidenceQueryService } from "./saved-evidence.js";

it.each([false, true])('replaces edits/deletes/renames without advancing committed evidence (source project=%s)', async (sourceProject) => {
  const root = await mkdtemp(join(tmpdir(), 'overlay-fixture-'));
  const execute = promisify(execFile);
  const git = (...args: string[]) => execute('git', args, { cwd: root });
  await mkdir(join(root, 'src'));
  await writeFile(join(root, '.gitignore'), '.context-graph/\n');
  await writeFile(join(root, 'package.json'), '{"name":"overlay-fixture","version":"1.0.0"}');
  await writeFile(join(root, 'tsconfig.json'), '{"include":["src/**/*.ts"]}');
  await writeFile(join(root, 'src/input.ts'), 'export interface Input { value: number }\n');
  await writeFile(join(root, 'src/consumer.ts'), "import { Input } from './input';\nexport const input: Input = { value: 1 };\n");
  await git('init', '--quiet'); await git('add', '.');
  await git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid',
    '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'fixture');
  const config: ContextGraphConfig = JSON.parse(await readFile(
    new URL("../../examples/generic-typescript/context-graph.config.json", import.meta.url), 'utf8',
  ));
  if (sourceProject) Object.assign(config, { codeRoots: [], evidenceRoots: [], scip: {
    version: '0.4.0', command: 'bundled-scip-typescript', args: ['index', '--no-global-caches'],
    sourceProject: { include: ['src/**/*.ts'], aliases: {} },
  } });
  const repository = new GitRepository(root);
  const sha = await repository.resolveRef('HEAD');
  const storage = join(root, '.context-graph');
  const context = { repositoryRoot: root, repositoryId: config.repositoryId, ref: 'HEAD',
    commitSha: sha, snapshotId: sha, changedPaths: [], deletedPaths: [], renamedPaths: {} };
  const index = await new ScipTypeScriptIndexer(config.scip, storage).index(context);
  const originalFacts = await new ScipSymbolExtractor(repository, index).extract(context);
  expect(originalFacts.some((fact) => fact.provenance.path === 'src/input.ts')).toBe(true);
  const base: GraphSnapshot = {
    manifest: {
      schemaVersion: 1, repositoryId: config.repositoryId, ref: 'HEAD', commitSha: sha,
      snapshotId: sha, configurationDigest: sha256(stableJson(config)), contentDigest: 'base',
      ontologyVersion: '1', extractorVersions: {}, semanticModel: 'test',
      semanticPromptVersion: '1', generatedAt: '', semanticArtifactKeys: [],
      scipIndexDigest: '', rdfDigest: '',
    },
    facts: originalFacts, runtimeEvidence: [], invariants: [], unresolved: [],
  };
  const store = new FileSnapshotStore(storage);
  await store.write(base); await store.updateHead('default', sha);
  await rename(join(root, 'src/input.ts'), join(root, 'src/contract.ts'));
  await writeFile(join(root, 'src/consumer.ts'), "import { Input } from './contract';\nexport const input: Input = { value: 2 };\n");
  const first = await buildWorkingOverlay(repository, config, store, storage, sha, 'agent-a');
  expect(first.facts.some((fact) => fact.predicate === 'consumes')).toBe(true);
  expect(first.facts.every((fact) => fact.authority === 'draft')).toBe(true);
  expect(first.facts.some((fact) => fact.provenance.path === 'src/input.ts')).toBe(false);
  expect(first.facts.some((fact) => fact.provenance.path === 'src/contract.ts')).toBe(true);
  const queries = new SavedEvidenceQueryService(new SnapshotImpactQueryService(store, 'default'),
    repository, sha256(stableJson(config)));
  const scan = () => queries.scan({ snapshotId: first.manifest.snapshotId });
  expect((await scan()).evidenceState).toMatchObject({
    stale: false, overlayFreshness: 'current', excludedWorkingChanges: [],
    capturedWorkingChanges: ['src/consumer.ts', 'src/contract.ts', 'src/input.ts'],
  });
  const capturedConsumer = await readFile(join(root, 'src/consumer.ts'), 'utf8');
  await writeFile(join(root, 'src/consumer.ts'), capturedConsumer.replace('value: 2', 'value: 3'));
  expect((await scan()).evidenceState).toMatchObject({
    stale: true, overlayFreshness: 'stale', excludedWorkingChanges: ['src/consumer.ts'],
    changedSinceCapture: ['src/consumer.ts'],
  });
  // A reversion to the committed bytes also invalidates captured evidence, even if Git reports no change.
  await writeFile(join(root, 'src/consumer.ts'), await repository.readFileAt(sha, 'src/consumer.ts'));
  expect((await scan()).evidenceState?.changedSinceCapture).toEqual(['src/consumer.ts']);
  await writeFile(join(root, 'src/consumer.ts'), capturedConsumer);
  await writeFile(join(root, 'src/new.ts'), 'export const added = true;\n');
  expect((await scan()).evidenceState).toMatchObject({
    stale: true, changedSinceCapture: ['src/new.ts'], excludedWorkingChanges: ['src/new.ts'],
  });
  await rm(join(root, 'src/new.ts'));
  const legacy = { ...first, manifest: { ...first.manifest, snapshotId: 'legacy', overlayCapture: undefined } };
  await store.write(legacy);
  expect((await queries.scan({ snapshotId: 'legacy' })).evidenceState).toMatchObject({
    stale: true, overlayFreshness: 'unknown',
  });
  const repeated = await buildWorkingOverlay(repository, config, store, storage, sha, 'agent-b');
  expect(repeated.manifest.snapshotId).toBe(first.manifest.snapshotId);
  await rm(join(root, 'src/consumer.ts'));
  const deleted = await buildWorkingOverlay(repository, config, store, storage, sha);
  expect(deleted.manifest.overlayDigest).not.toBe(first.manifest.overlayDigest);
  expect(deleted.facts.some((fact) => fact.provenance.path === 'src/consumer.ts')).toBe(false);
  expect(await store.readHead('default')).toEqual(base);
  expect(await repository.resolveRef('HEAD')).toBe(sha);
  expect((await repository.workingChanges())).toContain('src/input.ts');
  expect(await store.read(first.manifest.snapshotId)).toEqual(first);
}, 30_000);
