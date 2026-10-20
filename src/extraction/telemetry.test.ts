// Modified for standalone extraction; see docs/extraction-manifest.json.
import { copyFile, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { ExtractionContext } from "@launch-echo/tently-core";
import { captureValidationTrace, OtlpJsonRuntimeEvidenceProvider } from "./telemetry.js";

describe('OpenTelemetry runtime evidence', () => {
  it('accepts only traces whose service.version matches the hydrated commit', async () => {
    const root = await mkdtemp(join(tmpdir(), 'context-graph-telemetry-'));
    const sha = 'b'.repeat(40);
    await captureValidationTrace(join(root, 'runtime', 'matching.otlp.json'), {
      serviceName: 'generic-worker',
      serviceVersion: sha,
      capability: 'capability:search',
      operation: 'search.execute',
      environment: 'test',
      run: async () => undefined,
    });
    await captureValidationTrace(join(root, 'runtime', 'mismatch.otlp.json'), {
      serviceName: 'generic-worker',
      serviceVersion: 'c'.repeat(40),
      capability: 'capability:search',
      operation: 'search.execute',
      environment: 'test',
      run: async () => undefined,
    });
    const context: ExtractionContext = {
      repositoryRoot: root,
      repositoryId: 'example/repo',
      ref: 'HEAD',
      commitSha: sha,
      snapshotId: sha,
      changedPaths: [],
      deletedPaths: [],
      renamedPaths: {},
    };
    const policy = {
      retentionDays: 14,
      maxReferences: 20,
      maxSourceBytes: 1024 * 1024,
      requireEnvironment: true,
      requireServiceInstance: true,
      capabilityKeys: ['context.graph.capability'],
      operationKeys: ['context.graph.operation'],
    } as const;
    const evidence = await new OtlpJsonRuntimeEvidenceProvider(
      ['runtime/*.otlp.json'],
      policy,
    ).collect(context);
    expect(evidence).toHaveLength(2);
    expect(evidence.filter((item) => item.accepted)).toHaveLength(1);
    expect(evidence.find((item) => !item.accepted)?.reason).toContain('service.version');
    const accepted = evidence.find((item) => item.accepted);
    expect(accepted?.sourcePath).toBe('runtime/matching.otlp.json');
    expect(accepted?.sourceDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(accepted?.operation).toBe('search.execute');
    expect(accepted?.observedAt).toMatch(/^\d{4}-/);

    const secondRoot = await mkdtemp(join(tmpdir(), 'context-graph-telemetry-copy-'));
    await mkdir(join(secondRoot, 'runtime'));
    await copyFile(
      join(root, 'runtime', 'matching.otlp.json'),
      join(secondRoot, 'runtime', 'matching.otlp.json'),
    );
    await copyFile(
      join(root, 'runtime', 'mismatch.otlp.json'),
      join(secondRoot, 'runtime', 'mismatch.otlp.json'),
    );
    const copied = await new OtlpJsonRuntimeEvidenceProvider(
      ['runtime/*.otlp.json'],
      policy,
    ).collect({ ...context, repositoryRoot: secondRoot });
    expect(copied).toEqual(evidence);
  });

  it('accepts repository legacy attribute aliases only when configuration declares them', async () => {
    const root = await mkdtemp(join(tmpdir(), 'context-graph-telemetry-aliases-'));
    const sha = 'e'.repeat(40);
    const path = join(root, 'runtime', 'legacy.otlp.json');
    await captureValidationTrace(path, {
      serviceName: 'configured-service',
      serviceVersion: sha,
      capability: 'legacy-capability',
      operation: 'legacy.operation',
      environment: 'test',
      run: async () => undefined,
    });
    const document = JSON.parse(await readFile(path, 'utf8')) as {
      resourceSpans: Array<{
        scopeSpans: Array<{
          spans: Array<{ attributes: Array<{ key: string }> }>;
        }>;
      }>;
    };
    for (const attribute of document.resourceSpans[0]!.scopeSpans[0]!.spans[0]!.attributes) {
      if (attribute.key === 'context.graph.capability') attribute.key = 'example.capability';
      if (attribute.key === 'context.graph.operation') attribute.key = 'example.operation';
    }
    await writeFile(path, `${JSON.stringify(document)}\n`, 'utf8');

    const evidence = await new OtlpJsonRuntimeEvidenceProvider(['runtime/*.otlp.json'], {
      retentionDays: 14,
      maxReferences: 5,
      maxSourceBytes: 1024 * 1024,
      requireEnvironment: true,
      requireServiceInstance: true,
      capabilityKeys: ['context.graph.capability', 'example.capability'],
      operationKeys: ['context.graph.operation', 'example.operation'],
    }).collect(extractionContext(root, sha));

    expect(evidence[0]).toMatchObject({
      accepted: true,
      capability: 'legacy-capability',
      operation: 'legacy.operation',
    });
  });

  it('rejects expired observations and bounds duplicate backend exports', async () => {
    const root = await mkdtemp(join(tmpdir(), 'context-graph-telemetry-retention-'));
    const sha = 'd'.repeat(40);
    const path = join(root, 'runtime', 'evidence.otlp.json');
    await captureValidationTrace(path, {
      serviceName: 'example-api',
      serviceVersion: sha,
      capability: 'planning',
      operation: 'planning.evaluate-opportunity',
      environment: 'test',
      run: async () => undefined,
    });
    const document = JSON.parse(await readFile(path, 'utf8')) as {
      resourceSpans: Array<{
        scopeSpans: Array<{ spans: Array<{ endTimeUnixNano: string }> }>;
      }>;
    };
    document.resourceSpans[0]!.scopeSpans[0]!.spans[0]!.endTimeUnixNano = (
      BigInt(Date.UTC(2026, 6, 1)) * 1_000_000n
    ).toString();
    document.resourceSpans.push(structuredClone(document.resourceSpans[0]!));
    await writeFile(path, `${JSON.stringify(document)}\n`, 'utf8');

    const futurePath = join(root, 'runtime', 'future.otlp.json');
    await captureValidationTrace(futurePath, {
      serviceName: 'example-api',
      serviceVersion: sha,
      capability: 'planning',
      operation: 'planning.evaluate-opportunity',
      environment: 'test',
      run: async () => undefined,
    });
    const futureDocument = JSON.parse(await readFile(futurePath, 'utf8')) as typeof document;
    futureDocument.resourceSpans[0]!.scopeSpans[0]!.spans[0]!.endTimeUnixNano = (
      BigInt(Date.UTC(2026, 8, 1, 12, 1)) * 1_000_000n
    ).toString();
    await writeFile(futurePath, `${JSON.stringify(futureDocument)}\n`, 'utf8');

    const evidence = await new OtlpJsonRuntimeEvidenceProvider(
      ['runtime/*.otlp.json'],
      {
        retentionDays: 7,
        maxReferences: 5,
        maxSourceBytes: 1024 * 1024,
        requireEnvironment: true,
        requireServiceInstance: true,
        capabilityKeys: ['context.graph.capability'],
        operationKeys: ['context.graph.operation'],
      },
      () => new Date('2026-09-01T12:00:00.000Z'),
    ).collect(extractionContext(root, sha));

    expect(evidence).toHaveLength(2);
    expect(evidence.map((item) => item.reason)).toEqual(
      expect.arrayContaining([
        'runtime evidence is outside the 7-day retention window',
        'runtime evidence timestamp is in the future',
      ]),
    );
  });

  it('fails closed on incomplete mapping identity and oversized evidence sources', async () => {
    const root = await mkdtemp(join(tmpdir(), 'context-graph-telemetry-identity-'));
    const sha = 'f'.repeat(40);
    const path = join(root, 'runtime', 'missing-operation.otlp.json');
    await captureValidationTrace(path, {
      serviceName: 'example-api',
      serviceVersion: sha,
      capability: 'fulfillment',
      operation: 'fulfillment.evaluate-user',
      environment: 'test',
      run: async () => undefined,
    });
    const document = JSON.parse(await readFile(path, 'utf8')) as {
      resourceSpans: Array<{
        scopeSpans: Array<{
          spans: Array<{ traceId: string; attributes: Array<{ key: string }> }>;
        }>;
      }>;
    };
    const span = document.resourceSpans[0]!.scopeSpans[0]!.spans[0]!;
    span.attributes = span.attributes.filter(
      (attribute) => attribute.key !== 'context.graph.operation',
    );
    await writeFile(path, `${JSON.stringify(document)}\n`, 'utf8');
    const policy = {
      retentionDays: 14,
      maxReferences: 20,
      maxSourceBytes: 1024 * 1024,
      requireEnvironment: true,
      requireServiceInstance: true,
      capabilityKeys: ['context.graph.capability'],
      operationKeys: ['context.graph.operation'],
    } as const;

    const evidence = await new OtlpJsonRuntimeEvidenceProvider(
      ['runtime/*.otlp.json'],
      policy,
    ).collect(extractionContext(root, sha));
    expect(evidence[0]).toMatchObject({
      accepted: false,
      reason: 'runtime evidence operation is required',
    });

    await captureValidationTrace(path, {
      serviceName: 'example-api',
      serviceVersion: sha,
      capability: 'fulfillment',
      operation: 'fulfillment.evaluate-user',
      environment: 'test',
      run: async () => undefined,
    });
    const invalidIdentityDocument = JSON.parse(await readFile(path, 'utf8')) as {
      resourceSpans: Array<{
        scopeSpans: Array<{
          spans: Array<{ traceId: string }>;
        }>;
      }>;
    };
    invalidIdentityDocument.resourceSpans[0]!.scopeSpans[0]!.spans[0]!.traceId = '0'.repeat(32);
    await writeFile(path, `${JSON.stringify(invalidIdentityDocument)}\n`, 'utf8');
    const invalidIdentityEvidence = await new OtlpJsonRuntimeEvidenceProvider(
      ['runtime/*.otlp.json'],
      policy,
    ).collect(extractionContext(root, sha));
    expect(invalidIdentityEvidence[0]).toMatchObject({
      accepted: false,
      reason: 'runtime evidence trace/span identity is missing or invalid',
    });

    await expect(
      new OtlpJsonRuntimeEvidenceProvider(['runtime/*.otlp.json'], {
        ...policy,
        maxSourceBytes: 10,
      }).collect(extractionContext(root, sha)),
    ).rejects.toThrow('Runtime evidence source exceeds 10 bytes');

    await copyFile(path, join(root, 'runtime', 'second.otlp.json'));
    await expect(
      new OtlpJsonRuntimeEvidenceProvider(['runtime/*.otlp.json'], {
        ...policy,
        maxReferences: 1,
      }).collect(extractionContext(root, sha)),
    ).rejects.toThrow('exceeding the 1-reference cap');

    const sourceBytes = Buffer.byteLength(await readFile(path, 'utf8'), 'utf8');
    await expect(
      new OtlpJsonRuntimeEvidenceProvider(['runtime/*.otlp.json'], {
        ...policy,
        maxSourceBytes: sourceBytes + 1,
      }).collect(extractionContext(root, sha)),
    ).rejects.toThrow('cumulative');
  });

  it('rejects unauthorized deployment identities and span expansion beyond the cap', async () => {
    const root = await mkdtemp(join(tmpdir(), 'context-graph-telemetry-deployment-'));
    const sha = 'a'.repeat(40);
    const unauthorizedPath = join(root, 'runtime', 'unauthorized.otlp.json');
    await captureValidationTrace(unauthorizedPath, {
      serviceName: 'synthetic-validation-service',
      serviceVersion: sha,
      capability: 'planning',
      operation: 'planning.evaluate-opportunity',
      environment: 'test',
      run: async () => undefined,
    });
    const policy = {
      retentionDays: 14,
      maxReferences: 5,
      maxSourceBytes: 1024 * 1024,
      requireEnvironment: true,
      requireServiceInstance: true,
      allowedServiceNames: ['example-api'],
      allowedEnvironments: ['staging'],
      capabilityKeys: ['context.graph.capability'],
      operationKeys: ['context.graph.operation'],
    } as const;
    const unauthorized = await new OtlpJsonRuntimeEvidenceProvider(
      ['runtime/*.otlp.json'],
      policy,
    ).collect(extractionContext(root, sha));
    expect(unauthorized[0]).toMatchObject({
      accepted: false,
      reason: 'service.name is not allowed by runtime evidence policy',
    });

    await captureValidationTrace(unauthorizedPath, {
      serviceName: 'example-api',
      serviceVersion: sha,
      capability: 'planning',
      operation: 'planning.evaluate-opportunity',
      environment: 'test',
      run: async () => undefined,
    });
    const unauthorizedEnvironment = await new OtlpJsonRuntimeEvidenceProvider(
      ['runtime/*.otlp.json'],
      policy,
    ).collect(extractionContext(root, sha));
    expect(unauthorizedEnvironment[0]).toMatchObject({
      accepted: false,
      reason: 'deployment.environment.name is not allowed by runtime evidence policy',
    });

    const document = JSON.parse(await readFile(unauthorizedPath, 'utf8')) as {
      resourceSpans: Array<{
        scopeSpans: Array<{
          spans: Array<{ traceId: string; spanId: string }>;
        }>;
      }>;
    };
    const duplicate = structuredClone(document.resourceSpans[0]!.scopeSpans[0]!.spans[0]!);
    duplicate.traceId = '1'.repeat(32);
    duplicate.spanId = '2'.repeat(16);
    document.resourceSpans[0]!.scopeSpans[0]!.spans.push(duplicate);
    await writeFile(unauthorizedPath, `${JSON.stringify(document)}\n`, 'utf8');

    await expect(
      new OtlpJsonRuntimeEvidenceProvider(['runtime/*.otlp.json'], {
        ...policy,
        maxReferences: 1,
      }).collect(extractionContext(root, sha)),
    ).rejects.toThrow('expands beyond the 1-reference cap');
  });

  it('posts an OTLP/HTTP JSON payload to a backend without product payload attributes', async () => {
    const root = await mkdtemp(join(tmpdir(), 'context-graph-telemetry-backend-'));
    let received = '';
    const server = createServer((request, response) => {
      request.setEncoding('utf8');
      request.on('data', (chunk) => (received += String(chunk)));
      request.on('end', () => {
        response.statusCode = 200;
        response.end();
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Expected TCP test backend');
    try {
      await captureValidationTrace(join(root, 'runtime', 'backend.otlp.json'), {
        serviceName: 'example-execution',
        serviceVersion: 'e'.repeat(40),
        capability: 'execution',
        operation: 'execution.process-intent',
        environment: 'test',
        backendUrl: `http://127.0.0.1:${address.port}/v1/traces`,
        run: async () => undefined,
      });
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
    expect(received).toContain('execution.process-intent');
    expect(received).toContain('deployment.environment.name');
    expect(received).not.toMatch(/userId|accountId|orderId|worker/i);
  });
});

function extractionContext(root: string, sha: string): ExtractionContext {
  return {
    repositoryRoot: root,
    repositoryId: 'example/repo',
    ref: 'HEAD',
    commitSha: sha,
    snapshotId: sha,
    changedPaths: [],
    deletedPaths: [],
    renamedPaths: {},
  };
}
