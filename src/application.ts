// Modified for standalone extraction; see docs/extraction-manifest.json.
import { SavedEvidenceQueryService } from './saved-evidence.js';
import { sha256, stableJson } from './util.js';
import { AgentSemanticScopeResolver, PreparedImpactQueryService } from './agent-context.js';
import { resolveStorageRoot } from './cache.js';
import { loadConfig } from './config.js';
import type {
  ContextGraphAdapter,
  ContextGraphAdapterModule,
  ContextGraphRepository,
} from './core.js';
import { GitRepository } from './git.js';
import { ContextGraphHydrator } from './hydrator.js';
import { OpenCaesarOntologyCompiler, DirectRdfOntologyCompiler } from './ontology.js';
import { SnapshotImpactQueryService } from './query.js';
import { CodexCliSemanticExtractor, SemanticHydrator } from './semantic.js';
import { SemanticArtifactStore, FileSnapshotStore } from './storage.js';
import {
  RepositoryContractExtractor,
  RepositoryFileExtractor,
  type ScipIndexResult,
  ScipSymbolExtractor,
  ScipTypeScriptIndexer,
} from './static.js';
import { OtlpJsonRuntimeEvidenceProvider } from './telemetry.js';
import { SnapshotChecks } from './snapshot-checks.js';

const emptyAdapter: ContextGraphAdapter = {
  factExtractors: [],
  invariantEvaluators: [],
};

export async function loadContextGraphAdapterModule(
  moduleSpecifier: string | undefined,
  repository: ContextGraphRepository,
): Promise<ContextGraphAdapter> {
  if (!moduleSpecifier) return emptyAdapter;
  let candidate: Partial<ContextGraphAdapterModule>;
  try {
    candidate = (await import(moduleSpecifier)) as Partial<ContextGraphAdapterModule>;
  } catch (error) {
    throw new Error(`Unable to load context graph adapter ${moduleSpecifier}`, { cause: error });
  }
  if (typeof candidate.createContextGraphAdapter !== 'function') {
    throw new Error(
      `Context graph adapter ${moduleSpecifier} must export createContextGraphAdapter(repository)`,
    );
  }
  const adapter = candidate.createContextGraphAdapter(repository);
  if (!Array.isArray(adapter.factExtractors) || !Array.isArray(adapter.invariantEvaluators)) {
    throw new Error(`Context graph adapter ${moduleSpecifier} returned an invalid adapter`);
  }
  return adapter;
}

export async function createContextGraphApplication(configPath: string) {
  const loaded = await loadConfig(configPath);
  const { config, repositoryRoot } = loaded;
  const storageRoot = resolveStorageRoot(repositoryRoot, config);
  const repository = new GitRepository(repositoryRoot);
  const adapter = await loadContextGraphAdapterModule(config.adapter, repository);
  const snapshotStore = new FileSnapshotStore(storageRoot);
  const artifactStore = new SemanticArtifactStore(storageRoot);
  const semanticExtractor = new CodexCliSemanticExtractor(config.semantic);
  const semanticHydrator = new SemanticHydrator(config.semantic, artifactStore, semanticExtractor);
  const staticIndexer = new ScipTypeScriptIndexer(config.scip, storageRoot);
  const ontologyCompiler = config.ontology.backend === 'opencaesar' ? new OpenCaesarOntologyCompiler(
    config.ontology,
    repositoryRoot,
    storageRoot,
  ) : new DirectRdfOntologyCompiler(storageRoot);
  const runtimeEvidenceProvider = new OtlpJsonRuntimeEvidenceProvider(
    config.runtimeEvidence,
    config.runtimeEvidencePolicy,
  );
  const extractorFactory = (scip: ScipIndexResult) => [
    new RepositoryFileExtractor(repository, config.codeRoots, scip.digest),
    new RepositoryContractExtractor(
      repository,
      config.contractPatterns,
      config.contractConsumerRoots ?? config.codeRoots,
      config.contractAliases,
    ),
    new ScipSymbolExtractor(repository, scip),
    ...adapter.factExtractors,
  ];
  const hydrator = new ContextGraphHydrator({
    config,
    repository,
    snapshotStore,
    semanticHydrator,
    staticIndexer,
    ontologyCompiler,
    runtimeEvidenceProvider,
    extractorFactory,
    invariantEvaluators: adapter.invariantEvaluators,
  });
  const headName = 'default';
  const scopeResolver = config.agentContext
    ? new AgentSemanticScopeResolver(config, repository)
    : undefined;
  const rawQueryService = scopeResolver
    ? new PreparedImpactQueryService(snapshotStore, hydrator, scopeResolver)
    : new SnapshotImpactQueryService(snapshotStore, headName);
  const queryService = new SavedEvidenceQueryService(rawQueryService, repository, sha256(stableJson(config)));
  return {
    ...loaded,
    storageRoot,
    repository,
    snapshotStore,
    ontologyCompiler,
    hydrator,
    queryService,
    snapshotChecks: new SnapshotChecks(snapshotStore, repository, hydrator, scopeResolver, sha256(stableJson(config))),
    scopeResolver,
    headName,
  };
}
