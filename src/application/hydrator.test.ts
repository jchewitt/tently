// Modified for standalone extraction; see docs/extraction-manifest.json.
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { describe, expect, it } from 'vitest';

import type { ContextGraphConfig } from "../configuration/config.js";
import { GitRepository } from "../repository/git.js";
import { ContextGraphHydrator } from "./hydrator.js";
import { SemanticHydrator } from "../extraction/semantic.js";
import { SemanticArtifactStore, FileSnapshotStore } from "../storage/storage.js";
import { RepositoryFileExtractor } from "../extraction/static.js";
import { sha256, stableJson } from "../infrastructure/util.js";

const execFileAsync = promisify(execFile);

async function git(root: string, ...args: string[]): Promise<void> {
  await execFileAsync('git', args, { cwd: root, windowsHide: true });
}

const config: ContextGraphConfig = {
  schemaVersion: 1,
  repositoryId: 'example/generic',
  namespace: 'https://example.test/context/',
  semanticSources: ['docs'],
  codeRoots: ['src'],
  contractPatterns: [],
  evidenceRoots: ['test'],
  semantic: {
    provider: 'codex-cli',
    model: 'test-model',
    reasoningEffort: 'low',
    promptVersion: 'test-prompt-v1',
    extractorVersion: '1.0.0',
    adapterVersion: '1.0.0',
    ontologyVersion: '1.0.0',
    minimumConfidence: 0.7,
    failOnUnresolved: false,
    concurrency: 2,
  },
  scip: { version: '0.4.0', command: 'unused', args: [] },
  ontology: {
    toolVersion: 'oml2owl-gradle-2.13.1',
    containerImage: 'unused',
    projectPath: 'ontology',
  },
  runtimeEvidence: ['runtime/*.json'],
  storagePath: '.context-graph',
};

describe('commit-keyed hydration', () => {
  it('is stable, preserves forced artifacts, reuses renames, and invalidates deletions', async () => {
    const root = await mkdtemp(join(tmpdir(), 'context-graph-git-'));
    await mkdir(join(root, 'docs'), { recursive: true });
    await mkdir(join(root, 'src'), { recursive: true });
    await writeFile(
      join(root, 'docs', 'capability.md'),
      'semantic-id: capability:search\n# Search Capability\nWorker implements search.\n',
    );
    await writeFile(join(root, 'src', 'search.ts'), 'export const search = () => "ok";\n');
    await git(root, 'init');
    await git(root, 'config', 'user.email', 'context-graph@example.test');
    await git(root, 'config', 'user.name', 'Context Graph Test');
    await git(root, 'add', '.');
    await git(root, 'commit', '-m', 'initial');

    const repository = new GitRepository(root);
    const storageRoot = join(root, '.context-graph');
    const snapshotStore = new FileSnapshotStore(storageRoot);
    let extractionCalls = 0;
    const semanticHydrator = new SemanticHydrator(
      config.semantic,
      new SemanticArtifactStore(storageRoot),
      {
        identity: 'fake-codex:1',
        async extract() {
          extractionCalls += 1;
          return {
            parsed: {
              assertions: [
                {
                  subject: {
                    id: 'capability:search',
                    kind: 'Capability' as const,
                    label: 'Search',
                  },
                  predicate: 'implementedBy' as const,
                  object: { id: 'component:worker', kind: 'Component' as const, label: 'Worker' },
                  citation: { startLine: 3, endLine: 3 },
                  confidence: 1,
                },
              ],
              oml: 'proposal',
              unresolvedMappings: [],
              diagnostics: [
                {
                  kind: 'implementationGaps' as const,
                  reason: 'Exact worker implementation path is not mapped.',
                  citation: { startLine: 3, endLine: 3 },
                  relatedNodeIds: ['component:worker'],
                },
              ],
            },
            rawModelOutput: '{"oml":"proposal"}',
          };
        },
      },
    );
    let acceptedTraceId = 'accepted-trace';
    let dockerReady = false;
    let indexCalls = 0;
    const hydrator = new ContextGraphHydrator({
      config,
      repository,
      snapshotStore,
      semanticHydrator,
      staticIndexer: {
        async index(context) {
          indexCalls++;
          const files = await repository.listFilesAt(context.commitSha, ['src']);
          return {
            path: 'index.scip',
            digest: sha256(stableJson(files)),
            mode: 'full',
            version: '0.4.0',
          };
        },
      },
      ontologyCompiler: {
        async checkReady() {
          if (!dockerReady) throw new Error('Docker preflight failed');
        },
        async compile(_snapshotId, artifacts) {
          return {
            root: 'rdf',
            rdfFiles: [],
            digest: sha256(stableJson(artifacts.map((artifact) => artifact.outputDigest).sort())),
          };
        },
      },
      runtimeEvidenceProvider: {
        collect: async (evidenceContext) => [
          {
            traceId: acceptedTraceId,
            spanId: 'accepted-span',
            serviceName: 'fixture',
            serviceVersion: evidenceContext.commitSha,
            sourcePath: '.context-graph/runtime/accepted.json',
            sourceDigest: 'accepted-digest',
            accepted: true,
          },
          {
            traceId: 'rejected-trace',
            spanId: 'rejected-span',
            serviceName: 'fixture',
            serviceVersion: 'wrong-sha',
            sourcePath: '.context-graph/runtime/rejected.json',
            sourceDigest: 'rejected-digest',
            accepted: false,
            reason: 'service.version does not match snapshot commit SHA',
          },
        ],
      },
      extractorFactory: (scip) => [
        new RepositoryFileExtractor(repository, config.codeRoots, scip.digest),
      ],
      invariantEvaluators: [],
    });

    await expect(hydrator.hydrate({ ref: 'HEAD', headName: 'default' })).rejects.toThrow(
      'Docker preflight failed',
    );
    expect(extractionCalls).toBe(0);
    expect(indexCalls).toBe(0);
    expect(await snapshotStore.readHead('default')).toBeUndefined();
    dockerReady = true;
    const first = await hydrator.hydrate({ ref: 'HEAD', headName: 'default' });
    expect(first.snapshot.runtimeEvidence.map((evidence) => evidence.traceId)).toEqual([
      'accepted-trace',
    ]);
    const repeated = await hydrator.hydrate({ ref: 'HEAD', headName: 'default' });
    expect(repeated.snapshot.manifest.contentDigest).toBe(first.snapshot.manifest.contentDigest);
    expect(repeated.semanticReused).toBe(1);
    expect(extractionCalls).toBe(1);
    dockerReady = false;
    await expect(hydrator.hydrate({ ref: 'HEAD', headName: 'default' })).rejects.toThrow('Docker');
    expect(await snapshotStore.readHead('default')).toEqual(first.snapshot);
    dockerReady = true;

    acceptedTraceId = 'accepted-trace-refreshed';
    const refreshed = await hydrator.hydrate({ ref: 'HEAD', headName: 'default' });
    expect(refreshed.snapshot.manifest.snapshotId).not.toBe(first.snapshot.manifest.snapshotId);
    expect(refreshed.snapshot.runtimeEvidence.map((evidence) => evidence.traceId)).toEqual([
      'accepted-trace-refreshed',
    ]);
    expect(
      (await snapshotStore.read(first.snapshot.manifest.snapshotId))?.runtimeEvidence.map(
        (evidence) => evidence.traceId,
      ),
    ).toEqual(['accepted-trace']);
    expect((await snapshotStore.readHead('default'))?.manifest.snapshotId).toBe(
      refreshed.snapshot.manifest.snapshotId,
    );

    await hydrator.hydrate({ ref: 'HEAD', headName: 'default-clean' });
    await writeFile(join(root, 'src', 'search.ts'), 'export const search = () => "better";\n');
    await git(root, 'add', '.');
    await git(root, 'commit', '-m', 'improve search');
    await hydrator.hydrate({ ref: 'HEAD', headName: 'default' });
    await writeFile(join(root, 'src', 'search.ts'), 'export const search = () => "best";\n');
    await git(root, 'add', '.');
    await git(root, 'commit', '-m', 'improve search again');
    const current = await hydrator.hydrate({ ref: 'HEAD', headName: 'default' });
    const clean = await hydrator.compareClean({ ref: 'HEAD', headName: 'default' });
    expect(clean.snapshot.manifest.baseSha).not.toBe(current.snapshot.manifest.baseSha);
    expect(clean.snapshot.manifest.contentDigest).toBe(current.snapshot.manifest.contentDigest);

    const forced = await hydrator.hydrate({
      ref: 'HEAD',
      headName: 'default',
      forceSemantic: true,
    });
    expect(forced.snapshot.manifest.snapshotId).not.toBe(first.snapshot.manifest.snapshotId);
    expect(forced.snapshot.manifest.semanticArtifactKeys).not.toEqual(
      first.snapshot.manifest.semanticArtifactKeys,
    );
    expect(await readdir(join(storageRoot, 'artifacts', 'semantic'))).toHaveLength(2);

    await git(root, 'mv', 'docs/capability.md', 'docs/search-capability.md');
    await git(root, 'commit', '-m', 'rename capability doc');
    const renamed = await hydrator.hydrate({ ref: 'HEAD', headName: 'default' });
    expect(renamed.semanticReused).toBe(1);
    expect(extractionCalls).toBe(2);
    expect(renamed.snapshot.diagnostics?.[0]?.provenance[0]).toMatchObject({
      path: 'docs/search-capability.md',
      commitSha: renamed.snapshot.manifest.commitSha,
    });
    expect(
      renamed.snapshot.facts.some((fact) => fact.provenance.path === 'docs/search-capability.md'),
    ).toBe(true);

    await git(root, 'rm', 'docs/search-capability.md');
    await git(root, 'commit', '-m', 'delete capability doc');
    const deleted = await hydrator.hydrate({ ref: 'HEAD', headName: 'default' });
    expect(
      deleted.snapshot.facts.some((fact) => fact.provenance.path.includes('capability.md')),
    ).toBe(false);
  });
});
