// Modified for standalone extraction; see docs/extraction-manifest.json.
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

export interface ContextGraphConfig {
  readonly schemaVersion: 1;
  readonly repositoryRoot?: string;
  readonly repositoryId: string;
  readonly namespace: string;
  readonly adapter?: string;
  readonly semanticSources: readonly string[];
  /** Explicit owner-approved source paths/globs; other model-derived prose remains inferred. */
  readonly approvedIntentSources?: readonly string[];
  readonly codeRoots: readonly string[];
  readonly contractPatterns: readonly string[];
  readonly contractConsumerRoots?: readonly string[];
  readonly contractAliases?: Readonly<Record<string, readonly string[]>>;
  readonly evidenceRoots: readonly string[];
  readonly semantic: {
    readonly provider: 'codex-cli' | 'module';
    /** Codex authentication only; secrets stay in the process environment. */
    readonly auth?: { readonly mode: 'chatgpt' } | { readonly mode: 'api-key'; readonly apiKeyEnv?: string };
    readonly providerModule?: string;
    readonly providerIdentity?: string;
    readonly timeoutMs?: number;
    readonly retries?: number;
    readonly maxDocuments?: number;
    readonly maxSourceBytes?: number;
    readonly model: string;
    readonly reasoningEffort: string;
    readonly promptVersion: string;
    readonly extractorVersion: string;
    readonly adapterVersion: string;
    readonly ontologyVersion: string;
    readonly minimumConfidence: number;
    readonly failOnUnresolved: boolean;
    readonly concurrency: number;
  };
  readonly scip: {
    readonly version: string;
    readonly command: string;
    readonly args: readonly string[];
  };
  readonly ontology: {
    readonly backend?: 'rdf' | 'opencaesar';
    readonly toolVersion: string;
    readonly containerImage?: string;
    readonly projectPath?: string;
    readonly usedVocabularyIris?: readonly string[];
    readonly includedDescriptionIris?: readonly string[];
  };
  readonly runtimeEvidence: readonly string[];
  readonly runtimeEvidencePolicy?: {
    readonly retentionDays: number;
    readonly maxReferences: number;
    readonly maxSourceBytes: number;
    readonly requireEnvironment: boolean;
    readonly requireServiceInstance: boolean;
    readonly allowedServiceNames?: readonly string[];
    readonly allowedEnvironments?: readonly string[];
    readonly capabilityKeys: readonly string[];
    readonly operationKeys: readonly string[];
  };
  readonly storagePath: string;
  readonly storageScope?: 'workspace' | 'user';
  readonly agentContext?: {
    readonly alwaysSemanticSources: readonly string[];
    readonly followDocumentReferences: boolean;
    readonly includeMatchingEvidence: boolean;
    readonly maxReferencedDocuments: number;
  };
}

export interface LoadedConfig {
  readonly config: ContextGraphConfig;
  readonly configPath: string;
  readonly repositoryRoot: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function requireConfig(condition: boolean, path: string, absolutePath: string): void {
  if (!condition) {
    throw new Error(`Invalid context graph config (${absolutePath}): ${path}`);
  }
}

function validateConfig(value: unknown, absolutePath: string): asserts value is ContextGraphConfig {
  requireConfig(isRecord(value), 'root must be an object', absolutePath);
  if (!isRecord(value)) return;
  requireConfig(value.schemaVersion === 1, 'schemaVersion must be 1', absolutePath);
  for (const field of ['repositoryId', 'namespace', 'storagePath'] as const) {
    requireConfig(
      isNonEmptyString(value[field]),
      `${field} must be a non-empty string`,
      absolutePath,
    );
  }
  if (value.repositoryRoot !== undefined) {
    requireConfig(
      isNonEmptyString(value.repositoryRoot),
      'repositoryRoot must be a non-empty string when provided',
      absolutePath,
    );
  }
  if (value.adapter !== undefined) {
    requireConfig(
      isNonEmptyString(value.adapter),
      'adapter must be a non-empty string when provided',
      absolutePath,
    );
  }
  if (value.approvedIntentSources !== undefined) {
    requireConfig(isStringArray(value.approvedIntentSources), 'approvedIntentSources must be an array of strings', absolutePath);
  }
  for (const field of [
    'semanticSources',
    'codeRoots',
    'contractPatterns',
    'evidenceRoots',
    'runtimeEvidence',
  ] as const) {
    requireConfig(
      isStringArray(value[field]),
      `${field} must be an array of strings`,
      absolutePath,
    );
  }
  if (value.contractConsumerRoots !== undefined) {
    requireConfig(
      isStringArray(value.contractConsumerRoots),
      'contractConsumerRoots must be an array of strings when provided',
      absolutePath,
    );
  }
  if (value.contractAliases !== undefined) {
    requireConfig(
      isRecord(value.contractAliases),
      'contractAliases must be an object when provided',
      absolutePath,
    );
    if (isRecord(value.contractAliases)) {
      for (const [path, aliases] of Object.entries(value.contractAliases)) {
        requireConfig(
          isNonEmptyString(path) && isStringArray(aliases) && aliases.length > 0,
          `contractAliases.${path} must be a non-empty array of strings`,
          absolutePath,
        );
      }
    }
  }
  if (value.runtimeEvidencePolicy !== undefined) {
    requireConfig(
      isRecord(value.runtimeEvidencePolicy),
      'runtimeEvidencePolicy must be an object',
      absolutePath,
    );
    if (isRecord(value.runtimeEvidencePolicy)) {
      for (const field of ['retentionDays', 'maxReferences', 'maxSourceBytes'] as const) {
        requireConfig(
          Number.isInteger(value.runtimeEvidencePolicy[field]) &&
            Number(value.runtimeEvidencePolicy[field]) > 0,
          `runtimeEvidencePolicy.${field} must be a positive integer`,
          absolutePath,
        );
      }
      for (const field of ['requireEnvironment', 'requireServiceInstance'] as const) {
        requireConfig(
          typeof value.runtimeEvidencePolicy[field] === 'boolean',
          `runtimeEvidencePolicy.${field} must be a boolean`,
          absolutePath,
        );
      }
      for (const field of [
        'allowedServiceNames',
        'allowedEnvironments',
        'capabilityKeys',
        'operationKeys',
      ] as const) {
        if (value.runtimeEvidencePolicy[field] === undefined && field.startsWith('allowed')) {
          continue;
        }
        requireConfig(
          isStringArray(value.runtimeEvidencePolicy[field]) &&
            value.runtimeEvidencePolicy[field].length > 0,
          `runtimeEvidencePolicy.${field} must be a non-empty array of strings`,
          absolutePath,
        );
      }
    }
  }

  if (value.storageScope !== undefined) {
    requireConfig(
      value.storageScope === 'workspace' || value.storageScope === 'user',
      'storageScope must be workspace or user when provided',
      absolutePath,
    );
  }
  if (value.agentContext !== undefined) {
    requireConfig(isRecord(value.agentContext), 'agentContext must be an object', absolutePath);
    if (isRecord(value.agentContext)) {
      requireConfig(
        isStringArray(value.agentContext.alwaysSemanticSources),
        'agentContext.alwaysSemanticSources must be an array of strings',
        absolutePath,
      );
      requireConfig(
        typeof value.agentContext.followDocumentReferences === 'boolean',
        'agentContext.followDocumentReferences must be a boolean',
        absolutePath,
      );
      requireConfig(
        typeof value.agentContext.includeMatchingEvidence === 'boolean',
        'agentContext.includeMatchingEvidence must be a boolean',
        absolutePath,
      );
      requireConfig(
        Number.isInteger(value.agentContext.maxReferencedDocuments) &&
          Number(value.agentContext.maxReferencedDocuments) > 0,
        'agentContext.maxReferencedDocuments must be a positive integer',
        absolutePath,
      );
    }
  }

  requireConfig(isRecord(value.semantic), 'semantic must be an object', absolutePath);
  if (isRecord(value.semantic)) {
    requireConfig(
      value.semantic.provider === 'codex-cli' || value.semantic.provider === 'module',
      'semantic.provider is invalid',
      absolutePath,
    );
    if (value.semantic.provider === 'module') {
      requireConfig(isNonEmptyString(value.semantic.providerModule) && isNonEmptyString(value.semantic.providerIdentity),
        'module providers require providerModule and providerIdentity', absolutePath);
    }
    if (value.semantic.auth !== undefined) {
      const auth = value.semantic.auth;
      requireConfig(value.semantic.provider === 'codex-cli' && isRecord(auth),
        'semantic.auth must be an object for codex-cli only', absolutePath);
      if (isRecord(auth)) {
        requireConfig(auth.mode === 'chatgpt' || auth.mode === 'api-key',
          'semantic.auth.mode must be chatgpt or api-key', absolutePath);
        requireConfig(Object.keys(auth).every(key => key === 'mode' || (auth.mode === 'api-key' && key === 'apiKeyEnv')),
          'semantic.auth accepts only mode and, for api-key, apiKeyEnv; never store credentials here', absolutePath);
        requireConfig(auth.apiKeyEnv === undefined || (typeof auth.apiKeyEnv === 'string' && /^[A-Za-z_][A-Za-z0-9_]*$/.test(auth.apiKeyEnv)),
          'semantic.auth.apiKeyEnv must name an environment variable', absolutePath);
      }
    }
    for (const [field, max] of [['timeoutMs', 300_000], ['retries', 2], ['maxDocuments', 1000], ['maxSourceBytes', 1_048_576]] as const) {
      const item = value.semantic[field];
      if (item !== undefined) requireConfig(Number.isInteger(item) && Number(item) >= (field === 'retries' ? 0 : 1) && Number(item) <= max,
        `semantic.${field} exceeds supported bounds`, absolutePath);
    }
    for (const field of [
      'model',
      'reasoningEffort',
      'promptVersion',
      'extractorVersion',
      'adapterVersion',
      'ontologyVersion',
    ] as const) {
      requireConfig(
        isNonEmptyString(value.semantic[field]),
        `semantic.${field} must be a non-empty string`,
        absolutePath,
      );
    }
    requireConfig(
      typeof value.semantic.minimumConfidence === 'number' &&
        value.semantic.minimumConfidence >= 0 &&
        value.semantic.minimumConfidence <= 1,
      'semantic.minimumConfidence must be between 0 and 1',
      absolutePath,
    );
    requireConfig(
      typeof value.semantic.failOnUnresolved === 'boolean',
      'semantic.failOnUnresolved must be a boolean',
      absolutePath,
    );
    requireConfig(
      Number.isInteger(value.semantic.concurrency) && Number(value.semantic.concurrency) > 0 && Number(value.semantic.concurrency) <= 4,
      'semantic.concurrency must be a positive integer no greater than 4',
      absolutePath,
    );
  }

  requireConfig(isRecord(value.scip), 'scip must be an object', absolutePath);
  if (isRecord(value.scip)) {
    requireConfig(isNonEmptyString(value.scip.version), 'scip.version is required', absolutePath);
    requireConfig(isNonEmptyString(value.scip.command), 'scip.command is required', absolutePath);
    requireConfig(
      isStringArray(value.scip.args),
      'scip.args must be an array of strings',
      absolutePath,
    );
  }

  requireConfig(isRecord(value.ontology), 'ontology must be an object', absolutePath);
  if (isRecord(value.ontology)) {
    requireConfig(value.ontology.backend === undefined || ['rdf', 'opencaesar'].includes(String(value.ontology.backend)),
      'ontology.backend must be rdf or opencaesar', absolutePath);
    for (const field of ['toolVersion'] as const) {
      requireConfig(
        isNonEmptyString(value.ontology[field]),
        `ontology.${field} must be a non-empty string`,
        absolutePath,
      );
    }
    for (const field of ['containerImage', 'projectPath'] as const) {
      if (value.ontology.backend === 'opencaesar' || value.ontology[field] !== undefined) {
        requireConfig(isNonEmptyString(value.ontology[field]), `ontology.${field} must be a non-empty string`, absolutePath);
      }
    }
    for (const field of ['usedVocabularyIris', 'includedDescriptionIris'] as const) {
      if (value.ontology[field] !== undefined) {
        requireConfig(
          isStringArray(value.ontology[field]),
          `ontology.${field} must be an array of strings when provided`,
          absolutePath,
        );
      }
    }
  }
}

export async function loadConfig(
  configPath: string,
  initialDirectory = process.env.INIT_CWD,
): Promise<LoadedConfig> {
  const directPath = resolve(configPath);
  const initialPath = initialDirectory ? resolve(initialDirectory, configPath) : undefined;
  const absolutePath =
    existsSync(directPath) || !initialPath || !existsSync(initialPath) ? directPath : initialPath;
  const parsed: unknown = JSON.parse(await readFile(absolutePath, 'utf8'));
  validateConfig(parsed, absolutePath);
  const repositoryRoot = resolve(dirname(absolutePath), parsed.repositoryRoot ?? '.');
  return {
    config: parsed,
    configPath: absolutePath,
    repositoryRoot,
  };
}
