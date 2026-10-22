// Modified for standalone extraction; see docs/extraction-manifest.json.
export type GraphNodeKind =
  | 'Project'
  | 'Document'
  | 'Capability'
  | 'Workflow'
  | 'Component'
  | 'Contract'
  | 'Evidence'
  | 'Invariant'
  | 'Snapshot'
  | 'Provider'
  | 'PersistenceModel'
  | 'Scope';

export type GraphPredicate =
  | 'realizes'
  | 'implementedBy'
  | 'consumes'
  | 'emits'
  | 'persistsTo'
  | 'governedBy'
  | 'definedBy'
  | 'verifiedBy'
  | 'operationallyOwnedBy'
  | 'decisionAuthority'
  | 'routesThrough'
  | 'authorizedBy'
  | 'sourcedFrom'
  | 'references'
  | 'contains';

export interface SourceSpan {
  readonly path: string;
  readonly startLine: number;
  readonly endLine: number;
  readonly digest: string;
  readonly commitSha: string;
}

export interface ExtractorIdentity {
  readonly id: string;
  readonly version: string;
}

export interface GraphNode {
  readonly id: string;
  readonly kind: GraphNodeKind;
  readonly label: string;
  readonly attributes?: Readonly<Record<string, string | number | boolean>>;
}

export interface GraphFact {
  readonly id: string;
  readonly subject: GraphNode;
  readonly predicate: GraphPredicate;
  readonly object: GraphNode;
  readonly provenance: SourceSpan;
  readonly extractor: ExtractorIdentity;
  readonly confidence: number;
  readonly snapshotId: string;
  readonly authority?: 'declared' | 'implemented' | 'validated' | 'observed' | 'inferred' | 'draft';
  /** Approval of the source does not constitute review of a model's extracted assertion. */
  readonly sourceAuthority?: 'declared' | 'inferred' | 'draft';
  readonly extractionReview?: 'unreviewed' | 'approved' | 'deterministic';
}

export interface SemanticArtifact {
  readonly key: string;
  readonly stableSemanticId: string;
  readonly source: SourceSpan;
  readonly sourceDigest: string;
  readonly promptVersion: string;
  readonly extractorVersion: string;
  readonly modelIdentity: string;
  readonly adapterVersion: string;
  readonly ontologyVersion: string;
  readonly facts: readonly Omit<GraphFact, 'snapshotId'>[];
  readonly oml: string;
  readonly unresolvedMappings: readonly string[];
  readonly diagnostics?: readonly GraphDiagnostic[];
  readonly rawModelOutput: string;
  readonly outputDigest: string;
}

export interface RuntimeTraceReference {
  readonly traceId: string;
  readonly spanId: string;
  readonly serviceName: string;
  readonly serviceVersion: string;
  readonly capability?: string;
  readonly operation?: string;
  readonly environment?: string;
  readonly serviceInstanceId?: string;
  readonly observedAt?: string;
  readonly sourcePath: string;
  readonly sourceDigest: string;
  readonly accepted: boolean;
  readonly reason?: string;
}

export interface InvariantResult {
  readonly invariantId: string;
  readonly status: 'pass' | 'fail' | 'unknown';
  readonly message: string;
  readonly provenance: readonly SourceSpan[];
}

export interface SnapshotManifest {
  readonly schemaVersion: 1;
  readonly repositoryId: string;
  readonly ref: string;
  readonly commitSha: string;
  readonly baseSha?: string;
  readonly overlayDigest?: string;
  readonly overlayCapture?: {
    readonly files: readonly { readonly path: string; readonly digest: string | null }[];
    readonly sourcePatterns: readonly string[];
    readonly excludedPaths: readonly string[];
  };
  readonly snapshotId: string;
  readonly configurationDigest?: string;
  readonly scope?: readonly string[];
  readonly ontologyVersion: string;
  readonly extractorVersions: Readonly<Record<string, string>>;
  readonly semanticModel: string;
  readonly semanticPromptVersion: string;
  readonly generatedAt: string;
  readonly contentDigest: string;
  readonly runtimeEvidenceDigest?: string;
  readonly semanticArtifactKeys: readonly string[];
  readonly scipIndexDigest: string;
  readonly rdfDigest: string;
}

export interface GraphSnapshot {
  readonly manifest: SnapshotManifest;
  readonly facts: readonly GraphFact[];
  readonly invariants: readonly InvariantResult[];
  readonly runtimeEvidence: readonly RuntimeTraceReference[];
  readonly unresolved: readonly string[];
  readonly diagnostics?: readonly GraphDiagnostic[];
}

export type DiagnosticKind =
  | 'missingIntent'
  | 'ambiguousIntent'
  | 'implementationGaps'
  | 'runtimeGaps'
  | 'drift';

export interface GraphDiagnostic {
  readonly id: string;
  readonly kind: DiagnosticKind;
  readonly reason: string;
  readonly provenance: readonly SourceSpan[];
  readonly relatedNodeIds: readonly string[];
  /** Query gaps describe the searched snapshot, never absence from the entire repository. */
  readonly evidenceScope: 'source' | 'snapshot-query';
}

export interface DiagnosticSection {
  readonly items: readonly GraphDiagnostic[];
  readonly omittedRelevant: number;
  readonly omittedUnrelated: number;
}

export type DiagnosticReport = Record<DiagnosticKind, DiagnosticSection> & {
  /** Legacy free text has no reliable category/provenance; inspect it through maintenance CLI. */
  readonly unclassifiedLegacyCount: number;
};

export interface ExtractionContext {
  readonly repositoryRoot: string;
  readonly repositoryId: string;
  readonly ref: string;
  readonly commitSha: string;
  readonly baseSha?: string;
  readonly snapshotId: string;
  readonly changedPaths: readonly string[];
  readonly deletedPaths: readonly string[];
  readonly renamedPaths: Readonly<Record<string, string>>;
  readonly semanticPaths?: readonly string[];
}

export interface FactExtractor {
  readonly identity: ExtractorIdentity;
  extract(context: ExtractionContext): Promise<readonly GraphFact[]>;
}

export interface SemanticSource {
  readonly stableSemanticId: string;
  readonly path: string;
  readonly content: string;
  readonly digest: string;
}

export interface SemanticSourceProvider {
  list(context: ExtractionContext): Promise<readonly SemanticSource[]>;
}

export interface GraphStore {
  write(snapshot: GraphSnapshot): Promise<void>;
  read(snapshotId: string): Promise<GraphSnapshot | undefined>;
}

export interface SnapshotStore extends GraphStore {
  readHead(headName: string): Promise<GraphSnapshot | undefined>;
  updateHead(headName: string, snapshotId: string): Promise<void>;
}

export interface ImpactScanRequest {
  readonly snapshotId?: string;
  readonly ownerDocument?: string;
  readonly task?: string;
  readonly checklistItems?: readonly string[];
  readonly changedFiles?: readonly string[];
  readonly symbols?: readonly string[];
  readonly capabilities?: readonly string[];
  readonly maxFacts?: number;
  readonly maxDepth?: number;
  readonly continuation?: string;
}

export interface ContextPack {
  readonly snapshot: Pick<SnapshotManifest, 'snapshotId' | 'commitSha' | 'contentDigest' | 'configurationDigest' | 'scope' | 'baseSha' | 'overlayDigest' | 'overlayCapture'>;
  readonly evidenceState?: {
    readonly currentCommit?: string;
    readonly excludedWorkingChanges: readonly string[];
    readonly capturedWorkingChanges?: readonly string[];
    readonly changedSinceCapture?: readonly string[];
    readonly overlayFreshness?: 'current' | 'stale' | 'unknown';
    readonly stale: boolean;
    readonly configurationMatches: boolean;
    readonly eligibleForCurrentDiffValidation: false;
  };
  readonly capabilities: readonly GraphNode[];
  readonly facts: readonly GraphFact[];
  readonly invariants: readonly InvariantResult[];
  readonly runtimeEvidence: readonly RuntimeTraceReference[];
  readonly suggestedFiles: readonly string[];
  readonly coverage: ContextPackCoverage;
  readonly diagnostics: DiagnosticReport;
  readonly markdown: string;
  readonly exploration?: {
    /** Ordering policy for this query; independent of the immutable snapshot's assembly version. */
    readonly rankingVersion?: string;
    readonly returned: number;
    readonly reachableFacts: number;
    readonly maxDepth: number;
    readonly depthLimitReached: boolean;
    readonly truncated: boolean;
    readonly continuation?: string;
  };
}

export type ContextPackLane =
  | 'productIntent'
  | 'contractsAndInvariants'
  | 'implementationAndConsumers'
  | 'validationEvidence';

export interface ContextPackCoverage {
  readonly counts: Readonly<Record<ContextPackLane, number>>;
  readonly gaps: readonly string[];
}

export interface ImpactQueryService {
  scan(request: ImpactScanRequest): Promise<ContextPack>;
}

export interface InvariantEvaluator {
  evaluate(snapshotId: string, facts: readonly GraphFact[]): Promise<readonly InvariantResult[]>;
}

export interface RuntimeEvidenceProvider {
  collect(context: ExtractionContext): Promise<readonly RuntimeTraceReference[]>;
}

export interface ContextPackRenderer {
  render(pack: Omit<ContextPack, 'markdown'>): string;
}

export interface ContextGraphRepository {
  readFileAt(commitSha: string, path: string): Promise<string>;
  listFilesAt(commitSha: string, roots: readonly string[]): Promise<readonly string[]>;
}

export interface ContextGraphAdapter {
  readonly factExtractors: readonly FactExtractor[];
  readonly invariantEvaluators: readonly InvariantEvaluator[];
}

export interface ContextGraphAdapterModule {
  createContextGraphAdapter(repository: ContextGraphRepository): ContextGraphAdapter;
}
