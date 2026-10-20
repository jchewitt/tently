// Modified for standalone extraction; see docs/extraction-manifest.json.
import { mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { ExtractionContext, SemanticSource } from "@launch-echo/tently-core";
import { CodexCliSemanticExtractor, SemanticHydrator } from "./semantic.js";
import { SemanticArtifactStore } from "../storage/storage.js";

const semanticConfig = {
  provider: 'codex-cli' as const,
  model: 'test-model',
  reasoningEffort: 'low',
  promptVersion: 'prompt-v1',
  extractorVersion: '1.0.0',
  adapterVersion: '1.0.0',
  ontologyVersion: '1.0.0',
  minimumConfidence: 0.7,
  failOnUnresolved: true,
  concurrency: 1,
};

const context: ExtractionContext = {
  repositoryRoot: 'repo',
  repositoryId: 'example/repo',
  ref: 'HEAD',
  commitSha: 'a'.repeat(40),
  snapshotId: 'a'.repeat(40),
  changedPaths: ['docs/capability.md'],
  deletedPaths: [],
  renamedPaths: {},
};

const source: SemanticSource = {
  stableSemanticId: 'doc:capability',
  path: 'docs/capability.md',
  content: '# Capability\nThe worker realizes search.\n',
  digest: 'source-digest',
};

describe('SemanticHydrator', () => {
  it('persists typed citations and rejects invalid diagnostic citations and node mappings', async () => {
    const root = await mkdtemp(join(tmpdir(), 'context-graph-diagnostics-'));
    const item = {
      kind: 'ambiguousIntent' as const,
      reason: 'Source gives two incompatible authorities.',
      citation: { startLine: 2, endLine: 2 },
      relatedNodeIds: [] as string[],
    };
    const makeHydrator = (diagnostic = item) =>
      new SemanticHydrator(
        { ...semanticConfig, failOnUnresolved: false },
        new SemanticArtifactStore(root),
        {
          identity: `fake:${JSON.stringify(diagnostic)}`,
          async extract() {
            return {
              parsed: { assertions: [], oml: '', diagnostics: [diagnostic] },
              rawModelOutput: JSON.stringify(diagnostic),
            };
          },
        },
      );
    const { artifact } = await makeHydrator().hydrate(source, context);
    expect(artifact.diagnostics?.[0]).toMatchObject({
      kind: 'ambiguousIntent',
      evidenceScope: 'source',
      provenance: [
        {
          path: source.path,
          startLine: 2,
          endLine: 2,
          commitSha: context.commitSha,
          digest: source.digest,
        },
      ],
    });
    await expect(
      makeHydrator({ ...item, citation: { startLine: 20, endLine: 20 } }).hydrate(source, context),
    ).rejects.toThrow('Invalid source citation for docs/capability.md: diagnostic[0] cites 20-20');
    await expect(
      makeHydrator({ ...item, relatedNodeIds: ['invented:node'] }).hydrate(source, context),
    ).rejects.toThrow('Invalid semantic diagnostic');
    await expect(makeHydrator({ ...item, reason: '' }).hydrate(source, context)).rejects.toThrow(
      'Invalid semantic diagnostic',
    );
  });
  it('runs Codex from a source-only isolated directory', async () => {
    let isolatedRoot = '';
    let stagedFiles: readonly string[] = [];
    let commandArguments: readonly string[] = [];
    let commandEnvironment: Record<string, string | undefined> = {};
    let capturedPrompt = '';
    let stagedSource = '';
    let stagedSchema: unknown;
    process.env.CONTEXT_GRAPH_TEST_SECRET = 'must-not-be-inherited';
    const extractor = new CodexCliSemanticExtractor(semanticConfig, {
      async run(_command, args, cwd, prompt, environment) {
        isolatedRoot = cwd;
        commandArguments = args;
        commandEnvironment = environment;
        stagedFiles = (await readdir(cwd)).sort();
        capturedPrompt = prompt;
        stagedSource = await readFile(join(cwd, 'source.md'), 'utf8');
        stagedSchema = JSON.parse(await readFile(join(cwd, 'schema.json'), 'utf8'));
        const outputIndex = args.indexOf('--output-last-message');
        const outputPath = args[outputIndex + 1];
        if (!outputPath) throw new Error('Missing output path');
        await writeFile(
          outputPath,
          JSON.stringify({ assertions: [], oml: '', unresolvedMappings: [] }),
          'utf8',
        );
      },
    });

    await extractor.extract(source, context);
    delete process.env.CONTEXT_GRAPH_TEST_SECRET;

    expect(isolatedRoot).not.toContain(context.repositoryRoot);
    expect(stagedFiles).toEqual(['schema.json', 'source.md']);
    expect(commandArguments).toContain('--skip-git-repo-check');
    expect(commandArguments).toContain('shell_tool');
    expect(commandEnvironment.CONTEXT_GRAPH_TEST_SECRET).toBeUndefined();
    expect(stagedSource).toBe('1|# Capability\n2|The worker realizes search.\n3|');
    expect(capturedPrompt).toContain(stagedSource);
    expect(capturedPrompt).toContain('valid lines are 1-3');
    for (const kind of ['assertions', 'diagnostics']) {
      expect(stagedSchema).toMatchObject({
        properties: {
          [kind]: {
            items: {
              properties: {
                citation: {
                  properties: {
                    startLine: { type: 'integer', minimum: 1, maximum: 3 },
                    endLine: { type: 'integer', minimum: 1, maximum: 3 },
                  },
                },
              },
            },
          },
        },
      });
    }
    expect(source.content).toBe('# Capability\nThe worker realizes search.\n');
    expect(extractor.identity).toBe('codex-cli:test-model:low:prompt-v1:contract-v2');
    await expect(readFile(isolatedRoot, 'utf8')).rejects.toThrow();
  });

  it('reuses immutable content-addressed output and preserves forced revisions', async () => {
    const root = await mkdtemp(join(tmpdir(), 'context-graph-semantic-'));
    let calls = 0;
    const extractor = {
      identity: 'fake:1',
      async extract() {
        calls += 1;
        return {
          parsed: {
            assertions: [
              {
                subject: { id: 'capability:search', kind: 'Capability' as const, label: 'Search' },
                predicate: 'implementedBy' as const,
                object: { id: 'component:worker', kind: 'Component' as const, label: 'Worker' },
                citation: { startLine: 2, endLine: 2 },
                confidence: 0.98,
              },
            ],
            oml: 'model proposal',
            unresolvedMappings: [],
          },
          rawModelOutput: '{\n  "oml": "model proposal"\n}\n',
        };
      },
    };
    const hydrator = new SemanticHydrator(
      semanticConfig,
      new SemanticArtifactStore(root),
      extractor,
    );
    const first = await hydrator.hydrate(source, context);
    const second = await hydrator.hydrate(source, context);
    const forced = await hydrator.hydrate(source, context, 'forced-1');

    expect(first.reused).toBe(false);
    expect(second.reused).toBe(true);
    expect(second.artifact.key).toBe(first.artifact.key);
    expect(forced.artifact.key).not.toBe(first.artifact.key);
    expect(calls).toBe(2);
    expect(first.artifact.oml).toContain('description <https://context-graph.dev/generated/');
    expect(first.artifact.rawModelOutput).toBe('{\n  "oml": "model proposal"\n}\n');
    const artifacts = await readdir(join(root, 'artifacts', 'semantic'));
    expect(artifacts).toHaveLength(2);
    expect(
      await readFile(join(root, 'artifacts', 'semantic', artifacts[0] as string), 'utf8'),
    ).toContain('rawModelOutput');
  });

  it('does not reuse pre-numbering artifacts and reuses new output without another model call', async () => {
    const root = await mkdtemp(join(tmpdir(), 'context-graph-citation-version-'));
    const store = new SemanticArtifactStore(root);
    const output = { assertions: [], diagnostics: [], oml: '' };
    const old = await new SemanticHydrator(semanticConfig, store, {
      identity: 'codex-cli:test-model:prompt-v1',
      async extract() {
        return { parsed: output, rawModelOutput: JSON.stringify(output) };
      },
    }).hydrate(source, context);
    let calls = 0;
    const extractor = new CodexCliSemanticExtractor(semanticConfig, {
      async run(_command, args) {
        calls += 1;
        const outputPath = args[args.indexOf('--output-last-message') + 1];
        if (!outputPath) throw new Error('Missing output path');
        await writeFile(outputPath, JSON.stringify(output));
      },
    });
    const hydrator = new SemanticHydrator(semanticConfig, store, extractor);
    const fresh = await hydrator.hydrate(source, context);
    const reused = await hydrator.hydrate(source, context);
    expect(fresh.reused).toBe(false);
    expect(fresh.artifact.key).not.toBe(old.artifact.key);
    expect(fresh.artifact.source).toMatchObject({
      path: source.path,
      digest: source.digest,
      startLine: 1,
      endLine: 3,
    });
    expect(reused.reused).toBe(true);
    expect(calls).toBe(1);
  });

  it('fails closed for unresolved mappings and invalid citations', async () => {
    const root = await mkdtemp(join(tmpdir(), 'context-graph-semantic-fail-'));
    const unresolved = new SemanticHydrator(semanticConfig, new SemanticArtifactStore(root), {
      identity: 'fake:unresolved',
      async extract() {
        return {
          parsed: { assertions: [], oml: '', unresolvedMappings: ['owner is ambiguous'] },
          rawModelOutput: '{"unresolvedMappings":["owner is ambiguous"]}',
        };
      },
    });
    await expect(unresolved.hydrate(source, context)).rejects.toThrow(
      'Unresolved semantic mappings',
    );

    const invalidCitation = new SemanticHydrator(semanticConfig, new SemanticArtifactStore(root), {
      identity: 'fake:citation',
      async extract() {
        return {
          parsed: {
            assertions: [
              {
                subject: { id: 'capability:x', kind: 'Capability' as const, label: 'X' },
                predicate: 'implementedBy' as const,
                object: { id: 'component:y', kind: 'Component' as const, label: 'Y' },
                citation: { startLine: 99, endLine: 99 },
                confidence: 1,
              },
            ],
            oml: '',
            unresolvedMappings: [],
          },
          rawModelOutput: '{"assertions":[{"citation":{"startLine":99,"endLine":99}}]}',
        };
      },
    });
    await expect(invalidCitation.hydrate(source, context)).rejects.toThrow(
      'Invalid source citation',
    );
    await expect(readdir(join(root, 'artifacts', 'semantic'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });
});
