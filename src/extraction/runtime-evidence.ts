// Modified for standalone extraction; see docs/extraction-manifest.json.
import type { ExtractionContext, GraphFact, GraphNode, RuntimeTraceReference } from "@launch-echo/tently-core";
import { sha256, stableJson } from "../infrastructure/util.js";

const extractor = { id: 'otlp-runtime-evidence', version: '1.0.0' } as const;

function graphId(prefix: string, value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._:-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${prefix}:${normalized || 'unknown'}`;
}

function capabilityNode(value: string): GraphNode {
  const canonical = value.replace(/^(?:[^:]+:)?capability:/, '');
  return {
    id: graphId('capability', canonical),
    kind: 'Capability',
    label: canonical,
    attributes: { evidenceLayer: 'observed' },
  };
}

export function runtimeEvidenceFacts(
  context: ExtractionContext,
  references: readonly RuntimeTraceReference[],
): readonly GraphFact[] {
  const facts: GraphFact[] = [];
  for (const reference of references) {
    if (!reference.accepted || !reference.capability) continue;
    const service: GraphNode = {
      id: graphId('component:runtime-service', reference.serviceName),
      kind: 'Component',
      label: reference.serviceName,
      attributes: {
        evidenceLayer: 'observed',
        serviceVersion: reference.serviceVersion,
        ...(reference.environment ? { environment: reference.environment } : {}),
      },
    };
    const capability = capabilityNode(reference.capability);
    const evidence: GraphNode = {
      id: `evidence:runtime:${reference.traceId}:${reference.spanId}`,
      kind: 'Evidence',
      label: `Runtime trace ${reference.traceId.slice(0, 12)}`,
      attributes: {
        evidenceLayer: 'observed',
        traceId: reference.traceId,
        ...(reference.observedAt ? { observedAt: reference.observedAt } : {}),
      },
    };
    const workflow: GraphNode | undefined = reference.operation
      ? {
          id: graphId('workflow:runtime-operation', reference.operation),
          kind: 'Workflow',
          label: reference.operation,
          attributes: { evidenceLayer: 'observed' },
        }
      : undefined;
    const provenance = {
      path: reference.sourcePath,
      startLine: 1,
      endLine: 1,
      digest: reference.sourceDigest,
      commitSha: context.commitSha,
    };
    const relationships = [
      { subject: service, predicate: 'realizes' as const, object: capability },
      { subject: capability, predicate: 'verifiedBy' as const, object: evidence },
      ...(workflow
        ? [
            { subject: workflow, predicate: 'realizes' as const, object: capability },
            { subject: workflow, predicate: 'routesThrough' as const, object: service },
            { subject: workflow, predicate: 'verifiedBy' as const, object: evidence },
          ]
        : []),
    ];
    for (const relationship of relationships) {
      facts.push({
        id: sha256(stableJson({ reference, relationship })),
        ...relationship,
        provenance,
        extractor,
        confidence: 1,
        snapshotId: context.snapshotId,
      });
    }
  }
  return facts;
}
