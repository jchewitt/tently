// Modified for standalone extraction; see docs/extraction-manifest.json.

import { describe, expect, it } from 'vitest';

import type { ExtractionContext, RuntimeTraceReference } from './core.js';
import { runtimeEvidenceFacts } from './runtime-evidence.js';

describe('runtime evidence graph facts', () => {
  it('adds observed service, workflow, capability, and trace relationships without declaring intent', () => {
    const context: ExtractionContext = {
      repositoryRoot: '/repo',
      repositoryId: 'example/repo',
      ref: 'HEAD',
      commitSha: 'a'.repeat(40),
      snapshotId: 'snapshot',
      changedPaths: [],
      deletedPaths: [],
      renamedPaths: {},
    };
    const reference: RuntimeTraceReference = {
      traceId: 'trace-1',
      spanId: 'span-1',
      serviceName: 'example-api',
      serviceVersion: context.commitSha,
      capability: 'planning',
      operation: 'planning.evaluate-opportunity',
      environment: 'staging',
      observedAt: '2026-09-01T12:00:00.000Z',
      sourcePath: '.context-graph/runtime/staging.otlp.json',
      sourceDigest: 'b'.repeat(64),
      accepted: true,
    };

    const facts = runtimeEvidenceFacts(context, [reference]);

    expect(facts).toHaveLength(5);
    expect(facts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          predicate: 'realizes',
          subject: expect.objectContaining({
            id: 'component:runtime-service:example-api',
            attributes: expect.objectContaining({ evidenceLayer: 'observed' }),
          }),
          object: expect.objectContaining({ id: 'capability:planning' }),
        }),
        expect.objectContaining({
          predicate: 'verifiedBy',
          object: expect.objectContaining({ kind: 'Evidence' }),
        }),
      ]),
    );
    expect(facts.every((fact) => fact.extractor.id === 'otlp-runtime-evidence')).toBe(true);
    expect(facts.some((fact) => fact.predicate === 'governedBy')).toBe(false);
  });

});
