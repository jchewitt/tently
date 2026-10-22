import type { GraphFact, GraphSnapshot, ImpactQueryService } from '@weftlet/core';

export interface EvaluationCase {
  id: string;
  task: string;
  changedFiles: string[];
  expected: { path: string; category: string; reason: string }[];
  distractions: string[];
}

export interface EvaluationSuite {
  schemaVersion: 1;
  status: string;
  repositoryId?: string;
  budget: { maxFacts: number; maxDepth: number; maxPages: number };
  cases: EvaluationCase[];
}

export function validateSuite(suite: EvaluationSuite, trackedPaths: readonly string[]): void {
  if (suite.schemaVersion !== 1 || !suite.cases?.length) throw new Error('Invalid evaluation suite');
  for (const [key, limit] of [['maxFacts', 200], ['maxDepth', 128], ['maxPages', 20]] as const) {
    const value = suite.budget[key];
    if (!Number.isInteger(value) || value < 1 || value > limit) throw new Error(`Invalid evaluation budget: ${key}`);
  }
  const ids = new Set<string>();
  const tracked = new Set(trackedPaths);
  for (const item of suite.cases) {
    if (!item.id || ids.has(item.id) || !item.task || !item.changedFiles.length || !item.expected.length) {
      throw new Error('Invalid or duplicate evaluation case');
    }
    ids.add(item.id);
    const expected = item.expected.map((target) => target.path);
    if (new Set(expected).size !== expected.length || item.distractions.some((path) => expected.includes(path)) ||
        expected.some((path) => item.changedFiles.includes(path)) ||
        item.expected.some((target) => !target.reason ||
          !['implementation', 'contract', 'test', 'intent-document'].includes(target.category))) {
      throw new Error(`Conflicting evaluation labels: ${item.id}`);
    }
    for (const path of [...item.changedFiles, ...expected, ...item.distractions]) {
      if (!tracked.has(path)) throw new Error(`Evaluation path absent from evidence commit: ${path}`);
    }
  }
}

/** Mere project membership and text mentions are not a useful relationship witness. */
function targetFacts(facts: readonly GraphFact[], path: string): GraphFact[] {
  const ids = new Set([`component:file:${path}`, `contract:file:${path}`, `document:${path}`]);
  return facts.filter((fact) => fact.subject.kind !== 'Project' && fact.object.kind !== 'Project' &&
    [fact.subject, fact.object].some((node) => ids.has(node.id)));
}

function witness(fact: GraphFact) {
  return { id: fact.id, subject: fact.subject.id, predicate: fact.predicate, object: fact.object.id,
    provenance: fact.provenance, extractor: fact.extractor, authority: fact.authority ?? 'unspecified',
    sourceAuthority: fact.sourceAuthority, extractionReview: fact.extractionReview };
}

export async function scoreImpactCase(
  query: ImpactQueryService, snapshot: GraphSnapshot, item: EvaluationCase, budget: EvaluationSuite['budget'],
) {
  const request = { snapshotId: snapshot.manifest.snapshotId, changedFiles: item.changedFiles,
    task: item.task, maxFacts: budget.maxFacts, maxDepth: budget.maxDepth };
  const first = await query.scan(request);
  let page = first;
  const facts: GraphFact[] = [];
  const ids = new Set<string>();
  const tokens = new Set<string>();
  let pages = 0;
  let depthLimitReached = false;
  while (true) {
    if (page.snapshot.snapshotId !== snapshot.manifest.snapshotId ||
        page.snapshot.contentDigest !== snapshot.manifest.contentDigest ||
        page.snapshot.commitSha !== snapshot.manifest.commitSha) throw new Error('Evaluation snapshot changed between pages');
    if (page.exploration?.rankingVersion !== first.exploration?.rankingVersion) {
      throw new Error('Evaluation ranking version changed between pages');
    }
    for (const fact of page.facts) {
      if (ids.has(fact.id)) throw new Error('Evaluation continuation repeated a fact');
      ids.add(fact.id); facts.push(fact);
    }
    pages++;
    depthLimitReached ||= page.exploration?.depthLimitReached === true;
    const token = page.exploration?.continuation;
    if (!token || pages >= budget.maxPages) break;
    if (tokens.has(token)) throw new Error('Evaluation continuation did not advance');
    tokens.add(token);
    page = await query.scan({ ...request, continuation: token });
  }
  const targets = item.expected.map((target) => {
    const inSnapshot = targetFacts(snapshot.facts, target.path);
    const found = targetFacts(facts, target.path);
    return { ...target, inFirstPage: targetFacts(first.facts, target.path).length > 0,
      inExaminedPages: found.length > 0, inSnapshot: inSnapshot.length > 0,
      outcome: found.length ? 'retrieved' : inSnapshot.length ? 'not-retrieved-within-budget' : 'no-extracted-relationship',
      extractionMethods: [...new Set(inSnapshot.map((fact) => fact.extractor.id))].sort(),
      witnesses: found.slice(0, 2).map(witness),
      snapshotWitness: !found.length && inSnapshot[0] ? witness(inSnapshot[0]) : undefined };
  });
  const retrieved = targets.filter((target) => target.inExaminedPages).length;
  return {
    id: item.id, task: item.task, changedFiles: item.changedFiles, budget,
    recall: { expected: targets.length, firstPage: targets.filter((target) => target.inFirstPage).length,
      examinedPages: retrieved, examinedFraction: retrieved / targets.length },
    exploration: { rankingVersion: first.exploration?.rankingVersion,
      pages, factsExamined: facts.length, reachableFacts: first.exploration?.reachableFacts,
      depthLimitReached, pageBudgetExhausted: Boolean(page.exploration?.continuation),
      complete: page.exploration !== undefined && !depthLimitReached && !page.exploration.truncated,
      continuation: page.exploration?.continuation },
    targets,
    distractions: item.distractions.map((path) => ({ path,
      inSnapshot: targetFacts(snapshot.facts, path).length > 0,
      inFirstPage: targetFacts(first.facts, path).length > 0,
      inExaminedPages: targetFacts(facts, path).length > 0 })),
    firstPageCoverage: first.coverage,
    firstPageDiagnostics: first.diagnostics,
    evidenceState: first.evidenceState,
  };
}
