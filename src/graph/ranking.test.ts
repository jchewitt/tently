import { describe, expect, it } from 'vitest';
import type { GraphFact, GraphNode } from '@weftlet/core';
import { rankImpactFacts } from './ranking.js';

const file = (path: string): GraphNode => ({ id: `component:file:${path}`, kind: 'Component', label: path });
const contract = (id: string): GraphNode => ({ id, kind: 'Contract', label: id });
const fact = (id: string, subject: GraphNode, predicate: GraphFact['predicate'], object: GraphNode,
  path = subject.label): GraphFact => ({ id, subject, predicate, object,
  provenance: { path, startLine: 1, endLine: 1, digest: 'source', commitSha: 'commit' },
  extractor: { id: 'fixture', version: '1' }, confidence: 1, authority: 'inferred',
  extractionReview: 'unreviewed', snapshotId: 'snapshot' });

describe('impact ordering', () => {
  it('puts actual downstream consumers and async stages before keyword-rich co-importers without removing them', () => {
    const root = file('src/discovery.ts');
    const shared = contract('contract:module:node:fs/promises');
    const imported = fact('shared-import', root, 'consumes', shared);
    const noise = fact('co-importer', file('src/planning-execution-outcomes-noise.ts'), 'consumes', shared);
    const stages = ['discovery', 'analysis', 'admission', 'planning', 'execution', 'outcomes'];
    const flow = stages.slice(1).flatMap((stage, index) => {
      const message = contract(`contract:queue:${stage}`);
      return [fact(`emit-${stage}`, file(`src/${stages[index]}.ts`), 'emits', message),
        fact(`consume-${stage}`, file(`src/${stage}.ts`), 'consumes', message)];
    });
    const input = [noise, imported, ...flow];
    const ranked = rankImpactFacts(input, [imported, flow[0]!], [root.label], ['planning', 'execution', 'outcomes']);
    const ids = ranked.map(({ fact }) => fact.id);
    expect(ids.indexOf('consume-outcomes')).toBeLessThan(ids.indexOf('co-importer'));
    expect(new Set(ids)).toEqual(new Set(input.map((fact) => fact.id)));
    for (const { fact: returned } of ranked) expect(returned).toBe(input.find((fact) => fact.id === returned.id));
  });

  it('shows a consumer before exhausting a large changed file and retains every detail', () => {
    const root = file('src/large.ts');
    const definitions = Array.from({ length: 100 }, (_, index) =>
      fact(`definition-${index}`, root, 'contains', contract(`symbol:export-${index}`)));
    const consumers = Array.from({ length: 8 }, (_, index) =>
      fact(`consumer-${index}`, file(`src/client-${index}.ts`), 'consumes', definitions[0]!.object));
    const result = rankImpactFacts([...definitions, ...consumers], definitions, [root.label], []);
    expect(result.slice(0, 12).map(({ fact }) => fact.id)).toEqual(
      expect.arrayContaining(consumers.map((fact) => fact.id)));
    expect(result).toHaveLength(108);
    expect(new Set(result.map(({ fact }) => fact.id)).size).toBe(108);
  });

  it('keeps ordering stable across input order and unrelated commit-dependent IDs', () => {
    const root = file('src/root.ts');
    const definition = fact('z', root, 'contains', contract('symbol:public'));
    const alpha = fact('y', file('src/alpha.ts'), 'consumes', definition.object);
    const beta = fact('a', file('src/beta.ts'), 'consumes', definition.object);
    const input = [definition, alpha, beta];
    const keys = (rows: ReturnType<typeof rankImpactFacts>) => rows.map(({ fact }) =>
      [fact.subject.id, fact.predicate, fact.object.id, fact.provenance.path]);
    const before = keys(rankImpactFacts(input, [definition], [root.label], []));
    const changed = input.map((fact, index) => ({ ...fact, id: String(index),
      provenance: { ...fact.provenance, commitSha: 'different', digest: 'changed' }, snapshotId: 'different' }));
    const changedDefinition = changed[0]!;
    expect(keys(rankImpactFacts(changed.reverse(), [changedDefinition], [root.label], []))).toEqual(before);
  });

  it('supports adapters that locate an anchor only through citations', () => {
    const capability: GraphNode = { id: 'capability:search', kind: 'Capability', label: 'Search' };
    const implementation = fact('mapping', capability, 'implementedBy', file('src/worker.ts'), 'docs/owner.md');
    const evidence = fact('check', implementation.object, 'verifiedBy',
      { id: 'evidence:integration', kind: 'Evidence', label: 'Integration test' }, 'test/search.ts');
    const result = rankImpactFacts([evidence, implementation], [implementation], ['docs/owner.md'], []);
    expect(result.map(({ fact }) => fact.id)).toEqual(['mapping', 'check']);
    expect(result.every(({ score }) => Number.isFinite(score))).toBe(true);
  });
});
