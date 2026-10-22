import { describe, expect, it } from 'vitest';
import type { ExtractionContext, GraphFact, SemanticArtifact, SemanticSource } from '@weftlet/core';
import { linkSemanticDocuments } from './document.js';
import { sha256 } from '../infrastructure/util.js';

const context: ExtractionContext = {
  repositoryRoot: '.', repositoryId: 'public/example', ref: 'HEAD', commitSha: 'a'.repeat(40),
  snapshotId: 'snapshot', changedPaths: [], deletedPaths: [], renamedPaths: {},
};
const source = (content: string, path = 'docs/intent.md'): SemanticSource => ({
  content, path, digest: sha256(content), stableSemanticId: 'intent',
});
const link = (content: string, paths: string[], approved: string[] = []) =>
  linkSemanticDocuments(context, [{ source: source(content), artifact: { facts: [] } as unknown as SemanticArtifact }], paths, approved);

describe('committed document references', () => {
  it('resolves Markdown and literal paths with exact citations, canonical identities and separate source authority', () => {
    const content = [
      '# Intent',
      '[worker](../src/worker.ts#L3) and [checks](/tests/worker.test.ts).',
      'See [contract][shared].',
      '',
      '[shared]: ../src/contract.ts "The contract"',
      '`src/worker.ts` and src/worker.ts.',
      '[space](../src/my%20file.ts) and [sibling](other.md).',
    ].join('\r\n');
    const tracked = ['src/worker.ts', 'tests/worker.test.ts', 'src/contract.ts', 'src/my file.ts', 'docs/other.md'];
    const result = link(content, tracked, ['docs/intent.md']);
    expect(result.diagnostics).toEqual([]);
    expect(result.facts).toHaveLength(6);
    expect(result.facts.find((fact) => fact.object.label === 'src/contract.ts')?.provenance)
      .toMatchObject({ startLine: 5, endLine: 5, digest: sha256(content), commitSha: context.commitSha });
    expect(result.facts.find((fact) => fact.object.label === 'tests/worker.test.ts')?.object)
      .toEqual({ id: 'component:file:tests/worker.test.ts', kind: 'Evidence', label: 'tests/worker.test.ts' });
    expect(result.facts.find((fact) => fact.object.label === 'docs/other.md')?.object.kind).toBe('Document');
    expect(result.facts.every((fact) => fact.authority === 'inferred' &&
      fact.sourceAuthority === 'declared' && fact.extractionReview === 'deterministic')).toBe(true);
    expect(link(content, tracked).facts.every((fact) => fact.sourceAuthority === 'inferred')).toBe(true);
    expect(link(content, [...tracked].reverse(), ['docs/intent.md'])).toEqual(result);
  });

  it('does not guess missing basenames, expand directories or invent missing document nodes', () => {
    const result = link([
      '[ambiguous basename](worker.ts)',
      '[missing](missing.md)',
      '[directory](../src/)',
      '[outside](../../secret.ts)',
      '[malformed](../src/%XX.ts)',
      '[backslash](../src/%5cworker.ts)',
    ].join('\n'), ['src/worker.ts', 'other/worker.ts']);
    expect(result.facts).toEqual([]);
    expect(result.diagnostics).toHaveLength(6);
    expect(result.diagnostics.every((item) => item.kind === 'implementationGaps' && item.evidenceScope === 'source')).toBe(true);
    expect(result.diagnostics.find((item) => item.reason.includes('worker.ts resolves'))?.provenance[0]?.startLine).toBe(1);
  });

  it('ignores external destinations, anchors, images, unused definitions, code blocks and HTML', () => {
    const result = link([
      '[src/fake.ts](https://example.test/src/fake.ts)',
      'https://example.test/src/fake.ts',
      '[anchor](#src/fake.ts)',
      '[remote](//example.test/src/fake.ts)',
      '![src/fake.ts](src/fake.ts)',
      '',
      '[unused]: src/fake.ts',
      '```ts',
      'src/fake.ts',
      '```',
      '<!-- src/fake.ts -->',
    ].join('\n'), ['src/fake.ts', 'docs/src/fake.ts']);
    expect(result).toEqual({ facts: [], diagnostics: [] });
  });

  it('uses exact relative destinations even when basenames repeat and invalidates renamed/deleted targets', () => {
    const content = '[worker](../src/worker.ts)';
    const first = link(content, ['src/worker.ts', 'other/worker.ts']);
    expect(first.facts.map((fact) => fact.object.label)).toEqual(['src/worker.ts']);
    const deleted = link(content, ['src/renamed.ts', 'other/worker.ts']);
    expect(deleted.facts).toEqual([]);
    expect(deleted.diagnostics).toHaveLength(1);
    const renamed = link('[worker](../src/renamed.ts)', ['src/renamed.ts', 'other/worker.ts']);
    expect(renamed.facts.map((fact) => fact.object.label)).toEqual(['src/renamed.ts']);
    expect(renamed.facts[0]?.id).not.toBe(first.facts[0]?.id);
  });

  it('keeps model containment tied to the assertion citation and unreviewed even for an approved source', () => {
    const semanticSource = source('# Intent\n\nWorker implements search.\n');
    const fact: Omit<GraphFact, 'snapshotId'> = {
      id: 'assertion', subject: { id: 'capability:search', kind: 'Capability', label: 'Search' },
      predicate: 'implementedBy', object: { id: 'component:worker', kind: 'Component', label: 'Worker' },
      provenance: { path: 'old-name.md', startLine: 3, endLine: 3, digest: 'cached', commitSha: 'old' },
      confidence: 1, extractor: { id: 'test-provider', version: '1' },
    };
    const { facts } = linkSemanticDocuments(context,
      [{ source: semanticSource, artifact: { facts: [fact] } as unknown as SemanticArtifact }], [], ['docs/intent.md']);
    expect(facts).toHaveLength(2);
    for (const item of facts) expect(item).toMatchObject({ authority: 'inferred', sourceAuthority: 'declared',
      extractionReview: 'unreviewed', provenance: { path: semanticSource.path, digest: semanticSource.digest,
        commitSha: context.commitSha, startLine: 3, endLine: 3 } });
  });
});
