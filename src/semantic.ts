import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

import type {
  ExtractionContext,
  GraphFact,
  GraphNodeKind,
  GraphPredicate,
  SemanticArtifact,
  SemanticSource,
  DiagnosticKind,
  GraphDiagnostic,
} from './core.js';
import type { ContextGraphConfig } from './config.js';
import type { SemanticArtifactStore } from './storage.js';
import { sha256, stableJson } from './util.js';
import {
  assertSemanticCitation,
  numberedSemanticSource,
  semanticCitationSchema,
} from './semantic-citations.js';

interface ExtractedAssertion {
  readonly subject: { readonly id: string; readonly kind: GraphNodeKind; readonly label: string };
  readonly predicate: GraphPredicate;
  readonly object: { readonly id: string; readonly kind: GraphNodeKind; readonly label: string };
  readonly citation: { readonly startLine: number; readonly endLine: number };
  readonly confidence: number;
}

interface CodexSemanticOutput {
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
  readonly parsed: CodexSemanticOutput;
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
  extract(source: SemanticSource, context: ExtractionContext): Promise<SemanticExtractionResult>;
}

export interface SemanticCommandRunner {
  run(
    command: string,
    args: readonly string[],
    cwd: string,
    prompt: string,
    environment: SemanticCommandEnvironment,
  ): Promise<void>;
}

export type SemanticCommandEnvironment = Record<string, string | undefined>;

const semanticEnvironmentAllowlist = [
  'APPDATA',
  'CODEX_HOME',
  'COMSPEC',
  'HOME',
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'LANG',
  'LC_ALL',
  'LOCALAPPDATA',
  'NODE_EXTRA_CA_CERTS',
  'NO_PROXY',
  'OPENAI_API_KEY',
  'OPENAI_BASE_URL',
  'PATH',
  'PATHEXT',
  'SSL_CERT_FILE',
  'SYSTEMROOT',
  'TEMP',
  'TMP',
  'USERPROFILE',
  'WINDIR',
] as const;

export function semanticCommandEnvironment(
  source: Readonly<Record<string, string | undefined>>,
): SemanticCommandEnvironment {
  const result: SemanticCommandEnvironment = {};
  for (const allowed of semanticEnvironmentAllowlist) {
    const match = Object.keys(source).find((key) => key.toUpperCase() === allowed);
    if (match && source[match] !== undefined) result[allowed] = source[match];
  }
  return result;
}

const spawnSemanticCommand: SemanticCommandRunner = {
  run(command, args, cwd, prompt, environment) {
    return new Promise<void>((resolve, reject) => {
      const child = spawn(command, [...args], {
        cwd,
        env: environment,
        stdio: ['pipe', 'ignore', 'pipe'],
        windowsHide: true,
      });
      let stderr = '';
      child.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString('utf8');
      });
      child.once('error', reject);
      child.once('close', (code) => {
        if (code === 0) resolve();
        else
          reject(new Error(`Codex semantic extraction failed (${code}): ${stderr.slice(-4000)}`));
      });
      child.stdin.end(prompt);
    });
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

function outputSchema(lineCount: number): object {
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

export class CodexCliSemanticExtractor implements SemanticExtractor {
  readonly identity: string;

  constructor(
    private readonly config: ContextGraphConfig['semantic'],
    private readonly runner: SemanticCommandRunner = spawnSemanticCommand,
  ) {
    this.identity = `codex-cli:${config.model}:${config.promptVersion}:numbered-citations-v1`;
  }

  async extract(
    source: SemanticSource,
    context: ExtractionContext,
  ): Promise<SemanticExtractionResult> {
    const runRoot = await mkdtemp(join(tmpdir(), 'context-graph-codex-'));
    const schemaPath = join(runRoot, 'schema.json');
    const outputPath = join(runRoot, 'output.json');
    const sourcePath = join(runRoot, 'source.md');
    const lineCount = source.content.split('\n').length;
    const numberedSource = numberedSemanticSource(source.content);
    await writeFile(schemaPath, `${JSON.stringify(outputSchema(lineCount), null, 2)}\n`, 'utf8');
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
    const command = process.platform === 'win32' ? 'codex.exe' : 'codex';
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
      await this.runner.run(
        command,
        args,
        runRoot,
        prompt,
        semanticCommandEnvironment(process.env),
      );
      const rawModelOutput = await readFile(outputPath, 'utf8');
      return {
        parsed: JSON.parse(rawModelOutput) as CodexSemanticOutput,
        rawModelOutput,
      };
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
  ): Promise<{ artifact: SemanticArtifact; reused: boolean }> {
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
      diagnosticContractVersion: 2,
    };
    const key = sha256(stableJson(keyInput));
    const existing = await this.store.read(key);
    if (existing) return { artifact: existing, reused: true };

    const extraction = await this.extractor.extract(source, context);
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
