import { describe, expect, it } from 'vitest';
import type { ContextPack, GraphFact, GraphSnapshot, ImpactQueryService } from '@weftlet/core';
import { scoreImpactCase, validateSuite, type EvaluationSuite } from './score.js';

const budget = { maxFacts: 60, maxDepth: 32, maxPages: 3 };
const item = { id: 'change', task: 'Change a shared contract', changedFiles: ['src/changed.ts'],
  expected: ['src/found.ts', 'src/later.ts', 'src/missing.ts'].map((path) => ({ path,
    category: 'implementation', reason: 'Candidate consumer to inspect' })), distractions: ['src/distraction.ts'] };
const suite: EvaluationSuite = { schemaVersion: 1, status: 'hypotheses', budget, cases: [item] };

function fact(path: string, id = path): GraphFact {
  return { id, subject: { id: `component:file:${path}`, kind: 'Component', label: path },
    predicate: 'consumes', object: { id: 'contract:shared', kind: 'Contract', label: 'shared' },
    provenance: { path, startLine: 1, endLine: 1, commitSha: 'commit', digest: 'bytes' },
    snapshotId: 'snapshot', confidence: 1, extractor: { id: 'scip-symbol-extractor', version: '1' } };
}
const snapshot: GraphSnapshot = { manifest: { snapshotId: 'snapshot', contentDigest: 'digest', commitSha: 'commit',
  schemaVersion: 1, repositoryId: 'fixture', ref: 'commit', ontologyVersion: '1', extractorVersions: {},
  semanticModel: 'none', semanticPromptVersion: '1', generatedAt: '2026-10-21T00:00:00Z',
  semanticArtifactKeys: [], scipIndexDigest: 'scip', rdfDigest: 'rdf' },
  invariants: [], runtimeEvidence: [], unresolved: [],
  facts: [fact('src/found.ts'), fact('src/later.ts'), fact('src/distraction.ts')] };

function pack(facts: readonly GraphFact[], continuation?: string, depthLimitReached = false): ContextPack {
  return { snapshot: snapshot.manifest, facts, capabilities: [], invariants: [], suggestedFiles: [], runtimeEvidence: [],
    markdown: '', coverage: { counts: { productIntent: 0, implementationAndConsumers: facts.length,
      contractsAndInvariants: 0, validationEvidence: 0 }, gaps: ['No intent'] },
    diagnostics: {} as ContextPack['diagnostics'],
    exploration: { returned: facts.length, reachableFacts: 3, maxDepth: 32,
      continuation, depthLimitReached, truncated: Boolean(continuation) || depthLimitReached } };
}

function pages(...values: ContextPack[]): ImpactQueryService {
  let offset = 0;
  return { async scan(request) {
    expect(request.snapshotId).toBe(snapshot.manifest.snapshotId);
    const page = values[offset++];
    if (!page) throw new Error('Unexpected extra scan');
    return page;
  } };
}

describe('impact evaluation measurements', () => {
  it('distinguishes later retrieval, extraction gaps and labeled distractions without claiming precision', async () => {
    const result = await scoreImpactCase(pages(pack([snapshot.facts[0]!], 'next'),
      pack(snapshot.facts.slice(1))), snapshot, item, budget);
    expect(result.recall).toMatchObject({ expected: 3, firstPage: 1, examinedPages: 2 });
    expect(result.targets.map((target) => target.outcome)).toEqual(['retrieved', 'retrieved', 'no-extracted-relationship']);
    expect(result.targets[0]?.witnesses[0]?.provenance.digest).toBe('bytes');
    expect(result.exploration.complete).toBe(true);
    expect(result.distractions).toEqual([{ path: 'src/distraction.ts', inSnapshot: true,
      inFirstPage: false, inExaminedPages: true }]);
    expect(result).not.toHaveProperty('precision');
  });

  it('keeps a bounded miss separate from absent evidence and exposes continuation/depth limits', async () => {
    const result = await scoreImpactCase(pages(pack([snapshot.facts[0]!], 'next', true)), snapshot, item,
      { ...budget, maxPages: 1 });
    expect(result.targets[1]).toMatchObject({ outcome: 'not-retrieved-within-budget', inSnapshot: true });
    expect(result.targets[1]?.snapshotWitness?.id).toBe('src/later.ts');
    expect(result.exploration).toMatchObject({ complete: false, pageBudgetExhausted: true,
      depthLimitReached: true, continuation: 'next', pages: 1 });
  });

  it('does not count project membership, path substrings or provenance-only mentions as relationships', async () => {
    const membership = { ...fact('src/missing.ts', 'membership'), subject: { id: 'project:p', kind: 'Project' as const,
      label: 'project' }, object: fact('src/missing.ts').subject, predicate: 'contains' as const };
    const mention = { ...fact('src/unjudged.ts'), provenance: fact('src/found.ts').provenance };
    const facts = [membership, mention, fact('src/found.ts.bak')];
    const result = await scoreImpactCase(pages(pack(facts)), { ...snapshot, facts }, item, budget);
    expect(result.recall.examinedPages).toBe(0);
    expect(result.targets.every((target) => !target.inSnapshot)).toBe(true);
  });

  it('rejects duplicate pages and snapshot changes rather than inflating recall', async () => {
    await expect(scoreImpactCase(pages(pack([snapshot.facts[0]!], 'next'), pack([snapshot.facts[0]!])),
      snapshot, item, budget)).rejects.toThrow('repeated a fact');
    const stale = { ...pack([]), snapshot: { ...snapshot.manifest, contentDigest: 'other' } };
    await expect(scoreImpactCase(pages(stale), snapshot, item, budget)).rejects.toThrow('snapshot changed');
  });

  it('rejects stale paths, overlapping labels, duplicate cases and oversized budgets', () => {
    const paths = [...item.changedFiles, ...item.expected.map((target) => target.path), ...item.distractions];
    expect(() => validateSuite(suite, paths)).not.toThrow();
    expect(() => validateSuite(suite, [])).toThrow('absent from evidence commit');
    expect(() => validateSuite({ ...suite, cases: [{ ...item, distractions: ['src/found.ts'] }] }, paths)).toThrow('Conflicting');
    expect(() => validateSuite({ ...suite, cases: [item, item] }, paths)).toThrow('duplicate');
    expect(() => validateSuite({ ...suite, budget: { ...budget, maxFacts: 201 } }, paths)).toThrow('budget');
  });
});
