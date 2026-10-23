import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';
import type { GraphSnapshot } from '@weftlet/core';
import { createContextGraphApplication } from '../src/application/application.js';
import { buildWorkingOverlay } from '../src/application/overlay.js';
import { routingExtractorIdentity } from '../src/extraction/routing.js';
import { documentLinkerIdentity } from '../src/extraction/document.js';
import { repositoryFileExtractorIdentity } from '../src/extraction/static.js';
import { CG, nodeIri, RdfEvidenceGraph } from '../src/graph/rdf.js';
import { sha256, stableJson } from '../src/infrastructure/util.js';

const execute = promisify(execFile);
const temporaryRoots: string[] = [];
afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

const routes = [
  { id: 'archive', scope: 'orders', channel: 'events', producer: 'src/publisher.ts', consumer: 'src/archive.ts' },
  { id: 'audit', scope: 'orders', channel: 'events', producer: 'src/other.ts', consumer: 'src/audit.ts' },
  { id: 'archive', scope: 'billing', channel: 'events', producer: 'src/invoice.ts', consumer: 'src/ledger.ts' },
];
const manifestText = (items = routes) => JSON.stringify({ schemaVersion: 1, routes: items }, null, 2) + '\n';
const routingFacts = (snapshot: GraphSnapshot) => snapshot.facts.filter((fact) => fact.extractor.id === routingExtractorIdentity.id);
const nodeIds = (snapshot: Pick<GraphSnapshot, 'facts'>) => new Set(snapshot.facts.flatMap((fact) => [fact.subject.id, fact.object.id]));

async function fixture(items = routes, enableRouting = true) {
  const root = await mkdtemp(join(tmpdir(), 'weftlet-routing-integration-'));
  temporaryRoots.push(root);
  await mkdir(join(root, 'src'));
  await mkdir(join(root, 'docs'));
  const files: Record<string, string> = {
    '.gitignore': '.context-graph/\nrouting.json\n',
    'package.json': JSON.stringify({ name: 'public-routing-fixture', version: '1.0.0', type: 'module' }),
    'tsconfig.json': JSON.stringify({ compilerOptions: { target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext', strict: true, noEmit: true }, include: ['src/**/*.ts'] }),
    'src/input.ts': 'export interface Input { readonly value: number }\n',
    'src/publisher.ts': "import type { Input } from './input.js';\nexport function publish(input: Input) { return input.value; }\n",
    // The archival consumer deliberately shares neither an import nor a symbol with the publisher.
    'src/archive.ts': 'export function archive(payload: string) { return payload.length; }\n',
    'src/other.ts': 'export const unrelatedPublisher = 1;\n',
    'src/audit.ts': 'export const auditEntry = 2;\n',
    'src/invoice.ts': 'export const invoiceEntry = 3;\n',
    'src/ledger.ts': 'export const ledgerEntry = 4;\n',
    'docs/context.md': '# Public fixture\nThis source intentionally declares no relationships.\n',
    'routing.json': manifestText(items),
    'provider.mjs': `export function createSemanticExtractor() {
      return { identity: 'routing-control:1', async extract() {
        return { parsed: { assertions: [], oml: '' }, rawModelOutput: '{}' };
      } };
    }\n`,
  };
  await Promise.all(Object.entries(files).map(([path, content]) => writeFile(join(root, path), content)));
  const config = JSON.parse(await readFile(new URL('../examples/generic-typescript/context-graph.config.json', import.meta.url), 'utf8'));
  Object.assign(config, { repositoryId: 'public/routing-fixture', evidenceRoots: [], approvedIntentSources: [],
    ...(enableRouting ? { routingSources: ['routing.json'] } : {}),
    semantic: { ...config.semantic, provider: 'module', providerModule: './provider.mjs', providerIdentity: 'routing-control:1' },
    scip: { version: '0.4.0', command: 'bundled-scip-typescript', args: ['index', '--no-global-caches', 'tsconfig.json'] },
  });
  const configPath = join(root, 'context-graph.config.json');
  await writeFile(configPath, JSON.stringify(config));
  const git = (...args: string[]) => execute('git', args, { cwd: root });
  const commit = async () => {
    await git('add', '-A');
    await git('-c', 'user.name=Routing Fixture', '-c', 'user.email=fixture@example.invalid',
      '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'Public routing fixture');
  };
  await git('init', '--quiet');
  // A committed mapping stays evidence even when ignore rules also match its path.
  // Draft materialization must preserve it when creating its isolated Git repository.
  await git('add', '--force', 'routing.json');
  await commit();
  return { root, config, configPath, git, commit, application: await createContextGraphApplication(configPath) };
}

describe('committed routing declarations in independent repositories', () => {
  it('links a typed upstream change across an explicit boundary without shared-channel cross products', async () => {
    const invalid = [
      { ...routes[0]!, id: 'missing', consumer: 'src/absent.ts' },
      { ...routes[0]!, id: 'duplicate' },
      { ...routes[1]!, id: 'duplicate' },
    ];
    const { root, config, configPath, application: control } = await fixture([...routes, ...invalid], false);
    const old = (await control.hydrator.hydrate({ ref: 'HEAD', headName: 'default' })).snapshot;
    const expectedV4Id = [old.manifest.commitSha, 'graph-v4', `links-${documentLinkerIdentity.version}`,
      `files-${repositoryFileExtractorIdentity.version}`, sha256(stableJson(control.config)).slice(0, 16),
      sha256(stableJson(control.config.semanticSources)).slice(0, 12)].join('-');
    expect(old.manifest.snapshotId).toBe(expectedV4Id);
    expect(routingFacts(old)).toEqual([]);
    const request = { changedFiles: ['src/input.ts'], maxFacts: 200, maxDepth: 32 };
    expect(nodeIds(await control.queryService.scan(request))).not.toContain('component:file:src/archive.ts');

    await writeFile(configPath, JSON.stringify({ ...config, routingSources: ['routing.json'],
      approvedIntentSources: ['routing.json'] }));
    const application = await createContextGraphApplication(configPath);
    const { snapshot } = await application.hydrator.hydrate({ ref: 'HEAD', headName: 'default' });
    expect(snapshot.manifest.snapshotId).not.toBe(old.manifest.snapshotId);
    const facts = routingFacts(snapshot);
    expect(facts).toHaveLength(6);
    expect(new Set(facts.flatMap((fact) => [fact.subject, fact.object]).filter((node) => node.kind === 'Workflow').map((node) => node.id)).size).toBe(3);
    const source = await readFile(join(root, 'routing.json'), 'utf8');
    for (const fact of facts) expect(fact).toMatchObject({
      authority: 'inferred', sourceAuthority: 'inferred', extractionReview: 'deterministic',
      extractor: routingExtractorIdentity,
      provenance: { path: 'routing.json', startLine: 1, endLine: source.split('\n').length,
        digest: sha256(source), commitSha: snapshot.manifest.commitSha },
    });
    expect(snapshot.diagnostics?.some((item) => item.reason.includes('src/absent.ts'))).toBe(true);
    expect(snapshot.diagnostics?.some((item) => /duplicat/i.test(item.reason))).toBe(true);
    const graph = new RdfEvidenceGraph(snapshot);
    expect((await graph.validate()).conforms).toBe(true);
    const projection = await graph.facts();
    expect(stableJson([...projection].sort((a, b) => a.id.localeCompare(b.id))))
      .toBe(stableJson([...snapshot.facts].sort((a, b) => a.id.localeCompare(b.id))));
    const paired = await graph.select(`SELECT ?producer ?consumer WHERE {
      ?producer <${CG}emits> ?binding . ?binding <${CG}routesThrough> ?consumer .
      FILTER(STRSTARTS(STR(?binding), ${JSON.stringify(nodeIri('workflow:routing:'))}))
    }`);
    expect(paired.rows.map((row) => `${row.producer}|${row.consumer}`).sort()).toEqual(routes.map((route) =>
      `${nodeIri(`component:file:${route.producer}`)}|${nodeIri(`component:file:${route.consumer}`)}`).sort());
    const pack = await application.queryService.scan(request);
    expect(nodeIds(pack)).toContain('component:file:src/archive.ts');
    for (const path of ['src/audit.ts', 'src/ledger.ts']) expect(nodeIds(pack)).not.toContain(`component:file:${path}`);
    expect(pack.facts.some((fact) => fact.extractor.id === 'scip-symbol-extractor' && fact.predicate === 'consumes')).toBe(true);
    expect(pack.exploration?.truncated).toBe(false);

    // Saved queries and committed hydration continue to use the committed manifest during edits.
    await writeFile(join(root, 'routing.json'), manifestText([]));
    const dirty = await application.queryService.scan(request);
    expect(dirty.facts).toEqual(pack.facts);
    expect(dirty.evidenceState?.excludedWorkingChanges).toContain('routing.json');
    const repeated = await application.hydrator.hydrate({ ref: 'HEAD', headName: 'default' });
    expect(repeated.semanticExtracted).toBe(0);
    expect(repeated.semanticReused).toBe(1);
    expect(repeated.snapshot.manifest.contentDigest).toBe(snapshot.manifest.contentDigest);
    expect(repeated.snapshot.manifest.snapshotId).toBe(snapshot.manifest.snapshotId);
    expect(await application.snapshotStore.read(old.manifest.snapshotId)).toEqual(old);
    expect(nodeIds(await application.queryService.scan({ ...request, snapshotId: old.manifest.snapshotId })))
      .not.toContain('component:file:src/archive.ts');
  }, 60_000);

  it('replaces routing edges for source renames/deletions and routing-manifest edits/deletions in drafts', async () => {
    const { root, application, commit } = await fixture([
      routes[0]!, { ...routes[0]!, id: 'unresolved', consumer: 'src/absent.ts' },
    ]);
    await mkdir(join(root, 'outside'));
    await writeFile(join(root, 'outside/clean.ts'), 'export const cleanExternal = true;\n');
    await commit();
    const { snapshot: base } = await application.hydrator.hydrate({ ref: 'HEAD', headName: 'default' });
    const overlay = () => buildWorkingOverlay(application.repository, application.config, application.snapshotStore,
      application.storageRoot, base.manifest.snapshotId, 'routing-review');
    await rename(join(root, 'src/archive.ts'), join(root, 'src/retained.ts'));
    const missing = await overlay();
    expect(routingFacts(missing)).toEqual([]);
    expect(missing.diagnostics).toHaveLength(2);
    expect(missing.diagnostics?.some((item) => item.reason.includes('src/archive.ts'))).toBe(true);
    const repeatedMissing = await overlay();
    expect(repeatedMissing.manifest.snapshotId).toBe(missing.manifest.snapshotId);
    expect(repeatedMissing.manifest.contentDigest).toBe(missing.manifest.contentDigest);
    expect(repeatedMissing.diagnostics).toEqual(missing.diagnostics);
    await writeFile(join(root, 'routing.json'), manifestText([{ ...routes[0]!, consumer: 'src/retained.ts' }]));
    const renamed = await overlay();
    expect(routingFacts(renamed)).toHaveLength(2);
    for (const fact of routingFacts(renamed)) expect(fact).toMatchObject({
      authority: 'draft', sourceAuthority: 'draft', extractionReview: 'deterministic',
      provenance: { path: 'routing.json', commitSha: base.manifest.commitSha,
        digest: sha256(manifestText([{ ...routes[0]!, consumer: 'src/retained.ts' }])) },
    });
    expect(nodeIds({ facts: routingFacts(renamed) })).toContain('component:file:src/retained.ts');
    expect(nodeIds(renamed)).not.toContain('component:file:src/archive.ts');
    expect((await new RdfEvidenceGraph(renamed).validate()).conforms).toBe(true);
    // Even a currently clean outside endpoint needs explicit scope so later edits affect freshness.
    const overlayHead = `overlay-${sha256(`${root}:routing-review`).slice(0, 24)}`;
    await writeFile(join(root, 'routing.json'), manifestText([{ ...routes[0]!, consumer: 'outside/clean.ts' }]));
    await expect(overlay()).rejects.toThrow(/outside captured source scope/);
    expect(await application.snapshotStore.readHead(overlayHead)).toEqual(renamed);
    // A new dirty endpoint outside the capture also cannot silently use stale or absent bytes.
    await writeFile(join(root, 'outside/endpoint.ts'), 'export const externalDraft = true;\n');
    await writeFile(join(root, 'routing.json'), manifestText([{ ...routes[0]!, consumer: 'outside/endpoint.ts' }]));
    await expect(overlay()).rejects.toThrow(/outside captured source scope/);
    expect(await application.snapshotStore.readHead(overlayHead)).toEqual(renamed);
    await rm(join(root, 'outside/endpoint.ts'));
    await writeFile(join(root, 'routing.json'), manifestText([{ ...routes[0]!, consumer: 'src/retained.ts' }]));
    await rm(join(root, 'src/retained.ts'));
    const deletedSource = await overlay();
    expect(routingFacts(deletedSource)).toEqual([]);
    await rm(join(root, 'routing.json'));
    const deletedManifest = await overlay();
    expect(routingFacts(deletedManifest)).toEqual([]);
    expect(deletedManifest.manifest.overlayCapture?.files).toContainEqual({ path: 'routing.json', digest: null });
    expect(await application.snapshotStore.readHead('default')).toEqual(base);
    expect(await application.snapshotStore.read(renamed.manifest.snapshotId)).toEqual(renamed);
    expect(await application.repository.resolveRef('HEAD')).toBe(base.manifest.commitSha);
  }, 60_000);

  it('preserves the last valid saved graph when a committed routing manifest is malformed or absent', async () => {
    const { root, application, commit } = await fixture(routes.slice(0, 1));
    const { snapshot: base } = await application.hydrator.hydrate({ ref: 'HEAD', headName: 'default' });
    await writeFile(join(root, 'routing.json'), '{ invalid JSON');
    await commit();
    await expect(application.hydrator.hydrate({ ref: 'HEAD', headName: 'default' })).rejects.toThrow();
    expect(await application.snapshotStore.readHead('default')).toEqual(base);
    await rm(join(root, 'routing.json'));
    await commit();
    await expect(application.hydrator.hydrate({ ref: 'HEAD', headName: 'default' })).rejects.toThrow();
    expect(await application.snapshotStore.readHead('default')).toEqual(base);
    const saved = await application.queryService.scan({ changedFiles: ['src/input.ts'] });
    expect(nodeIds(saved)).toContain('component:file:src/archive.ts');
    expect(saved.evidenceState).toMatchObject({ stale: true, eligibleForCurrentDiffValidation: false });
    expect(saved.snapshot.commitSha).toBe(base.manifest.commitSha);
  }, 60_000);
});
