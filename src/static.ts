import { copyFile, mkdir, mkdtemp, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

import type { ContextGraphConfig } from './config.js';
import type { ExtractionContext, FactExtractor, GraphFact } from './core.js';
import type { GitRepository } from './git.js';
import { matchesRepositoryGlob } from './glob.js';
import { runProcess } from './process.js';
import { sha256, stableJson } from './util.js';

export interface ScipIndexResult {
  readonly path: string;
  readonly digest: string;
  readonly mode: 'full' | 'package';
  readonly version: string;
}

export interface StaticIndexer {
  index(context: ExtractionContext): Promise<ScipIndexResult>;
}

async function withExactCommitWorktree<T>(
  context: ExtractionContext,
  operation: (worktreeRoot: string) => Promise<T>,
): Promise<T> {
  const worktreesRoot = join(context.repositoryRoot, '.context-graph', 'worktrees');
  await mkdir(worktreesRoot, { recursive: true });
  const scratchRoot = await mkdtemp(join(worktreesRoot, 'scip-'));
  const worktreeRoot = join(scratchRoot, 'checkout');
  let registered = false;
  try {
    await runProcess(
      'git',
      ['worktree', 'add', '--detach', worktreeRoot, context.commitSha],
      context.repositoryRoot,
    );
    registered = true;
    return await operation(worktreeRoot);
  } finally {
    if (registered) {
      await runProcess(
        'git',
        ['worktree', 'remove', '--force', worktreeRoot],
        context.repositoryRoot,
      );
    }
    await rm(scratchRoot, { force: true, recursive: true });
  }
}

export class ScipTypeScriptIndexer implements StaticIndexer {
  constructor(
    private readonly config: ContextGraphConfig['scip'],
    private readonly storageRoot: string,
  ) {}

  async index(context: ExtractionContext): Promise<ScipIndexResult> {
    const require = createRequire(import.meta.url);
    const destination = join(this.storageRoot, 'scip', `${context.snapshotId}.scip`);
    await mkdir(join(this.storageRoot, 'scip'), { recursive: true });
    const temporary = `${destination}.${process.pid}.tmp`;
    const command =
      this.config.command === 'bundled-scip-typescript' ? process.execPath : this.config.command;
    const args =
      this.config.command === 'bundled-scip-typescript'
        ? [
            require.resolve('@sourcegraph/scip-typescript'),
            ...this.config.args,
            '--output',
            temporary,
          ]
        : this.config.args;
    await withExactCommitWorktree(context, async (worktreeRoot) => {
      await runProcess(command, args, worktreeRoot, {
        ...process.env,
        NODE_OPTIONS: process.env.NODE_OPTIONS ?? '--max-old-space-size=8192',
      });
      const source =
        this.config.command === 'bundled-scip-typescript'
          ? temporary
          : join(worktreeRoot, 'index.scip');
      await stat(source);
      if (source !== temporary) await copyFile(source, temporary);
      // SCIP embeds this disposable checkout in metadata and inferred-type hover text.
      // Store the normalized artifact itself so its digest still authenticates its bytes.
      await writeFile(temporary, normalizeScipCheckout(await readFile(temporary), worktreeRoot));
    });
    await rename(temporary, destination);
    return {
      path: destination,
      digest: sha256(await readFile(destination)),
      mode: 'full',
      version: this.config.version,
    };
  }
}

interface ScipOccurrence {
  readonly range: readonly number[];
  readonly symbol: string;
  readonly symbol_roles: number;
}

interface ScipDocument {
  readonly relative_path: string;
  readonly occurrences: readonly ScipOccurrence[];
  readonly symbols: readonly ScipSymbolInformation[];
}

interface ScipSymbolInformation {
  documentation: string[];
}

interface ScipIndex {
  readonly documents: readonly ScipDocument[];
  readonly external_symbols: readonly ScipSymbolInformation[];
  readonly metadata?: { project_root: string };
  serializeBinary(): Uint8Array;
}

interface ScipRuntime {
  readonly scip: {
    readonly Index: {
      deserializeBinary(bytes: Uint8Array): ScipIndex;
    };
  };
}

function loadScipRuntime(): ScipRuntime {
  const require = createRequire(import.meta.url);
  const main = require.resolve('@sourcegraph/scip-typescript');
  return require(join(dirname(main), 'scip.js')) as ScipRuntime;
}

export function normalizeScipCheckout(bytes: Uint8Array, checkoutRoot: string): Uint8Array {
  const runtime = loadScipRuntime();
  const roots = [pathToFileURL(checkoutRoot).href, checkoutRoot.replace(/\\/g, '/'), checkoutRoot];
  const normalize = (value: string): string => {
    for (const root of roots) {
      if (value === root) return 'file:///context-graph/repository';
      value = value.split(`${root}/`).join('file:///context-graph/repository/');
      value = value.split(`${root}\\`).join('file:///context-graph/repository/');
    }
    return value;
  };
  const index = runtime.scip.Index.deserializeBinary(bytes);
  if (index.metadata) index.metadata.project_root = normalize(index.metadata.project_root);
  for (const symbol of [
    ...index.documents.flatMap((document) => document.symbols),
    ...index.external_symbols,
  ]) {
    symbol.documentation = symbol.documentation.map(normalize);
  }
  return index.serializeBinary();
}

interface ScipSite {
  readonly path: string;
  readonly line: number;
  readonly digest: string;
  readonly component: {
    readonly id: string;
    readonly kind: 'Evidence' | 'Component';
    readonly label: string;
  };
}

interface ScipSymbolSites {
  readonly definitions: Map<string, ScipSite>;
  readonly references: Map<string, ScipSite>;
}

export class ScipSymbolExtractor implements FactExtractor {
  readonly identity = { id: 'scip-symbol-extractor', version: '1.0.0' };

  constructor(
    private readonly repository: GitRepository,
    private readonly index: ScipIndexResult,
  ) {}

  async extract(context: ExtractionContext): Promise<readonly GraphFact[]> {
    const parsed = loadScipRuntime().scip.Index.deserializeBinary(await readFile(this.index.path));
    const symbols = new Map<string, ScipSymbolSites>();
    for (const document of parsed.documents) {
      const path = document.relative_path.replace(/\\/g, '/');
      const content = await this.repository.readFileAt(context.commitSha, path);
      const digest = sha256(content);
      const component = {
        id: `component:file:${path}`,
        kind: (/\.(spec|test)\.[^.]+$/i.test(path) ? 'Evidence' : 'Component') as
          | 'Evidence'
          | 'Component',
        label: path,
      };
      for (const occurrence of document.occurrences) {
        if (!occurrence.symbol || occurrence.symbol.startsWith('local ')) continue;
        const definition = (occurrence.symbol_roles & 1) === 1;
        const sites = symbols.get(occurrence.symbol) ?? {
          definitions: new Map<string, ScipSite>(),
          references: new Map<string, ScipSite>(),
        };
        symbols.set(occurrence.symbol, sites);
        const target = definition ? sites.definitions : sites.references;
        if (target.has(path)) continue;
        target.set(path, {
          path,
          line: (occurrence.range[0] ?? 0) + 1,
          digest,
          component,
        });
      }
    }
    const facts: GraphFact[] = [];
    for (const [symbolText, sites] of [...symbols.entries()].sort(([left], [right]) =>
      left.localeCompare(right),
    )) {
      const definitionPaths = new Set(sites.definitions.keys());
      const downstream = [...sites.references.values()].filter(
        (site) => !definitionPaths.has(site.path),
      );
      if (sites.definitions.size === 0 || downstream.length === 0) continue;
      const symbol = {
        id: `symbol:scip:${sha256(symbolText)}`,
        kind: 'Contract' as const,
        label: symbolText,
        attributes: { scipIndexDigest: this.index.digest },
      };
      const relationships = [
        ...[...sites.definitions.values()].map((site) => ({ site, definition: true })),
        ...downstream.map((site) => ({ site, definition: false })),
      ];
      for (const { site, definition } of relationships) {
        const relation = definition ? 'definition' : 'reference';
        const provenance = {
          path: site.path,
          startLine: site.line,
          endLine: site.line,
          digest: site.digest,
          commitSha: context.commitSha,
        };
        facts.push({
          id: sha256(stableJson({ relation, path: site.path, symbol: symbolText, provenance })),
          subject: site.component,
          predicate: definition ? 'contains' : 'consumes',
          object: symbol,
          provenance,
          extractor: this.identity,
          confidence: 1,
          snapshotId: context.snapshotId,
        });
      }
    }
    return facts;
  }
}

export class RepositoryFileExtractor implements FactExtractor {
  readonly identity = { id: 'repository-file-extractor', version: '1.0.0' };

  constructor(
    private readonly repository: GitRepository,
    private readonly roots: readonly string[],
    private readonly scipDigest: string,
  ) {}

  async extract(context: ExtractionContext): Promise<readonly GraphFact[]> {
    const paths = await this.repository.listFilesAt(context.commitSha, this.roots);
    const facts: GraphFact[] = [];
    const project = {
      id: `project:${context.repositoryId}`,
      kind: 'Project' as const,
      label: context.repositoryId,
    };
    for (const path of paths) {
      if (!/\.(ts|tsx|js|mjs|cjs|json|prisma|ya?ml)$/i.test(path)) continue;
      const content = await this.repository.readFileAt(context.commitSha, path);
      const digest = sha256(content);
      const component = {
        id: `component:file:${path}`,
        kind: (/\.(spec|test)\.[^.]+$/i.test(path) ? 'Evidence' : 'Component') as
          | 'Evidence'
          | 'Component',
        label: path,
        attributes: { scipIndexDigest: this.scipDigest },
      };
      const provenance = {
        path,
        startLine: 1,
        endLine: Math.max(1, content.split('\n').length),
        digest,
        commitSha: context.commitSha,
      };
      facts.push({
        id: sha256(stableJson({ project, component, provenance })),
        subject: project,
        predicate: 'contains',
        object: component,
        provenance,
        extractor: this.identity,
        confidence: 1,
        snapshotId: context.snapshotId,
      });
      const lines = content.split('\n');
      for (const [index, line] of lines.entries()) {
        const imported = line.match(/(?:from\s+|import\s*\()['"]([^'"]+)['"]/)?.[1];
        if (!imported) continue;
        const contract = {
          id: `contract:module:${imported}`,
          kind: 'Contract' as const,
          label: imported,
        };
        const importProvenance = { ...provenance, startLine: index + 1, endLine: index + 1 };
        facts.push({
          id: sha256(stableJson({ component, imported, importProvenance })),
          subject: component,
          predicate: 'consumes',
          object: contract,
          provenance: importProvenance,
          extractor: this.identity,
          confidence: 1,
          snapshotId: context.snapshotId,
        });
      }
    }
    return facts;
  }
}

export class RepositoryContractExtractor implements FactExtractor {
  readonly identity = { id: 'repository-contract-extractor', version: '1.1.0' };

  constructor(
    private readonly repository: GitRepository,
    private readonly patterns: readonly string[],
    private readonly consumerRoots: readonly string[],
    private readonly aliases: Readonly<Record<string, readonly string[]>> = {},
  ) {}

  async extract(context: ExtractionContext): Promise<readonly GraphFact[]> {
    if (this.patterns.length === 0) return [];
    const paths = (await this.repository.listAllFilesAt(context.commitSha)).filter((path) =>
      this.patterns.some((pattern) => matchesRepositoryGlob(path, pattern)),
    );
    const packageManifests = (await this.repository.listAllFilesAt(context.commitSha)).filter(
      (path) => path.endsWith('package.json'),
    );
    const facts: GraphFact[] = [];
    for (const path of paths) {
      const content = await this.repository.readFileAt(context.commitSha, path);
      const provenance = {
        path,
        startLine: 1,
        endLine: Math.max(1, content.split('\n').length),
        digest: sha256(content),
        commitSha: context.commitSha,
      };
      const contract = {
        id: `contract:file:${path}`,
        kind: 'Contract' as const,
        label: path,
      };
      const source = {
        id: `evidence:contract-file:${path}`,
        kind: 'Evidence' as const,
        label: path,
      };
      facts.push({
        id: sha256(stableJson({ source, contract, provenance })),
        subject: source,
        predicate: 'contains' as const,
        object: contract,
        provenance,
        extractor: this.identity,
        confidence: 1,
        snapshotId: context.snapshotId,
      });

      const needles = [path, ...(this.aliases[path] ?? [])];
      const manifest = packageManifests
        .filter((candidate) => path.startsWith(candidate.slice(0, -'package.json'.length)))
        .sort((left, right) => right.length - left.length)[0];
      if (manifest) {
        const parsed = JSON.parse(
          await this.repository.readFileAt(context.commitSha, manifest),
        ) as { name?: unknown };
        if (typeof parsed.name === 'string' && parsed.name.startsWith('@')) {
          needles.push(parsed.name);
        }
      }
      const matches = await this.repository.findTextAt(
        context.commitSha,
        needles,
        this.consumerRoots,
      );
      for (const match of matches.filter(
        (candidate) => candidate.path !== path && candidate.path !== manifest,
      )) {
        const consumerContent = await this.repository.readFileAt(context.commitSha, match.path);
        const consumerProvenance = {
          path: match.path,
          startLine: match.line,
          endLine: match.line,
          digest: sha256(consumerContent),
          commitSha: context.commitSha,
        };
        const consumer = {
          id: `component:file:${match.path}`,
          kind: 'Component' as const,
          label: match.path,
        };
        facts.push({
          id: sha256(stableJson({ consumer, contract, consumerProvenance })),
          subject: consumer,
          predicate: 'consumes',
          object: contract,
          provenance: consumerProvenance,
          extractor: this.identity,
          confidence: 1,
          snapshotId: context.snapshotId,
        });
      }
    }
    return facts;
  }
}
