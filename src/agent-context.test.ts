// Modified for standalone extraction; see docs/extraction-manifest.json.
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { describe, expect, it } from 'vitest';

import { AgentSemanticScopeResolver, PreparedImpactQueryService } from './agent-context.js';
import { resolveStorageRoot } from './cache.js';
import type { ContextGraphConfig } from './config.js';
import type { ExtractionContext, GraphSnapshot, SemanticArtifact, SemanticSource } from './core.js';
import { linkSemanticDocuments } from './document.js';
import { GitRepository } from './git.js';
import type { ContextGraphHydrator, HydrationOptions } from './hydrator.js';
import { FileSnapshotStore } from './storage.js';

const execFileAsync = promisify(execFile);
const config: ContextGraphConfig = {
  schemaVersion: 1,
  repositoryId: 'example/workflow',
  namespace: 'https://context.test/',
  semanticSources: ['docs/policy', 'docs/intent', 'docs/validation'],
  codeRoots: ['src'],
  contractPatterns: [],
  evidenceRoots: ['docs/validation'],
  semantic: {
    provider: 'codex-cli',
    model: 'test',
    reasoningEffort: 'low',
    promptVersion: '2',
    extractorVersion: '2',
    adapterVersion: '2',
    ontologyVersion: '2',
    minimumConfidence: 0.7,
    failOnUnresolved: false,
    concurrency: 1,
  },
  scip: { version: '1', command: 'unused', args: [] },
  ontology: { toolVersion: '1', containerImage: 'unused', projectPath: 'ontology' },
  runtimeEvidence: [],
  storagePath: '.context-graph/agent',
  storageScope: 'user',
  agentContext: {
    alwaysSemanticSources: ['docs/policy'],
    followDocumentReferences: true,
    includeMatchingEvidence: true,
    maxReferencedDocuments: 8,
  },
};

describe('agent context preparation', () => {
  it('expands explicit repository directory references to tracked implementation files', () => {
    const commitSha = '7'.repeat(40);
    const source: SemanticSource = {
      stableSemanticId: 'doc:owner',
      path: 'docs/intent/owner.md',
      content: 'Expected modules: lib/graph and apps/api.',
      digest: 'source-digest',
    };
    const artifact = { facts: [] } as unknown as SemanticArtifact;
    const context: ExtractionContext = {
      repositoryRoot: '.',
      repositoryId: 'example',
      ref: 'HEAD',
      commitSha,
      snapshotId: commitSha,
      changedPaths: [],
      deletedPaths: [],
      renamedPaths: {},
    };

    const facts = linkSemanticDocuments(
      context,
      [{ source, artifact }],
      ['lib/graph/src/query.ts', 'apps/api/src/main.ts', 'apps/web/src/main.ts'],
    );

    expect(facts.map((fact) => fact.object.id)).toEqual([
      'component:file:apps/api/src/main.ts',
      'component:file:lib/graph/src/query.ts',
    ]);
  });

  it('selects philosophy, the owner doc, linked docs, and validation evidence', async () => {
    const root = await mkdtemp(join(tmpdir(), 'context-graph-agent-scope-'));
    for (const directory of ['docs/policy', 'docs/intent', 'docs/validation']) {
      await mkdir(join(root, directory), { recursive: true });
    }
    await writeFile(join(root, 'docs/policy/policy.md'), '# Policy\n');
    await writeFile(
      join(root, 'docs/intent/fulfillment.md'),
      '# Fulfillment\nSee docs/validation/fulfillment-validation.md.\n',
    );
    await writeFile(join(root, 'docs/validation/fulfillment-validation.md'), '# Validation\n');
    await execFileAsync('git', ['init'], { cwd: root, windowsHide: true });
    await execFileAsync('git', ['config', 'user.email', 'graph@example.test'], { cwd: root });
    await execFileAsync('git', ['config', 'user.name', 'Graph Test'], { cwd: root });
    await execFileAsync('git', ['add', '.'], { cwd: root });
    await execFileAsync('git', ['commit', '-m', 'fixture'], { cwd: root });
    const repository = new GitRepository(root);
    const resolver = new AgentSemanticScopeResolver(config, repository);

    const scope = await resolver.resolve({ ownerDocument: 'docs/intent/fulfillment.md' });

    expect(scope.semanticSources).toEqual([
      'docs/intent/fulfillment.md',
      'docs/policy/policy.md',
      'docs/validation/fulfillment-validation.md',
    ]);
    expect(resolveStorageRoot('C:/worktree-a', config, 'C:/shared-cache')).toBe(
      resolveStorageRoot('C:/worktree-b', config, 'C:/shared-cache'),
    );
    expect(
      resolveStorageRoot(
        'C:/worktree-a',
        { ...config, codeRoots: [...config.codeRoots, 'packages'] },
        'C:/shared-cache',
      ),
    ).not.toBe(resolveStorageRoot('C:/worktree-a', config, 'C:/shared-cache'));

    const store = new FileSnapshotStore(await mkdtemp(join(tmpdir(), 'context-graph-shared-')));
    let hydrateCalls = 0;
    let runtimeEvidenceDigest = 'runtime-a';
    const hydrator = {
      async collectRuntimeEvidence() {
        return {
          commitSha: scope.commitSha,
          digest: runtimeEvidenceDigest,
          references: [],
        };
      },
      async hydrate(options: HydrationOptions) {
        hydrateCalls += 1;
        const revision = options.runtimeEvidenceRevision;
        if (!revision) throw new Error('Expected a prepared runtime evidence revision');
        const snapshotId = `${scope.commitSha}-${options.snapshotSuffix}-runtime-${revision.digest.slice(0, 12)}`;
        const snapshot: GraphSnapshot = {
          manifest: {
            schemaVersion: 1,
            repositoryId: config.repositoryId,
            ref: scope.commitSha,
            commitSha: scope.commitSha,
            snapshotId,
            ontologyVersion: '2',
            extractorVersions: {},
            semanticModel: 'test',
            semanticPromptVersion: '2',
            generatedAt: '2026-01-01T00:00:00Z',
            contentDigest: 'digest',
            runtimeEvidenceDigest: revision.digest,
            semanticArtifactKeys: [],
            scipIndexDigest: 'scip',
            rdfDigest: 'rdf',
          },
          facts: [],
          invariants: [],
          runtimeEvidence: [],
          unresolved: [],
        };
        await store.write(snapshot);
        await store.updateHead(options.headName, snapshotId);
        return { snapshot, semanticExtracted: 0, semanticReused: 0 };
      },
    } as unknown as ContextGraphHydrator;
    const request = { ownerDocument: 'docs/intent/fulfillment.md' };
    await new PreparedImpactQueryService(store, hydrator, resolver).scan(request);
    await new PreparedImpactQueryService(store, hydrator, resolver).scan(request);
    expect(hydrateCalls).toBe(1);
    const first = await store.readHead(scope.headName);
    runtimeEvidenceDigest = 'runtime-b';
    await new PreparedImpactQueryService(store, hydrator, resolver).scan(request);
    const refreshed = await store.readHead(scope.headName);
    expect(hydrateCalls).toBe(2);
    expect(refreshed?.manifest.snapshotId).not.toBe(first?.manifest.snapshotId);
    expect(await store.read(first?.manifest.snapshotId ?? '')).toEqual(first);
    await expect(
      new PreparedImpactQueryService(store, hydrator, resolver).scan({
        ...request,
        snapshotId: 'stale-snapshot',
      }),
    ).rejects.toThrow('snapshotId is not accepted in agent-context mode');
  });
});
