import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import type { ContextPack, GraphFact } from './core.js';
import { selectDiagnostics } from './diagnostics.js';
import {
  MAX_VISUALIZATION_FACTS,
  renderContextPackDot,
  renderContextPackHtml,
  renderContextPackSvg,
  resolveVisualizationFormat,
  visualizeContextPack,
  writeContextPackVisualization,
} from './visualization.js';

const sha = 'a'.repeat(40);
const maliciousLabel = 'Search "safe" <script>alert(1)</script>';

function fact(
  id: string,
  predicate: GraphFact['predicate'],
  subject: GraphFact['subject'],
  object: GraphFact['object'],
  path: string,
  extractorId: string,
): GraphFact {
  return {
    id,
    subject,
    predicate,
    object,
    provenance: {
      path,
      startLine: 12,
      endLine: 13,
      digest: `${id}-digest`,
      commitSha: sha,
    },
    extractor: { id: extractorId, version: '1.0.0' },
    confidence: 0.95,
    snapshotId: 'snapshot-a',
  };
}

function contextPack(): ContextPack {
  const document = { id: 'document:search', kind: 'Document' as const, label: 'Search owner doc' };
  const capability = {
    id: 'capability:search',
    kind: 'Capability' as const,
    label: maliciousLabel,
  };
  const contract = { id: 'contract:query', kind: 'Contract' as const, label: 'Query contract' };
  const component = { id: 'component:search', kind: 'Component' as const, label: 'Search service' };
  const evidence = { id: 'evidence:search', kind: 'Evidence' as const, label: 'Search tests' };
  const facts = [
    fact(
      'declared-search',
      'contains',
      document,
      capability,
      'docs/philosophy/search.md',
      'codex-cli:test',
    ),
    fact(
      'governed-search',
      'governedBy',
      capability,
      contract,
      'docs/philosophy/search.md',
      'codex-cli:test',
    ),
    fact(
      'implemented-search',
      'implementedBy',
      capability,
      component,
      'src/search.ts',
      'scip-symbol-extractor',
    ),
    fact(
      'validated-search',
      'verifiedBy',
      contract,
      evidence,
      'test/search.test.ts',
      'document-linker',
    ),
  ];
  return {
    snapshot: { snapshotId: 'snapshot-a', commitSha: sha, contentDigest: 'content-a' },
    capabilities: [capability],
    facts,
    invariants: [
      {
        invariantId: 'invariant:search-route',
        status: 'pass',
        message: 'Search routes through the shared service',
        provenance: [facts[2]!.provenance],
      },
    ],
    runtimeEvidence: [
      {
        traceId: '1'.repeat(32),
        spanId: '2'.repeat(16),
        serviceName: 'example-api',
        serviceVersion: sha,
        capability: 'search',
        operation: 'search.query',
        environment: 'test',
        serviceInstanceId: 'instance-a',
        observedAt: '2026-09-02T00:00:00.000Z',
        sourcePath: '.context-graph/runtime/search.json',
        sourceDigest: 'runtime-a',
        accepted: true,
      },
      {
        traceId: '3'.repeat(32),
        spanId: '4'.repeat(16),
        serviceName: 'runtime-only-worker',
        serviceVersion: sha,
        capability: 'runtime-only',
        operation: 'runtime-only.observe',
        environment: 'test',
        serviceInstanceId: 'instance-b',
        observedAt: '2026-09-02T00:01:00.000Z',
        sourcePath: '.context-graph/runtime/runtime-only.json',
        sourceDigest: 'runtime-b',
        accepted: true,
      },
    ],
    suggestedFiles: ['docs/philosophy/search.md', 'src/search.ts', 'test/search.test.ts'],
    coverage: {
      counts: {
        productIntent: 1,
        contractsAndInvariants: 1,
        implementationAndConsumers: 1,
        validationEvidence: 1,
      },
      gaps: [],
    },
    diagnostics: selectDiagnostics(
      { unresolved: [] },
      {},
      facts,
      [],
      [
        {
          id: 'ambiguous-provider',
          kind: 'ambiguousIntent',
          reason: 'Provider ownership remains ambiguous.',
          provenance: [facts[0]!.provenance],
          relatedNodeIds: [],
          evidenceScope: 'source',
        },
      ],
    ),
    markdown: '# Context Pack\n\nBounded fixture.',
  };
}

function implementedOnlyContextPack(): ContextPack {
  const base = contextPack();
  const capability = {
    id: 'capability:undocumented-path',
    kind: 'Capability' as const,
    label: 'Undocumented path',
  };
  const component = {
    id: 'component:undocumented-path',
    kind: 'Component' as const,
    label: 'Undocumented worker',
  };
  const implementedFact = fact(
    'implemented-undocumented-path',
    'implementedBy',
    capability,
    component,
    'src/undocumented-path.ts',
    'scip-symbol-extractor',
  );
  return {
    ...base,
    capabilities: [capability],
    facts: [implementedFact],
    invariants: [],
    runtimeEvidence: [
      {
        ...base.runtimeEvidence[0]!,
        capability: 'undocumented-path',
        operation: 'undocumented-path.observe',
      },
    ],
    suggestedFiles: ['src/undocumented-path.ts'],
    coverage: {
      counts: {
        productIntent: 0,
        contractsAndInvariants: 0,
        implementationAndConsumers: 1,
        validationEvidence: 0,
      },
      gaps: ['No declared product intent matched the implemented capability.'],
    },
    diagnostics: selectDiagnostics(
      { unresolved: [] },
      {},
      [],
      [],
      [
        {
          id: 'runtime-drift',
          kind: 'drift',
          reason: 'Observed capability undocumented-path has no declared product intent.',
          provenance: [implementedFact.provenance],
          relatedNodeIds: [],
          evidenceScope: 'snapshot-query',
        },
      ],
    ),
  };
}

describe('Context Pack visualization', () => {
  it('renders deterministic, escaped, dependency-free HTML, DOT, and SVG outputs', () => {
    const pack = contextPack();
    const html = renderContextPackHtml(pack);
    const dot = renderContextPackDot(pack);
    const svg = renderContextPackSvg(pack);

    expect(renderContextPackHtml(pack)).toBe(html);
    expect(html).toContain('Content-Security-Policy');
    expect(html).toContain('data-layer="declared"');
    expect(html).toContain('data-authority="observed"');
    expect(html).toContain('Provider ownership remains ambiguous.');
    expect(html).not.toContain(maliciousLabel);
    expect(html).not.toMatch(/(?:src|href)="https?:/);
    expect(dot).toContain('digraph ContextPack');
    expect(dot).toContain('cluster-intent');
    expect(dot).toContain('Search \\"safe\\" <script>alert(1)</script>');
    expect(svg).toContain('<svg');
    expect(svg).toContain('data-authority="validated"');
    expect(svg).toContain('data-authority="observed"');
    expect(svg).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(svg).toContain(
      'class="visual-node column-evidence" data-visual-node="true" data-node-id="runtime-capability:runtime-only"',
    );
    expect(svg).toContain('Observed capability: runtime-only');
    const intentCluster = dot.match(/subgraph "cluster-intent" \{([\s\S]*?)\n {2}\}/)?.[1];
    const evidenceCluster = dot.match(/subgraph "cluster-evidence" \{([\s\S]*?)\n {2}\}/)?.[1];
    expect(intentCluster).not.toContain('runtime-capability:runtime-only');
    expect(evidenceCluster).toContain('runtime-capability:runtime-only');
  });

  it('rejects inputs above the Context Pack fact bound', () => {
    const pack = contextPack();
    const oversized = {
      ...pack,
      facts: Array.from({ length: MAX_VISUALIZATION_FACTS + 1 }, (_, index) => ({
        ...pack.facts[0]!,
        id: `oversized-${index}`,
      })),
    };

    expect(() => renderContextPackSvg(oversized)).toThrow('visualization limit is 200');
  });

  it('keeps an implemented-only capability out of the product-intent column', () => {
    const pack = implementedOnlyContextPack();
    const html = renderContextPackHtml(pack);
    const dot = renderContextPackDot(pack);
    const svg = renderContextPackSvg(pack);
    const intentCluster = dot.match(/subgraph "cluster-intent" \{([\s\S]*?)\n {2}\}/)?.[1];
    const implementationCluster = dot.match(
      /subgraph "cluster-implementation" \{([\s\S]*?)\n {2}\}/,
    )?.[1];

    expect(pack.coverage.counts.productIntent).toBe(0);
    expect(intentCluster).not.toContain('capability:undocumented-path');
    expect(implementationCluster).toContain('capability:undocumented-path');
    expect(svg).toContain(
      'class="visual-node column-implementation" data-visual-node="true" data-node-id="capability:undocumented-path"',
    );
    expect(html).toContain(
      'class="visual-node column-implementation" data-visual-node="true" data-node-id="capability:undocumented-path"',
    );
  });

  it('infers formats, uses the query service, and requires opt-in replacement', async () => {
    const pack = contextPack();
    const root = await mkdtemp(join(tmpdir(), 'context-graph-visualization-'));
    const outputPath = join(root, 'nested', 'search.html');
    const scan = vi.fn(async () => pack);

    expect(resolveVisualizationFormat('graph.svg')).toBe('svg');
    expect(resolveVisualizationFormat('graph.any', 'dot')).toBe('dot');
    expect(() => resolveVisualizationFormat('graph.txt')).toThrow('html, dot, or svg');

    await expect(
      visualizeContextPack(
        { scan },
        { ownerDocument: 'docs/philosophy/search.md', maxFacts: 25 },
        { outputPath },
      ),
    ).resolves.toEqual({
      outputPath,
      format: 'html',
      snapshotId: 'snapshot-a',
      commitSha: sha,
      factCount: 4,
      runtimeEvidenceCount: 2,
    });
    expect(scan).toHaveBeenCalledWith({
      ownerDocument: 'docs/philosophy/search.md',
      maxFacts: 25,
    });
    expect(await readFile(outputPath, 'utf8')).toContain('<!doctype html>');
    await expect(writeContextPackVisualization(pack, { outputPath })).rejects.toThrow(
      'pass --force to replace it',
    );
    await expect(
      writeContextPackVisualization(pack, { outputPath, format: 'svg', force: true }),
    ).resolves.toEqual(expect.objectContaining({ outputPath, format: 'svg' }));
    expect(await readFile(outputPath, 'utf8')).toContain('<svg');
  });
});
