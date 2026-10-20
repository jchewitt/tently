// Modified for standalone extraction; see docs/extraction-manifest.json.
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';

import { trace } from '@opentelemetry/api';
import { resourceFromAttributes } from '@opentelemetry/resources';
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';

import type { ExtractionContext, RuntimeEvidenceProvider, RuntimeTraceReference } from "@launch-echo/tently-core";
import type { ContextGraphConfig } from "../configuration/config.js";
import { sha256 } from "../infrastructure/util.js";

type OtlpValue = { stringValue?: string };
type OtlpAttribute = { key: string; value: OtlpValue };
type OtlpSpan = {
  traceId: string;
  spanId: string;
  name: string;
  startTimeUnixNano?: string;
  endTimeUnixNano?: string;
  attributes?: OtlpAttribute[];
};
interface OtlpDocument {
  readonly resourceSpans?: readonly {
    readonly resource?: { readonly attributes?: readonly OtlpAttribute[] };
    readonly scopeSpans?: readonly { readonly spans?: readonly OtlpSpan[] }[];
  }[];
}

function attribute(
  attributes: readonly OtlpAttribute[] | undefined,
  key: string,
): string | undefined {
  return attributes?.find((candidate) => candidate.key === key)?.value.stringValue;
}

async function expandPatterns(
  root: string,
  patterns: readonly string[],
): Promise<readonly string[]> {
  const files: string[] = [];
  for (const pattern of patterns) {
    const normalized = pattern.replace(/\\/g, '/');
    const wildcard = normalized.indexOf('*');
    const directory = resolve(
      root,
      wildcard >= 0 ? normalized.slice(0, wildcard) : dirname(normalized),
    );
    const suffix = wildcard >= 0 ? normalized.slice(normalized.lastIndexOf('*') + 1) : normalized;
    try {
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name);
        if (entry.isFile() && path.replace(/\\/g, '/').endsWith(suffix)) files.push(path);
      }
    } catch (error) {
      if ((error as { code?: string }).code !== 'ENOENT') throw error;
    }
  }
  return files.sort();
}

export class OtlpJsonRuntimeEvidenceProvider implements RuntimeEvidenceProvider {
  private readonly policy: NonNullable<ContextGraphConfig['runtimeEvidencePolicy']>;

  constructor(
    private readonly patterns: readonly string[],
    policy: ContextGraphConfig['runtimeEvidencePolicy'] = undefined,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.policy = policy ?? {
      retentionDays: 14,
      maxReferences: 500,
      maxSourceBytes: 5 * 1024 * 1024,
      requireEnvironment: false,
      requireServiceInstance: false,
      capabilityKeys: ['context.graph.capability'],
      operationKeys: ['context.graph.operation'],
    };
  }

  async collect(context: ExtractionContext): Promise<readonly RuntimeTraceReference[]> {
    const references: RuntimeTraceReference[] = [];
    const paths = await expandPatterns(context.repositoryRoot, this.patterns);
    if (paths.length > this.policy.maxReferences) {
      throw new Error(
        `Runtime evidence matched ${paths.length} sources, exceeding the ${this.policy.maxReferences}-reference cap`,
      );
    }
    let cumulativeSourceBytes = 0;
    for (const path of paths) {
      const sourcePath = relative(context.repositoryRoot, path).replace(/\\/g, '/');
      const sourceBytes = (await stat(path)).size;
      if (sourceBytes > this.policy.maxSourceBytes) {
        throw new Error(
          `Runtime evidence source exceeds ${this.policy.maxSourceBytes} bytes: ${sourcePath}`,
        );
      }
      cumulativeSourceBytes += sourceBytes;
      if (cumulativeSourceBytes > this.policy.maxSourceBytes) {
        throw new Error(
          `Runtime evidence sources exceed the cumulative ${this.policy.maxSourceBytes}-byte cap`,
        );
      }
    }
    let expandedReferenceCount = 0;
    for (const path of paths) {
      const sourcePath = relative(context.repositoryRoot, path).replace(/\\/g, '/');
      const content = await readFile(path, 'utf8');
      const document = JSON.parse(content) as OtlpDocument;
      const sourceDigest = sha256(content);
      for (const resourceSpan of document.resourceSpans ?? []) {
        const resourceAttributes = resourceSpan.resource?.attributes;
        const configuredServiceName = attribute(resourceAttributes, 'service.name');
        const serviceName = configuredServiceName ?? 'unknown';
        const serviceVersion = attribute(resourceAttributes, 'service.version') ?? '';
        const environment = attribute(resourceAttributes, 'deployment.environment.name');
        const serviceInstanceId = attribute(resourceAttributes, 'service.instance.id');
        for (const scope of resourceSpan.scopeSpans ?? []) {
          for (const span of scope.spans ?? []) {
            expandedReferenceCount += 1;
            if (expandedReferenceCount > this.policy.maxReferences) {
              throw new Error(
                `Runtime evidence expands beyond the ${this.policy.maxReferences}-reference cap`,
              );
            }
            const capability = this.policy.capabilityKeys
              .map((key) => attribute(span.attributes, key))
              .find(Boolean);
            const operation = this.policy.operationKeys
              .map((key) => attribute(span.attributes, key))
              .find(Boolean);
            const observedAt = parseUnixNano(span.endTimeUnixNano ?? span.startTimeUnixNano);
            const ageMs = observedAt ? this.now().getTime() - observedAt.getTime() : undefined;
            const retentionMs = this.policy.retentionDays * 24 * 60 * 60 * 1000;
            const reason =
              serviceVersion !== context.commitSha
                ? 'service.version does not match snapshot commit SHA'
                : !configuredServiceName
                  ? 'service.name is required by runtime evidence policy'
                  : this.policy.allowedServiceNames &&
                      !this.policy.allowedServiceNames.includes(configuredServiceName)
                    ? 'service.name is not allowed by runtime evidence policy'
                    : this.policy.requireEnvironment && !environment
                      ? 'deployment.environment.name is required by runtime evidence policy'
                      : environment &&
                          this.policy.allowedEnvironments &&
                          !this.policy.allowedEnvironments.includes(environment)
                        ? 'deployment.environment.name is not allowed by runtime evidence policy'
                        : this.policy.requireServiceInstance && !serviceInstanceId
                          ? 'service.instance.id is required by runtime evidence policy'
                          : !validOtelId(span.traceId, 32) || !validOtelId(span.spanId, 16)
                            ? 'runtime evidence trace/span identity is missing or invalid'
                            : !observedAt
                              ? 'runtime evidence timestamp is missing or invalid'
                              : !capability
                                ? 'runtime evidence capability is required'
                                : !operation
                                  ? 'runtime evidence operation is required'
                                  : ageMs !== undefined && ageMs < 0
                                    ? 'runtime evidence timestamp is in the future'
                                    : ageMs !== undefined && ageMs > retentionMs
                                      ? `runtime evidence is outside the ${this.policy.retentionDays}-day retention window`
                                      : undefined;
            references.push({
              traceId: span.traceId,
              spanId: span.spanId,
              serviceName,
              serviceVersion,
              capability,
              operation,
              environment,
              serviceInstanceId,
              observedAt: observedAt?.toISOString(),
              sourcePath,
              sourceDigest,
              accepted: reason === undefined,
              reason,
            });
          }
        }
      }
    }
    const unique = new Map<string, RuntimeTraceReference>();
    for (const reference of references) {
      const key = `${reference.traceId}:${reference.spanId}`;
      const existing = unique.get(key);
      if (!existing || preferRuntimeReference(reference, existing) < 0) {
        unique.set(key, reference);
      }
    }
    return [...unique.values()].sort(preferRuntimeReference).slice(0, this.policy.maxReferences);
  }
}

function validOtelId(value: string, length: number): boolean {
  return new RegExp(`^[a-f0-9]{${length}}$`, 'i').test(value) && !/^0+$/.test(value);
}

function preferRuntimeReference(left: RuntimeTraceReference, right: RuntimeTraceReference): number {
  return (
    Number(right.accepted) - Number(left.accepted) ||
    (right.observedAt ?? '').localeCompare(left.observedAt ?? '') ||
    left.sourcePath.localeCompare(right.sourcePath) ||
    left.traceId.localeCompare(right.traceId) ||
    left.spanId.localeCompare(right.spanId)
  );
}

function parseUnixNano(value: string | undefined): Date | undefined {
  if (!value || !/^\d+$/.test(value)) return undefined;
  const milliseconds = Number(BigInt(value) / 1_000_000n);
  if (!Number.isFinite(milliseconds)) return undefined;
  const parsed = new Date(milliseconds);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

export async function captureValidationTrace(
  outputPath: string,
  options: {
    readonly serviceName: string;
    readonly serviceVersion: string;
    readonly capability: string;
    readonly operation?: string;
    readonly environment: string;
    readonly serviceInstanceId?: string;
    readonly backendUrl?: string;
    readonly run: () => Promise<void>;
  },
): Promise<void> {
  const exporter = new InMemorySpanExporter();
  const provider = new BasicTracerProvider({
    resource: resourceFromAttributes({
      'service.name': options.serviceName,
      'service.version': options.serviceVersion,
      'deployment.environment.name': options.environment,
    }),
    spanProcessors: [new SimpleSpanProcessor(exporter)],
  });
  const tracer = provider.getTracer('context-graph-validation', '1.0.0');
  const span = tracer.startSpan(options.operation ?? 'context-graph.validation', {
    attributes: {
      'context.graph.capability': options.capability,
      'context.graph.operation': options.operation ?? 'context-graph.validation',
    },
  });
  try {
    await options.run();
  } catch (error) {
    span.recordException(error as Error);
    throw error;
  } finally {
    span.end();
    await provider.forceFlush();
  }
  const spans = exporter.getFinishedSpans();
  const document = {
    resourceSpans: [
      {
        resource: {
          attributes: [
            { key: 'service.name', value: { stringValue: options.serviceName } },
            { key: 'service.version', value: { stringValue: options.serviceVersion } },
            {
              key: 'service.instance.id',
              value: { stringValue: options.serviceInstanceId ?? 'context-graph-validation' },
            },
            {
              key: 'deployment.environment.name',
              value: { stringValue: options.environment },
            },
          ],
        },
        scopeSpans: [
          {
            spans: spans.map((finished) => ({
              traceId: finished.spanContext().traceId,
              spanId: finished.spanContext().spanId,
              name: finished.name,
              startTimeUnixNano: hrTimeToUnixNano(finished.startTime),
              endTimeUnixNano: hrTimeToUnixNano(finished.endTime),
              attributes: [
                {
                  key: 'context.graph.capability',
                  value: { stringValue: options.capability },
                },
                {
                  key: 'context.graph.operation',
                  value: { stringValue: options.operation ?? finished.name },
                },
              ],
            })),
          },
        ],
      },
    ],
  };
  await mkdir(dirname(outputPath), { recursive: true });
  const serialized = `${JSON.stringify(document, null, 2)}\n`;
  await writeFile(outputPath, serialized, 'utf8');
  if (options.backendUrl) {
    const response = await fetch(options.backendUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: serialized,
    });
    if (!response.ok) {
      throw new Error(`OTLP backend rejected validation trace with HTTP ${response.status}`);
    }
  }
  trace.disable();
}

function hrTimeToUnixNano(value: readonly [number, number]): string {
  return (BigInt(value[0]) * 1_000_000_000n + BigInt(value[1])).toString();
}
