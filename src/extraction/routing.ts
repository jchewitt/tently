import { posix } from 'node:path';
import type { ExtractionContext, GraphDiagnostic, GraphFact, GraphNode, SourceSpan } from '@weftlet/core';
import type { GitRepository } from '../repository/git.js';
import { sha256, stableJson } from '../infrastructure/util.js';

export const routingExtractorIdentity = { id: 'routing-declaration-extractor', version: '1.0.0' } as const;

interface RoutingDeclaration {
  readonly id: string;
  readonly scope: string;
  readonly channel: string;
  readonly producer: string;
  readonly consumer: string;
}

interface CitedRoute { readonly route: RoutingDeclaration; readonly provenance: SourceSpan }

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

function label(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 200 &&
    value === value.trim() && !/[\x00-\x1f\x7f-\x9f]/.test(value);
}

function repositoryPath(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 1024 &&
    value === value.trim() && !/[\\:*?\[\]{}%#\x00-\x1f\x7f-\x9f]/.test(value) &&
    !posix.isAbsolute(value) && posix.normalize(value) === value &&
    value.split('/').every((part) => part !== '' && part !== '.' && part !== '..');
}

/** JSON.parse alone silently accepts duplicate keys, which would hide conflicting declarations. */
function parseUniqueJson(content: string, path: string): unknown {
  let parsed: unknown;
  try { parsed = JSON.parse(content); }
  catch { throw new Error(`Invalid routing source ${path}: malformed JSON`); }
  const objects: (Set<string> | undefined)[] = [];
  for (const token of content.matchAll(/"(?:\\.|[^"\\])*"|[{}\[\]]/g)) {
    const value = token[0];
    if (value === '{' || value === '[') objects.push(value === '{' ? new Set() : undefined);
    else if (value === '}' || value === ']') objects.pop();
    else if (/^\s*:/.test(content.slice(token.index! + value.length))) {
      const keys = objects.at(-1)!;
      const key = JSON.parse(value) as string;
      if (keys.has(key)) throw new Error(`Invalid routing source ${path}: duplicate JSON key ${key}`);
      keys.add(key);
    }
  }
  return parsed;
}

function parseRoutes(content: string, path: string): readonly RoutingDeclaration[] {
  if (Buffer.byteLength(content) > 65_536) throw new Error(`Routing source ${path} exceeds 64 KiB`);
  const parsed = parseUniqueJson(content, path);
  if (!record(parsed) || !exactKeys(parsed, ['schemaVersion', 'routes']) ||
    parsed.schemaVersion !== 1 || !Array.isArray(parsed.routes)) {
    throw new Error(`Invalid routing source ${path}: expected schemaVersion 1 and routes array`);
  }
  return parsed.routes.map((route: unknown, index: number) => {
    if (!record(route) || !exactKeys(route, ['id', 'scope', 'channel', 'producer', 'consumer']) ||
      !label(route.id) || !label(route.scope) || !label(route.channel) ||
      !repositoryPath(route.producer) || !repositoryPath(route.consumer)) {
      throw new Error(`Invalid routing source ${path}: route ${index + 1} requires exact id/scope/channel labels and normalized producer/consumer paths`);
    }
    return { id: route.id, scope: route.scope, channel: route.channel,
      producer: route.producer, consumer: route.consumer };
  });
}

function fileNode(path: string): GraphNode {
  return { id: `component:file:${path}`, label: path,
    kind: /\.(spec|test)\.[^.]+$/i.test(path) ? 'Evidence' : 'Component' };
}

/** Reads explicit mapping declarations, never infers routing from matching topic text. */
export async function extractRoutingDeclarations(
  repository: GitRepository,
  context: ExtractionContext,
  paths: readonly string[],
  options: { readonly allowMissingSources?: boolean } = {},
): Promise<{ readonly facts: readonly GraphFact[]; readonly diagnostics: readonly GraphDiagnostic[];
  readonly referencedPaths: readonly string[] }> {
  if (paths.length > 16 || new Set(paths).size !== paths.length ||
    paths.some((path) => !repositoryPath(path) || !path.endsWith('.json'))) {
    throw new Error('Routing sources require at most 16 unique exact repository-relative .json paths');
  }
  if (paths.length === 0) return { facts: [], diagnostics: [], referencedPaths: [] };
  // NUL-delimited tree entries preserve spaces/Unicode regardless of core.quotepath.
  // A symlink or submodule is not evidence of a regular source file at this path.
  const entries = (await repository.run(['ls-tree', '-r', '-z', context.commitSha, '--', '.']))
    .split('\0').filter(Boolean).map((entry) => {
      const fields = /^(\d{6}) (blob|tree|commit) [a-f0-9]+\t([\s\S]+)$/.exec(entry);
      if (!fields) throw new Error('Unable to read exact committed routing file entries');
      return { mode: fields[1]!, type: fields[2]!, path: fields[3]! };
    });
  const tracked = new Set(entries.map((entry) => entry.path));
  const regular = new Set(entries.filter((entry) => entry.type === 'blob' &&
    ['100644', '100755'].includes(entry.mode)).map((entry) => entry.path));
  const cited: CitedRoute[] = [];
  const diagnostics: GraphDiagnostic[] = [];
  const addDiagnostic = (reason: string, provenance: readonly SourceSpan[], relatedNodeIds: readonly string[]) => {
    diagnostics.push({ id: sha256(stableJson({ reason, provenance, relatedNodeIds,
      extractor: routingExtractorIdentity, commitSha: context.commitSha })),
      kind: 'implementationGaps', reason, provenance, relatedNodeIds, evidenceScope: 'source' });
  };
  for (const path of [...paths].sort()) {
    if (!tracked.has(path)) {
      if (!options.allowMissingSources) throw new Error(`Routing source ${path} is not a committed file at ${context.commitSha}`);
      addDiagnostic(`Routing source ${path} is absent from this draft; no bindings from that source were retained.`,
        [], [`document:${path}`]);
      continue;
    }
    if (!regular.has(path)) throw new Error(`Routing source ${path} is not a regular committed file at ${context.commitSha}`);
    const content = await repository.readFileAt(context.commitSha, path);
    const provenance = { path, startLine: 1, endLine: content.split('\n').length,
      digest: sha256(content), commitSha: context.commitSha };
    cited.push(...parseRoutes(content, path).map((route) => ({ route, provenance })));
    if (cited.length > 500) throw new Error('Routing sources exceed the 500 declaration bound');
  }
  const groups = new Map<string, CitedRoute[]>();
  const referencedPaths = new Set<string>();
  for (const item of cited) {
    const key = stableJson({ repositoryId: context.repositoryId, scope: item.route.scope, id: item.route.id });
    const group = groups.get(key) ?? [];
    group.push(item); groups.set(key, group);
    referencedPaths.add(item.route.producer); referencedPaths.add(item.route.consumer);
  }
  const facts: GraphFact[] = [];
  for (const [key, group] of groups) {
    const { route, provenance } = group[0]!;
    const binding: GraphNode = { id: `workflow:routing:${sha256(key)}`, kind: 'Workflow',
      label: `Routing ${route.scope}/${route.id}: ${route.channel}`,
      attributes: { evidenceLayer: 'routing-declaration', routeId: route.id, scope: route.scope,
        channel: route.channel } };
    if (group.length > 1) {
      addDiagnostic(`Ambiguous routing declaration ${route.scope}/${route.id}: ${group.length} records share this scoped identity; all of its bindings were suppressed.`,
        [...new Map(group.map((item) => [stableJson(item.provenance), item.provenance])).values()],
        [binding.id, ...new Set(group.flatMap((item) => [fileNode(item.route.producer).id, fileNode(item.route.consumer).id]))]);
      continue;
    }
    const missing = [...new Set([route.producer, route.consumer])].filter((path) => !regular.has(path));
    if (missing.length > 0) {
      addDiagnostic(`Routing declaration ${route.scope}/${route.id} names missing or non-regular committed endpoint(s): ${missing.join(', ')}. Both binding relationships were suppressed; no path or case was guessed.`,
        [provenance], [binding.id, fileNode(route.producer).id, fileNode(route.consumer).id]);
      continue;
    }
    const relationships = [
      { subject: fileNode(route.producer), predicate: 'emits' as const, object: binding },
      { subject: binding, predicate: 'routesThrough' as const, object: fileNode(route.consumer) },
    ];
    for (const relationship of relationships) {
      const assertion = { ...relationship, provenance, extractor: routingExtractorIdentity,
        confidence: 1, authority: 'inferred' as const, sourceAuthority: 'inferred' as const,
        extractionReview: 'deterministic' as const };
      facts.push({ ...assertion, id: sha256(stableJson(assertion)), snapshotId: context.snapshotId });
    }
  }
  return { facts: facts.sort((a, b) => a.id.localeCompare(b.id)),
    diagnostics: diagnostics.sort((a, b) => a.id.localeCompare(b.id)),
    referencedPaths: [...referencedPaths].sort() };
}
