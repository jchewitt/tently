// Modified for standalone extraction; see docs/extraction-manifest.json.
import { contextPackEvidenceAuthority } from "./authority.js";
import { RdfEvidenceGraph } from "./rdf.js";
import { sha256, stableJson } from "../infrastructure/util.js";
import type {
  ContextPack,
  ContextPackLane,
  ContextPackRenderer,
  GraphFact,
  GraphDiagnostic,
  ImpactQueryService,
  ImpactScanRequest,
  SnapshotStore,
} from "@launch-echo/tently-core";
import { diagnosticSummary, selectDiagnostics } from "./diagnostics.js";

export const DEFAULT_CONTEXT_PACK_FACTS = 60;
export const MAX_CONTEXT_PACK_FACTS = 200;
const contextPackLanes: readonly ContextPackLane[] = [
  'productIntent',
  'contractsAndInvariants',
  'implementationAndConsumers',
  'validationEvidence',
];

function isValidationFact(fact: GraphFact): boolean {
  const path = fact.provenance.path.toLowerCase();
  return (
    fact.subject.kind === 'Evidence' ||
    fact.object.kind === 'Evidence' ||
    fact.predicate === 'verifiedBy' ||
    /(?:^|\/)(?:test|tests|testing|validation|evidence)(?:\/|$)/.test(path) ||
    /\.(?:spec|test)\.[cm]?[jt]sx?$/.test(path)
  );
}

function isDeclaredFact(fact: GraphFact): boolean {
  if (fact.authority) return fact.authority === 'declared' && !isValidationFact(fact);
  return false;
}

export function contextPackLaneForFact(fact: GraphFact): ContextPackLane | undefined {
  if (fact.extractor.id === 'otlp-runtime-evidence') return undefined;
  const kinds = new Set([fact.subject.kind, fact.object.kind]);
  if (isValidationFact(fact)) {
    return 'validationEvidence';
  }
  if (
    kinds.has('Contract') ||
    kinds.has('Invariant') ||
    kinds.has('PersistenceModel') ||
    ['governedBy', 'definedBy', 'persistsTo', 'authorizedBy'].includes(fact.predicate)
  ) {
    return 'contractsAndInvariants';
  }
  if (
    (isDeclaredFact(fact) || fact.sourceAuthority === 'declared') &&
    (kinds.has('Document') ||
      kinds.has('Capability') ||
      kinds.has('Workflow') ||
      ['decisionAuthority', 'operationallyOwnedBy', 'references'].includes(fact.predicate))
  ) {
    return 'productIntent';
  }
  return 'implementationAndConsumers';
}

export { contextPackEvidenceAuthority } from "./authority.js";

function selectBalancedFacts(
  ranked: readonly GraphFact[],
  maxFacts: number,
): { facts: readonly GraphFact[]; counts: Record<ContextPackLane, number> } {
  const queues = Object.fromEntries(
    contextPackLanes.map((lane) => [
      lane,
      ranked.filter((fact) => contextPackLaneForFact(fact) === lane),
    ]),
  ) as Record<ContextPackLane, GraphFact[]>;
  const facts: GraphFact[] = [];
  while (facts.length < maxFacts && contextPackLanes.some((lane) => queues[lane].length > 0)) {
    for (const lane of contextPackLanes) {
      const fact = queues[lane].shift();
      if (fact) facts.push(fact);
      if (facts.length === maxFacts) break;
    }
  }
  const counts = Object.fromEntries(
    contextPackLanes.map((lane) => [
      lane,
      facts.filter((fact) => contextPackLaneForFact(fact) === lane).length,
    ]),
  ) as Record<ContextPackLane, number>;
  return { facts, counts };
}

const searchStopWords = new Set([
  'about',
  'agent',
  'and',
  'from',
  'into',
  'preserving',
  'replacing',
  'rules',
  'the',
  'while',
  'with',
]);

function focusTerms(values: readonly (string | undefined)[]): readonly string[] {
  return [
    ...new Set(
      values
        .filter((value): value is string => Boolean(value))
        .flatMap((value) => [value, ...value.split(/[^A-Za-z0-9_.:/-]+/)])
        .map((value) => value.toLowerCase())
        .filter((value) => value.length >= 4 && !searchStopWords.has(value)),
    ),
  ];
}

function factSearchText(fact: GraphFact): string {
  return [
    fact.subject.id,
    fact.subject.label,
    fact.predicate,
    fact.object.id,
    fact.object.label,
    fact.provenance.path,
  ]
    .join(' ')
    .toLowerCase();
}

function semanticPriority(fact: GraphFact): number {
  return /codex-cli|document-linker/.test(fact.extractor.id) ? 0 : 1;
}

function boundedFactLimit(value: number | undefined): number {
  if (value === undefined) return DEFAULT_CONTEXT_PACK_FACTS;
  if (!Number.isInteger(value) || value < 1) {
    throw new Error('maxFacts must be a positive integer');
  }
  return Math.min(value, MAX_CONTEXT_PACK_FACTS);
}

export class MarkdownContextPackRenderer implements ContextPackRenderer {
  render(pack: Omit<ContextPack, 'markdown'>): string {
    const lines = [
      `# Context Pack`,
      '',
      `Snapshot: \`${pack.snapshot.snapshotId}\` (${pack.snapshot.commitSha})`,
      `Configuration: ${pack.snapshot.configurationDigest ?? 'legacy/unknown'}; scope: ${pack.snapshot.scope?.join(', ') ?? 'legacy/unknown'}`,
      ...(pack.exploration ? [
        `Relationships returned: ${pack.exploration.returned}/${pack.exploration.reachableFacts}; truncated: ${pack.exploration.truncated}; depth limit reached: ${pack.exploration.depthLimitReached}`,
        ...(pack.exploration.continuation ? [`Continuation: ${pack.exploration.continuation}`] : []),
      ] : []),
      ...(pack.evidenceState ? [
        `Stale relative to checkout: ${pack.evidenceState.stale}; configuration matches: ${pack.evidenceState.configurationMatches}`,
        `Excluded working changes: ${pack.evidenceState.excludedWorkingChanges.join(', ') || '(none)'}`,
        ...(pack.evidenceState.overlayFreshness ? [
          `Overlay freshness: ${pack.evidenceState.overlayFreshness}`,
          `Captured working changes: ${pack.evidenceState.capturedWorkingChanges?.join(', ') || '(none)'}`,
          `Changed since capture: ${pack.evidenceState.changedSinceCapture?.join(', ') || '(none)'}`,
        ] : []),
        'Saved evidence does not validate the current working diff.',
      ] : []),
      '',
      '## Capabilities',
      ...pack.capabilities.map((node) => `- ${node.label} (\`${node.id}\`)`),
      '',
      '## Governing invariants',
      ...pack.invariants.map((item) => `- ${item.status}: ${item.message}`),
      '',
      '## Coverage',
      ...contextPackLanes.map((lane) => `- ${lane}: ${pack.coverage.counts[lane]} relationships`),
      ...(pack.coverage.gaps.length
        ? pack.coverage.gaps.map((gap) => `- GAP: ${gap}`)
        : ['- No Context Pack lane gaps detected.']),
      ...contextPackLanes.flatMap((lane) => [
        '',
        `## ${lane}`,
        ...pack.facts
          .filter((fact) => contextPackLaneForFact(fact) === lane)
          .map(
            (fact) =>
              `- [${contextPackEvidenceAuthority(fact)}] ${fact.subject.label} —${fact.predicate}→ ${fact.object.label} ` +
              `(\`${fact.provenance.path}:${fact.provenance.startLine}\`, confidence ${fact.confidence}${fact.sourceAuthority ? `; source ${fact.sourceAuthority}; extraction ${fact.extractionReview ?? 'unknown'}` : ''})`,
          ),
      ]),
      '',
      '## Runtime evidence',
      ...(pack.runtimeEvidence.length
        ? pack.runtimeEvidence.map(
            (item) =>
              `- [observed] ${item.accepted ? 'accepted' : 'segregated'} trace \`${item.traceId}\` ` +
              `(${item.serviceName}@${item.serviceVersion}; ` +
              `${item.capability ?? 'unmapped capability'}; ` +
              `${item.operation ?? 'unmapped operation'}; ` +
              `${item.environment ?? 'unknown environment'}; ` +
              `${item.observedAt ?? 'unknown observation time'})`,
          )
        : ['- GAP: No accepted exact-deployment runtime evidence matched this request.']),
      '',
      '## Suggested files',
      ...pack.suggestedFiles.map((path) => `- \`${path}\``),
      '',
      '## Scoped diagnostics',
      ...diagnosticSummary(pack).map((item) => `- ${item}`),
    ];
    return lines.join('\n');
  }
}

export class SnapshotImpactQueryService implements ImpactQueryService {
  constructor(
    private readonly store: SnapshotStore,
    private readonly headName: string,
    private readonly renderer: ContextPackRenderer = new MarkdownContextPackRenderer(),
  ) {}

  async scan(request: ImpactScanRequest): Promise<ContextPack> {
    const maxFacts = boundedFactLimit(request.maxFacts);
    const saved = request.snapshotId
      ? await this.store.read(request.snapshotId)
      : await this.store.readHead(this.headName);
    if (!saved)
      throw new Error('No graph snapshot is available; run context-graph hydrate first');
    const snapshot = { ...saved, facts: await new RdfEvidenceGraph(saved).facts() };
    const maxDepth = request.maxDepth ?? 32;
    if (!Number.isInteger(maxDepth) || maxDepth < 1 || maxDepth > 128) {
      throw new Error('maxDepth must be an integer between 1 and 128');
    }
    const anchorTerms = [
      request.ownerDocument,
      ...(request.changedFiles ?? []),
      ...(request.symbols ?? []),
    ]
      .filter((term): term is string => Boolean(term))
      .map((term) => term.toLowerCase());
    const focus = focusTerms([
      request.task,
      ...(request.checklistItems ?? []),
      ...(request.capabilities ?? []),
    ]);
    const terms = [...anchorTerms, ...focus];
    const directTerms = anchorTerms.length > 0 ? anchorTerms : focus;
    const direct = snapshot.facts.filter((fact) => this.matches(fact, directTerms));
    const ranked = new Map(direct.map((fact) => [fact.id, fact]));
    const distance = new Map(direct.map((fact) => [fact.id, 0]));
    let frontier = new Set(
      direct.flatMap((fact) =>
        [fact.subject, fact.object]
          .filter((node) => node.kind !== 'Project')
          .map((node) => node.id),
      ),
    );
    const visitedNodes = new Set(frontier);
    for (let depth = 0; depth < maxDepth && frontier.size > 0; depth += 1) {
      const next = new Set<string>();
      for (const fact of snapshot.facts) {
        if (!frontier.has(fact.subject.id) && !frontier.has(fact.object.id)) continue;
        ranked.set(fact.id, fact);
        if (!distance.has(fact.id)) distance.set(fact.id, depth + 1);
        for (const node of [fact.subject, fact.object]) {
          if (node.kind !== 'Project' && !visitedNodes.has(node.id)) next.add(node.id);
        }
      }
      for (const node of next) visitedNodes.add(node);
      frontier = next;
    }
    const ordered = [...ranked.values()].sort((left, right) => {
      const leftText = factSearchText(left);
      const rightText = factSearchText(right);
      const leftFocus = focus.filter((term) => leftText.includes(term)).length;
      const rightFocus = focus.filter((term) => rightText.includes(term)).length;
      return (
        rightFocus - leftFocus ||
        semanticPriority(left) - semanticPriority(right) ||
        (distance.get(left.id) ?? 4) - (distance.get(right.id) ?? 4) ||
        left.id.localeCompare(right.id)
      );
    });
    const allBalanced = [
      ...selectBalancedFacts(ordered, ordered.length).facts,
      ...ordered.filter((fact) => contextPackLaneForFact(fact) === undefined),
    ];
    const { continuation: _continuation, snapshotId: _snapshotId, ...query } = request;
    const queryDigest = sha256(stableJson(query));
    let offset = 0;
    if (request.continuation) {
      if (request.continuation.length > 2048) throw new Error('Invalid continuation');
      const token = JSON.parse(Buffer.from(request.continuation, 'base64url').toString('utf8'));
      if (token.snapshot !== snapshot.manifest.snapshotId ||
          token.digest !== snapshot.manifest.contentDigest || token.query !== queryDigest ||
          !Number.isInteger(token.offset) || token.offset < 0 || token.offset > allBalanced.length) {
        throw new Error('Continuation does not match this snapshot and query');
      }
      offset = token.offset;
    }
    const facts = allBalanced.slice(offset, offset + maxFacts);
    const balanced = selectBalancedFacts(facts, facts.length);
    const nextOffset = offset + facts.length;
    const continuation = nextOffset < allBalanced.length ? Buffer.from(JSON.stringify({
      snapshot: snapshot.manifest.snapshotId, digest: snapshot.manifest.contentDigest,
      query: queryDigest, offset: nextOffset,
    })).toString('base64url') : undefined;
    const capabilities = [
      ...new Map(
        facts
          .flatMap((fact) => [fact.subject, fact.object])
          .filter((node) => node.kind === 'Capability')
          .map((node) => [node.id, node]),
      ).values(),
    ];
    const suggestedFiles = [
      ...new Set([...direct, ...facts].map((fact) => fact.provenance.path).filter(Boolean)),
    ].slice(0, 20);
    const runtimeEvidence = snapshot.runtimeEvidence.filter(
      (item) =>
        item.accepted &&
        (!terms.length ||
          terms.some((term) => item.capability?.includes(term) || item.operation?.includes(term))),
    );
    const declaredCapabilityIds = new Set(
      snapshot.facts
        .filter(isDeclaredFact)
        .flatMap((fact) => [fact.subject, fact.object])
        .filter((node) => node.kind === 'Capability')
        .map((node) => node.id),
    );
    const queryDiagnostics: GraphDiagnostic[] = runtimeEvidence.flatMap((item) => {
      if (!item.capability) return [];
      const capability = `capability:${item.capability.replace(/^(?:[^:]+:)?capability:/, '')}`;
      if (declaredCapabilityIds.has(capability)) return [];
      return [
        {
          id: `runtime-intent-gap-${item.traceId}-${item.spanId}`,
          kind: 'drift' as const,
          reason: `Observed runtime capability ${capability} has no declared product-intent mapping. Verify the source docs before concluding intent is absent.`,
          // This is a query over runtime references, not a cited passage in the source file.
          // The actual trace/span and source digest remain in pack.runtimeEvidence.
          provenance: [],
          relatedNodeIds: [capability],
          evidenceScope: 'snapshot-query' as const,
        },
      ];
    });
    for (const [kind, missing, reason] of [
      [
        'missingIntent',
        balanced.counts.productIntent === 0,
        'No declared intent matched this query. Inspect the owner and philosophy sources before concluding a requirement is missing.',
      ],
      [
        'implementationGaps',
        balanced.counts.implementationAndConsumers === 0,
        'No implementation relationships matched this query. Inspect code before concluding behavior is missing.',
      ],
      [
        'runtimeGaps',
        runtimeEvidence.length === 0,
        'No accepted exact-deployment runtime evidence matched this query; runtime behavior is not observed.',
      ],
    ] as const) {
      if (missing)
        queryDiagnostics.push({
          id: `query-${kind}`,
          kind,
          reason,
          provenance: [],
          relatedNodeIds: [],
          evidenceScope: 'snapshot-query',
        });
    }
    const plain = {
      snapshot: {
        snapshotId: snapshot.manifest.snapshotId,
        commitSha: snapshot.manifest.commitSha,
        contentDigest: snapshot.manifest.contentDigest,
        configurationDigest: snapshot.manifest.configurationDigest,
        scope: snapshot.manifest.scope,
        baseSha: snapshot.manifest.baseSha,
        overlayDigest: snapshot.manifest.overlayDigest,
        overlayCapture: snapshot.manifest.overlayCapture,
      },
      capabilities,
      facts,
      invariants: snapshot.invariants.filter((item) =>
        item.provenance.some((span) => suggestedFiles.includes(span.path)),
      ),
      runtimeEvidence,
      suggestedFiles,
      coverage: {
        counts: balanced.counts,
        gaps: [...contextPackLanes
          .filter((lane) => balanced.counts[lane] === 0)
          .map((lane) => `No ${lane} evidence matched this request.`),
          ...(facts.some((fact) => fact.sourceAuthority === 'declared' && fact.extractionReview === 'unreviewed')
            ? ['Approved-source extraction remains unreviewed; verify cited intent before using it as a rule or gate.'] : [])],
      },
      diagnostics: selectDiagnostics(snapshot, request, facts, focus, queryDiagnostics),
      exploration: {
        returned: facts.length, reachableFacts: allBalanced.length, maxDepth,
        depthLimitReached: frontier.size > 0, truncated: Boolean(continuation) || frontier.size > 0,
        continuation,
      },
    };
    return { ...plain, markdown: this.renderer.render(plain) };
  }

  private matches(fact: GraphFact, terms: readonly string[]): boolean {
    if (terms.length === 0) return true;
    const haystack = factSearchText(fact);
    return terms.some((term) => haystack.includes(term));
  }
}
