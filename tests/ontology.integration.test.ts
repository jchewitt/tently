// Modified for standalone extraction; see docs/extraction-manifest.json.
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { ExtractionContext, SemanticSource } from "@weftlet/core";
import { OpenCaesarOntologyCompiler } from "../src/extraction/ontology.js";
import { SemanticHydrator } from "../src/extraction/semantic.js";
import { SemanticArtifactStore } from "../src/storage/storage.js";

const runIntegration = process.env.CONTEXT_GRAPH_INTEGRATION === '1';

describe('openCAESAR integration', () => {
  it.runIf(runIntegration)(
    'compiles generated semantic OML with the generic vocabulary into RDF',
    async () => {
      const repositoryRoot = resolve(import.meta.dirname, "../examples/generic-typescript");
      const storageRoot = await mkdtemp(join(tmpdir(), 'context-graph-ontology-'));
      const source: SemanticSource = {
        stableSemanticId: 'doc:search',
        path: 'docs/search.md',
        content: '# Search\nThe worker implements search.\n',
        digest: 'source-digest',
      };
      const context: ExtractionContext = {
        repositoryRoot,
        repositoryId: 'example/generic',
        ref: 'HEAD',
        commitSha: 'e'.repeat(40),
        snapshotId: 'generated-validation',
        changedPaths: [source.path],
        deletedPaths: [],
        renamedPaths: {},
      };
      const semantic = new SemanticHydrator(
        {
          provider: 'codex-cli',
          model: 'test',
          reasoningEffort: 'low',
          promptVersion: 'test',
          extractorVersion: '1',
          adapterVersion: '1',
          ontologyVersion: '1',
          minimumConfidence: 0.7,
          failOnUnresolved: true,
          concurrency: 1,
        },
        new SemanticArtifactStore(storageRoot),
        {
          identity: 'fake-codex:1',
          async extract() {
            return {
              parsed: {
                assertions: [
                  {
                    subject: {
                      id: 'capability:search',
                      kind: 'Capability' as const,
                      label: 'Search',
                    },
                    predicate: 'implementedBy' as const,
                    object: {
                      id: 'component:worker',
                      kind: 'Component' as const,
                      label: 'Worker',
                    },
                    citation: { startLine: 2, endLine: 2 },
                    confidence: 1,
                  },
                ],
                oml: 'proposal retained in rawModelOutput',
                unresolvedMappings: [],
              },
              rawModelOutput: '{"oml":"proposal retained in rawModelOutput"}',
            };
          },
        },
      );
      const { artifact } = await semantic.hydrate(source, context);
      const compiler = new OpenCaesarOntologyCompiler(
        {
          toolVersion: 'oml2owl-gradle-2.13.1',
          containerImage:
            'gradle:8.10.2-jdk21@sha256:963d59f7f22767da4efbcf46b661361b61af5fb88b0309da1071c4234c647eba',
          projectPath: 'ontology',
        },
        repositoryRoot,
        storageRoot,
      );
      const withoutSemantic = await compiler.compile('generated-empty-validation', []);
      const result = await compiler.compile('generated-validation', [artifact]);
      expect(result.rdfFiles.length).toBeGreaterThan(1);
      expect(result.digest).toMatch(/^[a-f0-9]{64}$/);
      expect(result.digest).not.toBe(withoutSemantic.digest);
      const rdf = (await Promise.all(result.rdfFiles.map((path) => readFile(path, 'utf8')))).join(
        '\n',
      );
      expect(rdf).toContain('capability:search');
    },
    120_000,
  );
});
