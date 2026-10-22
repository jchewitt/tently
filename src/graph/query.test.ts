// Modified for standalone extraction; see docs/extraction-manifest.json.
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { GraphFact, GraphNode, GraphSnapshot } from "@weftlet/core";
import { handleImpactScan, impactScanToolName } from "../interfaces/mcp-facade.js";
import { SnapshotImpactQueryService } from "./query.js";
import { FileSnapshotStore } from "../storage/storage.js";

describe('impact scan facade', () => {
  it('rejects snapshot traversal before the service can read outside snapshot storage', async () => {
    const root = await mkdtemp(join(tmpdir(), 'context-graph-query-traversal-'));
    const store = new FileSnapshotStore(root);
    await writeFile(join(root, 'outside.json'), '{}\n', 'utf8');

    await expect(
      handleImpactScan(new SnapshotImpactQueryService(store, 'default'), {
        snapshotId: '../outside',
      }),
    ).rejects.toThrow('snapshotId must be a safe storage identifier');
  });

  it('returns the same bounded Context Pack through the application service used by CLI and MCP', async () => {
    const root = await mkdtemp(join(tmpdir(), 'context-graph-query-'));
    const store = new FileSnapshotStore(root);
    const sha = 'd'.repeat(40);
    const snapshot: GraphSnapshot = {
      manifest: {
        schemaVersion: 1,
        repositoryId: 'example/repo',
        ref: 'HEAD',
        commitSha: sha,
        snapshotId: sha,
        ontologyVersion: '1',
        extractorVersions: {},
        semanticModel: 'test',
        semanticPromptVersion: 'test',
        generatedAt: '2026-01-01T00:00:00Z',
        contentDigest: 'digest',
        semanticArtifactKeys: [],
        scipIndexDigest: 'scip',
        rdfDigest: 'rdf',
      },
      facts: Array.from({ length: 205 }, (_, index) => ({
        id: `fact-${index}`,
        subject: { id: 'capability:search', kind: 'Capability', label: 'Search' },
        predicate: 'implementedBy',
        object: {
          id: `component:worker-${index}`,
          kind: 'Component',
          label: `Worker ${index}`,
        },
        provenance: {
          path: `src/worker-${index}.ts`,
          startLine: 1,
          endLine: 1,
          digest: 'source',
          commitSha: sha,
        },
        extractor: { id: 'test', version: '1' },
        confidence: 1,
        snapshotId: sha,
      })),
      invariants: [],
      runtimeEvidence: [],
      unresolved: [],
    };
    await store.write(snapshot);
    await store.updateHead('default', sha);
    const service = new SnapshotImpactQueryService(store, 'default');
    const direct = await service.scan({ capabilities: ['search'], maxFacts: 10_000 });
    const mcp = await handleImpactScan(service, {
      capabilities: ['search'],
      maxFacts: 10_000,
    });
    expect(mcp).toEqual(direct);
    expect(mcp.facts).toHaveLength(200);
    expect(mcp.facts[0]?.provenance.commitSha).toBe(sha);
    const request = { capabilities: ['search'], maxFacts: 17 };
    const first = await service.scan(request);
    const version = first.exploration?.rankingVersion;
    expect(version).toBe('proximity-diversity-v1');
    expect(first.markdown).toContain(`Ranking: ${version}`);
    let page = first;
    const collected = [...first.facts];
    let pages = 1;
    while (page.exploration?.continuation) {
      if (++pages > 20) throw new Error('Pagination did not terminate');
      page = await service.scan({ ...request, continuation: page.exploration.continuation });
      expect(page.exploration?.rankingVersion).toBe(version);
      collected.push(...page.facts);
    }
    expect(collected).toHaveLength(snapshot.facts.length);
    expect(new Set(collected.map((fact) => fact.id))).toEqual(new Set(snapshot.facts.map((fact) => fact.id)));
    expect(collected.slice(0, 200)).toEqual(direct.facts);
    const token = JSON.parse(Buffer.from(first.exploration!.continuation!, 'base64url').toString('utf8'));
    for (const ranking of [undefined, 'old-ordering']) {
      const continuation = Buffer.from(JSON.stringify({ ...token, ranking })).toString('base64url');
      await expect(service.scan({ ...request, continuation })).rejects.toThrow('restart the scan');
    }
    await expect(service.scan({ ...request, task: 'different query', continuation: first.exploration!.continuation }))
      .rejects.toThrow('does not match');
    await expect(service.scan({ ...request, continuation: Buffer.from('null').toString('base64url') }))
      .rejects.toThrow('Invalid continuation');
    await expect(service.scan({ maxFacts: 0 })).rejects.toThrow(
      'maxFacts must be a positive integer',
    );
  });

  it('keeps skill command names aligned with the MCP facade and generic template', async () => {
    const template = await readFile(
      resolve(import.meta.dirname, "../../templates/context-graph-development/SKILL.md"), 'utf8',
    );
    expect(impactScanToolName).toBe('impact.scan');
    expect(template).toContain(impactScanToolName);
  });

  it('expands changed code files through symbols without traversing the project hub', async () => {
    const root = await mkdtemp(join(tmpdir(), 'context-graph-query-project-'));
    const store = new FileSnapshotStore(root);
    const sha = 'e'.repeat(40);
    const project = { id: 'project:example/repo', kind: 'Project' as const, label: 'example/repo' };
    const changed = {
      id: 'component:file:src/changed.ts',
      kind: 'Component' as const,
      label: 'src/changed.ts',
    };
    const consumer = {
      id: 'component:file:src/consumer.ts',
      kind: 'Component' as const,
      label: 'src/consumer.ts',
    };
    const unrelated = {
      id: 'component:file:src/unrelated.ts',
      kind: 'Component' as const,
      label: 'src/unrelated.ts',
    };
    const symbol = { id: 'symbol:changed', kind: 'Contract' as const, label: 'Changed' };
    const fact = (
      id: string,
      subject: typeof project | typeof changed | typeof consumer | typeof unrelated,
      predicate: 'contains' | 'consumes',
      object: typeof changed | typeof consumer | typeof unrelated | typeof symbol,
      path: string,
    ) => ({
      id,
      subject,
      predicate,
      object,
      provenance: {
        path,
        startLine: 1,
        endLine: 1,
        digest: `${id}-digest`,
        commitSha: sha,
      },
      extractor: { id: 'test', version: '1' },
      confidence: 1,
      snapshotId: sha,
    });
    const snapshot: GraphSnapshot = {
      manifest: {
        schemaVersion: 1,
        repositoryId: 'example/repo',
        ref: 'HEAD',
        commitSha: sha,
        snapshotId: sha,
        ontologyVersion: '1',
        extractorVersions: {},
        semanticModel: 'test',
        semanticPromptVersion: 'test',
        generatedAt: '2026-01-01T00:00:00Z',
        contentDigest: 'digest',
        semanticArtifactKeys: [],
        scipIndexDigest: 'scip',
        rdfDigest: 'rdf',
      },
      facts: [
        fact('unrelated-project', project, 'contains', unrelated, 'src/unrelated.ts'),
        fact('changed-project', project, 'contains', changed, 'src/changed.ts'),
        fact('changed-symbol', changed, 'contains', symbol, 'src/changed.ts'),
        fact('consumer-symbol', consumer, 'consumes', symbol, 'src/consumer.ts'),
      ],
      invariants: [],
      runtimeEvidence: [],
      unresolved: [],
    };
    await store.write(snapshot);
    await store.updateHead('default', sha);

    const pack = await new SnapshotImpactQueryService(store, 'default').scan({
      changedFiles: ['src/changed.ts'],
      maxFacts: 3,
    });

    expect(pack.suggestedFiles).toEqual(['src/changed.ts', 'src/consumer.ts']);
    expect(pack.facts.some((item) => item.provenance.path === 'src/unrelated.ts')).toBe(false);
  });

  it('returns the broader Fulfillment policy, PM, execution, worker, and validation purpose chain', async () => {
    const root = await mkdtemp(join(tmpdir(), 'context-graph-exit-policy-'));
    const store = new FileSnapshotStore(root);
    const sha = 'f'.repeat(40);
    const node = (id: string, kind: GraphNode['kind'], label: string): GraphNode => ({
      id,
      kind,
      label,
    });
    const document = node(
      'document:docs/intent/fulfillment.md',
      'Document',
      'docs/intent/fulfillment.md',
    );
    const exit = node('capability:fulfillment', 'Capability', 'Fulfillment rules');
    const policy = node('contract:admission-policy', 'Contract', 'Trading policy authority');
    const execution = node('component:execution-service', 'Component', 'Execution service');
    const worker = node('provider:worker', 'Provider', 'Broker adapter');
    const scan = node('workflow:scan-manager', 'Workflow', 'Scan Manager discovery');
    const pm = node('workflow:planning', 'Workflow', 'Planning');
    const autoTune = node('component:policy-learn', 'Component', 'PM policy learning');
    const evidence = node('evidence:exit-policy', 'Evidence', 'Exit policy integration test');
    const fact = (
      id: string,
      subject: GraphNode,
      predicate: GraphFact['predicate'],
      object: GraphNode,
      path: string,
    ): GraphFact => ({
      id,
      subject,
      predicate,
      object,
      provenance: { path, startLine: 1, endLine: 1, digest: id, commitSha: sha },
      extractor: { id: path.startsWith('docs/') ? 'codex-cli:fixture' : 'fixture', version: '1' },
      authority: path.startsWith('docs/validation/') ? 'validated' :
        path.startsWith('docs/') ? 'declared' : 'implemented',
      confidence: 1,
      snapshotId: sha,
    });
    const snapshot: GraphSnapshot = {
      manifest: {
        schemaVersion: 1,
        repositoryId: 'example/workflow',
        ref: 'HEAD',
        commitSha: sha,
        snapshotId: sha,
        ontologyVersion: '1',
        extractorVersions: {},
        semanticModel: 'fixture',
        semanticPromptVersion: 'fixture',
        generatedAt: '2026-01-01T00:00:00Z',
        contentDigest: 'digest',
        semanticArtifactKeys: [],
        scipIndexDigest: 'scip',
        rdfDigest: 'rdf',
      },
      facts: [
        fact('doc-exit', document, 'contains', exit, document.label),
        fact('exit-policy', exit, 'governedBy', policy, 'docs/policy/admission-policy.md'),
        fact('exit-execution', exit, 'implementedBy', execution, 'apps/execution/src/exit.ts'),
        fact(
          'execution-worker',
          execution,
          'routesThrough',
          worker,
          'apps/execution/src/worker.ts',
        ),
        fact(
          'policy-scan',
          policy,
          'decisionAuthority',
          scan,
          'docs/policy/discovery.md',
        ),
        fact(
          'policy-pm',
          policy,
          'decisionAuthority',
          pm,
          'docs/policy/planning.md',
        ),
        fact(
          'pm-learn',
          pm,
          'consumes',
          autoTune,
          'apps/api/src/modules/planning/learn.ts',
        ),
        fact(
          'policy-evidence',
          policy,
          'verifiedBy',
          evidence,
          'docs/validation/fulfillment-validation.md',
        ),
      ],
      invariants: [],
      runtimeEvidence: [],
      unresolved: [],
    };
    await store.write(snapshot);
    await store.updateHead('default', sha);

    const pack = await new SnapshotImpactQueryService(store, 'default').scan({
      ownerDocument: document.label,
    });

    expect(pack.facts.map((item) => item.id)).toEqual(
      expect.arrayContaining([
        'exit-policy',
        'execution-worker',
        'policy-scan',
        'policy-pm',
        'pm-learn',
        'policy-evidence',
      ]),
    );
    expect(Object.values(pack.coverage.counts).every((count) => count > 0)).toBe(true);
    expect(pack.coverage.gaps).toEqual([]);
  });

  it('uses the owner document as the traversal anchor and task terms to rank connected context', async () => {
    const root = await mkdtemp(join(tmpdir(), 'context-graph-ranked-anchor-'));
    const store = new FileSnapshotStore(root);
    const sha = '9'.repeat(40);
    const owner = {
      id: 'document:exit',
      kind: 'Document' as const,
      label: 'docs/intent/exit.md',
    };
    const exit = { id: 'capability:exit', kind: 'Capability' as const, label: 'Exit' };
    const policy = { id: 'contract:policy', kind: 'Contract' as const, label: 'Policy' };
    const scan = { id: 'workflow:scan-manager', kind: 'Workflow' as const, label: 'Scan Manager' };
    const fact = (
      id: string,
      subject: GraphNode,
      predicate: GraphFact['predicate'],
      object: GraphNode,
      path: string,
      extractor = 'codex-cli:test',
    ): GraphFact => ({
      id,
      subject,
      predicate,
      object,
      provenance: { path, startLine: 1, endLine: 1, digest: id, commitSha: sha },
      extractor: { id: extractor, version: '1' },
      authority: extractor.startsWith('codex-cli:') ? 'declared' : 'implemented',
      confidence: 1,
      snapshotId: sha,
    });
    const relevant = [
      fact('owner-exit', owner, 'contains', exit, owner.label),
      fact('exit-policy', exit, 'governedBy', policy, 'docs/policy/policy.md'),
      fact('policy-scan', policy, 'decisionAuthority', scan, 'docs/policy/flow.md'),
    ];
    const noise = Array.from({ length: 30 }, (_, index) =>
      fact(
        `noise-${index}`,
        { id: `component:noise-${index}`, kind: 'Component', label: `Policy noise ${index}` },
        'contains',
        { id: `contract:noise-${index}`, kind: 'Contract', label: `Noise ${index}` },
        `src/policy-noise-${index}.ts`,
        'scip-symbol-extractor',
      ),
    );
    const snapshot: GraphSnapshot = {
      manifest: {
        schemaVersion: 1,
        repositoryId: 'example',
        ref: 'HEAD',
        commitSha: sha,
        snapshotId: sha,
        ontologyVersion: '1',
        extractorVersions: {},
        semanticModel: 'test',
        semanticPromptVersion: 'test',
        generatedAt: '2026-01-01T00:00:00Z',
        contentDigest: 'digest',
        semanticArtifactKeys: [],
        scipIndexDigest: 'scip',
        rdfDigest: 'rdf',
      },
      facts: [...noise, ...relevant],
      invariants: [],
      runtimeEvidence: [],
      unresolved: [],
    };
    await store.write(snapshot);
    await store.updateHead('default', sha);

    const pack = await new SnapshotImpactQueryService(store, 'default').scan({
      ownerDocument: owner.label,
      task: 'Connect Exit policy to Scan Manager without repository policy noise',
      maxFacts: 3,
    });

    expect(pack.facts.map((item) => item.id)).toEqual(
      expect.arrayContaining(['owner-exit', 'exit-policy', 'policy-scan']),
    );
    expect(pack.facts.some((item) => item.id.startsWith('noise-'))).toBe(false);
  });

  it('shows observed runtime behavior beside declared intent and flags unmapped observations', async () => {
    const root = await mkdtemp(join(tmpdir(), 'context-graph-runtime-reconcile-'));
    const store = new FileSnapshotStore(root);
    const sha = '8'.repeat(40);
    const capability = {
      id: 'capability:planning',
      kind: 'Capability' as const,
      label: 'Planning',
    };
    const snapshot: GraphSnapshot = {
      manifest: {
        schemaVersion: 1,
        repositoryId: 'example',
        ref: 'HEAD',
        commitSha: sha,
        snapshotId: sha,
        ontologyVersion: '1',
        extractorVersions: {},
        semanticModel: 'test',
        semanticPromptVersion: 'test',
        generatedAt: '2026-09-01T00:00:00Z',
        contentDigest: 'digest',
        semanticArtifactKeys: [],
        scipIndexDigest: 'scip',
        rdfDigest: 'rdf',
      },
      facts: [
        {
          id: 'declared-pm',
          subject: {
            id: 'document:owner',
            kind: 'Document',
            label: 'docs/intent/owner.md',
          },
          predicate: 'contains',
          object: capability,
          provenance: {
            path: 'docs/intent/owner.md',
            startLine: 1,
            endLine: 1,
            digest: 'source',
            commitSha: sha,
          },
          extractor: { id: 'codex-cli:test', version: '1' },
          authority: 'declared',
          confidence: 1,
          snapshotId: sha,
        },
        {
          id: 'observed-pm',
          subject: {
            id: 'component:runtime-service:example-api',
            kind: 'Component',
            label: 'example-api',
            attributes: { evidenceLayer: 'observed' },
          },
          predicate: 'realizes',
          object: {
            ...capability,
            attributes: { evidenceLayer: 'observed' },
          },
          provenance: {
            path: '.context-graph/runtime/pm.otlp.json',
            startLine: 1,
            endLine: 1,
            digest: 'runtime',
            commitSha: sha,
          },
          extractor: { id: 'otlp-runtime-evidence', version: '1.0.0' },
          confidence: 1,
          snapshotId: sha,
        },
        {
          id: 'validated-undocumented-path',
          subject: {
            id: 'document:runtime-validation',
            kind: 'Document',
            label: 'docs/validation/runtime-validation.md',
          },
          predicate: 'validates',
          object: {
            id: 'capability:undocumented-path',
            kind: 'Capability',
            label: 'Undocumented Path',
          },
          provenance: {
            path: 'docs/validation/runtime-validation.md',
            startLine: 1,
            endLine: 1,
            digest: 'validation-source',
            commitSha: sha,
          },
          extractor: { id: 'codex-cli:test', version: '1' },
          authority: 'declared',
          confidence: 1,
          snapshotId: sha,
        },
        {
          id: 'implemented-undocumented-path',
          subject: {
            id: 'component:file:src/runtime.ts',
            kind: 'Component',
            label: 'src/runtime.ts',
          },
          predicate: 'implements',
          object: {
            id: 'capability:undocumented-path',
            kind: 'Capability',
            label: 'Undocumented Path',
          },
          provenance: {
            path: 'src/runtime.ts',
            startLine: 1,
            endLine: 1,
            digest: 'implementation-source',
            commitSha: sha,
          },
          extractor: { id: 'scip:test', version: '1' },
          confidence: 1,
          snapshotId: sha,
        },
      ],
      invariants: [],
      runtimeEvidence: [
        {
          traceId: 'trace-pm',
          spanId: 'span-pm',
          serviceName: 'example-api',
          serviceVersion: sha,
          capability: 'planning',
          operation: 'planning.build-plan',
          environment: 'staging',
          observedAt: '2026-09-01T00:00:00.000Z',
          sourcePath: '.context-graph/runtime/pm.otlp.json',
          sourceDigest: 'runtime',
          accepted: true,
        },
        {
          traceId: 'trace-unknown',
          spanId: 'span-unknown',
          serviceName: 'example-api',
          serviceVersion: sha,
          capability: 'undocumented-path',
          operation: 'undocumented-path.run',
          environment: 'staging',
          observedAt: '2026-09-01T00:00:00.000Z',
          sourcePath: '.context-graph/runtime/unknown.otlp.json',
          sourceDigest: 'runtime-unknown',
          accepted: true,
        },
      ],
      unresolved: [],
    };
    await store.write(snapshot);
    await store.updateHead('default', sha);

    const declared = await new SnapshotImpactQueryService(store, 'default').scan({
      ownerDocument: 'docs/intent/owner.md',
      task: 'planning runtime',
    });
    expect(declared.runtimeEvidence).toHaveLength(1);
    expect(declared.markdown).toContain('planning.build-plan');
    expect(declared.markdown).toContain('[declared]');
    expect(declared.markdown).toContain('[observed]');
    expect(declared.coverage.counts.productIntent).toBe(1);
    expect(declared.coverage.counts.implementationAndConsumers).toBe(0);
    expect(declared.coverage.gaps).toContain(
      'No implementationAndConsumers evidence matched this request.',
    );
    expect(declared.diagnostics.drift.items).toEqual([]);

    const unmapped = await new SnapshotImpactQueryService(store, 'default').scan({
      capabilities: ['undocumented-path'],
    });
    expect(
      unmapped.diagnostics.drift.items.some((item) =>
        item.reason.includes(
          'Observed runtime capability capability:undocumented-path has no declared product-intent mapping.',
        ),
      ),
    ).toBe(true);
    expect(unmapped.diagnostics.drift.items[0]).toMatchObject({
      provenance: [],
      evidenceScope: 'snapshot-query',
    });
    expect(unmapped.markdown).toContain('query of the cited snapshot');
    expect(unmapped.markdown).not.toContain('.context-graph/runtime/unknown.otlp.json:1');
    expect(unmapped.runtimeEvidence[0]).toMatchObject({
      sourcePath: '.context-graph/runtime/unknown.otlp.json',
      sourceDigest: 'runtime-unknown',
    });
    expect(unmapped.coverage.counts.productIntent).toBe(0);
    expect(unmapped.coverage.gaps).toContain('No productIntent evidence matched this request.');
  });
});
