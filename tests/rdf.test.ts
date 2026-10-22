import { execFile } from 'node:child_process';
import { cp, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { RdfEvidenceGraph, CG } from "../src/graph/rdf.js";
import { FileSnapshotStore, SemanticArtifactStore } from "../src/storage/storage.js";
import { GitRepository } from "../src/repository/git.js";
import { SemanticHydrator } from "../src/extraction/semantic.js";
import { ContextGraphHydrator } from "../src/application/hydrator.js";
import { ScipTypeScriptIndexer, ScipSymbolExtractor, RepositoryFileExtractor, RepositoryContractExtractor } from "../src/extraction/static.js";
import { SnapshotImpactQueryService, contextPackEvidenceAuthority } from "../src/graph/query.js";
import { verifyPipeline } from "../examples/pipeline/test/pipeline.test.js";
import { sha256, stableJson } from "../src/infrastructure/util.js";
import type { ContextGraphConfig } from "../src/configuration/config.js";
import type { GraphFact } from "@weftlet/core";
import { DirectRdfOntologyCompiler } from "../src/extraction/ontology.js";

describe('unified evidence graph', () => {
  it('extracts public prose and real TypeScript across queue boundaries, with SPARQL/projection equivalence', async () => {
    await verifyPipeline();
    const root = await mkdtemp(join(tmpdir(), 'rdf-pipeline-'));
    await cp(new URL("../examples/pipeline", import.meta.url), root, { recursive: true });
    const discoveryPath = join(root, 'docs/discovery.md');
    await writeFile(discoveryPath, await readFile(discoveryPath, 'utf8') +
      '\nSee [discovery implementation](../src/discovery.ts) and [pipeline checks](../test/pipeline.test.ts).\n');
    const execute = promisify(execFile);
    const git = (...args: string[]) => execute('git', args, { cwd: root });
    await git('init', '--quiet'); await git('add', '.');
    await git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid',
      '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'public pipeline');
    const config: ContextGraphConfig = JSON.parse(await readFile(join(root, 'context-graph.config.json'), 'utf8'));
    const repository = new GitRepository(root);
    const storage = join(root, '.context-graph');
    const store = new FileSnapshotStore(storage);
    let providerCalls = 0;
    const hydrator = new ContextGraphHydrator({
      config, repository, snapshotStore: store,
      // A deterministic test provider reads the fixture's prose. This is not a claim of live model quality.
      semanticHydrator: new SemanticHydrator(config.semantic, new SemanticArtifactStore(storage), {
        identity: 'fixture-prose-parser:1',
        async extract(source) {
          providerCalls++;
          const implementations = [...source.content.matchAll(/The (\w+) stage is implemented by ([^\s]+)\./g)];
          const routes = [...source.content.matchAll(/The (\w+) stage routes through the (\w+) stage/g)];
          const classifications = [...source.content.matchAll(/The (\w+) stage is classified as (Workflow|Contract)\./g)];
          const line = (index: number) => source.content.slice(0, index).split('\n').length;
          const assertions = [
            ...classifications.map((match) => ({
              subject: { id: `workflow:${match[1]}`, kind: match[2] as 'Workflow' | 'Contract', label: match[1]! },
              predicate: 'references' as const,
              object: { id: 'document:classification', kind: 'Document' as const, label: 'Classification' },
              citation: { startLine: line(match.index!), endLine: line(match.index!) }, confidence: 1,
            })),
            ...implementations.map((match) => ({
              subject: { id: `workflow:${match[1]}`, kind: 'Workflow' as const, label: match[1]! },
              predicate: 'implementedBy' as const,
              object: { id: `component:file:${match[2]}`, kind: 'Component' as const, label: match[2]! },
              citation: { startLine: line(match.index!), endLine: line(match.index!) }, confidence: 1,
            })),
            ...routes.map((match) => ({
              subject: { id: `workflow:${match[1]}`, kind: 'Workflow' as const, label: match[1]! },
              predicate: 'routesThrough' as const,
              object: { id: `workflow:${match[2]}`, kind: 'Workflow' as const, label: match[2]! },
              citation: { startLine: line(match.index!), endLine: line(match.index!) }, confidence: 1,
            })),
          ];
          const ambiguity = source.content.indexOf('The owner is ambiguous between Team A and Team B.');
          const diagnostics = ambiguity < 0 ? [] : [{
            kind: 'ambiguousIntent' as const, reason: 'The source explicitly names two competing owners.',
            citation: { startLine: line(ambiguity), endLine: line(ambiguity) }, relatedNodeIds: [],
          }];
          return { parsed: { assertions, oml: '', diagnostics }, rawModelOutput: JSON.stringify({ assertions, diagnostics }) };
        },
      }),
      staticIndexer: new ScipTypeScriptIndexer(config.scip, storage),
      ontologyCompiler: new DirectRdfOntologyCompiler(storage),
      runtimeEvidenceProvider: { collect: async () => [] },
      extractorFactory: (scip) => [
        new RepositoryFileExtractor(repository, ['src', 'test'], scip.digest),
        new RepositoryContractExtractor(repository, config.contractPatterns, ['src', 'test']),
        new ScipSymbolExtractor(repository, scip),
      ],
      invariantEvaluators: [],
    });
    Object.assign(config.semantic, { maxDocuments: 1 });
    await expect(hydrator.hydrate({ ref: 'HEAD', headName: 'default' })).rejects.toThrow('budget exceeded');
    expect(providerCalls).toBe(0);
    Object.assign(config.semantic, { maxDocuments: 8 });
    const { snapshot } = await hydrator.hydrate({ ref: 'HEAD', headName: 'default' });
    const repeated = await hydrator.hydrate({ ref: 'HEAD', headName: 'default' });
    expect(repeated.semanticReused).toBe(6);
    expect(repeated.snapshot.manifest.contentDigest).toBe(snapshot.manifest.contentDigest);
    expect(snapshot.facts.filter((f) => f.sourceAuthority === 'declared' &&
      f.extractor.id !== 'document-linker')).toHaveLength(12);
    expect(snapshot.facts.filter((f) => f.sourceAuthority === 'declared').every((f) =>
      f.authority === 'inferred' && (f.extractor.id === 'document-linker' || f.extractionReview === 'unreviewed'))).toBe(true);
    const testLink = snapshot.facts.find((f) => f.extractor.id === 'document-linker' &&
      f.predicate === 'references' && f.object.id === 'component:file:test/pipeline.test.ts');
    expect(testLink).toMatchObject({ object: { kind: 'Evidence' }, authority: 'inferred',
      sourceAuthority: 'declared', extractionReview: 'deterministic', provenance: { path: 'docs/discovery.md' } });
    const graph = new RdfEvidenceGraph(snapshot);
    expect((await graph.validate()).conforms).toBe(true);
    expect((await graph.facts()).map((f) => f.id).sort()).toEqual(snapshot.facts.map((f) => f.id).sort());
    expect(stableJson([...(await graph.facts())].sort((a, b) => a.id.localeCompare(b.id))))
      .toBe(stableJson([...snapshot.facts].sort((a, b) => a.id.localeCompare(b.id))));
    const routes = await graph.select(`SELECT ?from ?to WHERE {
      GRAPH ?assertion { ?from <${CG}routesThrough> ?to }
      ?assertion <${CG}sourceAuthority> "declared"; <${CG}authority> "inferred"
    }`);
    expect(routes.rows).toHaveLength(6);
    const service = new SnapshotImpactQueryService(store, 'default');
    const request = { changedFiles: ['src/discovery.ts'], maxFacts: 10 };
    let pack = await service.scan(request);
    const all: GraphFact[] = [...pack.facts];
    let pages = 1;
    while (pack.exploration?.continuation) {
      if (++pages > 100) throw new Error('Continuation did not terminate');
      pack = await service.scan({ ...request, continuation: pack.exploration.continuation });
      all.push(...pack.facts);
    }
    expect(new Set(all.map((fact) => fact.id)).size).toBe(all.length);
    expect(all.some((f) => f.provenance.path === 'src/outcomes.ts')).toBe(true);
    expect(all.some((f) => f.provenance.path === 'test/pipeline.test.ts')).toBe(true);
    expect(all.some((f) => f.predicate === 'consumes' && f.extractor.id === 'scip-symbol-extractor')).toBe(true);
    const bounded = await service.scan({ ...request, maxDepth: 1 });
    expect(bounded.exploration?.truncated).toBe(true);
    const empty = await service.scan({ changedFiles: ['src/missing.ts'] });
    expect(empty.facts).toHaveLength(0);
    expect(empty.diagnostics.implementationGaps.items.length).toBeGreaterThan(0);
    await expect(graph.select('SELECT * WHERE { SERVICE <https://example.invalid> { ?s ?p ?o } }')).rejects.toThrow('local read');
    const conflict = { ...snapshot.facts[0]!, id: 'conflict',
      subject: { ...snapshot.facts[0]!.subject, kind: 'Provider' as const } };
    const invalid = new RdfEvidenceGraph({ ...snapshot, facts: [...snapshot.facts, conflict] });
    expect((await invalid.validate()).conforms).toBe(false);
    const malformed = { ...snapshot.facts[0]!, confidence: 2, provenance: { ...snapshot.facts[0]!.provenance, startLine: 0 } };
    expect((await new RdfEvidenceGraph({ ...snapshot, facts: [malformed] }).validate()).conforms).toBe(false);
    expect(contextPackEvidenceAuthority({ ...snapshot.facts[0]!, authority: undefined,
      extractor: { id: 'codex-cli:legacy', version: '1' } })).toBe('inferred');
    const changeProse = async (content: string) => {
      await writeFile(join(root, 'docs/negative.md'), content);
      await git('add', 'docs/negative.md');
      await git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid',
        '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'Public negative source');
    };
    await changeProse('# Missing implementation\nThe archival stage is implemented by src/absent.ts.\n');
    const missing = await hydrator.hydrate({ ref: 'HEAD', headName: 'default' });
    expect(missing.snapshot.diagnostics?.some((item) =>
      item.kind === 'implementationGaps' && item.reason.includes('src/absent.ts'))).toBe(true);
    await changeProse('# Ambiguous intent\nThe owner is ambiguous between Team A and Team B.\n');
    await expect(hydrator.hydrate({ ref: 'HEAD', headName: 'default' })).rejects.toThrow('Unresolved semantic mappings');
    await changeProse('# Contradictory identity\nThe discovery stage is classified as Contract.\n');
    await expect(hydrator.hydrate({ ref: 'HEAD', headName: 'default' })).rejects.toThrow('SHACL');
    expect((await store.readHead('default'))?.manifest.snapshotId).toBe(missing.snapshot.manifest.snapshotId);
  }, 60_000);
});
