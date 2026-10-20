// Modified for standalone extraction; see docs/extraction-manifest.json.
import { describe, expect, it } from 'vitest';
import type { GraphDiagnostic, GraphFact } from "@launch-echo/tently-core";
import { diagnosticSummary, MAX_DIAGNOSTICS_PER_KIND, selectDiagnostics } from "./diagnostics.js";

const span = {
  path: 'docs/philosophy.md',
  startLine: 10,
  endLine: 12,
  digest: 'doc',
  commitSha: 'a'.repeat(40),
};
const fact: GraphFact = {
  id: 'totals',
  subject: { id: 'capability:totals', kind: 'Capability', label: 'Account totals' },
  predicate: 'governedBy',
  object: { id: 'contract:totals', kind: 'Contract', label: 'Totals contract' },
  provenance: span,
  extractor: { id: 'codex-cli:test', version: '1' },
          authority: 'declared',
  confidence: 1,
  snapshotId: 'snap',
};
function diagnostic(id: string, options: Partial<GraphDiagnostic> = {}): GraphDiagnostic {
  return {
    id,
    kind: 'ambiguousIntent',
    reason: `Ambiguous account totals ${id}`,
    provenance: [span],
    relatedNodeIds: ['capability:totals'],
    evidenceScope: 'source',
    ...options,
  };
}

describe('scoped diagnostics', () => {
  it('filters unrelated passages even when they share a selected philosophy document', () => {
    const unrelated = diagnostic('elsewhere', {
      provenance: [{ ...span, startLine: 90, endLine: 92 }],
      relatedNodeIds: ['capability:news'],
    });
    const report = selectDiagnostics(
      { diagnostics: [unrelated, diagnostic('totals')], unresolved: ['legacy ambiguity'] },
      { ownerDocument: 'docs/owner.md', task: 'account totals' },
      [fact],
      ['account', 'totals'],
      [],
    );
    expect(report.ambiguousIntent.items.map((item) => item.id)).toEqual(['totals']);
    expect(report.ambiguousIntent.omittedUnrelated).toBe(1);
    expect(report.unclassifiedLegacyCount).toBe(1);
    expect(diagnosticSummary({ diagnostics: report }).join('\n')).not.toContain('legacy ambiguity');
  });

  it('caps relevant diagnostics independently per category with truthful omission counts', () => {
    const source = Array.from({ length: 9 }, (_, i) => diagnostic(`issue-${i}`));
    source.push(diagnostic('missing', { kind: 'missingIntent' }));
    const report = selectDiagnostics(
      { diagnostics: source, unresolved: [] },
      { capabilities: ['totals'] },
      [fact],
      ['totals'],
      [],
    );
    expect(report.ambiguousIntent.items).toHaveLength(MAX_DIAGNOSTICS_PER_KIND);
    expect(report.ambiguousIntent.omittedRelevant).toBe(4);
    expect(report.missingIntent.items).toHaveLength(1);
    expect(source).toHaveLength(10);
  });

  it('keeps explicit changed-file gaps and snapshot query gaps without inventing source citations', () => {
    const queryGap = diagnostic('runtime', {
      kind: 'runtimeGaps',
      provenance: [],
      relatedNodeIds: [],
      evidenceScope: 'snapshot-query',
    });
    const report = selectDiagnostics(
      { diagnostics: [diagnostic('file', { relatedNodeIds: [] })], unresolved: [] },
      { changedFiles: [span.path] },
      [],
      [],
      [queryGap],
    );
    expect(report.ambiguousIntent.items).toHaveLength(1);
    expect(report.runtimeGaps.items[0]?.provenance).toEqual([]);
    expect(diagnosticSummary({ diagnostics: report }).join('\n')).toContain(
      'query of the cited snapshot',
    );
  });

  it('does not pull unrelated diagnostics through a project hub', () => {
    const projectFact: GraphFact = {
      ...fact,
      subject: { id: 'project:repo', kind: 'Project', label: 'Repo' },
    };
    const report = selectDiagnostics(
      {
        unresolved: [],
        diagnostics: [
          diagnostic('unrelated', {
            provenance: [{ ...span, path: 'docs/elsewhere.md' }],
            relatedNodeIds: ['project:repo'],
          }),
        ],
      },
      { symbols: ['totals'] },
      [projectFact],
      [],
      [],
    );
    expect(report.ambiguousIntent.items).toEqual([]);
  });
});
