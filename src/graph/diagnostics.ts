// Modified for standalone extraction; see docs/extraction-manifest.json.
import type {
  ContextPack,
  DiagnosticKind,
  DiagnosticReport,
  GraphDiagnostic,
  GraphFact,
  GraphSnapshot,
  ImpactScanRequest,
} from "@weftlet/core";

export const diagnosticKinds: readonly DiagnosticKind[] = [
  'missingIntent',
  'ambiguousIntent',
  'implementationGaps',
  'runtimeGaps',
  'drift',
];
export const MAX_DIAGNOSTICS_PER_KIND = 5;

function relevantDiagnostic(
  item: GraphDiagnostic,
  request: ImpactScanRequest,
  facts: readonly GraphFact[],
  focus: readonly string[],
): boolean {
  const hasSelectors =
    request.ownerDocument ||
    request.changedFiles?.length ||
    request.symbols?.length ||
    focus.length;
  if (!hasSelectors) return true;
  const nodes = new Set(
    facts
      .flatMap((fact) => [fact.subject, fact.object])
      .filter((node) => !['Project', 'Document', 'Scope'].includes(node.kind))
      .map((node) => node.id),
  );
  if (item.relatedNodeIds.some((id) => nodes.has(id))) return true;
  if (item.provenance.some((span) => request.changedFiles?.some((file) => span.path === file)))
    return true;
  // A source document can contain many independent capabilities. Match the cited passage,
  // not every diagnostic from a philosophy document that contributed one selected fact.
  if (
    item.provenance.some((span) =>
      facts.some(
        (fact) =>
          fact.provenance.path === span.path &&
          fact.provenance.startLine <= span.endLine &&
          fact.provenance.endLine >= span.startLine,
      ),
    )
  )
    return true;
  return (
    item.provenance.some((span) => span.path === request.ownerDocument) &&
    (focus.length === 0 || focus.some((term) => item.reason.toLowerCase().includes(term)))
  );
}

export function selectDiagnostics(
  snapshot: Pick<GraphSnapshot, 'unresolved' | 'diagnostics'>,
  request: ImpactScanRequest,
  facts: readonly GraphFact[],
  focus: readonly string[],
  queryDiagnostics: readonly GraphDiagnostic[],
): DiagnosticReport {
  const report = { unclassifiedLegacyCount: snapshot.unresolved.length } as DiagnosticReport;
  const unique = [...new Map((snapshot.diagnostics ?? []).map((item) => [item.id, item])).values()];
  for (const kind of diagnosticKinds) {
    const candidates = unique.filter((item) => item.kind === kind);
    const relevant = candidates.filter((item) => relevantDiagnostic(item, request, facts, focus));
    const ordered = [
      ...queryDiagnostics.filter((item) => item.kind === kind),
      ...relevant.sort((a, b) => a.id.localeCompare(b.id)),
    ];
    report[kind] = {
      items: ordered.slice(0, MAX_DIAGNOSTICS_PER_KIND),
      omittedRelevant: Math.max(0, ordered.length - MAX_DIAGNOSTICS_PER_KIND),
      omittedUnrelated: candidates.length - relevant.length,
    };
  }
  return report;
}

export function diagnosticSummary(pack: Pick<ContextPack, 'diagnostics'>): readonly string[] {
  return diagnosticKinds
    .flatMap((kind) => {
      const section = pack.diagnostics[kind];
      return [
        `${kind}: ${section.items.length} shown; ${section.omittedRelevant} additional relevant; ${section.omittedUnrelated} unrelated omitted`,
        ...section.items.map(
          (item) =>
            `${item.reason} (${item.provenance.map((span) => `${span.path}:${span.startLine}`).join(', ') || 'query of the cited snapshot'})`,
        ),
      ];
    })
    .concat(
      `Legacy diagnostics: ${pack.diagnostics.unclassifiedLegacyCount}; inspect with diagnostics show --snapshot <snapshotId>.`,
    );
}
