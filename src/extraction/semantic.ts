// Modified for standalone extraction; see docs/extraction-manifest.json.
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { prepareCodexAuthentication, readCodexLoginMode, type CodexLoginProbe, type SemanticCommandEnvironment } from './codex-auth.js';
export { semanticCommandEnvironment } from './codex-auth.js';
export type { SemanticCommandEnvironment } from './codex-auth.js';
import { resolveCodexInvocation } from './codex-command.js';
import { runSemanticProcess, SemanticProviderError, type SemanticRunOptions } from "./semantic-process.js";
export { SemanticProviderError } from "./semantic-process.js";
export type { SemanticRunOptions } from "./semantic-process.js";

import type {
  ExtractionContext,
  GraphFact,
  GraphNodeKind,
  GraphPredicate,
  SemanticArtifact,
  SemanticSource,
  DiagnosticKind,
  GraphDiagnostic,
} from "@weftlet/core";
import type { ContextGraphConfig } from "../configuration/config.js";
import type { SemanticArtifactStore } from "../storage/storage.js";
import { sha256, stableJson } from "../infrastructure/util.js";
import {
  assertSemanticCitation,
  numberedSemanticSource,
  semanticCitationSchema,
} from "./semantic-citations.js";

export interface ExtractedAssertion {
  readonly subject: { readonly id: string; readonly kind: GraphNodeKind; readonly label: string };
  readonly predicate: GraphPredicate;
  readonly object: { readonly id: string; readonly kind: GraphNodeKind; readonly label: string };
  readonly citation: { readonly startLine: number; readonly endLine: number };
  readonly confidence: number;
}

export interface SemanticOutput {
  readonly assertions: readonly ExtractedAssertion[];
  readonly oml: string;
  readonly unresolvedMappings?: readonly string[];
  readonly diagnostics?: readonly {
    readonly kind: Exclude<DiagnosticKind, 'runtimeGaps' | 'drift'>;
    readonly reason: string;
    readonly citation: { readonly startLine: number; readonly endLine: number };
    readonly relatedNodeIds: readonly string[];
  }[];
}

export interface SemanticExtractionResult {
  readonly parsed: SemanticOutput;
  readonly rawModelOutput: string;
}

function omlEscape(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r?\n/g, '\\n');
}

function renderOml(key: string, assertions: readonly ExtractedAssertion[]): string {
  const typeByKind: Record<GraphNodeKind, string> = {
    Project: 'cg:Project',
    Document: 'cg:OwnerDocument',
    Capability: 'cg:ProductCapability',
    Workflow: 'cg:Workflow',
    Component: 'cg:RuntimeComponent',
    Contract: 'cg:APIContract',
    Evidence: 'cg:ValidationArtifact',
    Invariant: 'cg:ArchitectureInvariant',
    Snapshot: 'cg:Project',
    Provider: 'cg:Provider',
    PersistenceModel: 'cg:PersistenceModel',
    Scope: 'cg:Scope',
  };
  const relationByPredicate: Record<GraphPredicate, string> = {
    realizes: 'cg:realizes',
    implementedBy: 'cg:implementedBy',
    consumes: 'cg:consumes',
    emits: 'cg:emits',
    persistsTo: 'cg:persistsTo',
    governedBy: 'cg:governedBy',
    definedBy: 'cg:definedBy',
    verifiedBy: 'cg:verifiedBy',
    operationallyOwnedBy: 'cg:operationallyOwnedBy',
    decisionAuthority: 'cg:hasDecisionAuthority',
    routesThrough: 'cg:routesThrough',
    authorizedBy: 'cg:authorizedBy',
    sourcedFrom: 'cg:sourcedFrom',
    references: 'cg:references',
    contains: 'cg:contains',
  };
  const nodes = new Map<string, ExtractedAssertion['subject']>();
  for (const assertion of assertions) {
    nodes.set(assertion.subject.id, assertion.subject);
    nodes.set(assertion.object.id, assertion.object);
  }
  const localNames = new Map(
    [...nodes.keys()].sort().map((id) => [id, `n_${sha256(id).slice(0, 16)}`]),
  );
  const relations = new Map<string, string[]>();
  for (const assertion of assertions) {
    const subject = localNames.get(assertion.subject.id) as string;
    const object = localNames.get(assertion.object.id) as string;
    const current = relations.get(subject) ?? [];
    current.push(`    ${relationByPredicate[assertion.predicate]} ${object}`);
    relations.set(subject, current);
  }
  const instances = [...nodes.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([id, node]) => {
      const local = localNames.get(id) as string;
      const properties = [
        `    cg:hasIdentifier "${omlEscape(node.id)}"`,
        ...(relations.get(local) ?? []),
      ];
      return `  instance ${local} : ${typeByKind[node.kind]} [\n${properties.join('\n')}\n  ]`;
    });
  return [
    `description <https://context-graph.dev/generated/${key}#> as generated {`,
    '  uses <https://context-graph.dev/core#> as cg',
    '',
    ...instances.flatMap((instance) => [instance, '']),
    '}',
  ].join('\n');
}

export interface SemanticExtractor {
  readonly identity: string;
  extract(source: SemanticSource, context: ExtractionContext, options?: SemanticRunOptions): Promise<SemanticExtractionResult>;
}

export interface SemanticCommandRunner {
  run(
    command: string,
    args: readonly string[],
    cwd: string,
    prompt: string,
    environment: SemanticCommandEnvironment,
    options?: SemanticRunOptions,
  ): Promise<void>;
}

const spawnSemanticCommand: SemanticCommandRunner = {
  async run(command, args, cwd, prompt, environment, options) {
    const invocation = await resolveCodexInvocation(command, environment, process.platform, options);
    return runSemanticProcess(invocation.command, [...invocation.prefixArgs, ...args], cwd, prompt, environment, options);
  },
};

const kinds: readonly GraphNodeKind[] = [
  'Project',
  'Document',
  'Capability',
  'Workflow',
  'Component',
  'Contract',
  'Evidence',
  'Invariant',
  'Snapshot',
  'Provider',
  'PersistenceModel',
  'Scope',
];

const predicates: readonly GraphPredicate[] = [
  'realizes',
  'implementedBy',
  'consumes',
  'emits',
  'persistsTo',
  'governedBy',
  'definedBy',
  'verifiedBy',
  'operationallyOwnedBy',
  'decisionAuthority',
  'routesThrough',
  'authorizedBy',
  'sourcedFrom',
  'references',
  'contains',
];

export function semanticOutputSchema(lineCount: number): object {
  const node = {
    type: 'object',
    additionalProperties: false,
    required: ['id', 'kind', 'label'],
    properties: {
      id: { type: 'string', minLength: 1 },
      kind: { type: 'string', enum: kinds },
      label: { type: 'string', minLength: 1 },
    },
  };
  return {
    type: 'object',
    additionalProperties: false,
    required: ['assertions', 'oml', 'diagnostics'],
    properties: {
      assertions: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['subject', 'predicate', 'object', 'citation', 'confidence'],
          properties: {
            subject: node,
            predicate: { type: 'string', enum: predicates },
            object: node,
            citation: semanticCitationSchema(lineCount),
            confidence: { type: 'number', minimum: 0, maximum: 1 },
          },
        },
      },
      oml: { type: 'string' },
      diagnostics: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['kind', 'reason', 'citation', 'relatedNodeIds'],
          properties: {
            kind: {
              type: 'string',
              enum: ['missingIntent', 'ambiguousIntent', 'implementationGaps'],
            },
            reason: { type: 'string', minLength: 1, maxLength: 1000 },
            citation: semanticCitationSchema(lineCount),
            relatedNodeIds: { type: 'array', items: { type: 'string', minLength: 1 } },
          },
        },
      },
    },
  };
}

/** Runtime validation is shared by every provider; schema-constrained output is not trusted blindly. */
export function assertSemanticOutput(value: unknown, source: SemanticSource): asserts value is SemanticOutput {
  const record = (item: unknown): item is Record<string, unknown> => typeof item === 'object' && item !== null && !Array.isArray(item);
  const text = (item: unknown, max = 1000): item is string => typeof item === 'string' && item.trim().length > 0 && item.length <= max;
  const node = (item: unknown) => record(item) && text(item.id) && text(item.label) && kinds.includes(item.kind as GraphNodeKind);
  const fail = (message: string): never => { throw new SemanticProviderError('invalid-output', message); };
  if (!record(value) || !Array.isArray(value.assertions) || value.assertions.length > 1000 || typeof value.oml !== 'string') {
    fail('Invalid semantic output structure');
  }
  const output = value as Record<string, unknown>;
  const lineCount = source.content.split('\n').length;
  for (const [index, assertion] of (output.assertions as unknown[]).entries()) {
    if (!record(assertion) || !node(assertion.subject) || !node(assertion.object) ||
      !predicates.includes(assertion.predicate as GraphPredicate) || typeof assertion.confidence !== 'number' ||
      !Number.isFinite(assertion.confidence) || assertion.confidence < 0 || assertion.confidence > 1 || !record(assertion.citation)) {
      fail('Invalid semantic assertion');
    }
    assertSemanticCitation((assertion as ExtractedAssertion).citation, source.path, lineCount, `assertion[${index}]`);
  }
  if (output.diagnostics !== undefined) {
    if (!Array.isArray(output.diagnostics) || output.diagnostics.length > 1000) fail('Invalid semantic diagnostics');
    for (const [index, item] of (output.diagnostics as unknown[]).entries()) {
      if (!record(item) || !['missingIntent', 'ambiguousIntent', 'implementationGaps'].includes(String(item.kind)) ||
        !text(item.reason) || !record(item.citation) || !Array.isArray(item.relatedNodeIds) ||
        item.relatedNodeIds.length > 1000 || !item.relatedNodeIds.every((id) => text(id))) fail('Invalid semantic diagnostic');
      assertSemanticCitation((item as { citation: ExtractedAssertion['citation'] }).citation, source.path, lineCount, `diagnostic[${index}]`);
    }
  }
  if (output.unresolvedMappings !== undefined && (!Array.isArray(output.unresolvedMappings) ||
    output.unresolvedMappings.length > 1000 || !output.unresolvedMappings.every((item) => text(item)))) fail('Invalid unresolved mappings');
}

export class CodexCliSemanticExtractor implements SemanticExtractor {
  readonly identity: string;

  constructor(
    private readonly config: ContextGraphConfig['semantic'],
    private readonly runner: SemanticCommandRunner = spawnSemanticCommand,
    private readonly loginProbe: CodexLoginProbe = readCodexLoginMode,
  ) {
    this.identity = `codex-cli:${config.model}:${config.reasoningEffort}:${config.promptVersion}:contract-v2`;
  }

  async extract(
    source: SemanticSource,
    context: ExtractionContext,
    options: SemanticRunOptions = {},
  ): Promise<SemanticExtractionResult> {
    options.signal?.throwIfAborted();
    if (Buffer.byteLength(source.content) > (this.config.maxSourceBytes ?? 65_536)) {
      throw new SemanticProviderError('invalid-output', 'Semantic source exceeds configured byte budget');
    }
    const command = 'codex';
    const environment = await prepareCodexAuthentication(this.config.auth, process.env, command, options, this.loginProbe);
    const runRoot = await mkdtemp(join(tmpdir(), 'context-graph-codex-'));
    const schemaPath = join(runRoot, 'schema.json');
    const outputPath = join(runRoot, 'output.json');
    const sourcePath = join(runRoot, 'source.md');
    const lineCount = source.content.split('\n').length;
    const numberedSource = numberedSemanticSource(source.content);
    await writeFile(schemaPath, `${JSON.stringify(semanticOutputSchema(lineCount), null, 2)}\n`, 'utf8');
    await writeFile(sourcePath, numberedSource, 'utf8');
    const prompt = [
      'Extract only semantic architecture assertions explicitly supported by the supplied source.',
      'Use neutral graph kinds and the allowed precise predicates. Never guess a missing mapping.',
      'Use product-wide canonical IDs derived from durable concepts, not IDs scoped to this file.',
      'Reuse capability, policy, workflow, contract, and component IDs that another source would use for the same concept.',
      'When the source names a repository path, use component:file:<path> so semantic and static facts join deterministically.',
      'Capture why a rule exists, its decision authority, and cross-domain dependencies when the source explicitly states them.',
      'Every assertion must cite inclusive 1-based source line numbers and carry calibrated confidence.',
      `Source lines are explicitly prefixed N| below. Cite those original-source numbers, not prompt lines or visual wraps; valid lines are 1-${lineCount}.`,
      'The N| prefix is display metadata, not source text. Preserve blank-line numbering and require startLine <= endLine.',
      'Emit cited diagnostics only for concrete gaps the source exposes; do not generate a wish list of unspecified details.',
      'Use ambiguousIntent for contradictory or unclear declared behavior, and implementationGaps for an explicitly needed but unnamed code mapping.',
      'Use missingIntent only where the source explicitly identifies an undecided requirement. Absence from this one source does not prove absence from the repository.',
      'Owner documents need not name implementation paths. Omit implementation diagnostics unless the missing mapping matters to understanding an explicit contract.',
      'Never infer code drift or runtime gaps from this isolated document. Include only canonical relatedNodeIds supported by assertions in this output.',
      'Every diagnostic needs a specific reason and valid source line citation. Emit an OML description fragment for accepted assertions.',
      'The isolated source.md file is the only repository source available to this run.',
      `Repository: ${context.repositoryId}`,
      `Commit: ${context.commitSha}`,
      `Stable semantic ID: ${source.stableSemanticId}`,
      `Source path: ${source.path}`,
      '',
      numberedSource,
    ].join('\n');
    const args = [
      'exec',
      '--ephemeral',
      '--ignore-user-config',
      '--ignore-rules',
      '--skip-git-repo-check',
      '--disable',
      'shell_tool',
      '--cd',
      runRoot,
      '--sandbox',
      'read-only',
      '--model',
      this.config.model,
      '-c',
      `model_reasoning_effort="${this.config.reasoningEffort}"`,
      '--output-schema',
      schemaPath,
      '--output-last-message',
      outputPath,
      '-',
    ];
    try {
      const retries = this.config.retries ?? 0;
      for (let attempt = 0; ; attempt++) {
        try {
          await this.runner.run(command, args, runRoot, prompt, environment,
            { ...options, timeoutMs: options.timeoutMs ?? this.config.timeoutMs ?? 120_000 });
          break;
        } catch (error) {
          if (!(error instanceof SemanticProviderError) || !error.retryable || attempt >= retries || options.signal?.aborted) throw error;
        }
      }
      if ((await stat(outputPath)).size > 2 * 1024 * 1024) {
        throw new SemanticProviderError('invalid-output', 'Semantic output exceeds 2 MiB');
      }
      const rawModelOutput = await readFile(outputPath, 'utf8');
      let parsed: unknown;
      try { parsed = JSON.parse(rawModelOutput); }
      catch { throw new SemanticProviderError('invalid-output', 'Semantic output is not valid JSON'); }
      assertSemanticOutput(parsed, source);
      return { parsed, rawModelOutput };
    } finally {
      await rm(runRoot, { recursive: true, force: true });
    }
  }
}

export class SemanticHydrator {
  constructor(
    private readonly config: ContextGraphConfig['semantic'],
    private readonly store: SemanticArtifactStore,
    private readonly extractor: SemanticExtractor,
  ) {}

  async hydrate(
    source: SemanticSource,
    context: ExtractionContext,
    forceRevision?: string,
    options: SemanticRunOptions = {},
  ): Promise<{ artifact: SemanticArtifact; reused: boolean }> {
    options.signal?.throwIfAborted();
    const keyInput = {
      stableSemanticId: source.stableSemanticId,
      sourceDigest: source.digest,
      promptVersion: this.config.promptVersion,
      extractorVersion: this.config.extractorVersion,
      modelIdentity: this.extractor.identity,
      adapterVersion: this.config.adapterVersion,
      ontologyVersion: this.config.ontologyVersion,
      minimumConfidence: this.config.minimumConfidence,
      failOnUnresolved: this.config.failOnUnresolved,
      forceRevision,
      diagnosticContractVersion: 3,
    };
    const key = sha256(stableJson(keyInput));
    const existing = await this.store.read(key);
    if (existing) return { artifact: existing, reused: true };

    const extraction = await this.extractor.extract(source, context, options);
    assertSemanticOutput(extraction.parsed, source);
    if (typeof extraction.rawModelOutput !== 'string' || Buffer.byteLength(extraction.rawModelOutput) > 2 * 1024 * 1024) {
      throw new SemanticProviderError('invalid-output', 'Invalid or oversized raw semantic output');
    }
    const output = extraction.parsed;
    const lineCount = source.content.split('\n').length;
    const facts: Omit<GraphFact, 'snapshotId'>[] = output.assertions.map((assertion, index) => {
      assertSemanticCitation(assertion.citation, source.path, lineCount, `assertion[${index}]`);
      if (assertion.confidence < this.config.minimumConfidence) {
        throw new Error(`Low-confidence semantic assertion for ${source.path}`);
      }
      const provenance = {
        path: source.path,
        startLine: assertion.citation.startLine,
        endLine: assertion.citation.endLine,
        digest: source.digest,
        commitSha: context.commitSha,
      };
      return {
        id: sha256(stableJson({ ...assertion, provenance })),
        subject: assertion.subject,
        predicate: assertion.predicate,
        object: assertion.object,
        provenance,
        extractor: { id: this.extractor.identity, version: this.config.extractorVersion },
        confidence: assertion.confidence,
      };
    });
    const nodeIds = new Set(facts.flatMap((fact) => [fact.subject.id, fact.object.id]));
    const diagnostics: GraphDiagnostic[] = (output.diagnostics ?? []).map((item, index) => {
      assertSemanticCitation(item.citation, source.path, lineCount, `diagnostic[${index}]`);
      if (
        !['missingIntent', 'ambiguousIntent', 'implementationGaps'].includes(item.kind) ||
        typeof item.reason !== 'string' ||
        !item.reason.trim() ||
        item.reason.length > 1000 ||
        item.relatedNodeIds.some((id) => !nodeIds.has(id))
      )
        throw new Error(`Invalid semantic diagnostic for ${source.path}`);
      const provenance = [
        {
          path: source.path,
          ...item.citation,
          digest: source.digest,
          commitSha: context.commitSha,
        },
      ];
      return {
        id: sha256(stableJson({ ...item, provenance })),
        kind: item.kind,
        reason: item.reason,
        relatedNodeIds: item.relatedNodeIds,
        provenance,
        evidenceScope: 'source',
      };
    });
    const unresolvedMappings = output.unresolvedMappings ?? [];
    if (this.config.failOnUnresolved && (unresolvedMappings.length > 0 || diagnostics.length > 0)) {
      throw new Error(
        `Unresolved semantic mappings for ${source.path}: ${[...unresolvedMappings, ...diagnostics.map((item) => item.reason)].join('; ')}`,
      );
    }
    const compiledOml = renderOml(key, output.assertions);
    const outputDigest = sha256(
      stableJson({ facts, diagnostics, compiledOml, rawModelOutput: extraction.rawModelOutput }),
    );
    const artifact: SemanticArtifact = {
      key,
      stableSemanticId: source.stableSemanticId,
      source: {
        path: source.path,
        startLine: 1,
        endLine: lineCount,
        digest: source.digest,
        commitSha: context.commitSha,
      },
      sourceDigest: source.digest,
      promptVersion: this.config.promptVersion,
      extractorVersion: this.config.extractorVersion,
      modelIdentity: this.extractor.identity,
      adapterVersion: this.config.adapterVersion,
      ontologyVersion: this.config.ontologyVersion,
      facts,
      oml: compiledOml,
      unresolvedMappings,
      diagnostics,
      rawModelOutput: extraction.rawModelOutput,
      outputDigest,
    };
    await this.store.write(artifact);
    return { artifact, reused: false };
  }
}
