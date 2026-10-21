// Modified for standalone extraction; see docs/extraction-manifest.json.
import type {
  ExtractionContext,
  GraphFact,
  GraphNode,
  SemanticArtifact,
  SemanticSource,
} from "@weftlet/core";
import { sha256, stableJson } from "../infrastructure/util.js";

const identity = { id: 'document-linker', version: '1.0.0' } as const;
const repositoryPathPattern = /\b[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)+/g;

function documentNode(path: string): GraphNode {
  return { id: `document:${path}`, kind: 'Document', label: path };
}

export function linkSemanticDocuments(
  context: ExtractionContext,
  hydrated: readonly { source: SemanticSource; artifact: SemanticArtifact }[],
  trackedPaths: readonly string[] = [],
): readonly GraphFact[] {
  const facts: GraphFact[] = [];
  const makeFact = (
    source: SemanticSource,
    subject: GraphNode,
    predicate: 'contains' | 'references',
    object: GraphNode,
  ): GraphFact => ({
    id: sha256(
      stableJson({ source: source.path, subject: subject.id, predicate, object: object.id }),
    ),
    subject,
    predicate,
    object,
    provenance: {
      path: source.path,
      startLine: 1,
      endLine: Math.max(1, source.content.split('\n').length),
      digest: source.digest,
      commitSha: context.commitSha,
    },
    extractor: identity,
    confidence: 1,
    authority: 'inferred',
    extractionReview: predicate === 'contains' ? 'unreviewed' : 'deterministic',
    snapshotId: context.snapshotId,
  });

  for (const { source, artifact } of hydrated) {
    const owner = documentNode(source.path);
    const nodes = new Map(
      artifact.facts.flatMap((fact) => [fact.subject, fact.object]).map((node) => [node.id, node]),
    );
    for (const node of nodes.values()) facts.push(makeFact(source, owner, 'contains', node));
    const references = [
      ...new Set(
        (source.content.match(repositoryPathPattern) ?? []).map((path) =>
          path.replace(/[.,;:]+$/, ''),
        ),
      ),
    ].sort();
    const resolvedReferences = new Set<string>();
    for (const path of references) {
      if (trackedPaths.includes(path) || /\.(?:md|mdx|txt)$/i.test(path)) {
        resolvedReferences.add(path);
        continue;
      }
      for (const trackedPath of trackedPaths) {
        if (trackedPath.startsWith(`${path}/`)) resolvedReferences.add(trackedPath);
      }
    }
    for (const path of [...resolvedReferences].sort()) {
      const target: GraphNode = /\.(?:md|mdx|txt)$/i.test(path)
        ? documentNode(path)
        : { id: `component:file:${path}`, kind: 'Component', label: path };
      facts.push(makeFact(source, owner, 'references', target));
    }
  }
  return facts;
}
