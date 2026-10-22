import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { expect, it } from 'vitest';
import { GitRepository } from '../repository/git.js';
import { sha256 } from '../infrastructure/util.js';
import { ScipSymbolExtractor, ScipTypeScriptIndexer } from './static.js';
import { prepareScipSourceProject } from './scip-project.js';
import { buildWorkingOverlay } from '../application/overlay.js';
import { FileSnapshotStore } from '../storage/storage.js';
import type { ContextGraphConfig } from '../configuration/config.js';
import { stableJson } from '../infrastructure/util.js';

it('links committed workspace contracts and excluded tests through real SCIP, preserving dirty bytes and rename/delete boundaries', async () => {
  const root = await mkdtemp(join(tmpdir(), 'weftlet-source-project-'));
  const execute = promisify(execFile);
  const git = (...args: string[]) => execute('git', args, { cwd: root });
  const write = async (path: string, text: string) => { await writeFile(join(root, path), text); };
  const contract = 'export interface Order { quantity: number }\n';
  try {
    for (const directory of ['src', 'tests', 'packages/contracts']) await mkdir(join(root, directory), { recursive: true });
    await write('.gitignore', '.context-graph/\nnode_modules/\ntests/ignored.test.ts\n');
    await write('package.json', '{"name":"source-project-fixture","version":"1.0.0","type":"module"}');
    await write('packages/contracts/package.json', '{"name":"@fixture/contracts","version":"1.0.0","type":"module","types":"dist/index.d.ts"}');
    await write('packages/contracts/schema.ts', contract);
    await write('packages/contracts/index.ts', "export type { Order } from './schema.js';\n");
    await write('src/consumer.ts', "import type { Order } from '@fixture/contracts';\nexport function total(order: Order) { return order.quantity; }\n");
    await write('tests/order.test.ts', "import { total } from '../src/consumer.js';\nimport type { Order } from '@fixture/contracts';\nconst order: Order = { quantity: 1 };\nexport const result = total(order);\n");
    await write('tsconfig.json', '{"include":["src/**/*.ts"],"exclude":["tests"]}');
    await git('init', '--quiet'); await git('add', '.');
    const commit = () => git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid',
      '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'source fixture');
    await commit();
    const repository = new GitRepository(root);
    const sha = await repository.resolveRef('HEAD');
    const context = { repositoryRoot: root, repositoryId: 'fixture', ref: sha, commitSha: sha,
      snapshotId: sha, changedPaths: [], deletedPaths: [], renamedPaths: {} };
    await write('packages/contracts/schema.ts', 'export interface DirtyOnly { changed: true }\n');
    await write('tests/ignored.test.ts', 'export const shouldNeverAppear = true;\n');
    const before = await git('status', '--porcelain');
    const scip = { version: '0.4.0', command: 'bundled-scip-typescript',
      args: ['index', '--no-global-caches'], sourceProject: { include: ['src/**/*.ts', 'tests/**/*.ts', 'packages/**/*.ts'],
        aliases: { '@fixture/contracts': 'packages/contracts/index.ts' } } };
    const indexer = new ScipTypeScriptIndexer(scip, join(root, '.context-graph'));
    const index = await indexer.index(context);
    const repeated = await indexer.index({ ...context, snapshotId: `${sha}-repeat` });
    expect(repeated.digest).toBe(index.digest);
    const facts = await new ScipSymbolExtractor(repository, index).extract(context);
    const definition = facts.find((fact) => fact.provenance.path === 'packages/contracts/schema.ts' &&
      fact.predicate === 'contains' && fact.object.label.includes('Order#'));
    expect(definition?.provenance.digest).toBe(sha256(contract));
    for (const path of ['src/consumer.ts', 'tests/order.test.ts']) {
      expect(facts.some((fact) => fact.provenance.path === path && fact.predicate === 'consumes' &&
        fact.object.id === definition?.object.id)).toBe(true);
    }
    expect(facts.find((fact) => fact.provenance.path === 'tests/order.test.ts')?.subject.kind).toBe('Evidence');
    expect(facts.every((fact) => fact.provenance.commitSha === sha)).toBe(true);
    expect(facts.some((fact) => fact.provenance.path === 'tests/ignored.test.ts')).toBe(false);
    expect((await git('status', '--porcelain')).stdout).toBe(before.stdout);
    expect(await readFile(join(root, 'packages/contracts/schema.ts'), 'utf8')).toContain('DirtyOnly');
    await expect(readFile(join(root, '.weftlet-scip-source-project.json'))).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(readFile(join(root, 'node_modules/.modules.yaml'))).rejects.toMatchObject({ code: 'ENOENT' });

    const config: ContextGraphConfig = JSON.parse(await readFile(
      new URL('../../examples/generic-typescript/context-graph.config.json', import.meta.url), 'utf8'));
    Object.assign(config, { scip, codeRoots: ['src'], evidenceRoots: ['tests'] });
    const store = new FileSnapshotStore(join(root, '.context-graph'));
    await store.write({ manifest: { schemaVersion: 1, repositoryId: 'fixture', ref: sha, commitSha: sha,
      snapshotId: sha, contentDigest: sha256(stableJson(facts)), configurationDigest: sha256(stableJson(config)),
      ontologyVersion: '1', extractorVersions: {}, semanticModel: 'none', semanticPromptVersion: 'none',
      generatedAt: '', semanticArtifactKeys: [], scipIndexDigest: index.digest, rdfDigest: '' },
      facts, invariants: [], runtimeEvidence: [], unresolved: [] });
    const overlay = await buildWorkingOverlay(repository, config, store, join(root, '.context-graph'), sha);
    expect(overlay.manifest.overlayCapture?.files).toContainEqual({ path: 'packages/contracts/schema.ts',
      digest: sha256('export interface DirtyOnly { changed: true }\n') });
    expect(overlay.facts.some((fact) => fact.predicate === 'contains' && fact.object.label.includes('Order#'))).toBe(false);
    expect(overlay.facts.every((fact) => fact.authority === 'draft')).toBe(true);

    await write('packages/contracts/schema.ts', contract);
    await rename(join(root, 'tests/order.test.ts'), join(root, 'tests/renamed.test.ts'));
    await rm(join(root, 'src/consumer.ts'));
    await write('tests/renamed.test.ts', "import type { Order } from '@fixture/contracts';\nexport const order: Order = { quantity: 2 };\n");
    await git('add', '.'); await commit();
    const nextSha = await repository.resolveRef('HEAD');
    const next = { ...context, commitSha: nextSha, ref: nextSha, snapshotId: nextSha };
    const changedFacts = await new ScipSymbolExtractor(repository, await indexer.index(next)).extract(next);
    expect(changedFacts.some((fact) => ['src/consumer.ts', 'tests/order.test.ts'].includes(fact.provenance.path))).toBe(false);
    expect(changedFacts.some((fact) => fact.provenance.path === 'tests/renamed.test.ts' &&
      fact.predicate === 'consumes' && fact.object.label.includes('Order#'))).toBe(true);
  } finally { await rm(root, { recursive: true, force: true }); }
}, 30_000);

it('fails before indexing on absent aliases, empty/oversized scopes and reserved generated paths', async () => {
  const root = await mkdtemp(join(tmpdir(), 'weftlet-source-project-invalid-'));
  try {
    await expect(prepareScipSourceProject(root, { include: ['src/*.ts'], aliases: { '@fixture/core': 'absent.ts' } }, ['src/input.ts']))
      .rejects.toThrow('absent committed file');
    await expect(prepareScipSourceProject(root, { include: ['src/*.ts'], aliases: { '@fixture/core': 'packages/index.ts' } },
      ['src/input.ts', 'packages/index.ts'])).rejects.toThrow('must be selected');
    await expect(prepareScipSourceProject(root, { include: ['tests/*.ts'] }, ['src/input.ts']))
      .rejects.toThrow('1–5000');
    await expect(prepareScipSourceProject(root, { include: ['src/*.ts'] }, Array.from({ length: 5001 }, (_, i) => `src/${i}.ts`)))
      .rejects.toThrow('1–5000');
    await expect(prepareScipSourceProject(root, { include: ['src/*.ts'] }, ['src/input.ts', '.weftlet-scip-source-project.json']))
      .rejects.toThrow('already tracked');
  } finally { await rm(root, { recursive: true, force: true }); }
});
