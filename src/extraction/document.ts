// Modified for standalone extraction; see docs/extraction-manifest.json.
import type {
  ExtractionContext, GraphDiagnostic, GraphFact, GraphNode, SemanticArtifact, SemanticSource, SourceSpan,
} from '@weftlet/core';
import { sha256, stableJson } from '../infrastructure/util.js';
import { documentReferences, resolveDocumentReference } from './document-references.js';

export const documentLinkerIdentity = { id: 'document-linker', version: '2.0.0' } as const;

function fileNode(path: string): GraphNode {
  if (/\.(?:md|mdx|txt)$/i.test(path)) return { id: `document:${path}`, kind: 'Document', label: path };
  return { id: `component:file:${path}`, label: path,
    kind: /\.(spec|test)\.[^.]+$/i.test(path) ? 'Evidence' : 'Component' };
}

export function linkSemanticDocuments(
  context: ExtractionContext,
  hydrated: readonly { source: SemanticSource; artifact: SemanticArtifact }[],
  trackedPaths: readonly string[],
  approvedSourcePaths: readonly string[] = [],
): { readonly facts: readonly GraphFact[]; readonly diagnostics: readonly GraphDiagnostic[] } {
  const facts = new Map<string, GraphFact>();
  const diagnostics = new Map<string, GraphDiagnostic>();
  const tracked = new Set(trackedPaths);
  for (const { source, artifact } of hydrated) {
    const owner: GraphNode = { id: `document:${source.path}`, kind: 'Document', label: source.path };
    const span = (startLine: number, endLine: number): SourceSpan => ({
      path: source.path, startLine, endLine, digest: source.digest, commitSha: context.commitSha,
    });
    const add = (predicate: 'contains' | 'references', object: GraphNode, provenance: SourceSpan) => {
      const id = sha256(stableJson({ subject: owner.id, predicate, object: object.id, provenance,
        extractor: documentLinkerIdentity }));
      facts.set(id, { id, subject: owner, predicate, object, provenance,
        extractor: documentLinkerIdentity, confidence: 1, authority: 'inferred',
        sourceAuthority: approvedSourcePaths.includes(source.path) ? 'declared' : 'inferred',
        extractionReview: predicate === 'contains' ? 'unreviewed' : 'deterministic',
        snapshotId: context.snapshotId });
    };
    // Containment follows the assertion's actual cited passage and stays unreviewed.
    for (const fact of artifact.facts) {
      for (const node of [fact.subject, fact.object]) {
        add('contains', node, span(fact.provenance.startLine, fact.provenance.endLine));
      }
    }
    for (const reference of documentReferences(source.content)) {
      const resolved = resolveDocumentReference(source.path, reference, tracked);
      if (resolved.kind === 'ignored') continue;
      const provenance = span(reference.startLine, reference.endLine);
      if (resolved.kind === 'resolved') {
        add('references', fileNode(resolved.path), provenance);
      } else {
        const id = sha256(stableJson({ provenance, reason: resolved.reason, extractor: documentLinkerIdentity }));
        diagnostics.set(id, { id, kind: 'implementationGaps', reason: resolved.reason,
          provenance: [provenance], relatedNodeIds: [owner.id, ...(resolved.path ? [fileNode(resolved.path).id] : [])],
          evidenceScope: 'source' });
      }
    }
  }
  return { facts: [...facts.values()].sort((a, b) => a.id.localeCompare(b.id)),
    diagnostics: [...diagnostics.values()].sort((a, b) => a.id.localeCompare(b.id)) };
}
