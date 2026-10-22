// Modified for standalone extraction; see docs/extraction-manifest.json.
import type { ContextGraphConfig } from "../configuration/config.js";
import { scipSourcePatterns } from '../configuration/scip-project.js';
import type {
  ExtractionContext,
  FactExtractor,
  GraphSnapshot,
  GraphDiagnostic,
  InvariantEvaluator,
  RuntimeTraceReference,
  RuntimeEvidenceProvider,
  SnapshotStore,
} from "@weftlet/core";
import type { GitRepository } from "../repository/git.js";
import { contractPatternRoots } from "../repository/glob.js";
import type { OntologyCompiler } from "../extraction/ontology.js";
import type { SemanticHydrator } from "../extraction/semantic.js";
import type { ScipIndexResult, StaticIndexer } from "../extraction/static.js";
import { sha256, stableJson } from "../infrastructure/util.js";
import { linkSemanticDocuments } from "../extraction/document.js";
import { runtimeEvidenceFacts } from "../extraction/runtime-evidence.js";
import { matchesRepositoryGlob } from "../repository/glob.js";
import { RdfEvidenceGraph } from "../graph/rdf.js";

export interface HydrationOptions {
  readonly signal?: AbortSignal;
  readonly onProgress?: (event: { phase: string; completed?: number; total?: number }) => void;
  readonly ref: string;
  readonly headName: string;
  readonly forceSemantic?: boolean;
  readonly snapshotSuffix?: string;
  readonly requireClean?: boolean;
  readonly semanticSources?: readonly string[];
  readonly runtimeEvidenceRevision?: RuntimeEvidenceRevision;
}

export interface RuntimeEvidenceRevision {
  readonly commitSha: string;
  readonly digest: string;
  readonly references: readonly RuntimeTraceReference[];
}

export interface HydrationResult {
  readonly snapshot: GraphSnapshot;
  readonly semanticExtracted: number;
  readonly semanticReused: number;
}

export interface HydratorDependencies {
  readonly config: ContextGraphConfig;
  readonly repository: GitRepository;
  readonly snapshotStore: SnapshotStore;
  readonly semanticHydrator: SemanticHydrator;
  readonly staticIndexer: StaticIndexer;
  readonly ontologyCompiler: OntologyCompiler;
  readonly runtimeEvidenceProvider: RuntimeEvidenceProvider;
  readonly extractorFactory: (scip: ScipIndexResult) => readonly FactExtractor[];
  readonly invariantEvaluators: readonly InvariantEvaluator[];
}

async function concurrentMap<T, R>(
  values: readonly T[],
  concurrency: number,
  worker: (value: T, index: number) => Promise<R>,
): Promise<readonly R[]> {
  const results = new Array<R>(values.length);
  let cursor = 0;
  let failure: unknown;
  let failed = false;
  await Promise.all(
    Array.from({ length: Math.max(1, Math.min(concurrency, values.length)) }, async () => {
      while (!failed && cursor < values.length) {
        const index = cursor++;
        try { results[index] = await worker(values[index] as T, index); }
        catch (error) { failed = true; failure ??= error; }
      }
    }),
  );
  if (failed) throw failure;
  return results;
}

export class ContextGraphHydrator {
  constructor(private readonly dependencies: HydratorDependencies) {}

  async collectRuntimeEvidence(commitSha: string): Promise<RuntimeEvidenceRevision> {
    const { config, repository } = this.dependencies;
    const context: ExtractionContext = {
      repositoryRoot: repository.root,
      repositoryId: config.repositoryId,
      ref: commitSha,
      commitSha,
      snapshotId: commitSha,
      changedPaths: [],
      deletedPaths: [],
      renamedPaths: {},
    };
    const references = [...(await this.dependencies.runtimeEvidenceProvider.collect(context))]
      .filter((evidence) => evidence.accepted)
      .sort((left, right) => stableJson(left).localeCompare(stableJson(right)));
    return {
      commitSha,
      digest: sha256(stableJson(references)),
      references,
    };
  }

  async hydrate(options: HydrationOptions): Promise<HydrationResult> {
    options.signal?.throwIfAborted();
    options.onProgress?.({ phase: 'resolve-committed-sources' });
    const { config, repository, snapshotStore } = this.dependencies;
    const commitSha = await repository.resolveRef(options.ref);
    if (options.requireClean === true) await repository.requireExactCleanCommit(commitSha);
    await this.dependencies.ontologyCompiler.checkReady?.();
    const prior = await snapshotStore.readHead(options.headName);
    const baseSha =
      prior?.manifest.commitSha === commitSha
        ? prior.manifest.baseSha
        : (prior?.manifest.commitSha ?? (await repository.firstParent(commitSha)));
    const selectedSemanticSources = options.semanticSources ?? config.semanticSources;
    const allRoots = [
      ...new Set([
        ...selectedSemanticSources,
        ...config.codeRoots,
        ...config.evidenceRoots,
        ...contractPatternRoots(config.contractPatterns),
        ...contractPatternRoots(scipSourcePatterns(config.scip.sourceProject)),
      ]),
    ];
    const delta = await repository.delta(baseSha, commitSha, allRoots);
    const forceRevision = options.forceSemantic
      ? `${commitSha}:${new Date().toISOString()}:${process.pid}`
      : undefined;
    const baseSuffix =
      options.snapshotSuffix ??
      (forceRevision ? `semantic-${sha256(forceRevision).slice(0, 12)}` : undefined);
    const runtimeRevision =
      options.runtimeEvidenceRevision ?? (await this.collectRuntimeEvidence(commitSha));
    if (runtimeRevision.commitSha !== commitSha) {
      throw new Error('Runtime evidence revision does not match the hydration commit');
    }
    const runtimeSuffix =
      config.runtimeEvidence.length > 0
        ? `runtime-${runtimeRevision.digest.slice(0, 12)}`
        : undefined;
    const configurationDigest = sha256(stableJson(config));
    const scopeDigest = sha256(stableJson(selectedSemanticSources)).slice(0, 12);
    const effectiveSuffix = ['graph-v2', configurationDigest.slice(0, 16), scopeDigest, baseSuffix, runtimeSuffix].filter(Boolean).join('-');
    const snapshotId = effectiveSuffix ? `${commitSha}-${effectiveSuffix}` : commitSha;
    const context: ExtractionContext = {
      repositoryRoot: repository.root,
      repositoryId: config.repositoryId,
      ref: options.ref,
      commitSha,
      baseSha,
      snapshotId,
      changedPaths: delta.changedPaths,
      deletedPaths: delta.deletedPaths,
      renamedPaths: delta.renamedPaths,
      semanticPaths: selectedSemanticSources,
    };
    const sources = await repository.semanticSources(context, selectedSemanticSources);
    if (sources.length > (config.semantic.maxDocuments ?? 8) ||
      sources.some((source) => Buffer.byteLength(source.content) > (config.semantic.maxSourceBytes ?? 65_536))) {
      throw new Error('Semantic source budget exceeded before extraction; narrow scope or explicitly review configured limits');
    }
    const ids = new Set<string>();
    for (const source of sources) {
      if (ids.has(source.stableSemanticId)) {
        throw new Error(`Duplicate stable semantic ID: ${source.stableSemanticId}`);
      }
      ids.add(source.stableSemanticId);
    }
    let semanticExtracted = 0;
    let semanticReused = 0;
    const controller = new AbortController();
    const signal = AbortSignal.any([controller.signal, ...(options.signal ? [options.signal] : [])]);
    const hydrated = await concurrentMap(sources, config.semantic.concurrency, async (source) => {
      let result;
      try {
        result = await this.dependencies.semanticHydrator.hydrate(source, context, forceRevision, { signal });
      } catch (error) { controller.abort(); throw error; }
      if (result.reused) semanticReused += 1;
      else semanticExtracted += 1;
      options.onProgress?.({ phase: result.reused ? 'semantic-cache-hit' : 'semantic-extracted',
        completed: semanticReused + semanticExtracted, total: sources.length });
      return { source, ...result };
    });
    const artifacts = hydrated.map((result) => result.artifact);
    const diagnostics: GraphDiagnostic[] = hydrated.flatMap(({ source, artifact }) =>
      (artifact.diagnostics ?? []).map((item) => ({
        ...item,
        id: sha256(stableJson({ artifact: artifact.key, diagnostic: item.id, path: source.path })),
        provenance: item.provenance.map((span) => ({
          ...span,
          path: source.path,
          digest: source.digest,
          commitSha,
        })),
      })),
    );
    const semanticFacts = hydrated.flatMap(({ source, artifact }) =>
      artifact.facts.map((fact) => ({
        ...fact,
        id: sha256(stableJson({ artifact: artifact.key, fact: fact.id, path: source.path })),
        provenance: {
          ...fact.provenance,
          path: source.path,
          digest: source.digest,
          commitSha,
        },
        snapshotId,
        authority: 'inferred' as const,
        extractionReview: 'unreviewed' as const,
        sourceAuthority: (config.approvedIntentSources?.some((pattern) =>
          matchesRepositoryGlob(source.path, pattern)) ? 'declared' : 'inferred') as 'declared' | 'inferred',
      })),
    );
    options.signal?.throwIfAborted();
    options.onProgress?.({ phase: 'index-typescript' });
    const scip = await this.dependencies.staticIndexer.index(context);
    const extractorFacts = (
      await Promise.all(
        this.dependencies.extractorFactory(scip).map((extractor) => extractor.extract(context)),
      )
    ).flat();
    const trackedPaths = await repository.listAllFilesAt(commitSha);
    const tracked = new Set(trackedPaths);
    for (const fact of semanticFacts) {
      for (const node of [fact.subject, fact.object]) {
        const path = node.id.startsWith('component:file:') ? node.id.slice('component:file:'.length) : undefined;
        if (path && !tracked.has(path)) diagnostics.push({
          id: sha256(stableJson({ fact: fact.id, missing: path })),
          kind: 'implementationGaps',
          reason: `Cited implementation path ${path} is absent from the committed repository.`,
          relatedNodeIds: [node.id], provenance: [fact.provenance], evidenceScope: 'snapshot-query',
        });
      }
    }
    const documentFacts = linkSemanticDocuments(context, hydrated, trackedPaths);
    options.signal?.throwIfAborted();
    options.onProgress?.({ phase: 'compile-semantic-rdf' });
    const ontology = await this.dependencies.ontologyCompiler.compile(snapshotId, artifacts, context);
    const runtimeEvidence = runtimeRevision.references;
    const runtimeFacts = runtimeEvidenceFacts(context, runtimeEvidence);
    const facts = [...semanticFacts, ...documentFacts, ...extractorFacts, ...runtimeFacts].sort(
      (left, right) => left.id.localeCompare(right.id),
    );
    const invariants = (
      await Promise.all(
        this.dependencies.invariantEvaluators.map((evaluator) =>
          evaluator.evaluate(snapshotId, facts),
        ),
      )
    ).flat();
    const failures = invariants.filter((invariant) => invariant.status === 'fail');
    if (failures.length > 0) {
      throw new Error(
        `Invariant validation failed: ${failures.map((failure) => failure.invariantId).join(', ')}`,
      );
    }
    const unresolved = [
      ...new Set([
        ...artifacts.flatMap((artifact) => artifact.unresolvedMappings),
        ...invariants
          .filter((invariant) => invariant.status === 'unknown')
          .map((invariant) => invariant.message),
      ]),
    ].sort();
    const logical = {
      repositoryId: config.repositoryId,
      commitSha,
      ontologyVersion: config.semantic.ontologyVersion,
      semanticArtifactKeys: artifacts.map((artifact) => artifact.key).sort(),
      scipIndexDigest: scip.digest,
      rdfDigest: ontology.digest,
      facts: facts.map(({ snapshotId: _snapshotId, ...fact }) => fact),
      invariants,
      runtimeEvidence,
      unresolved,
      diagnostics,
      semanticSources: selectedSemanticSources,
    };
    const contentDigest = sha256(stableJson(logical));
    const snapshot: GraphSnapshot = {
      manifest: {
        schemaVersion: 1,
        repositoryId: config.repositoryId,
        ref: options.ref,
        commitSha,
        baseSha,
        snapshotId,
        configurationDigest,
        scope: selectedSemanticSources,
        ontologyVersion: config.semantic.ontologyVersion,
        extractorVersions: {
          assembly: 'standalone-graph-v2',
          semantic: config.semantic.extractorVersion,
          scip: scip.version,
          ontology: config.ontology.toolVersion,
          ...Object.fromEntries(
            this.dependencies
              .extractorFactory(scip)
              .map((extractor) => [extractor.identity.id, extractor.identity.version]),
          ),
        },
        semanticModel: config.semantic.model,
        semanticPromptVersion: config.semantic.promptVersion,
        generatedAt: new Date().toISOString(),
        contentDigest,
        runtimeEvidenceDigest: runtimeRevision.digest,
        semanticArtifactKeys: artifacts.map((artifact) => artifact.key).sort(),
        scipIndexDigest: scip.digest,
        rdfDigest: ontology.digest,
      },
      facts,
      invariants,
      runtimeEvidence,
      unresolved,
      diagnostics,
    };
    options.signal?.throwIfAborted();
    options.onProgress?.({ phase: 'validate-shacl' });
    const validation = await new RdfEvidenceGraph(snapshot).validate();
    if (!validation.conforms) {
      throw new Error(`Graph extraction failed SHACL validation: ${JSON.stringify(validation.issues)}`);
    }
    options.onProgress?.({ phase: 'publish-snapshot' });
    await snapshotStore.write(snapshot);
    await snapshotStore.updateHead(options.headName, snapshotId);
    return { snapshot, semanticExtracted, semanticReused };
  }

  async compareClean(options: Omit<HydrationOptions, 'snapshotSuffix'>): Promise<HydrationResult> {
    const current = await this.dependencies.snapshotStore.readHead(options.headName);
    if (!current) throw new Error('No incremental snapshot exists to compare');
    const clean = await this.hydrate({
      ...options,
      headName: `${options.headName}-clean`,
      snapshotSuffix: `clean-${Date.now()}`,
    });
    if (clean.snapshot.manifest.contentDigest !== current.manifest.contentDigest) {
      throw new Error(
        `Clean hydration drift: ${current.manifest.contentDigest} != ${clean.snapshot.manifest.contentDigest}`,
      );
    }
    return clean;
  }
}
