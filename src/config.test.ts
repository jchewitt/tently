// Modified for standalone extraction; see docs/extraction-manifest.json.
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { loadConfig } from './config.js';

const validConfig = {
  schemaVersion: 1,
  repositoryId: 'example/repo',
  namespace: 'https://example.test/',
  semanticSources: [],
  codeRoots: [],
  contractPatterns: [],
  evidenceRoots: [],
  semantic: {
    provider: 'codex-cli',
    model: 'test',
    reasoningEffort: 'low',
    promptVersion: '1',
    extractorVersion: '1',
    adapterVersion: '1',
    ontologyVersion: '1',
    minimumConfidence: 0.7,
    failOnUnresolved: true,
    concurrency: 1,
  },
  scip: { version: '1', command: 'scip', args: [] },
  ontology: { backend: 'opencaesar', toolVersion: '1', containerImage: 'image@sha256:digest', projectPath: 'ontology' },
  runtimeEvidence: [],
  storagePath: '.context-graph',
};

function withoutPath(path: string): object {
  const value = structuredClone(validConfig) as Record<string, unknown>;
  const parts = path.split('.');
  const field = parts.pop();
  let target = value;
  for (const part of parts) target = target[part] as Record<string, unknown>;
  delete target[field as string];
  return value;
}

describe('loadConfig', () => {
  it('resolves an explicit config against the original pnpm invocation directory', async () => {
    const initialDirectory = await mkdtemp(join(tmpdir(), 'context-graph-config-'));
    const packageDirectory = join(initialDirectory, 'lib', 'graph');
    await mkdir(packageDirectory, { recursive: true });
    const configPath = join(packageDirectory, 'smoke.config.json');
    await writeFile(configPath, JSON.stringify(validConfig));

    const loaded = await loadConfig('lib/graph/smoke.config.json', initialDirectory);
    expect(loaded.configPath).toBe(configPath);
  });

  it.each([
    'schemaVersion',
    'repositoryId',
    'namespace',
    'semanticSources',
    'codeRoots',
    'contractPatterns',
    'evidenceRoots',
    'semantic',
    'semantic.provider',
    'semantic.model',
    'semantic.reasoningEffort',
    'semantic.promptVersion',
    'semantic.extractorVersion',
    'semantic.adapterVersion',
    'semantic.ontologyVersion',
    'semantic.minimumConfidence',
    'semantic.failOnUnresolved',
    'semantic.concurrency',
    'scip',
    'scip.version',
    'scip.command',
    'scip.args',
    'ontology',
    'ontology.toolVersion',
    'ontology.containerImage',
    'ontology.projectPath',
    'runtimeEvidence',
    'storagePath',
  ])('rejects a config missing required field %s', async (field) => {
    const root = await mkdtemp(join(tmpdir(), 'context-graph-config-invalid-'));
    const configPath = join(root, 'context-graph.config.json');
    await writeFile(configPath, JSON.stringify(withoutPath(field)));

    await expect(loadConfig(configPath)).rejects.toThrow('Invalid context graph config');
  });

  it('validates the optional bounded runtime evidence policy', async () => {
    const root = await mkdtemp(join(tmpdir(), 'context-graph-config-runtime-'));
    const configPath = join(root, 'context-graph.config.json');
    const runtimeEvidencePolicy = {
      retentionDays: 14,
      maxReferences: 500,
      maxSourceBytes: 1024,
      requireEnvironment: true,
      requireServiceInstance: true,
      allowedServiceNames: ['example-api'],
      allowedEnvironments: ['staging'],
      capabilityKeys: ['example.capability'],
      operationKeys: ['example.operation'],
    };
    await writeFile(configPath, JSON.stringify({ ...validConfig, runtimeEvidencePolicy }));
    await expect(loadConfig(configPath)).resolves.toMatchObject({
      config: { runtimeEvidencePolicy },
    });

    await writeFile(
      configPath,
      JSON.stringify({
        ...validConfig,
        runtimeEvidencePolicy: { ...runtimeEvidencePolicy, retentionDays: 0 },
      }),
    );
    await expect(loadConfig(configPath)).rejects.toThrow(
      'runtimeEvidencePolicy.retentionDays must be a positive integer',
    );

    await writeFile(
      configPath,
      JSON.stringify({
        ...validConfig,
        runtimeEvidencePolicy: { ...runtimeEvidencePolicy, allowedServiceNames: [] },
      }),
    );
    await expect(loadConfig(configPath)).rejects.toThrow(
      'runtimeEvidencePolicy.allowedServiceNames must be a non-empty array of strings',
    );
  });
});
